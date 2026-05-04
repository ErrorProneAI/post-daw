import type { ChainPresetId } from "./chainPresets";

/**
 * Lightweight, offline genre/mood heuristic. Given a normalized average
 * spectrum (dB per band) over standard 1/3-octave centers, classify the
 * material and recommend a starter chain preset id.
 *
 * This is intentionally approximate — it's a starting point so the user
 * can hit "Apply" and tweak from there, not a research-grade classifier.
 */

export type AssistantMood =
  | "vocal"
  | "lofi"
  | "dense-mix"
  | "ambient"
  | "punchy"
  | "podcast"
  | "neutral";

export interface AssistantSuggestion {
  mood: AssistantMood;
  reason: string;
  presetId: ChainPresetId;
}

/**
 * `bandsDb` should be 10 values aligned with EQ10_DEFAULT_FREQS:
 * [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000].
 */
export function suggestFromSpectrum(bandsDb: number[]): AssistantSuggestion {
  if (bandsDb.length < 10) {
    return {
      mood: "neutral",
      reason: "Not enough spectral data; defaulting to demo master.",
      presetId: "demoMaster",
    };
  }

  const lowSub = avg(bandsDb.slice(0, 2)); // 31..62
  const lowMid = avg(bandsDb.slice(2, 4)); // 125..250
  const mid = avg(bandsDb.slice(4, 6)); // 500..1k
  const highMid = avg(bandsDb.slice(6, 8)); // 2k..4k
  const top = avg(bandsDb.slice(8, 10)); // 8k..16k

  const overall = avg(bandsDb);

  // Vocal-forward: presence (2-4k) significantly above sub/low.
  if (highMid - lowSub > 8 && mid - lowSub > 4 && top > -75) {
    return {
      mood: "vocal",
      reason:
        "Strong presence (2–4 kHz) relative to lows suggests vocal/dialog material.",
      presetId: "cleanVocal",
    };
  }

  // Podcast-style: narrow mid-band dominance, weak top + weak sub.
  if (
    mid - top > 6 &&
    mid - lowSub > 6 &&
    highMid - top > 4
  ) {
    return {
      mood: "podcast",
      reason:
        "Mid-band dominance with weak top and sub — typical of speech recordings.",
      presetId: "podcastCleanup",
    };
  }

  // Lo-fi: high cut, low-mid lift, dull top.
  if (lowMid > top + 8 && top - overall < -3) {
    return {
      mood: "lofi",
      reason: "Warm low-mid energy with a dark top — fits a lo-fi character.",
      presetId: "loFi",
    };
  }

  // Ambient: soft top, gentle slope, low transient density.
  if (Math.abs(highMid - mid) < 2 && top - lowSub < 4 && overall < -55) {
    return {
      mood: "ambient",
      reason: "Quiet, smooth spectrum with no strong band — sounds ambient.",
      presetId: "ambient",
    };
  }

  // Punchy: heavy sub + present top simultaneously (kick + cymbals).
  if (lowSub - lowMid > 2 && top - mid > 2) {
    return {
      mood: "punchy",
      reason: "Strong sub + bright top — punchy/trap-style production.",
      presetId: "trap",
    };
  }

  // Dense mix → cinematic.
  if (Math.max(...bandsDb) - Math.min(...bandsDb) < 12) {
    return {
      mood: "dense-mix",
      reason: "Balanced full-range spectrum — fits a cinematic master treatment.",
      presetId: "cinematic",
    };
  }

  return {
    mood: "neutral",
    reason: "Generic balanced material — applying a safe demo master chain.",
    presetId: "demoMaster",
  };
}

function avg(arr: number[]): number {
  if (arr.length === 0) return -100;
  let s = 0;
  for (const v of arr) s += v;
  return s / arr.length;
}
