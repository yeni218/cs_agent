#!/usr/bin/env python3
"""Package a fine-tuned XTTS checkpoint for inference and Hugging Face upload."""

from __future__ import annotations

import argparse
import json
import shutil
from pathlib import Path


def newest(paths: list[Path]) -> Path | None:
    if not paths:
        return None
    return max(paths, key=lambda path: path.stat().st_mtime)


def find_checkpoint(run_dir: Path) -> Path:
    preferred = list(run_dir.rglob("best_model.pth"))
    if preferred:
        return newest(preferred)  # type: ignore[return-value]

    candidates = list(run_dir.rglob("checkpoint_*.pth")) + list(run_dir.rglob("*.pth"))
    candidates = [path for path in candidates if path.name not in {"dvae.pth", "mel_stats.pth"}]
    checkpoint = newest(candidates)
    if checkpoint is None:
        raise FileNotFoundError(f"No checkpoint found under {run_dir}")
    return checkpoint


def find_file(run_dir: Path, base_dir: Path | None, filename: str) -> Path:
    for root in [run_dir, base_dir]:
        if root is None:
            continue
        direct = root / filename
        if direct.exists():
            return direct
        matches = list(root.rglob(filename))
        if matches:
            return newest(matches)  # type: ignore[return-value]
    raise FileNotFoundError(f"Could not find {filename}")


def copy_optional(src: Path | None, dst: Path) -> None:
    if src and src.exists():
        shutil.copy2(src, dst)


def package(args: argparse.Namespace) -> None:
    run_dir = Path(args.run_dir).expanduser().resolve()
    out_dir = Path(args.out_dir).expanduser().resolve()
    base_dir = Path(args.base_model_dir).expanduser().resolve() if args.base_model_dir else None
    out_dir.mkdir(parents=True, exist_ok=True)

    checkpoint = Path(args.checkpoint).expanduser().resolve() if args.checkpoint else find_checkpoint(run_dir)
    config = Path(args.config).expanduser().resolve() if args.config else find_file(run_dir, base_dir, "config.json")
    vocab = Path(args.vocab).expanduser().resolve() if args.vocab else find_file(run_dir, base_dir, "vocab.json")
    dvae = None
    mel_stats = None
    try:
        dvae = find_file(run_dir, base_dir, "dvae.pth")
    except FileNotFoundError:
        pass
    try:
        mel_stats = find_file(run_dir, base_dir, "mel_stats.pth")
    except FileNotFoundError:
        pass

    shutil.copy2(checkpoint, out_dir / "model.pth")
    shutil.copy2(config, out_dir / "config.json")
    shutil.copy2(vocab, out_dir / "vocab.json")
    copy_optional(dvae, out_dir / "dvae.pth")
    copy_optional(mel_stats, out_dir / "mel_stats.pth")

    speaker_dir = out_dir / "speaker_refs"
    speaker_dir.mkdir(exist_ok=True)
    for value in args.speaker_ref:
        ref = Path(value).expanduser().resolve()
        shutil.copy2(ref, speaker_dir / ref.name)

    manifest = {
        "name": args.model_name,
        "base_model": args.base_model,
        "language": args.language,
        "checkpoint_source": str(checkpoint),
        "config_source": str(config),
        "vocab_source": str(vocab),
        "speaker_refs": [str(path.name) for path in speaker_dir.glob("*.wav")],
        "license_note": (
            "Research prototype. XTTS-v2 is under the Coqui Public Model License; "
            "clear rights before commercial Afiyet use."
        ),
    }
    (out_dir / "afiyet_voice_manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")

    readme = f"""---
license: other
base_model: {args.base_model}
language:
- tr
tags:
- text-to-speech
- xtts
- turkish
- afiyet-ai
---

# {args.model_name}

Research prototype Turkish XTTS-v2 fine-tune for Afiyet AI voice experiments.

## License and Use

This package is not production-cleared by itself. The upstream XTTS-v2 model is
covered by the Coqui Public Model License. Use this repository for internal
research, listening tests, and quality benchmarking unless commercial rights
are cleared.

Do not use celebrity, character, or scraped voices unless every voice owner has
explicitly consented to synthetic voice cloning and commercial deployment.

## Contents

- `model.pth`: fine-tuned checkpoint
- `config.json`: XTTS config
- `vocab.json`: tokenizer vocabulary
- `speaker_refs/`: optional reference clips
- `afiyet_voice_manifest.json`: packaging metadata
"""
    (out_dir / "README.md").write_text(readme, encoding="utf-8")
    print(f"packaged {args.model_name} into {out_dir}")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--run-dir", required=True)
    parser.add_argument("--out-dir", required=True)
    parser.add_argument("--base-model-dir")
    parser.add_argument("--checkpoint")
    parser.add_argument("--config")
    parser.add_argument("--vocab")
    parser.add_argument("--speaker-ref", action="append", default=[])
    parser.add_argument("--model-name", default="Afiyet XTTS-v2 Turkish Research Voice")
    parser.add_argument("--base-model", default="coqui/XTTS-v2")
    parser.add_argument("--language", default="tr")
    return parser


def main() -> None:
    args = build_parser().parse_args()
    package(args)


if __name__ == "__main__":
    main()
