import type { Effect, Eq3Effect, ReverbEffect, DelayEffect } from "../types";
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
    case "reverb":
      return compileReverb(ctx, e);
    case "delay":
      return compileDelay(ctx, e);
    case "speed":
      return compilePassThrough(ctx, e.rate);
    case "pitch":
      return compilePassThrough(ctx, Math.pow(2, e.semitones / 12));
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
