import { describe, expect, it } from "vitest";
import { checkAll, parseFixture, summarise } from "./corpus";

/**
 * The corpus is the real regression suite: every case is text that came out of
 * OCR rather than out of someone's head. Enforced cases must pass; pending
 * ones are the backlog and are allowed to fail.
 */
const files = import.meta.glob("../../../fixtures/*.txt", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

const results = checkAll(files);

describe("fixture corpus", () => {
  it("has fixtures to check", () => {
    expect(results.length).toBeGreaterThan(0);
  });

  for (const result of results) {
    const enforced = result.fixture.status === "enforced";
    it.skipIf(!enforced)(`extracts: ${result.fixture.name}`, () => {
      expect(result.failures).toEqual([]);
    });
  }

  it("reports how much of the corpus is passing", () => {
    const { enforced } = summarise(results);
    expect(enforced.passed).toBe(enforced.total);
  });
});

describe("parseFixture", () => {
  it("reads headers and body, and defaults to enforced", () => {
    const fixture = parseFixture("# name: a case\n# expect-recipe: bill\n---\nline one\nline two", "file");
    expect(fixture).toMatchObject({ name: "a case", status: "enforced" });
    expect(fixture.expect.recipe).toBe("bill");
    expect(fixture.raw).toBe("line one\nline two");
  });

  it("treats a file with no header block as raw text", () => {
    expect(parseFixture("just some text", "unlabelled").raw).toBe("just some text");
  });

  it("rejects a clock it cannot read rather than silently using now", () => {
    expect(() => parseFixture("# now: whenever\n---\nx", "bad")).toThrow(/not a date/);
  });
});
