/**
 * Offline checks for the shortlist gates. No key, no network, no model, no cost.
 *
 * Every assertion runs against a fixture defined in this file — nothing here
 * reads data/, and nothing makes a request. Pitfall 14, which matters more now
 * that two live services are involved.
 *
 * What these catch: a gate that does not fire when it should, and — the harder
 * half — a gate that fires when it should not. Several checks below assert that
 * a *good* response passes, because a gate rejecting everything looks identical
 * to a gate working until someone reads the output.
 *
 *   node scripts/check-shortlist.js
 */

import {
  checkShortlist,
  angleFits,
  formatCandidate,
  describeRequest,
} from "../src/shortlist.js";
import { parseJsonStrict } from "../src/validate.js";

let passed = 0;
const failures = [];

function check(name, fn) {
  try { fn(); passed++; }
  catch (e) { failures.push(`${name}\n    ${e.message}`); }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || "assertion failed"); }
function has(problems, fragment) {
  assert(
    problems.some(p => p.includes(fragment)),
    `expected a problem mentioning "${fragment}"; got:\n      ${problems.join("\n      ") || "(none)"}`
  );
}

// --- fixtures ----------------------------------------------------------------

const ANGLES = [
  { id: "safe-pick", label: "the safe pick", constraint: null },
  { id: "deep-cut", label: "the deep cut", constraint: null },
  {
    id: "with-someone", label: "the one to play with someone",
    constraint: { kind: "anyTag", tags: ["co-op", "multiplayer"] },
  },
  {
    id: "hard-one", label: "the hard one",
    constraint: { kind: "anyTag", tags: ["difficult"] },
  },
  {
    id: "short-one", label: "the short one",
    constraint: { kind: "maxPlaytime", hours: 12 },
  },
];

function candidate(over = {}) {
  return {
    id: 1, title: "Fixture", platforms: ["pc"], categories: ["action"],
    tags: ["difficult"], playtime: 8, metacritic: 90, ratingCount: 1000,
    released: "2020-01-01", ...over,
  };
}

const CANDIDATES = [
  candidate({ id: 1, title: "One" }),
  candidate({ id: 2, title: "Two" }),
  candidate({ id: 3, title: "Three" }),
];

const REQUEST = { categorySlug: "action", platformSlugs: ["pc"], tagSlugs: ["difficult"] };

const GOOD = [
  { id: 1, angle: "safe-pick", case: "x".repeat(50) },
  { id: 2, angle: "deep-cut", case: "x".repeat(50) },
  { id: 3, angle: "hard-one", case: "x".repeat(50) },
];

// --- the gate must not fire on a good response --------------------------------

check("a valid shortlist passes every gate", () => {
  const r = checkShortlist(GOOD, CANDIDATES, REQUEST, ANGLES);
  assert(r.ok, `a good response was rejected: ${r.problems.join(" | ")}`);
});

check("a request with no tags still passes", () => {
  const r = checkShortlist(GOOD, CANDIDATES, { categorySlug: "action", platformSlugs: ["pc"] }, ANGLES);
  assert(r.ok, r.problems.join(" | "));
});

check("a game on several platforms passes on any one of them", () => {
  const many = [candidate({ id: 1, platforms: ["playstation", "pc", "xbox"] })];
  const r = checkShortlist(
    [{ id: 1, angle: "safe-pick", case: "x".repeat(50) }],
    many, { categorySlug: "action", platformSlugs: ["pc"] }, ANGLES
  );
  assert(r.ok, r.problems.join(" | "));
});

// --- criterion 2, the spine ---------------------------------------------------

check("an id that was not in the candidate set is rejected", () => {
  const picks = [{ id: 999, angle: "safe-pick", case: "x".repeat(50) }, GOOD[1], GOOD[2]];
  const r = checkShortlist(picks, CANDIDATES, REQUEST, ANGLES);
  assert(!r.ok);
  has(r.problems, "999");
  has(r.problems, "may only choose from the set");
});

check("an unknown id stops the other checks for that pick, not for the rest", () => {
  // Without the `continue`, every later check would dereference an undefined
  // candidate and the failure would be a TypeError instead of a message.
  const picks = [{ id: 999, angle: "nonsense", case: "x".repeat(50) }, GOOD[1], GOOD[2]];
  const r = checkShortlist(picks, CANDIDATES, REQUEST, ANGLES);
  assert(!r.ok);
  assert(r.problems.length === 1, `expected only the id problem; got ${r.problems.length}`);
});

