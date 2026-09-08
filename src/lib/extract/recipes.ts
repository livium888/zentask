/**
 * Turning recognised facts into one line a person can act on.
 *
 * Each recipe answers a narrow question — "is this a bill?", "is this an
 * appointment card?" — and the first one that is confident wins. Order
 * matters: an appointment letter often also carries a price, and the
 * appointment is the thing you need to remember.
 *
 * A recipe that is not sure returns nothing rather than guessing. The
 * fallback then hands the user the most promising line to edit, which is a
 * far better failure than a confidently wrong task.
 */

import type { Confidence } from "@/types";
import type { DateMatch } from "./dates";
import type { MoneyMatch } from "./money";
import { tidyTitle } from "./text";

export type RecipeInput = {
  lines: string[];
  text: string;
  due?: DateMatch;
  /** The best date carrying a time of day. An event has one; a deadline often does not. */
  timedDue?: DateMatch;
  amount?: MoneyMatch;
  /** Tracking and reference numbers the entity extractor recognised. */
  references?: string[];
  now: Date;
};

export type RecipeResult = {
  title: string;
  dueAt?: number;
  confidence: Confidence;
  /** Which recipe fired, for debugging and for the "why?" affordance. */
  recipe: string;
};

type Recipe = (input: RecipeInput) => RecipeResult | undefined;

const APPOINTMENT = /\b(appointment|appt|booking|reservation|consultation|check-?up|interview|viewing|surgery|clinic)\b/i;
const BILL = /\b(invoice|bill|amount due|balance due|total due|payment due|outstanding|statement|subscription renews)\b/i;
const PARCEL = /\b(parcel|package|delivery|collect|collection|tracking|awaiting collection|ready for pickup|locker)\b/i;
const EXPIRY = /\b(expires?|expiry|valid until|renew|renewal|mot|insurance|licence|license|passport|warranty)\b/i;
/**
 * Something happening on a date you might want to be at.
 *
 * Split in two on purpose. The trigger is broad enough to recognise a flyer or
 * an invitation; the name is narrow, and supplies the words for the task, so a
 * poster does not end up titled with whatever marketing line came first.
 */
