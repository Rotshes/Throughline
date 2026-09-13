/**
 * Is IGDB actually better than RAWG for this app, and what would the swap cost?
 *
 * Decision 0004 said IGDB "was considered and is not needed". Two things have
 * changed since: the catalogue turns out to hold no Metacritic score for any
 * 2026 release, and the front page wants video RAWG's free tier does not carry.
 * Reopening that decision needs measurements, not a recollection of a docs page.
 *
 * Nothing here writes a file or changes the app. It asks eight questions and
 * prints what comes back, and the answers go into docs/decisions/0006.
 *
 * SETUP — this needs credentials RAWG did not.
 *
 *   1. Sign in at https://dev.twitch.tv/console/apps and Register Your Application.
 *      Name: anything. OAuth Redirect URL: http://localhost. Category: Application
 *      Integration. Client Type: Confidential.
 *   2. Copy the Client ID, then Generate a Client Secret and copy that.
 *   3. Add both to .env, which is gitignored and stays that way:
 *
 *        TWITCH_CLIENT_ID=...
 *        TWITCH_CLIENT_SECRET=...
 *
 *   4. node scripts/probe-igdb.js
 *
 * The secret is a password, not an identifier. It never goes in a VITE_ variable
 * and never reaches the browser — Vite inlines VITE_ values into the bundle.
 *
 * WHAT IS BEING MEASURED, AND WHY EACH ONE COULD KILL THE SWAP
 *
 *   1  token       Does client-credentials auth work, and how long does the
 *                  token last? RAWG's key never expires. A token that does is a
 *                  new production failure mode on a site we have stopped
 *                  deploying to.
 *   2  scores      Critic-score coverage by year. This is the whole reason the
 *                  question was asked. If IGDB's coverage also stops in 2023,
 *                  the swap buys nothing and stops here.
 *   3  video       Are YouTube ids really on the record, and on how many games?
 *                  One game having a trailer proves nothing about a row of
 *                  twelve — the mistake probe-front.js made with /movies.
 *   4  platforms   The vocabulary that would replace data/platforms.json. Does
 *                  IGDB have a family tree, and does it reach a GameCube and a
 *                  Game Boy Advance, which is what has actually been tested with?
 *   5  genres      What replaces data/categories.json and data/tags.json. RAWG's
 *                  19 genres were too coarse and its 9,736 tags too polluted.
 *                  Is this vocabulary better or merely different?
 *   6  filtering   Do platform and genre filters combine with AND or OR? RAWG's
 *                  tags turned out to be OR, which changed the whole design
 *                  (decision 0004). Measured the only way it can be: a filtered
 *                  count against an unfiltered one.
 *   7  images      Cover and screenshot URLs arrive as size-tokened paths with
 *                  no scheme. Verified rather than assumed, because a broken
 *                  image URL is invisible in a JSON dump.
 *   8  record      Every field on a real game, printed. A documented shape is
 *                  not a verified one (turn 005).
 *
 * Costs about 25 requests, well inside 4/second with the pacing below.
 */

import "dotenv/config";

const ID_URL = "https://id.twitch.tv/oauth2/token";
const BASE = "https://api.igdb.com/v4";

