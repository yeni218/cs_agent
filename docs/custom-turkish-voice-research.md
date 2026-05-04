# Custom Turkish Voice Fine-Tuning Research

Updated: 2026-05-02

Goal: build an Afiyet-owned Turkish restaurant voice that feels natural, warm, emotionally aware, and closer to Google/ElevenLabs quality than typical open-source TTS.

## Executive Decision

Do **not** train from scratch. Start from a strong open model and fine-tune/adapt:

1. **Primary candidate: Chatterbox Multilingual**
   - Turkish support out of the box.
   - MIT licensed.
   - Emotion/intensity control.
   - Zero-shot voice cloning and local/on-prem deployment.
   - Best open-source candidate for an ElevenLabs-like expressive voice path.

2. **Secondary candidate: Orpheus TTS**
   - Apache-2.0.
   - Strong tag-based expressive speech model family.
   - Turkish community fine-tunes exist, but many are trained on voices whose commercial rights are unclear.

3. **Research-only references**
   - Expresso, RAVDESS, CREMA-D, ESD, TurEV-DB, and TURES are useful for emotion taxonomy/evaluation, not as clean production training data for our Turkish commercial voice.
   - `muhammedsaban/coqui-xtts-v2-turkish-local` is useful as a local Turkish XTTS-v2 audition app, but it is not a separately cleared production model. The wrapper is MIT, while the upstream XTTS-v2 model and outputs remain under the Coqui Public Model License.

Quality note: if our listening tests show XTTS-v2 Turkish sounds more natural than Chatterbox for restaurant calls, use XTTS-v2 as the **quality reference** and prototype voice. Do not train a commercial Afiyet model on XTTS-v2 weights or XTTS-generated audio unless licensing is cleared.

The core product voice should come from a voice actor we contract directly, with explicit rights for synthetic voice cloning, commercial use, restaurant AI calls, derivative model weights, and redistribution/hosting.

## Demo Links To Audition

| What | Link | Why listen |
| --- | --- | --- |
| Chatterbox Multilingual HF demo | https://huggingface.co/spaces/ResembleAI/Chatterbox-Multilingual-TTS | Best Turkish-capable open candidate with emotion control. |
| Chatterbox product samples | https://www.resemble.ai/chatterbox/ | Listen for emotional exaggeration and zero-shot voice cloning quality. |
| Chatterbox model card | https://huggingface.co/ResembleAI/chatterbox | Check Turkish support, MIT license, model details, and usage. |
| Orpheus TTS demo | https://huggingface.co/spaces/MohamedRashad/Orpheus-TTS | Useful to hear LLM-style speech tags and expressive delivery. |
| Orpheus model card | https://huggingface.co/canopylabs/orpheus-3b-0.1-ft | Check Apache-2.0 license and emotion-tag approach. |
| Orpheus GitHub demo | https://github.com/canopyai/Orpheus-TTS | Includes demo video and fine-tuning code. |
| Coqui XTTS-v2 Turkish Local | https://huggingface.co/spaces/muhammedsaban/coqui-xtts-v2-turkish-local | Useful to audition Turkish XTTS-v2 quickly; not production-cleared for Afiyet. |
| Coqui XTTS-v2 Turkish Local GitHub | https://github.com/muhammedsaban/coqui-xtts-v2-turkish-local | Gradio wrapper around upstream XTTS-v2 with Turkish language mode, speaker dropdown, speed control, chunking, and WAV output. |
| Kokoro demo | https://huggingface.co/spaces/hexgrad/Kokoro-TTS | Very efficient and natural in supported languages, but no Turkish today. |
| VibeVoice project | https://github.com/microsoft/VibeVoice | Good context-aware long-form research reference; Turkish is not the right fit today. |
| Expresso samples | https://speechbot.github.io/expresso/ | Best public demo for expressive styles: angry, happy, sad, sarcastic, whisper, laughter. |
| Parler Expresso demo | https://huggingface.co/spaces/parler-tts/parler-tts-expresso | Listen to text-described expressive TTS behavior. |
| TTS Spaces Arena | https://huggingface.co/spaces/Pendrokar/TTS-Spaces-Arena | Compare multiple open TTS models by ear. |

## Turkish Data Sources

