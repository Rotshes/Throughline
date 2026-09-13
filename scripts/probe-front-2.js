/**
 * The questions scripts/probe-front.js left open, and the one it got wrong.
 *
 * WHAT THE FIRST PROBE SETTLED
 *
 *   `ordering=-metacritic` over 2026 returns forty rows and none of them carries
 *   a score. `metacritic=1,100` over the same window returns 0 against 2,016
 *   unfiltered. So the row is not empty because of a sort — it is empty because
 *   the catalogue appears to hold no scored 2026 release at all.
 *
 * WHAT IT DID NOT SETTLE
 *
 *   "The parameter works and there are none" and "the parameter breaks the query
 *   and always returns none" produce the identical 0. Pitfall 20 wearing its
 *   other face: the first probe compared filtered against unfiltered in one
 *   window, which distinguishes a *dropped* parameter, not a *broken* one.
 *
 *   The test that separates them is a window where the answer is known to be
 *   non-zero. 2019 had scored releases. If `metacritic=1,100` returns 0 there
 *   too, the parameter is unusable and nothing should be built on it.
 *
 *   Question 1 below also asks which years hold scores at all, because the fix
 *   is a window and the window should follow the data rather than my taste.
 *
 * WHAT IT GOT WRONG
 *
 *   Section 6 of the first probe called `/games/{id}/movies`, got HTTP 200 with
 *   `count: 0`, and printed "Trailers ARE reachable."
 *
 *   That conclusion is worthless and I wrote it. The sampled game has
 *   `movies_count: 0` — it has no trailers for any tier to withhold. A 200 with
 *   an empty list is exactly what a working endpoint returns for a game with no
 *   videos AND what a silently-empty one returns for everything. The result
 *   looked like a pass while the thing being tested had failed, which is the
 *   turn-001 rule in CLAUDE.md, restated four turns after it was written down.
 *
 *   Question 3 does it properly: find a game the catalogue says HAS movies, then
 *   ask for them. `movies_count > 0` and an empty `/movies` is a tier wall.
 *
 * Ids are resolved by search rather than typed from memory. The first probe
 * asserted id 634198 was Hollow Knight: Silksong. It is a web puzzle game called
 * All-Nighter. Nothing depended on it — but nothing depended on it only because
 * the probe printed the name it actually got.
 *
 *   node scripts/probe-front-2.js
 *
 * Costs about twenty catalogue requests.
 */

import { config } from "../src/config.js";

const BASE = "https://api.rawg.io/api";

async function get(path, params = {}) {
  const q = new URLSearchParams(params);
  q.set("key", config.rawgKey);
  const res = await fetch(`${BASE}${path}?${q}`, { headers: { Accept: "application/json" } });
  if (!res.ok) return { error: res.status, body: (await res.text()).slice(0, 200) };
  return res.json();
}

const today = new Date().toISOString().slice(0, 10);

// --- 1. where do metacritic scores actually live? ----------------------------

console.log("=== 1. scored releases by year ===\n");
console.log("  year      all   scored   ratio");

for (const year of [2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026]) {
  const to = year === 2026 ? today : `${year}-12-31`;
  const window = `${year}-01-01,${to}`;
  const all = await get("/games", { dates: window, page_size: "1", exclude_additions: "true" });
  const scored = await get("/games", {
    dates: window, page_size: "1", metacritic: "1,100", exclude_additions: "true",
  });
  const a = all.count ?? `err ${all.error}`;
  const s = scored.count ?? `err ${scored.error}`;
  const ratio = typeof a === "number" && typeof s === "number" && a > 0
    ? `${((s / a) * 100).toFixed(1)}%`
    : "—";
  console.log(`  ${year}  ${String(a).padStart(7)}  ${String(s).padStart(7)}   ${ratio}`);
}

console.log(`
  If 2019-2024 show scored counts and 2026 shows 0, the parameter works and the
  catalogue simply has no scored 2026 release. If every year shows 0, the
  parameter is broken and the whole approach is dead.
`);

