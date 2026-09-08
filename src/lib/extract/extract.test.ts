import { describe, expect, it } from "vitest";
import { extractTask } from "./index";
import { findDates, pickDueDate } from "./dates";
import { findMoney, pickAmount } from "./money";
import { dropRepeatedPrefix, looksLikeConversation, toLines } from "./text";

/** A fixed clock so "no year given" and "tomorrow" are deterministic. */
const NOW = new Date(2026, 8, 8, 10, 0); // Tue 8 Sep 2026

describe("toLines", () => {
  it("drops barcode runs and single-glyph debris", () => {
    const lines = toLines("ACME LTD\n|||| ||| ||\n1234567890 12345\nA\nTotal £12.50");
    expect(lines).toEqual(["ACME LTD", "Total £12.50"]);
  });
});

describe("a date standing on its own line", () => {
  it("survives the barcode filter", () => {
    // "06.09.2026" was being deleted as a long digit run, taking the only
    // date on an invitation with it.
    expect(toLines("DATE:\n06.09.2026\nTIME:")).toContain("06.09.2026");
  });

  it("is read as a date and not as the time 06:09", () => {
    const [hit] = findDates("DATE:\n06.09.2026", { now: NOW });
    expect(new Date(hit!.at).getDate()).toBe(6);
    expect(hit!.hasTime).toBe(false);
  });

  it("still drops an actual digit run", () => {
    expect(toLines("ACME\n4820119374882910")).toEqual(["ACME"]);
  });
});

describe("a year the document states", () => {
  it("governs a bare day and month rather than rolling forward", () => {
    // An invitation dated 2026 that says "RSVP by 14th August" means that
    // August, not the next one.
    const dates = findDates("06.09.2026\nRSVP BY 14TH AUGUST", { now: NOW });
    expect(dates.every((d) => new Date(d.at).getFullYear() === 2026)).toBe(true);
  });

  it("still rolls forward when the document states no year", () => {
    const [hit] = findDates("Pay by 5 Jan", { now: new Date(2026, 11, 30) });
    expect(new Date(hit!.at).getFullYear()).toBe(2027);
  });
});

describe("conversations", () => {
  it("recognises a message thread by its run of timestamps", () => {
    expect(looksLikeConversation("Paul\n17:48\nhi\n07:59\nyep\n08:03\nsee you")).toBe(true);
  });

  it("does not mistake a document that mentions a time or two", () => {
    expect(looksLikeConversation("CLINIC\nAppointment 14:30\nArrive early")).toBe(false);
  });

  it("declines rather than returning the longest line", () => {
    const chat = "Paul Green\n17:48\nwhat time are you thinking\n07:59\nprobably still get it done\n08:03\nWednesday about 6";
    expect(extractTask(chat, { now: NOW })).toBeUndefined();
  });
});

describe("dropRepeatedPrefix", () => {
  it("drops a logo the OCR read before the title", () => {
    expect(dropRepeatedPrefix("THE LEGEND ZELDA The Legend of Zelda 40th Anniversary Edition")).toBe(
      "The Legend of Zelda 40th Anniversary Edition",
    );
  });

  it("leaves a line that merely repeats one word", () => {
    expect(dropRepeatedPrefix("Pay the gas bill to British Gas")).toBe("Pay the gas bill to British Gas");
  });

  it("leaves an ordinary title alone", () => {
    expect(dropRepeatedPrefix("Collect parcel SD9284471GB")).toBe("Collect parcel SD9284471GB");
  });
});

