import { describe, expect, it } from "vitest";
import { captureFromShare, NothingToRead, reviewFromText } from "./capture";
import { hasSomethingShared } from "./share-target";

const NOW = new Date(2026, 8, 8, 10, 0);

describe("reviewFromText", () => {
  it("proposes a task and keeps the text it came from", () => {
    const review = reviewFromText("Call the plumber tomorrow", "share", { now: NOW });
    expect(review.proposedText).toMatch(/^Call the plumber/);
    expect(review.rawText).toBe("Call the plumber tomorrow");
    expect(review.confidence).toBe("high");
  });

  it("refuses rather than filing an empty capture", () => {
    expect(() => reviewFromText("|| #", "camera", { now: NOW })).toThrow(NothingToRead);
  });

  it("never marks a capture as already confirmed", () => {
    const review = reviewFromText("SUNNYSIDE CAFE\nThank you for visiting", "camera", { now: NOW });
    expect(review.confidence).toBe("low");
    expect(review.proposedDueAt).toBeUndefined();
  });
});

describe("captureFromShare", () => {
  it("turns shared text into a review without touching OCR", async () => {
    const review = await captureFromShare({ text: "Renew passport before 01/10/2026", imagePath: null });
    expect(review.source).toBe("share");
    expect(review.proposedText).toMatch(/Renew/);
  });

  it("refuses an empty share rather than filing a blank task", async () => {
    await expect(captureFromShare({ text: null, imagePath: null })).rejects.toThrow(NothingToRead);
  });
});

describe("hasSomethingShared", () => {
  it("is false for nothing, and for a share carrying neither", () => {
    expect(hasSomethingShared(undefined)).toBe(false);
    expect(hasSomethingShared({ text: null, imagePath: null })).toBe(false);
    expect(hasSomethingShared({ text: "", imagePath: null })).toBe(false);
  });

  it("is true for either a picture or some text", () => {
    expect(hasSomethingShared({ text: "something", imagePath: null })).toBe(true);
    expect(hasSomethingShared({ text: null, imagePath: "/tmp/a.jpg" })).toBe(true);
  });
});
