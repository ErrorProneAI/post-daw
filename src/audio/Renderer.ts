import type { AppState, AudioAsset, ID, Track } from "../types";
import { buildEffectChain } from "./effects";
import { dbToGain } from "../utils/format";

export interface RenderProgress {
  (p: number, status?: string): void;
}

export interface RenderOptions {
  /** Override sample rate for the offline render. */
  sampleRate?: number;
  /** Limit the rendered tracks to this set (used by stems export). */
  trackIds?: ID[];
  /** Skip applying the master chain (used by stems export). */
  bypassMaster?: boolean;
  /** Peak-normalize to this dBTP target after render. */
  normalizeDb?: number | null;
  onProgress?: RenderProgress;
}

function reverseBuffer(
  ctx: BaseAudioContext,
  src: AudioBuffer,
): AudioBuffer {
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
  return reversed;
}

function pickAssetBuffer(
  ctx: BaseAudioContext,
  asset: AudioAsset,
  reversed: boolean,
  cache: Map<ID, AudioBuffer>,
): AudioBuffer | null {
  if (!asset.buffer) return null;
  if (!reversed) return asset.buffer;
  const cached = cache.get(asset.id);
  if (cached) return cached;
  const rev = reverseBuffer(ctx, asset.buffer);
  cache.set(asset.id, rev);
  return rev;
}

function peakNormalize(buffer: AudioBuffer, targetDb: number): void {
  let peak = 0;
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < data.length; i++) {
      const a = Math.abs(data[i]);
      if (a > peak) peak = a;
    }
  }
  if (peak <= 0) return;
  const targetLin = Math.pow(10, targetDb / 20);
  const gain = targetLin / peak;
  if (Math.abs(gain - 1) < 1e-4) return;
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < data.length; i++) data[i] *= gain;
  }
}

/**
 * Offline render of the project (or a subset of tracks for stems) to an
 * AudioBuffer. Mirrors the live engine graph including the master chain.
 */
export async function renderProject(
  state: AppState,
  options: RenderOptions = {},
): Promise<AudioBuffer> {
  const onProgress = options.onProgress;
  const { project, assets } = state;

  const trackFilter = options.trackIds ? new Set(options.trackIds) : null;

  let duration = 0;
  for (const c of project.clips) {
    if (trackFilter && !trackFilter.has(c.trackId)) continue;
    duration = Math.max(duration, c.start + c.duration);
  }
  // Add a small tail for reverb/delay decay.
  duration += 2;
  if (duration <= 0) duration = 0.1;

  const sampleRate = options.sampleRate || project.sampleRate || 44100;
  const ctx = new OfflineAudioContext(
    2,
    Math.ceil(duration * sampleRate),
    sampleRate,
  );

  // Master chain (or pass-through if bypassed).
  let masterInput: AudioNode;
  let masterDispose = () => {};
  if (options.bypassMaster) {
    const passthrough = ctx.createGain();
    passthrough.connect(ctx.destination);
    masterInput = passthrough;
  } else {
    const chain = buildEffectChain(ctx, project.master.effects);
    const masterGain = ctx.createGain();
    masterGain.gain.value = dbToGain(project.master.volumeDb);
    chain.output.connect(masterGain);
    masterGain.connect(ctx.destination);
    masterInput = chain.input;
    masterDispose = chain.dispose;
  }

  const trackById = new Map<ID, Track>(project.tracks.map((t) => [t.id, t]));
  const trackChains = new Map<ID, ReturnType<typeof buildEffectChain>>();

  const anySolo = project.tracks.some((t) => t.solo);
  const audible = (t: Track) =>
    anySolo ? t.solo && !t.mute : !t.mute;

  for (const track of project.tracks) {
    if (trackFilter && !trackFilter.has(track.id)) continue;
    if (!audible(track)) continue;
    const chain = buildEffectChain(ctx, track.effects);
    const g = ctx.createGain();
    g.gain.value = dbToGain(track.volumeDb);
    const pan = ctx.createStereoPanner();
    pan.pan.value = track.pan;
    chain.output.connect(g);
    g.connect(pan);
    pan.connect(masterInput);
    trackChains.set(track.id, chain);
  }

  const reversedCache = new Map<ID, AudioBuffer>();

  for (const clip of project.clips) {
    if (trackFilter && !trackFilter.has(clip.trackId)) continue;
    const track = trackById.get(clip.trackId);
    if (!track) continue;
    const chain = trackChains.get(track.id);
    if (!chain) continue;
    const asset = assets[clip.assetId];
    if (!asset?.buffer) continue;

    const buffer = pickAssetBuffer(ctx, asset, clip.reversed, reversedCache);
    if (!buffer) continue;

    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = chain.rateMultiplier;

    const clipGain = ctx.createGain();
    const baseGain = dbToGain(clip.gainDb);
    clipGain.gain.value = baseGain;

    const playDuration = clip.duration / chain.rateMultiplier;
    const startCtx = clip.start;

    const fadeIn = Math.max(0, clip.fadeInSec);
    const fadeOut = Math.max(0, clip.fadeOutSec);
    if (fadeIn > 0) {
      try {
        clipGain.gain.setValueAtTime(0.0001, startCtx);
        clipGain.gain.linearRampToValueAtTime(
          baseGain,
          startCtx + fadeIn / chain.rateMultiplier,
        );
      } catch {
        // ignore
      }
    } else {
      try {
        clipGain.gain.setValueAtTime(baseGain, startCtx);
      } catch {
        // ignore
      }
    }
    if (fadeOut > 0) {
      const fadeStart = startCtx + Math.max(0, clip.duration - fadeOut) / chain.rateMultiplier;
      try {
        clipGain.gain.setValueAtTime(baseGain, fadeStart);
        clipGain.gain.linearRampToValueAtTime(
          0.0001,
          startCtx + playDuration,
        );
      } catch {
        // ignore
      }
    }

    src.connect(clipGain);
    clipGain.connect(chain.input);

    const offsetInAsset = clip.reversed
      ? Math.max(0, asset.duration - (clip.offset + clip.duration))
      : clip.offset;

    src.start(startCtx, offsetInAsset, playDuration);
  }

  if (onProgress) {
    onProgress(0.05, "Rendering");
    const totalFrames = Math.ceil(duration * sampleRate);
    const iv = setInterval(() => {
      onProgress(
        Math.min(0.95, ctx.currentTime / (totalFrames / sampleRate)),
        "Rendering",
      );
    }, 100);
    const buf = await ctx.startRendering();
    clearInterval(iv);
    if (options.normalizeDb != null) {
      onProgress(0.97, "Normalizing");
      peakNormalize(buf, options.normalizeDb);
    }
    onProgress(1, "Done");
    masterDispose();
    return buf;
  }
  const buf = await ctx.startRendering();
  if (options.normalizeDb != null) peakNormalize(buf, options.normalizeDb);
  masterDispose();
  return buf;
}
