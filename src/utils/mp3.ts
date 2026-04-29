import { Mp3Encoder } from "@breezystack/lamejs";

/**
 * Encode an AudioBuffer to an MP3 Blob using lamejs.
 * Output is constant-bitrate stereo (or mono if buffer is mono).
 */
export function encodeMp3(buffer: AudioBuffer, kbps = 192): Blob {
  const sampleRate = buffer.sampleRate;
  const numChannels = Math.min(2, buffer.numberOfChannels);
  const encoder = new Mp3Encoder(numChannels, sampleRate, kbps);

  const left = floatToInt16(buffer.getChannelData(0));
  const right =
    numChannels === 2
      ? floatToInt16(buffer.getChannelData(1))
      : null;

  const blockSize = 1152;
  const chunks: Uint8Array[] = [];
  for (let i = 0; i < left.length; i += blockSize) {
    const l = left.subarray(i, i + blockSize);
    const r = right ? right.subarray(i, i + blockSize) : undefined;
    const out = r
      ? encoder.encodeBuffer(l, r)
      : encoder.encodeBuffer(l);
    if (out.length > 0) chunks.push(new Uint8Array(out));
  }
  const tail = encoder.flush();
  if (tail.length > 0) chunks.push(new Uint8Array(tail));

  return new Blob(chunks as BlobPart[], { type: "audio/mpeg" });
}

function floatToInt16(input: Float32Array): Int16Array {
  const out = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    let s = input[i];
    if (s > 1) s = 1;
    else if (s < -1) s = -1;
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}
