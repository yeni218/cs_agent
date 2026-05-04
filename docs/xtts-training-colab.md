# XTTS-v2 Turkish Training In Colab

Updated: 2026-05-02

Use this path when we want to prototype the higher-quality Turkish XTTS voice
you preferred. This is not automatically production-cleared.

## What The Notebook Does

`notebooks/afiyet_xtts_v2_turkish_colab.ipynb` runs the full path:

1. Install Coqui XTTS tooling.
2. Log in to Hugging Face.
3. Convert a local actor dataset or Common Voice Turkish subset to LJSpeech.
4. Fine-tune the XTTS-v2 GPT encoder.
5. Package the checkpoint.
6. Generate the Afiyet audition clips.
7. Upload the package to a private Hugging Face repo.
8. Start the optimized FastAPI sidecar for testing.

## Recommended First Run

If you do not have actor recordings yet, keep the notebook default:

```python
DATASET_MODE = "public_blend"
```

This prepares a single XTTS training folder from `ysdede/commonvoice_17_tr_fixed`
and Google FLEURS Turkish. It is the best no-actor prototype path.

After we have recordings, switch to:

```python
DATASET_MODE = "actor"
```

Use 2-3 hours of clean Afiyet-owned actor recordings first. Keep public datasets
as pronunciation/language adaptation data, not as the final brand voice.

Colab GPU:

- T4: OK for a small prototype.
- L4/A100: better for repeated tuning and faster iteration.

Training defaults:

- Batch size: 2.
- Gradient accumulation: 64.
- Epochs: 12.
- Clip length: 1-11 seconds.
- Text length: under 200 chars.

## Hugging Face Repo

The notebook now keeps upload off by default:

```python
UPLOAD_TO_HF = False
```

Turn it on only after adding a Colab secret named `HF_TOKEN` with write
permission.

Use just a repo name to create under the token owner's account:

```python
HF_REPO_ID = "afiyet-xtts-v2-tr-research"
```

Use `user-or-org/repo-name` only when that token can write to the namespace.
A 403 from Hugging Face means the token cannot create or write under that
namespace.

Keep it private unless:

- every audio dataset is cleared,
- the actor contract is explicit,
- upstream model licensing is cleared,
- the model card documents the sources honestly.

## Optimization Notes

The runtime sidecar in `training/voice/serve_xtts_fastapi.py` is optimized for
serving:

- preloaded checkpoint,
- cached speaker/style latents,
- GPU inference mode,
- short restaurant utterances,
- WAV output for Node to convert into 8 kHz mulaw.

The next optimization after this code is model-level profiling:

- measure first-token/first-audio latency,
- cache the most common short replies,
- split long order recaps into sentence chunks,
- run the TTS sidecar on an L4 GPU,
- keep style references short and clean.

## Sources

- Coqui XTTS docs: https://docs.coqui.ai/en/latest/models/xtts.html
- Coqui TTS package: https://pypi.org/project/coqui-tts/
- Hugging Face Hub upload docs: https://huggingface.co/docs/huggingface_hub/main/en/guides/upload
- XTTS-v2 base model: https://huggingface.co/coqui/XTTS-v2
