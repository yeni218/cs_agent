// Splits an assistant reply into short, speakable segments so the voice agent
// can synthesize and start playing the FIRST sentence while later ones are still
// being generated. This is the single biggest perceived-latency / naturalness
// win: time-to-first-audio drops from "synthesize the whole paragraph" to
// "synthesize the first clause". It also gives barge-in a clean seam — playback
// can be abandoned between chunks the moment the caller starts speaking.
//
// Turkish-aware: we treat sentence enders (. ! ? …) as hard boundaries, and for
// long run-on sentences we also break at a comma/clause once a minimum length is
// reached, so the first chunk is emitted quickly without cutting mid-word.

const SENTENCE_END = /[.!?…]/;
const SOFT_BREAK = /[,;:]/;
// Don't split after a number+dot ("1.", "3.") or common Turkish abbreviations —
// those dots are not sentence ends.
const ABBREVIATIONS = new Set(['no', 'tel', 'vb', 'vs', 'sn', 'dr', 'av', 'tl']);

// minChars is the smallest stand-alone chunk we'll emit: a complete short
// sentence ("Teklifiniz hazır.") is a fine speech unit, but a trivial fragment
// ("Peki.") gets merged rather than played as a lonely micro-utterance.
export function splitIntoSpeechChunks(text, { minChars = 12, maxChars = 160 } = {}) {
  if (!text) return [];
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) return [];

  const chunks = [];
  let start = 0;
  let softBreakAt = -1;

  for (let i = 0; i < normalized.length; i += 1) {
    const char = normalized[i];
    const chunkLen = i - start + 1;

    if (SOFT_BREAK.test(char)) softBreakAt = i;

    const atSentenceEnd = SENTENCE_END.test(char) && !isAbbreviationDot(normalized, i, start);
    const sentenceEndReady = atSentenceEnd && chunkLen >= minChars;
    const tooLong = chunkLen >= maxChars;

    if (sentenceEndReady) {
      chunks.push(normalized.slice(start, i + 1).trim());
      start = i + 1;
      softBreakAt = -1;
    } else if (tooLong) {
      // Overlong clause: break at the last soft boundary if we have one past the
      // minimum, otherwise at the last whitespace, otherwise hard-cut.
      const cut = pickBreakPoint(normalized, start, i, softBreakAt, minChars);
      chunks.push(normalized.slice(start, cut + 1).trim());
      start = cut + 1;
      softBreakAt = -1;
    }
  }

  const tail = normalized.slice(start).trim();
  if (tail) {
    // Merge a tiny trailing fragment into the previous chunk to avoid a lonely
    // "Evet." style micro-utterance.
    if (tail.length < minChars && chunks.length) {
      chunks[chunks.length - 1] = `${chunks[chunks.length - 1]} ${tail}`.trim();
    } else {
      chunks.push(tail);
    }
  }

  return chunks;
}

// Streaming variant: given an accumulated buffer (as the LLM streams tokens),
// greedily pull off every COMPLETE speech chunk and return the trailing partial
// as `rest` to keep buffering. This lets us speak the first sentence before the
// full reply exists — the core of the streaming latency win.
export function takeSpeechChunks(buffer, { minChars = 12, maxChars = 160 } = {}) {
  const chunks = [];
  let text = buffer.replace(/^\s+/, '');
  while (text) {
    const cut = firstChunkEnd(text, minChars, maxChars);
    if (cut < 0) break;
    const chunk = text.slice(0, cut + 1).trim();
    if (chunk) chunks.push(chunk);
    text = text.slice(cut + 1).replace(/^\s+/, '');
  }
  return { chunks, rest: text };
}

// Index of the end of the first complete chunk in `text`, or -1 if the buffer
// doesn't yet contain a full one (keep buffering).
function firstChunkEnd(text, minChars, maxChars) {
  let softBreakAt = -1;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const len = i + 1;
    if (SOFT_BREAK.test(char)) softBreakAt = i;
    if (SENTENCE_END.test(char) && !isAbbreviationDot(text, i, 0) && len >= minChars) return i;
    if (len >= maxChars) {
      if (softBreakAt >= minChars) return softBreakAt;
      const lastSpace = text.lastIndexOf(' ', i);
      return lastSpace >= minChars ? lastSpace : i;
    }
  }
  return -1;
}

function isAbbreviationDot(text, i, start) {
  if (text[i] !== '.') return false;
  // A number immediately before the dot ("3.") — treat as ordinal, not an end.
  if (/\d/.test(text[i - 1] || '')) return true;
  const word = text.slice(start, i).trim().split(' ').pop()?.toLowerCase();
  return word ? ABBREVIATIONS.has(word) : false;
}

function pickBreakPoint(text, start, i, softBreakAt, minChars) {
  if (softBreakAt >= start + minChars) return softBreakAt;
  const lastSpace = text.lastIndexOf(' ', i);
  if (lastSpace >= start + minChars) return lastSpace;
  return i;
}
