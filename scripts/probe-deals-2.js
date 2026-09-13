/**
 * The first deals probe answered one question and fumbled the other.
 *
 * SETTLED, and not worth re-asking:
 *
 *   A deal carries no Steam app id, and its url is an itad.link affiliate
 *   redirect rather than a store address, so there is nothing to parse either.
 *   The deals-first direction is closed.
 *
 *   Sorting deals by discount returns Epic giveaways, a demo, and six Fanatical
 *   certification bundles — AWS, Kali Linux, cybersecurity courses. The biggest
 *   discount on the internet is rarely on a game. A "best deals" row built that
 *   way would have led with a training course, which is the kind of thing that
 *   only shows up when you print the output.
 *
 * NOT SETTLED, because I broke it:
 *
 *   Section 4 reported "0 of 0 well-reviewed games carry a Steam app id" and
 *   that is a lie told by my own query. It filtered on
 *   `external_games.category = 1`, and IGDB has been renaming `category` fields
 *   out of existence — the same rename that turned a game's `category` into
 *   `game_type`, which this project already tripped over in probe-igdb-2.
 *
 *   A query I wrote returning nothing is not a finding about the world. So this
 *   reads the real field names first and asks the question again afterwards.
 *
 * WHAT IS BEING MEASURED
 *
 *   1  shape      every field on an external_games record, and how a Steam
 *                 entry is actually identified now.
 *   2  coverage   of the games this app would want to show, how many have a
 *                 Steam id at all. The ceiling on any price row.
 *   3  lookup     do those ids resolve on ITAD, and can prices be batched.
 *   4  the row    of the games that resolve, how many are discounted RIGHT NOW.
 *                 This is the number that decides whether the row exists: one
 *                 sale among twelve games is not a row, it is a footnote.
 *
 *   node scripts/probe-deals-2.js
 *
 * About 25 requests across two services.
 */

import "dotenv/config";
import { igdbRequest } from "../src/igdb.js";

