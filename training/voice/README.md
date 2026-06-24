# Afiyet Turkish Voice Training

This folder contains the research pipeline for fine-tuning XTTS-v2 on Turkish
voice data, testing it, packaging it, uploading it to Hugging Face, and serving
it through a faster inference sidecar.

## Legal Boundary

XTTS-v2 sounds good for Turkish, but its upstream model is covered by the Coqui
Public Model License. Treat this pipeline as research and quality benchmarking
unless commercial rights are cleared.

For production, use audio from a Turkish voice actor who explicitly grants
synthetic voice cloning, commercial restaurant calls, derivative model weights,
hosting, and redistribution rights.

## Dataset Format

The Colab notebook supports six dataset modes:

```python
DATASET_MODE = "public_blend"
```

- `public_blend`: Common Voice 17 fixed Turkish + Google FLEURS Turkish.
- `public_cv17`: Common Voice 17 fixed Turkish only.
- `public_diverse`: public blend + optional Turkish Speech Corpus subset.
- `actor`: licensed Afiyet actor data from Google Drive.
- `research_tr_full`: Codyfederer TR-Full emotion/prosody experiment; private only until sources are audited.
- `research_combined`: mixed-source Turkish TTS dataset for private research only.

See `docs/diverse-turkish-voice-dataset-research.md` for the current ranking
and production-safety notes.

Preferred Afiyet-owned metadata:

```csv
audio_path,text,style,emotion,intensity,speaking_rate,context
wavs/000001.wav,"Afiyet Restoran'a hos geldiniz.",greeting,warm,0.6,normal,new_call
```

Convert it to LJSpeech format:

```bash
python training/voice/prepare_ljspeech.py \
  --source local-csv \
  --input-csv /content/drive/MyDrive/afiyet_voice/metadata.csv \
  --audio-root /content/drive/MyDrive/afiyet_voice \
  --out-dir /content/data/afiyet_tr_ljspeech \
  --max-seconds 11 \
  --max-text-chars 200
```

Common Voice Turkish can be used for language adaptation experiments only:

```bash
python training/voice/prepare_ljspeech.py \
  --source hf-dataset \
  --hf-dataset mozilla-foundation/common_voice_25_0 \
  --hf-config tr \
  --hf-split train \
  --hf-text-column sentence \
  --out-dir /content/data/common_voice_tr_ljspeech \
  --max-items 5000
```

## Fine-Tune XTTS-v2 GPT Encoder

```bash
python training/voice/train_xtts_gpt.py \
  --dataset-dir /content/data/afiyet_tr_ljspeech \
  --out-dir /content/runs/afiyet_xtts \
  --run-name afiyet_xtts_v2_tr \
  --language tr \
  --epochs 12 \
  --batch-size 2 \
  --grad-accum-steps 64
```

On a T4, start small: 2-3 hours of clean actor audio and 8-12 epochs. Expand
only after the test clips beat Google/ElevenLabs on our restaurant lines.

## Package

```bash
python training/voice/package_xtts_model.py \
  --run-dir /content/runs/afiyet_xtts \
  --base-model-dir /content/afiyet-ai/models/xtts-v2-base \
  --out-dir /content/artifacts/afiyet-xtts-v2-tr \
  --speaker-ref /content/voice_refs/default.wav
```

## Test Inference

```bash
python training/voice/infer_xtts.py \
  --config-path /content/artifacts/afiyet-xtts-v2-tr/config.json \
  --checkpoint-path /content/artifacts/afiyet-xtts-v2-tr/model.pth \
  --vocab-path /content/artifacts/afiyet-xtts-v2-tr/vocab.json \
  --speaker-wav /content/voice_refs/default.wav \
  --text-file training/voice/audition_lines_tr.txt \
  --out-dir /content/auditions/xtts
```

## Upload To Hugging Face

```bash
python training/voice/upload_to_hf.py \
  --folder /content/artifacts/afiyet-xtts-v2-tr \
  --repo-id YOUR_HF_USERNAME/afiyet-xtts-v2-tr-research \
  --private
```

Use a private repo unless every dataset and model license is production-cleared.

## Optimized Runtime Sidecar

The sidecar preloads the model and caches reference/style latents.

```bash
export XTTS_CONFIG_PATH=/content/artifacts/afiyet-xtts-v2-tr/config.json
export XTTS_CHECKPOINT_PATH=/content/artifacts/afiyet-xtts-v2-tr/model.pth
export XTTS_VOCAB_PATH=/content/artifacts/afiyet-xtts-v2-tr/vocab.json
export XTTS_SPEAKER_WAV=/content/voice_refs/default.wav

uvicorn training.voice.serve_xtts_fastapi:app --host 0.0.0.0 --port 8090
```

For style-aware output, provide multiple short legal reference clips:

```bash
export XTTS_STYLE_REFS_JSON=/content/afiyet-ai/training/voice/style_refs.example.json
```

Then call:

```bash
curl -X POST http://localhost:8090/synthesize \
  -H 'content-type: application/json' \
  -d '{"text":"Haklisiniz, hemen duzeltiyorum.","style":"apologetic_repair"}' \
  --output reply.wav
```
