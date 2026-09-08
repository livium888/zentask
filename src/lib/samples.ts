import type { PendingReview, Sample, SampleVerdict } from "@/types";
import { newId } from "./db/types";

/**
 * Keeping the captures that have something to teach.
 *
 * The point is not to record everything. A capture the app got right and you
 * accepted unchanged is already covered by the tests; logging it would bury
 * the interesting cases. What is worth keeping is the residue:
 *
 *   - anything the app was unsure about
 *   - anything you corrected — your edit is the right answer, captured for
 *     free at the exact moment you knew it
 *   - anything you threw away, which says the proposal was wrong enough not
 *     to be worth fixing
 *
 * Nothing is sent anywhere. Exporting is a deliberate act.
 */

const ENABLED_KEY = "zentask.samples.enabled";

export function isCollectingSamples(): boolean {
  try {
    return window.localStorage.getItem(ENABLED_KEY) !== "off";
  } catch {
    return true;
  }
}

export function setCollectingSamples(on: boolean): void {
  try {
    window.localStorage.setItem(ENABLED_KEY, on ? "on" : "off");
  } catch {
    // A browser refusing storage is not worth failing a capture over.
  }
}

/**
 * Whether this outcome is worth keeping, and under what verdict.
 *
 * Returns nothing for the uninteresting case: confident, accepted verbatim.
 */
export function verdictFor(
  review: PendingReview,
  outcome: "kept" | "dismissed",
  finalText?: string,
): SampleVerdict | undefined {
  if (outcome === "dismissed") return "dismissed";
  if (finalText !== undefined && finalText.trim() !== review.proposedText.trim()) return "edited";
  if (review.confidence === "low") return "unsure";
  return undefined;
}

export function sampleFrom(
  review: PendingReview,
  verdict: SampleVerdict,
  finalText?: string,
): Sample {
  return {
    id: newId(),
    capturedAt: review.capturedAt,
    source: review.source,
    rawText: review.rawText,
    proposedText: review.proposedText,
    proposedDueAt: review.proposedDueAt,
    confidence: review.confidence,
    recipe: review.recipe,
    verdict,
    finalText: verdict === "edited" ? finalText : undefined,
  };
}

/** Separator between cases in an export. Also understood by scripts/import-samples.ts. */
export const CASE_SEPARATOR = "=== case ===";

function isoDate(at?: number): string {
  if (at === undefined) return "none";
  const date = new Date(at);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function localTimestamp(at: number): string {
  const date = new Date(at);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

const VERDICT_NOTE: Record<SampleVerdict, string> = {
  edited: "You corrected this. The correction below is the answer it should have given.",
  dismissed: "You threw this away, so the proposal was wrong enough not to be worth fixing.",
  unsure: "The app said it was unsure. What should it have produced?",
};

/**
 * One sample as a fixture file.
 *
 * A correction is written straight into `expect-title-contains`, so an edited
 * capture arrives already labelled and needs no further work.
 */
export function asFixture(sample: Sample): string {
  const corrected = sample.verdict === "edited" ? sample.finalText?.trim() : undefined;
  return [
    `# name: ${sample.source} capture, ${sample.verdict}`,
    `# now: ${localTimestamp(sample.capturedAt)}`,
    "# status: pending",
    "# expect-recipe: ",
    `# expect-title-contains: ${corrected ?? ""}`,
    "# expect-due: ",
    "#",
    `# ${VERDICT_NOTE[sample.verdict]}`,
    `# observed: recipe=${sample.recipe ?? "-"} confidence=${sample.confidence}` +
      ` due=${isoDate(sample.proposedDueAt)} title="${sample.proposedText}"`,
    "---",
    sample.rawText,
  ].join("\n");
}

/** Every kept sample as one file, for scripts/import-samples.ts to split up. */
export function asBulkExport(samples: Sample[]): string {
  if (samples.length === 0) return "";
  const header = [
    `# ZenTask capture log — ${samples.length} case${samples.length === 1 ? "" : "s"}`,
    `# Exported ${localTimestamp(Date.now())}`,
    "# Split into fixtures with: bun scripts/import-samples.ts <this file>",
    "",
  ].join("\n");
  return header + samples.map(asFixture).join(`\n\n${CASE_SEPARATOR}\n\n`) + "\n";
}
