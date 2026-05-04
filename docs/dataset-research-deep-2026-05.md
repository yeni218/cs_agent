# Deep Dataset Research — Afiyet AI

Updated: 2026-05-04

This document extends the earlier trilogy of research docs with datasets and
resources not previously covered, organized by the three training targets:

1. **Voice / TTS** — fine-tuning XTTS-v2 for the Afiyet brand voice
2. **ASR / STT** — evaluating or fine-tuning Whisper for Turkish phone calls
3. **LLM** — fine-tuning or prompting Llama 3.3 for restaurant ordering + tool use

Where a dataset was already covered in `turkish-voice-dataset-research.md` or
`customer-service-voice-dataset-research.md`, it is only mentioned briefly as
context; the focus is on **new or previously unassessed sources**.

---

## TL;DR Priority List

| Priority | Dataset / Resource | Use | License | Action |
|---:| --- | --- | --- | --- |
| 1 | **Multi3WOZ Turkish** | LLM fine-tune — restaurant ordering dialogues in Turkish | MIT / CC | Download now from GitHub |
| 2 | **glaive-function-calling-v2** | Tool-call fine-tune — translate subset to Turkish | Apache 2.0 | Download from HF, translate |
| 3 | **Appen TUR_ASR001** | ASR evaluation on 8 kHz phone audio | Commercial | Request sample/pricing |
| 4 | **FutureBeeAI Turkish Travel Call Center** | ASR + barge-in behavior on phone calls | Commercial | Request sample |
| 5 | **magibu/turkish-multi-turn-dialog-dataset** | LLM chat fine-tune in Turkish | Apache 2.0 | Download from HF |
| 6 | **turkish-nlp-suite/InstrucTurca** | LLM general Turkish instruction base | CC-BY-4.0 | Download from HF |
| 7 | **mertbozkurt/llama2-TR-recipe** | Turkish food vocabulary and style | unknown | Audit license, use for script gen |
| 8 | **audiomentations** | Phone codec + noise simulation pipeline | MIT | pip install |
| 9 | **MUSAN corpus** | Background noise for ASR robustness | CC-BY-4.0 | Download from OpenSLR |
| 10 | **Trendyol-LLM-8B-T1** | Synthetic Turkish customer service text generation | Apache 2.0 | Use to generate restaurant scripts |

---

## Part 1 — Voice / TTS Datasets

### 1.1  Already Well-Ranked (existing docs)

| Dataset | Hours | License | Quality |
| --- | ---: | --- | --- |
| `ysdede/commonvoice_17_tr_fixed` | 66h | CC0-1.0 | Crowd-sourced, clean |
| `google/fleurs` tr_tr | ~10h | CC-BY-4.0 | Clean parallel benchmark |
| `emre/Open_SLR108_Turkish_10_hours` | 10h | CC-BY-4.0 | Real media speech |
| `issai/Turkish_Speech_Corpus` | 218h | MIT | Large ASR corpus |

### 1.2  New / Not Previously Assessed

#### hcsolakoglu/Orkhon-TTS (model, not dataset)
- F5-TTS architecture fine-tuned on a single-speaker Turkish dataset
- The training data is **not publicly released**, but the author says it is
  "high-quality single-speaker Turkish speech data" curated personally
- **Why it matters**: the model shows that a clean single-speaker Turkish voice
  can produce near-broadcast-quality output; useful as a listening benchmark
- **Action**: contact `@HCSolakoglu` on X to ask if the training data will be
  released, or to commission similar recordings for Afiyet
- URL: https://huggingface.co/hcsolakoglu/Orkhon-TTS

#### FutureBeeAI Turkish Travel Call Center
- 30 hours, **8 kHz and 16 kHz** stereo (dual-channel separated speakers)
- 60 native speakers, 5–15 min calls, age 18–70
- Topics: booking, flight disruption, passenger support, promotions
- Commercially licensed; manual transcriptions + speaker segmentation
- **Why it matters**: the 8 kHz version is the closest publicly acquirable
  approximation of Twilio phone audio; real call dynamics for barge-in training
