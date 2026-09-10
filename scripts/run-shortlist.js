/**
 * The whole pipeline from the command line. Filter, candidate set, one model call.
 *
 *   node scripts/run-shortlist.js action pc
 *   node scripts/run-shortlist.js action pc --tags roguelike,difficult
 *   node scripts/run-shortlist.js card linux
 *   node scripts/run-shortlist.js indie nintendo --tags cozy --played 28121
 *
 * Costs one to three catalogue requests and one model call — about half a cent.
 * A failed gate costs two calls, because the response is retried once.
 */

import { assembleCandidates } from "../src/catalogue.js";
import { shortlist } from "../src/shortlist.js";
import { createBudget } from "../src/budget.js";
import { config } from "../src/config.js";
import { readData } from "../src/paths.js";

const args = process.argv.slice(2);
const flag = name => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? null : (args[i + 1] || "");
};

const positional = [];
for (let i = 0; i < args.length; i++) {
  if (args[i].startsWith("--")) { i++; continue; }
  positional.push(args[i]);
}

const [categorySlug, platformArg] = positional;
const tagArg = flag("tags");
const playedIds = (flag("played") || "")
  .split(",").map(s => s.trim()).filter(Boolean).map(Number).filter(Number.isInteger);

if (!categorySlug || !platformArg) {
  console.error("usage: node scripts/run-shortlist.js <category> <platform,platform> [--tags a,b] [--played id,id]");
  process.exit(1);
}

// --- resolve vocabularies, same as run-candidates -----------------------------

let platformIds, platformSlugs, vocabulary, tagSlugs = [];
try {
  const pinned = JSON.parse(readData("data/platforms.json"));
  const bySlug = new Map(pinned.platforms.map(p => [p.slug, p.id]));
  platformSlugs = platformArg.split(",").map(s => s.trim());
  const missing = platformSlugs.filter(s => !bySlug.has(s));
  if (missing.length) {
    console.error(`Unknown platform slug: ${missing.join(", ")}`);
    process.exit(1);
  }
  platformIds = platformSlugs.map(s => bySlug.get(s));

  const tagFile = JSON.parse(readData("data/tags.json"));
  vocabulary = new Set(tagFile.facets.flatMap(f => f.tags.map(t => t.slug)));
  if (tagArg) {
    tagSlugs = tagArg.split(",").map(s => s.trim()).filter(Boolean);
    const bad = tagSlugs.filter(s => !vocabulary.has(s));
    if (bad.length) {
      console.error(`Not in the pinned tag vocabulary: ${bad.join(", ")}`);
      process.exit(1);
    }
  }
} catch (e) {
  console.error(`Run scripts/pin-vocabularies.js and scripts/pin-tags.js first.\n${e.message}`);
  process.exit(1);
}

// --- steps 1 and 2 ------------------------------------------------------------

let assembled;
try {
  assembled = await assembleCandidates({
    categorySlug, platformIds, tagSlugs, vocabulary, playedIds,
  });
} catch (e) {
  console.error(e.kind === "catalogue" ? `CATALOGUE FAILURE: ${e.message}` : e);
  process.exit(1);
}

const { candidates, query } = assembled;
console.log(`\n${candidates.length} candidates from ${query.catalogueCount ?? "?"} the catalogue holds`);
if (tagSlugs.length > 1) console.log(`${query.fullMatches} carry all ${tagSlugs.length} tags`);

// --- step 3 -------------------------------------------------------------------

const request = { categorySlug, platformSlugs, tagSlugs };
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
  console.log(`${p.title}  (${p.released?.slice(0, 4) ?? "?"})`);
  console.log(`${p.case}\n`);
  console.log(`   id ${p.id} · ${p.platforms.join(", ")} · ${p.metacritic ?? "--"} metacritic · ${p.ratingCount} ratings`);
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
