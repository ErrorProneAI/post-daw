import type { Effect, EffectKind } from "../types";
import { newId } from "../utils/id";
import { makeDefaultEq10Bands } from "./eqPresets";

/**
 * Lightweight starter chains (no external assets needed). Used by the AI
 * assistant and "quick chain" buttons. Each generator returns a fresh array
 * with new IDs so it is safe to drop into a track.
 */
export type ChainPresetId =
  | "cleanVocal"
  | "loFi"
  | "ambient"
  | "trap"
  | "cinematic"
  | "podcastCleanup"
  | "demoMaster";

export interface ChainPreset {
  id: ChainPresetId;
  label: string;
  description: string;
  build: () => Effect[];
}

function fx<K extends EffectKind>(
  kind: K,
  patch: Partial<Effect> = {},
): Effect {
  const base = { id: newId("fx"), enabled: true, wet: 1 };
  switch (kind) {
    case "gain":
      return { ...base, kind: "gain", gainDb: 0, ...patch } as Effect;
    case "eq3":
      return {
        ...base,
        kind: "eq3",
        lowGainDb: 0,
        midGainDb: 0,
        highGainDb: 0,
        lowFreq: 320,
        highFreq: 3200,
        ...patch,
      } as Effect;
    case "eq10":
      return {
        ...base,
        kind: "eq10",
        bands: makeDefaultEq10Bands(),
        ...patch,
      } as Effect;
    case "reverb":
      return {
        ...base,
        kind: "reverb",
        wet: 0.3,
        decaySec: 2,
        preDelayMs: 20,
        ...patch,
      } as Effect;
    case "delay":
      return {
        ...base,
        kind: "delay",
        wet: 0.3,
        timeSec: 0.35,
        feedback: 0.35,
        ...patch,
      } as Effect;
    case "compressor":
      return {
        ...base,
        kind: "compressor",
        thresholdDb: -18,
        ratio: 3,
        attackMs: 10,
        releaseMs: 120,
        kneeDb: 12,
        makeupDb: 2,
        ...patch,
      } as Effect;
    case "limiter":
      return {
        ...base,
        kind: "limiter",
        ceilingDb: -1,
        releaseMs: 50,
        ...patch,
      } as Effect;
    case "saturation":
      return {
        ...base,
        kind: "saturation",
        wet: 0.6,
        drive: 0.3,
        mode: "soft",
        toneHz: 8000,
        ...patch,
      } as Effect;
    case "widener":
      return { ...base, kind: "widener", width: 1.2, ...patch } as Effect;
    case "speed":
      return { ...base, kind: "speed", rate: 1, ...patch } as Effect;
    case "pitch":
      return { ...base, kind: "pitch", semitones: 0, ...patch } as Effect;
  }
  // Should never reach.
  throw new Error("unknown effect kind");
}

function setEq10(bandsGains: number[]): Partial<Effect> {
  return {
    kind: "eq10",
    bands: makeDefaultEq10Bands().map((b, i) => ({
      ...b,
      gainDb: bandsGains[i] ?? 0,
    })),
  } as unknown as Partial<Effect>;
}

export const CHAIN_PRESETS: ChainPreset[] = [
  {
    id: "cleanVocal",
    label: "Clean Vocal",
    description: "HPF feel, gentle compression, bright EQ, short plate.",
    build: () => [
      fx("eq10", setEq10([-9, -5, -1, 0, 1, 2, 3, 3, 2, 1])),
      fx("compressor", { thresholdDb: -20, ratio: 3, attackMs: 5, releaseMs: 90, kneeDb: 12, makeupDb: 3 }),
      fx("reverb", { decaySec: 1.4, preDelayMs: 15, wet: 0.18 }),
    ],
  },
  {
    id: "loFi",
    label: "Lo-Fi",
    description: "Warm dark EQ, mild saturation, slight wobble via slow speed.",
    build: () => [
      fx("eq10", setEq10([2, 2, 1, 0, -1, -2, -3, -5, -7, -9])),
      fx("saturation", { drive: 0.45, mode: "soft", toneHz: 4500, wet: 0.6 }),
      fx("delay", { timeSec: 0.25, feedback: 0.25, wet: 0.18 }),
    ],
  },
  {
    id: "ambient",
    label: "Ambient",
    description: "Wide stereo, long lush reverb, soft top.",
    build: () => [
      fx("eq10", setEq10([-2, -1, 0, 0, 0, 0, 0, -1, -2, -3])),
      fx("widener", { width: 1.5 }),
      fx("reverb", { decaySec: 4.5, preDelayMs: 40, wet: 0.55 }),
    ],
  },
  {
    id: "trap",
    label: "Trap",
    description: "Punchy lows, sub heat, glue compression.",
    build: () => [
      fx("eq10", setEq10([4, 3, 1, -2, -3, -1, 1, 3, 2, 0])),
      fx("compressor", { thresholdDb: -16, ratio: 4, attackMs: 8, releaseMs: 90, kneeDb: 6, makeupDb: 2 }),
      fx("saturation", { drive: 0.35, mode: "soft", toneHz: 7000, wet: 0.4 }),
    ],
  },
  {
    id: "cinematic",
    label: "Cinematic",
    description: "Wide and big with tail and gentle low-end fullness.",
    build: () => [
      fx("eq10", setEq10([3, 2, 1, 0, 0, 0, 1, 2, 1, 0])),
      fx("widener", { width: 1.4 }),
      fx("reverb", { decaySec: 3.6, preDelayMs: 30, wet: 0.4 }),
    ],
  },
  {
    id: "podcastCleanup",
    label: "Podcast Cleanup",
    description: "Cut rumble, vocal compression, light limiter.",
    build: () => [
      fx("eq10", setEq10([-12, -8, -2, 0, 1, 2, 2, 1, 0, -1])),
      fx("compressor", { thresholdDb: -22, ratio: 4, attackMs: 5, releaseMs: 120, kneeDb: 15, makeupDb: 3 }),
      fx("limiter", { ceilingDb: -2, releaseMs: 50 }),
    ],
  },
  {
    id: "demoMaster",
    label: "Demo Master",
    description: "Glue, bright tilt, brick-wall safety net.",
    build: () => [
      fx("eq10", setEq10([1, 1, 0, 0, 0, 0, 1, 1, 1, 1])),
      fx("compressor", { thresholdDb: -14, ratio: 2.5, attackMs: 20, releaseMs: 200, kneeDb: 18, makeupDb: 1.5 }),
      fx("limiter", { ceilingDb: -1, releaseMs: 60 }),
    ],
  },
];

export function findChainPreset(id: ChainPresetId): ChainPreset | undefined {
  return CHAIN_PRESETS.find((p) => p.id === id);
}
