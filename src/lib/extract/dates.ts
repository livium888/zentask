/**
 * Finding dates and times in OCR text, without a model.
 *
 * Two decisions worth knowing about:
 *
 * 1. Ambiguous numeric dates (03/04) are read day-first by default. There is
 *    no way to be right for everyone; day-first is correct for most of the
 *    world and `dayFirst: false` flips it for US captures.
 * 2. A date with no year resolves to the next occurrence from `now`, not to
 *    the current year. A receipt photographed on 30 December that says
 *    "due 5 Jan" means next year, and the opposite reading is always wrong.
 */

export type DateMatch = {
  /** Epoch ms. Midnight local time unless a time was found alongside. */
  at: number;
  hasTime: boolean;
  raw: string;
  index: number;
};

export type DateOptions = {
  now?: Date;
  /** Read 03/04 as 3 April (true) or March 4 (false). */
  dayFirst?: boolean;
};

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11,
};

const WEEKDAYS: Record<string, number> = {
  sun: 0, mon: 1, tue: 2, tues: 2, wed: 3, thu: 4, thur: 4, thurs: 4, fri: 5, sat: 6,
};

// Whole words only, longest alternative first.
//
// An earlier version matched a three-letter stem followed by any letters,
// which read "SUNNYSIDE CAFE" as Sunday and "Decision" as December. A wrong
// date on a task is worse than no date, so a month or weekday now has to be
// a complete word.
const MONTH_WORD =
  "january|february|march|april|june|july|august|september|october|november|december" +
  "|sept|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec";
const WEEKDAY_WORD =
  "sunday|monday|tuesday|wednesday|thursday|friday|saturday" +
  "|thurs|tues|thur|sun|mon|tue|wed|thu|fri|sat";

/** How far past a bare date may sit before we assume it means next year. */
const PAST_TOLERANCE_DAYS = 3;

function monthIndex(word: string): number | undefined {
  return MONTHS[word.slice(0, 4).toLowerCase()] ?? MONTHS[word.slice(0, 3).toLowerCase()];
}

function clampYear(year: number): number {
  if (year >= 1000) return year;
  return year >= 70 ? 1900 + year : 2000 + year;
}

/** Pick the year that makes a bare day/month land nearest ahead of `now`. */
function inferYear(month: number, day: number, now: Date): number {
  const thisYear = new Date(now.getFullYear(), month, day).getTime();
  const tolerance = PAST_TOLERANCE_DAYS * 86_400_000;
  if (thisYear >= now.getTime() - tolerance) return now.getFullYear();
  return now.getFullYear() + 1;
}

function isRealDate(year: number, month: number, day: number): boolean {
  const d = new Date(year, month, day);
  return d.getFullYear() === year && d.getMonth() === month && d.getDate() === day;
}

/** All times in the text, as minutes past midnight, with their positions. */
function findTimes(text: string): Array<{ minutes: number; index: number; raw: string }> {
  const found: Array<{ minutes: number; index: number; raw: string }> = [];
  const withMinutes = /\b(\d{1,2})[:.](\d{2})\s*(am|pm)?\b/gi;
  const hourOnly = /\b(\d{1,2})\s*(am|pm)\b/gi;

  for (const m of text.matchAll(withMinutes)) {
    const rawHour = m[1];
    const rawMinute = m[2];
    if (rawHour === undefined || rawMinute === undefined) continue;
    let hour = Number(rawHour);
    const minute = Number(rawMinute);
    const meridiem = m[3]?.toLowerCase();
    if (hour > 23 || minute > 59) continue;
    if (meridiem === "pm" && hour < 12) hour += 12;
    if (meridiem === "am" && hour === 12) hour = 0;
    found.push({ minutes: hour * 60 + minute, index: m.index, raw: m[0] });
  }

  for (const m of text.matchAll(hourOnly)) {
    const rawHour = m[1];
    const meridiem = m[2];
    if (rawHour === undefined || meridiem === undefined) continue;
    let hour = Number(rawHour);
    if (hour > 12) continue;
    if (meridiem.toLowerCase() === "pm" && hour < 12) hour += 12;
    if (meridiem.toLowerCase() === "am" && hour === 12) hour = 0;
    if (found.some((t) => Math.abs(t.index - m.index) < 3)) continue;
    found.push({ minutes: hour * 60, index: m.index, raw: m[0] });
  }

  return found.sort((a, b) => a.index - b.index);
}

/** The nearest time to a date mention, if one sits close enough to belong to it. */
const TIME_PROXIMITY_CHARS = 40;

function attachTime(
  times: Array<{ minutes: number; index: number }>,
  dateIndex: number,
  dateLength: number,
): number | undefined {
  let best: { minutes: number; distance: number } | undefined;
  for (const time of times) {
    const distance =
      time.index >= dateIndex
        ? time.index - (dateIndex + dateLength)
        : dateIndex - time.index;
    if (distance > TIME_PROXIMITY_CHARS) continue;
    if (!best || distance < best.distance) best = { minutes: time.minutes, distance };
  }
  return best?.minutes;
}

