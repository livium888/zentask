import { Capacitor } from "@capacitor/core";
import {
  EntityExtraction,
  EntityType,
  Language,
  type EntityAnnotation,
} from "@capacitor-mlkit/entity-extraction";
import { formatAmount, type DateMatch, type MoneyMatch } from "./extract";

/**
 * ML Kit's entity extractor, used to sharpen the rules rather than replace them.
 *
 * Google trained this on dates, money, addresses and tracking numbers; a
 * regex in this repository did not have that advantage, and every format the
 * rules miss — "the 3rd of next month", a date written the American way in a
 * British receipt — is one it was built for.
 *
 * It is not a comprehension model. It says "there is a date here and it means
 * this instant"; it does not say what the task is. The recipes still decide
 * that, which is why this slots in underneath them rather than over the top.
 *
 * The model is a few megabytes and has to be downloaded once. Until it is
 * there, everything works exactly as before — the download happens quietly in
 * the background and nothing waits on it, because a capture that waits for a
 * model is a capture that does not happen.
 */

const LANGUAGE = Language.English;

/** Granularities at or below an hour carry a usable time of day. */
const TIMED = /HOUR|MINUTE|SECOND/i;

export type EntityHints = {
  dates: DateMatch[];
  money: MoneyMatch[];
  /** Tracking and reference numbers, which the rules only guess at. */
  references: string[];
};

export const NO_HINTS: EntityHints = { dates: [], money: [], references: [] };

export function isEntityExtractionAvailable(): boolean {
  return Capacitor.isNativePlatform();
}

let modelReady = false;
let downloading: Promise<boolean> | undefined;

/**
 * Fetch the model once, in the background.
 *
 * Never awaited on the capture path. A failure here is not an error the user
 * needs to hear about: it just means captures keep being read by the rules.
 */
export function ensureModel(): Promise<boolean> {
  if (modelReady) return Promise.resolve(true);
  if (!isEntityExtractionAvailable()) return Promise.resolve(false);
  downloading ??= EntityExtraction.downloadModel({ language: LANGUAGE })
    .then(() => (modelReady = true))
    .catch(() => false)
    .finally(() => {
      downloading = undefined;
    });
  return downloading;
}

export function isModelReady(): boolean {
  return modelReady;
}

/**
 * Turn annotations into the shapes the recipes already understand.
 *
 * Pure, so the mapping can be tested without a device: everything awkward
 * about this layer — granularity, an amount split into two integers, whether
 * a match should outrank a rule — lives here rather than in the plugin call.
 */
export function toHints(annotations: EntityAnnotation[]): EntityHints {
  const hints: EntityHints = { dates: [], money: [], references: [] };

  for (const annotation of annotations) {
    for (const entity of annotation.entities) {
      if (entity.type === EntityType.DateTime && entity.timestamp !== undefined) {
        hints.dates.push({
          at: entity.timestamp,
          hasTime: TIMED.test(entity.dateTimeGranularity ?? ""),
          raw: annotation.text,
          index: annotation.start,
          // A mention with a digit in it is an explicit date; a bare weekday
          // is corroboration, and must not outrank one.
          specificity: /\d/.test(annotation.text) ? "explicit" : "weekday",
          fromModel: true,
        });
      }

      if (entity.type === EntityType.Money && entity.integerPart !== undefined) {
        const amount = entity.integerPart + (entity.fractionalPart ?? 0) / 100;
        const currency = entity.unnormalizedCurrency?.toUpperCase() || "GBP";
        hints.money.push({
          amount,
          currency,
          label: formatAmount(amount, currency),
          raw: annotation.text,
          index: annotation.start,
        });
      }

      if (entity.type === EntityType.TrackingNumber) {
        hints.references.push(annotation.text.trim());
      }
    }
  }

  return hints;
}

/**
 * What the model can find in this text, or nothing.
 *
 * Never throws and never blocks: if the model is not downloaded yet, or the
 * call fails, the caller simply gets no hints and the rules do the work.
 */
export async function findEntities(text: string, now = new Date()): Promise<EntityHints> {
  if (!isEntityExtractionAvailable() || !modelReady) return NO_HINTS;
  try {
    const { annotations } = await EntityExtraction.extractEntities({
      text,
      language: LANGUAGE,
      referenceTime: now.getTime(),
    });
    return toHints(annotations);
  } catch {
    return NO_HINTS;
  }
}
