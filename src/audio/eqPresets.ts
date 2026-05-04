import type { Eq10Band } from "../types";
import { EQ10_DEFAULT_FREQS } from "./effects";

export type Eq10PresetId =
  | "flat"
  | "vocalClear"
  | "warmMix"
  | "dark"
  | "bright"
  | "punch"
  | "cleanLowEnd";

export interface Eq10Preset {
  id: Eq10PresetId;
  label: string;
  /** Gains in dB by index (10 bands matching EQ10_DEFAULT_FREQS). */
  gains: number[];
}

export function makeDefaultEq10Bands(): Eq10Band[] {
  return EQ10_DEFAULT_FREQS.map((freq, i) => ({
    enabled: true,
    freq,
    gainDb: 0,
    q: 1.0,
    type:
      i === 0
        ? ("lowshelf" as BiquadFilterType)
        : i === EQ10_DEFAULT_FREQS.length - 1
          ? ("highshelf" as BiquadFilterType)
          : ("peaking" as BiquadFilterType),
  }));
}

export const EQ10_PRESETS: Eq10Preset[] = [
  { id: "flat", label: "Flat", gains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  {
    id: "vocalClear",
    label: "Vocal Clear",
    // Dip mud, lift presence and air.
    gains: [-2, -3, -2, -1, 1, 2, 3, 4, 3, 1],
  },
  {
    id: "warmMix",
    label: "Warm Mix",
    // Boost lows + low-mids, gentle high cut.
    gains: [3, 3, 2, 1, 0, 0, 0, -1, -2, -3],
  },
  {
    id: "dark",
    label: "Dark",
    // Heavy high cut, body kept.
    gains: [2, 1, 1, 0, 0, -1, -3, -5, -7, -9],
  },
  {
    id: "bright",
    label: "Bright",
    // Lift top, dip mud.
    gains: [-1, -2, -2, -1, 0, 1, 2, 3, 4, 5],
  },
  {
    id: "punch",
    label: "Punch",
    // Lows + presence boost, scoop low-mids.
    gains: [4, 3, 1, -2, -3, -1, 1, 3, 2, 0],
  },
  {
    id: "cleanLowEnd",
    label: "Clean Low End",
    // High-pass-ish: cut sub, keep punch and clarity.
    gains: [-9, -5, -1, 0, 0, 0, 0, 0, 0, 0],
  },
];

export function applyEq10Preset(
  bands: Eq10Band[],
  preset: Eq10Preset,
): Eq10Band[] {
  return bands.map((b, i) => ({
    ...b,
    gainDb: preset.gains[i] ?? 0,
    enabled: true,
  }));
}
