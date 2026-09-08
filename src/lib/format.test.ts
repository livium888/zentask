import { describe, expect, it } from "vitest";
import { formatDue } from "./format";

const NOW = new Date(2026, 8, 8, 10, 0); // Tue 8 Sep 2026

describe("formatDue", () => {
  it("says today and tomorrow rather than a date", () => {
    expect(formatDue(new Date(2026, 8, 8).getTime(), NOW)).toBe("Today");
    expect(formatDue(new Date(2026, 8, 9).getTime(), NOW)).toBe("Tomorrow");
  });

  it("names the weekday inside the coming week", () => {
    expect(formatDue(new Date(2026, 8, 11).getTime(), NOW)).toBe("Friday");
  });

  it("includes a time when one was found", () => {
    expect(formatDue(new Date(2026, 8, 9, 14, 30).getTime(), NOW)).toBe("Tomorrow, 14:30");
  });

  it("flags overdue rather than showing a past date", () => {
    expect(formatDue(new Date(2026, 8, 5).getTime(), NOW)).toBe("3d overdue");
  });

  it("adds the year only when it is not this one", () => {
    expect(formatDue(new Date(2026, 11, 25).getTime(), NOW)).toBe("25 Dec");
    expect(formatDue(new Date(2027, 0, 5).getTime(), NOW)).toBe("5 Jan 2027");
  });
});
