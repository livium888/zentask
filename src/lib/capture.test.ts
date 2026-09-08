import { describe, expect, it } from "vitest";
import { NothingToRead, reviewFromText } from "./capture";

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