| Dataset | License / risk | Usefulness | Decision |
| --- | --- | --- | --- |
| Mozilla Common Voice Turkish 25.0 | CC0, 129.22 validated hours, 1816 speakers; no rehosting and no speaker identification | Great for Turkish phonetics/accent robustness; not studio TTS quality | Use for language adaptation or pronunciation evaluation, not final voice style |
| OpenSLR MediaSpeech Turkish | CC-BY-4.0; media speech | Useful for broad Turkish ASR/pronunciation diversity | Optional language data; not final voice style |
| Turkish Speech Corpus / TurkicASR | MIT, 218.2 hours | Good ASR/pronunciation corpus; not curated TTS voice data | Optional for pronunciation robustness |
| afkfatih Turkish TTS Combined Raw | Mixed sources, listed CC-BY-SA-3.0; 81.5k rows / 33.9GB; includes Common Voice, Khan Academy, and community TTS sets | Useful for experiments; license/source audit required | Do not use for commercial model until every source is cleared |
| omersaidd Turkish character/famous-voice datasets | Model cards often say research-only and that voice/platform owners retain rights | Useful to understand what community fine-tunes sound like | Do not use for Afiyet production |
| erenfazlioglu Turkish Neural Voice | Synthetic Microsoft TTS audio | Quality/scale is interesting, but synthetic provider rights are unclear | Avoid for commercial training |
| TurEV-DB | CC BY-NC-ND 4.0; Turkish emotional words | Useful for emotion analysis research | Do not train production generator |
| TURES Turkish movie corpus | closed/research; movie rights issue | Realistic Turkish emotion labels | Do not train production generator |

## Emotional / Character Datasets

| Dataset | License / risk | Strength | Decision |
| --- | --- | --- | --- |
| Expresso | CC BY-NC 4.0 | Studio-quality expressive styles, improvised dialogue, laughter, whisper, sarcasm | Study and evaluate only; not commercial training |
| CREMA-D | ODbL; commercial usage possible with attribution/license obligations | 91 actors, six emotions, intensity labels | Useful for emotion classifier/eval; not Turkish voice training |
| RAVDESS | CC BY-NC 4.0 | Professional actors, speech/song, intensity | Research/eval only |
| ESD | English/Chinese, five emotions, 20 speakers | Parallel emotional speech useful for style-transfer research | Research/eval only unless license cleared |
| Emilia | Original 101k hours CC BY-NC; Emilia-YODAS part CC-BY; no Turkish | Massive spontaneous speech dataset with demos | Architecture/data-pipeline reference, not Afiyet Turkish training |

## Recommended Dataset We Should Create

For ElevenLabs-like quality, the dataset matters more than the training trick.

Minimum viable:

- 1 Turkish voice actor.
- 2-3 hours clean studio audio.
- 1,500-2,500 utterances.
- 24 kHz or 48 kHz WAV, mono, consistent mic.
- Accurate transcripts and style labels.

Strong production target:

- 1 main brand voice + 1 backup voice.
- 8-12 hours per voice.
- 6,000-10,000 utterances per voice.
- Balanced style coverage:
  - neutral service
  - warm greeting
  - cheerful confirmation
  - apologetic correction
  - calm de-escalation
  - concise order recap
  - careful address/phone-number reading
  - urgent handoff
  - soft upsell
  - end-call farewell

Recording script categories:

- Menu items, modifiers, combos, prices.
- Turkish names, streets, districts, apartment addresses.
- Numbers, phone numbers, order totals, delivery times.
- Short turn-taking lines: "Tabii", "Anladım", "Bir saniye kontrol ediyorum."
- Repair phrases: "Bunu tekrar eder misiniz?", "Yanlış anladıysam düzelteyim."
- Emotion lines with context: happy, apology, reassurance, urgency, confusion, gratitude.
- Natural nonverbal tags in moderation: small chuckle, sigh, thinking pause.

Metadata format:

```csv
audio_path,text,style,emotion,intensity,speaking_rate,context
wavs/000001.wav,"Afiyet Restoran'a hoş geldiniz.",greeting,warm,0.6,normal,new_call
wavs/000002.wav,"Haklısınız, hemen düzeltiyorum.",repair,apologetic,0.7,slow,customer_correction
wavs/000003.wav,"Toplam tutar dört yüz otuz lira.",recap,clear,0.5,slow,order_total
```

## Emotionally Context-Aware Runtime

The model alone should not guess emotion randomly. The agent should choose a voice style intentionally.

Add a voice-planning layer before TTS:

```json
{
  "text": "Haklısınız, hemen düzeltiyorum. Bir adet lahmacunu çıkarıyorum.",
  "style": "apologetic_repair",
  "emotion": "calm",
  "intensity": 0.55,
  "pace": "slow",
  "reason": "customer corrected an order item"
}
```

