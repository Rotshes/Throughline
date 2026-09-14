/**
 * Reference case 6 — the same filters, three times.
 *
 *   node scripts/case-6-repeatability.js
 *
 * Six model calls, about three cents, plus catalogue requests.
 *
 * ---------------------------------------------------------------------------
 * NOT A GATE. Pitfall 7 says so in the specification: three picks from fifty
 * candidates can legitimately differ run to run, and a check that fires on
 * correct behaviour is worse than no check. This script always exits 0. It
 * prints numbers; it does not judge them.
 *
 * WHY IT MEASURES TWO THINGS AND NOT ONE
 *
 *   The obvious reading of case 6 — run the product three times, count the
 *   overlap — measures something other than what it appears to.
 *
 *   `runRequest` applies a FRESHNESS FILTER. `recentPickIds()` reads what recent
 *   shortlists returned and removes those games from the pool, so that running
 *   the same search twice does not hand back the same three. Overlap through
 *   that path is therefore near zero BY DESIGN, and reporting it as
 *   "repeatability" would describe a deliberate feature as instability.
 *
 *   Case 6 was written before that mechanism existed. So this measures both:
 *
 *     A. THE MODEL, given one fixed candidate set. Three calls to `shortlist()`
 *        with the same pool and no freshness filter. This is the number pitfall
 *        7 is actually about: how much does the model's choice wander when
 *        nothing else does.
 *
 *     B. THE PRODUCT, end to end through `runRequest`. Includes the freshness
 *        filter and whatever the catalogue returns at that moment. Low overlap
 *        here is the system working.
 *
 *   One number would have hidden which of the two it was.
 *
 * A CONFOUND THIS CANNOT REMOVE, ONLY REPORT
 *
 *   `recentPickIds()` reads the database. With no Supabase configured it returns
 *   an empty list, the freshness filter does nothing, and measurement B silently
 *   becomes a second copy of measurement A. The script says which case it is
 *   rather than letting the number be read the wrong way.
 */

import "dotenv/config";
import { assembleCandidates } from "../src/source.js";
import { buildRequest, describeVocabulary } from "./vocab.js";
import { shortlist } from "../src/shortlist.js";
import { runRequest } from "../src/pipeline.js";
import { createBudget } from "../src/budget.js";
import { storeConfigured } from "../src/store.js";
import { config } from "../src/config.js";

const RUNS = 3;

// Resolved from the pinned vocabularies, never typed from memory. See
// vocab.js — two platform slugs written from memory have already been
// wrong once in this project.
//
// The default below was `role-playing-game-rpg` on the first run and the
// resolver rejected it: IGDB's slug is `role-playing-rpg`. Third slug this
// project has got wrong from memory, first one caught before it cost anything.
// The guard was written one hour earlier, for exactly this, and its first catch
// was its own author.
const args = process.argv.slice(2);
const arg = name => { const i = args.indexOf(`--${name}`); return i === -1 ? null : args[i + 1]; };

let REQUEST;
try {
  REQUEST = buildRequest({
    category: arg("category") ?? "role-playing-rpg",
    family: arg("platform") ?? "pc",
  });
} catch (e) {
  console.error(`${e.message}\n`);
  console.error(describeVocabulary());
  console.error(`\nusage: node scripts/case-6-repeatability.js [--category slug] [--platform family]`);
  process.exit(1);
}

const pct = (a, b) => (b === 0 ? "—" : `${Math.round((a / b) * 100)}%`);

/** Games common to every run. The strictest reading of "the same answer". */
function intersectAll(sets) {
  if (sets.length === 0) return [];
  return sets.reduce((acc, s) => acc.filter(id => s.includes(id)));
}

/** Mean overlap across each pair of runs. The softer, more informative figure. */
function pairwise(sets) {
  const pairs = [];
  for (let i = 0; i < sets.length; i++) {
    for (let j = i + 1; j < sets.length; j++) {
      const shared = sets[i].filter(id => sets[j].includes(id));
      pairs.push({ i: i + 1, j: j + 1, shared: shared.length, of: Math.max(sets[i].length, sets[j].length) });
    }
  }
  return pairs;
}

console.log("Reference case 6 — repeatability, as a measurement\n");
console.log(`model:    ${config.model}`);
console.log(`request:  ${REQUEST.categorySlug} on ${REQUEST.selectionSlugs.join(", ")}`);
console.log(`database: ${storeConfigured() ? "configured — the freshness filter is live" : "NOT configured — the freshness filter cannot run"}\n`);

// ===========================================================================
// A. The model, on one fixed candidate set
// ===========================================================================

console.log("=== A. the model, given an identical candidate set each time ===\n");

