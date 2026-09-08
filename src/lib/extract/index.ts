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
import { pickDueDate, type DateOptions } from "./dates";
import { pickAmount } from "./money";
import { RECIPES } from "./recipes";
import { toLines } from "./text";

export type Extraction = {
  title: string;
  dueAt?: number;
  confidence: Confidence;
  recipe: string;
};

export function extractTask(raw: string, options: DateOptions = {}): Extraction | undefined {
  const lines = toLines(raw);
  if (lines.length === 0) return undefined;

  const text = lines.join("\n");
  const now = options.now ?? new Date();
  const input = {
    lines,
    text,
    due: pickDueDate(text, { ...options, now }),
    amount: pickAmount(text),
    now,
  };

  for (const recipe of RECIPES) {
    const result = recipe(input);
    if (result) return result;
  }
  return undefined;
}

export { findDates, pickDueDate } from "./dates";
export { findMoney, pickAmount } from "./money";
export { toLines, tidyTitle } from "./text";
