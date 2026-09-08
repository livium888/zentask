/**
 * Split an exported capture log into fixture files.
 *
 *   bun scripts/import-samples.ts ~/Downloads/zentask-log.txt
 *
 * Every case lands in fixtures/ as its own pending case, so it is reported by
 * `bun run score` without failing the build. Filling in the expectations and
 * flipping one to `enforced` is what turns a complaint into a guarantee.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { CASE_SEPARATOR } from "../src/lib/samples";
import { parseFixture } from "../src/lib/extract/corpus";

const FIXTURES = path.resolve(import.meta.dirname, "..", "fixtures");

/** A short, stable, filesystem-safe name for a case. */
function slug(name: string, index: number): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  return `${base || "capture"}-${String(index + 1).padStart(2, "0")}`;
}

function main(): void {
  const source = process.argv[2];
  if (!source) {
    console.error("Usage: bun scripts/import-samples.ts <exported log>");
    process.exitCode = 1;
    return;
  }
  if (!existsSync(source)) {
    console.error(`No such file: ${source}`);
    process.exitCode = 1;
    return;
  }

  const cases = readFileSync(source, "utf8")
    .split(CASE_SEPARATOR)
    .map((block) => block.trim())
    .filter((block) => block.includes("---"));

  if (cases.length === 0) {
    console.log("Nothing in there that looks like a capture.");
    return;
  }

  let written = 0;
  let skipped = 0;

  cases.forEach((block, index) => {
    const fixture = parseFixture(block, `capture-${index + 1}`);
    if (!fixture.raw) {
      skipped += 1;
      return;
    }
    const file = path.join(FIXTURES, `${slug(fixture.name, index)}.txt`);
    if (existsSync(file)) {
      // Never overwrite: a case already here may have been labelled by hand.
      console.log(`skip  ${path.basename(file)} (already there)`);
      skipped += 1;
      return;
    }
    writeFileSync(file, `${block}\n`);
    console.log(`write ${path.basename(file)}`);
    written += 1;
  });

  console.log(`\n${written} written, ${skipped} skipped. Now run: bun run score`);
}

main();
