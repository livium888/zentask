import { Capacitor } from "@capacitor/core";
import { Script, TextRecognition } from "@capacitor-mlkit/text-recognition";
import { flattenBlocks, orderLines } from "./extract/layout";

/**
 * Reading text out of a picture, on the device.
 *
 * ML Kit's Latin model ships inside the APK, so the first capture works with
 * no download and no network — which matters more here than raw accuracy,
 * because a capture that has to wait for a model is a capture that never
 * happens. Nothing about the image or its text leaves the phone on this path.
 *
 * The flat `text` field is deliberately not used: it walks block by block, so
 * a two-column row arrives split. `orderLines` rebuilds rows from the geometry
 * that comes with each line.
 */

export class OcrUnavailable extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = "OcrUnavailable";
  }
}

export function isOcrAvailable(): boolean {
  return Capacitor.isNativePlatform();
}

export async function readImageText(path: string): Promise<string> {
  if (!isOcrAvailable()) {
    // The browser build is for developing the UI; there is no on-device model.
    throw new OcrUnavailable("Reading pictures only works in the installed app.");
  }
  const result = await TextRecognition.processImage({ path, script: Script.Latin });
  const rows = orderLines(flattenBlocks(result.blocks ?? []));
  // If the device gave us no blocks at all, the flat string is all there is.
  return rows.length > 0 ? rows.join("\n") : result.text;
}
