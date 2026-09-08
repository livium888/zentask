/** Where a task came from. Kept so the review card can say "from a photo". */
export type TaskSource = "camera" | "gallery" | "share" | "screenshot" | "manual";

export type Task = {
  id: string;
  text: string;
  done: boolean;
  createdAt: number;
  /** Epoch ms. Absent means "no date was found and none was set". */
  dueAt?: number;
  source: TaskSource;
  /** The OCR text this task was derived from, so the user can check our work. */
  rawText?: string;
  imagePath?: string;
};

/** A capture waiting for the one tap that turns it into a task. */
export type PendingReview = {
  id: string;
  source: TaskSource;
  rawText: string;
  imagePath?: string;
  capturedAt: number;
  /** What the extractor proposed. The user edits this, not the raw text. */
  proposedText: string;
  proposedDueAt?: number;
  confidence: Confidence;
  /** Which rule produced the proposal. Carried so a bad capture can be reported. */
  recipe?: string;
};

export type Confidence = "high" | "low";

/**
 * A capture worth learning from.
 *
 * Not every capture: one the app got right and you accepted without changing
 * teaches nothing. What is kept is the residue — anything it was unsure about,
 * anything you corrected, anything you threw away. A correction is the most
 * valuable of the three, because your edit *is* the right answer, recorded
 * without you having to write it down anywhere.
 *
 * These never leave the phone unless you export them.
 */
export type Sample = {
  id: string;
  capturedAt: number;
  source: TaskSource;
  rawText: string;
  proposedText: string;
  proposedDueAt?: number;
  confidence: Confidence;
  recipe?: string;
  verdict: SampleVerdict;
  /** What you changed it to. Present only when the verdict is "edited". */
  finalText?: string;
};

export type SampleVerdict = "edited" | "dismissed" | "unsure";
