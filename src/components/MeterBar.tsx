import { useEffect, useRef, useState } from "react";
import { computeLevel, gainToDb, readTimeDomain } from "../audio/analyzer";

interface Props {
  /** Returns the AnalyserNode to read, or null if not currently routed. */
  getAnalyzer: () => AnalyserNode | null;
  /** Height in pixels. Defaults to 60. */
  height?: number;
  /** Show numeric peak/rms labels below the bar. */
  showText?: boolean;
}

/**
 * Stereo-collapsed peak + RMS meter with clip warning.
 * - Peak: instant max abs; falls slowly.
 * - RMS: short-window RMS; smoother.
 * - Clip: latches red when peak ≥ 0 dBFS; clear by clicking.
 */
export function MeterBar({ getAnalyzer, height = 60, showText = true }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const peakRef = useRef(-100);
  const rmsRef = useRef(-100);
  const clipRef = useRef(false);
  const [, force] = useState(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    const draw = () => {
      const analyzer = getAnalyzer();
      const w = canvas.width;
      const h = canvas.height;
      ctx.fillStyle = "#0a0a0a";
      ctx.fillRect(0, 0, w, h);

      let peakDb = peakRef.current - 0.5; // slow fall ~30dB/s @60fps
      let rmsDb = rmsRef.current - 0.3;
      if (analyzer) {
        const time = readTimeDomain(analyzer);
        const lv = computeLevel(time);
        const p = gainToDb(lv.peak);
        const r = gainToDb(lv.rms);
        if (p > peakDb) peakDb = p;
        if (r > rmsDb) rmsDb = r;
        if (lv.peak >= 1) clipRef.current = true;
      }
      peakRef.current = peakDb;
      rmsRef.current = rmsDb;

      const dbToX = (db: number) => {
        const t = Math.max(0, Math.min(1, (db + 60) / 60));
        return t * w;
      };

      // Background scale.
      ctx.fillStyle = "#171717";
      ctx.fillRect(0, 0, w, h);
      // RMS fill.
      ctx.fillStyle = "#16a34a";
      ctx.fillRect(0, 0, dbToX(rmsDb), h);
      // Peak overlay.
      ctx.fillStyle = peakDb >= -3 ? "#f59e0b" : "#0ea5e9";
      const pw = dbToX(peakDb);
      ctx.fillRect(Math.max(0, pw - 2), 0, 2, h);
      // -6 dB and 0 dB ticks.
      ctx.strokeStyle = "#404040";
      for (const db of [-30, -18, -12, -6, -3]) {
        const x = dbToX(db);
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      }
      // Clip indicator.
      if (clipRef.current) {
        ctx.fillStyle = "#dc2626";
        ctx.fillRect(w - 6, 0, 6, h);
      }
      force((n) => (n + 1) % 1024); // trigger re-render so labels update.
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [getAnalyzer]);

  const onClickClear = () => {
    clipRef.current = false;
  };

  return (
    <div className="space-y-1" onClick={onClickClear}>
      <canvas
        ref={canvasRef}
        width={200}
        height={height}
        className="w-full rounded border border-edge cursor-pointer"
      />
      {showText && (
        <div className="text-[10px] text-neutral-400 tabular-nums flex justify-between">
          <span>peak {peakRef.current.toFixed(1)} dB</span>
          <span>rms {rmsRef.current.toFixed(1)} dB</span>
          {clipRef.current && (
            <span className="text-red-500">CLIP — click to clear</span>
          )}
        </div>
      )}
    </div>
  );
}
