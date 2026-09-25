// Custom Azure Text-to-Speech for LiveKit agents.
//
// The official @livekit/agents-plugin-azure is STT-only, but Azure Cognitive
// Services has excellent NATIVE Turkish neural voices (tr-TR-EmelNeural /
// tr-TR-AhmetNeural). Inworld has zero Turkish voices, so this replaces it.
//
// Azure REST endpoint (no Speech SDK needed):
//   POST https://<region>.tts.speech.microsoft.com/cognitiveservices/v1
// We request 24 kHz mono PCM (the neural voices' native rate — 16 kHz sounds
// robotic) and STREAM the response body, pushing audio frames as they arrive so
// the first words play ~immediately instead of after the whole clip renders.
import { AudioByteStream, shortuuid, tts } from '@livekit/agents';

const SAMPLE_RATE = 24000;
const CHANNELS = 1;
const OUTPUT_FORMAT = 'raw-24khz-16bit-mono-pcm';

export interface AzureTTSOptions {
  speechKey: string;
  speechRegion: string;
  voice: string;
  language: string;
}

const DEFAULTS = { voice: 'tr-TR-EmelNeural', language: 'tr-TR' };

export class TTS extends tts.TTS {
  #opts: AzureTTSOptions;
  label = 'azure.TTS';

  constructor(opts: { speechKey?: string; speechRegion?: string; voice?: string; language?: string }) {
    super(SAMPLE_RATE, CHANNELS, { streaming: false });
    if (!opts.speechKey || !opts.speechRegion) {
      throw new Error('Azure TTS requires speechKey and speechRegion');
    }
    this.#opts = { ...DEFAULTS, ...opts } as AzureTTSOptions;
  }

  updateOptions(opts: Partial<AzureTTSOptions>) {
    this.#opts = { ...this.#opts, ...opts };
  }

  synthesize(text: string, connOptions?: any, abortSignal?: AbortSignal): tts.ChunkedStream {
    return new ChunkedStream(this, text, this.#opts, connOptions, abortSignal);
  }

  stream(): any {
    throw new Error('Streaming input is not supported on Azure REST TTS');
  }

  async close() {}
}

function escapeXml(s: string): string {
  const map: Record<string, string> = { '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' };
  return s.replace(/[<>&'"]/g, (c) => map[c]!);
}

class ChunkedStream extends tts.ChunkedStream {
  label = 'azure.ChunkedStream';
  #opts: AzureTTSOptions;
  #signal?: AbortSignal;

  constructor(ttsInstance: TTS, text: string, opts: AzureTTSOptions, connOptions?: any, abortSignal?: AbortSignal) {
    super(text, ttsInstance, connOptions, abortSignal);
    this.#opts = opts;
    this.#signal = abortSignal;
  }

  protected async run(): Promise<void> {
    try {
      const ssml =
        `<speak version='1.0' xml:lang='${this.#opts.language}'>` +
        `<voice name='${this.#opts.voice}'>${escapeXml(this.inputText)}</voice></speak>`;

      const res = await fetch(
        `https://${this.#opts.speechRegion}.tts.speech.microsoft.com/cognitiveservices/v1`,
        {
          method: 'POST',
          headers: {
            'Ocp-Apim-Subscription-Key': this.#opts.speechKey,
            'Content-Type': 'application/ssml+xml',
            'X-Microsoft-OutputFormat': OUTPUT_FORMAT,
            'User-Agent': 'afiyetsesli',
          },
          body: ssml,
          signal: this.#signal,
        },
      );
      if (!res.ok) {
        throw new Error(`Azure TTS ${res.status}: ${(await res.text()).slice(0, 200)}`);
      }

      const requestId = shortuuid();
      const segmentId = shortuuid();
      const bstream = new AudioByteStream(SAMPLE_RATE, CHANNELS);

      let lastFrame: any;
      const sendLastFrame = (final: boolean) => {
        if (lastFrame) {
          this.queue.put({ requestId, segmentId, frame: lastFrame, final } as any);
          lastFrame = undefined;
        }
      };

      // Stream the response so audio starts playing before the whole clip renders.
      if (res.body) {
        const reader = res.body.getReader();
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          for (const frame of bstream.write(value)) {
            sendLastFrame(false);
            lastFrame = frame;
          }
        }
      } else {
        const buf = await res.arrayBuffer();
        for (const frame of bstream.write(buf)) {
          sendLastFrame(false);
          lastFrame = frame;
        }
      }
      for (const frame of bstream.flush()) {
        sendLastFrame(false);
        lastFrame = frame;
      }
      sendLastFrame(true);
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return;
      throw error;
    } finally {
      this.queue.close();
    }
  }
}
