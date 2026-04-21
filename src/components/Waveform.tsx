import { useEffect, useRef } from "react";
import type { AudioAsset } from "../types";

interface Props {
  asset: AudioAsset;
  /** Offset in seconds into the asset where the drawing starts. */
  offsetSec: number;
  /** Duration in seconds to draw. */
  durationSec: number;
  pxPerSec: number;
  color: string;
  height: number;
}

/**
 * Canvas-based waveform renderer using precomputed peaks.
 * Redraws on any prop change.
 */
export function Waveform({
  asset,
  offsetSec,
  durationSec,
  pxPerSec,
  color,
  height,
}: Props) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const widthPx = Math.max(1, Math.floor(durationSec * pxPerSec));
    canvas.width = widthPx * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${widthPx}px`;
    canvas.style.height = `${height}px`;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, widthPx, height);

    if (!asset.peaks || asset.peaksPerSecond <= 0) {
      ctx.fillStyle = "rgba(255,255,255,0.08)";
      ctx.fillRect(0, 0, widthPx, height);
      return;
    }

    const peaks = asset.peaks;
    const pps = asset.peaksPerSecond;
    const mid = height / 2;

    ctx.fillStyle = color;
    ctx.globalAlpha = 0.9;

    for (let x = 0; x < widthPx; x++) {
      const tStart = offsetSec + x / pxPerSec;
      const tEnd = offsetSec + (x + 1) / pxPerSec;
      const iStart = Math.max(0, Math.floor(tStart * pps));
      const iEnd = Math.min(
        peaks.length / 2 - 1,
        Math.max(iStart, Math.ceil(tEnd * pps) - 1),
      );
      let mn = 0;
      let mx = 0;
      for (let i = iStart; i <= iEnd; i++) {
        const lo = peaks[i * 2];
        const hi = peaks[i * 2 + 1];
        if (lo < mn) mn = lo;
        if (hi > mx) mx = hi;
      }
      const y1 = mid - mx * (height / 2 - 1);
      const y2 = mid - mn * (height / 2 - 1);
      ctx.fillRect(x, y1, 1, Math.max(1, y2 - y1));
    }
    ctx.globalAlpha = 1;
  }, [asset, offsetSec, durationSec, pxPerSec, color, height]);

  return <canvas ref={ref} className="block" />;
}
