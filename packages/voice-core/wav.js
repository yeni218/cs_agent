export function createWavBuffer(pcmData, sampleRate = 8000, channels = 1, bitsPerSample = 16) {
  const byteRate = sampleRate * channels * (bitsPerSample / 8);
  const blockAlign = channels * (bitsPerSample / 8);
  const dataSize = pcmData.length;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(channels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);
  pcmData.copy(buffer, 44);

  return buffer;
}

// Parses a WAV container into its format + PCM payload. Falls back to sane
// defaults for headerless/raw PCM so callers can still resample. Used by the
// self-hosted TTS adapter, whose server (XTTS ~24 kHz, Piper ~22 kHz) returns
// audio at a rate we must down-convert to telephony 8 kHz.
export function parseWav(buffer, { defaultSampleRate = 24000 } = {}) {
  if (!Buffer.isBuffer(buffer)) buffer = Buffer.from(buffer);

  const isRiff =
    buffer.length >= 44 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WAVE';

  if (!isRiff) {
    return { sampleRate: defaultSampleRate, channels: 1, bitsPerSample: 16, data: buffer };
  }

  let sampleRate = defaultSampleRate;
  let channels = 1;
  let bitsPerSample = 16;
  let offset = 12;

  while (offset + 8 <= buffer.length) {
    const chunkId = buffer.toString('ascii', offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);
    const dataStart = offset + 8;

    if (chunkId === 'fmt ') {
      channels = buffer.readUInt16LE(dataStart + 2);
      sampleRate = buffer.readUInt32LE(dataStart + 4);
      bitsPerSample = buffer.readUInt16LE(dataStart + 14);
    } else if (chunkId === 'data') {
      const dataEnd = Math.min(dataStart + chunkSize, buffer.length);
      return { sampleRate, channels, bitsPerSample, data: buffer.subarray(dataStart, dataEnd) };
    }

    offset = dataStart + chunkSize + (chunkSize % 2);
  }

  return { sampleRate, channels, bitsPerSample, data: buffer.subarray(44) };
}

export function extractWavData(buffer) {
  if (!Buffer.isBuffer(buffer)) buffer = Buffer.from(buffer);
  if (buffer.length < 44 || buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WAVE') {
    return buffer;
  }

  let offset = 12;
  while (offset + 8 <= buffer.length) {
    const chunkId = buffer.toString('ascii', offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);
    const dataStart = offset + 8;
    const dataEnd = Math.min(dataStart + chunkSize, buffer.length);

    if (chunkId === 'data') return buffer.subarray(dataStart, dataEnd);

    offset = dataStart + chunkSize + (chunkSize % 2);
  }

  return buffer;
}
