# Diverse Turkish Voice Dataset Research

Updated: 2026-05-03

Goal: find higher-diversity Turkish speech data while the current XTTS-v2
Common Voice 17 run is training.

## Decision

Keep the current `public_cv17` training run going. For the next Colab run, use
`DATASET_MODE = "public_diverse"` to add more pronunciation and speaker variety
without jumping straight into risky scraped/synthetic material.

For emotional/prosody research, use `DATASET_MODE = "research_tr_full"` only in
a private experiment. It may help us study emotion tags, but it is not a
production dataset until every upstream source is audited.

The strongest customer-service option is still licensed domain data: Turkish
retail/e-commerce or delivery/logistics recordings with consent and commercial
rights. Public datasets can make Turkish better; they will not create an
ElevenLabs-level emotional restaurant agent by themselves.

## Ranked Dataset Plan

| Rank | Dataset | What it gives us | License / risk | Pipeline decision |
| ---: | --- | --- | --- | --- |
| 1 | Mozilla Common Voice Turkish 25.0 | 126,510 clips, 135.29 recorded hours, 129.22 validated hours, 1,816 speakers | CC0-1.0, but no rehosting and no speaker identification | Upgrade later from CV17 when we want the newest public base |
| 2 | `ysdede/commonvoice_17_tr_fixed` | Clean prepared CV17 Turkish, already working in Colab | CC0-1.0 | Current successful baseline |
| 3 | Google FLEURS `tr_tr` | Clean, parallel benchmark read speech, around 10-12h per language | CC-BY-4.0 | Keep in `public_blend` and `public_diverse` |
| 4 | `issai/Turkish_Speech_Corpus` | 218.2h / 186,171 utterances; larger pronunciation and speaker diversity | MIT; ASR-style, not TTS studio speech | Optional subset in `public_diverse` |
| 5 | OpenSLR 108 MediaSpeech Turkish | 10h real media speech, manually transcribed | CC-BY-4.0; YouTube-derived media style | Add later after loader/quality check |
| 6 | Common Voice Spontaneous Speech 3.0 Turkish | Natural spontaneous responses | CC0-1.0, but only 46 clips / 0.27h, 22 validated | Evaluation/listening only |
| 7 | FutureBeeAI Turkish retail/delivery scripted monologues | Customer-service wording, 6,000+ prompts, 60+ native speakers | Paid/commercial dataset | Best production domain add-on if license terms fit |
| 8 | FutureBeeAI Turkish retail call-center conversations | Real customer-service calls, 30h, 60 speakers, dual-channel | Paid/commercial dataset | Best ASR/barge-in/orchestration data, less ideal for TTS voice cloning |
| 9 | `Codyfederer/tr-full-dataset` | 41,427 segments, 222 speakers, emotion labels | Listed CC-BY-4.0; merged from 88 sources via automated builder | Private research only; now wired as `research_tr_full` |
| 10 | `Codyfederer/tr-combined` | 221,531 segments, 2,158 speakers, emotion labels | Listed CC-BY-4.0; merged from 894 sources, 85.2GB | Too large/risky for first Colab experiments |

## Avoid For Production

| Dataset / model | Why not production |
| --- | --- |
| `erenfazlioglu/turkishvoicedataset` | Synthetic Microsoft TTS data, CC-BY-NC-4.0. It can teach a model synthetic prosody instead of human emotion. |
| Karayakar Orpheus Turkish model/data | Useful listening benchmark. The model card says it used 60h plus 160h synthetic voice data and 400 real emoji clips; source rights need separate review. |
| Karayakar F5-TTS Turkish | Good listening benchmark. Model card says it was trained on filtered Common Voice 17, so it does not add a new dataset beyond CV. |
| M-AILABS / MLS | Good speech corpora, but their published language lists do not include Turkish. |
| YouTube, movie, celebrity, or streamer voice datasets | Speaker consent and platform rights are unclear. Do not train Afiyet production weights on them. |

## Colab Modes Now Available

```python
DATASET_MODE = "public_cv17"
```

Current baseline. Uses `ysdede/commonvoice_17_tr_fixed`.

```python
DATASET_MODE = "public_blend"
```

Adds FLEURS Turkish to the Common Voice baseline. This is still a safe public
prototype path.

```python
DATASET_MODE = "public_diverse"
```

Next recommended run. Uses Common Voice 17 fixed, FLEURS Turkish, and an optional
Turkish Speech Corpus subset. If the TSC loader fails in Colab, the notebook
continues with the already prepared datasets.

```python
DATASET_MODE = "research_tr_full"
```

Private emotion/prosody experiment using `Codyfederer/tr-full-dataset`.

```python
DATASET_MODE = "actor"
```

Production path after we record and license our own Afiyet actor data.

## Recommended Next Experiments

1. Finish the current CV17 run and generate the same restaurant audition lines.
2. Run `public_blend` or `public_diverse` for 2-3 epochs, then compare the exact
   same lines against the CV17 output.
3. Run `research_tr_full` for a short private experiment only if we want to test
   whether emotion-labeled public data improves warmth, apology, urgency, and
   hesitation.
4. Do not push public demo weights from `research_tr_full` until the source audit
   is done.
5. For production quality, record 2-5h of one licensed Turkish actor first, then
   expand to 10-20h with controlled emotional scripts for restaurant calls.

## Sources

- Common Voice Turkish 25.0: https://mozilladatacollective.com/datasets/cmn2e7kbl01k2mm07gm5n1bc9
- Common Voice Spontaneous Speech 3.0 Turkish: https://mozilladatacollective.com/datasets/cmn1pleap00tho107nvvwnbyj
- Common Voice 17 fixed Turkish: https://huggingface.co/datasets/ysdede/commonvoice_17_tr_fixed
- Google FLEURS: https://huggingface.co/datasets/google/fleurs
- Turkish Speech Corpus: https://huggingface.co/datasets/issai/Turkish_Speech_Corpus
- ISSAI Turkic ASR project: https://issai.nu.edu.kz/turkic-asr/
- OpenSLR 108 MediaSpeech: https://www.openslr.org/108/
- OpenSLR 108 Turkish HF mirror: https://huggingface.co/datasets/emre/Open_SLR108_Turkish_10_hours
- Codyfederer TR-Full: https://huggingface.co/datasets/Codyfederer/tr-full-dataset
- Codyfederer TR-Combined: https://huggingface.co/datasets/Codyfederer/tr-combined
- Turkish Neural Voice dataset: https://huggingface.co/datasets/erenfazlioglu/turkishvoicedataset
- Karayakar Orpheus Turkish model: https://huggingface.co/Karayakar/Orpheus-TTS-Turkish-PT-5000
- Karayakar F5-TTS Turkish model: https://huggingface.co/Karayakar/F5-TTS-Turkish
- FutureBeeAI Turkish retail scripted monologues: https://www.futurebeeai.com/dataset/monologue-speech-dataset/retail-scripted-speech-monologues-turkish-turkey
- FutureBeeAI Turkish delivery scripted monologues: https://www.futurebeeai.com/dataset/monologue-speech-dataset/delivery-scripted-speech-monologues-turkish-turkey
- FutureBeeAI Turkish retail call-center data: https://www.futurebeeai.com/dataset/speech-dataset/retail-call-center-conversation-turkish-turkey
- MLS Hugging Face dataset card: https://huggingface.co/datasets/facebook/multilingual_librispeech
- M-AILABS dataset README mirror: https://github.com/imdatceleste/m-ailabs-dataset
