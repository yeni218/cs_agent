// Turkish-aware semantic endpointing.
//
// VAD tells us *when audio went silent*. That is not the same as *the caller
// finished their thought* — Turkish speakers pause mid-sentence after fillers
// ("şey…", "yani…") and conjunctions ("ve…", "çünkü…"). Committing the turn on
// raw silence cuts people off. This module inspects the partial transcript and
// decides whether to respond now or wait briefly for the caller to continue.
//
// It is a lightweight, dependency-free heuristic in the spirit of LiveKit's
// turn-detector model. `classifier` lets a real model be plugged in later.

const TRAILING_INCOMPLETE = new Set([
  // conjunctions / connectors
  've', 'veya', 'ya', 'ama', 'fakat', 'çünkü', 'ki', 'ile', 'hem', 'ayrıca',
  'ancak', 'ya da', 'hem de', 'ne', 'gibi', 'kadar', 'için', 'ile',
  // hesitation / fillers
  'şey', 'yani', 'ee', 'eee', 'ıı', 'ııı', 'hmm', 'ya', 'işte', 'falan',
  // dangling determiners / quantifiers that expect a noun
  'bir', 'birkaç', 'şu', 'bu', 'o'
]);

// Short answers that ARE complete on their own.
const COMPLETE_SHORT = new Set([
  'evet', 'hayır', 'tamam', 'olur', 'peki', 'merhaba', 'selam',
  'teşekkürler', 'teşekkür ederim', 'sağol', 'sağolun', 'doğru', 'yanlış'
]);

export class SemanticEndpointer {
  constructor({
    minWords = 2,
    maxWaitMs = 1200,
    classifier = null // optional async (text) => boolean (true = complete)
  } = {}) {
    this.minWords = minWords;
    this.maxWaitMs = maxWaitMs;
    this.classifier = classifier;
  }

  // Returns { complete: boolean, reason: string }.
  analyze(text) {
    const clean = normalize(text);
    if (!clean) return { complete: false, reason: 'empty' };

    // Explicit sentence-final punctuation or a question particle => done.
    if (/[.?!]$/.test(text.trim())) return { complete: true, reason: 'punctuation' };

    const words = clean.split(/\s+/);
    const last = words[words.length - 1];

    if (COMPLETE_SHORT.has(clean)) return { complete: true, reason: 'short-answer' };

    // Turkish yes/no question particle as a trailing token ("var mı", "olur mu").
    if (/^(mı|mi|mu|mü)$/.test(last)) return { complete: true, reason: 'question-particle' };

    if (words.length < this.minWords) return { complete: false, reason: 'too-short' };

    if (TRAILING_INCOMPLETE.has(last)) return { complete: false, reason: `trailing:${last}` };

    return { complete: true, reason: 'default-complete' };
  }

  // Async variant that consults the optional classifier when the heuristic is
  // unsure (i.e. would otherwise wait). The classifier can override to commit.
  async shouldCommit(text) {
    const verdict = this.analyze(text);
    if (verdict.complete) return true;
    if (this.classifier) {
      try {
        return Boolean(await this.classifier(text));
      } catch {
        return false;
      }
    }
    return false;
  }
}

function normalize(text) {
  return String(text || '')
    .toLocaleLowerCase('tr-TR')
    .replace(/[.,!?;:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
