import { EnergyTurnDetector } from './turn-detector.js';

// Selects the turn detector backend, mirroring the TTS/STT provider-factory
// pattern. Default is the energy detector (with adaptive noise floor on for
// production-like robustness). Silero is opt-in and falls back gracefully so
// the app stays runnable if the optional dependency/model is absent.
//
//   TURN_DETECTOR=energy   (default)
//   TURN_DETECTOR=silero   (requires onnxruntime-node + SILERO_VAD_MODEL_PATH)
export async function createTurnDetector(options = {}, { logger = null } = {}) {
  const backend = (process.env.TURN_DETECTOR || 'energy').toLowerCase();

  if (backend === 'silero') {
    try {
      const { SileroTurnDetector } = await import('./silero-vad.js');
      const detector = new SileroTurnDetector(options);
      await detector.init();
      logger?.info?.('Turn detector: silero');
      return detector;
    } catch (error) {
      logger?.warn?.(
        { error: error.message },
        'Silero VAD unavailable, falling back to adaptive energy detector'
      );
    }
  }

  logger?.info?.('Turn detector: energy (adaptive)');
  return new EnergyTurnDetector({ adaptiveNoiseFloor: true, ...options });
}
