/**
 * Turning an OCR blob into lines worth reading.
 *
 * ML Kit returns text roughly in reading order, but a photographed receipt or
 * appointment card also carries barcodes, till codes, and single-glyph noise.
 * Anything we cannot read is worse than useless — it outranks the real line in
 * a naive "first line wins" heuristic — so it is dropped before scoring.
 */

/** Lines shorter than this are almost always OCR debris, not content. */
const MIN_USEFUL_LENGTH = 3;

const NOISE = [
  /^[^a-z0-9]+$/i, // punctuation or box-drawing only
  /^[0-9\s.\-|]{8,}$/, // barcode / long digit runs with no words
  /^[A-Z]{1,2}$/, // a stray initial
  /^\d{1,4}$/, // a like count, a page number, an icon badge
];

/**
 * Interface furniture from a screenshot.
 *
 * Screenshots are a main way in, and what surrounds the content is not
 * content: the phone's own status bar carries a clock that will be mistaken
 * for an event time, and an app's buttons and timestamps outrank the real
 * words when the longest line wins.
 */
const CHROME = [
  /^(posts?|save|saved|share|like[ds]?|comments?|repl(y|ies)|follow(ing)?|message|send|explore|reels?|stor(y|ies)|more|see more|view all comments|log ?in|sign ?up|subscribe|menu|search|home|back|cancel|done|settings)$/i,
  /^\d+\s+(second|minute|hour|day|week|month|year)s?\s+ago$/i,
  /^(view|see)\s+(all|more)\b/i,
];

/**
 * The phone's status bar, which only ever appears as the first line.
 *
 * Matched narrowly — a clock plus the residue of battery and signal glyphs —
 * because a real first line that happens to start with a time is worth
 * keeping, and only this shape is reliably furniture.
 */
const STATUS_BAR = /^\d{1,2}:\d{2}\b.*[°%)]/;

export function toLines(raw: string): string[] {
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line.length >= MIN_USEFUL_LENGTH)
    .filter((line) => !NOISE.some((pattern) => pattern.test(line)))
    .filter((line) => !CHROME.some((pattern) => pattern.test(line)));

  const first = lines[0];
  return first !== undefined && STATUS_BAR.test(first) ? lines.slice(1) : lines;
}

/** Collapse to a single searchable string while keeping line breaks meaningful. */
export function normalize(raw: string): string {
  return toLines(raw).join("\n");
}

/** Trim a proposed title to something a person reads in one glance. */
export function tidyTitle(text: string, maxWords = 12): string {
  const words = text
    .replace(/\s+/g, " ")
    .replace(/^[^\w£$€]+/, "")
    .replace(/[.,;:]+$/, "")
    .trim()
    .split(" ");
  if (words.length <= maxWords) return words.join(" ");
  return words.slice(0, maxWords).join(" ") + "…";
}
