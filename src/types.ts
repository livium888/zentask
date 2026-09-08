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
};

export type Confidence = "high" | "low";
