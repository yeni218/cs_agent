// Normalizes LLM text for speech synthesis. LLMs (especially smaller local
// models) love markdown — headings, **bold**, bullet lists, `code` — which a TTS
// engine would read as literal symbols ("yıldız yıldız"). This strips formatting
// down to plain spoken prose before it reaches the TTS. Voice-only; the visible
// transcript can still show the original.
export function normalizeForSpeech(text) {
  if (!text) return '';
  let out = text;

  out = out.replace(/```[\s\S]*?```/g, ' ');   // fenced code blocks
  out = out.replace(/`([^`]+)`/g, '$1');         // inline code
  out = out.replace(/!?\[([^\]]+)\]\([^)]+\)/g, '$1'); // links/images -> label
  out = out.replace(/^\s{0,3}#{1,6}\s*/gm, '');  // headings
  out = out.replace(/(\*\*|__)(.*?)\1/g, '$2');  // bold
  out = out.replace(/(\*|_)(.*?)\1/g, '$2');     // italic
  out = out.replace(/^\s*[-*•>]\s+/gm, '');      // bullet / quote markers
  out = out.replace(/^\s*\d+[.)]\s+/gm, '');     // numbered list markers
  out = out.replace(/[*_#`>|~]/g, '');           // stray markdown symbols
  out = out.replace(/[ \t]+/g, ' ');             // collapse spaces
  out = out.replace(/\s*\n\s*/g, '. ');          // line breaks -> sentence gaps
  out = out.replace(/\.\s*\.\s*(\.\s*)+/g, '. '); // dedupe runaway dots
  out = out.replace(/\s+([,.!?;:])/g, '$1');     // no space before punctuation

  return out.trim();
}
