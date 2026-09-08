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
];

export function toLines(raw: string): string[] {
  return raw
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line.length >= MIN_USEFUL_LENGTH)
    .filter((line) => !NOISE.some((pattern) => pattern.test(line)));
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
