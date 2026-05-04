import type {
  CompressorEffect,
  DelayEffect,
  Effect,
  Eq10Effect,
  Eq3Effect,
  LimiterEffect,
  ReverbEffect,
  SaturationEffect,
  WidenerEffect,
} from "../types";
import { dbToGain } from "../utils/format";

/** A compiled effect: nodes wired dry -> dry; wet -> wet; merged to output. */
export interface CompiledEffect {
  input: AudioNode;
  output: AudioNode;
  /** Current playback rate multiplier contributed by this effect (speed/pitch). */
  rateMultiplier: number;
  /** Dispose any internal state / long-lived resources. */
  dispose(): void;
}

/**
 * Build an AudioBuffer IR for a small algorithmic reverb.
 * Exponentially decaying noise — simple but musical enough for a prototype.
 */
function buildReverbIR(
  ctx: BaseAudioContext,
  decaySec: number,
  preDelayMs: number,
): AudioBuffer {
  const sr = ctx.sampleRate;
  const length = Math.max(1, Math.floor(sr * (decaySec + preDelayMs / 1000)));
  const ir = ctx.createBuffer(2, length, sr);
  const preDelaySamples = Math.floor((preDelayMs / 1000) * sr);
  for (let ch = 0; ch < 2; ch++) {
    const data = ir.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      if (i < preDelaySamples) {
        data[i] = 0;
        continue;
      }
      const t = (i - preDelaySamples) / sr;
      const env = Math.pow(1 - t / decaySec, 2);
      data[i] = (Math.random() * 2 - 1) * Math.max(0, env);
    }
  }
  return ir;
}

function createDryWet(
  ctx: BaseAudioContext,
  wet: number,
): {
  input: GainNode;
  dryPath: GainNode;
  wetIn: GainNode;
  wetOut: GainNode;
  output: GainNode;
} {
  const input = ctx.createGain();
  const dryPath = ctx.createGain();
  const wetIn = ctx.createGain();
  const wetOut = ctx.createGain();
  const output = ctx.createGain();

  input.connect(dryPath);
  input.connect(wetIn);
  dryPath.connect(output);
  wetOut.connect(output);

  dryPath.gain.value = 1 - wet;
  wetOut.gain.value = wet;

  return { input, dryPath, wetIn, wetOut, output };
}

function compileGain(ctx: BaseAudioContext, gainDb: number): CompiledEffect {
  const node = ctx.createGain();
  node.gain.value = dbToGain(gainDb);
  return {
    input: node,
    output: node,
    rateMultiplier: 1,
    dispose: () => node.disconnect(),
  };
}

function compileEq3(ctx: BaseAudioContext, e: Eq3Effect): CompiledEffect {
  const low = ctx.createBiquadFilter();
  low.type = "lowshelf";
  low.frequency.value = e.lowFreq;
  low.gain.value = e.lowGainDb;

  const mid = ctx.createBiquadFilter();
  mid.type = "peaking";
  mid.frequency.value = Math.sqrt(e.lowFreq * e.highFreq);
  mid.Q.value = 0.9;
  mid.gain.value = e.midGainDb;

  const high = ctx.createBiquadFilter();
  high.type = "highshelf";
  high.frequency.value = e.highFreq;
  high.gain.value = e.highGainDb;

  low.connect(mid).connect(high);

  return {
    input: low,
    output: high,
    rateMultiplier: 1,
    dispose: () => {
      low.disconnect();
      mid.disconnect();
      high.disconnect();
    },
  };
}

/** Standard ISO 1/3-octave centers used as graphic 10-band EQ defaults. */
export const EQ10_DEFAULT_FREQS = [
  31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000,
];

function compileEq10(ctx: BaseAudioContext, e: Eq10Effect): CompiledEffect {
  const filters = e.bands.map((b) => {
    const f = ctx.createBiquadFilter();
    f.type = b.type;
    f.frequency.value = b.freq;
    f.gain.value = b.enabled ? b.gainDb : 0;
    f.Q.value = b.q;
    return f;
  });
  for (let i = 0; i < filters.length - 1; i++) {
    filters[i].connect(filters[i + 1]);
  }
  return {
    input: filters[0],
    output: filters[filters.length - 1],
    rateMultiplier: 1,
    dispose: () => filters.forEach((f) => f.disconnect()),
  };
}