const EVENT_TRIGGER = /\b(open (event|evening|day|morning|house)|save the date|come and explore|you'?re invited|invitation|webinar|workshop|seminar|screening|performance|concert|festival|fair|kick-?off|deadline for entries)\b/i;
// "Save the date" and "you're invited" are banners: they say an event exists
// without naming it, so they trigger the recipe but never supply the title.
const EVENT_NAME = /\b(open (?:event|evening|day|morning|house)|party|webinar|workshop|seminar|screening|performance|concert|festival|fair)\b/i;

const IMPERATIVE = /^(call|email|book|pay|send|bring|return|collect|renew|confirm|reply|submit|order|buy|cancel|register|sign|upload|print|post|fill|complete|schedule|remind)\b/i;

/** A short reference a human would actually quote: order or tracking numbers. */
const REFERENCE = /\b(?:ref|order|booking|tracking|invoice|no|nr)\.?[:\s#]*([A-Z0-9][A-Z0-9\-]{5,})\b/i;

const DATE_FORMAT: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short" };
const TIME_FORMAT: Intl.DateTimeFormatOptions = { hour: "2-digit", minute: "2-digit" };

export function describeDate(match: DateMatch): string {
  const date = new Date(match.at);
  const day = date.toLocaleDateString("en-GB", DATE_FORMAT).replace(",", "");
  if (!match.hasTime) return day;
  return `${day} ${date.toLocaleTimeString("en-GB", TIME_FORMAT)}`;
}

/** Words that end an organisation's name, and mark where it stops. */
const INSTITUTION =
  "school|academy|college|university|nursery|clinic|surgery|dental|dentist|practice|" +
  "hospital|pharmacy|opticians|vets|veterinary|centre|center|church|chapel|trust|" +
  "society|club|gym|studio|salon|garage|insurance|bank|council|library|museum|" +
  "theatre|gallery|ltd|limited|plc|llp";

const INSTITUTION_WORD = new RegExp(`\\b(?:${INSTITUTION})\\b`, "i");
const NAME_UP_TO_INSTITUTION = new RegExp(`^(.*?\\b(?:${INSTITUTION}))\\b`, "i");

/** Words that announce something rather than name anyone. */
const NOT_A_NAME = /^(open|save|the|a|welcome|new|our|your|next|come|join|free|book|now|today|hello|hi|from|to|invited)$/i;

/**
 * Lines that are pure announcement, and name nobody.
 *
 * An invitation opens "You're invited to" — three words, near the top, in the
 * shape a name usually takes, and it identifies nothing. Without this the
 * banner outscores the actual name printed underneath it.
 */
const BANNER = /^(you'?re invited( to)?|save the date|invitation|rsvp|please rsvp|date|time|location|venue|where|when|address)[:!.]?$/i;

/**
 * A line that is really a date, not a name.
 *
 * "BY 14TH AUGUST" has the shape the scorer likes — a few words, printed in
 * capitals — and identifies nobody. So does "06.09.2026".
 */
const DATE_LINE = /^(by|due|before|on|from|until)\b|\b(january|february|march|april|june|july|august|september|october|november|december|jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)\b|\d{1,2}[./-]\d{1,2}/i;

const PRINTED_IN_CAPS = /^[A-Z0-9 &'’.\-]+$/;

/** A name is rarely longer than this; anything more is a sentence. */
const MAX_NAME_WORDS = 5;

/**
 * Trim a line down to the name it contains.
 *
 * "OPEN THEKING'S SCHOOL WISDOM STATURE FAVOUR" is a poster headline with a
 * school's name buried in it. Cutting at the institution word and dropping the
 * words that announce an event leaves the part that identifies anyone.
 */
function cleanName(line: string): string | undefined {
  const upToInstitution = line.match(NAME_UP_TO_INSTITUTION)?.[1] ?? line;
  let words = upToInstitution.trim().split(/\s+/);
  while (words.length > 1 && NOT_A_NAME.test(words[0] ?? "")) words = words.slice(1);
  // The words nearest the institution word are the name; anything before is
  // whatever the line was saying beforehand.
  if (words.length > MAX_NAME_WORDS) words = words.slice(-MAX_NAME_WORDS);
  const name = words.join(" ").replace(/[.,;:]+$/, "");
  return name.length >= 3 ? name : undefined;
}

/**
 * How likely a line is to name who a capture is from.
 *
 * An earlier version took the first short line printed in capitals, which on a
 * poster is a fragment — it picked "EVENING" out of a school's open evening —
 * and only ever looked at the top of the page, where a screenshot has an app's
 * interface rather than a letterhead.
 */
function scoreName(line: string, index: number): number {
  const words = line.trim().split(/\s+/).length;
  let score = 0;
  if (INSTITUTION_WORD.test(line)) score += 10;
  if (words >= 2 && words <= 5) score += 3;
  if (words === 1) score -= 2;
  if (index < 6) score += 2; // a letterhead sits at the top
  if (PRINTED_IN_CAPS.test(line)) score += 1;
  if (line.length > 45) score -= 3;
  return score;
}

function subject(lines: string[]): string | undefined {
  let best: { name: string; score: number } | undefined;

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (BANNER.test(trimmed) || DATE_LINE.test(trimmed)) return;
    const letters = line.replace(/[^a-z]/gi, "").length;
    if (letters < 4 || letters / line.length <= 0.5) return;
    const name = cleanName(line);
    if (!name) return;
    const score = scoreName(line, index);
    if (!best || score > best.score) best = { name, score };
  });

  return best?.name;
}

function reference(text: string): string | undefined {
  const m = text.match(REFERENCE);
  return m?.[1];
}

const appointment: Recipe = ({ lines, text, due }) => {
  if (!APPOINTMENT.test(text) || !due) return undefined;
  const who = subject(lines);
  const when = describeDate(due);
  const title = who ? `${who} appointment — ${when}` : `Appointment — ${when}`;
  // An appointment with no time is a date someone typed loosely; still useful,
  // but not something to claim high confidence about.
  return { title: tidyTitle(title), dueAt: due.at, confidence: due.hasTime ? "high" : "low", recipe: "appointment" };
};

const bill: Recipe = ({ lines, text, due, amount }) => {
  if (!BILL.test(text) || !amount) return undefined;
  const who = subject(lines);
  const title = who ? `Pay ${amount.label} — ${who}` : `Pay ${amount.label}`;
  return { title: tidyTitle(title), dueAt: due?.at, confidence: "high", recipe: "bill" };
};

const parcel: Recipe = ({ lines, text, due, references }) => {
  if (!PARCEL.test(text)) return undefined;
  // A tracking number the model recognised is a fact; the regex is a guess.
  const ref = references?.[0] ?? reference(text);
  const who = subject(lines);
  const what = ref ? `parcel ${ref}` : "parcel";
  const title = who ? `Collect ${what} — ${who}` : `Collect ${what}`;
  return { title: tidyTitle(title), dueAt: due?.at, confidence: ref ? "high" : "low", recipe: "parcel" };
};

const expiry: Recipe = ({ lines, text, due }) => {
  if (!EXPIRY.test(text) || !due) return undefined;
  const who = subject(lines);
  const title = who ? `Renew ${who} before ${describeDate(due)}` : `Renew before ${describeDate(due)}`;
  return { title: tidyTitle(title), dueAt: due.at, confidence: "high", recipe: "expiry" };
};

function titleCase(phrase: string): string {
  return phrase
    .toLowerCase()
    .split(" ")
    .map((word) => (word ? word[0]!.toUpperCase() + word.slice(1) : word))
    .join(" ");
}

const event: Recipe = ({ lines, text, due, timedDue }) => {
  if (!EVENT_TRIGGER.test(text)) return undefined;
  // An event happens at a time. A deadline mentioned alongside it — "RSVP by
  // the 14th" — reads as the stronger signal to the general ranking, but the
  // thing being invited to is the one with a clock on it.
  const when = timedDue ?? due;
  if (!when) return undefined;
  const named = text.match(EVENT_NAME)?.[0];
  const what = named ? titleCase(named) : "Event";
  // "Open Event" on its own says nothing: whose open event, and where? The
  // sender is the detail that makes the task answerable.
  const who = subject(lines);
  return {
    title: tidyTitle(who ? `${what} — ${who}, ${describeDate(when)}` : `${what} — ${describeDate(when)}`),
    dueAt: when.at,
    // Without a time this is a date someone printed, not a plan.
    confidence: when.hasTime ? "high" : "low",
    recipe: "event",
  };
};

/** Someone has already written the task down; we just have to notice. */
const actionLine: Recipe = ({ lines, due }) => {
  const line = lines.find((candidate) => IMPERATIVE.test(candidate));
  if (!line) return undefined;
  return { title: tidyTitle(line), dueAt: due?.at, confidence: "high", recipe: "action-line" };
};

/** Nothing matched. Offer the most substantial line and admit we are unsure. */
const fallback: Recipe = ({ lines, due }) => {
  const best = [...lines].sort((a, b) => b.length - a.length)[0];
  if (!best) return undefined;
  return { title: tidyTitle(best), dueAt: due?.at, confidence: "low", recipe: "fallback" };
};

export const RECIPES: Recipe[] = [appointment, bill, expiry, event, parcel, actionLine, fallback];