describe("findDates", () => {
  it("reads ISO dates", () => {
    const [hit] = findDates("Due 2026-09-12", { now: NOW });
    expect(new Date(hit!.at).getDate()).toBe(12);
    expect(new Date(hit!.at).getMonth()).toBe(8);
  });

  it("reads ambiguous numeric dates day-first by default", () => {
    const [hit] = findDates("03/04/2026", { now: NOW });
    expect(new Date(hit!.at).getDate()).toBe(3);
    expect(new Date(hit!.at).getMonth()).toBe(3); // April
  });

  it("flips to month-first when asked", () => {
    const [hit] = findDates("03/04/2026", { now: NOW, dayFirst: false });
    expect(new Date(hit!.at).getMonth()).toBe(2); // March
    expect(new Date(hit!.at).getDate()).toBe(4);
  });

  it("lets an out-of-range component settle the order regardless of locale", () => {
    const [hit] = findDates("25/12/2026", { now: NOW, dayFirst: false });
    expect(new Date(hit!.at).getDate()).toBe(25);
    expect(new Date(hit!.at).getMonth()).toBe(11);
  });

  it("rolls a bare day/month forward rather than into the past", () => {
    const [hit] = findDates("Pay by 5 Jan", { now: new Date(2026, 11, 30) });
    expect(new Date(hit!.at).getFullYear()).toBe(2027);
  });

  it("attaches a nearby time to the date", () => {
    const [hit] = findDates("Thursday 10 Sep at 14:30", { now: NOW });
    expect(hit!.hasTime).toBe(true);
    expect(new Date(hit!.at).getHours()).toBe(14);
    expect(new Date(hit!.at).getMinutes()).toBe(30);
  });

  it("understands pm without minutes", () => {
    const [hit] = findDates("10 Sep, 3pm", { now: NOW });
    expect(new Date(hit!.at).getHours()).toBe(15);
  });

  it("resolves tomorrow against the given clock", () => {
    const [hit] = findDates("bin out tomorrow", { now: NOW });
    expect(new Date(hit!.at).getDate()).toBe(9);
  });

  it("does not read a weekday out of the middle of a word", () => {
    // "SUNNYSIDE" once parsed as Sunday, which put a wrong date on a task.
    expect(findDates("SUNNYSIDE CAFE", { now: NOW })).toHaveLength(0);
  });

  it("does not read a month out of the middle of a word", () => {
    expect(findDates("Decision 12 pending", { now: NOW })).toHaveLength(0);
    expect(findDates("Mayfair 12 branch", { now: NOW })).toHaveLength(0);
  });

  it("still reads full month names", () => {
    const [hit] = findDates("12 September 2026", { now: NOW });
    expect(new Date(hit!.at).getMonth()).toBe(8);
  });

  it("still reads full weekday names", () => {
    expect(findDates("see you Wednesday", { now: NOW })).toHaveLength(1);
  });

  it("rejects impossible dates", () => {
    expect(findDates("32/13/2026", { now: NOW })).toHaveLength(0);
  });
});

describe("times written without a colon", () => {
  it("reads a poster's time range as its start", () => {
    const [hit] = findDates("10 Sep 430-730PM", { now: NOW });
    expect(new Date(hit!.at).getHours()).toBe(16);
    expect(new Date(hit!.at).getMinutes()).toBe(30);
  });

  it("reads a bare compact time", () => {
    const [hit] = findDates("10 Sep at 730PM", { now: NOW });
    expect(new Date(hit!.at).getHours()).toBe(19);
  });

  it("does not read a year or an account number as a time", () => {
    expect(findDates("Account 2026 1830", { now: NOW })).toHaveLength(0);
  });
});

describe("pickDueDate", () => {
  it("prefers an explicit date over a bare weekday printed above it", () => {
    // A poster reading "WEDNESDAY THE DATE / 30TH SEPTEMBER" names one day
    // twice; the weekday is corroboration, not a second event.
    const due = pickDueDate("WEDNESDAY THE DATE\n30TH\nSEPTEMBER", { now: NOW });
    expect(new Date(due!.at).getDate()).toBe(30);
    expect(due!.specificity).toBe("explicit");
  });

  it("still uses a weekday when it is the only date given", () => {
    const due = pickDueDate("see you Wednesday", { now: NOW });
    expect(new Date(due!.at).getDate()).toBe(9);
  });

  it("prefers a date introduced by a deadline cue over the print date", () => {
    const text = "Printed 01/09/2026\nAmount due\nPay by 30/09/2026";
    const due = pickDueDate(text, { now: NOW });
    expect(new Date(due!.at).getDate()).toBe(30);
  });
});

