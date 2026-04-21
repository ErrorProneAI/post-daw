import type { AppState, ID, Track } from "../types";
import { buildEffectChain } from "./effects";
import { dbToGain } from "../utils/format";

export interface RenderProgress {
  (p: number): void;
}

/**
 * Offline render of the whole project to an AudioBuffer.
 * Mirrors the live engine graph topology but using OfflineAudioContext.
 */
export async function renderProject(
  state: AppState,
  onProgress?: RenderProgress,
): Promise<AudioBuffer> {
  const { project, assets } = state;
  let duration = 0;
  for (const c of project.clips) {
    duration = Math.max(duration, c.start + c.duration);
  }
  // Add a small tail for reverb/delay decay.
  duration += 2;
  if (duration <= 0) duration = 0.1;

  const sampleRate = project.sampleRate || 44100;
  const ctx = new OfflineAudioContext(2, Math.ceil(duration * sampleRate), sampleRate);
  const master = ctx.createGain();
  master.connect(ctx.destination);

  const trackById = new Map<ID, Track>(project.tracks.map((t) => [t.id, t]));
  const trackChains = new Map<ID, ReturnType<typeof buildEffectChain>>();

  const anySolo = project.tracks.some((t) => t.solo);
  const audible = (t: Track) =>
    anySolo ? t.solo && !t.mute : !t.mute;

  for (const track of project.tracks) {
    if (!audible(track)) continue;
    const chain = buildEffectChain(ctx, track.effects);
    const g = ctx.createGain();
    g.gain.value = dbToGain(track.volumeDb);
    const pan = ctx.createStereoPanner();
    pan.pan.value = track.pan;
    chain.output.connect(g);
    g.connect(pan);
    pan.connect(master);
    trackChains.set(track.id, chain);
  }

  for (const clip of project.clips) {
    const track = trackById.get(clip.trackId);
    if (!track) continue;
    const chain = trackChains.get(track.id);
    if (!chain) continue;
    const asset = assets[clip.assetId];
    if (!asset?.buffer) continue;

    const src = ctx.createBufferSource();
    src.buffer = asset.buffer;
    src.playbackRate.value = chain.rateMultiplier;

    const clipGain = ctx.createGain();
    clipGain.gain.value = dbToGain(clip.gainDb);
    src.connect(clipGain);
    clipGain.connect(chain.input);

    const playDuration = clip.duration / chain.rateMultiplier;
    src.start(clip.start, clip.offset, playDuration);
  }

  if (onProgress) {
    onProgress(0.05);
    const totalFrames = Math.ceil(duration * sampleRate);
    const iv = setInterval(() => {
      onProgress(Math.min(0.95, ctx.currentTime / (totalFrames / sampleRate)));
    }, 100);
    const buf = await ctx.startRendering();
    clearInterval(iv);
    onProgress(1);
    return buf;
  }
  return await ctx.startRendering();
}
