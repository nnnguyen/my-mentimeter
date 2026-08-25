const MAX_LENGTH = 40;
const DISALLOWED_CHARS_REGEX = /[^\p{L}\p{N}\s]/gu;

function collapseAndTrim(input: string): string {
  return input.trim().replace(/\s+/g, ' ');
}

function sanitize(raw: string, { lowercase }: { lowercase: boolean }): string {
  if (typeof raw !== 'string') {
    return '';
  }
  let text = raw.normalize('NFC');
  text = collapseAndTrim(text);
  if (lowercase) {
    text = text.toLowerCase();
  }
  text = text.replace(DISALLOWED_CHARS_REGEX, '');
  text = collapseAndTrim(text);
  return text.slice(0, MAX_LENGTH).trim();
}

/**
 * Normalizes a word-cloud submission for deduplication: trims/collapses
 * whitespace, lowercases, strips punctuation/HTML-unsafe characters (keeping
 * Vietnamese diacritics), and caps length at 40 chars. Returns '' if nothing
 * meaningful remains.
 */
export function normalizeWord(raw: string): string {
  return sanitize(raw, { lowercase: true });
}

/**
 * Same sanitization as normalizeWord but preserves the original casing —
 * used for the text actually rendered in the word cloud.
 */
export function sanitizeDisplayText(raw: string): string {
  return sanitize(raw, { lowercase: false });
}
