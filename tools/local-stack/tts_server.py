"""Local CPU TTS server — POST /tts {text} -> audio/wav (Turkish, Piper).

Wraps Piper (fast even on CPU) in the shape packages/providers/local-tts.js
expects. Sovereign: text never leaves this machine. The Node adapter
down-converts the returned WAV to telephony 8 kHz mu-law.

Run:  python tools/local-stack/tts_server.py
Env:  PIPER_VOICE=<path to .onnx>   TTS_PORT=8020
Piper is version-churny, so synthesis is done defensively across API variants.
"""
import io
import os
import wave
from fastapi import FastAPI, Request, Response
from piper import PiperVoice
import uvicorn

VOICE_PATH = os.environ.get(
    "PIPER_VOICE",
    os.path.join(os.path.dirname(__file__), "voices", "tr_TR-dfki-medium.onnx"),
)
PORT = int(os.environ.get("TTS_PORT", "8020"))

print(f"[tts] loading Piper voice {VOICE_PATH} ...", flush=True)
voice = PiperVoice.load(VOICE_PATH)
SAMPLE_RATE = getattr(getattr(voice, "config", None), "sample_rate", 22050)
print(f"[tts] ready ({SAMPLE_RATE} Hz)", flush=True)

# length_scale < 1.0 speaks faster / more fluent (dfki-medium is a bit slow by
# default). 0.9 ≈ 10% faster without sounding rushed. Tune via PIPER_LENGTH_SCALE.
LENGTH_SCALE = float(os.environ.get("PIPER_LENGTH_SCALE", "0.9"))
try:
    from piper import SynthesisConfig
    SYN_CFG = SynthesisConfig(length_scale=LENGTH_SCALE)
except Exception:
    SYN_CFG = None
print(f"[tts] length_scale={LENGTH_SCALE} (syn_config={'yes' if SYN_CFG else 'no'})", flush=True)

app = FastAPI()


@app.get("/health")
def health():
    return {"status": "ok", "sample_rate": SAMPLE_RATE}


def synth_pcm16(text: str) -> bytes:
    """Return raw 16-bit mono PCM, tolerant of Piper API versions."""
    # New API (piper >= 1.3): synthesize() yields AudioChunk objects.
    try:
        chunks = voice.synthesize(text, syn_config=SYN_CFG) if SYN_CFG else voice.synthesize(text)
        pcm = bytearray()
        got = False
        for chunk in chunks:
            got = True
            data = getattr(chunk, "audio_int16_bytes", None)
            if data is None and hasattr(chunk, "audio_int16_array"):
                data = chunk.audio_int16_array.tobytes()
            if data:
                pcm.extend(data)
        if got:
            return bytes(pcm)
    except TypeError:
        pass  # old signature: synthesize(text, wav_file)

    # Old API (piper == 1.2.x): synthesize into a wave.Wave_write.
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(SAMPLE_RATE)
        voice.synthesize(text, wf)
    buf.seek(0)
    with wave.open(buf, "rb") as wf:
        return wf.readframes(wf.getnframes())


@app.post("/tts")
async def tts(request: Request):
    body = await request.json()
    text = (body.get("text") or "").strip()
    if not text:
        return Response(status_code=204)

    pcm = synth_pcm16(text)
    out = io.BytesIO()
    with wave.open(out, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(SAMPLE_RATE)
        wf.writeframes(pcm)
    return Response(content=out.getvalue(), media_type="audio/wav")


if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=PORT, log_level="warning")
