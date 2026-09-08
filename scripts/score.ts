/**
 * Score the extraction rules against the fixture corpus.
 *
 *   bun run score
 *
 * Enforced cases are the ones the build guards. Pending cases are known
 * failures kept as a backlog: they are printed with the reason so it is
 * obvious what the next improvement has to fix.
 */

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { checkAll, summarise, type FixtureResult } from "../src/lib/extract/corpus";

const FIXTURES = path.resolve(import.meta.dirname, "..", "fixtures");

function loadResults(): FixtureResult[] {
  const files: Record<string, string> = {};
  for (const name of readdirSync(FIXTURES)) {
    if (name.endsWith(".txt")) files[name] = readFileSync(path.join(FIXTURES, name), "utf8");
  }
  return checkAll(files);
}

function main(): void {
  const results = loadResults();
  if (results.length === 0) {
    console.log("No fixtures yet. See fixtures/README.md.");
    return;
  }

  for (const result of results) {
    const mark = result.ok ? "pass" : result.fixture.status === "pending" ? "todo" : "FAIL";
    console.log(`${mark}  ${result.fixture.name}`);
    for (const failure of result.failures) console.log(`      ${failure}`);
    if (!result.ok) {
      console.log(
        `      observed: recipe=${result.observed.recipe ?? "-"} due=${result.observed.due ?? "-"}` +
          ` confidence=${result.observed.confidence ?? "-"} title="${result.observed.title ?? ""}"`,
      );
    }
  }

  const { enforced, pending } = summarise(results);
  console.log(
    `\nenforced ${enforced.passed}/${enforced.total}` +
      `   pending ${pending.passed}/${pending.total} now passing`,
  );

  // A pending case that has started passing is not a failure, but it should be
  // promoted so the build starts guarding it.
  for (const result of results) {
    if (result.fixture.status === "pending" && result.ok) {
      console.log(`note: "${result.fixture.name}" now passes — set "# status: enforced".`);
    }
  }

  if (enforced.passed < enforced.total) process.exitCode = 1;
}

if (import.meta.main) main();
