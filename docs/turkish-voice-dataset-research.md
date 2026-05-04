# Turkish Voice Dataset Research

Updated: 2026-05-03

Goal: find downloadable Turkish speech datasets we can use when we do not yet
have our own Afiyet actor recordings.

## Short Answer

Use public datasets to improve Turkish pronunciation and robustness, but do not
expect them to produce an ElevenLabs-level emotional brand voice by themselves.

Recommended prototype stack:

1. `ysdede/commonvoice_17_tr_fixed` for a clean, fast CC0 Turkish baseline.
2. `google/fleurs`, config `tr_tr`, for clean multilingual benchmark Turkish.
3. `emre/Open_SLR108_Turkish_10_hours` for real media speech rhythm.
4. `issai/Turkish_Speech_Corpus` if we want a large MIT ASR corpus.
5. `Xeonen/TurEV-DB` only for emotion research/evaluation, not production TTS.

For the deeper diversity ranking, including Codyfederer TR-Full/TR-Combined,
Common Voice Spontaneous 3.0, FutureBeeAI domain data, M-AILABS, MLS, and
Karayakar model notes, see `docs/diverse-turkish-voice-dataset-research.md`.

Avoid production training on celebrity, movie, or YouTube personality voices
unless the voice and platform rights are explicit.

## Production-Safer Turkish Speech Sources

| Dataset | Size | License | Strength | Use |
| --- | ---: | --- | --- | --- |
| Mozilla Common Voice Turkish 25.0 | 134h recorded, 129h validated | CC0-1.0, no speaker identification, no rehosting | Largest clean public Turkish read-speech source | Pronunciation/language adaptation |
| `ysdede/commonvoice_17_tr_fixed` | 91k rows, 66.13h processed | CC0-1.0 | Already cleaned/resampled; easy Hugging Face loading | Best first Colab dataset |
| Google FLEURS `tr_tr` | Around 10h train | CC-BY-4.0 | Clean parallel benchmark speech | Accent/pronunciation validation |
| OpenSLR MediaSpeech Turkish / `emre/Open_SLR108_Turkish_10_hours` | 10h, 2,513 utterances | CC-BY-4.0 | Real media speech from YouTube videos, manually transcribed | Natural rhythm/prosody reference |
| `issai/Turkish_Speech_Corpus` | 218.2h, 186k utterances | MIT | Large Turkish ASR corpus | Large-scale language robustness |

## Useful But Risky / Research-Only Sources

| Dataset | Size | License / risk | Decision |
| --- | ---: | --- | --- |
| `afkfatih/turkish-tts-combined-raw` | 81.5k rows, 33.9GB | Listed CC-BY-SA-3.0, but combines multiple sources and some source rights are unclear | Research only until every source is audited |
| `ysdede/khanacademy-turkish` | 78h, 27k rows | HF card says CC-BY-SA-3.0; dataset text says Khan Academy CC-BY-NC-SA-3.0 | Research only due non-commercial risk |
| `omersaidd/*` Turkish voice datasets | 8k-11k rows for named voices | Some model cards explicitly say research-only and voice/platform owners keep rights | Listen/research only, not Afiyet production |
| YouTube-scraped Turkish model datasets | varies | speaker consent and platform rights unclear | Avoid production use |

## Turkish Emotional Speech Sources

There is no strong, production-safe Turkish emotional TTS dataset comparable to
ElevenLabs-style training data.

| Dataset | Size | License / access | Use |
| --- | ---: | --- | --- |
| TurEV-DB | over 1,700 tokens, 82 words, 4 emotions | CC-BY-NC-ND-4.0; GitHub mirror available | Emotion evaluation/style study only |
| TurES | about 5,100-5,304 movie utterances, 7 emotion categories | Closed access / movie rights issue | Do not use for generator training |
| BUEMDB / EmoSTAR / older Turkish voice corpora | small | Availability/licensing unclear | Literature reference only |
| Expresso | English expressive speech | CC-BY-NC-4.0 | Study style taxonomy only |
| CREMA-D / RAVDESS | English emotion corpora | ODbL or CC-BY-NC | Emotion classifier/eval only |

