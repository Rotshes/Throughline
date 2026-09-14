/**
 * Steps 1 and 2, end to end, with no model call.
 *
 * This is the whole of turn 005's deliverable: ask for a category, some
 * platforms and optionally some tags, get a candidate set. If this returns games
 * not in that category or not on those platforms, nothing built on top of it can
 * be correct, and no prompt work will fix it.
 *
 *   node scripts/run-candidates.js shooter pc
 *   node scripts/run-candidates.js indie nintendo --tags co-operative
 *   node scripts/run-candidates.js any playstation --machines ps5
 *   node scripts/run-candidates.js strategy pc --played 1020
 *
 * Costs one to three catalogue requests. No model call, no OpenRouter spend.
 *
 * To find out whether several tags narrow or widen, run it with one tag and then
 * two and compare the "catalogue holds" line. (Measured in turn 015 for IGDB:
 * within a facet the ids are OR, across facets AND. `genres = (a,b)` gave 288
 * and `genres = [a,b]` gave 11.)
 *
 * FIXED IN TURN 020, with `run-shortlist.js`. This imported `src/catalogue.js`
 * — RAWG — and read the RAWG vocabularies, while the app went through
 * `src/source.js` to IGDB. It ran without complaint and answered from the wrong
 * catalogue. A tool that is quietly wrong is worse than one that is loudly
 * broken, because only the second kind gets fixed.
 */

import { assembleCandidates, dominanceReport } from "../src/source.js";
import { buildRequest, describeVocabulary } from "./vocab.js";

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

// `"".split(",")` is `[""]`, and `Number("")` is 0, which is an integer. Without
// the filter for empty strings an absent --played flag produced playedIds=[0]
// and an "excluded 1" line on every run. Harmless in effect — no game has id 0 —
// but a count that lies about what the filter did is how a real one hides.
const list = v => (v || "").split(",").map(x => x.trim()).filter(Boolean);

const [categoryArg, familyArg] = positional;
const machines = list(flag("machines"));
const playedIds = list(flag("played")).map(Number).filter(Number.isInteger);

if (!categoryArg || (!familyArg && machines.length === 0)) {
  console.error("usage: node scripts/run-candidates.js <category|any> <family> [--machines a,b] [--tags a,b] [--played id,id]\n");
  console.error(describeVocabulary());
  process.exit(1);
}

// Slugs are checked against the pinned files rather than sent straight through.
// A typo fails here with a readable message instead of reaching the catalogue
// and coming back as an empty pool that looks like a thin filter.
let request;
try {
  request = buildRequest({
    // "any" means no genre filter, the same as the dropdown's default.
    category: categoryArg === "any" ? null : categoryArg,
    family: machines.length ? null : familyArg,
    machines,
    tags: list(flag("tags")),
  });
} catch (e) {
  console.error(`${e.message}\n`);
  console.error(describeVocabulary());
  process.exit(1);
}

const { categorySlug: category, machineSlugs, tagSlugs, selectionSlugs, specific } = request;

// `specific` decides which field the platform verification below reads. A family
// request must be checked against `c.platforms` (families) and a machine request
// against `c.machines`; reading the wrong one would let every candidate look
// off-platform, or every candidate look fine. Criteria 3 and 4 depend on it, so
// it is destructured here rather than recomputed.
const platformArg = selectionSlugs.join(",");

// --- run ---------------------------------------------------------------------

const started = Date.now();
let result;
try {
  result = await assembleCandidates({
    categorySlug: category,
    machineSlugs,
    tagSlugs,
    playedIds,
    libraryEntries: null,
  });
} catch (e) {
  // Criterion 13: a catalogue failure must be legible as a catalogue failure.
  console.error(e.kind === "catalogue" ? `CATALOGUE FAILURE: ${e.message}` : e);
  process.exit(1);
}

const { candidates, query } = result;
const elapsed = ((Date.now() - started) / 1000).toFixed(1);

console.log(`\nfilter: ${category ?? "any kind of game"} on ${platformArg}${tagSlugs.length ? ` tagged ${tagSlugs.join(" + ")}` : ""}`);
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
    `${c.criticScore ?? "--"} critic score`
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
const offCategory = category
  ? candidates.filter(c => !c.categories.includes(category))
  : [];
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

// The old `if (vocabulary)` guard is gone with the RAWG vocabulary loader it
// tested. Under IGDB the vocabularies are mandatory — `scripts/vocab.js` throws
// if `data/tags.igdb.json` is missing — so the report always runs. A condition
// that is now always true is not a guard, it is a line that reads like one.
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
  `widen the filter space far less than the vocabulary's size suggests.`
);

if (candidates.length < 8) {
  console.log(
    `\nWARNING: a pool of ${candidates.length} is barely larger than a shortlist of three. ` +
    `Pitfall 10 — this is not a recommendation, it is the pool minus a few.`
  );
}