check("the same game twice is rejected", () => {
  const picks = [GOOD[0], { id: 1, angle: "deep-cut", case: "x".repeat(50) }, GOOD[2]];
  const r = checkShortlist(picks, CANDIDATES, REQUEST, ANGLES);
  assert(!r.ok);
  has(r.problems, "appears twice");
});

// --- criteria 3, 4, 4a --------------------------------------------------------

check("a game not on a selected platform is rejected", () => {
  const cands = [candidate({ id: 1, platforms: ["playstation"] }), CANDIDATES[1], CANDIDATES[2]];
  const r = checkShortlist(GOOD, cands, REQUEST, ANGLES);
  assert(!r.ok);
  has(r.problems, "none of the selected");
});

check("a game not carrying the selected category is rejected", () => {
  const cands = [candidate({ id: 1, categories: ["puzzle"] }), CANDIDATES[1], CANDIDATES[2]];
  const r = checkShortlist(GOOD, cands, REQUEST, ANGLES);
  assert(!r.ok);
  has(r.problems, "not classified as action");
});

check("a game carrying none of the selected tags is rejected", () => {
  const cands = [candidate({ id: 1, tags: ["cozy"] }), CANDIDATES[1], CANDIDATES[2]];
  // Angle changed so the failure is the tag check and not the hard-one constraint.
  const picks = [{ id: 1, angle: "safe-pick", case: "x".repeat(50) }, GOOD[1], GOOD[2]];
  const r = checkShortlist(picks, cands, REQUEST, ANGLES);
  assert(!r.ok);
  has(r.problems, "does not list");
});

// --- criterion 5, the count ---------------------------------------------------

check("three picks are expected from a full candidate set", () => {
  const r = checkShortlist([GOOD[0], GOOD[1]], CANDIDATES, REQUEST, ANGLES);
  assert(!r.ok);
  has(r.problems, "Returned 2 picks; 3 expected");
});

check("two picks are correct from a set of two", () => {
  const two = [CANDIDATES[0], CANDIDATES[1]];
  const r = checkShortlist([GOOD[0], GOOD[1]], two, REQUEST, ANGLES);
  assert(r.ok, `a thin set must not be padded, nor rejected: ${r.problems.join(" | ")}`);
});

check("a fourth pick is rejected even when every id is valid", () => {
  const four = [...CANDIDATES, candidate({ id: 4, title: "Four" })];
  const picks = [...GOOD, { id: 4, angle: "short-one", case: "x".repeat(50) }];
  const r = checkShortlist(picks, four, REQUEST, ANGLES);
  assert(!r.ok);
  has(r.problems, "Returned 4 picks; 3 expected");
});

// --- criterion 6, the angles --------------------------------------------------

check("an angle outside the vocabulary is rejected", () => {
  const picks = [{ id: 1, angle: "the-vibey-one", case: "x".repeat(50) }, GOOD[1], GOOD[2]];
  const r = checkShortlist(picks, CANDIDATES, REQUEST, ANGLES);
  assert(!r.ok);
  has(r.problems, "not an angle in the vocabulary");
});

check("the same angle twice is rejected", () => {
  const picks = [GOOD[0], { id: 2, angle: "safe-pick", case: "x".repeat(50) }, GOOD[2]];
  const r = checkShortlist(picks, CANDIDATES, REQUEST, ANGLES);
  assert(!r.ok);
  has(r.problems, "used more than once");
});

check("a constrained angle on a game that does not support it is rejected", () => {
  // The whole reason the vocabulary is split. A free-text reason field could
  // never catch a singleplayer game labelled as one to play with someone.
  const cands = [candidate({ id: 1, tags: ["difficult"] }), CANDIDATES[1], CANDIDATES[2]];
  const picks = [{ id: 1, angle: "with-someone", case: "x".repeat(50) }, GOOD[1], GOOD[2]];
  const r = checkShortlist(picks, cands, REQUEST, ANGLES);
  assert(!r.ok);
  has(r.problems, "needs one of");
});

// --- angleFits ----------------------------------------------------------------

check("an unconstrained angle always fits", () => {
  assert(angleFits(ANGLES[0], candidate({ tags: [] })).ok);
  assert(angleFits({ id: "x", label: "x" }, candidate()).ok, "a missing constraint key is not a constraint");
});