export function findDates(text: string, options: DateOptions = {}): DateMatch[] {
  const now = options.now ?? new Date();
  const dayFirst = options.dayFirst ?? true;
  const times = findTimes(text);
  const out: DateMatch[] = [];

  const push = (year: number, month: number, day: number, index: number, raw: string) => {
    if (!isRealDate(year, month, day)) return;
    const minutes = attachTime(times, index, raw.length);
    const at = new Date(year, month, day, 0, minutes ?? 0).getTime();
    out.push({ at, hasTime: minutes !== undefined, raw, index });
  };

  // 2026-09-12
  for (const m of text.matchAll(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/g)) {
    const [y, mo, d] = [m[1], m[2], m[3]];
    if (!y || !mo || !d) continue;
    push(Number(y), Number(mo) - 1, Number(d), m.index, m[0]);
  }

  // 12/09/2026, 12.09.26, 12-09
  for (const m of text.matchAll(/\b(\d{1,2})[\/.\-](\d{1,2})(?:[\/.\-](\d{2,4}))?\b/g)) {
    const [a, b, y] = [m[1], m[2], m[3]];
    if (!a || !b) continue;
    const first = Number(a);
    const second = Number(b);
    // One component over 12 settles the order regardless of locale.
    const dayIsFirst = second > 12 ? false : first > 12 ? true : dayFirst;
    const day = dayIsFirst ? first : second;
    const month = (dayIsFirst ? second : first) - 1;
    const year = y ? clampYear(Number(y)) : inferYear(month, day, now);
    push(year, month, day, m.index, m[0]);
  }

  // 12 September 2026 / 12 Sept
  const dayMonth = new RegExp(
    `\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(${MONTH_WORD})\\b\\.?(?:,?\\s*(\\d{4}))?`,
    "gi",
  );
  for (const m of text.matchAll(dayMonth)) {
    const [d, mo, y] = [m[1], m[2], m[3]];
    if (!d || !mo) continue;
    const month = monthIndex(mo);
    if (month === undefined) continue;
    const day = Number(d);
    push(y ? Number(y) : inferYear(month, day, now), month, day, m.index, m[0]);
  }

  // September 12, 2026 / Sep 12
  const monthDay = new RegExp(
    `\\b(${MONTH_WORD})\\b\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s*(\\d{4}))?\\b`,
    "gi",
  );
  for (const m of text.matchAll(monthDay)) {
    const [mo, d, y] = [m[1], m[2], m[3]];
    if (!mo || !d) continue;
    const month = monthIndex(mo);
    if (month === undefined) continue;
    const day = Number(d);
    if (out.some((hit) => Math.abs(hit.index - m.index) < 4)) continue;
    push(y ? Number(y) : inferYear(month, day, now), month, day, m.index, m[0]);
  }

  // today / tomorrow / tonight
  for (const m of text.matchAll(/\b(today|tonight|tomorrow)\b/gi)) {
    const word = m[1]?.toLowerCase();
    if (!word) continue;
    const target = new Date(now);
    if (word === "tomorrow") target.setDate(target.getDate() + 1);
    push(target.getFullYear(), target.getMonth(), target.getDate(), m.index, m[0]);
  }

  // Monday / next Tuesday
  const weekday = new RegExp(`\\b(next\\s+)?(${WEEKDAY_WORD})\\b`, "gi");
  for (const m of text.matchAll(weekday)) {
    const word = m[2]?.slice(0, 3).toLowerCase();
    if (!word) continue;
    const target = WEEKDAYS[word];
    if (target === undefined) continue;
    const base = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    let delta = (target - base.getDay() + 7) % 7;
    if (delta === 0) delta = 7; // "Monday" said on a Monday means the next one
    // "next Monday" is treated as the same upcoming Monday. English speakers
    // disagree about whether it means this week's or the following week's, so
    // the nearer reading is the one that cannot strand a task in the past.
    base.setDate(base.getDate() + delta);
    push(base.getFullYear(), base.getMonth(), base.getDate(), m.index, m[0]);
  }

  return out.sort((a, b) => a.index - b.index);
}

/**
 * The single date a task should carry.
 *
 * Deadlines beat mentions: a phrase like "due"/"by"/"before" immediately
 * around a date is a far stronger signal than position in the text, which on
 * a receipt is usually just the print date at the top.
 */
const DEADLINE_CUE = /\b(due|by|before|deadline|expires?|pay by|return by|valid until|no later than)\b/i;
const CUE_WINDOW = 30;

export function pickDueDate(text: string, options: DateOptions = {}): DateMatch | undefined {
  const now = options.now ?? new Date();
  const matches = findDates(text, options);
  if (matches.length === 0) return undefined;

  const future = matches.filter((m) => m.at >= now.getTime() - 86_400_000);
  const pool = future.length > 0 ? future : matches;

  const cued = pool.filter((m) => {
    const before = text.slice(Math.max(0, m.index - CUE_WINDOW), m.index);
    return DEADLINE_CUE.test(before);
  });
  if (cued.length > 0) return cued[0];

  const timed = pool.filter((m) => m.hasTime);
  return timed[0] ?? pool[0];
}
