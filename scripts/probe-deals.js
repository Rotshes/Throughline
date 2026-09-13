/**
 * Can a price be attached to a game this app already knows about?
 *
 * That is the only question. A deals row is easy to build and worthless unless
 * each deal can be shown as one of our cards — with the cover, the score, the
 * platforms and the Add button. A row of bare titles and numbers is a worse
 * version of IsThereAnyDeal's own front page.
 *
 * WHY THIS IS NOT THE OPENCRITIC PROBLEM
 *
 *   Attaching a critic score to a game meant matching by title, which is what
 *   v1 of this project died of and what decision 0003 removed. This is
 *   different: IGDB records carry Steam app ids in `external_games`, and ITAD
 *   can be addressed by Steam app id. If that holds, the join is id to id and
 *   nothing is ever matched on a name.
 *
 *   "If that holds" is the reason this file exists rather than a pull request.
 *
 * THE TWO DIRECTIONS, AND WHY THE CHEAPER ONE MIGHT NOT WORK
 *
 *   DEALS FIRST   one ITAD request for the current deals, then one IGDB request
 *                 mapping their Steam app ids back to games. Two requests for a
 *                 whole row. But it only works if a deal tells us its app id —
 *                 and ITAD's deal object may not carry one, in which case the
 *                 app id has to be read out of the store URL, which is parsing
 *                 someone else's URL shape and can quietly stop working.
 *
 *   GAMES FIRST   take games we would want to show anyway, find their app ids
 *                 from IGDB, and ask ITAD what each costs. Robust, and honest in
 *                 a different way: the row becomes "games worth playing that
 *                 happen to be on sale" rather than "the biggest discounts",
 *                 which for this app is arguably the better row. Costs one ITAD
 *                 lookup per game unless prices can be fetched in a batch.
 *
 * Both are measured. The mapping RATE is the number that decides it: a row of
 * twelve needs most deals to resolve, and if only a fifth do, the row is thin
 * every time and the label would be a lie.
 *
 * SETUP
 *
 *   Register an app at https://isthereanydeal.com/apps/my/ — the key is
 *   generated for you. Then in .env, which stays gitignored:
 *
 *     ITAD_API_KEY=...
 *
 *   node scripts/probe-deals.js
 *
 * About 20 requests across two services. Nothing is written and nothing changes.
 */

import "dotenv/config";
import { igdbRequest } from "../src/igdb.js";