check("anyTag passes on any one of its tags", () => {
  const a = ANGLES[2];
  assert(angleFits(a, candidate({ tags: ["multiplayer"] })).ok);
  assert(angleFits(a, candidate({ tags: ["co-op", "cozy"] })).ok);
});

check("anyTag fails when the catalogue lists none of them", () => {
  const r = angleFits(ANGLES[2], candidate({ tags: ["cozy"] }));
  assert(!r.ok);
  assert(r.reason.includes("the catalogue lists [cozy]"), r.reason);
});

check("anyTag names what it wanted and what it found", () => {
  // The reason has to be readable, because pitfall 18 means some of these
  // rejections will be wrong and the false-rejection rate has to be judgeable.
  const r = angleFits(ANGLES[2], candidate({ tags: [] }));
  assert(r.reason.includes("co-op"), "must name the tags it needed");
  assert(r.reason.includes("none"), "must say the game had none");
});

check("maxPlaytime passes under the limit and at it", () => {
  assert(angleFits(ANGLES[4], candidate({ playtime: 4 })).ok);
  assert(angleFits(ANGLES[4], candidate({ playtime: 12 })).ok, "at the boundary, not past it");
});

check("maxPlaytime fails over the limit", () => {
  const r = angleFits(ANGLES[4], candidate({ playtime: 60 }));
  assert(!r.ok);
  assert(r.reason.includes("60h"), r.reason);
});

check("maxPlaytime treats an unrecorded playtime as unknown, not as zero", () => {
  // The catalogue writes 0 when it does not know. Reading that as "very short"
  // would label every obscure game the short one.
  const r = angleFits(ANGLES[4], candidate({ playtime: 0 }));
  assert(!r.ok, "0 hours must not pass a 12-hour limit");
  assert(r.reason.includes("no recorded playtime") || r.reason.includes("has none"), r.reason);
});

check("an unknown constraint kind fails rather than passing", () => {
  // A gate that silently does nothing is worse than no gate, because it is
  // trusted. A typo in angles.json must break loudly.
  const r = angleFits({ id: "x", label: "x", constraint: { kind: "vibes" } }, candidate());
  assert(!r.ok);
  assert(r.reason.includes("unknown constraint kind"), r.reason);
});

// --- what the model is shown --------------------------------------------------

check("formatCandidate shows the id and never asks for it back", () => {
  const text = formatCandidate(CANDIDATES[0], ["difficult"]);
  assert(text.includes("id: 1"));
  assert(text.includes("title: One"), text);
  assert(text.includes("matches what they asked for: difficult"));
});

check("formatCandidate says a playtime is unrecorded rather than showing 0", () => {
  const text = formatCandidate(candidate({ playtime: 0 }), []);
  assert(text.includes("not recorded"), text);
  assert(!text.includes("0 hours"), "0 would read as instant");
});

check("formatCandidate omits the match line when no tags were requested", () => {
  assert(!formatCandidate(CANDIDATES[0], []).includes("matches what they asked for"));
});

check("formatCandidate survives missing fields", () => {
  const text = formatCandidate({ id: 9, title: "Bare" }, []);
  assert(text.includes("id: 9") && text.includes("unknown") && text.includes("none"));
});

check("describeRequest reads as a request", () => {
  assert(
    describeRequest({ categorySlug: "action", platformSlugs: ["pc"], tagSlugs: ["roguelike", "difficult"] })
      === "action games on pc that are roguelike and difficult"
  );
  assert(describeRequest({ categorySlug: "indie", platformSlugs: ["pc", "nintendo"] })
    === "indie games on pc or nintendo");
});

// --- parsing ------------------------------------------------------------------

check("parseJsonStrict recovers fenced JSON", () => {
  const r = parseJsonStrict('```json\n{"picks":[]}\n```');
  assert(r.ok && Array.isArray(r.value.picks));
});

check("parseJsonStrict refuses prose", () => {
  assert(parseJsonStrict("Here are three great games for you!").ok === false);
});

// --- report -------------------------------------------------------------------

console.log(`\n${passed} checks passed, ${failures.length} failed\n`);
if (failures.length) {
  for (const f of failures) console.log(`FAILED  ${f}\n`);
  process.exit(1);
}
console.log("Offline, against fixtures. They say nothing about what the model returns —");
console.log("run scripts/run-shortlist.js for that.");
