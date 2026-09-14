/**
 * Five ways the candidate-block guard could be wrong, and whether the checks
 * notice. Throwaway harness for turn 019 — run it, read it, delete it.
 *
 *   node scripts/mutate-oneline.js
 *
 * Written as a file rather than a shell one-liner because the mutations contain
 * control characters, and turn 016 already lost an afternoon to a mutation that
 * the shell mangled so it never applied — producing a green suite that proved
 * nothing. Every mutation here asserts that the source actually changed before
 * the suite is allowed to run.
 */

import { readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SRC = "src/shortlist.js";

// `/tmp` is not a path on Windows. The first version hardcoded it, and the
// harness died on the user's machine before restoring anything — harmless only
// because the copy that failed was the FIRST statement. Had it been the last,
// a mutated source would have been left on disk.
//
// Which is the more useful half of this bug: a harness that edits a source file
// must be safe at every line, not just correct when it finishes.
const BACKUP = join(tmpdir(), "sl.mutation-backup");
copyFileSync(SRC, BACKUP);

const CLASS = "[\\u0000-\\u001f\\u007f\\u2028\\u2029]+";

const MUTATIONS = [
  ["no guard at all",
   "`title: ${oneLine(c.title)}`", "`title: ${c.title}`"],

  ["strips only \\n — the naive fix",
   CLASS, "\\n+"],

  // EXPECTED NO-OP, established by scripts/probe-oneline.js: `\s+` on the next
  // line already removes \r, U+2028 and U+2029, so narrowing this class changes
  // nothing observable. Ten payloads, identical output both ways.
  //
  // It stays in the list because "the guards overlap" is worth re-checking if
  // either regex is ever edited — but it is labelled, so the harness does not
  // report a false alarm on every run. A tool that cries wolf gets ignored, and
  // then it is not believed on the run that matters.
  ["misses the Unicode separators",
   CLASS, "[\\u0000-\\u001f\\u007f]+", true],

  ["guards the title but not released",
   '`released: ${oneLine(c.released ?? "unknown")}`', '`released: ${c.released ?? "unknown"}`'],

  ["length cap removed",
   ".slice(0, MAX_FIELD)", ".slice(0)"],
];

let clean = 0;
for (const [name, from, to, expectNoOp = false] of MUTATIONS) {
  copyFileSync(BACKUP, SRC);
  const before = readFileSync(SRC, "utf8");

  if (!before.includes(from)) {
    console.log(`${name.padEnd(36)} SKIPPED — target text not found, mutation never applied`);
    continue;
  }
  writeFileSync(SRC, before.replace(from, to));

  // Turn 016: a mutation that did not apply looks exactly like a check that
  // cannot fail. Prove it landed before reading anything into the result.
  if (readFileSync(SRC, "utf8") === before) {
    console.log(`${name.padEnd(36)} SKIPPED — source unchanged`);
    continue;
  }

  let out;
  try {
    out = execSync("node scripts/check-shortlist.js", { encoding: "utf8" });
  } catch (e) {
    out = e.stdout ?? "";
  }
  const line = (out.match(/(\d+) checks passed, (\d+) failed/) || [])[0] ?? "no result";
  const failed = [...out.matchAll(/FAILED\s+(.+)/g)].map(m => m[1].trim());

  const verdict =
    failed.length ? "caught"
    : expectNoOp ? "no-op, as expected"
    : "*** UNDETECTED ***";
  console.log(`${name.padEnd(36)} ${verdict.padEnd(20)} ${line}`);
  for (const f of failed) console.log(`      ${f}`);

  if (failed.length && expectNoOp) {
    console.log(`      ^ this was expected to change nothing and something caught it.`);
    console.log(`        Either the guards no longer overlap or a check is wrong.`);
    clean++;
  }
  if (!failed.length && !expectNoOp) clean++;
}

copyFileSync(BACKUP, SRC);

// Prove the restore worked rather than assuming it. A harness that leaves a
// mutated source behind and says "restored" is worse than one that crashes.
if (readFileSync(SRC, "utf8") !== readFileSync(BACKUP, "utf8")) {
  console.error(`\nRESTORE FAILED. ${SRC} does not match ${BACKUP}. Fix it before committing.`);
  process.exit(2);
}
console.log(`\nrestored, and verified byte-for-byte against the backup.`);
console.log(clean === 0
  ? `Every mutation that should change behaviour was caught.`
  : `${clean} mutation(s) behaved unexpectedly. Read the lines above.`);
process.exit(clean === 0 ? 0 : 1);
