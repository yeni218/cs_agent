"""Local CPU STT server — OpenAI-compatible /v1/audio/transcriptions.

Wraps faster-whisper (CTranslate2, INT8 on CPU) in the exact HTTP shape that
packages/providers/whisper-local-stt.js expects. Sovereign: audio never leaves
this machine.

Run:  python tools/local-stack/stt_server.py
Env:  WHISPER_MODEL=small (default) | base | tiny   STT_PORT=9000
"""
import io
import os
from fastapi import FastAPI, UploadFile, File, Form
from faster_whisper import WhisperModel
import uvicorn

MODEL_SIZE = os.environ.get("WHISPER_MODEL", "small")
PORT = int(os.environ.get("STT_PORT", "9000"))
# beam=1 (greedy) is fastest; with the domain prompt below, accuracy already
# matches beam=5 on Turkish insurance phrases, so default to speed. Raise
# WHISPER_BEAM if you trade latency for accuracy on a faster machine.
BEAM = int(os.environ.get("WHISPER_BEAM", "1"))
# Domain prompt biases recognition toward insurance vocabulary — a big win for
# terms like kasko / poliçe / trafik that a generic model mangles.
INITIAL_PROMPT = os.environ.get(
    "WHISPER_INITIAL_PROMPT",
    "Sigorta görüşmesi. Kasko, trafik sigortası, seyahat sağlık sigortası, "
    "poliçe, teklif, prim, hasar, TC kimlik numarası, plaka, ruhsat, acente, temsilci.",
)

# int8 on CPU is the fast, low-RAM path. Turkish quality is good on `small`.
# cpu_threads: CTranslate2 defaults to ~4; this laptop has 10 cores, so using
# more threads meaningfully cuts transcription latency.
CPU_THREADS = int(os.environ.get("WHISPER_CPU_THREADS", "8"))
print(f"[stt] loading faster-whisper '{MODEL_SIZE}' (cpu/int8, {CPU_THREADS} threads)...", flush=True)
whisper = WhisperModel(MODEL_SIZE, device="cpu", compute_type="int8", cpu_threads=CPU_THREADS)
print("[stt] ready", flush=True)

app = FastAPI()


@app.get("/health")
def health():
    return {"status": "ok", "model": MODEL_SIZE}


@app.post("/v1/audio/transcriptions")
async def transcribe(
    file: UploadFile = File(...),
    language: str = Form("tr"),
    model: str = Form(None),          # accepted for OpenAI-compat, ignored
    response_format: str = Form("json"),
    temperature: float = Form(0.0),
):
    data = await file.read()
    # vad_filter drops non-speech (whisper otherwise hallucinates phrases on
    # silence); condition_on_previous_text=False avoids runaway repetition;
    # initial_prompt biases toward the insurance domain vocabulary.
    segments, _info = whisper.transcribe(
        io.BytesIO(data),
        language=language,
        beam_size=BEAM,
        temperature=temperature,
        condition_on_previous_text=False,
        vad_filter=True,
        vad_parameters=dict(min_silence_duration_ms=300),
        initial_prompt=INITIAL_PROMPT,
        no_speech_threshold=0.6,
    )
    text = "".join(seg.text for seg in segments).strip()
    return {"text": text}


if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=PORT, log_level="warning")
