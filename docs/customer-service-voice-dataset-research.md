# Customer-Service Voice Dataset Research

Updated: 2026-05-03

Goal: find datasets that are more appropriate for Afiyet than generic Turkish
read speech: customer support, order tracking, retail/e-commerce, delivery,
restaurant, complaint handling, and agent/customer call behavior.

## Best Fit

The most appropriate data I found for Afiyet is not a free public Hugging Face
audio dataset. It is commercial Turkish customer-service speech from FutureBeeAI.

For our exact use case, the ranking is:

1. **FutureBeeAI Turkish Retail & E-commerce Scripted Monologue**
   - Best for TTS/voice fine-tuning.
   - 6,000+ Turkish prompts, 60+ native speakers.
   - Clean WAV, mono, 5-30 second clips.
   - Topics include customer service, order placement, payment, product/service
     inquiries, technical support, promotions, names, addresses, dates, prices,
     order IDs, and tracking numbers.
   - Commercially licensed.

2. **FutureBeeAI Turkish Delivery & Logistics Scripted Monologue**
   - Also strong for Afiyet because restaurant calls involve delivery status,
     wrong addresses, order tracking, modifications, and complaints.
   - 6,000+ prompts, 60 native speakers.
   - Clean WAV, mono, 5-30 second clips.
   - Commercially licensed.

3. **FutureBeeAI Turkish Retail & E-commerce Call Center**
   - Best for ASR, customer intent, complaints, and real agent/customer dialogue.
   - 30 hours, 60 native speakers.
   - Dual-channel real call center conversations.
   - Useful for understanding interruptions, complaints, and customer language.
   - Less ideal for TTS fine-tuning because call-center audio is conversational,
     longer, and usually lower fidelity than studio prompt recordings.

4. **FutureBeeAI Turkish Delivery & Logistics Call Center**
   - Best real-call match for delivery problems.
   - 30 hours, dual-channel, 5-15 minute conversations.
   - Covers order tracking, missed delivery, wrong address, returns, delivery
     confirmation, subscription offers, and incorrect address follow-ups.

5. **Bitext Restaurants LLM Chatbot Dataset**
   - Public text-only dataset, not audio.
   - 30k restaurant support examples.
   - Very useful to generate Turkish restaurant scripts and agent phrases.
   - Covers catering, complaints, customer service, human handoff, menu,
     allergens, online orders, payment issues, delivery time, tracking, and
     reservations.

## What Not To Use As The Main TTS Dataset

| Dataset | Reason |
| --- | --- |
| Generic Common Voice Turkish | Good pronunciation data, weak customer-service style |
| FLEURS Turkish | Clean benchmark data, not customer service |
| Turkish Speech Corpus | Large ASR corpus, not emotional/service style |
| AxonData multilingual call center | Good call-center shape, but no Turkish in listed languages; sample is CC-BY-NC |
| Unidata call-center audio | Large commercial call-center data, but mostly English |
| HumynLabs customer-support audio | Tiny English/Hinglish datasets; good for emotion-label examples only |
| TurEV-DB / TurES | Emotion research only; licensing/access not production-friendly |

## Recommended Pipeline

### No-budget prototype now

Use the current notebook:

```python
DATASET_MODE = "public_blend"
```

That gives Turkish pronunciation from:

- `ysdede/commonvoice_17_tr_fixed`
- Google FLEURS `tr_tr`

Then use Bitext Restaurants as **text/script source**, not voice data:

- translate/adapt restaurant support examples to Turkish,
- rewrite into Afiyet restaurant call style,
- generate audition lines,
- use those lines for evaluation and later actor recording.

### Best paid dataset path

Buy or request samples for:

1. FutureBeeAI Turkish Retail & E-commerce Scripted Monologue.
2. FutureBeeAI Turkish Delivery & Logistics Scripted Monologue.
3. FutureBeeAI Turkish Delivery & Logistics Call Center if we want real call
   behavior for STT/NLU and interruption tests.

For Afiyet TTS quality, prioritize scripted monologue over call-center
conversation because it is cleaner, shorter, and closer to TTS fine-tuning
format.

### Best final production path

Use the commercial/customer-service datasets for coverage, but still record
Afiyet-owned actor audio for the final brand voice:

- 2-3 hours for MVP.
- 8-12 hours for production.
- Scripts generated from Bitext Restaurants plus Afiyet menu/order flows.
- Style labels: warm greeting, order-taking, clear recap, apologetic repair,
  delivery issue, payment issue, human handoff, farewell.

## Practical Decision

For customer service, I would change our plan to:

1. Keep `public_blend` for the first free Colab test.
2. Add Bitext Restaurants as script source for restaurant-specific utterances.
3. Request samples/pricing from FutureBeeAI for Turkish Retail Scripted
   Monologue and Delivery & Logistics Scripted Monologue.
4. Use paid scripted monologue data only if its license allows derivative TTS
   model training and commercial synthetic voice use.
5. Record our own Afiyet actor after we know the exact style we want.

## Sources

- FutureBeeAI Turkish Retail Scripted Monologue: https://www.futurebeeai.com/dataset/monologue-speech-dataset/retail-scripted-speech-monologues-turkish-turkey
- FutureBeeAI Turkish Delivery Scripted Monologue: https://www.futurebeeai.com/dataset/monologue-speech-dataset/delivery-scripted-speech-monologues-turkish-turkey
- FutureBeeAI Turkish Retail Call Center: https://www.futurebeeai.com/dataset/speech-dataset/retail-call-center-conversation-turkish-turkey
- FutureBeeAI Turkish Delivery Call Center: https://www.futurebeeai.com/dataset/speech-dataset/delivery-call-center-conversation-turkish-turkey
- Bitext Restaurants dataset: https://huggingface.co/datasets/bitext/Bitext-restaurants-llm-chatbot-training-dataset
- Bitext Customer Support dataset: https://huggingface.co/datasets/bitext/Bitext-customer-support-llm-chatbot-training-dataset
- AxonData multilingual call-center sample: https://huggingface.co/datasets/AxonData/multilingual-call-center-speech-dataset
- Unidata call-center audio: https://unidata.pro/datasets/call-center-audio/
- HumynLabs e-commerce support audio: https://huggingface.co/datasets/HumynLabs/e-commerce-customersupport-english-audio
