#!/usr/bin/env python3
"""Optimized XTTS FastAPI sidecar for Afiyet voice experiments.

Optimization choices:
- Load the model once at startup.
- Cache speaker/style conditioning latents.
- Keep inference under torch.inference_mode().
- Return WAV bytes that the Node voice layer can downsample to 8 kHz mulaw.
"""

from __future__ import annotations

import io
import json
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any


@dataclass
class StyleLatents:
    gpt_cond_latent: Any
    speaker_embedding: Any


class XttsRuntime:
    def __init__(self) -> None:
        self.model = None
        self.config = None
        self.device = None
        self.sample_rate = int(os.getenv("XTTS_SAMPLE_RATE", "24000"))
        self.language = os.getenv("XTTS_LANGUAGE", "tr")
        self.default_style = os.getenv("XTTS_DEFAULT_STYLE", "default")
        self.styles: dict[str, StyleLatents] = {}

    def load(self) -> None:
        import torch
        from TTS.tts.configs.xtts_config import XttsConfig
        from TTS.tts.models.xtts import Xtts

        config_path = required_env("XTTS_CONFIG_PATH")
        checkpoint_path = required_env("XTTS_CHECKPOINT_PATH")
        vocab_path = required_env("XTTS_VOCAB_PATH")
        refs = load_style_refs()

        config = XttsConfig()
        config.load_json(config_path)
        model = Xtts.init_from_config(config)
        model.load_checkpoint(
            config,
            checkpoint_path=checkpoint_path,
            vocab_path=vocab_path,
            use_deepspeed=os.getenv("XTTS_DEEPSPEED", "").lower() in {"1", "true", "yes"},
        )
        self.device = os.getenv("XTTS_DEVICE") or ("cuda" if torch.cuda.is_available() else "cpu")
        model.to(self.device)
        model.eval()

        self.model = model
        self.config = config
        for style, speaker_wavs in refs.items():
            with torch.inference_mode():
                gpt_cond_latent, speaker_embedding = model.get_conditioning_latents(
                    audio_path=speaker_wavs,
                    gpt_cond_len=int(os.getenv("XTTS_GPT_COND_LEN", "6")),
                    gpt_cond_chunk_len=int(os.getenv("XTTS_GPT_COND_CHUNK_LEN", "4")),
                )
            self.styles[style] = StyleLatents(gpt_cond_latent, speaker_embedding)

    def synthesize(
        self,
        text: str,
        style: str | None = None,
        language: str | None = None,
        speed: float = 1.0,
        temperature: float = 0.75,
        top_p: float = 0.85,
        repetition_penalty: float = 5.0,
    ) -> bytes:
        import torch
        import torchaudio

        if self.model is None:
            raise RuntimeError("XTTS runtime is not loaded")

        selected_style = style if style in self.styles else self.default_style
        latents = self.styles[selected_style]
        with torch.inference_mode():
            output = self.model.inference(
                text=text,
                language=language or self.language,
                gpt_cond_latent=latents.gpt_cond_latent,
                speaker_embedding=latents.speaker_embedding,
                temperature=temperature,
                top_p=top_p,
                repetition_penalty=repetition_penalty,
                speed=speed,
                enable_text_splitting=True,
            )
        wav = torch.tensor(output["wav"]).unsqueeze(0).cpu()
        buffer = io.BytesIO()
        torchaudio.save(buffer, wav, sample_rate=self.sample_rate, format="wav")
        return buffer.getvalue()


def required_env(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise RuntimeError(f"Missing required env var {name}")
    return value


def load_style_refs() -> dict[str, list[str]]:
    refs_json = os.getenv("XTTS_STYLE_REFS_JSON")
    if refs_json:
        raw = json.loads(Path(refs_json).expanduser().read_text(encoding="utf-8"))
        return {style: [str(Path(path).expanduser().resolve()) for path in paths] for style, paths in raw.items()}

    speaker_wav = required_env("XTTS_SPEAKER_WAV")
    return {"default": [str(Path(speaker_wav).expanduser().resolve())]}


runtime = XttsRuntime()


def create_app():
    from fastapi import FastAPI, HTTPException
    from fastapi.responses import Response
    from pydantic import BaseModel, Field

    class SynthesisRequest(BaseModel):
        text: str = Field(min_length=1, max_length=700)
        style: str | None = None
        language: str = "tr"
        speed: float = Field(default=1.0, ge=0.75, le=1.25)
        temperature: float = Field(default=0.75, ge=0.1, le=1.2)
        top_p: float = Field(default=0.85, ge=0.1, le=1.0)
        repetition_penalty: float = Field(default=5.0, ge=1.0, le=10.0)

    app = FastAPI(title="Afiyet XTTS Voice Sidecar", version="0.1.0")

    @app.on_event("startup")
    def startup() -> None:
        runtime.load()

    @app.get("/health")
    def health() -> dict[str, Any]:
        return {
            "ok": runtime.model is not None,
            "device": runtime.device,
            "styles": sorted(runtime.styles),
        }

    @app.post("/synthesize")
    def synthesize(request: SynthesisRequest) -> Response:
        try:
            audio = runtime.synthesize(
                text=request.text,
                style=request.style,
                language=request.language,
                speed=request.speed,
                temperature=request.temperature,
                top_p=request.top_p,
                repetition_penalty=request.repetition_penalty,
            )
        except Exception as exc:
            raise HTTPException(status_code=500, detail=str(exc)) from exc
        return Response(content=audio, media_type="audio/wav")

    return app


app = create_app()
