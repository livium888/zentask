/**
 * A corpus of real OCR dumps, and a way to score against it.
 *
 * The extraction rules were written against text I made up, which proves they
 * do what I meant and nothing about whether they survive a real receipt. This
 * turns "it works sometimes" into a number that moves when we improve it.
 *
 * A case is a plain text file so that a failure can be reported straight from
 * the phone and pasted in without editing JSON:
 *
 *     # name: british gas bill
 *     # now: 2026-09-08T10:00
 *     # status: enforced
 *     # expect-recipe: bill
 *     # expect-title-contains: Pay £84.60
 *     # expect-due: 2026-09-30
 *     ---
 *     BRITISH GAS
 *     Total amount due £84.60
 *
 * `status: pending` marks a case we know fails. Pending cases are reported by
 * the scorer but do not fail the build — they are the backlog. Moving one to
 * `enforced` is what progress looks like.
 */

import { extractTask } from "./index";

export type FixtureStatus = "enforced" | "pending";

export type Fixture = {
  name: string;
  status: FixtureStatus;
  now?: Date;
  expect: {
    recipe?: string;
    titleContains?: string;
    /** An ISO date (yyyy-mm-dd), or "none" to assert no due date was found. */
    due?: string;
    confidence?: "high" | "low";
  };
  raw: string;
};

export type FixtureResult = {
  fixture: Fixture;
  ok: boolean;
  failures: string[];
  observed: {
    recipe?: string;
    title?: string;
    due?: string;
    confidence?: string;
  };
};

const SEPARATOR = /^---\s*$/;

function isoDate(at: number): string {
  const date = new Date(at);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function parseFixture(source: string, fallbackName: string): Fixture {
  const lines = source.split(/\r?\n/);
  const separator = lines.findIndex((line) => SEPARATOR.test(line));
  const headerLines = separator === -1 ? [] : lines.slice(0, separator);
  const body = separator === -1 ? lines : lines.slice(separator + 1);

  const headers = new Map<string, string>();
  for (const line of headerLines) {
    const match = line.match(/^#\s*([a-z-]+)\s*:\s*(.*)$/i);
    if (!match) continue;
    const key = match[1]?.toLowerCase();
    const value = match[2]?.trim();
    if (key && value) headers.set(key, value);
  }

  const status = headers.get("status") === "pending" ? "pending" : "enforced";
  const nowHeader = headers.get("now");
  const now = nowHeader ? new Date(nowHeader) : undefined;
  if (now && Number.isNaN(now.getTime())) {
    throw new Error(`${fallbackName}: "# now: ${nowHeader}" is not a date`);
  }

  const confidence = headers.get("expect-confidence");

  return {
    name: headers.get("name") ?? fallbackName,
    status,
    now,
    expect: {
      recipe: headers.get("expect-recipe"),
      titleContains: headers.get("expect-title-contains"),
      due: headers.get("expect-due"),
      confidence: confidence === "high" || confidence === "low" ? confidence : undefined,
    },
    raw: body.join("\n").trim(),
  };
}

export function checkFixture(fixture: Fixture): FixtureResult {
  const failures: string[] = [];
  const extraction = extractTask(fixture.raw, fixture.now ? { now: fixture.now } : {});

  const observed = {
    recipe: extraction?.recipe,
    title: extraction?.title,
    due: extraction?.dueAt === undefined ? "none" : isoDate(extraction.dueAt),
    confidence: extraction?.confidence,
  };

  if (!extraction) {
    // A case with no expectations at all is a raw dump waiting to be labelled.
    const wanted = Object.values(fixture.expect).some((value) => value !== undefined);
    if (wanted) failures.push("nothing was extracted");
    return { fixture, ok: failures.length === 0, failures, observed };
  }

  const { recipe, titleContains, due, confidence } = fixture.expect;

  if (recipe && extraction.recipe !== recipe) {
    failures.push(`recipe: wanted ${recipe}, got ${extraction.recipe}`);
  }
  if (titleContains && !extraction.title.includes(titleContains)) {
    failures.push(`title: wanted to contain "${titleContains}", got "${extraction.title}"`);
  }
  if (due && observed.due !== due) {
    failures.push(`due: wanted ${due}, got ${observed.due}`);
  }
  if (confidence && extraction.confidence !== confidence) {
    failures.push(`confidence: wanted ${confidence}, got ${extraction.confidence}`);
  }

  return { fixture, ok: failures.length === 0, failures, observed };
}

export function summarise(results: FixtureResult[]): {
  enforced: { passed: number; total: number };
  pending: { passed: number; total: number };
} {
  const count = (status: FixtureStatus) => {
    const of = results.filter((result) => result.fixture.status === status);
    return { passed: of.filter((result) => result.ok).length, total: of.length };
  };
  return { enforced: count("enforced"), pending: count("pending") };
}

/** Check a set of fixture files, keyed by filename. */
export function checkAll(files: Record<string, string>): FixtureResult[] {
  return Object.entries(files)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([filename, source]) => {
      const name = filename.split("/").pop()?.replace(/\.txt$/, "") ?? filename;
      return checkFixture(parseFixture(source, name));
    });
}