- Caveat: travel domain ≠ restaurant domain, but prosody and turn-taking patterns
  transfer well
- URL: https://www.futurebeeai.com/dataset/speech-dataset/travel-call-center-conversation-turkish-turkey

#### FutureBeeAI Turkish Speech Catalog
- FutureBeeAI lists several other Turkish datasets: retail, delivery, general
  conversation, and a customizable acoustic conditions option (in-car, restaurant,
  outdoor, noisy environments)
- The **restaurant acoustic condition** option is directly relevant for handling
  calls with background kitchen noise
- URL: https://www.futurebeeai.com/dataset/speech-data/turkish-dataset

#### MiniMaxAI/TTS-Multilingual-Test-Set (evaluation only)
- Has a `text/turkish.txt` file — a standard benchmark text set for TTS evaluation
- Not training data, but useful for consistent evaluation across model versions
- URL: https://huggingface.co/datasets/MiniMaxAI/TTS-Multilingual-Test-Set

### 1.3  Turkish TTS Model Landscape (2025–2026)

These are models, not datasets, but each tells us what training is achievable
and what data the community is using.

| Model | Architecture | Training data | Quality notes |
| --- | --- | --- | --- |
| `hcsolakoglu/Orkhon-TTS` | F5-TTS | Private single-speaker TR | Broadcast quality demo |
| `marduk-ra/F5-TTS-Turkish` | F5-TTS | Unknown | Community variant |
| `ResembleAI/chatterbox` | Chatterbox | Multilingual, TR included | New 2025 open model |
| `coqui/XTTS-v2` | XTTS-v2 | 16-language (includes TR) | Our current base |
| `facebook/mms-tts-tur` | MMS | Massively multilingual | Low quality for TTS |
| `Anilosan15/kani-tts-400m-0.3-tr` | — | Turkish | Small, community |

**ResembleAI/chatterbox** is worth evaluating against XTTS-v2. It is newer (2025)
and multilingual. Check if the Coqui license concern is less restrictive there.

---

## Part 2 — ASR / STT Datasets

The project currently uses Groq Whisper-large-v3-turbo, which works well for
clean speech. The gap is **phone-quality 8 kHz Turkish** evaluation data.

### 2.1  Appen Turkish Telephony TUR_ASR001
- **41 hours**, 254 contributors, 48,028 utterances, 32,386 unique words
- **8 kHz** sample rate, alaw or wav format
- 200 conversations: 100 speakers × 2 calls each (mobile + landline)
  → 52% mobile, 48% landline
- Fully transcribed and timestamped + pronunciation lexicon
- Recorded 2010 (language is stable, not a freshness concern)
- **Best available 8 kHz Turkish ASR data**. Closest match to Twilio audio quality.
- **Action**: request pricing at https://datasets.appen.com/product/tur_asr001/

### 2.2  Community Whisper Fine-Tunes for Turkish

These models (not datasets) tell us what data is production-tested:

| Model | Base | Training data | WER |
| --- | --- | --- | --- |
| `selimc/whisper-large-v3-turbo-turkish` | whisper-large-v3-turbo | CV 17.0 (25%) | 18.9% |
| `emre/whisper-medium-turkish-2` | whisper-medium | CV 11.0 (10%) | — |
| `sgangireddy/whisper-medium-tr` | whisper-medium | CV 11.0 | — |
| `Huseyin/whisper-large-v3-turkish-finetuned` | whisper-large-v3 | — | — |

**Key insight**: WER 18.9% on CV 17 validation is not good enough for phone calls
which degrade to roughly WER 25–35% without domain adaptation. The gap is not the
model — it is the mismatch between read-speech training data and phone audio.

**Action**: evaluate `whisper-large-v3-turbo` (our current model via Groq) on the
Appen 8 kHz data. If WER > 30% on dish names or numbers (sipariş items), build
a phone-quality augmentation pipeline with audiomentations (section 4).

