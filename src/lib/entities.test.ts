import { describe, expect, it } from "vitest";
import { EntityType, type EntityAnnotation } from "@capacitor-mlkit/entity-extraction";
import { toHints } from "./entities";
import { cleanedText, extractTask } from "./extract";

const NOW = new Date(2026, 8, 8, 10, 0);

function annotation(text: string, start: number, entities: EntityAnnotation["entities"]): EntityAnnotation {
  return { text, start, end: start + text.length, entities };
}

describe("toHints", () => {
  it("turns a resolved date-time into a match the recipes understand", () => {
    const at = new Date(2026, 8, 30, 16, 30).getTime();
    const [date] = toHints([
      annotation("30th September", 20, [
        { type: EntityType.DateTime, timestamp: at, dateTimeGranularity: "MINUTE" } as never,
      ]),
    ]).dates;
    expect(date).toMatchObject({ at, hasTime: true, index: 20, fromModel: true });
    expect(date!.specificity).toBe("explicit");
  });

  it("treats a date with no digits as a weekday, so it cannot outrank a real one", () => {
    const [date] = toHints([
      annotation("Wednesday", 0, [
        { type: EntityType.DateTime, timestamp: Date.now(), dateTimeGranularity: "DAY" } as never,
      ]),
    ]).dates;
    expect(date!.specificity).toBe("weekday");
  });

  it("reassembles an amount split into integer and fractional parts", () => {
    const [money] = toHints([
      annotation("£84.60", 5, [
        { type: EntityType.Money, integerPart: 84, fractionalPart: 60, unnormalizedCurrency: "£" } as never,
      ]),
    ]).money;
    expect(money).toMatchObject({ amount: 84.6, index: 5 });
  });

  it("collects tracking numbers", () => {
    expect(
      toHints([annotation("SD9284471GB", 0, [{ type: EntityType.TrackingNumber } as never])]).references,
    ).toEqual(["SD9284471GB"]);
  });

  it("ignores entity types nothing here uses", () => {
    const hints = toHints([annotation("a@b.com", 0, [{ type: EntityType.Email } as never])]);
    expect(hints).toEqual({ dates: [], money: [], references: [] });
  });
});

describe("hints reaching the recipes", () => {
  it("lets the model's date win over one the rules misread", () => {
    // The rules see "next month" as nothing at all; the model resolves it.
    const at = new Date(2026, 9, 3).getTime();
    const out = extractTask("Renew your policy by the 3rd of next month", {
      now: NOW,
      extraDates: [{ at, hasTime: false, raw: "3rd of next month", index: 22, specificity: "explicit" }],
    })!;
    expect(new Date(out.dueAt!).getMonth()).toBe(9);
  });

  it("uses a recognised tracking number instead of guessing at one", () => {
    const out = extractTask("ROYAL MAIL\nAwaiting collection", {
      now: NOW,
      extraReferences: ["SD9284471GB"],
    })!;
    expect(out.recipe).toBe("parcel");
    expect(out.title).toContain("SD9284471GB");
  });

  it("works unchanged when no model has run", () => {
    const out = extractTask("BRITISH GAS\nTotal amount due £84.60\nPayment due by 30/09/2026", { now: NOW })!;
    expect(out.title).toContain("Pay £84.60");
  });
});

describe("what the model is given to read", () => {
  it("is the cleaned text, not the raw OCR", () => {
    // The phone's status bar is not part of the poster. Reading it gave the
    // model a clock ("18:45") and a weekday to resolve, and its answer then
    // beat the real date printed on the poster.
    const raw = "18:45 18° ring l 82)\nPosts\nOPEN THE RIVERSIDE ACADEMY DOORS\n2 days ago";
    const cleaned = cleanedText(raw);
    expect(cleaned).not.toContain("18:45");
    expect(cleaned).not.toContain("Posts");
    expect(cleaned).not.toContain("days ago");
    expect(cleaned).toContain("RIVERSIDE ACADEMY");
  });

  it("gives hint positions that line up with the rules", () => {
    // mergeDates compares indices; if hints came from a different string than
    // the rules read, two readings of one date look like two dates.
    const raw = "Posts\nDue 30/09/2026";
    const cleaned = cleanedText(raw);
    expect(cleaned.indexOf("30/09/2026")).toBeGreaterThanOrEqual(0);
    expect(cleaned).toBe("Due 30/09/2026");
  });
});

describe("a model reading versus a rule reading", () => {
  it("does not let the model's bare weekday beat an explicit date", () => {
    const text = "WEDNESDAY THE DATE\n30TH\nSEPTEMBER";
    const out = extractTask(text, {
      now: NOW,
      extraDates: [
        {
          at: new Date(2026, 8, 9, 18, 45).getTime(),
          hasTime: true,
          raw: "WEDNESDAY",
          index: 0,
          specificity: "weekday",
        },
      ],
    })!;
    expect(new Date(out.dueAt!).getDate()).toBe(30);
  });

  it("still prefers the model where both are equally specific", () => {
    const at = new Date(2026, 9, 3).getTime();
    const out = extractTask("Renew by 03/10/2026", {
      now: NOW,
      extraDates: [{ at, hasTime: false, raw: "03/10/2026", index: 9, specificity: "explicit" }],
    })!;
    expect(out.dueAt).toBe(at);
  });
});
