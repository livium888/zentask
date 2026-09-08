import { describe, expect, it } from "vitest";
import { flattenBlocks, orderLines, type PositionedLine } from "./layout";

/** A line at a given row band, with left/right in the same arbitrary units. */
function line(text: string, top: number, left: number, width = 100, height = 20): PositionedLine {
  return { text, boundingBox: { top, bottom: top + height, left, right: left + width } };
}

describe("orderLines", () => {
  it("puts a two-column row back together", () => {
    // ML Kit clusters the labels into one block and the amounts into another,
    // so the flat string reads "VAT Total £4.20 £84.60".
    const lines = [
      line("VAT", 100, 0),
      line("Total amount due", 140, 0),
      line("£4.20", 100, 400),
      line("£84.60", 140, 400),
    ];
    expect(orderLines(lines)).toEqual(["VAT £4.20", "Total amount due £84.60"]);
  });

  it("orders rows top to bottom regardless of input order", () => {
    const lines = [line("third", 300, 0), line("first", 100, 0), line("second", 200, 0)];
    expect(orderLines(lines)).toEqual(["first", "second", "third"]);
  });

  it("keeps lines apart when they merely sit near each other", () => {
    const lines = [line("one", 100, 0, 100, 20), line("two", 125, 0, 100, 20)];
    expect(orderLines(lines)).toEqual(["one", "two"]);
  });

  it("groups a tall heading with the small print beside it", () => {
    const lines = [line("SEPTEMBER", 100, 0, 200, 40), line("invoice", 110, 300, 80, 16)];
    expect(orderLines(lines)).toEqual(["SEPTEMBER invoice"]);
  });

  it("falls back to the given order when geometry is missing", () => {
    const lines = [{ text: "a" }, line("b", 10, 0), { text: "c" }];
    expect(orderLines(lines)).toEqual(["a", "b", "c"]);
  });

  it("handles an empty result", () => {
    expect(orderLines([])).toEqual([]);
  });
});

describe("flattenBlocks", () => {
  it("takes the lines inside each block", () => {
    const blocks = [
      { text: "ignored", lines: [line("first", 10, 0), line("second", 40, 0)] },
      { text: "third", lines: [] as PositionedLine[], boundingBox: { top: 70, bottom: 90, left: 0, right: 50 } },
    ];
    expect(flattenBlocks(blocks).map((l) => l.text)).toEqual(["first", "second", "third"]);
  });
});
