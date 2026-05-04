#!/usr/bin/env python3
"""Fine-tune the XTTS-v2 GPT encoder on Turkish speech data.

This is a research/prototype path for Afiyet. XTTS-v2 quality is strong, but
the upstream model license must be cleared before using fine-tuned weights or
generated audio commercially.

Input data must be LJSpeech-style:

    dataset_dir/
      metadata.csv       # stem|text|text
      wavs/
        000001.wav
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path


BASE_MODEL_FILES = ("model.pth", "vocab.json", "dvae.pth", "mel_stats.pth", "config.json")


def download_base_model(repo_id: str, revision: str | None, cache_dir: Path) -> dict[str, Path]:
    from huggingface_hub import hf_hub_download

    cache_dir.mkdir(parents=True, exist_ok=True)
    paths: dict[str, Path] = {}
    for filename in BASE_MODEL_FILES:
        path = hf_hub_download(
            repo_id=repo_id,
            filename=filename,
            revision=revision,
            local_dir=str(cache_dir),
        )
        paths[filename] = Path(path)
    return paths


def speaker_references(dataset_dir: Path, values: list[str]) -> list[str]:
    if values:
        return [str(Path(value).expanduser().resolve()) for value in values]

    candidates = sorted((dataset_dir / "wavs").glob("*.wav"))
    if not candidates:
        raise FileNotFoundError(f"No speaker reference WAVs found in {dataset_dir / 'wavs'}")
    return [str(candidates[0])]


def validate_dataset_dir(dataset_dir: Path) -> None:
    metadata_path = dataset_dir / "metadata.csv"
    wav_dir = dataset_dir / "wavs"

    if not metadata_path.exists():
        raise FileNotFoundError(f"Missing {metadata_path}. Run the dataset preparation cell first.")
    if not wav_dir.exists():
        raise FileNotFoundError(f"Missing {wav_dir}. Run the dataset preparation cell first.")

    row_count = sum(1 for _ in metadata_path.open("r", encoding="utf-8"))
    wav_count = sum(1 for _ in wav_dir.glob("*.wav"))
    if row_count == 0 or wav_count == 0:
        raise RuntimeError(
            f"Dataset is empty: {metadata_path} has {row_count} rows and {wav_dir} "
            f"has {wav_count} wav files. Re-run dataset preparation and check "
            "dataset_manifest.json for skipped/audio errors."
        )
    print(f"dataset ready: {row_count} metadata rows, {wav_count} wav files")


def write_run_manifest(args: argparse.Namespace, out_dir: Path, base_paths: dict[str, Path], refs: list[str]) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    manifest = {
        "base_model": args.base_model_repo,
        "base_model_revision": args.base_model_revision,
        "language": args.language,
        "dataset_dir": str(Path(args.dataset_dir).expanduser().resolve()),
        "speaker_refs": refs,
        "license_note": (
            "Research prototype. XTTS-v2 is under the Coqui Public Model License; "
            "clear rights before commercial Afiyet use."
        ),
        "base_files": {name: str(path) for name, path in base_paths.items()},
    }
    (out_dir / "training_manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")


def train(args: argparse.Namespace) -> None:
    from trainer import Trainer, TrainerArgs
    from TTS.config.shared_configs import BaseDatasetConfig
    from TTS.tts.datasets import load_tts_samples
    from TTS.tts.layers.xtts.trainer.gpt_trainer import GPTArgs, GPTTrainer, GPTTrainerConfig
    from TTS.tts.models.xtts import XttsAudioConfig

    dataset_dir = Path(args.dataset_dir).expanduser().resolve()
    validate_dataset_dir(dataset_dir)

    out_dir = Path(args.out_dir).expanduser().resolve()
    refs = speaker_references(dataset_dir, args.speaker_ref)
    base_paths = download_base_model(
        repo_id=args.base_model_repo,
        revision=args.base_model_revision,
        cache_dir=Path(args.base_model_dir).expanduser().resolve(),
    )

    dataset_config = BaseDatasetConfig(
        formatter="ljspeech",
        dataset_name=args.dataset_name,
        path=str(dataset_dir),
        meta_file_train="metadata.csv",
        language=args.language,
    )

    audio_config = XttsAudioConfig(
        sample_rate=22050,
        dvae_sample_rate=22050,
        output_sample_rate=24000,
    )

    model_args = GPTArgs(
        max_conditioning_length=int(args.max_conditioning_seconds * 22050),
        min_conditioning_length=int(args.min_conditioning_seconds * 22050),
        debug_loading_failures=args.debug_loading_failures,
        max_wav_length=int(args.max_audio_seconds * 22050),
        max_text_length=args.max_text_length,
        mel_norm_file=str(base_paths["mel_stats.pth"]),
        dvae_checkpoint=str(base_paths["dvae.pth"]),
        xtts_checkpoint=str(base_paths["model.pth"]),
        tokenizer_file=str(base_paths["vocab.json"]),
        gpt_num_audio_tokens=1026,
        gpt_start_audio_token=1024,
        gpt_stop_audio_token=1025,
        gpt_use_masking_gt_prompt_approach=True,
        gpt_use_perceiver_resampler=True,
    )

    config = GPTTrainerConfig(
        output_path=str(out_dir),
        model_args=model_args,
        run_name=args.run_name,
        project_name=args.project_name,
        run_description=args.run_description,
        dashboard_logger=args.dashboard_logger,
        logger_uri=args.logger_uri,
        audio=audio_config,
        batch_size=args.batch_size,
        batch_group_size=args.batch_group_size,
        eval_batch_size=args.eval_batch_size,
        num_loader_workers=args.num_workers,
        eval_split_max_size=args.eval_split_max_size,
        print_step=args.print_step,
        plot_step=args.plot_step,
        log_model_step=args.log_model_step,
        save_step=args.save_step,
        save_n_checkpoints=args.save_n_checkpoints,
        save_checkpoints=True,
        print_eval=args.print_eval,
        optimizer="AdamW",
        optimizer_wd_only_on_weights=True,
        optimizer_params={"betas": [0.9, 0.96], "eps": 1e-8, "weight_decay": 1e-2},
        lr=args.lr,
        lr_scheduler="MultiStepLR",
        lr_scheduler_params={
            "milestones": [900000, 2700000, 5400000],
            "gamma": 0.5,
            "last_epoch": -1,
        },
        test_sentences=[
            {
                "text": "Afiyet Restoran'a hos geldiniz, size nasil yardimci olabilirim?",
                "speaker_wav": refs,
                "language": args.language,
            },
            {
                "text": "Haklisiniz, hemen duzeltiyorum. Bir adet lahmacunu siparisten cikariyorum.",
                "speaker_wav": refs,
                "language": args.language,
            },
            {
                "text": "Siparisinizi onayliyorum. Kurye yaklasik otuz bes dakika icinde kapinizda olacak.",
                "speaker_wav": refs,
                "language": args.language,
            },
        ],
    )
    config.epochs = args.epochs
    config.eval_split_size = args.eval_split_size

    model = GPTTrainer.init_from_config(config)
    train_samples, eval_samples = load_tts_samples(
        [dataset_config],
        eval_split=True,
        eval_split_max_size=config.eval_split_max_size,
        eval_split_size=config.eval_split_size,
    )

    write_run_manifest(args, out_dir, base_paths, refs)
    trainer = Trainer(
        TrainerArgs(
            restore_path=args.restore_path,
            skip_train_epoch=False,
            start_with_eval=args.start_with_eval,
            grad_accum_steps=args.grad_accum_steps,
        ),
        config,
        output_path=str(out_dir),
        model=model,
        train_samples=train_samples,
        eval_samples=eval_samples,
    )
    trainer.fit()


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dataset-dir", required=True)
    parser.add_argument("--out-dir", default="runs/xtts-afiyet-tr")
    parser.add_argument("--run-name", default="afiyet_xtts_v2_tr")
    parser.add_argument("--project-name", default="afiyet_voice")
    parser.add_argument("--run-description", default="Afiyet Turkish XTTS-v2 GPT fine-tune")
    parser.add_argument("--dataset-name", default="afiyet_tr")
    parser.add_argument("--language", default="tr")
    parser.add_argument("--speaker-ref", action="append", default=[])

    parser.add_argument("--base-model-repo", default="coqui/XTTS-v2")
    parser.add_argument("--base-model-revision")
    parser.add_argument("--base-model-dir", default="models/xtts-v2-base")
    parser.add_argument("--restore-path")

    parser.add_argument("--epochs", type=int, default=12)
    parser.add_argument("--batch-size", type=int, default=2)
    parser.add_argument("--batch-group-size", type=int, default=48)
    parser.add_argument("--eval-batch-size", type=int, default=2)
    parser.add_argument("--grad-accum-steps", type=int, default=64)
    parser.add_argument("--lr", type=float, default=5e-6)
    parser.add_argument("--eval-split-size", type=float, default=0.03)
    parser.add_argument("--eval-split-max-size", type=int, default=256)
    parser.add_argument("--num-workers", type=int, default=2)

    parser.add_argument("--min-conditioning-seconds", type=float, default=3.0)
    parser.add_argument("--max-conditioning-seconds", type=float, default=6.0)
    parser.add_argument("--max-audio-seconds", type=float, default=11.0)
    parser.add_argument("--max-text-length", type=int, default=200)

    parser.add_argument("--save-step", type=int, default=1000)
    parser.add_argument("--save-n-checkpoints", type=int, default=3)
    parser.add_argument("--print-step", type=int, default=25)
    parser.add_argument("--plot-step", type=int, default=100)
    parser.add_argument("--log-model-step", type=int, default=1000)
    parser.add_argument("--dashboard-logger", default="tensorboard")
    parser.add_argument("--logger-uri")
    parser.add_argument("--start-with-eval", action="store_true")
    parser.add_argument("--print-eval", action="store_true")
    parser.add_argument("--debug-loading-failures", action="store_true")
    return parser


def main() -> None:
    args = build_parser().parse_args()
    train(args)


if __name__ == "__main__":
    main()