// --- 2. a window that is not empty -------------------------------------------
//
// Whatever the table above shows, this asks what a row built on a wider window
// would actually contain. Twenty-four months, scored, best first.

console.log("=== 2. last 24 months, metacritic=1,100, ordering=-metacritic ===\n");
const twoYearsAgo = new Date(Date.now() - 730 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
const wide = await get("/games", {
  dates: `${twoYearsAgo},${today}`,
  metacritic: "1,100",
  ordering: "-metacritic",
  page_size: "40",
  exclude_additions: "true",
});
if (wide.error) {
  console.log(`  failed: ${wide.error} ${wide.body}\n`);
} else {
  const rows = wide.results ?? [];
  console.log(`  ${wide.count} match, ${rows.length} returned, ${rows.filter(g => g.metacritic != null).length} scored\n`);
  for (const g of rows.slice(0, 14)) {
    console.log(`  ${String(g.metacritic ?? "—").padStart(4)}  ${(g.released ?? "?").padEnd(11)} ${g.name}`);
  }
  console.log();
}

// --- 3. the trailer question, asked properly ---------------------------------
//
// Resolve real games by search, pick ones the catalogue says have movies, then
// ask for the movies. A game with movies_count > 0 and an empty /movies is a
// tier wall. A game with movies_count > 0 and a populated /movies means turn
// 005's note was wrong and the dialog can carry video.

console.log("=== 3. trailers, on games that have them ===\n");

const NAMES = ["Baldur's Gate 3", "Elden Ring", "Cyberpunk 2077"];
for (const name of NAMES) {
  const found = await get("/games", { search: name, page_size: "1", search_precise: "true" });
  const hit = found.results?.[0];
  if (!hit) { console.log(`  ${name}: not found\n`); continue; }

  const detail = await get(`/games/${hit.id}`);
  const declared = detail.movies_count;
  const movies = await get(`/games/${hit.id}/movies`);

  console.log(`  ${detail.name} (id ${hit.id})`);
  console.log(`    metacritic       ${detail.metacritic}`);
  console.log(`    movies_count     ${declared}      <- what the record claims`);
  if (movies.error) {
    console.log(`    /movies          ${movies.error}: ${movies.body}`);
    console.log(`    -> blocked. Turn 005's note stands.`);
  } else {
    const got = (movies.results ?? []).length;
    console.log(`    /movies          count ${movies.count}, returned ${got}`);
    if (declared > 0 && got === 0) {
      console.log(`    -> declares ${declared} and serves none. A tier wall, not an absence.`);
    } else if (got > 0) {
      const m = movies.results[0];
      console.log(`    first            ${JSON.stringify({ name: m.name, preview: Boolean(m.preview), data: Object.keys(m.data ?? {}) })}`);
      console.log(`    -> video IS available on this tier.`);
    } else {
      console.log(`    -> the record claims none either. This game proves nothing; ignore it.`);
    }
  }
  console.log();
}

// --- 4. deleted screenshots ---------------------------------------------------
//
// The first probe printed a screenshot row carrying `is_deleted: false`. A field
// named that exists because it is sometimes true, and src/detail.js does not
// read it. This asks how often it is true before deciding whether that matters.

console.log("=== 4. is_deleted on screenshots ===\n");
const sample = await get("/games", {
  dates: `${twoYearsAgo},${today}`, ordering: "-added", page_size: "10", exclude_additions: "true",
});
let deleted = 0;
let total = 0;
for (const g of sample.results ?? []) {
  const shots = await get(`/games/${g.id}/screenshots`);
  const rows = shots.results ?? [];
  const gone = rows.filter(s => s.is_deleted).length;
  total += rows.length;
  deleted += gone;
  if (gone) console.log(`  ${g.name}: ${gone} of ${rows.length} flagged deleted`);
}
console.log(`\n  ${deleted} of ${total} screenshots across 10 games are flagged deleted.`);
console.log("  Any number above zero means the dialog is rendering images the");
console.log("  catalogue has withdrawn, and shapeDetail has to filter them.\n");
