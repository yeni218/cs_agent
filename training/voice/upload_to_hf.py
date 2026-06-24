#!/usr/bin/env python3
"""Upload a packaged voice model folder to Hugging Face Hub."""

from __future__ import annotations

import argparse
import os
from pathlib import Path


def upload(args: argparse.Namespace) -> None:
    from huggingface_hub import HfApi
    from huggingface_hub.errors import HfHubHTTPError

    folder = Path(args.folder).expanduser().resolve()
    if not folder.exists():
        raise FileNotFoundError(folder)

    token = args.token or os.getenv("HF_TOKEN")
    if not token:
        raise ValueError("Missing Hugging Face token. Set HF_TOKEN or pass --token with write permission.")

    api = HfApi(token=token)
    try:
        api.create_repo(
            repo_id=args.repo_id,
            repo_type="model",
            private=args.private,
            exist_ok=True,
        )
    except HfHubHTTPError as exc:
        if "403" in str(exc):
            raise PermissionError(
                "Hugging Face refused repo creation. Use a write-scope token and set "
                "--repo-id to a namespace that token can write to. If unsure, use just "
                "a repo name like 'afiyet-xtts-v2-tr-research' to create it under "
                "the token owner's account."
            ) from exc
        raise
    api.upload_folder(
        repo_id=args.repo_id,
        repo_type="model",
        folder_path=str(folder),
        commit_message=args.commit_message,
    )
    print(f"uploaded {folder} to https://huggingface.co/{args.repo_id}")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--folder", required=True)
    parser.add_argument("--repo-id", required=True)
    parser.add_argument("--token")
    parser.add_argument("--private", action="store_true")
    parser.add_argument("--commit-message", default="Upload Afiyet Turkish voice research checkpoint")
    return parser


def main() -> None:
    args = build_parser().parse_args()
    upload(args)


if __name__ == "__main__":
    main()
