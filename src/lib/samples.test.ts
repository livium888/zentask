import { describe, expect, it } from "vitest";
import { asBulkExport, asFixture, CASE_SEPARATOR, sampleFrom, verdictFor } from "./samples";
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

describe("verdictFor", () => {
  it("keeps nothing when a confident proposal is accepted unchanged", () => {
    // Already covered by the tests; logging it would bury the real cases.
    expect(verdictFor(review, "kept", review.proposedText)).toBeUndefined();
  });

  it("keeps a correction, which is the most useful kind", () => {
    expect(verdictFor(review, "kept", "Pay the gas bill")).toBe("edited");
  });

  it("ignores whitespace-only differences", () => {
    expect(verdictFor(review, "kept", `  ${review.proposedText}  `)).toBeUndefined();
  });

  it("keeps anything the app was unsure about", () => {
    expect(verdictFor({ ...review, confidence: "low" }, "kept", review.proposedText)).toBe("unsure");
  });

  it("keeps anything thrown away", () => {
    expect(verdictFor(review, "dismissed")).toBe("dismissed");
  });
});

describe("asFixture", () => {
  it("writes a correction straight into the expectation", () => {
    const sample = sampleFrom(review, "edited", "Pay the gas bill");
    const parsed = parseFixture(asFixture(sample), "x");
    expect(parsed.expect.titleContains).toBe("Pay the gas bill");
    expect(parsed.status).toBe("pending");
    expect(parsed.raw).toContain("BRITISH GAS");
  });

  it("leaves the expectation blank when there was no correction", () => {
    const parsed = parseFixture(asFixture(sampleFrom(review, "dismissed")), "x");
    expect(parsed.expect.titleContains).toBeUndefined();
  });

  it("records what the app produced, so the failure is visible", () => {
    expect(asFixture(sampleFrom(review, "unsure"))).toContain('title="Pay £84.60 — BRITISH GAS"');
  });
});

describe("asBulkExport", () => {
  it("is empty when there is nothing to send", () => {
    expect(asBulkExport([])).toBe("");
  });

  it("splits back into exactly the cases that went in", () => {
    const samples = [
      sampleFrom(review, "edited", "Pay the gas bill"),
      sampleFrom({ ...review, rawText: "ROYAL MAIL\nRef: SD1" }, "dismissed"),
    ];
    const blocks = asBulkExport(samples)
      .split(CASE_SEPARATOR)
      .map((b) => b.trim())
      .filter((b) => b.includes("---"));
    expect(blocks).toHaveLength(2);
    expect(parseFixture(blocks[1]!, "x").raw).toContain("ROYAL MAIL");
  });
});
