/**
 * OCR text in, one proposed task out.
 *
 * This is the always-on path: no network, no model download, no waiting. It
 * gets the common captures right — a bill, an appointment card, a parcel slip,
 * a note someone wrote themselves — and when it cannot, it says so with
 * `confidence: "low"` and hands the user something to edit instead of a
 * confident invention. An optional cloud pass can take over from there, but
 * the app is fully usable without it.
 */

import type { Confidence } from "@/types";
import { pickDueDate, pickTimedDate, type DateOptions } from "./dates";
import { pickAmount, type MoneyMatch } from "./money";
import { RECIPES } from "./recipes";
import { looksLikeConversation, toLines } from "./text";

export type Extraction = {
  title: string;
  dueAt?: number;
  confidence: Confidence;
  recipe: string;
};

export type ExtractOptions = DateOptions & {
  /** Amounts found by the on-device entity extractor. */
  extraMoney?: MoneyMatch[];
  /** Tracking and reference numbers it recognised. */
  extraReferences?: string[];
};

export function extractTask(raw: string, options: ExtractOptions = {}): Extraction | undefined {
  // A conversation has no task in it that any rule can find; saying so is
  // better than handing back whichever line happened to be longest.
  if (looksLikeConversation(raw)) return undefined;

  const lines = toLines(raw);
  if (lines.length === 0) return undefined;

  const text = lines.join("\n");
  const now = options.now ?? new Date();
  const input = {
    lines,
    text,
    due: pickDueDate(text, { ...options, now }),
    timedDue: pickTimedDate(text, { ...options, now }),
    amount: pickAmount(text, options.extraMoney),
    references: options.extraReferences,
    now,
  };

  for (const recipe of RECIPES) {
    const result = recipe(input);
    if (result) return result;
  }
  return undefined;
}

export { findDates, pickDueDate } from "./dates";
export { findMoney, pickAmount, formatAmount, type MoneyMatch } from "./money";
export { mergeDates, type DateMatch } from "./dates";
export { toLines, tidyTitle, dropRepeatedPrefix, looksLikeConversation } from "./text";