Voice style rules:

- New call: warm, confident, medium energy.
- Customer interrupts: brief, calm, no exaggerated emotion.
- Customer sounds upset: slower pace, apologetic, no upsell.
- Order recap: clear, careful, low emotion.
- Successful confirmation: warmer and slightly cheerful.
- Human handoff: serious, calm, reassuring.

## Fine-Tuning Path

Phase 1: Audition

- Try Chatterbox Multilingual Turkish with 5-20 second legal reference clips.
- Try Orpheus Turkish community models only for sound comparison, not production data use.
- Try Coqui XTTS-v2 Turkish Local for sound comparison only. Its GitHub README says the app wrapper is MIT, but upstream Coqui TTS library and XTTS model licensing are separate.
- Build a small A/B page comparing Google, ElevenLabs, Chatterbox, Orpheus, and XTTS-v2 on the same 50 restaurant lines.

Phase 2: Legal voice capture

- Hire a Turkish actor.
- Record 2-3 hours first.
- Build a tiny fine-tune and compare against Google/ElevenLabs.

Phase 3: Production voice

- Expand to 8-12 hours.
- Fine-tune Chatterbox/Orpheus candidate.
- Add voice-planning from the LLM.
- Run human evaluation with real Turkish callers.

Phase 4: Deployment

- Serve TTS from a Python GPU sidecar.
- Node agent sends `{ text, style, emotion, intensity }`.
- Sidecar returns 24 kHz WAV.
- Node converts to 8 kHz µ-law for Twilio/browser.

## Evaluation Checklist

- Turkish pronunciation: menu, streets, names, numbers.
- Emotional naturalness: warm, apologetic, calm, cheerful, urgent.
- Context fit: no cheerful tone during complaint; no robotic tone during greeting.
- Latency: first audio under 700 ms for phone path.
- Stability: 1,000 generations without repeats, skips, or hallucinated words.
- Side-by-side human preference against Google and ElevenLabs.
- Legal review of all audio/model licenses before production.

## Immediate Next Step

Build an audition harness:

- 50 fixed Turkish restaurant lines.
- Same text generated by Google, ElevenLabs, Chatterbox, Orpheus, and XTTS-v2 Turkish Local.
- Store outputs under `experiments/voice-auditions/`.
- Score each clip: naturalness, emotion fit, pronunciation, latency, artifacts.

After that, choose the base model and record the first 2-hour actor dataset.

## Sources

- Chatterbox Multilingual: https://www.resemble.ai/learn/models/chatterbox-multilingual
- Chatterbox HF model: https://huggingface.co/ResembleAI/chatterbox
- Chatterbox HF demo: https://huggingface.co/spaces/ResembleAI/Chatterbox-Multilingual-TTS
- Orpheus TTS GitHub: https://github.com/canopyai/Orpheus-TTS
- Orpheus HF model: https://huggingface.co/canopylabs/orpheus-3b-0.1-ft
- Coqui XTTS-v2 Turkish Local GitHub: https://github.com/muhammedsaban/coqui-xtts-v2-turkish-local
- Coqui XTTS-v2 Turkish Local HF Space: https://huggingface.co/spaces/muhammedsaban/coqui-xtts-v2-turkish-local
- Coqui XTTS-v2 model: https://huggingface.co/coqui/XTTS-v2
- Coqui XTTS docs: https://docs.coqui.ai/en/latest/models/xtts.html
- Common Voice Turkish 25.0: https://datacollective.mozillafoundation.org/datasets/cmn2e7kbl01k2mm07gm5n1bc9
- OpenSLR MediaSpeech Turkish: https://openslr.org/108/
- Turkish Speech Corpus: https://huggingface.co/datasets/issai/Turkish_Speech_Corpus
- Turkish TTS Combined Raw: https://huggingface.co/datasets/afkfatih/turkish-tts-combined-raw
- Expresso samples: https://speechbot.github.io/expresso/
- Expresso dataset: https://huggingface.co/datasets/ylacombe/expresso
- CREMA-D docs: https://audeering.github.io/datasets/datasets/crema-d.html
- RAVDESS Zenodo: https://zenodo.org/records/1188976
- TurEV-DB: https://open.metu.edu.tr/handle/11511/106587
- Emilia demo: https://emilia-dataset.github.io/Emilia-Demo-Page/
- Kokoro: https://huggingface.co/hexgrad/Kokoro-82M
- VibeVoice: https://github.com/microsoft/VibeVoice
