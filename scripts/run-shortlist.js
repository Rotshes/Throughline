/**
 * The whole pipeline from the command line. Filter, candidate set, one model call.
 *
 *   node scripts/run-shortlist.js shooter pc
 *   node scripts/run-shortlist.js shooter pc --tags co-operative
 *   node scripts/run-shortlist.js --any nintendo --machines switch
 *   node scripts/run-shortlist.js adventure playstation --played 1020
 *
 * Costs one to three catalogue requests and one model call — about half a cent.
 * A failed gate costs two calls, because the response is retried once.
 *
 * FIXED IN TURN 020. This script imported `src/catalogue.js` directly — the RAWG
 * module — and read `data/platforms.json` and `data/tags.json`, the RAWG
 * vocabularies, while the app went through `src/source.js` to IGDB. It had done
 * so since the migration.
 *
 * It did not crash. With a RAWG key still in the environment it ran happily and
 * printed a correct-looking shortlist drawn from a catalogue the product no
 * longer uses — which is worse than crashing, and is why "it still works" was
 * never evidence of anything.
 *
 * `src/source.js` says everything in the project imports from it rather than
 * from either module. That sentence was false for this file and for
 * `run-candidates.js` for five turns.
 */

import { assembleCandidates } from "../src/source.js";
import { buildRequest, describeVocabulary } from "./vocab.js";
import { shortlist } from "../src/shortlist.js";
import { createBudget } from "../src/budget.js";
import { config } from "../src/config.js";

const args = process.argv.slice(2);
const flag = name => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? null : (args[i + 1] || "");
};
const has = name => args.includes(`--${name}`);

const positional = [];
for (let i = 0; i < args.length; i++) {
  if (args[i].startsWith("--")) { i++; continue; }
  positional.push(args[i]);
}

const list = v => (v || "").split(",").map(x => x.trim()).filter(Boolean);

const [categoryArg, familyArg] = positional;
const machines = list(flag("machines"));
const playedIds = list(flag("played")).map(Number).filter(Number.isInteger);

if (!familyArg && machines.length === 0) {
  console.error("usage: node scripts/run-shortlist.js <category|--any> <family> [--machines a,b] [--tags a,b] [--played id,id]\n");
  console.error(describeVocabulary());
  process.exit(1);
}

let request;
try {
  request = buildRequest({
    // `--any` is a real request meaning "any kind of game", not a missing value.
    category: has("any") ? null : (categoryArg ?? null),
    family: machines.length ? null : familyArg,
    machines,
    tags: list(flag("tags")),
  });
  request.playedIds = playedIds;
} catch (e) {
  console.error(`${e.message}\n`);
  console.error(describeVocabulary());
  process.exit(1);
}

// Only what this file needs by name. The full `request` object goes to
// shortlist() untouched — it carries platformSlugs, selectionSlugs and specific,
// which describeRequest and the platform gate both read.
const { categorySlug, machineSlugs, tagSlugs } = request;

// --- steps 1 and 2 ------------------------------------------------------------

let assembled;
try {
  assembled = await assembleCandidates({
    categorySlug, machineSlugs, tagSlugs, playedIds,
    // Carried so the exclusion refuses to run across catalogues rather than
    // silently matching nothing — see db/migration-004-library-source.sql.
    libraryEntries: null,
  });
} catch (e) {
  console.error(e.kind === "catalogue" ? `CATALOGUE FAILURE: ${e.message}` : e);
  process.exit(1);
}

const { candidates, query } = assembled;
console.log(`\n${candidates.length} candidates from ${query.catalogueCount ?? "?"} the catalogue holds`);
if (tagSlugs.length > 1) console.log(`${query.fullMatches} carry all ${tagSlugs.length} tags`);

// --- step 3 -------------------------------------------------------------------

const budget = createBudget(config.maxCallsPerRequest);

if (candidates.length === 0) {
  // Said before the call rather than after, because there is no call. Printing
  // "asking the model for 0" and then not asking is the same defect as the
  // "excluded 1" line in turn 005: output that describes work never done.
  console.log(
    `Nothing to ask. The catalogue holds ${query.catalogueCount ?? "?"} games for this filter and ` +
    `${query.usableFound} of them cleared the rating threshold.\n` +
    `No model call will be made — criterion 5. Confirm that in logs/model-calls.jsonl\n` +
    `rather than from this line: a screen saying nothing ran is not evidence nothing ran.\n`
  );
} else {
  console.log(`asking ${config.model} for ${Math.min(3, candidates.length)}...\n`);
}

const started = Date.now();
const result = await shortlist({ candidates, request, budget });
const elapsed = ((Date.now() - started) / 1000).toFixed(1);

if (!result.ok) {
  console.error(`FAILED at "${result.stage}" after ${result.calls} call(s), ${elapsed}s\n`);
  if (result.problems) {
    console.error("Gates that rejected the response:");
    for (const p of result.problems) console.error(`  - ${p}`);
    console.error(
      `\nThis is the system working. A response that fails a gate is not shown as a\n` +
      `partial result — criterion 12. What matters is which gate, and whether it\n` +
      `was right to fire.`
    );
  } else {
    console.error(result.failure_reason);
  }
  if (result.raw) console.error(`\nRaw:\n${JSON.stringify(result.raw, null, 2).slice(0, 1500)}`);
  process.exit(1);
}

for (const p of result.picks) {
  console.log(`── ${p.angleLabel.toUpperCase()} ─────────────────────────`);
  // Written by code from the catalogue record. Null for beautiful-one, which
  // has no fact behind it.
  if (p.angleReason) console.log(`${p.angleReason}`);
  console.log(`${p.title}  (${p.released?.slice(0, 4) ?? "?"})`);
  console.log(`${p.case}\n`);
  for (const n of p.tagNotes ?? []) {
    console.log(`   ${n.tag}: ${n.how}`);
  }
  if (p.tagNotes?.length) console.log("");
  console.log(`   id ${p.id} · ${p.platforms.join(", ")} · ${p.criticScore ?? "--"} critic score · ${p.ratingCount} ratings`);
  console.log(`   tags: ${p.tags.join(", ") || "none"}`);
  console.log(`   image: ${p.image ?? "none"}`);
  console.log("");
}

const u = result.usage;
console.log(
  `${result.calls} call(s), ${elapsed}s, ${u.tokens_in ?? "?"} in / ${u.tokens_out ?? "?"} out, ` +
  `$${u.cost_usd?.toFixed(5) ?? "?"}   prompt ${result.prompt.file} v${result.prompt.version} ${result.prompt.sha256}`
);
console.log(`budget: ${budget.used} of ${budget.max} calls used`);
