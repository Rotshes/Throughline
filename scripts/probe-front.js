/**
 * Two questions the front page raised. Both measured rather than reasoned about.
 *
 * QUESTION 1 — why is "Best reviewed this year" empty?
 *
 *   src/home.js asks for `dates=<Jan 1>,<today>&ordering=-metacritic&page_size=40`
 *   and then keeps only the rows that actually carry a metacritic score. That
 *   filter removes everything, which means the forty rows the catalogue returns
 *   have no score on them — despite having been asked for in descending score
 *   order.
 *
 *   The obvious explanation is that the sort puts missing scores first. That is
 *   what PostgreSQL does by default with `ORDER BY x DESC`, and RAWG is a Django
 *   application over PostgreSQL. But "obvious explanation" is what turn 009 cost
 *   an afternoon to, so this prints the actual scores rather than asserting it.
 *
 *   It also tests the fix before the fix is written: RAWG documents a
 *   `metacritic=<low>,<high>` range filter. Pitfall 20 says an ignored query
 *   parameter looks exactly like a working one, so it is confirmed the only way
 *   that works — a filtered count against an unfiltered one.
 *
 * QUESTION 2 — what can a detail dialog actually show?
 *
 *   A card opens a panel with pictures, a synopsis and the facts. `/games/{id}`
 *   and `/games/{id}/screenshots` are the two endpoints that would feed it, and
 *   neither has ever been read in this project except for `description_raw`.
 *   A documented shape is not a verified one (turn 005), so this prints the
 *   response and the fields a dialog would read.
 *
 *   Trailers were recorded in turn 005 as a Business-tier feature. That was
 *   read off a pricing page, not observed. `/games/{id}/movies` is called here
 *   so the answer is a status code rather than a memory.
 *
 *   node scripts/probe-front.js
 *
 * Costs about nine catalogue requests.
 */

import { config } from "../src/config.js";

const BASE = "https://api.rawg.io/api";

async function get(path, params = {}) {
  const q = new URLSearchParams(params);
  q.set("key", config.rawgKey);
  const res = await fetch(`${BASE}${path}?${q}`, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    return { error: res.status, body: (await res.text()).slice(0, 200) };
  }
  return res.json();
}

const today = new Date();
const ymd = d => d.toISOString().slice(0, 10);
const yearStart = new Date(Date.UTC(today.getUTCFullYear(), 0, 1));
const THIS_YEAR = `${ymd(yearStart)},${ymd(today)}`;

console.log(`window: ${THIS_YEAR}\n`);

// --- 1. what does ordering=-metacritic actually return? ----------------------

console.log("=== 1. the first 15 of ordering=-metacritic ===\n");
const acclaimed = await get("/games", {
  dates: THIS_YEAR,
  ordering: "-metacritic",
  page_size: "40",
  exclude_additions: "true",
});
if (acclaimed.error) {
  console.log(`  failed: ${acclaimed.error} ${acclaimed.body}`);
} else {
  const rows = acclaimed.results ?? [];
  const scored = rows.filter(g => g.metacritic != null);
  console.log(`  returned ${rows.length} rows, ${scored.length} of them carrying a score`);
  console.log(`  total matching this window: ${acclaimed.count}\n`);
  for (const g of rows.slice(0, 15)) {
    console.log(
      `  ${String(g.metacritic ?? "—").padStart(4)}  ${(g.released ?? "?").padEnd(11)} ${g.name}`
    );
  }
  console.log();
}

// --- 2. is the metacritic range filter honoured? -----------------------------
//
// Pitfall 20. If `metacritic=1,100` is silently dropped, the count comes back
// identical to the unfiltered one and the "fix" would be a no-op that looks like
// a success.

console.log("=== 2. is metacritic= honoured, or silently dropped? ===\n");
const unfiltered = await get("/games", { dates: THIS_YEAR, page_size: "1", exclude_additions: "true" });
const anyScore = await get("/games", { dates: THIS_YEAR, page_size: "1", metacritic: "1,100", exclude_additions: "true" });
const highScore = await get("/games", { dates: THIS_YEAR, page_size: "1", metacritic: "85,100", exclude_additions: "true" });

