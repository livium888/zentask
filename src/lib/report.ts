import { Share } from "@capacitor/share";
import type { PendingReview } from "@/types";

/**
 * Getting a bad capture off the phone and into the corpus.
 *
 * The extraction rules were written against invented text, so the only way to
 * find out where they actually break is to see what a real phone read from a
 * real receipt. This formats a capture as a fixture file that can be dropped
 * straight into fixtures/ — the expectations are left blank for a person to
 * fill in, and what the app actually produced is recorded as a comment so the
 * failure is visible without re-running anything.
 */

function localTimestamp(at: number): string {
  const date = new Date(at);
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

function isoDate(at?: number): string {
  if (at === undefined) return "none";
  const date = new Date(at);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function asFixture(review: PendingReview): string {
  return [
    "# name: ",
    `# now: ${localTimestamp(review.capturedAt)}`,
    "# status: pending",
    "# expect-recipe: ",
    "# expect-title-contains: ",
    "# expect-due: ",
    "#",
    "# The app produced this — delete the line once the expectations above are filled in.",
    `# observed: recipe=${review.recipe ?? "-"} confidence=${review.confidence}` +
      ` due=${isoDate(review.proposedDueAt)} title="${review.proposedText}"`,
    "---",
    review.rawText,
    "",
  ].join("\n");
}

export class ReportUnavailable extends Error {
  constructor() {
    super("Sharing isn't available here.");
    this.name = "ReportUnavailable";
  }
}

/** Hand any text to whatever the person uses to send themselves things. */
export async function reportText(text: string, title: string): Promise<void> {
  const { value } = await Share.canShare();
  if (!value) {
    // A browser without the Web Share API still has a clipboard.
    if (!navigator.clipboard) throw new ReportUnavailable();
    await navigator.clipboard.writeText(text);
    return;
  }
  await Share.share({ title, text, dialogTitle: title });
}

export async function reportCapture(review: PendingReview): Promise<void> {
  await reportText(asFixture(review), "ZenTask capture");
}