const KEY = (process.env.ITAD_API_KEY ?? "").trim().replace(/^["']|["']$/g, "");
if (!KEY) {
  console.error("\nMissing ITAD_API_KEY in .env. See the setup note at the top of this file.\n");
  process.exit(1);
}

const BASE = "https://api.isthereanydeal.com";

/**
 * Prices are per country and there is no neutral one.
 *
 * Whatever this app shows is a choice about whose prices they are, and it has to
 * be stated on the row rather than left for someone to discover when the number
 * does not match their store.
 */
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

// --- 1. does the key work, and what is a deal shaped like? -------------------

console.log("=== 1. current deals ===\n");

const deals = await itad("/deals/v2", {
  params: { country: COUNTRY, limit: "20", sort: "-cut", nondeals: "false" },
});

if (deals.error) {
  console.error(`  failed: HTTP ${deals.error} ${deals.body}`);
  console.error("\n  A 401 or 403 here is the key. A 400 is usually the country code.\n");
  process.exit(1);
}

const list = deals.list ?? [];
console.log(`  ${list.length} deals returned, hasMore=${deals.hasMore}\n`);
console.log("  the first deal, in full — this is the shape a row would read:\n");
console.log(`  ${JSON.stringify(list[0] ?? null, null, 2).split("\n").join("\n  ")}\n`);

console.log("  the rest, briefly:\n");
for (const d of list.slice(0, 10)) {
  const p = d.deal?.price?.amount;
  const was = d.deal?.regular?.amount;
  console.log(
    `    -${String(d.deal?.cut ?? "?").padStart(3)}%  ` +
    `$${String(p ?? "?").padEnd(7)} was $${String(was ?? "?").padEnd(7)} ` +
    `${(d.deal?.shop?.name ?? "?").padEnd(12)} ${d.title}`
  );
}
console.log();

// --- 2. is there a Steam app id anywhere in a deal? --------------------------
//
// If yes, the cheap direction works. If the only trace of one is inside a store
// URL, the join depends on parsing somebody else's URL shape, which is a
// different and worse kind of dependency — it breaks silently when they change
// it, and nothing here would notice.

console.log("=== 2. can a deal be turned into a Steam app id? ===\n");

const APPID_IN_URL = /store\.steampowered\.com\/app\/(\d+)/;
let direct = 0;
let fromUrl = 0;
const appIds = [];

for (const d of list) {
  const keys = Object.keys(d);
  const dealKeys = Object.keys(d.deal ?? {});
  const declared = d.appid ?? d.deal?.appid ?? null;
  if (declared) { direct++; appIds.push(String(declared)); continue; }

  const m = APPID_IN_URL.exec(d.deal?.url ?? "");
  if (m) { fromUrl++; appIds.push(m[1]); }

  if (appIds.length === 1 || direct + fromUrl === 1) {
    console.log(`  keys on a deal:        ${keys.join(", ")}`);
    console.log(`  keys on deal.deal:     ${dealKeys.join(", ")}`);
    console.log(`  deal.url:              ${(d.deal?.url ?? "").slice(0, 110)}`);
  }
}

console.log(`\n  app id declared as a field: ${direct} of ${list.length}`);
console.log(`  app id only inside a URL:   ${fromUrl} of ${list.length}`);
if (direct === 0 && fromUrl > 0) {
  console.log(`  -> the cheap direction depends on parsing a Steam store URL.`);
  console.log(`     Workable, and a dependency on someone else's URL shape that`);
  console.log(`     would break without any error to notice.`);
} else if (direct === 0 && fromUrl === 0) {
  console.log(`  -> no app id reachable from a deal at all. The deals-first`);
  console.log(`     direction is dead; only games-first can work.`);
}
console.log();

// --- 3. do those app ids resolve to IGDB games? ------------------------------
//
// The number that decides whether the row is viable.

console.log("=== 3. how many of those deals are games we could actually show? ===\n");

if (appIds.length === 0) {
  console.log("  no app ids to try.\n");
} else {
  // IGDB external_games: category 1 is Steam. One request for the whole batch.
  const rows = await igdbRequest("external_games",
    `fields uid, game, category; where category = 1 & uid = ("${appIds.join('","')}");
     limit 100;`);

  const byUid = new Map((Array.isArray(rows) ? rows : []).map(r => [String(r.uid), r.game]));
  const gameIds = [...new Set([...byUid.values()])].filter(Number.isInteger);

  console.log(`  ${appIds.length} app ids in, ${byUid.size} matched an IGDB game`);
  console.log(`  mapping rate: ${((byUid.size / appIds.length) * 100).toFixed(0)}%\n`);

  if (gameIds.length) {
    const games = await igdbRequest("games",
      `fields id, name, cover.image_id, aggregated_rating, aggregated_rating_count, parent_game;
       where id = (${gameIds.join(",")}); limit 50;`);
    const byId = new Map((Array.isArray(games) ? games : []).map(g => [g.id, g]));

    console.log("  what the row would look like:\n");
    for (const d of list) {
      const m = APPID_IN_URL.exec(d.deal?.url ?? "");
      const appid = String(d.appid ?? d.deal?.appid ?? m?.[1] ?? "");
      const g = byId.get(byUid.get(appid));
      const mark = g ? (g.cover ? "ok  " : "no art") : "MISS";
      console.log(
        `    ${mark}  -${String(d.deal?.cut ?? "?").padStart(3)}%  ` +
        `$${String(d.deal?.price?.amount ?? "?").padEnd(6)} ` +
        `${(g?.name ?? d.title).slice(0, 42)}`
      );
    }
    console.log(`
  MISS means the deal cannot be drawn as one of our cards. A row of twelve needs
  most of these to land — a handful of hits means padding the row with bare
  titles, and criterion 5 forbids padding anything.
`);
  }
}

// --- 4. the other direction, on games we would want to show anyway ------------

console.log("=== 4. games first: what do well-reviewed games cost? ===\n");

const NOW = Math.floor(Date.now() / 1000);
const wanted = await igdbRequest("games",
  `fields id, name, external_games.uid, external_games.category;
   where first_release_date < ${NOW} & parent_game = null
         & aggregated_rating_count >= 5 & aggregated_rating >= 85
         & external_games.category = 1;
   sort aggregated_rating desc; limit 8;`);

const pairs = [];
for (const g of Array.isArray(wanted) ? wanted : []) {
  const steam = (g.external_games ?? []).find(e => e.category === 1);
  if (steam?.uid) pairs.push({ game: g, appid: String(steam.uid) });
}
console.log(`  ${pairs.length} of ${(wanted ?? []).length} well-reviewed games carry a Steam app id\n`);

const itadIds = [];
for (const p of pairs) {
  const found = await itad("/games/lookup/v1", { params: { appid: p.appid } });
  if (found.error) {
    console.log(`    ${p.game.name.padEnd(34)} lookup failed ${found.error}`);
    continue;
  }
  const id = found.game?.id ?? null;
  console.log(`    ${p.game.name.slice(0, 34).padEnd(36)} appid ${p.appid.padEnd(8)} -> ${id ? "found" : "NOT ON ITAD"}`);
  if (id) itadIds.push({ id, name: p.game.name });
}

if (itadIds.length) {
  const prices = await itad("/games/prices/v3", {
    method: "POST",
    params: { country: COUNTRY, capacity: "1", nondeals: "true" },
    body: itadIds.map(x => x.id),
  });
  console.log("\n  current prices, one batched request:\n");
  if (prices.error) {
    console.log(`    failed: ${prices.error} ${prices.body}`);
  } else {
    const nameFor = new Map(itadIds.map(x => [x.id, x.name]));
    for (const row of Array.isArray(prices) ? prices : []) {
      const best = row.deals?.[0];
      console.log(
        `    ${String(nameFor.get(row.id) ?? row.id).slice(0, 34).padEnd(36)}` +
        `$${String(best?.price?.amount ?? "—").padEnd(8)}` +
        `${best?.cut ? `-${best.cut}%` : "no discount"}   ${best?.shop?.name ?? ""}`
      );
    }
    console.log(`
  One lookup per game, then one batched price request. Eight games is nine
  requests against a limit of a thousand per five minutes, so it is affordable —
  and unlike the deals-first direction, every row comes with a cover and a score
  because the game was chosen from IGDB first.
`);
  }
}

console.log("---\nNothing written. These numbers are the evidence for decision 0007.\n");
