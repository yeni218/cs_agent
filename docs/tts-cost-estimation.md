# TTS Cost Estimation

Updated: 2026-05-02

All prices are USD and approximate. Provider pricing changes often, so treat this as a planning model, not an invoice forecast.

## Assumptions

Restaurant-call baseline:

- Average call length: 4 minutes
- Assistant generated speech: 2 minutes per call
- TTS text density: about 1,000 text characters/credits per generated audio minute
- TTS characters per call: about 2,000
- STT: Groq Whisper Large v3 Turbo at $0.04/hour transcribed
- LLM: Groq Llama 3.3 70B, estimated at about $0.01/call for a tool-using order flow
- Telephony/Twilio is not included in the main table because destination/country pricing changes by route

## TTS Unit Costs

| Provider | Model/tier | Estimated TTS cost per generated audio minute | Estimated TTS cost per 4-minute call |
| --- | --- | ---: | ---: |
| Google | Standard / WaveNet | $0.004 | $0.008 |
| Google | Neural2 / Polyglot | $0.016 | $0.032 |
| Google | Chirp 3 HD | $0.030 | $0.060 |
| Google | Studio | $0.160 | $0.320 |
| Google | Gemini 2.5 Flash TTS | about $0.015 audio output/min plus tiny text-token cost | about $0.030 |
| Google | Gemini Pro / Gemini 3.1 Flash TTS | about $0.030 audio output/min plus tiny text-token cost | about $0.060 |
| ElevenLabs | Normal high-quality plan usage | about $0.17-$0.20 | about $0.34-$0.40 |
| ElevenLabs | Business low-latency advertised floor | about $0.05 | about $0.10 |
| Self-host | Piper CPU on e2-standard-2 | fixed about $49/month | depends on volume |
| Self-host | GPU model on g2-standard-4 L4 | fixed about $516/month 24/7 | depends on volume |

## Monthly TTS Cost

| Calls/month | Google Neural2 | Google Chirp 3 HD | ElevenLabs normal | ElevenLabs business floor | Piper CPU fixed | GPU self-host fixed |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 100 | $3 | $6 | $34-$40 | $10 | $49 | $516 |
| 500 | $16 | $30 | $170-$200 | $50 | $49 | $516 |
| 1,000 | $32 | $60 | $340-$400 | $100 | $49 | $516 |
| 5,000 | $160 | $300 | $1,700-$2,000 | $500 | $49 | $516 |
| 10,000 | $320 | $600 | $3,400-$4,000 | $1,000 | $49 | $516 |

## Whole AI Stack Estimate

Add roughly $0.013/call for Groq STT + Groq Llama 3.3 70B:

- STT full 4-minute call: about $0.0027/call
- LLM tool flow: about $0.01/call

| Calls/month | Google Neural2 total | Google Chirp total | ElevenLabs normal total | Piper CPU total | GPU self-host total |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 1,000 | about $45 | about $73 | about $353-$413 | about $62 | about $529 |
| 5,000 | about $225 | about $365 | about $1,765-$2,065 | about $114 | about $581 |
| 10,000 | about $450 | about $730 | about $3,530-$4,130 | about $179 | about $646 |

## Break-Even View

Self-host GPU at about $516/month breaks even at approximately:

- 1,500 calls/month versus ElevenLabs normal high-quality pricing
- 5,200 calls/month versus ElevenLabs business floor
- 8,600 calls/month versus Google Chirp 3 HD
- 16,000 calls/month versus Google Neural2

Piper CPU is cheap almost immediately, but the voice quality is not Google/ElevenLabs level. For Afiyet, Piper should be considered a fallback/testing voice, not the main restaurant caller voice.

## Recommendation

For production right now:

1. Use **Google Neural2 or Chirp 3 HD** as the default voice.
2. Keep **ElevenLabs** only if the specific voice quality/conversational feel is worth a much higher bill.
3. Do not self-host only to save money unless either call volume is high or voice quality is acceptable.
4. If self-hosting later, use a separate TTS sidecar service so the core Afiyet app stays provider-flexible.

## Sources

- Google Cloud Text-to-Speech pricing: https://cloud.google.com/text-to-speech/pricing
- ElevenLabs pricing: https://elevenlabs.io/pricing
- Groq pricing: https://groq.com/pricing
- Google Compute Engine VM pricing: https://cloud.google.com/compute/all-pricing
- Google GPU pricing: https://cloud.google.com/compute/gpus-pricing
