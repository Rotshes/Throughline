/**
 * Offline checks for the recently-suggested strip. No key, no network, no cost.
 *
 * One rule here matters more than the rest and is easy to get wrong by being
 * helpful: **the title is the one that was recorded, not the one the catalogue
 * returns now.**
 *
 * `requests.picks` is a record of what a person was actually shown, and
 * criterion 15 ties a click to the text that persuaded them. Quietly replacing a
 * recorded title with a fresher one would make the record describe something
 * that never happened — and it would look like an improvement in the diff.
 *
 *   node scripts/check-suggested.js
 */

import { attachCovers } from "../src/suggested.js";

let passed = 0;
const failures = [];

function check(name, fn) {
  try { fn(); passed++; }
  catch (e) { failures.push(`${name}\n    ${e.message}`); }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || "assertion failed"); }

// --- fixtures ----------------------------------------------------------------

const PICKS = [
  { id: 1029, title: "A Game", angleLabel: "the safe pick" },
  { id: 2044, title: "Another Game", angleLabel: "the deep cut" },
];

const GAMES = [
  { id: 1029, cover: { image_id: "co1" } },
  { id: 2044, cover: { image_id: "co2" } },
];

// --- the ordinary case --------------------------------------------------------

check("a pick gains a cover and keeps its angle", () => {
  const out = attachCovers(PICKS, GAMES);
  assert(out.length === 2);
  assert(out[0].cover === "https://images.igdb.com/igdb/image/upload/t_cover_big/co1.jpg", out[0].cover);
  assert(out[0].angleLabel === "the safe pick");
});

check("order is the record's, not the catalogue's", () => {
  // The catalogue returns ids in whatever order it likes. This list is "newest
  // first" and that ordering is the only thing making it a record rather than a
  // set.
  const out = attachCovers(PICKS, [GAMES[1], GAMES[0]]);
  assert(out.map(p => p.id).join() === "1029,2044", `got ${out.map(p => p.id)}`);
});

// --- the rule that matters -----------------------------------------------------

check("the recorded title wins over a fresher one", () => {
  // The catalogue now calls it something else. The record says what somebody was
  // shown, and criterion 15 ties a click to that text.
  const renamed = [{ id: 1029, name: "A Game: Definitive Edition", cover: { image_id: "co1" } }];
  const out = attachCovers(PICKS, renamed);
  assert(out[0].title === "A Game", `got ${out[0].title}`);
});

check("a pick with no title is dropped rather than rendered blank", () => {
  const out = attachCovers([{ id: 7, angleLabel: "x" }, ...PICKS], GAMES);
  assert(out.length === 2, `got ${out.length}`);
});

// --- what is missing ------------------------------------------------------------

check("a game the catalogue no longer returns keeps its place, coverless", () => {
  // It was still shown to somebody. Dropping it would quietly shorten a record.
  const out = attachCovers(PICKS, [GAMES[0]]);
  assert(out.length === 2, `got ${out.length}`);
  assert(out[1].cover === null, `got ${out[1].cover}`);
});

check("no games at all leaves every pick coverless rather than empty", () => {
  // The catalogue being down costs the pictures. The titles and the angles came
  // from this project's own records and are still true.
  const out = attachCovers(PICKS, []);
  assert(out.length === 2);
  assert(out.every(p => p.cover === null));
});

check("a game with no cover contributes none", () => {
  const out = attachCovers(PICKS, [{ id: 1029, cover: null }, GAMES[1]]);
  assert(out[0].cover === null);
  assert(out[1].cover !== null);
});

check("an angle that was never recorded is null, not the string undefined", () => {
  const out = attachCovers([{ id: 1029, title: "A Game" }], GAMES);
  assert(out[0].angleLabel === null, `got ${out[0].angleLabel}`);
});

// --- malformed input --------------------------------------------------------------

check("non-integer ids are dropped from both sides", () => {
  const out = attachCovers(
    [{ id: "1029", title: "A Game" }, PICKS[0]],
    [{ id: "1029", cover: { image_id: "bad" } }, GAMES[0]]
  );
  assert(out.length === 1, `got ${out.length}`);
  assert(out[0].cover.includes("co1"), out[0].cover);
});

check("nothing at all returns an empty list rather than throwing", () => {
  // This strip sits above the find form. Losing it must not cost anybody the
  // form underneath.
  assert(attachCovers(null, null).length === 0);
  assert(attachCovers(undefined, undefined).length === 0);
  assert(attachCovers("picks", "games").length === 0);
});

// --- report -------------------------------------------------------------------------

console.log(`\n${passed} checks passed, ${failures.length} failed\n`);
if (failures.length) {
  for (const f of failures) console.log(`FAILED  ${f}\n`);
  process.exit(1);
}
console.log("Offline, against fixtures. Whether anything has been recorded at all is a");
console.log("question for the database, and an empty strip is the right answer to both");
console.log("'nothing yet' and 'could not read it' — the only list here where it is.");