describe("screenshot furniture", () => {
  it("drops the phone's own status bar", () => {
    // Its clock would otherwise be read as the event's time.
    expect(toLines("18:45 18° ring l 82)\nOPEN EVENING")).toEqual(["OPEN EVENING"]);
  });

  it("keeps a first line that merely starts with a time", () => {
    expect(toLines("14:30 kick off at the ground\nsomething")).toContain(
      "14:30 kick off at the ground",
    );
  });

  it("drops app buttons and timestamps", () => {
    const lines = toLines("Posts\nSAVE\nOur next Open Event\n2 days ago\n13");
    expect(lines).toEqual(["Our next Open Event"]);
  });
});

describe("findMoney", () => {
  it("reads symbol-first amounts", () => {
    expect(findMoney("Total £12.50")[0]).toMatchObject({ amount: 12.5, currency: "GBP" });
  });

  it("reads a comma decimal separator", () => {
    expect(findMoney("Total 1.234,56 EUR")[0]).toMatchObject({ amount: 1234.56, currency: "EUR" });
  });

  it("reads a point decimal separator with thousands commas", () => {
    expect(findMoney("$1,234.56")[0]).toMatchObject({ amount: 1234.56, currency: "USD" });
  });

  it("treats a three-digit group as thousands, not decimals", () => {
    expect(findMoney("2.500 RON")[0]).toMatchObject({ amount: 2500, currency: "RON" });
  });

  it("picks the largest amount as the one being asked for", () => {
    expect(pickAmount("VAT £4.20\nTotal due £25.20")).toMatchObject({ amount: 25.2 });
  });
});

