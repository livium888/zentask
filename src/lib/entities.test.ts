import { describe, expect, it } from "vitest";
import { EntityType, type EntityAnnotation } from "@capacitor-mlkit/entity-extraction";
import { toHints } from "./entities";
import { extractTask } from "./extract";

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
