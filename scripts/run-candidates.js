/**
 * Steps 1 and 2, end to end, with no model call.
 *
 * This is the whole of turn 005's deliverable: ask for a category, some
 * platforms and optionally some tags, get a candidate set. If this returns games
 * not in that category or not on those platforms, nothing built on top of it can
 * be correct, and no prompt work will fix it.
 *
 *   node scripts/run-candidates.js action pc
 *   node scripts/run-candidates.js indie playstation,nintendo --tags cozy
 *   node scripts/run-candidates.js action pc --tags roguelike,difficult
 *   node scripts/run-candidates.js strategy pc --played 3498,4200
 *
 * Costs one to three catalogue requests. No model call, no OpenRouter spend.
 *
 * To find out whether several tags narrow or widen — which the catalogue does
 * not document — run it with one tag and then two, and compare the "catalogue
 * holds" line. If two tags give a smaller number than one, they are combined
 * with AND. If larger, OR.
 */

import { assembleCandidates, dominanceReport } from "../src/catalogue.js";

import { readData } from "../src/paths.js";

const args = process.argv.slice(2);

function flag(name) {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? null : (args[i + 1] || "");
}

const positional = [];
for (let i = 0; i < args.length; i++) {
  if (args[i].startsWith("--")) { i++; continue; }
  positional.push(args[i]);
}

const [categorySlug, platformArg] = positional;
const tagArg = flag("tags");
// `"".split(",")` is `[""]`, and `Number("")` is 0, which is an integer. Without
// the filter for empty strings an absent --played flag produced playedIds=[0]
// and an "excluded 1" line on every run. Harmless in effect — no game has id 0 —
// but a count that lies about what the filter did is how a real one hides.
const playedIds = (flag("played") || "")
  .split(",")
  .map(s => s.trim())
  .filter(Boolean)
  .map(Number)
  .filter(Number.isInteger);

if (!categorySlug || !platformArg) {
  console.error("usage: node scripts/run-candidates.js <category> <platform,platform> [--tags a,b] [--played id,id]");
  console.error("run scripts/pin-vocabularies.js and scripts/pin-tags.js first to see the valid values");
  process.exit(1);
}

// --- resolve the vocabularies -----------------------------------------------
// Slugs are checked against the pinned files rather than sent straight through.
// A typo should fail here with a readable message, not reach the catalogue and
// come back as an empty pool that looks like a thin filter.

// A platform argument may name families ("playstation") or machines
// ("playstation5"). Naming any machine puts the whole request into machine mode,
// because the two are different catalogue parameters and are never sent
// together — see buildPoolQuery.
let platformIds, specific = false;
try {
  const pinned = JSON.parse(readData("data/platforms.json"));
  const familyId = new Map(pinned.platforms.map(p => [p.slug, p.id]));
  const familyChildren = new Map(pinned.platforms.map(p => [p.slug, (p.platforms || []).map(c => c.id)]));
  const machineId = new Map(pinned.platforms.flatMap(p => (p.platforms || []).map(c => [c.slug, c.id])));

  const wanted = platformArg.split(",").map(s => s.trim());
  const missing = wanted.filter(s => !familyId.has(s) && !machineId.has(s));
  if (missing.length) {
    console.error(`Unknown platform: ${missing.join(", ")}`);
    console.error(`Families: ${[...familyId.keys()].join(", ")}`);
    console.error(`Run scripts/pin-vocabularies.js if the machine names are missing.`);
    process.exit(1);
  }

  specific = wanted.some(s => machineId.has(s) && !familyId.has(s));
  platformIds = specific
    ? [...new Set(wanted.flatMap(s =>
        machineId.has(s) ? [machineId.get(s)] : (familyChildren.get(s) ?? [])))]
    : wanted.map(s => familyId.get(s));
} catch (e) {
  console.error(`Could not read data/platforms.json — run scripts/pin-vocabularies.js first.\n${e.message}`);
  process.exit(1);
}

let vocabulary = null;
let tagSlugs = [];
try {
  const pinned = JSON.parse(readData("data/tags.json"));
  vocabulary = new Set(pinned.facets.flatMap(f => f.tags.map(t => t.slug)));
  if (tagArg) {
    tagSlugs = tagArg.split(",").map(s => s.trim()).filter(Boolean);
    const missing = tagSlugs.filter(s => !vocabulary.has(s));
    if (missing.length) {
      console.error(`Not in the pinned tag vocabulary: ${missing.join(", ")}`);
      console.error(`\nA tag not in data/tags.json is one this product cannot offer.`);
      console.error(`Add it to data/tag-candidates.json and re-run scripts/pin-tags.js`);
      console.error(`rather than passing it through untested.`);
      process.exit(1);
    }
  }
} catch (e) {
  if (tagArg) {
    console.error(`Could not read data/tags.json — run scripts/pin-tags.js first.\n${e.message}`);
    process.exit(1);
  }
  // No tags requested and no vocabulary pinned: proceed, keeping every raw tag.
  console.error("note: data/tags.json missing, so candidate tags are unfiltered noise.\n");
}

