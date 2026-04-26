export function formatTime(sec: number): string {
  if (!isFinite(sec)) return "0:00.000";
  const sign = sec < 0 ? "-" : "";
  const s = Math.abs(sec);
  const m = Math.floor(s / 60);
  const rem = s - m * 60;
  const secs = Math.floor(rem);
  const ms = Math.floor((rem - secs) * 1000);
  return `${sign}${m}:${secs.toString().padStart(2, "0")}.${ms
    .toString()
    .padStart(3, "0")}`;
}

export const clamp = (v: number, lo: number, hi: number): number =>
  Math.min(hi, Math.max(lo, v));

export const dbToGain = (db: number): number => Math.pow(10, db / 20);
export const gainToDb = (g: number): number =>
  g <= 0 ? -Infinity : 20 * Math.log10(g);