### 2.3  Turkish Whisper Fine-Tuning Recipe
Published research (Electronics 2024, doi 10.3390/electronics13214227) shows
LoRA fine-tuning of Whisper on Turkish Common Voice achieves WER 4.3–14.2%.
The training setup is: Whisper-large-v3 + LoRA, Common Voice 17 Turkish,
~15k training steps. This is a viable weekend Colab experiment once we have
phone-quality evaluation data.

---

## Part 3 — LLM Datasets

### 3.1  Multi3WOZ — Turkish Task-Oriented Dialogues ⭐ TOP PRIORITY

This is the single most valuable new find for the project.

- **9,160 Turkish dialogues** across restaurant, hotel, attraction, and taxi domains
- Culturally adapted for Ankara, Turkey (not just a translation of English)
- Includes slot annotations, dialogue acts, belief states
- Parallel with English, Arabic, French
- Restaurant domain directly covers: menu requests, availability queries,
  booking, pricing, timing, special requirements
- Paper: TACL 2023, Cambridge + multilingual NLP
- **License**: follows MultiWOZ licensing (permissive research)
- **Download**: https://github.com/cambridgeltl/multi3woz

**How to use for Afiyet**:
1. Filter for restaurant domain dialogues (~2,000 conversations)
2. Adapt slot schema to match Afiyet tools (search_menu → attraction lookup,
   add_to_order → booking, confirm_order → confirmation)
3. Convert to a tool-call format (user turn → tool invocation → response)
4. Mix with synthetic Afiyet-specific examples generated by Trendyol-LLM

### 3.2  Function-Calling Datasets

The LLM needs to call tools fluently: `search_menu`, `add_to_order`,
`get_order_summary`, `confirm_order`, `transfer_to_human`. These datasets train
that behavior.

#### glaiveai/glaive-function-calling-v2
- 100,000 examples, multi-turn function calling, Apache 2.0
- English — must be translated to Turkish for fine-tuning
- Contains generic and specific API schemas that can be replaced with Afiyet schemas
- Already works well with LLaMA-Factory / Axolotl fine-tuning pipelines
- URL: https://huggingface.co/datasets/glaiveai/glaive-function-calling-v2

#### Salesforce/xlam-function-calling-60k
- 60k high-quality tool-calling trajectories from Salesforce Research
- More diverse API types than Glaive
- URL: https://huggingface.co/datasets/Salesforce/xlam-function-calling-60k
- Fine-tuning guide: https://huggingface.co/learn/cookbook/en/function_calling_fine_tuning_llms_on_xlam

#### ToolACE (26,507 APIs)
- Research dataset with a self-evolution pipeline to generate tool-call data
- Not a static download — a framework for generating your own tool-call data
- Most relevant use: generate Afiyet-specific examples using the pipeline
- Paper: https://arxiv.org/abs/2409.00920

**Practical recommendation**: use xLAM 60k as the base function-calling training
set, translate ~5,000 most relevant examples to Turkish, then add Afiyet-specific
examples generated with Trendyol-LLM or Claude.

### 3.3  Turkish Instruction / Chat Datasets

These provide the general Turkish conversational ability the LLM needs before
domain fine-tuning.

| Dataset | Size | Type | License | Notes |
| --- | ---: | --- | --- | --- |
| `turkish-nlp-suite/InstrucTurca` | 2.58M | Instruction following | CC-BY-4.0 | Best large-scale Turkish instruction base |
| `malhajar/OpenOrca-tr` | 2.35M | OpenOrca translation | CC-BY-4.0 | Strong reasoning in Turkish |
| `magibu/turkish-multi-turn-dialog-dataset` | 1k–10k | Multi-turn chat | Apache 2.0 | Synthetic but correctly structured |
| `SoAp9035/everyday-conversations-tur` | 3k | Conversational | — | Natural Turkish tone |
| `beratcmn/lima-tr` | 1.33k | High-quality instruction | — | LIMA-style, quality over quantity |
| `cenfis/alpaca-turkish-combined` | 82.4k | Combined Alpaca | — | Broad coverage |

**Usage for Afiyet**: start with InstrucTurca or OpenOrca-tr to establish Turkish
fluency, then fine-tune further on Multi3WOZ restaurant domain + Afiyet-specific
synthetic data.

