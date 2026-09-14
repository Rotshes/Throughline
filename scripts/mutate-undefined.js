/**
 * Does `check-undefined.js` catch the three bugs that produced it?
 *
 *   node scripts/mutate-undefined.js
 *
 * A check written from a bug it already knows about is the easiest kind to get
 * wrong: it can be shaped around the one example and catch nothing else. So each
 * of turn 020's three crashes is reintroduced here, exactly as it happened, plus
 * two it was never shown.
 *
 * Every mutation asserts that the source actually changed before the check runs
 * — turn 016 lost an afternoon to an edit that silently did not apply and left a
 * green suite behind. The backup is restored and then verified byte for byte,
 * because a harness that edits source and merely announces the restore is one
 * crash away from leaving the repository broken.
 */

import { readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

const MUTATIONS = [
  // The three that actually happened, in the order they happened.
  ["turn 020 #1: `specific` left in use", "scripts/run-candidates.js",
   "const { categorySlug: category, machineSlugs, tagSlugs, selectionSlugs, specific } = request;",
   "const { categorySlug: category, machineSlugs, tagSlugs, selectionSlugs } = request;"],

  ["turn 020 #3: `vocabulary` left in use", "scripts/run-candidates.js",
   "const d = dominanceReport(candidates);",
   "if (vocabulary) { /* guard for a loader that no longer exists */ }\nconst d = dominanceReport(candidates);"],

  ["a name removed from an import", "scripts/run-shortlist.js",
   'import { createBudget } from "../src/budget.js";',
   "// import removed, call left behind"],

  // Two it was never shown, because a check that only catches its own examples
  // is a check shaped around a bug rather than around a class of bug.
  ["a typo in a call", "src/shortlist.js",
   "const angleDefs = loadAngles();",
   "const angleDefs = loadAngels();"],

  // EXPECTED MISS, and kept precisely because it is one.
  //
  // `scripts/vocab.js` declares `const v = load()` in two different functions.
  // Renaming one leaves the other's declaration standing, and this check is
  // scope-agnostic, so `v` still counts as declared. Verified by reading the
  // file, not assumed from the result.
  //
  // This is the documented limit in check-undefined.js's header, and it stays in
  // the list as the concrete demonstration of it. A limit stated in prose is a
  // claim; a limit with a failing example next to it is a measurement. If this
  // ever starts being caught, the check has become scope-aware and the header is
  // out of date.
  ["cross-scope rename (documented blind spot)", "scripts/vocab.js",
   "const v = load();\n\n  if (category !== null",
   "const vv = load();\n\n  if (category !== null", true],
];

const BACKUP = join(tmpdir(), "undef-mutation-backup");
let undetected = 0;

for (const [name, file, from, to, expectMiss = false] of MUTATIONS) {
  copyFileSync(file, BACKUP);
  const before = readFileSync(file, "utf8");

  if (!before.includes(from)) {
    console.log(`${name.padEnd(42)} SKIPPED — target text not found`);
    continue;
  }
  writeFileSync(file, before.replace(from, to));
  if (readFileSync(file, "utf8") === before) {
    console.log(`${name.padEnd(42)} SKIPPED — source unchanged`);
    copyFileSync(BACKUP, file);
    continue;
  }

  let out, caught;
  try {
    out = execSync("node scripts/check-undefined.js", { encoding: "utf8" });
    caught = false;
  } catch (e) {
    out = e.stdout ?? "";
    caught = true;
  }

  const detail = (out.match(/read but never declared: (.+)/) || [])[1] ?? "";
  const verdict =
    caught && expectMiss ? "caught — HEADER NOW WRONG"
    : caught ? "caught"
    : expectMiss ? "missed, as documented"
    : "*** MISSED ***";
  console.log(`${name.padEnd(42)} ${verdict.padEnd(24)} ${detail}`);

  // Either direction of surprise counts. A blind spot that closes is good news
  // and stale documentation at the same time.
  if (caught !== !expectMiss) undetected++;

  copyFileSync(BACKUP, file);
  if (readFileSync(file, "utf8") !== before) {
    console.error(`\nRESTORE FAILED for ${file}. Fix it before committing.`);
    process.exit(2);
  }
}

console.log(`\nrestored, each file verified against its backup.`);
console.log(undetected === 0
  ? "Every mutation behaved as expected, including the one the check cannot see."
  : `${undetected} mutation(s) surprised the harness. Read the lines above.`);
process.exit(undetected === 0 ? 0 : 1);
