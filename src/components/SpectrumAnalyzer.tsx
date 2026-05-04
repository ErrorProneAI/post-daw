import { useEffect, useRef } from "react";

interface Props {
  /** Provide the current AnalyserNode, or null if not playing. */
  getAnalyzer: () => AnalyserNode | null;
  height?: number;
  className?: string;
}

/**
 * Minimal real-time FFT spectrum visualizer using a polled rAF loop.
 * Renders a log-frequency / linear-dB plot from -100 to 0 dB.
 */
export function SpectrumAnalyzer({
  getAnalyzer,
  height = 80,
  className,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const draw = () => {
      const analyzer = getAnalyzer();
      const w = canvas.width;
      const h = canvas.height;
      ctx.fillStyle = "#0a0a0a";
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = "#1f1f1f";
      ctx.beginPath();
      for (let db = -90; db <= 0; db += 30) {
        const y = h - ((db + 100) / 100) * h;
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
      }
      ctx.stroke();
      if (!analyzer) {
        rafRef.current = requestAnimationFrame(draw);
        return;
      }
      const bins = new Float32Array(analyzer.frequencyBinCount);
      analyzer.getFloatFrequencyData(bins);
      const sr = analyzer.context.sampleRate;
      const nyq = sr / 2;
      const minLog = Math.log10(20);
      const maxLog = Math.log10(Math.min(20000, nyq));
      ctx.strokeStyle = "#22d3ee";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      let started = false;
      for (let x = 0; x < w; x++) {
        const t = x / w;
        const f = Math.pow(10, minLog + t * (maxLog - minLog));
        const bin = Math.min(
          bins.length - 1,
          Math.max(0, Math.round((f / nyq) * bins.length)),
        );
        const db = bins[bin];
        const y = h - ((db + 100) / 100) * h;
        if (!started) {
          ctx.moveTo(x, y);
          started = true;
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.stroke();
      rafRef.current = requestAnimationFrame(draw);
    };
    rafRef.current = requestAnimationFrame(draw);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [getAnalyzer]);

  return (
    <canvas
      ref={canvasRef}
      width={300}
      height={height}
      className={"w-full rounded border border-edge " + (className ?? "")}
    />
  );
}
