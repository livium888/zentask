import { describe, expect, it } from "vitest";
import { asFixture } from "./report";
import { parseFixture } from "./extract/corpus";
import type { PendingReview } from "@/types";

const review: PendingReview = {
  id: "r1",
  source: "camera",
  rawText: "BRITISH GAS\nTotal amount due £84.60",
  capturedAt: new Date(2026, 8, 8, 16, 40).getTime(),
  proposedText: "Pay £84.60 — BRITISH GAS",
  proposedDueAt: new Date(2026, 8, 30).getTime(),
  confidence: "high",
  recipe: "bill",
};

describe("asFixture", () => {
  it("produces something the corpus parser accepts", () => {
    const parsed = parseFixture(asFixture(review), "shared");
    expect(parsed.raw).toBe("BRITISH GAS\nTotal amount due £84.60");
    expect(parsed.status).toBe("pending");
    expect(parsed.now?.getHours()).toBe(16);
  });

  it("records what the app actually produced, so the failure is visible", () => {
    const text = asFixture(review);
    expect(text).toContain("recipe=bill");
    expect(text).toContain("due=2026-09-30");
    expect(text).toContain('title="Pay £84.60 — BRITISH GAS"');
  });

  it("leaves the expectations blank for a person to fill in", () => {
    const parsed = parseFixture(asFixture(review), "shared");
    expect(parsed.expect.recipe).toBeUndefined();
    expect(parsed.expect.titleContains).toBeUndefined();
  });

  it("handles a capture with no date", () => {
    const parsed = parseFixture(asFixture({ ...review, proposedDueAt: undefined }), "shared");
    expect(parsed.raw).toContain("BRITISH GAS");
    expect(asFixture({ ...review, proposedDueAt: undefined })).toContain("due=none");
  });
});