function compileReverb(ctx: BaseAudioContext, e: ReverbEffect): CompiledEffect {
  const { input, wetIn, wetOut, output } = createDryWet(ctx, e.wet);
  const conv = ctx.createConvolver();
  conv.buffer = buildReverbIR(ctx, e.decaySec, e.preDelayMs);
  wetIn.connect(conv);
  conv.connect(wetOut);
  return {
    input,
    output,
    rateMultiplier: 1,
    dispose: () => {
      input.disconnect();
      conv.disconnect();
      wetIn.disconnect();
      wetOut.disconnect();
      output.disconnect();
    },
  };
}

function compileDelay(ctx: BaseAudioContext, e: DelayEffect): CompiledEffect {
  const { input, wetIn, wetOut, output } = createDryWet(ctx, e.wet);
  const delay = ctx.createDelay(5.0);
  delay.delayTime.value = e.timeSec;
  const fb = ctx.createGain();
  fb.gain.value = e.feedback;
  wetIn.connect(delay);
  delay.connect(fb);
  fb.connect(delay);
  delay.connect(wetOut);
  return {
    input,
    output,
    rateMultiplier: 1,
    dispose: () => {
      input.disconnect();
      delay.disconnect();
      fb.disconnect();
      wetIn.disconnect();
      wetOut.disconnect();
      output.disconnect();
    },
  };
}

function compileCompressor(
  ctx: BaseAudioContext,
  e: CompressorEffect,
): CompiledEffect {
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = e.thresholdDb;
  comp.ratio.value = e.ratio;
  comp.attack.value = e.attackMs / 1000;
  comp.release.value = e.releaseMs / 1000;
  comp.knee.value = e.kneeDb;
  const makeup = ctx.createGain();
  makeup.gain.value = dbToGain(e.makeupDb);
  comp.connect(makeup);
  return {
    input: comp,
    output: makeup,
    rateMultiplier: 1,
    dispose: () => {
      comp.disconnect();
      makeup.disconnect();
    },
  };
}

function compileLimiter(
  ctx: BaseAudioContext,
  e: LimiterEffect,
): CompiledEffect {
  // A limiter is a high-ratio compressor with fast attack hitting just below ceiling.
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = Math.min(0, e.ceilingDb);
  comp.ratio.value = 20;
  comp.attack.value = 0.001;
  comp.release.value = e.releaseMs / 1000;
  comp.knee.value = 0;
  return {
    input: comp,
    output: comp,
    rateMultiplier: 1,
    dispose: () => comp.disconnect(),
  };
}

function buildSaturationCurve(drive: number, mode: "soft" | "hard"): Float32Array {
  // Map drive 0..1 to a useful gain range.
  const k = 1 + drive * 30;
  const n = 4096;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    let y: number;
    if (mode === "hard") {
      y = Math.max(-1, Math.min(1, x * k));
    } else {
      y = Math.tanh(x * k);
    }
    // Normalize so max output ~ 1 to keep perceived loudness balanced.
    curve[i] = y / Math.tanh(k);
  }
  return curve;
}

function compileSaturation(
  ctx: BaseAudioContext,
  e: SaturationEffect,
): CompiledEffect {
  const { input, wetIn, wetOut, output } = createDryWet(ctx, e.wet);
  const shaper = ctx.createWaveShaper();
  shaper.curve = buildSaturationCurve(e.drive, e.mode);
  shaper.oversample = "4x";
  const tone = ctx.createBiquadFilter();
  tone.type = "lowpass";
  tone.frequency.value = e.toneHz;
  tone.Q.value = 0.7;
  wetIn.connect(shaper).connect(tone).connect(wetOut);
  return {
    input,
    output,
    rateMultiplier: 1,
    dispose: () => {
      input.disconnect();
      shaper.disconnect();
      tone.disconnect();
      wetIn.disconnect();
      wetOut.disconnect();
      output.disconnect();
    },
  };
}

/**
 * Stereo widener via M/S processing.
 *   L = M + S, R = M - S, where M = (L+R)/2 and S = (L-R)/2.
 * width=0 collapses to mono; width=1 unity; width=2 doubles the side.
 */
