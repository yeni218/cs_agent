#!/usr/bin/env python3
"""Generate Turkish speech from a packaged XTTS model."""

from __future__ import annotations

import argparse
import csv
import time
from pathlib import Path


def load_lines(args: argparse.Namespace) -> list[str]:
    if args.text:
        return [args.text]
    if args.text_file:
        return [
            line.strip()
            for line in Path(args.text_file).expanduser().read_text(encoding="utf-8").splitlines()
            if line.strip()
        ]
    raise ValueError("Provide --text or --text-file")


def generate(args: argparse.Namespace) -> None:
    import torch
    import torchaudio
    from TTS.tts.configs.xtts_config import XttsConfig
    from TTS.tts.models.xtts import Xtts

    config = XttsConfig()
    config.load_json(args.config_path)

    model = Xtts.init_from_config(config)
    model.load_checkpoint(
        config,
        checkpoint_path=args.checkpoint_path,
        vocab_path=args.vocab_path,
        use_deepspeed=args.deepspeed,
    )
    device = args.device or ("cuda" if torch.cuda.is_available() else "cpu")
    model.to(device)
    model.eval()

    refs = [str(Path(value).expanduser().resolve()) for value in args.speaker_wav]
    if not refs:
        raise ValueError("At least one --speaker-wav is required")

    with torch.inference_mode():
        gpt_cond_latent, speaker_embedding = model.get_conditioning_latents(
            audio_path=refs,
            gpt_cond_len=args.gpt_cond_len,
            gpt_cond_chunk_len=args.gpt_cond_chunk_len,
        )

    out_dir = Path(args.out_dir).expanduser().resolve()
    out_dir.mkdir(parents=True, exist_ok=True)

    rows: list[dict[str, str | float]] = []
    for index, text in enumerate(load_lines(args), start=1):
        start = time.perf_counter()
        with torch.inference_mode():
            output = model.inference(
                text=text,
                language=args.language,
                gpt_cond_latent=gpt_cond_latent,
                speaker_embedding=speaker_embedding,
                temperature=args.temperature,
                length_penalty=args.length_penalty,
                repetition_penalty=args.repetition_penalty,
                top_k=args.top_k,
                top_p=args.top_p,
                speed=args.speed,
                enable_text_splitting=args.enable_text_splitting,
            )
        elapsed = time.perf_counter() - start
        wav = torch.tensor(output["wav"]).unsqueeze(0)
        path = out_dir / f"{index:03d}.wav"
        torchaudio.save(str(path), wav.cpu(), sample_rate=args.sample_rate)
        rows.append({"file": path.name, "seconds": round(elapsed, 3), "text": text})
        print(f"{path.name}: {elapsed:.2f}s")

    with (out_dir / "manifest.csv").open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=["file", "seconds", "text"])
        writer.writeheader()
        writer.writerows(rows)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config-path", required=True)
    parser.add_argument("--checkpoint-path", required=True)
    parser.add_argument("--vocab-path", required=True)
    parser.add_argument("--speaker-wav", action="append", default=[])
    parser.add_argument("--out-dir", default="experiments/voice-auditions/xtts")
    parser.add_argument("--text")
    parser.add_argument("--text-file")
    parser.add_argument("--language", default="tr")
    parser.add_argument("--device")
    parser.add_argument("--sample-rate", type=int, default=24000)
    parser.add_argument("--temperature", type=float, default=0.75)
    parser.add_argument("--length-penalty", type=float, default=1.0)
    parser.add_argument("--repetition-penalty", type=float, default=5.0)
    parser.add_argument("--top-k", type=int, default=50)
    parser.add_argument("--top-p", type=float, default=0.85)
    parser.add_argument("--speed", type=float, default=1.0)
    parser.add_argument("--gpt-cond-len", type=int, default=6)
    parser.add_argument("--gpt-cond-chunk-len", type=int, default=4)
    parser.add_argument("--enable-text-splitting", action="store_true")
    parser.add_argument("--deepspeed", action="store_true")
    return parser


def main() -> None:
    args = build_parser().parse_args()
    generate(args)


if __name__ == "__main__":
    main()
