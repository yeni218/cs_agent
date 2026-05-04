#!/usr/bin/env python3
"""Prepare Turkish speech data in LJSpeech format for XTTS fine-tuning.

The output layout is:

    out_dir/
      metadata.csv       # stem|text|text
      dataset_manifest.json
      wavs/
        000001.wav

Use only audio you have rights to use. Common Voice and other public datasets
are useful for language adaptation experiments, but they are not a substitute
for a clean, contracted Afiyet brand voice dataset.
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import re
import shutil
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any, Iterable


@dataclass
class PreparedItem:
    stem: str
    text: str
    seconds: float
    source: str


def clean_text(value: Any) -> str:
    text = "" if value is None else str(value)
    text = re.sub(r"\s+", " ", text).strip()
    text = text.replace("|", " ")
    return text


def local_rows(args: argparse.Namespace) -> Iterable[dict[str, Any]]:
    input_csv = Path(args.input_csv).expanduser().resolve()
    audio_root = Path(args.audio_root).expanduser().resolve() if args.audio_root else input_csv.parent

    with input_csv.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            audio_value = clean_text(row.get(args.audio_column))
            audio_path = Path(audio_value)
            if not audio_path.is_absolute():
                audio_path = audio_root / audio_path
            yield {
                "audio": {"path": str(audio_path)},
                "text": row.get(args.text_column),
                "source": input_csv.name,
            }


def hf_rows(args: argparse.Namespace) -> Iterable[dict[str, Any]]:
    from datasets import Audio, load_dataset

    kwargs: dict[str, Any] = {"split": args.hf_split}
    if args.hf_config:
        kwargs["name"] = args.hf_config
    token = args.hf_token or os.getenv("HF_TOKEN")

    def _load(**extra):
        try:
            return load_dataset(args.hf_dataset, **kwargs, token=token, **extra)
        except TypeError:
            return load_dataset(args.hf_dataset, **kwargs, use_auth_token=token, **extra)

    if args.trust_remote_code:
        try:
            dataset = _load(trust_remote_code=True)
        except (ValueError, TypeError):
            # Newer datasets versions removed trust_remote_code support; retry without it.
            dataset = _load()
    else:
        dataset = _load()

    dataset = dataset.cast_column(args.hf_audio_column, Audio(sampling_rate=None))
    if args.max_samples:
        dataset = dataset.select(range(min(args.max_samples, len(dataset))))

    for row in dataset:
        if args.speaker_column and args.speaker_value:
            if clean_text(row.get(args.speaker_column)) != args.speaker_value:
                continue
        yield {
            "audio": row.get(args.hf_audio_column),
            "text": row.get(args.hf_text_column),
            "source": args.hf_dataset,
        }


def load_audio_array(audio: dict[str, Any], target_sr: int) -> tuple[Any, int]:
    import librosa
    import numpy as np

    if hasattr(audio, "get_all_samples"):
        decoded = audio.get_all_samples()
        samples = decoded.data.detach().cpu().numpy()
        sample_rate = int(decoded.sample_rate)
    elif isinstance(audio, dict) and audio.get("array") is not None:
        samples = audio["array"]
        sample_rate = int(audio["sampling_rate"])
    elif isinstance(audio, dict) and audio.get("path"):
        samples, sample_rate = librosa.load(audio["path"], sr=None, mono=True)
    else:
        raise ValueError(f"Unsupported audio row type: {type(audio)!r}")

    samples = np.asarray(samples, dtype="float32")
    if samples.ndim > 1:
        samples = samples.mean(axis=0)
    if sample_rate != target_sr:
        samples = librosa.resample(samples, orig_sr=sample_rate, target_sr=target_sr)
        sample_rate = target_sr
    peak = float(np.max(np.abs(samples))) if samples.size else 0.0
    if peak > 1.0:
        samples = samples / peak
    return samples, sample_rate


def write_wav(samples: Any, sample_rate: int, path: Path) -> None:
    import soundfile as sf

    path.parent.mkdir(parents=True, exist_ok=True)
    sf.write(path, samples, sample_rate, subtype="PCM_16")


def prepare(args: argparse.Namespace) -> list[PreparedItem]:
    out_dir = Path(args.out_dir).expanduser().resolve()
    if args.clean and out_dir.exists():
        shutil.rmtree(out_dir)

    wav_dir = out_dir / "wavs"
    out_dir.mkdir(parents=True, exist_ok=True)
    wav_dir.mkdir(parents=True, exist_ok=True)

    row_iter = local_rows(args) if args.source == "local-csv" else hf_rows(args)
    prepared: list[PreparedItem] = []
    seen_text, start_index = existing_metadata_state(out_dir / "metadata.csv", args.append)
    stats = {
        "rows_seen": 0,
        "empty_text": 0,
        "duplicate_text": 0,
        "too_long_text": 0,
        "audio_load_error": 0,
        "duration_filtered": 0,
    }
    audio_errors: list[str] = []

    for row in row_iter:
        stats["rows_seen"] += 1
        text = clean_text(row.get("text"))
        if not text:
            stats["empty_text"] += 1
            continue
        if args.dedupe_text and text.casefold() in seen_text:
            stats["duplicate_text"] += 1
            continue
        if len(text) > args.max_text_chars:
            stats["too_long_text"] += 1
            continue

        try:
            samples, sample_rate = load_audio_array(row["audio"], args.target_sr)
        except Exception as exc:
            stats["audio_load_error"] += 1
            if len(audio_errors) < 10:
                audio_errors.append(str(exc))
            continue

        seconds = len(samples) / float(sample_rate)
        if seconds < args.min_seconds or seconds > args.max_seconds:
            stats["duration_filtered"] += 1
            continue

        stem = f"{args.stem_prefix}{start_index + len(prepared) + 1:06d}"
        write_wav(samples, sample_rate, wav_dir / f"{stem}.wav")
        prepared.append(PreparedItem(stem=stem, text=text, seconds=seconds, source=row["source"]))
        seen_text.add(text.casefold())

        if args.max_items and len(prepared) >= args.max_items:
            break

    metadata_path = out_dir / "metadata.csv"
    mode = "a" if args.append and metadata_path.exists() else "w"
    with metadata_path.open(mode, encoding="utf-8", newline="") as handle:
        writer = csv.writer(handle, delimiter="|", lineterminator="\n")
        for item in prepared:
            writer.writerow([item.stem, item.text, item.text])

    total_rows = count_metadata_rows(metadata_path)
    manifest = {
        "language": args.language,
        "target_sample_rate": args.target_sr,
        "count": len(prepared),
        "total_metadata_rows": total_rows,
        "hours": round(sum(item.seconds for item in prepared) / 3600, 4),
        "source": args.source,
        "hf_dataset": args.hf_dataset,
        "hf_config": args.hf_config,
        "hf_split": args.hf_split,
        "stem_prefix": args.stem_prefix,
        "append": args.append,
        "stats": stats,
        "audio_errors": audio_errors,
        "items": [asdict(item) for item in prepared[:20]],
        "license_note": (
            "Verify every source before commercial training. Prefer Afiyet-owned "
            "voice-actor recordings for production models."
        ),
    }
    (out_dir / "dataset_manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    with (out_dir / "dataset_manifest.jsonl").open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(manifest, ensure_ascii=False) + "\n")

    print(json.dumps({key: manifest[key] for key in ["count", "total_metadata_rows", "hours", "stats", "audio_errors"]}, indent=2))
    if total_rows == 0:
        raise RuntimeError(
            f"Prepared zero usable clips in {out_dir}. Check dataset split/columns, "
            "audio decoding dependencies, and duration/text filters."
        )

    return prepared


def existing_metadata_state(metadata_path: Path, append: bool) -> tuple[set[str], int]:
    if not append or not metadata_path.exists():
        return set(), 0

    seen_text: set[str] = set()
    count = 0
    with metadata_path.open("r", encoding="utf-8", newline="") as handle:
        reader = csv.reader(handle, delimiter="|")
        for row in reader:
            if len(row) >= 2:
                seen_text.add(clean_text(row[1]).casefold())
                count += 1
    return seen_text, count


def count_metadata_rows(metadata_path: Path) -> int:
    if not metadata_path.exists():
        return 0
    with metadata_path.open("r", encoding="utf-8", newline="") as handle:
        return sum(1 for _ in handle)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", choices=["local-csv", "hf-dataset"], required=True)
    parser.add_argument("--out-dir", required=True)
    parser.add_argument("--language", default="tr")
    parser.add_argument("--target-sr", type=int, default=22050)
    parser.add_argument("--min-seconds", type=float, default=1.0)
    parser.add_argument("--max-seconds", type=float, default=11.0)
    parser.add_argument("--max-text-chars", type=int, default=200)
    parser.add_argument("--max-items", type=int, default=0)
    parser.add_argument("--allow-duplicate-text", action="store_false", dest="dedupe_text", default=True)
    parser.add_argument("--append", action="store_true")
    parser.add_argument("--clean", action="store_true")
    parser.add_argument("--stem-prefix", default="")

    parser.add_argument("--input-csv")
    parser.add_argument("--audio-root")
    parser.add_argument("--audio-column", default="audio_path")
    parser.add_argument("--text-column", default="text")

    parser.add_argument("--hf-dataset")
    parser.add_argument("--hf-config")
    parser.add_argument("--hf-split", default="train")
    parser.add_argument("--hf-token")
    parser.add_argument("--hf-audio-column", default="audio")
    parser.add_argument("--hf-text-column", default="sentence")
    parser.add_argument("--trust-remote-code", action="store_true")
    parser.add_argument("--speaker-column")
    parser.add_argument("--speaker-value")
    parser.add_argument("--max-samples", type=int, default=0)
    return parser


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()
    if args.source == "local-csv" and not args.input_csv:
        parser.error("--input-csv is required for --source local-csv")
    if args.source == "hf-dataset" and not args.hf_dataset:
        parser.error("--hf-dataset is required for --source hf-dataset")

    items = prepare(args)
    total_seconds = sum(item.seconds for item in items)
    print(f"prepared {len(items)} clips, {total_seconds / 3600:.2f} hours")


if __name__ == "__main__":
    main()
