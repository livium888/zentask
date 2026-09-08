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
  amount?: MoneyMatch;
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
const EVENT_NAME = /\b(open (?:event|evening|day|morning|house)|webinar|workshop|seminar|screening|performance|concert|festival|fair)\b/i;

const IMPERATIVE = /^(call|email|book|pay|send|bring|return|collect|renew|confirm|reply|submit|order|buy|cancel|register|sign|upload|print|post|fill|complete|schedule|remind)\b/i;

/** A short reference a human would actually quote: order or tracking numbers. */
const REFERENCE = /\b(?:ref|order|booking|tracking|invoice|no|nr)\.?[:\s#]*([A-Z0-9][A-Z0-9\-]{5,})\b/i;

const DATE_FORMAT: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short" };
const TIME_FORMAT: Intl.DateTimeFormatOptions = { hour: "2-digit", minute: "2-digit" };

export function describeDate(match: DateMatch): string {
  const date = new Date(match.at);
  const day = date.toLocaleDateString("en-GB", DATE_FORMAT);
  if (!match.hasTime) return day;
  return `${day} ${date.toLocaleTimeString("en-GB", TIME_FORMAT)}`;
}

/**
 * The line most likely to name who this is from.
 *
 * Brands sit at the top of a receipt or letterhead and are usually the widest
 * run of capitals or title case. Lines that are mostly digits are addresses,
 * card numbers, or till codes, never the sender.
 */
function subject(lines: string[]): string | undefined {
  const candidates = lines.slice(0, 6).filter((line) => {
    const letters = line.replace(/[^a-z]/gi, "").length;
    return letters >= 4 && letters / line.length > 0.5;
  });
  const branded = candidates.find((line) => /^[A-Z0-9 &'.\-]+$/.test(line) && line.length <= 30);
  return branded ?? candidates[0];
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

const parcel: Recipe = ({ lines, text, due }) => {
  if (!PARCEL.test(text)) return undefined;
  const ref = reference(text);
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

const event: Recipe = ({ text, due }) => {
  if (!EVENT_TRIGGER.test(text) || !due) return undefined;
  const named = text.match(EVENT_NAME)?.[0];
  const what = named ? titleCase(named) : "Event";
  return {
    title: tidyTitle(`${what} — ${describeDate(due)}`),
    dueAt: due.at,
    // Without a time this is a date someone printed, not a plan.
    confidence: due.hasTime ? "high" : "low",
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