function compileWidener(
  ctx: BaseAudioContext,
  e: WidenerEffect,
): CompiledEffect {
  const splitter = ctx.createChannelSplitter(2);
  const merger = ctx.createChannelMerger(2);

  // M = 0.5 L + 0.5 R
  const mGain = ctx.createGain();
  mGain.gain.value = 0.5;
  const mL = ctx.createGain();
  mL.gain.value = 1;
  const mR = ctx.createGain();
  mR.gain.value = 1;
  splitter.connect(mL, 0);
  splitter.connect(mR, 1);
  mL.connect(mGain);
  mR.connect(mGain);

  // S = 0.5 L - 0.5 R
  const sGain = ctx.createGain();
  sGain.gain.value = 0.5;
  const sR = ctx.createGain();
  sR.gain.value = -1;
  splitter.connect(sGain, 0);
  splitter.connect(sR, 1);
  sR.connect(sGain);

  // Apply width to S only.
  const sScaled = ctx.createGain();
  sScaled.gain.value = e.width;
  sGain.connect(sScaled);

  // L_out = M + S_scaled, R_out = M - S_scaled
  const sNeg = ctx.createGain();
  sNeg.gain.value = -1;
  sScaled.connect(sNeg);

  mGain.connect(merger, 0, 0);
  sScaled.connect(merger, 0, 0);
  mGain.connect(merger, 0, 1);
  sNeg.connect(merger, 0, 1);

  return {
    input: splitter,
    output: merger,
    rateMultiplier: 1,
    dispose: () => {
      splitter.disconnect();
      merger.disconnect();
      mGain.disconnect();
      mL.disconnect();
      mR.disconnect();
      sGain.disconnect();
      sR.disconnect();
      sScaled.disconnect();
      sNeg.disconnect();
    },
  };
}

/** "Speed" and "pitch" in this prototype both just change source playbackRate. */
function compilePassThrough(
  ctx: BaseAudioContext,
  rateMultiplier: number,
): CompiledEffect {
  const node = ctx.createGain();
  node.gain.value = 1;
  return {
    input: node,
    output: node,
    rateMultiplier,
    dispose: () => node.disconnect(),
  };
}

export function compileEffect(
  ctx: BaseAudioContext,
  e: Effect,
): CompiledEffect {
  if (!e.enabled) return compilePassThrough(ctx, 1);
  switch (e.kind) {
    case "gain":
      return compileGain(ctx, e.gainDb);
    case "eq3":
      return compileEq3(ctx, e);
    case "eq10":
      return compileEq10(ctx, e);
    case "reverb":
      return compileReverb(ctx, e);
    case "delay":
      return compileDelay(ctx, e);
    case "speed":
      return compilePassThrough(ctx, e.rate);
    case "pitch":
      return compilePassThrough(ctx, Math.pow(2, e.semitones / 12));
    case "compressor":
      return compileCompressor(ctx, e);
    case "limiter":
      return compileLimiter(ctx, e);
    case "saturation":
      return compileSaturation(ctx, e);
    case "widener":
      return compileWidener(ctx, e);
  }
}

/** Build an effects chain and return its overall input, output, and combined rate. */
export function buildEffectChain(
  ctx: BaseAudioContext,
  effects: Effect[],
): {
  input: AudioNode;
  output: AudioNode;
  rateMultiplier: number;
  dispose: () => void;
} {
  const compiled = effects.map((e) => compileEffect(ctx, e));
  if (compiled.length === 0) {
    const node = ctx.createGain();
    return {
      input: node,
      output: node,
      rateMultiplier: 1,
      dispose: () => node.disconnect(),
    };
  }
  for (let i = 0; i < compiled.length - 1; i++) {
    compiled[i].output.connect(compiled[i + 1].input);
  }
  const rateMultiplier = compiled.reduce(
    (acc, c) => acc * c.rateMultiplier,
    1,
  );
  return {
    input: compiled[0].input,
    output: compiled[compiled.length - 1].output,
    rateMultiplier,
    dispose: () => compiled.forEach((c) => c.dispose()),
  };
}
