// Per-call voice-pipeline metrics, in the spirit of LiveKit's metrics taxonomy.
//
// Tracks stage latencies (STT, LLM, TTS), turn counts, interruptions, and
// transfers so the pipeline stages can be measured separately. Lightweight and
// in-memory; `summary()` is suitable for logging at call end or shipping to a
// metrics sink.
export class CallMetrics {
  constructor({ sessionId = null } = {}) {
    this.sessionId = sessionId;
    this.startedAt = Date.now();
    // ttfa = time-to-first-audio: how long after synthesis starts the caller
    // hears the first sound. The key "does it feel snappy" naturalness metric.
    this.stages = { stt: [], llm: [], tts: [], ttfa: [] };
    this.counts = { turns: 0, interruptions: 0, falseInterruptions: 0, transfers: 0, errors: 0 };
  }

  // Times an async stage and records its latency in ms.
  async time(stage, fn) {
    const start = Date.now();
    try {
      return await fn();
    } finally {
      this.record(stage, Date.now() - start);
    }
  }

  record(stage, ms) {
    if (this.stages[stage]) this.stages[stage].push(ms);
  }

  increment(counter, by = 1) {
    if (counter in this.counts) this.counts[counter] += by;
  }

  summary() {
    return {
      sessionId: this.sessionId,
      durationMs: Date.now() - this.startedAt,
      counts: { ...this.counts },
      latencyMs: {
        stt: stats(this.stages.stt),
        llm: stats(this.stages.llm),
        tts: stats(this.stages.tts),
        ttfa: stats(this.stages.ttfa)
      }
    };
  }
}

function stats(samples) {
  if (!samples.length) return { count: 0, avg: 0, p95: 0, max: 0 };
  const sorted = [...samples].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  const p95Index = Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95));
  return {
    count: sorted.length,
    avg: Math.round(sum / sorted.length),
    p95: sorted[p95Index],
    max: sorted[sorted.length - 1]
  };
}