const CLIENT_ID = (process.env.TWITCH_CLIENT_ID ?? "").trim().replace(/^["']|["']$/g, "");
const CLIENT_SECRET = (process.env.TWITCH_CLIENT_SECRET ?? "").trim().replace(/^["']|["']$/g, "");

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error("\nMissing TWITCH_CLIENT_ID or TWITCH_CLIENT_SECRET in .env.");
  console.error("See the setup notes at the top of this file.\n");
  process.exit(1);
}

// --- 1. the token -------------------------------------------------------------

console.log("=== 1. authentication ===\n");

const tokenRes = await fetch(
  `${ID_URL}?client_id=${encodeURIComponent(CLIENT_ID)}` +
  `&client_secret=${encodeURIComponent(CLIENT_SECRET)}&grant_type=client_credentials`,
  { method: "POST" }
);
const tokenBody = await tokenRes.json().catch(() => ({}));

if (!tokenRes.ok || !tokenBody.access_token) {
  console.error(`  failed: HTTP ${tokenRes.status} ${JSON.stringify(tokenBody).slice(0, 300)}`);
  console.error("\n  A 403 here usually means the Client Secret was regenerated after copying.");
  process.exit(1);
}

const TOKEN = tokenBody.access_token;
const days = (tokenBody.expires_in / 86400).toFixed(1);
console.log(`  token acquired, type ${tokenBody.token_type}`);
console.log(`  expires_in ${tokenBody.expires_in}s (${days} days)`);
console.log(`  -> a deployed function must cache this and refresh before it lapses.`);
console.log(`     RAWG's key never expires; this is a failure mode the app does not have today.\n`);

// --- plumbing -----------------------------------------------------------------

let requests = 0;
const sleep = ms => new Promise(r => setTimeout(r, ms));

/** IGDB is POST with a query language in the body, not GET with parameters. */
async function q(endpoint, body) {
  // 4 requests/second per Client-ID. 260ms keeps well inside it without making
  // this probe take a minute.
  await sleep(260);
  requests++;
  const res = await fetch(`${BASE}/${endpoint}`, {
    method: "POST",
    headers: {
      "Client-ID": CLIENT_ID,
      Authorization: `Bearer ${TOKEN}`,
      Accept: "application/json",
    },
    body,
  });
  if (!res.ok) return { error: res.status, body: (await res.text()).slice(0, 300) };
  return res.json();
}

/** `/count` is a separate endpoint — the list response carries no total. */
async function count(endpoint, where) {
  const r = await q(`${endpoint}/count`, where ? `where ${where};` : "");
  return r?.count ?? `err ${r?.error}`;
}

const unix = iso => Math.floor(new Date(`${iso}T00:00:00Z`).getTime() / 1000);
const NOW = Math.floor(Date.now() / 1000);

// --- 2. critic score coverage by year -----------------------------------------
//
// The RAWG version of this table is what sent us here. Same question, same
// shape, so the two are directly comparable.

console.log("=== 2. critic-score coverage by year ===\n");
console.log("  year       all    scored   ratio    (aggregated_rating != null)");

for (const year of [2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026]) {
  const from = unix(`${year}-01-01`);
  const to = year === 2026 ? NOW : unix(`${year + 1}-01-01`);
  const window = `first_release_date >= ${from} & first_release_date < ${to}`;
  const all = await count("games", window);
  const scored = await count("games", `${window} & aggregated_rating != null`);
  const ratio = typeof all === "number" && typeof scored === "number" && all > 0
    ? `${((scored / all) * 100).toFixed(1)}%`
    : "—";
  console.log(`  ${year}  ${String(all).padStart(8)}  ${String(scored).padStart(8)}   ${ratio}`);
}
console.log(`
  Compare against RAWG's table from probe-front-2. If IGDB's 2026 row is also
  zero, the swap does not fix the thing it was proposed to fix.
`);

// --- 3. video -----------------------------------------------------------------
//
// Not "does one game have a trailer" — that is the question probe-front.js
// answered uselessly. How many games in a row of twelve would carry one?

console.log("=== 3. video coverage ===\n");
const recentWindow = `first_release_date >= ${unix("2024-01-01")} & first_release_date < ${NOW}`;
const recentAll = await count("games", recentWindow);
const recentVideo = await count("games", `${recentWindow} & videos != null`);
console.log(`  released since 2024:        ${recentAll}`);
console.log(`  ... with at least one video: ${recentVideo}`);
if (typeof recentAll === "number" && typeof recentVideo === "number" && recentAll > 0) {
  console.log(`  coverage: ${((recentVideo / recentAll) * 100).toFixed(1)}%`);
}

const withVideo = await q("games",
  `fields name, videos.video_id, videos.name, aggregated_rating;
   where ${recentWindow} & videos != null & aggregated_rating != null;
   sort aggregated_rating desc; limit 5;`);
console.log(`\n  five scored recent games and their video ids:\n`);
if (withVideo.error) {
  console.log(`    failed: ${withVideo.error} ${withVideo.body}`);
} else {
  for (const g of withVideo) {
    const ids = (g.videos ?? []).map(v => v.video_id).filter(Boolean);
    console.log(`    ${String(g.aggregated_rating?.toFixed(0) ?? "—").padStart(3)}  ${g.name}`);
    console.log(`         ${ids.length} video(s): ${ids.slice(0, 3).join(", ") || "(none returned)"}`);
    if (ids[0]) console.log(`         -> https://www.youtube.com/watch?v=${ids[0]}`);
  }
  console.log(`
    If those links open real trailers, video_id is a YouTube id and the dialog
    can embed one without a paid tier. If they 404, it is an internal id and
    this half of the proposal is dead.`);
}
console.log();

// --- 4. the platform vocabulary -----------------------------------------------

console.log("=== 4. platforms ===\n");
console.log(`  total platforms:        ${await count("platforms")}`);
console.log(`  platform families:      ${await count("platform_families")}`);

const families = await q("platform_families", "fields name, slug; limit 50;");
if (!families.error) {
  console.log(`  families: ${families.map(f => f.name).join(", ")}`);
}

// The two machines actually used in testing. If the vocabulary cannot express
// "GameCube" and "Game Boy Advance" as cleanly as RAWG's does, the platform
// selector rework of turns 009-010 has to be redone rather than retargeted.
const machines = await q("platforms",
  `fields name, abbreviation, slug, generation, platform_family, category;
   where slug = ("ngc", "gba", "ps5", "switch", "win");`);
console.log(`\n  named machines:`);
if (machines.error) console.log(`    failed: ${machines.error} ${machines.body}`);
else for (const m of machines) console.log(`    ${JSON.stringify(m)}`);
console.log();

// --- 5. the genre and tag vocabulary ------------------------------------------

console.log("=== 5. genres, themes, keywords ===\n");
console.log(`  genres:    ${await count("genres")}   (RAWG: 19, too coarse — decision 0004)`);
console.log(`  themes:    ${await count("themes")}`);
console.log(`  keywords:  ${await count("keywords")}   (RAWG tags: 9,736, mostly store plumbing)`);

const genres = await q("genres", "fields name, slug; sort name asc; limit 50;");
if (!genres.error) console.log(`\n  every genre: ${genres.map(g => g.slug).join(", ")}`);
const themes = await q("themes", "fields name, slug; sort name asc; limit 50;");
if (!themes.error) console.log(`\n  every theme: ${themes.map(t => t.slug).join(", ")}`);
console.log(`
  Whatever is in these lists is the entire vocabulary the product could offer.
  data/categories.json and data/tags.json would be rebuilt from them.
`);

// --- 6. do filters AND or OR? -------------------------------------------------
//
// RAWG's tags turned out to be OR, and that discovery changed the design
// (decision 0004: rank by tag match rather than filter strictly). The same
// mistake is available here and looks identical from the outside.

console.log("=== 6. how filters combine ===\n");
const gc = await q("platforms", 'fields id, name; where slug = "ngc";');
const gcId = Array.isArray(gc) && gc[0]?.id;
if (!gcId) {
  console.log("  could not resolve the GameCube's id; skipping.\n");
} else {
  const onlyPlatform = await count("games", `platforms = (${gcId})`);
  const platformAndGenre = await count("games", `platforms = (${gcId}) & genres != null`);
  const twoGenres = await q("genres", 'fields id, slug; where slug = ("racing", "platform");');
  console.log(`  GameCube games:                       ${onlyPlatform}`);
  console.log(`  ... that carry any genre:             ${platformAndGenre}`);
  if (Array.isArray(twoGenres) && twoGenres.length === 2) {
    const [a, b] = twoGenres;
    const either = await count("games", `platforms = (${gcId}) & genres = (${a.id}, ${b.id})`);
    const both = await count("games", `platforms = (${gcId}) & genres = [${a.id}, ${b.id}]`);
    console.log(`  ... ${a.slug} or ${b.slug}, written (a, b):   ${either}`);
    console.log(`  ... ${a.slug} and ${b.slug}, written [a, b]:  ${both}`);
    console.log(`
  If those two numbers differ, IGDB distinguishes AND from OR in the query
  itself — which RAWG could not, and which would let criterion 4 mean what it
  says instead of being softened into ranking.`);
  }
  // RAWG holds 662 GameCube games. A wildly different number here is not a bug
  // in either; it is two databases disagreeing, and the app would inherit
  // whichever it picks.
  console.log(`\n  RAWG holds 662 GameCube games. IGDB holds ${onlyPlatform}.`);
}
console.log();

// --- 7. image urls ------------------------------------------------------------

console.log("=== 7. image urls ===\n");
const art = await q("games",
  `fields name, cover.url, cover.image_id, screenshots.url, screenshots.image_id;
   where ${recentWindow} & cover != null & screenshots != null;
   sort aggregated_rating desc; limit 2;`);
if (art.error) {
  console.log(`  failed: ${art.error} ${art.body}`);
} else {
  for (const g of art) {
    console.log(`  ${g.name}`);
    console.log(`    cover.url        ${g.cover?.url}`);
    console.log(`    cover.image_id   ${g.cover?.image_id}`);
    console.log(`    screenshot[0]    ${g.screenshots?.[0]?.url}`);
  }
  console.log(`
  Expect a scheme-less path with a size token such as t_thumb. A card needs
  https: prefixed and the token swapped for a larger size. Both are one-line
  transforms, but neither is guessable from a field list.`);
}
console.log();

// --- 8. one whole record ------------------------------------------------------

console.log("=== 8. every field on one game ===\n");
const one = await q("games", `fields *; where ${recentWindow} & aggregated_rating != null; sort aggregated_rating desc; limit 1;`);
if (one.error) {
  console.log(`  failed: ${one.error} ${one.body}`);
} else if (one[0]) {
  const g = one[0];
  console.log(`  ${g.name} (id ${g.id})\n`);
  for (const [k, v] of Object.entries(g)) {
    const s = JSON.stringify(v);
    console.log(`    ${k.padEnd(28)} ${s.length > 90 ? `${s.slice(0, 90)}…` : s}`);
  }
}

console.log(`\n---\n${requests} IGDB requests made. Nothing was written and nothing changed.`);
console.log("These numbers are the evidence for docs/decisions/0006.\n");
