import type { AppState, AudioAsset, Clip, ID, Track } from "../types";
import { buildEffectChain } from "./effects";
import { dbToGain } from "../utils/format";

interface ScheduledSource {
  source: AudioBufferSourceNode;
  cleanup: () => void;
}

interface EngineHandlers {
  getState: () => AppState;
  setPosition: (pos: number) => void;
  setPlaying: (p: boolean) => void;
}

/**
 * Real-time audio engine.
 *
 * Topology (per play cycle):
 *   clip -> clipGain (with fade automation) -> trackChain -> trackGain
 *      -> trackPan -> trackAnalyzer -> masterChain -> masterGain
 *      -> masterAnalyzer -> destination
 */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private masterOut: GainNode | null = null;
  private masterAnalyzer: AnalyserNode | null = null;
  private trackAnalyzers = new Map<ID, AnalyserNode>();
  private sources: ScheduledSource[] = [];
  private rafId: number | null = null;
  private startCtxTime = 0;
  private startProjTime = 0;
  private handlers: EngineHandlers;
  /** Reversed copies of buffers, keyed by asset.id. Built lazily. */
  private reversedBuffers = new Map<ID, AudioBuffer>();

  constructor(handlers: EngineHandlers) {
    this.handlers = handlers;
  }

  getContext(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.masterOut = this.ctx.createGain();
      this.masterAnalyzer = this.ctx.createAnalyser();
      this.masterAnalyzer.fftSize = 2048;
      this.masterAnalyzer.smoothingTimeConstant = 0.8;
      this.masterOut.connect(this.masterAnalyzer);
      this.masterAnalyzer.connect(this.ctx.destination);
    }
    return this.ctx;
  }

  async resume(): Promise<void> {
    const ctx = this.getContext();
    if (ctx.state === "suspended") await ctx.resume();
  }

  /** Master meter analyzer node (post-fader, pre-destination). */
  getMasterAnalyzer(): AnalyserNode | null {
    this.getContext();
    return this.masterAnalyzer;
  }

  /** Per-track analyzer; returns null if track has no live chain right now. */
  getTrackAnalyzer(trackId: ID): AnalyserNode | null {
    return this.trackAnalyzers.get(trackId) ?? null;
  }

  getProjectDuration(): number {
    const { project } = this.handlers.getState();
    let end = 0;
    for (const c of project.clips) {
      end = Math.max(end, c.start + c.duration);
    }
    return end;
  }

  play(): void {
    const state = this.handlers.getState();
    if (state.transport.playing) return;
    this.stopAllSources();
    void this.resume();
    const ctx = this.getContext();
    this.startCtxTime = ctx.currentTime + 0.05;
    this.startProjTime = state.transport.position;
    this.scheduleFrom(this.startProjTime);
    this.handlers.setPlaying(true);
    this.startTick();
  }

  pause(): void {
    const state = this.handlers.getState();
    if (!state.transport.playing) return;
    const pos = this.currentProjectTime();
    this.stopAllSources();
    this.handlers.setPosition(pos);
    this.handlers.setPlaying(false);
    this.stopTick();
  }

  stop(): void {
    this.stopAllSources();
    this.handlers.setPlaying(false);
    this.handlers.setPosition(0);
    this.stopTick();
  }

  seek(sec: number): void {
    const state = this.handlers.getState();
    const wasPlaying = state.transport.playing;
    if (wasPlaying) this.stopAllSources();
    this.handlers.setPosition(Math.max(0, sec));
    if (wasPlaying) {
      const ctx = this.getContext();
      this.startCtxTime = ctx.currentTime + 0.05;
      this.startProjTime = Math.max(0, sec);
      this.scheduleFrom(this.startProjTime);
    }
  }

  /** Should we hear this track right now? Honors solo/mute group semantics. */
  private isTrackAudible(tracks: Track[], track: Track): boolean {
    const anySolo = tracks.some((t) => t.solo);
    if (anySolo) return track.solo && !track.mute;
    return !track.mute;
  }

  private getReversedBuffer(asset: AudioAsset): AudioBuffer | null {
    if (!asset.buffer) return null;
    const cached = this.reversedBuffers.get(asset.id);
    if (cached) return cached;
    const ctx = this.getContext();
    const src = asset.buffer;
    const reversed = ctx.createBuffer(
      src.numberOfChannels,
      src.length,
      src.sampleRate,
    );
    for (let ch = 0; ch < src.numberOfChannels; ch++) {
      const inData = src.getChannelData(ch);
      const outData = reversed.getChannelData(ch);
      const n = inData.length;
      for (let i = 0; i < n; i++) outData[i] = inData[n - 1 - i];
    }
    this.reversedBuffers.set(asset.id, reversed);
    return reversed;
  }

  private scheduleFrom(projectTime: number): void {
    const ctx = this.getContext();
    if (!this.masterOut) return;
    const state = this.handlers.getState();
    const { project, assets } = state;

    const trackById = new Map<ID, Track>(project.tracks.map((t) => [t.id, t]));

    // Build master chain once.
    const masterChain = buildEffectChain(ctx, project.master.effects);
    const masterGain = ctx.createGain();
    masterGain.gain.value = dbToGain(project.master.volumeDb);
    masterChain.output.connect(masterGain);
    masterGain.connect(this.masterOut);

    // Build a chain per track so multiple clips share the same effect state.
    this.trackAnalyzers.clear();
    const trackChains = new Map<
      ID,
      ReturnType<typeof buildEffectChain> & {
        trackGain: GainNode;
        analyzer: AnalyserNode;
      }
    >();

    for (const track of project.tracks) {
      if (!this.isTrackAudible(project.tracks, track)) continue;
      const chain = buildEffectChain(ctx, track.effects);

      const trackGain = ctx.createGain();
      trackGain.gain.value = dbToGain(track.volumeDb);

      const panner = ctx.createStereoPanner();
      panner.pan.value = track.pan;

      const analyzer = ctx.createAnalyser();
      analyzer.fftSize = 1024;
      analyzer.smoothingTimeConstant = 0.7;

      chain.output.connect(trackGain);
      trackGain.connect(panner);
      panner.connect(analyzer);
      analyzer.connect(masterChain.input);

      trackChains.set(track.id, { ...chain, trackGain, analyzer });
      this.trackAnalyzers.set(track.id, analyzer);
    }

    for (const clip of project.clips) {
      const track = trackById.get(clip.trackId);
      if (!track) continue;
      const chain = trackChains.get(track.id);
      if (!chain) continue;
      const asset = assets[clip.assetId];
      if (!asset?.buffer) continue;

      const clipEnd = clip.start + clip.duration;
      if (clipEnd <= projectTime) continue;

      const buffer = clip.reversed
        ? this.getReversedBuffer(asset) ?? asset.buffer
        : asset.buffer;

      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.playbackRate.value = chain.rateMultiplier;

      const clipGain = ctx.createGain();
      clipGain.gain.value = dbToGain(clip.gainDb);
      src.connect(clipGain);
      clipGain.connect(chain.input);

      // Translate project time to context time.
      const clipStartInProject = Math.max(clip.start, projectTime);
      const whenCtx =
        this.startCtxTime + (clipStartInProject - projectTime);
      const offsetInClip = clipStartInProject - clip.start;

      // Reversed clips read the asset from the tail end of the trim window.
      const trimRightInAsset = clip.offset + clip.duration;
      const offsetInAsset = clip.reversed
        ? Math.max(0, asset.duration - trimRightInAsset + offsetInClip)
        : clip.offset + offsetInClip;

      const playDuration = Math.max(
        0,
        clip.duration - offsetInClip,
      ) / chain.rateMultiplier;

      // Fade in / out automation on clipGain.
      const baseGain = dbToGain(clip.gainDb);
      const fadeIn = Math.max(0, clip.fadeInSec);
      const fadeOut = Math.max(0, clip.fadeOutSec);
      try {
        clipGain.gain.cancelScheduledValues(whenCtx);
        if (fadeIn > 0 && offsetInClip < fadeIn) {
          // Start at silence (or current point inside fade-in) and ramp up.
          const startFrac = Math.max(
            0.0001,
            offsetInClip / fadeIn,
          );
          clipGain.gain.setValueAtTime(baseGain * startFrac, whenCtx);
          clipGain.gain.linearRampToValueAtTime(
            baseGain,
            whenCtx + (fadeIn - offsetInClip) / chain.rateMultiplier,
          );
        } else {
          clipGain.gain.setValueAtTime(baseGain, whenCtx);
        }
        if (fadeOut > 0) {
          const fadeStartInClip = Math.max(0, clip.duration - fadeOut);
          if (clip.duration - offsetInClip > 0) {
            const fadeStartCtx =
              whenCtx + Math.max(0, fadeStartInClip - offsetInClip) / chain.rateMultiplier;
            clipGain.gain.setValueAtTime(baseGain, fadeStartCtx);
            clipGain.gain.linearRampToValueAtTime(
              0.0001,
              whenCtx + playDuration,
            );
          }
        }
      } catch {
        // Some browsers (or odd timings) may throw — fall through silently.
      }

      try {
        src.start(whenCtx, offsetInAsset, playDuration);
      } catch {
        // ignore
      }

      const cleanup = () => {
        try {
          src.disconnect();
          clipGain.disconnect();
        } catch {
          // ignore
        }
      };
      src.onended = cleanup;
      this.sources.push({ source: src, cleanup });
    }

    // Clean up chain nodes when engine stops.
    const prevStop = this.stopAllSources.bind(this);
    this.stopAllSources = () => {
      prevStop();
      for (const chain of trackChains.values()) {
        chain.dispose();
      }
      try {
        masterChain.dispose();
        masterGain.disconnect();
      } catch {
        // ignore
      }
      trackChains.clear();
      this.trackAnalyzers.clear();
      // restore to the original method for next play cycle
      this.stopAllSources = prevStop;
    };
  }

  private currentProjectTime(): number {
    const ctx = this.ctx;
    if (!ctx) return this.handlers.getState().transport.position;
    const state = this.handlers.getState();
    if (!state.transport.playing) return state.transport.position;
    return this.startProjTime + (ctx.currentTime - this.startCtxTime);
  }

  private startTick = (): void => {
    const tick = () => {
      const pos = this.currentProjectTime();
      const state = this.handlers.getState();
      const { loop } = state.project;

      if (
        loop.enabled &&
        loop.end > loop.start &&
        pos >= loop.end - 0.005
      ) {
        this.seek(loop.start);
      } else {
        this.handlers.setPosition(Math.max(0, pos));
        const end = this.getProjectDuration();
        if (end > 0 && pos >= end + 0.1) {
          this.stop();
          return;
        }
      }
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  };

  private stopTick(): void {
    if (this.rafId != null) cancelAnimationFrame(this.rafId);
    this.rafId = null;
  }

  private stopAllSources(): void {
    for (const s of this.sources) {
      try {
        s.source.stop();
      } catch {
        // ignore
      }
      s.cleanup();
    }
    this.sources = [];
  }

  /** Re-schedule currently playing clips (after effect / track state change). */
  rescheduleIfPlaying(): void {
    const state = this.handlers.getState();
    if (!state.transport.playing) return;
    const pos = this.currentProjectTime();
    this.stopAllSources();
    const ctx = this.getContext();
    this.startCtxTime = ctx.currentTime + 0.05;
    this.startProjTime = Math.max(0, pos);
    this.scheduleFrom(this.startProjTime);
  }

  /** Drop cached reversed buffers (call when an asset is removed). */
  invalidateReversedFor(assetId: ID): void {
    this.reversedBuffers.delete(assetId);
  }

  /** Preview a single asset (used from Sidebar before dropping it on a track). */
  async decodeFile(file: File): Promise<AudioBuffer> {
    const ctx = this.getContext();
    const ab = await file.arrayBuffer();
    return await ctx.decodeAudioData(ab);
  }

  // `Clip` type is referenced via ID fields above; keep the symbol imported.
  _unused(_c: Clip): void {
    void _c;
  }
}