// --- run ---------------------------------------------------------------------

const started = Date.now();
let result;
try {
  result = await assembleCandidates({
    categorySlug,
    platformIds,
    specific,
    tagSlugs,
    vocabulary,
    playedIds,
  });
} catch (e) {
  // Criterion 13: a catalogue failure must be legible as a catalogue failure.
  console.error(e.kind === "catalogue" ? `CATALOGUE FAILURE: ${e.message}` : e);
  process.exit(1);
}

const { candidates, query } = result;
const elapsed = ((Date.now() - started) / 1000).toFixed(1);

console.log(`\nfilter: ${categorySlug} on ${platformArg}${tagSlugs.length ? ` tagged ${tagSlugs.join(" + ")}` : ""}`);
console.log(`catalogue holds ${query.catalogueCount ?? "?"} games for this filter`);
console.log(`${candidates.length} candidates in ${elapsed}s`);
if (tagSlugs.length > 1) {
  console.log(
    `${query.fullMatches} of them carry all ${tagSlugs.length} tags. The catalogue combines tags with OR,\n` +
    `so the rest carry only some — they are ranked behind the full matches, not discarded.`
  );
}
console.log(
  `pages fetched ${query.pagesFetched}  usable found ${query.usableFound}  ` +
  `pool exhausted ${query.poolExhausted}  excluded ${query.excludedCount}\n`
);

for (const c of candidates) {
  console.log(`${String(c.id).padStart(7)}  ${c.title}`);
  console.log(
    `         ${c.released ?? "unreleased"}  ` +
    `${c.ratingCount} ratings  ` +
    `${c.metacritic ?? "--"} metacritic`
  );
  console.log(`         platforms: ${c.platforms.join(", ")}`);
  if (specific) console.log(`         machines: ${c.machines.join(", ")}`);
  console.log(`         categories: ${c.categories.join(", ")}`);
  if (tagSlugs.length) {
    console.log(`         matched: ${c.matchedTags.length}/${tagSlugs.length}${c.matchedTags.length ? " — " + c.matchedTags.join(", ") : ""}`);
  }
  console.log(`         tags: ${c.tags.length ? c.tags.join(", ") : "none in vocabulary"}`);
  console.log(`         images: ${c.image ? 1 : 0} + ${c.screenshots.length} screenshots, video ${c.video ?? "none"}`);
  console.log("");
}

// --- what the filter actually did --------------------------------------------
// Run here rather than trusted. Criteria 3 and 4, and the weaker tag version.

const wantedPlatforms = platformArg.split(",").map(s => s.trim());
const offPlatform = candidates.filter(c =>
  !(specific ? c.machines : c.platforms).some(p => wantedPlatforms.includes(p))
);
const offCategory = candidates.filter(c => !c.categories.includes(categorySlug));
const offTag = tagSlugs.length
  ? candidates.filter(c => !tagSlugs.some(t => c.tags.includes(t)))
  : [];

console.log("--- what the filter actually did ---");
console.log(`off-platform candidates: ${offPlatform.length}${offPlatform.length ? " — " + offPlatform.map(c => c.title).join(", ") : ""}`);
console.log(`off-category candidates: ${offCategory.length}${offCategory.length ? " — " + offCategory.map(c => c.title).join(", ") : ""}`);

if (tagSlugs.length) {
  console.log(`candidates carrying none of the requested tags: ${offTag.length}${offTag.length ? " — " + offTag.map(c => c.title).join(", ") : ""}`);
  if (offTag.length) {
    console.log(
      `  Not necessarily wrong. The catalogue filtered on these tags, but the tag\n` +
      `  list it returns per record may be partial. It does mean the tag cannot be\n` +
      `  shown to the model as a property of that candidate.`
    );
  }
}

// --- tag dominance ------------------------------------------------------------

if (vocabulary) {
  const d = dominanceReport(candidates);
  console.log(`\n--- tag dominance (turn 005 finding) ---`);
  console.log(`mean vocabulary tags per candidate: ${d.meanTagsPerCandidate}`);
  console.log(`most-tagged in this pool:`);
  for (const m of d.mostTagged) {
    console.log(`  ${String(m.tagCount).padStart(3)} tags  ${String(m.ratingCount).padStart(6)} ratings  ${m.title}`);
  }
  console.log(
    `\nThese are the candidates most likely to reappear under unrelated filters.\n` +
    `If the same titles top this list for cozy, roguelike and horror alike, tags\n` +
    `widen the filter space far less than 51 words suggests.`
  );
}

if (candidates.length < 8) {
  console.log(
    `\nWARNING: a pool of ${candidates.length} is barely larger than a shortlist of three. ` +
    `Pitfall 10 — this is not a recommendation, it is the pool minus a few.`
  );
}
