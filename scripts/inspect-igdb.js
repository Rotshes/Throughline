/**
 * Exercise the IGDB transport against the live service.
 *
 * scripts/check-igdb.js covers the pure parts offline. The three things that
 * make this module different from RAWG's — a token that expires, a rate limit
 * that can be hit, and a query language in the body — need a network, so they
 * are checked here instead, with real requests and printed output.
 *
 * The rate limiter especially. It is the kind of code that looks obviously
 * correct and deadlocks, or lets six requests through and collects a 429. Firing
 * a burst at it and printing the arrival times is the only way to see which.
 *
 *   node scripts/inspect-igdb.js
 *
 * About 10 requests.
 */

import { igdbRequest, igdbCount, imageUrl, youTubeUrl, __resetAuthForTests } from "../src/igdb.js";

const started = Date.now();
const since = () => `${String(Date.now() - started).padStart(5)}ms`;

// --- 1. the token, and the fact that it is fetched once ----------------------

console.log("=== 1. authentication ===\n");
__resetAuthForTests();

const t0 = Date.now();
await igdbCount("games", "id = 1");
console.log(`  first request (mints a token):  ${Date.now() - t0}ms`);

const t1 = Date.now();
await igdbCount("games", "id = 1");
console.log(`  second request (cached token):  ${Date.now() - t1}ms`);
console.log(`  -> the second should be markedly faster. If it is not, the token`);
console.log(`     cache is not working and every request is paying for a Twitch`);
console.log(`     round trip it does not need.\n`);

// --- 2. the rate limiter under a burst ---------------------------------------
//
// Six at once against a limit of four per second. Requests five and six must
// arrive about a second late, and none may fail.

console.log("=== 2. six concurrent requests, limit is four per second ===\n");

const burst = await Promise.all(
  Array.from({ length: 6 }, (_, i) =>
    igdbCount("games", `id = ${i + 1}`)
      .then(() => ({ i, at: Date.now() - started, ok: true }))
      .catch(e => ({ i, at: Date.now() - started, ok: false, why: e.message }))
  )
);

for (const r of burst.sort((a, b) => a.at - b.at)) {
  console.log(`  request ${r.i + 1}  ${String(r.at).padStart(6)}ms  ${r.ok ? "ok" : `FAILED ${r.why}`}`);
}
const failed = burst.filter(r => !r.ok);
const spread = Math.max(...burst.map(r => r.at)) - Math.min(...burst.map(r => r.at));
console.log(`\n  ${failed.length} failed, spread ${spread}ms`);
console.log(`  -> a spread near zero means the limiter is not limiting and a 429`);
console.log(`     is waiting for a busier moment. A spread near 1100ms with no`);
console.log(`     failures is the limiter doing its job.\n`);

// --- 3. a real record, shaped the way a candidate will be --------------------
//
// The query a candidate set will actually make, with every expansion it needs,
// to confirm one request can carry the whole shape rather than three.

console.log("=== 3. one request carrying a full candidate ===\n");

const NOW = Math.floor(Date.now() / 1000);
const games = await igdbRequest("games",
  `fields name, slug, summary, first_release_date, aggregated_rating,
          aggregated_rating_count, total_rating_count, game_type, parent_game,
          cover.image_id, screenshots.image_id, videos.video_id, videos.name,
          genres.slug, genres.name, themes.slug, platforms.slug,
          platforms.abbreviation, involved_companies.company.name;
   where first_release_date < ${NOW} & aggregated_rating != null
         & parent_game = null & aggregated_rating_count >= 5
         & cover != null & videos != null;
   sort aggregated_rating desc; limit 2;`);

for (const g of games) {
  console.log(`  ${g.name}`);
  console.log(`    released      ${new Date(g.first_release_date * 1000).toISOString().slice(0, 10)}`);
  console.log(`    rating        ${g.aggregated_rating?.toFixed(0)} from ${g.aggregated_rating_count} reviews`);
  console.log(`    genres        ${(g.genres ?? []).map(x => x.slug).join(", ") || "(none)"}`);
  console.log(`    themes        ${(g.themes ?? []).map(x => x.slug).join(", ") || "(none)"}`);
  console.log(`    platforms     ${(g.platforms ?? []).map(x => x.abbreviation ?? x.slug).join(", ")}`);
  console.log(`    companies     ${(g.involved_companies ?? []).map(c => c.company?.name).filter(Boolean).join(", ")}`);
  console.log(`    summary       ${g.summary ? `${g.summary.length} chars` : "(none)"}`);
  console.log(`    screenshots   ${(g.screenshots ?? []).length}`);
  console.log(`    cover         ${imageUrl(g.cover, "cover")}`);
  console.log(`    video         ${youTubeUrl((g.videos ?? [])[0])}`);
  console.log();
}

console.log("  Open the cover url and the video url. Both are built by code that");
console.log("  is checked offline against fixtures — but a fixture cannot tell you");
console.log("  whether the URL it produces actually loads.\n");
