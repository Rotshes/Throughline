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
 * LOWERED FROM 1,000 TO 600 IN TURN 020.
 *
 * The original reasoning read well and was wrong about its own purpose. It
 * justified 1,000 by pointing at `auditory` (1,109) on one side and
 * `4x-explore-expand-exploit-and-exterminate` (686) on the other, and called
 * that "the right place for a line" — while saying in the same breath that the
 * 4X entry is "a genuine niche somebody might want". The line was drawn to
 * exclude a tag the prose argued for keeping.
 *
 * What it actually excluded: `battle-royale` at 708 and `4x` at 686. Neither is
 * a term nobody searches for. Both are exactly the kind of thing a person types
 * into a box like this one.
 *
 * 600 is not a better-reasoned number than 1,000 — it is a threshold chosen to
 * admit two tags that were wrongly excluded, and it is recorded as that rather
 * than dressed up. The real rule is the one this project keeps relearning:
 * **a threshold carried into a context where its reason does not hold is a bug
 * with a good name** (pitfall 24, failure 13, turn 013). This one was not even
 * carried; it disagreed with its own justification on the day it was written.
 *
 * What still gets dropped at 600 is worth reading in the script's own output
 * before the file is committed. The point of printing it is that the line is a
 * judgement, and a judgement nobody looks at is a default.
 */
const MIN_GAMES = 600;

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