describe("extractTask", () => {
  it("turns a utility bill into a payment task", () => {
    const ocr = `BRITISH GAS
Account 4820 1193
Your bill
VAT £4.20
Total amount due £84.60
Payment due by 30/09/2026`;
    const out = extractTask(ocr, { now: NOW })!;
    expect(out.recipe).toBe("bill");
    expect(out.title).toContain("Pay £84.60");
    expect(out.confidence).toBe("high");
    expect(new Date(out.dueAt!).getDate()).toBe(30);
  });

  it("turns an appointment card into a dated task", () => {
    const ocr = `RIVERSIDE DENTAL
Your next appointment
Thursday 10 Sep at 14:30
Please arrive 10 minutes early`;
    const out = extractTask(ocr, { now: NOW })!;
    expect(out.recipe).toBe("appointment");
    expect(out.confidence).toBe("high");
    expect(new Date(out.dueAt!).getHours()).toBe(14);
  });

  it("beats the bill recipe when a letter has both a price and an appointment", () => {
    const ocr = `CITY CLINIC
Consultation appointment 12 Sep at 09:00
Fee payable on the day: £60.00`;
    expect(extractTask(ocr, { now: NOW })!.recipe).toBe("appointment");
  });

  it("turns a collection slip into a collect task", () => {
    const ocr = `ROYAL MAIL
Something for you
Awaiting collection at your local office
Ref: SD9284471GB`;
    const out = extractTask(ocr, { now: NOW })!;
    expect(out.recipe).toBe("parcel");
    expect(out.title).toContain("SD9284471GB");
  });

  it("turns a renewal notice into a renew task", () => {
    const ocr = `ADMIRAL INSURANCE
Your policy expires on 01/10/2026
Renew online to keep cover`;
    const out = extractTask(ocr, { now: NOW })!;
    expect(out.recipe).toBe("expiry");
    expect(new Date(out.dueAt!).getMonth()).toBe(9);
  });

  it("takes a handwritten note at its word", () => {
    const out = extractTask("Call the plumber tomorrow about the leak", { now: NOW })!;
    expect(out.recipe).toBe("action-line");
    expect(out.title).toMatch(/^Call the plumber/);
    expect(new Date(out.dueAt!).getDate()).toBe(9);
  });

  it("turns a dated invitation into an event", () => {
    const ocr = `SAVE THE DATE
Our next Open Event is on Wednesday 30th September
430-730PM`;
    const out = extractTask(ocr, { now: NOW })!;
    expect(out.recipe).toBe("event");
    expect(out.title).toContain("Open Event");
    expect(new Date(out.dueAt!).getDate()).toBe(30);
    expect(new Date(out.dueAt!).getHours()).toBe(16);
  });

  it("names who an event is for, not just what it is", () => {
    const ocr = `OPEN THE RIVERSIDE ACADEMY DOORS
Our next Open Evening is on 30/09/2026 at 18:00`;
    const out = extractTask(ocr, { now: NOW })!;
    expect(out.recipe).toBe("event");
    expect(out.title).toContain("Open Evening");
    // "Open Evening — Thu 30 Sept" alone gives you nothing to act on.
    expect(out.title).toContain("RIVERSIDE ACADEMY");
  });

  it("trims a headline down to the name buried inside it", () => {
    const ocr = `WELCOME TO ST MARY'S SCHOOL WISDOM AND FAVOUR
Open Day 30/09/2026 at 10:00`;
    expect(extractTask(ocr, { now: NOW })!.title).toContain("ST MARY'S SCHOOL");
  });

  it("still names the practice on an appointment card", () => {
    const ocr = `RIVERSIDE DENTAL
Your next appointment
Thursday 10 Sep at 14:30`;
    expect(extractTask(ocr, { now: NOW })!.title).toContain("RIVERSIDE DENTAL");
  });

  it("takes the timed date for an event, not a deadline mentioned beside it", () => {
    const ocr = `You're invited to
THE RIVERSIDE CLUB
DATE:
06.09.2026
TIME:
13:30-15:30
PLEASE RSVP BY 14TH AUGUST`;
    const out = extractTask(ocr, { now: new Date(2026, 8, 1) })!;
    expect(out.recipe).toBe("event");
    expect(new Date(out.dueAt!).getDate()).toBe(6);
    expect(new Date(out.dueAt!).getHours()).toBe(13);
  });

  it("does not let a bare weekday win just because it carries a time", () => {
    // Preferring a timed date once forgot specificity, so "WEDNESDAY" beat the
    // "30TH SEPTEMBER" printed two lines below it.
    const ocr = `OPEN THE RIVERSIDE ACADEMY DOORS
WEDNESDAY THE DATE
30TH
SEPTEMBER-
430-730PM`;
    const out = extractTask(ocr, { now: NOW })!;
    expect(new Date(out.dueAt!).getDate()).toBe(30);
    expect(new Date(out.dueAt!).getHours()).toBe(16);
  });

  it("does not name an invitation after its banner", () => {
    const ocr = "You're invited to\nTHE RIVERSIDE CLUB\nOpen Day 30/09/2026 at 10:00";
    const title = extractTask(ocr, { now: NOW })!.title;
    expect(title).not.toContain("invited");
    expect(title).toContain("RIVERSIDE CLUB");
  });

  it("does not call an undated flyer an event", () => {
    expect(extractTask("SAVE THE DATE\nOpen Evening coming soon", { now: NOW })!.recipe).not.toBe(
      "event",
    );
  });

  it("admits low confidence instead of inventing a task", () => {
    const out = extractTask("SUNNYSIDE CAFE\nThank you for your visit\nSee you soon", { now: NOW })!;
    expect(out.recipe).toBe("fallback");
    expect(out.confidence).toBe("low");
  });

  it("returns nothing when the picture had no readable text", () => {
    expect(extractTask("|| ||||\n#\n7", { now: NOW })).toBeUndefined();
  });

  it("keeps titles short enough to read at a glance", () => {
    const out = extractTask("Remember to " + "something ".repeat(30), { now: NOW })!;
    expect(out.title.split(" ").length).toBeLessThanOrEqual(13);
  });
});