const KEY = (process.env.ITAD_API_KEY ?? "").trim().replace(/^["']|["']$/g, "");
if (!KEY) { console.error("\nMissing ITAD_API_KEY in .env.\n"); process.exit(1); }

const BASE = "https://api.isthereanydeal.com";
const COUNTRY = "US";

async function itad(path, { method = "GET", body = null, params = {} } = {}) {
  const q = new URLSearchParams({ ...params, key: KEY });
  const res = await fetch(`${BASE}${path}?${q}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) return { error: res.status, body: (await res.text()).slice(0, 300) };
  return res.json();
}

// --- 1. what an external_games record actually looks like --------------------

console.log("=== 1. external_games, read rather than assumed ===\n");

const sample = await igdbRequest("external_games", "fields *; limit 3;");
if (sample.error || !Array.isArray(sample)) {
  console.log(`  failed: ${JSON.stringify(sample).slice(0, 200)}`);
} else {
  for (const r of sample) {
    console.log(`  ${JSON.stringify(r)}`);
  }
  console.log(`\n  keys present: ${[...new Set(sample.flatMap(Object.keys))].sort().join(", ")}\n`);
}

// Which enum identifies Steam. `category` was the old name; `external_game_source`
// is the likely replacement. Try the endpoint that lists them, and fall back to
// asking whether either field exists at all.
const sources = await igdbRequest("external_game_sources", "fields id, name; limit 50;");
if (Array.isArray(sources)) {
  console.log(`  /external_game_sources: ${sources.map(s => `${s.id}=${s.name}`).join(", ")}\n`);
} else {
  console.log(`  /external_game_sources unavailable (${sources.error}); the old`);
  console.log(`  category enum had 1 = Steam.\n`);
}

const steamSource = Array.isArray(sources)
  ? sources.find(s => /steam/i.test(s.name))?.id ?? 1
  : 1;
console.log(`  using ${steamSource} as the Steam source id\n`);

// Which field name the filter has to use. Measured by trying both and seeing
// which returns anything — an empty result from the wrong field name is exactly
// what produced the "0 of 0" in the first probe.
let FIELD = null;
for (const candidate of ["external_game_source", "category"]) {
  const n = await igdbRequest("external_games/count", `where ${candidate} = ${steamSource};`)
    .catch(() => null);
  const count = n?.count;
  console.log(`  where ${candidate.padEnd(22)} = ${steamSource}  ->  ${count ?? `error ${n?.error ?? "?"}`}`);
  if (Number.isInteger(count) && count > 0 && !FIELD) FIELD = candidate;
}
if (!FIELD) {
  console.log("\n  Neither field filters. Stop here and read section 1 again.\n");
  process.exit(1);
}
console.log(`\n  -> filtering on "${FIELD}"\n`);

// --- 2. how many games worth showing have a Steam id at all ------------------

console.log("=== 2. Steam coverage among games this app would show ===\n");

const NOW = Math.floor(Date.now() / 1000);
const POOL = `first_release_date < ${NOW} & parent_game = null & aggregated_rating_count >= 5`;

const reviewed = await igdbRequest("games/count", `where ${POOL};`);
console.log(`  well-reviewed games:                ${reviewed.count ?? reviewed}`);

// Fetch the games, then their Steam ids in one request keyed on game id. Two
// requests, and no nested filter to get wrong.
const picks = await igdbRequest("games",
  `fields id, name, aggregated_rating, aggregated_rating_count, cover.image_id;
   where ${POOL} & aggregated_rating >= 82 & cover != null;
   sort aggregated_rating desc; limit 24;`);

const ids = (Array.isArray(picks) ? picks : []).map(g => g.id);
const ext = await igdbRequest("external_games",
  `fields game, uid, ${FIELD}; where game = (${ids.join(",")}) & ${FIELD} = ${steamSource}; limit 200;`);

const appidByGame = new Map(
  (Array.isArray(ext) ? ext : []).map(e => [e.game, String(e.uid)])
);

console.log(`  sampled:                            ${ids.length}`);
console.log(`  ... with a Steam id:                ${appidByGame.size}`);
console.log(`  coverage: ${ids.length ? ((appidByGame.size / ids.length) * 100).toFixed(0) : 0}%\n`);

const withApp = (Array.isArray(picks) ? picks : [])
  .filter(g => appidByGame.has(g.id))
  .map(g => ({ ...g, appid: appidByGame.get(g.id) }));

for (const g of withApp.slice(0, 8)) {
  console.log(`    ${String(g.aggregated_rating?.toFixed(0)).padStart(3)}  ${g.name.slice(0, 38).padEnd(40)} appid ${g.appid}`);
}
console.log();

// --- 3. do they resolve on ITAD, and can prices be batched? ------------------

console.log("=== 3. resolving those ids on ITAD ===\n");

const resolved = [];
for (const g of withApp.slice(0, 12)) {
  const found = await itad("/games/lookup/v1", { params: { appid: g.appid } });
  if (found.error) {
    console.log(`    ${g.name.slice(0, 34).padEnd(36)} HTTP ${found.error}`);
    continue;
  }
  if (found.found && found.game?.id) resolved.push({ ...g, itad: found.game.id });
  else console.log(`    ${g.name.slice(0, 34).padEnd(36)} not on ITAD`);
}
console.log(`\n  ${resolved.length} of ${Math.min(withApp.length, 12)} resolved\n`);

// --- 4. how many are actually on sale right now ------------------------------
//
// The question the row lives or dies on. Everything above can work perfectly and
// still leave a row with two games in it.

console.log("=== 4. of those, how many are discounted right now? ===\n");

if (resolved.length === 0) {
  console.log("  nothing to price.\n");
} else {
  const prices = await itad("/games/prices/v3", {
    method: "POST",
    params: { country: COUNTRY, capacity: "1", nondeals: "true" },
    body: resolved.map(r => r.itad),
  });

  if (prices.error) {
    console.log(`  failed: ${prices.error} ${prices.body}\n`);
  } else {
    const nameFor = new Map(resolved.map(r => [r.itad, r]));
    let onSale = 0;
    console.log("  score  price     was       cut    shop            game");
    for (const row of Array.isArray(prices) ? prices : []) {
      const g = nameFor.get(row.id);
      const best = row.deals?.[0];
      if (best?.cut > 0) onSale++;
      console.log(
        `    ${String(g?.aggregated_rating?.toFixed(0) ?? "—").padStart(3)}  ` +
        `$${String(best?.price?.amount ?? "—").padEnd(8)} ` +
        `$${String(best?.regular?.amount ?? "—").padEnd(8)} ` +
        `${(best?.cut ? `-${best.cut}%` : "—").padEnd(6)} ` +
        `${(best?.shop?.name ?? "—").slice(0, 14).padEnd(15)} ${(g?.name ?? row.id).slice(0, 34)}`
      );
    }
    console.log(`\n  ${onSale} of ${resolved.length} are discounted right now.`);
    console.log(`
  A row of twelve needs roughly a quarter of a sampled pool to be on sale at any
  moment. If this is one or two, the row is a footnote and the honest version is
  a price on the game card rather than a row pretending to be a sale.
`);
  }
}

console.log("---\nNothing written. Evidence for decision 0007.\n");
