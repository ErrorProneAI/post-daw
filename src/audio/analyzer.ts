/**
 * Analyzer helpers used by spectrum and meter components.
 *
 * We use the browser's AnalyserNode for FFT magnitudes. Time-domain reads are
 * used to compute peak/RMS levels; frequency-domain reads are used for the
 * spectrum visualizer and the AI genre heuristic.
 */

export function readSpectrum(node: AnalyserNode): Float32Array {
  const data = new Float32Array(node.frequencyBinCount);
  node.getFloatFrequencyData(data); // dB values, typically -100..0
  return data;
}

export function readTimeDomain(node: AnalyserNode): Float32Array {
  const data = new Float32Array(node.fftSize);
  node.getFloatTimeDomainData(data);
  return data;
}

export interface LevelReading {
  peak: number; // 0..1+
  rms: number; // 0..1
}

export function computeLevel(time: Float32Array): LevelReading {
  let peak = 0;
  let sumSq = 0;
  for (let i = 0; i < time.length; i++) {
    const a = Math.abs(time[i]);
    if (a > peak) peak = a;
    sumSq += time[i] * time[i];
  }
  const rms = Math.sqrt(sumSq / Math.max(1, time.length));
  return { peak, rms };
}

export function gainToDb(g: number): number {
  if (g <= 1e-6) return -120;
  return 20 * Math.log10(g);
}

/**
 * Aggregate FFT bins into a small set of band energies (dBFS-ish).
 * Returns an array of band energies in dB, plus the bin centers.
 */
export function bandEnergies(
  freqDb: Float32Array,
  sampleRate: number,
  fftSize: number,
  bandEdges: number[],
): { centers: number[]; db: number[] } {
  const nyquist = sampleRate / 2;
  const binHz = nyquist / freqDb.length;
  const centers: number[] = [];
  const db: number[] = [];
  for (let i = 0; i < bandEdges.length - 1; i++) {
    const lo = bandEdges[i];
    const hi = bandEdges[i + 1];
    centers.push(Math.sqrt(lo * hi));
    let sum = 0;
    let count = 0;
    const startBin = Math.max(1, Math.floor(lo / binHz));
    const endBin = Math.min(freqDb.length - 1, Math.floor(hi / binHz));
    for (let b = startBin; b <= endBin; b++) {
      // Convert dB back to linear, sum, then back to dB.
      const lin = Math.pow(10, freqDb[b] / 20);
      sum += lin;
      count++;
    }
    if (count === 0) {
      db.push(-100);
    } else {
      const avgLin = sum / count;
      db.push(20 * Math.log10(Math.max(1e-6, avgLin)));
    }
  }
  // Reference fftSize to keep API explicit; not strictly needed.
  void fftSize;
  return { centers, db };
}
