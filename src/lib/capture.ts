import { Camera, CameraResultType, CameraSource } from "@capacitor/camera";
import type { PendingReview, TaskSource } from "@/types";
import { extractTask } from "./extract";
import { newId } from "./db/types";
import { readImageText } from "./ocr";

/**
 * Picture in, proposed task out — the one path that has to stay fast.
 *
 * A capture never becomes a task on its own. It lands in the review queue and
 * waits for a single tap. Auto-filing would mean the user has to police the
 * list, and policing the list is the work this app exists to remove.
 */

export class NothingToRead extends Error {
  constructor() {
    super("No text found in that picture.");
    this.name = "NothingToRead";
  }
}

/** Quality is a deliberate trade: smaller images OCR faster, and 80 is enough for print. */
const IMAGE_QUALITY = 80;

async function pickImage(source: TaskSource): Promise<string> {
  const photo = await Camera.getPhoto({
    quality: IMAGE_QUALITY,
    allowEditing: false,
    resultType: CameraResultType.Uri,
    source: source === "camera" ? CameraSource.Camera : CameraSource.Photos,
  });
  const path = photo.path ?? photo.webPath;
  if (!path) throw new NothingToRead();
  return path;
}

/** Build a review from text we already have — shared text, or a re-read image. */
export function reviewFromText(
  rawText: string,
  source: TaskSource,
  options: { imagePath?: string; now?: Date } = {},
): PendingReview {
  const extraction = extractTask(rawText, { now: options.now });
  if (!extraction) throw new NothingToRead();
  return {
    id: newId(),
    source,
    rawText,
    imagePath: options.imagePath,
    capturedAt: Date.now(),
    proposedText: extraction.title,
    proposedDueAt: extraction.dueAt,
    confidence: extraction.confidence,
    recipe: extraction.recipe,
  };
}

export async function captureFromImage(source: "camera" | "gallery"): Promise<PendingReview> {
  const path = await pickImage(source);
  const rawText = await readImageText(path);
  return reviewFromText(rawText, source, { imagePath: path });
}
