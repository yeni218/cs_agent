// Linear-interpolation resampler for 16-bit mono PCM. Telephony audio is 8 kHz,
// but self-hosted TTS engines emit higher rates (XTTS ~24 kHz, Piper ~22.05 kHz).
// mu-law/8 kHz is already low-fidelity, so linear interpolation is more than
// enough here and stays dependency-free.
export function resamplePcm16(pcm, fromRate, toRate) {
  if (!pcm?.length || fromRate === toRate) return pcm;

  const inSamples = Math.floor(pcm.length / 2);
  if (inSamples === 0) return Buffer.alloc(0);

  const ratio = toRate / fromRate;
  const outSamples = Math.max(1, Math.floor(inSamples * ratio));
  const out = Buffer.alloc(outSamples * 2);

  for (let i = 0; i < outSamples; i += 1) {
    const srcPos = i / ratio;
    const idx = Math.floor(srcPos);
    const frac = srcPos - idx;
    const s0 = pcm.readInt16LE(idx * 2);
    const s1 = idx + 1 < inSamples ? pcm.readInt16LE((idx + 1) * 2) : s0;
    out.writeInt16LE(Math.round(s0 + (s1 - s0) * frac), i * 2);
  }

  return out;
}

// Downmix interleaved multi-channel 16-bit PCM to mono by averaging channels.
export function toMonoPcm16(pcm, channels) {
  if (channels <= 1) return pcm;
  const frames = Math.floor(pcm.length / 2 / channels);
  const out = Buffer.alloc(frames * 2);
  for (let i = 0; i < frames; i += 1) {
    let sum = 0;
    for (let c = 0; c < channels; c += 1) sum += pcm.readInt16LE((i * channels + c) * 2);
    out.writeInt16LE(Math.round(sum / channels), i * 2);
  }
  return out;
}