### 3.4  Turkish Food / Restaurant Text Data

No dedicated Turkish restaurant ordering text dataset exists. But useful sources:

#### mertbozkurt/llama2-TR-recipe
- Turkish recipe instructions (10.5k examples)
- Contains authentic Turkish food names, quantities, instructions
- Great source for menu vocabulary and cooking-style wording
- URL: https://huggingface.co/datasets/mertbozkurt/llama2-TR-recipe

#### bitext/Bitext-restaurants-llm-chatbot-training-dataset (existing doc)
- 30k English restaurant support examples
- Best approach: machine-translate with a Turkish LLM, then review
- Use as script source for Afiyet actor recordings

### 3.5  Trendyol-LLM-8B-T1 for Synthetic Data Generation
- Qwen 3-8B based, fine-tuned on large-scale Turkish e-commerce data by Trendyol
- Excellent for generating restaurant ordering scripts, complaint dialogues,
  delivery status updates in natural Turkish
- Commercially usable for synthetic data generation (Apache 2.0)
- URL: https://huggingface.co/Trendyol/Trendyol-LLM-8B-T1
- Use case: generate 5,000–10,000 Afiyet-domain Turkish order conversations and
  convert them to tool-call training format

---

## Part 4 — Audio Augmentation for Phone Quality

The biggest training data gap is the mismatch between studio/clean speech and
Twilio's 8 kHz μ-law phone audio. This can be bridged with augmentation.

### 4.1  audiomentations (Python library)
- CPU-based transforms: AddBackgroundNoise, ApplyImpulseResponse, BandPassFilter,
  LowPassFilter, Aliasing, Resample, many more
- GPU version: `torch-audiomentations`
- **Phone simulation recipe**:
  1. Resample to 8 kHz
  2. Apply μ-law encoding/decoding (`torchaudio.functional.mu_law_encoding`)
  3. Add bandpass filter (300–3400 Hz telephony range)
  4. Add restaurant background noise at SNR 8–20 dB
  5. Optionally apply slight reverb (short IR)
- URL: https://github.com/iver56/audiomentations

### 4.2  MUSAN Corpus
- Music, speech, and noise from 12 languages; CC-BY-4.0
- The noise subset is widely used for SNR-based augmentation
- Download: https://www.openslr.org/17/ (OpenSLR 17)
- Size: ~11 GB total

### 4.3  Background Noise for ASR
- `Myrtle/CAIMAN-ASR-BackgroundNoise` — curated background noises on HuggingFace
- AudioSet (Google) — millions of 10-second clips; restaurant/kitchen/street noise
  categories available for free download via yt-dlp

### 4.4  Room Impulse Response (RIR) Datasets
- MIT IR Survey: classic small-room IRs, free download
- OpenSLR 28 (RIRS_NOISES): 60k simulated RIRs, CC-BY-4.0
- Apply with `audiomentations.ApplyImpulseResponse` to simulate phone echo

---

## Part 5 — Crowdsourcing Turkish Voice Data

If we want Afiyet-owned data without the commercial dataset cost:

### 5.1  Platforms for Turkish Native Speakers
| Platform | Type | Notes |
| --- | --- | --- |
| **Prolific** | International panel | Filter by Turkish native language; ~$12/h fair pay |
| **Toloka (Yandex)** | Microtask | Large Turkish worker pool; good for audio tasks |
| **Bionluk** | Turkish freelance | Voice actors and native speakers; negotiate per-clip |
| **Armut** | Turkish services | Broader freelance, some voice/audio providers |

### 5.2  Collection Spec for Afiyet Actor Recording
- 2–3 hours for MVP, 8–12 hours for production
- WAV, 44.1 kHz or 48 kHz, mono, quiet room (–60 dB noise floor)
- Eight style contexts: warm greeting, order-taking, order confirmation,
  menu question answer, apologetic repair, delivery issue, human handoff, farewell
