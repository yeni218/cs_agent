# Open-Source TTS Alternatives

Goal: replace or reduce dependency on ElevenLabs/Google TTS with self-hostable speech synthesis for Turkish restaurant calls.

## Recommendation

1. **Piper first** for a simple production path.
   - MIT code/models in the original Rhasspy release.
   - Turkish voices exist (`tr_TR`).
   - Runs locally with ONNX and can work on CPU.
   - Best fit for a small restaurant call agent where reliability and latency matter more than perfect expressiveness.

2. **Chatterbox Multilingual next** for higher quality if GPU hosting is acceptable.
   - MIT licensed.
   - Supports Turkish (`tr`) in the multilingual model.
   - Zero-shot voice cloning and stronger expressiveness than Piper.
   - More moving parts than Piper; should run as a separate Python/GPU service.

3. **Keep Google TTS as production fallback** until an open-source provider is load-tested.
   - Open-source TTS can be excellent, but phone calls punish latency, cold starts, bad normalization, and unstable pronunciation.

## Candidate Matrix

| Engine | Turkish | License shape | Runtime fit | Notes |
| --- | --- | --- | --- | --- |
| Piper | Yes, `tr_TR` voices | Original repo MIT; newer OHF fork is GPL-3.0 | CPU/ONNX, very deployable | Best first self-hosted option. Natural enough, low latency, simple integration. |
| Chatterbox Multilingual | Yes, `tr` | MIT | GPU recommended | Best quality/open-license candidate. Newer stack, should be isolated behind a TTS HTTP service. |
| Coqui XTTS-v2 | Yes, `tr` | Coqui Public Model License | GPU recommended; supports streaming | Strong quality and cloning, but license is not as clean as MIT/Apache for commercial product use. |
| eSpeak NG | Yes via broad language support | GPL-3.0 | Tiny CPU | Very reliable fallback/testing voice, but robotic. Not good customer-facing primary voice. |
| MaryTTS | Yes | LGPL-3.0 | JVM service | Older but open and Turkish-capable. Voice quality is dated. |
| CosyVoice 2/3 | Not Turkish in official coverage found | Apache-2.0 | GPU/streaming | Strong model family, but official languages are China/English/Japanese/Korean plus several European languages, not Turkish. |
| F5-TTS | Not a clean Turkish production option | MIT code; pretrained weights CC-BY-NC | GPU | Great research model; pretrained license blocks commercial use unless we train/obtain permissive weights. |
| Fish Speech | No official Turkish in language list found | Fish Audio Research License | GPU | Strong multilingual research system, but license/language fit is not ideal for Afiyet. |
| OpenVoice V2 | No native Turkish listed | MIT | GPU recommended | Voice cloning/conversion layer, not the simplest standalone Turkish TTS path. |
| MeloTTS | No Turkish listed | MIT | Python/GPU/CPU depending setup | Good for supported languages only; not a Turkish call-center fit today. |
| Parler-TTS | English-focused from official release | Apache-2.0 | GPU | Fully open training/inference stack, useful if we train a Turkish voice later. |
| RHVoice | No Turkish listed | GPL-2.0 | CPU | Accessibility-focused, good project, but not useful for Turkish without new language work. |

## Practical Afiyet Architecture

Add a third provider behind the current `createTtsProvider()` boundary:

```text
Afiyet API / voice-agent
  -> createTtsProvider()
  -> piper-tts provider
      -> local piper binary or small sidecar HTTP service
      -> WAV/PCM output
      -> convert to µ-law 8 kHz
      -> browser/Twilio playback
```

For Chatterbox, use a sidecar instead of calling Python from Node:

```text
Node voice session
  -> POST /synthesize { text, voice, language: "tr" }
  -> Python GPU TTS service
  -> WAV response
  -> Node converts/resamples to µ-law 8 kHz
```

## Why Not Fork A Big TTS Runtime Into Afiyet

The call agent should stay small and boring. TTS engines have heavy ML dependencies, model files, CUDA/PyTorch version pinning, and different licenses. Treat them as providers, not as product core.

## Test Plan For Any Open-Source TTS

- Turkish pronunciation set: menu items, addresses, phone numbers, prices, order statuses.
- Latency budget: first audio under 500 ms for phone calls; under 1 second acceptable for dashboard.
- Stability: 100 repeated syntheses without crashes or memory growth.
- Audio conversion: output must become µ-law 8 kHz cleanly for Twilio.
- Legal: confirm code and model-weight license, not just repository license.
- Consent: if using voice cloning, only use a voice sample we have written permission to use.

## Sources

- Piper: https://github.com/rhasspy/piper and https://huggingface.co/rhasspy/piper-voices/tree/main/tr/tr_TR
- Chatterbox: https://github.com/resemble-ai/chatterbox
- Coqui XTTS: https://docs.coqui.ai/en/latest/models/xtts.html
- eSpeak NG: https://github.com/espeak-ng/espeak-ng
- MaryTTS: https://marytts.github.io/
- CosyVoice: https://github.com/FunAudioLLM/CosyVoice
- F5-TTS: https://github.com/SWivid/F5-TTS
- Fish Speech: https://github.com/fishaudio/fish-speech
- OpenVoice: https://github.com/myshell-ai/OpenVoice
- MeloTTS: https://github.com/myshell-ai/MeloTTS
- Parler-TTS: https://github.com/huggingface/parler-tts
- RHVoice: https://github.com/RHVoice/RHVoice
