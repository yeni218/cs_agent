const MULAW_DECODE_TABLE = new Int16Array(256);

for (let i = 0; i < 256; i++) {
  const mulaw = ~i & 0xff;
  const sign = mulaw & 0x80 ? -1 : 1;
  const exponent = (mulaw >> 4) & 0x07;
  const mantissa = mulaw & 0x0f;
  let magnitude = ((mantissa << 1) + 33) << (exponent + 2);
  magnitude -= 33 * 4;
  MULAW_DECODE_TABLE[i] = sign * magnitude;
}

export function mulawToPcm16(mulawBuffer) {
  const pcm = Buffer.alloc(mulawBuffer.length * 2);
  for (let i = 0; i < mulawBuffer.length; i++) {
    pcm.writeInt16LE(MULAW_DECODE_TABLE[mulawBuffer[i]], i * 2);
  }
  return pcm;
}

export function pcm16ToMulaw(pcm16Buffer) {
  const mulaw = Buffer.alloc(Math.floor(pcm16Buffer.length / 2));
  for (let i = 0; i < mulaw.length; i++) {
    mulaw[i] = encodeMulaw(pcm16Buffer.readInt16LE(i * 2));
  }
  return mulaw;
}

export function chunkBuffer(buffer, chunkSize = 160) {
  const chunks = [];
  for (let i = 0; i < buffer.length; i += chunkSize) {
    chunks.push(buffer.subarray(i, Math.min(i + chunkSize, buffer.length)));
  }
  return chunks;
}

export function averagePcm16Amplitude(pcm16Buffer) {
  const sampleCount = Math.floor(pcm16Buffer.length / 2);
  if (sampleCount === 0) return 0;

  let sum = 0;
  for (let i = 0; i < sampleCount; i++) {
    sum += Math.abs(pcm16Buffer.readInt16LE(i * 2));
  }
  return sum / sampleCount;
}

function encodeMulaw(sample) {
  const BIAS = 0x84;
  const CLIP = 32635;

  let sign = (sample >> 8) & 0x80;
  if (sign !== 0) sample = -sample;
  if (sample > CLIP) sample = CLIP;

  sample += BIAS;

  let exponent = 7;
  for (let expMask = 0x4000; (sample & expMask) === 0 && exponent > 0; expMask >>= 1) {
    exponent -= 1;
  }

  const mantissa = (sample >> (exponent + 3)) & 0x0f;
  return ~(sign | (exponent << 4) | mantissa) & 0xff;
}