console.log(`  no metacritic parameter : ${unfiltered.count ?? unfiltered.error}`);
console.log(`  metacritic=1,100        : ${anyScore.count ?? anyScore.error}`);
console.log(`  metacritic=85,100       : ${highScore.count ?? highScore.error}`);
if (unfiltered.count && anyScore.count === unfiltered.count) {
  console.log("\n  IDENTICAL to unfiltered — the parameter is being ignored. Do not build on it.");
} else if (anyScore.count && highScore.count && highScore.count < anyScore.count) {
  console.log("\n  Counts narrow as the floor rises. The parameter is real.");
}
console.log();

// --- 3. does the filter plus the sort give a usable row? ---------------------

console.log("=== 3. metacritic=1,100 + ordering=-metacritic, first 12 ===\n");
const fixed = await get("/games", {
  dates: THIS_YEAR,
  metacritic: "1,100",
  ordering: "-metacritic",
  page_size: "40",
  exclude_additions: "true",
});
if (fixed.error) {
  console.log(`  failed: ${fixed.error} ${fixed.body}`);
} else {
  const rows = fixed.results ?? [];
  console.log(`  returned ${rows.length}, ${rows.filter(g => g.metacritic != null).length} scored\n`);
  for (const g of rows.slice(0, 12)) {
    console.log(
      `  ${String(g.metacritic ?? "—").padStart(4)}  ${(g.released ?? "?").padEnd(11)} ${g.name}`
    );
  }
  console.log();
}

// --- 4. what a detail dialog can read ----------------------------------------
//
// Hollow Knight: Silksong, id 634198 — a real game with a full record. If the id
// ever goes stale this prints a 404 rather than lying, which is the point.

const SAMPLE = 634198;

console.log(`=== 4. /games/${SAMPLE} — fields a dialog would read ===\n`);
const detail = await get(`/games/${SAMPLE}`);
if (detail.error) {
  console.log(`  failed: ${detail.error} ${detail.body}`);
} else {
  const shape = {
    name: detail.name,
    released: detail.released,
    description_raw: typeof detail.description_raw === "string"
      ? `${detail.description_raw.length} chars`
      : typeof detail.description_raw,
    background_image: Boolean(detail.background_image),
    background_image_additional: Boolean(detail.background_image_additional),
    metacritic: detail.metacritic,
    playtime: detail.playtime,
    website: detail.website || null,
    esrb_rating: detail.esrb_rating?.name ?? null,
    developers: (detail.developers ?? []).map(d => d.name).slice(0, 3),
    publishers: (detail.publishers ?? []).map(d => d.name).slice(0, 3),
    genres: (detail.genres ?? []).map(g => g.slug),
    platforms: (detail.platforms ?? []).map(p => p.platform?.slug),
    // Present on the detail record but absent from the list record. If this is
    // here, the dialog does not need a second request for stores.
    stores: (detail.stores ?? []).map(s => s.store?.slug),
  };
  for (const [k, v] of Object.entries(shape)) {
    console.log(`  ${k.padEnd(27)} ${JSON.stringify(v)}`);
  }
  console.log();
  const keys = Object.keys(detail).sort();
  console.log(`  every key on the record (${keys.length}):`);
  console.log(`  ${keys.join(", ")}\n`);
}

console.log(`=== 5. /games/${SAMPLE}/screenshots ===\n`);
const shots = await get(`/games/${SAMPLE}/screenshots`);
if (shots.error) {
  console.log(`  failed: ${shots.error} ${shots.body}\n`);
} else {
  console.log(`  count: ${shots.count}, returned: ${(shots.results ?? []).length}`);
  console.log(`  first row shape: ${JSON.stringify(shots.results?.[0] ?? null)}\n`);
}

// --- 6. are trailers really out of reach? ------------------------------------

console.log(`=== 6. /games/${SAMPLE}/movies — the trailer question ===\n`);
const movies = await get(`/games/${SAMPLE}/movies`);
if (movies.error) {
  console.log(`  ${movies.error}: ${movies.body}`);
  console.log("  Confirms turn 005: trailers are not on this tier.\n");
} else {
  console.log(`  count: ${movies.count}, returned: ${(movies.results ?? []).length}`);
  console.log(`  first row: ${JSON.stringify(movies.results?.[0] ?? null).slice(0, 400)}`);
  console.log("  Trailers ARE reachable. Turn 005's note was wrong and the dialog can carry video.\n");
}
