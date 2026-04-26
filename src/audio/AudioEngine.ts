import type { AppState, Clip, ID, Track } from "../types";
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
 * Playback strategy: when the user presses play, we walk the project state,
 * build an effect chain per track, and schedule BufferSource nodes for every
 * clip that intersects [playhead, +inf). Pause/stop tears down all sources.
 *
 * The engine also drives the visual playhead via requestAnimationFrame,
 * updating the store's `transport.position`.
 */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sources: ScheduledSource[] = [];
  private rafId: number | null = null;
  private startCtxTime = 0;
  private startProjTime = 0;
  private handlers: EngineHandlers;

  constructor(handlers: EngineHandlers) {
    this.handlers = handlers;
  }

  getContext(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
    }
    return this.ctx;
  }

  async resume(): Promise<void> {
    const ctx = this.getContext();
    if (ctx.state === "suspended") await ctx.resume();
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

  private scheduleFrom(projectTime: number): void {
    const ctx = this.getContext();
    if (!this.master) return;
    const state = this.handlers.getState();
    const { project, assets } = state;

    const trackById = new Map<ID, Track>(project.tracks.map((t) => [t.id, t]));

    // Build a chain per track so multiple clips share the same effect state.
    const trackChains = new Map<
      ID,
      ReturnType<typeof buildEffectChain> & { trackGain: GainNode }
    >();

    for (const track of project.tracks) {
      if (!this.isTrackAudible(project.tracks, track)) continue;
      const chain = buildEffectChain(ctx, track.effects);

      const trackGain = ctx.createGain();
      trackGain.gain.value = dbToGain(track.volumeDb);

      const panner = ctx.createStereoPanner();
      panner.pan.value = track.pan;

      chain.output.connect(trackGain);
      trackGain.connect(panner);
      panner.connect(this.master);

      trackChains.set(track.id, { ...chain, trackGain });
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

      const src = ctx.createBufferSource();
      src.buffer = asset.buffer;
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
      const offsetInAsset = clip.offset + offsetInClip;
      const playDuration = Math.max(
        0,
        clip.duration - offsetInClip,
      ) / chain.rateMultiplier;

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
      trackChains.clear();
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
