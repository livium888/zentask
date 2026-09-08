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

/** A date standing alone on its own line, which posters and forms do constantly. */
const BARE_DATE = /^\d{1,4}[./-]\d{1,2}(?:[./-]\d{2,4})?$/;

const NOISE = [
  /^[^a-z0-9]+$/i, // punctuation or box-drawing only
  /^[0-9\s\-|]{8,}$/, // barcode / long digit runs with no words
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
  // A message timestamp, sometimes with a delivery tick read as letters.
  /^\d{1,2}:\d{2}\s*[A-Za-z!✓)]{0,3}$/,
];

/** How many bare timestamps make a screenshot a conversation rather than a document. */
const CONVERSATION_TIMESTAMPS = 3;

const TIMESTAMP_LINE = /^\d{1,2}:\d{2}\s*[A-Za-z!✓)]{0,3}$/;

/**
 * Whether this looks like a message thread.
 *
 * A chat screenshot is a run of messages stamped with times, and there is no
 * rule that turns a conversation into a task — the thing to do is buried in
 * who said what to whom. Recognising the shape and declining is honest;
 * offering the longest line is not, and produces exactly the kind of nonsense
 * that makes someone stop trusting the app.
 *
 * Counted before the chrome filter removes them, which is why this takes the
 * raw text rather than the cleaned lines.
 */
export function looksLikeConversation(raw: string): boolean {
  const stamps = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => TIMESTAMP_LINE.test(line));
  return stamps.length >= CONVERSATION_TIMESTAMPS;
}

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
    .filter((line) => BARE_DATE.test(line) || !NOISE.some((pattern) => pattern.test(line)))
    .filter((line) => !CHROME.some((pattern) => pattern.test(line)));

  const first = lines[0];
  return first !== undefined && STATUS_BAR.test(first) ? lines.slice(1) : lines;
}

/** Collapse to a single searchable string while keeping line breaks meaningful. */
export function normalize(raw: string): string {
  return toLines(raw).join("\n");
}

/** Words that carry no identity, so a repeat of them is not a repeat. */
const FILLER = /^(the|of|a|an|and|for)$/i;

function normalise(word: string): string {
  return word.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Drop a leading fragment that the rest of the line already says.
 *
 * OCR reads a logo and then the title beneath it, so a product ends up called
 * "THE LEGEND ZELDA The Legend of Zelda 40th Anniversary Edition". The first
 * fragment is not extra information — it is the same words again, badly.
 */
export function dropRepeatedPrefix(text: string): string {
  const words = text.split(/\s+/).filter(Boolean);
  const meaningful = words.map(normalise).map((w, i) => ({ w, i })).filter(({ w }) => w && !FILLER.test(w));

  for (let take = Math.floor(meaningful.length / 2); take >= 2; take--) {
    const head = meaningful.slice(0, take).map((m) => m.w);
    const tail = meaningful.slice(take).map((m) => m.w);
    let cursor = 0;
    for (const word of head) {
      const found = tail.indexOf(word, cursor);
      if (found === -1) {
        cursor = -1;
        break;
      }
      cursor = found + 1;
    }
    if (cursor !== -1) {
      // Cut immediately after the repeated fragment, not at the next word that
      // carries meaning — otherwise the real title loses its leading "The".
      const lastOfPrefix = meaningful[take - 1]?.i;
      if (lastOfPrefix !== undefined) return words.slice(lastOfPrefix + 1).join(" ");
    }
  }
  return text;
}

/** Trim a proposed title to something a person reads in one glance. */
export function tidyTitle(text: string, maxWords = 12): string {
  const words = dropRepeatedPrefix(text)
    .replace(/\s+/g, " ")
    .replace(/^[^\w£$€]+/, "")
    .replace(/[.,;:]+$/, "")
    .trim()
    .split(" ");
  if (words.length <= maxWords) return words.join(" ");
  return words.slice(0, maxWords).join(" ") + "…";
}
