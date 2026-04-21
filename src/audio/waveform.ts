/**
 * Compute stereo-mixed peak data for waveform rendering.
 * Returns a Float32Array of [min,max,min,max,...] at `peaksPerSecond` resolution.
 */
export function computePeaks(
  buffer: AudioBuffer,
  peaksPerSecond = 200,
): Float32Array {
  const sampleRate = buffer.sampleRate;
  const samplesPerPeak = Math.max(1, Math.floor(sampleRate / peaksPerSecond));
  const numPeaks = Math.ceil(buffer.length / samplesPerPeak);
  const out = new Float32Array(numPeaks * 2);

  const channels: Float32Array[] = [];
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    channels.push(buffer.getChannelData(c));
  }
  const nCh = channels.length;

  for (let p = 0; p < numPeaks; p++) {
    const start = p * samplesPerPeak;
    const end = Math.min(buffer.length, start + samplesPerPeak);
    let mn = Infinity;
    let mx = -Infinity;
    for (let i = start; i < end; i++) {
      let sum = 0;
      for (let c = 0; c < nCh; c++) sum += channels[c][i];
      const v = sum / nCh;
      if (v < mn) mn = v;
      if (v > mx) mx = v;
    }
    if (!isFinite(mn)) mn = 0;
    if (!isFinite(mx)) mx = 0;
    out[p * 2] = mn;
    out[p * 2 + 1] = mx;
  }
  return out;
}
