/**
 * Turn the IGDB facet candidates into the vocabulary the product offers.
 *
 * The same step `scripts/pin-tags.js` performs for RAWG, and far smaller: RAWG
 * needed 51 terms hand-picked out of 9,736 scraped ones, where IGDB's themes,
 * game modes and player perspectives are curated lists totalling 35.
 *
 * So the pass is only two rules, and both are decisions rather than tidying:
 *
 *   EROTIC is dropped. It is not being hidden — `src/igdb-catalogue.js` puts
 *   `themes != (erotic)` on every candidate query, verified to remove exactly
 *   the 8,353 games carrying it and no others. Leaving the checkbox out while
 *   the games remained reachable would be the worse of both: a vocabulary that
 *   implies a filter the product does not apply.
 *
 *   ANYTHING WITH TOO LITTLE CATALOGUE is dropped. A term in a dropdown with a
 *   few hundred games behind it is a trap — it looks like a choice and returns
 *   nothing, and criterion 5 forbids widening the filter to compensate. The
 *   floor is printed alongside what it removes so it can be argued with.
 *
 *   node scripts/pin-igdb-tags.js
 *
 * No network. Reads data/tag-candidates.igdb.json, writes data/tags.igdb.json.
 */

import fs from "node:fs";
import path from "node:path";

const dir = path.resolve(process.cwd(), "data");
const src = path.join(dir, "tag-candidates.igdb.json");

if (!fs.existsSync(src)) {
  console.error(`\nNo ${src}. Run npm run igdb:pin first.\n`);
  process.exit(1);
}

const file = JSON.parse(fs.readFileSync(src, "utf8"));

/** Never offered and never returned. See src/igdb-catalogue.js. */
const EXCLUDED = ["erotic"];

/**
 * Below this, a term is a dropdown entry that leads nowhere.
 *
 * 1,000 is roughly 0.3% of the catalogue. `4x-explore-expand-exploit-and-
 * exterminate` at 686 and `auditory` at 1,109 sit either side of it, which is
 * the right place for a line: one is a genuine niche somebody might want, the
 * other is a category almost nobody is searching for by name.
 */
const MIN_GAMES = 1000;

const facets = [];
const dropped = [];

for (const f of file.facets) {
  const tags = [];
  for (const t of f.tags) {
    if (EXCLUDED.includes(t.slug)) {
      dropped.push(`${t.slug} (${t.games.toLocaleString("en-GB")}) — excluded by decision`);
      continue;
    }
    if (t.games < MIN_GAMES) {
      dropped.push(`${t.slug} (${t.games.toLocaleString("en-GB")}) — under ${MIN_GAMES}`);
      continue;
    }
    tags.push({ id: t.id, slug: t.slug, name: t.name, games: t.games });
  }
  facets.push({ id: f.id, label: f.label, field: f.field, tags });
}

fs.writeFileSync(
  path.join(dir, "tags.igdb.json"),
  `${JSON.stringify({ source: "igdb", pinnedAt: new Date().toISOString(), facets }, null, 2)}\n`
);

const kept = facets.reduce((n, f) => n + f.tags.length, 0);

console.log(`\nKept ${kept}, dropped ${dropped.length}.\n`);
for (const f of facets) {
  console.log(`  ${f.label} (${f.field})`);
  console.log(`    ${f.tags.map(t => t.slug).join(", ")}\n`);
}
console.log("Dropped:");
for (const d of dropped) console.log(`  ${d}`);
console.log(`
Written data/tags.igdb.json. Whatever is in it is the entire vocabulary this
product understands — pitfall 9. Read it and decide whether it is good enough
rather than discovering the gap through a user.
`);
