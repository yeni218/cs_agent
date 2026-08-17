"""Offline self-test: Piper -> WAV -> faster-whisper, no HTTP. Confirms the two
local models work and shows Turkish STT quality on this CPU."""
import io
import os
import wave
from piper import PiperVoice
from faster_whisper import WhisperModel

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
VOICE = os.path.join(ROOT, "tools", "local-stack", "voices", "tr_TR-dfki-medium.onnx")
MODEL = os.path.join(ROOT, "tools", "local-stack", "models", "faster-whisper-base")

text_in = "Kasko sigortası fiyatı hakkında bilgi almak istiyorum"
print("IN :", text_in, flush=True)

voice = PiperVoice.load(VOICE)
rate = voice.config.sample_rate
pcm = bytearray()
for chunk in voice.synthesize(text_in):
    pcm.extend(chunk.audio_int16_bytes)

buf = io.BytesIO()
with wave.open(buf, "wb") as wf:
    wf.setnchannels(1)
    wf.setsampwidth(2)
    wf.setframerate(rate)
    wf.writeframes(bytes(pcm))
buf.seek(0)
print(f"synth: {len(pcm)} bytes @ {rate}Hz", flush=True)

whisper = WhisperModel(MODEL, device="cpu", compute_type="int8")
segments, _ = whisper.transcribe(buf, language="tr", beam_size=1, condition_on_previous_text=False)
out = "".join(s.text for s in segments).strip()
print("OUT:", out, flush=True)
