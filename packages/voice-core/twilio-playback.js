import { chunkBuffer } from './mulaw.js';

export function sendClear(socket, streamSid) {
  if (!streamSid || socket.readyState !== 1) return false;
  socket.send(JSON.stringify({ event: 'clear', streamSid }));
  return true;
}

export function sendMulawAudio(socket, streamSid, audioBuffer, { chunkSize = 160 } = {}) {
  if (!streamSid || socket.readyState !== 1) return 0;

  let sent = 0;
  for (const chunk of chunkBuffer(audioBuffer, chunkSize)) {
    if (socket.readyState !== 1) break;
    socket.send(JSON.stringify({
      event: 'media',
      streamSid,
      media: { payload: chunk.toString('base64') }
    }));
    sent += 1;
  }

  if (socket.readyState === 1) {
    socket.send(JSON.stringify({
      event: 'mark',
      streamSid,
      mark: { name: `assistant_${Date.now()}` }
    }));
  }

  return sent;
}
