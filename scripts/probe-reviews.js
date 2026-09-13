/**
 * Can this app show an actual review, or only a number?
 *
 * The "best reviewed recently" row shows a critic score and the size of the
 * panel behind it. The obvious next step is letting somebody read one of those
 * reviews. Whether that is possible is a question about IGDB, not about design.
 *
 * WHY THIS IS A PROBE AND NOT A SENTENCE
 *
 *   One turn ago I stated IGDB had no news, from a migration post that named no
 *   endpoint, and used it to argue for a fourth service and a dependency. The
 *   statement happened to be right and the reasoning was worthless. The same
 *   temptation applies here — "reviews were probably removed in v4" — and the
 *   same answer applies: fourteen requests is cheaper than being confidently
 *   wrong, in either direction.
 *
 * WHAT WOULD HAVE TO BE TRUE
 *
 *   1. AN ENDPOINT EXISTS that returns reviews, or something reviewish.
 *   2. IT CARRIES TEXT OR A LINK. A score with no prose behind it is what the
 *      row already shows; a row of numbers that opens a panel of numbers is not
 *      a feature.
 *   3. IT IS ATTRIBUTABLE. A review belongs to whoever wrote it, and showing
 *      somebody's words without their name on them is not something this project
 *      will do. An author and an outlet are requirements, not fields.
 *   4. IT IS POPULATED for games this app actually shows.
 *
 *   Any one of those failing kills the feature. Failing the third would kill it
 *   even if everything else worked.
 *
 *   node scripts/probe-reviews.js
 *
 * About 16 requests.
 */

import "dotenv/config";
import { igdbRequest } from "../src/igdb.js";

/**
 * v3 had `reviews`, `review_videos` and `feeds`. The rest are plausible v4
 * spellings — IGDB has renamed three things during this project already, so a
 * rename is a likelier explanation than a removal and both have to be ruled out
 * before either is claimed.
 */
const CANDIDATES = [
  "reviews",
  "review",
  "game_reviews",
  "external_reviews",
  "review_videos",
  "critic_reviews",
  "aggregated_ratings",
  "rating_sources",
  "websites",
  "website_types",
];

console.log("=== 1. which endpoints exist ===\n");

const alive = [];

for (const name of CANDIDATES) {
  try {
    const rows = await igdbRequest(name, "fields *; limit 2;");
    const n = Array.isArray(rows) ? rows.length : 0;
    console.log(`  ${name.padEnd(20)} 200   ${n} row${n === 1 ? "" : "s"}`);
    if (n > 0) {
      const keys = [...new Set(rows.flatMap(Object.keys))].sort();
      console.log(`  ${"".padEnd(20)}       ${keys.join(", ")}`);
      console.log(`  ${"".padEnd(20)}       ${JSON.stringify(rows[0]).slice(0, 200)}`);
      alive.push({ name, keys });
    } else {
      console.log(`  ${"".padEnd(20)}       exists, returned nothing`);
    }
  } catch (e) {
    const status = e.status ?? "?";
    console.log(`  ${name.padEnd(20)} ${String(status).padEnd(5)} ${status === 404 ? "not an endpoint" : e.message.slice(0, 70)}`);
  }
}

// --- 2. the only realistic alternative ---------------------------------------
//
// If there is no review endpoint, the nearest thing IGDB has is a website of
// category "review" attached to a game — a LINK to somebody else's review rather
// than the text of one. That is a different and much smaller feature, and it is
// worth knowing whether it exists before deciding there is nothing here.

console.log("\n=== 2. do games carry review links? ===\n");

const types = await igdbRequest("website_types", "fields id, type; limit 40;")
  .catch(e => ({ error: e.status }));

if (Array.isArray(types)) {
  console.log(`  website types: ${types.map(t => `${t.id}=${t.type}`).join(", ")}\n`);
  const reviewish = types.filter(t => /review|critic|metacritic|opencritic/i.test(t.type ?? ""));
  console.log(`  review-shaped types: ${reviewish.length ? reviewish.map(t => `${t.id}=${t.type}`).join(", ") : "none"}`);
} else {
  console.log(`  /website_types unavailable (${types.error}).`);
  console.log(`  The old vocabulary had 1=official, 13=steam, and no review type.`);
}

const NOW = Math.floor(Date.now() / 1000);
const sample = await igdbRequest("games",
  `fields name, websites.url, websites.category, aggregated_rating, aggregated_rating_count;
   where first_release_date < ${NOW} & parent_game = null
         & aggregated_rating_count >= 5 & websites != null;
   sort aggregated_rating desc; limit 3;`);

console.log(`\n  websites attached to three well-reviewed games:\n`);
if (Array.isArray(sample)) {
  for (const g of sample) {
    console.log(`    ${g.name} — ${g.aggregated_rating?.toFixed(0)} from ${g.aggregated_rating_count}`);
    for (const w of (g.websites ?? []).slice(0, 8)) {
      console.log(`      category ${String(w.category).padStart(3)}  ${String(w.url).slice(0, 76)}`);
    }
  }
}

console.log(`
=== what this decides ===

  If nothing above returns review TEXT with an AUTHOR and an OUTLET, the feature
  as asked for cannot be built from this catalogue, and the honest options are:

    - a link out to wherever the score came from, if such a link exists
    - nothing, and the row keeps saying "91 from 6 critics" which is already the
      most it can support

  What this project will NOT do is have the model write a review. It would be
  fluent, unverifiable, and presented next to a real critic score — which is the
  exact shape of the largest known gap in this app (pitfall 1), made worse by
  putting it where a reader expects a human's opinion.
`);
