import { useEffect, useRef } from "react";
import type { Eq10Effect } from "../types";
import { EQ10_PRESETS, applyEq10Preset } from "../audio/eqPresets";

interface Props {
  effect: Eq10Effect;
  onChange: (patch: Partial<Eq10Effect>) => void;
}

/**
 * 10-band graphic EQ panel with real-time curve visualization.
 *
 * The curve is plotted on a log-frequency axis from 20 Hz to 20 kHz by
 * summing the analytic biquad responses of all bands.
 */
export function Eq10Panel({ effect, onChange }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const setBand = (i: number, gainDb: number) => {
    const next = effect.bands.map((b, idx) =>
      idx === i ? { ...b, gainDb } : b,
    );
    onChange({ bands: next });
  };

  const setBandQ = (i: number, q: number) => {
    const next = effect.bands.map((b, idx) =>
      idx === i ? { ...b, q } : b,
    );
    onChange({ bands: next });
  };

  const setBandEnabled = (i: number, enabled: boolean) => {
    const next = effect.bands.map((b, idx) =>
      idx === i ? { ...b, enabled } : b,
    );
    onChange({ bands: next });
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    // Background grid.
    ctx.fillStyle = "#0a0a0a";
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "#1f1f1f";
    ctx.lineWidth = 1;
    for (let db = -18; db <= 18; db += 6) {
      const y = dbToY(db, h);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
    // 0 dB line.
    ctx.strokeStyle = "#333";
    ctx.beginPath();
    ctx.moveTo(0, dbToY(0, h));
    ctx.lineTo(w, dbToY(0, h));
    ctx.stroke();

    // Vertical frequency lines for each band center.
    ctx.strokeStyle = "#1a1a1a";
    for (const b of effect.bands) {
      const x = freqToX(b.freq, w);
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }

    // Plot summed response.
    ctx.strokeStyle = effect.enabled ? "#22d3ee" : "#525252";
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let x = 0; x < w; x++) {
      const f = xToFreq(x, w);
      let gainDb = 0;
      for (const band of effect.bands) {
        if (!band.enabled) continue;
        gainDb += biquadResponseDb(band.type, band.freq, band.q, band.gainDb, f);
      }
      const y = dbToY(gainDb, h);
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }, [effect]);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <select
          className="bg-neutral-900 border border-edge text-xs rounded px-2 py-1"
          defaultValue=""
          onChange={(e) => {
            const id = e.target.value;
            if (!id) return;
            const preset = EQ10_PRESETS.find((p) => p.id === id);
            if (!preset) return;
            onChange({
              bands: applyEq10Preset(effect.bands, preset),
            });
            e.target.value = "";
          }}
        >
          <option value="">Preset…</option>
          {EQ10_PRESETS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
        <button
          className="text-[11px] text-neutral-400 hover:text-neutral-100"
          onClick={() =>
            onChange({
              bands: effect.bands.map((b) => ({ ...b, gainDb: 0, enabled: true })),
            })
          }
        >
          Reset
        </button>
      </div>

      <canvas
        ref={canvasRef}
        width={300}
        height={120}
        className="w-full rounded border border-edge"
      />

      <div className="grid grid-cols-10 gap-1 text-[9px] text-center text-neutral-400">
        {effect.bands.map((b, i) => (
          <div key={i} className="flex flex-col items-center gap-1">
            <div className="tabular-nums">
              {b.gainDb >= 0 ? "+" : ""}
              {b.gainDb.toFixed(1)}
            </div>
            <input
              type="range"
              min={-18}
              max={18}
              step={0.1}
              value={b.gainDb}
              onChange={(e) => setBand(i, Number(e.target.value))}
              className="vertical-slider"
              style={{
                writingMode: "vertical-lr" as React.CSSProperties["writingMode"],
                WebkitAppearance: "slider-vertical",
                width: 14,
                height: 80,
              }}
            />
            <div>{formatHz(b.freq)}</div>
            <input
              type="number"
              min={0.1}
              max={10}
              step={0.1}
              value={b.q}
              onChange={(e) => setBandQ(i, Number(e.target.value))}
              className="w-10 bg-neutral-900 border border-edge text-[9px] text-center rounded"
              title="Q"
            />
            <button
              onClick={() => setBandEnabled(i, !b.enabled)}
              className={
                "text-[9px] " +
                (b.enabled ? "text-cyan-400" : "text-neutral-600")
              }
              title="Toggle band"
            >
              ●
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function freqToX(f: number, w: number): number {
  const minLog = Math.log10(20);
  const maxLog = Math.log10(20000);
  const t = (Math.log10(Math.max(20, f)) - minLog) / (maxLog - minLog);
  return Math.max(0, Math.min(w, t * w));
}

function xToFreq(x: number, w: number): number {
  const minLog = Math.log10(20);
  const maxLog = Math.log10(20000);
  const t = x / w;
  return Math.pow(10, minLog + t * (maxLog - minLog));
}

function dbToY(db: number, h: number): number {
  // -24..+24 mapped to bottom..top.
  const t = (db + 24) / 48;
  return h - t * h;
}

function formatHz(f: number): string {
  if (f >= 1000) return `${(f / 1000).toFixed(f >= 10000 ? 0 : 1)}k`;
  return `${Math.round(f)}`;
}

/**
 * Approximate magnitude response (dB) for a biquad of the given type.
 * Closed-form magnitudes assuming RBJ cookbook coefficients.
 */
function biquadResponseDb(
  type: BiquadFilterType,
  f0: number,
  Q: number,
  gainDb: number,
  freq: number,
): number {
  // We don't need exact phase; compute magnitude at angular ratio f/f0.
  const w = freq / f0;
  switch (type) {
    case "peaking": {
      // |H(jw)|^2 = ((A^2 - 1)^2 * w^2 / Q^2) / ((w^2 - 1)^2 + w^2 / Q^2 / A^2)
      // Simpler approximation: bell shape in log-freq space.
      const x = Math.log2(w); // octaves from center
      const sigma = 1 / Math.max(0.1, Q);
      return gainDb * Math.exp(-(x * x) / (2 * sigma * sigma));
    }
    case "lowshelf": {
      // Smooth shelf using sigmoid.
      const x = Math.log2(w);
      return gainDb / (1 + Math.exp(8 * x));
    }
    case "highshelf": {
      const x = Math.log2(w);
      return gainDb / (1 + Math.exp(-8 * x));
    }
    case "highpass": {
      // -12 dB/oct below cutoff.
      return Math.min(0, 24 * Math.log2(w));
    }
    case "lowpass": {
      return Math.min(0, -24 * Math.log2(w));
    }
    default:
      return 0;
  }
}
