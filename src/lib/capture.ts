import { Camera, CameraResultType, CameraSource } from "@capacitor/camera";
import type { PendingReview, TaskSource } from "@/types";
import { cleanedText, extractTask, looksLikeConversation } from "./extract";
import { newId } from "./db/types";
import { readImageText } from "./ocr";
import type { SharePayload } from "./share-target";
import { findEntities, NO_HINTS, type EntityHints } from "./entities";

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

/**
 * Ask the on-device extractor about a capture.
 *
 * Given the cleaned text, never the raw OCR — a phone's status bar clock is
 * not part of the poster, and hint positions have to line up with the rules'.
 */
async function hintsFor(rawText: string): Promise<EntityHints> {
  if (looksLikeConversation(rawText)) return NO_HINTS;
  return findEntities(cleanedText(rawText));
}

/** Build a review from text we already have — shared text, or a re-read image. */
export function reviewFromText(
  rawText: string,
  source: TaskSource,
  options: { imagePath?: string; now?: Date; hints?: EntityHints } = {},
): PendingReview {
  const hints = options.hints ?? NO_HINTS;
  const extraction = extractTask(rawText, {
    now: options.now,
    extraDates: hints.dates,
    extraMoney: hints.money,
    extraReferences: hints.references,
  });
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
  return reviewFromText(rawText, source, { imagePath: path, hints: await hintsFor(rawText) });
}

/**
 * Something handed over by another app through the share sheet.
 *
 * A picture is read the same way a photographed one is; shared text is already
 * text and skips OCR entirely, which is why sharing a message is instant.
 */
export async function captureFromShare(payload: SharePayload): Promise<PendingReview> {
  if (payload.imagePath) {
    const rawText = await readImageText(payload.imagePath);
    return reviewFromText(rawText, "share", {
      imagePath: payload.imagePath,
      hints: await hintsFor(rawText),
    });
  }
  if (payload.text) {
    return reviewFromText(payload.text, "share", { hints: await hintsFor(payload.text) });
  }
  throw new NothingToRead();
}