const assembled = await assembleCandidates({
  categorySlug: REQUEST.categorySlug,
  machineSlugs: REQUEST.machineSlugs,
  tagSlugs: REQUEST.tagSlugs,
  playedIds: [],
  libraryEntries: null,
});
const pool = assembled.candidates;
console.log(`  one candidate set of ${pool.length}, reused for all ${RUNS} calls\n`);

const modelSets = [];
const modelAngles = [];

for (let i = 1; i <= RUNS; i++) {
  const r = await shortlist({
    candidates: pool,
    request: REQUEST,
    budget: createBudget(config.maxCallsPerRequest),
  });

  if (!r.ok) {
    console.log(`  run ${i}: FAILED at ${r.stage} — ${r.problems?.join(" | ") ?? r.failure_reason}`);
    modelSets.push([]);
    modelAngles.push([]);
    continue;
  }

  const ids = r.picks.map(p => p.id);
  modelSets.push(ids);
  modelAngles.push(r.picks.map(p => p.angle));
  console.log(`  run ${i}: ${r.picks.map(p => `${p.id} (${p.angle})`).join(", ")}`);
  for (const p of r.picks) console.log(`          ${p.title}`);
}

// ===========================================================================
// B. The product, end to end
// ===========================================================================

console.log(`\n=== B. the whole request, ${RUNS} times, freshness filter included ===\n`);

const productSets = [];
let repeatsAvoided = [];

// NOT MEASURED, AND SAYING SO RATHER THAN REPORTING A ZERO.
//
// Whether the candidate SET was stable across the three runs would separate
// "the model chose differently" from "it was choosing between different games".
// `runRequest` does not return the candidate ids — it logs them to
// `requests.candidate_ids` and returns only `query`, which has no such field.
//
// The first draft of this script read `r.query.candidateIds`, which does not
// exist, and would have quietly reported an empty set for every run as though
// that were a measurement. That is the failure this whole turn keeps finding, so
// it is written down instead of worked around: to measure it, either read the
// three `requests` rows out of the database afterwards, or change runRequest to
// return what it already logs. Neither belongs in this turn.

for (let i = 1; i <= RUNS; i++) {
  const r = await runRequest(REQUEST);

  if (!r.ok) {
    console.log(`  run ${i}: FAILED at ${r.stage} — ${r.failureReason}`);
    productSets.push([]);
    continue;
  }

  const ids = r.picks.map(p => p.id);
  productSets.push(ids);
  repeatsAvoided.push(r.repeatsAvoided ?? 0);

  console.log(`  run ${i}: ${r.picks.map(p => `${p.id} (${p.angle})`).join(", ")}`);
  console.log(`          ${r.repeatsAvoided ?? 0} recently-shown game(s) stepped aside`);
}

// ===========================================================================
// The numbers
// ===========================================================================

console.log(`\n\n=== what was measured ===\n`);

const aAll = intersectAll(modelSets.filter(s => s.length));
const bAll = intersectAll(productSets.filter(s => s.length));

console.log(`A. THE MODEL, identical input`);
console.log(`   games in all ${RUNS} runs:  ${aAll.length} of 3   (${pct(aAll.length, 3)})`);
for (const p of pairwise(modelSets)) {
  console.log(`   runs ${p.i} and ${p.j} shared ${p.shared} of ${p.of}`);
}
const angleShapes = new Set(modelAngles.filter(a => a.length).map(a => [...a].sort().join(",")));
console.log(`   distinct angle combinations across runs: ${angleShapes.size}`);
console.log(`     ${[...angleShapes].join("  |  ")}`);

console.log(`\nB. THE PRODUCT, end to end`);
console.log(`   games in all ${RUNS} runs:  ${bAll.length} of 3   (${pct(bAll.length, 3)})`);
for (const p of pairwise(productSets)) {
  console.log(`   runs ${p.i} and ${p.j} shared ${p.shared} of ${p.of}`);
}
console.log(`   games held back by freshness per run: ${repeatsAvoided.join(", ") || "—"}`);

console.log(`
=== how to read this ===

  A is the model's own variability with everything else held still. It is the
  figure pitfall 7 is about, and there is no right value for it: high overlap
  means the model has strong preferences within the pool, low overlap means the
  pool holds many defensible answers. Either is compatible with the design.

  B is what a person actually experiences. It SHOULD be lower than A, because
  the freshness filter exists to make it lower. If B is not lower than A, either
  the database was unreachable — see the line at the top — or the pool was too
  thin for freshness to spare anything, which the "stepped aside" counts say.

  Neither number is a pass or a failure. Recorded, per the specification.
`);

// Always zero. A measurement that can fail a build turns into a gate the first
// time somebody wires it into CI, and pitfall 7 is explicit that this must not
// become one.
process.exit(0);