- Script: generated from Bitext Restaurants + Multi3WOZ restaurant domain + Afiyet menu
- License requirements in contract: synthetic voice cloning, commercial restaurant
  calls, derivative model weights, hosting, redistribution

---

## Part 6 — Practical Deployment Path

### No-budget experiment (now)
1. Download Multi3WOZ restaurant Turkish dialogues (free)
2. Convert to Afiyet tool-call format
3. Mix with glaive-function-calling-v2 translated subset
4. Fine-tune Llama 3.3 8B (smaller) on Colab with QLoRA
5. Evaluate on Afiyet audition lines from `training/voice/audition_lines_tr.txt`

### Short-term (<$500)
1. Buy FutureBeeAI Turkish Travel Call Center (30h, 8kHz) for ASR evaluation
2. Build audiomentations phone-simulation pipeline
3. Evaluate Whisper-large-v3-turbo WER on simulated phone audio
4. If WER > 30% on menu items: fine-tune with LoRA on phone-augmented CV17

### Medium-term ($500–$5,000)
1. Commission 2–3 hours of Afiyet actor recording from Prolific or Bionluk
2. Fine-tune XTTS-v2 on actor data (Colab T4, 8–12 epochs)
3. Evaluate against Google TTS and ElevenLabs on the audition lines
4. Generate restaurant ordering LLM training examples via Trendyol-LLM-8B-T1

---

## Sources

- Multi3WOZ Turkish (Cambridge): https://github.com/cambridgeltl/multi3woz
- Multi3WOZ paper (TACL 2023): https://direct.mit.edu/tacl/article/doi/10.1162/tacl_a_00609/118298/Multi3WOZ-A-Multilingual-Multi-Domain-Multi
- Orkhon-TTS model: https://huggingface.co/hcsolakoglu/Orkhon-TTS
- FutureBeeAI Turkish Travel Call Center: https://www.futurebeeai.com/dataset/speech-dataset/travel-call-center-conversation-turkish-turkey
- FutureBeeAI Turkish Speech catalog: https://www.futurebeeai.com/dataset/speech-data/turkish-dataset
- MiniMaxAI TTS Test Set: https://huggingface.co/datasets/MiniMaxAI/TTS-Multilingual-Test-Set
- Appen Turkish telephony TUR_ASR001: https://datasets.appen.com/product/tur_asr001/
- selimc/whisper-large-v3-turbo-turkish: https://huggingface.co/selimc/whisper-large-v3-turbo-turkish
- Whisper LoRA Turkish ASR paper: https://www.mdpi.com/2079-9292/13/21/4227
- glaive-function-calling-v2: https://huggingface.co/datasets/glaiveai/glaive-function-calling-v2
- Salesforce xLAM function calling: https://huggingface.co/datasets/Salesforce/xlam-function-calling-60k
- xLAM fine-tuning cookbook: https://huggingface.co/learn/cookbook/en/function_calling_fine_tuning_llms_on_xlam
- ToolACE paper: https://arxiv.org/abs/2409.00920
- InstrucTurca: https://huggingface.co/datasets/turkish-nlp-suite/InstrucTurca
- magibu/turkish-multi-turn-dialog-dataset: https://huggingface.co/datasets/magibu/turkish-multi-turn-dialog-dataset
- atasoglu Turkish instruction collection: https://huggingface.co/collections/atasoglu/turkish-instruction-datasets
- mertbozkurt/llama2-TR-recipe: https://huggingface.co/datasets/mertbozkurt/llama2-TR-recipe
- Trendyol-LLM-8B-T1: https://huggingface.co/Trendyol/Trendyol-LLM-8B-T1
- audiomentations: https://github.com/iver56/audiomentations
- torch-audiomentations: https://github.com/iver56/torch-audiomentations
- MUSAN corpus: https://arxiv.org/abs/1510.08484
- OpenSLR RIRS_NOISES: https://www.openslr.org/28/
- Myrtle CAIMAN background noise: https://huggingface.co/datasets/Myrtle/CAIMAN-ASR-BackgroundNoise
- ResembleAI Chatterbox: https://huggingface.co/ResembleAI/chatterbox
