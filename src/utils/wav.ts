/** Encode an AudioBuffer to a 16-bit PCM WAV Blob. */
export function encodeWav(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const numSamples = buffer.length;
  const bytesPerSample = 2;
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = numSamples * blockAlign;
  const headerSize = 44;
  const ab = new ArrayBuffer(headerSize + dataSize);
  const view = new DataView(ab);
  let off = 0;
  const writeStr = (s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off++, s.charCodeAt(i));
  };
  const writeU32 = (v: number) => {
    view.setUint32(off, v, true);
    off += 4;
  };
  const writeU16 = (v: number) => {
    view.setUint16(off, v, true);
    off += 2;
  };
  writeStr("RIFF");
  writeU32(36 + dataSize);
  writeStr("WAVE");
  writeStr("fmt ");
  writeU32(16);
  writeU16(1); // PCM
  writeU16(numChannels);
  writeU32(sampleRate);
  writeU32(byteRate);
  writeU16(blockAlign);
  writeU16(16);
  writeStr("data");
  writeU32(dataSize);

  // Interleave channels
  const channels: Float32Array[] = [];
  for (let c = 0; c < numChannels; c++) channels.push(buffer.getChannelData(c));
  for (let i = 0; i < numSamples; i++) {
    for (let c = 0; c < numChannels; c++) {
      let s = channels[c][i];
      if (s > 1) s = 1;
      else if (s < -1) s = -1;
      const val = s < 0 ? s * 0x8000 : s * 0x7fff;
      view.setInt16(off, val | 0, true);
      off += 2;
    }
  }
  return new Blob([ab], { type: "audio/wav" });
}
