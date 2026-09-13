/**
 * Offline checks for the library's pure parts. No key, no network, no cost.
 *
 * What these cover: the status vocabulary, and validation of a status before it
 * reaches the database. A bad value must be refused with a readable message
 * rather than surfacing as a Postgres CHECK violation inside a 500.
 *
 * What these cannot cover: the reads and writes themselves. Those need Supabase
 * and are exercised through the interface.
 *
 * The vocabulary IS read from data/statuses.json here, unlike every other check
 * in this project, and that is deliberate: the file is the contract between the
 * table's CHECK constraint, the function and the browser. A fixture would
 * happily pass while the real file drifted out of step with the schema, which
 * is the one failure worth catching.
 *
 *   node scripts/check-library.js
 */

import fs from "node:fs";
import { statuses, statusIds, defaultStatus, isValidStatus, upsertEntry } from "../src/library.js";

let passed = 0;
const failures = [];

function check(name, fn) {
  try { fn(); passed++; }
  catch (e) { failures.push(`${name}\n    ${e.message}`); }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || "assertion failed"); }

/**
 * The async variant, and the reason it exists.
 *
 * `check` above calls fn() and increments on no throw. Handed an async function
 * it would increment on the promise being *created*, count every case as a
 * pass, and surface a failed assertion as an unhandled rejection after the
 * report had already printed a clean result. That is a check that cannot fail,
 * which is the oldest rule in CLAUDE.md.
 */
const pending = [];
function checkAsync(name, fn) {
  pending.push(
    Promise.resolve()
      .then(fn)
      .then(() => { passed++; })
      .catch(e => { failures.push(`${name}\n    ${e.message}`); })
  );
}

// --- the vocabulary -----------------------------------------------------------

check("there are five statuses, each with an id, a label and a meaning", () => {
  const list = statuses();
  assert(list.length === 5, `got ${list.length}`);
  for (const s of list) {
    assert(typeof s.id === "string" && s.id, `id missing on ${JSON.stringify(s)}`);
    assert(typeof s.label === "string" && s.label, `label missing on ${s.id}`);
    assert(typeof s.meaning === "string" && s.meaning, `meaning missing on ${s.id}`);
  }
});

check("status ids are unique", () => {
  const ids = statusIds();
  assert(new Set(ids).size === ids.length, `duplicates in ${ids}`);
});

check("exactly one status is the default", () => {
  // Adding a game you have just been shown means the default. Two defaults, or
  // none, and that choice becomes whichever happens to be first in the file.
  const defaults = statuses().filter(s => s.default);
  assert(defaults.length === 1, `got ${defaults.length}`);
  assert(defaultStatus() === defaults[0].id);
});

check("the default is plan to play", () => {
  assert(defaultStatus() === "plan", `got ${defaultStatus()}`);
});

// --- the file and the schema must agree ---------------------------------------

check("every status in the file is allowed by the table's CHECK constraint", () => {
  // The one thing a fixture could not catch. The migration hard-codes the five
  // values; if somebody adds a sixth to the JSON, every attempt to use it would
  // fail at the database with an error nobody reading the interface could
  // interpret.
  const sql = fs.readFileSync(new URL("../db/migration-003-library.sql", import.meta.url), "utf8");
  const clause = sql.match(/status\s+text\s+not\s+null\s+check\s*\(status\s+in\s*\(([^)]*)\)/i);
  assert(clause, "could not find the CHECK constraint in migration-003");

  const allowed = new Set(
    clause[1].split(",").map(s => s.trim().replace(/^'|'$/g, "")).filter(Boolean)
  );

  for (const id of statusIds()) {
    assert(allowed.has(id), `"${id}" is in data/statuses.json but the table would reject it`);
  }
  for (const id of allowed) {
    assert(statusIds().includes(id), `"${id}" is allowed by the table but not offered anywhere`);
  }
});

// --- validation ---------------------------------------------------------------

check("every real status validates", () => {
  for (const id of statusIds()) assert(isValidStatus(id), id);
});

check("anything else does not", () => {
  for (const bad of ["", "PLAYING", "finished", "plan ", null, undefined, 3, {}, ["plan"]]) {
    assert(isValidStatus(bad) === false, `${JSON.stringify(bad)} was accepted`);
  }
});

check("validation is case sensitive and does not trim", () => {
  // Deliberate. These are ids stored verbatim in a column with a CHECK
  // constraint, not user-facing text — quietly repairing them here would let a
  // caller send anything and hide where it came from.
  assert(isValidStatus("Plan") === false);
  assert(isValidStatus(" plan") === false);
});

// --- the source column -------------------------------------------------------
//
// Added with migration 004. A RAWG id and an IGDB id are both integers and name
// different games, so every stored id carries which catalogue it came from.
// These checks are about the case where it does not.

checkAsync("an entry without a source is refused rather than defaulted", async () => {
  // Defaulting would write a permanent claim about which catalogue an integer
  // came from, made by code that did not know. The row outlives the guess.
  const r = await upsertEntry({ gameId: 1, status: "plan", title: "A Game" });
  assert(r.ok === false, "an entry with no source must not be written");
  assert(/source/i.test(r.reason), r.reason);
});

checkAsync("an invented source is refused", async () => {
  const r = await upsertEntry({ gameId: 1, source: "igdb ", status: "plan", title: "A Game" });
  assert(r.ok === false, "only the two known catalogues are acceptable");
});

await Promise.all(pending);

// --- report -------------------------------------------------------------------

console.log(`\n${passed} checks passed, ${failures.length} failed\n`);
if (failures.length) {
  for (const f of failures) console.log(`FAILED  ${f}\n`);
  process.exit(1);
}
console.log("These cover the vocabulary and its agreement with the schema.");
console.log("The reads and writes need Supabase and are exercised through the interface.");