## Colab Commands

The notebook already has these wired in:

```python
DATASET_MODE = "public_blend"
```

Available modes:

- `public_blend`: recommended no-actor mode; builds one training folder from
  `ysdede/commonvoice_17_tr_fixed` and Google FLEURS `tr_tr`.
- `public_cv17`: fastest clean CC0 baseline.
- `actor`: uses our future licensed Afiyet actor dataset from Google Drive.
- `research_combined`: private research only; uses mixed-source Turkish TTS
  data that still needs a rights audit.

Fast first run with cleaned Common Voice 17:

```bash
python training/voice/prepare_ljspeech.py \
  --source hf-dataset \
  --hf-dataset ysdede/commonvoice_17_tr_fixed \
  --hf-split train \
  --hf-text-column transcription \
  --out-dir /content/data/cv17_tr_fixed_ljspeech \
  --max-items 20000 \
  --max-seconds 9.5 \
  --max-text-chars 160
```

Google FLEURS Turkish:

```bash
python training/voice/prepare_ljspeech.py \
  --source hf-dataset \
  --hf-dataset google/fleurs \
  --hf-config tr_tr \
  --hf-split train \
  --hf-text-column transcription \
  --out-dir /content/data/fleurs_tr_ljspeech \
  --max-seconds 11 \
  --max-text-chars 180
```

Large Turkish Speech Corpus:

```bash
python training/voice/prepare_ljspeech.py \
  --source hf-dataset \
  --hf-dataset issai/Turkish_Speech_Corpus \
  --hf-split train \
  --hf-text-column text \
  --out-dir /content/data/tsc_tr_ljspeech \
  --max-items 50000 \
  --max-seconds 11 \
  --max-text-chars 180
```

Combined Turkish TTS dataset for research-only experiments:

```bash
python training/voice/prepare_ljspeech.py \
  --source hf-dataset \
  --hf-dataset afkfatih/turkish-tts-combined-raw \
  --hf-split train \
  --hf-text-column text \
  --out-dir /content/data/turkish_tts_combined_ljspeech \
  --max-items 20000 \
  --max-seconds 11 \
  --max-text-chars 180
```

## Recommended No-Actor Prototype

If we need to train something now:

1. Train first on `ysdede/commonvoice_17_tr_fixed`.
2. Add FLEURS `tr_tr` for cleaner benchmark speech.
3. Add a small MediaSpeech subset after manual listening.
4. Use TurEV-DB only to design/evaluate emotion labels.
5. Generate Afiyet restaurant audition lines and compare against Google,
   ElevenLabs, and XTTS-v2 Turkish Local.

This will give Turkish pronunciation and robustness, but the emotional voice
will still be limited. For true emotional brand quality, the missing ingredient
is a licensed Turkish actor dataset.

## Sources

- Mozilla Common Voice Turkish 25.0: https://mozilladatacollective.com/datasets/cmn2e7kbl01k2mm07gm5n1bc9
- Common Voice 17 fixed Turkish: https://huggingface.co/datasets/ysdede/commonvoice_17_tr_fixed
- Google FLEURS: https://huggingface.co/datasets/google/fleurs
- OpenSLR MediaSpeech: https://www.openslr.org/108/
- MediaSpeech Turkish HF mirror: https://huggingface.co/datasets/emre/Open_SLR108_Turkish_10_hours
- Turkish Speech Corpus: https://huggingface.co/datasets/issai/Turkish_Speech_Corpus
- Turkish TTS Combined Raw: https://huggingface.co/datasets/afkfatih/turkish-tts-combined-raw
- Khan Academy Turkish: https://huggingface.co/datasets/ysdede/khanacademy-turkish
- TurEV-DB paper: https://aclanthology.org/2020.sltu-1.52/
- TurEV-DB GitHub: https://github.com/Xeonen/TurEV-DB
- TurES paper: https://link.springer.com/article/10.1186/1687-4722-2013-26
