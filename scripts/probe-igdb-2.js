/**
 * Four things the first IGDB probe exposed but did not answer.
 *
 * It settled the big questions: 294 scored 2026 releases against RAWG's zero,
 * 28.9% video coverage with real YouTube ids, and a query language that tells
 * AND from OR. The swap is justified. What it also showed, without meaning to,
 * is that the row this whole exercise started from would still be wrong.
 *
 * THE TRAP
 *
 *   Every one of the five "best reviewed" games came back at exactly 100. The
 *   one whose full record was printed reads:
 *
 *       name                     Xenoblade Chronicles: Definitive Edition -
 *                                Nintendo Switch 2 Edition
 *       aggregated_rating        100
 *       aggregated_rating_count  1
 *       parent_game              122238
 *       game_type                10
 *
 *   A 100 from one review is not a critic consensus. It is one person's opinion
 *   wearing an aggregate's clothes, and sorting by score with no floor on the
 *   count returns a list of exactly those. This is MIN_RATINGS again, and the
 *   front page's own bug from last week again: a number that means something
 *   different at the top of the sort than it does in the middle.
 *
 *   It is also not a game. `parent_game` is set and `game_type` is 10, so it is
 *   a re-release of a 2020 title. RAWG had `exclude_additions=true` for exactly
 *   this and the port of that filter is unwritten because nobody knew it was
 *   needed.
 *
 *   Shipping the swap without both filters would replace an empty row with a
 *   wrong one, which is worse: an empty row announces itself.
 *
 * WHAT IS BEING MEASURED
 *
 *   1  count floor   What does a floor on aggregated_rating_count do to the row?
 *                    Printed at 1, 3, 5 and 10 so the number is chosen from the
 *                    data rather than picked because it looks reasonable. The
 *                    project already carries one unjustified constant
 *                    (CANDIDATE_TARGET = 24) written down as unjustified. Not
 *                    adding a second.
 *   2  game types    What game_type values exist, what 10 is, and whether
 *                    `parent_game = null` filters re-releases the way
 *                    exclude_additions did.
 *   3  video again   28.9% was measured across 68,461 games including every
 *                    one-person itch release. Coverage among games anyone would
 *                    actually be shown is the number that matters, and it is not
 *                    the same number.
 *   4  platforms     Only five families exist and PC is in none of them. The
 *                    14-family tree in data/platforms.json cannot be pinned from
 *                    this source, so this prints what grouping IS available
 *                    before the tree gets rebuilt by hand.
 *
 *   node scripts/probe-igdb-2.js
 *
 * About 20 requests.
 */

import "dotenv/config";

const CLIENT_ID = (process.env.TWITCH_CLIENT_ID ?? "").trim().replace(/^["']|["']$/g, "");
const CLIENT_SECRET = (process.env.TWITCH_CLIENT_SECRET ?? "").trim().replace(/^["']|["']$/g, "");
const BASE = "https://api.igdb.com/v4";

const tok = await (await fetch(
  `https://id.twitch.tv/oauth2/token?client_id=${encodeURIComponent(CLIENT_ID)}` +
  `&client_secret=${encodeURIComponent(CLIENT_SECRET)}&grant_type=client_credentials`,
  { method: "POST" }
)).json();
if (!tok.access_token) { console.error("token failed", tok); process.exit(1); }

const sleep = ms => new Promise(r => setTimeout(r, ms));
let requests = 0;

async function q(endpoint, body) {
  await sleep(260);
  requests++;
  const res = await fetch(`${BASE}/${endpoint}`, {
    method: "POST",
    headers: {
      "Client-ID": CLIENT_ID,
      Authorization: `Bearer ${tok.access_token}`,
      Accept: "application/json",
    },
    body,
  });
  if (!res.ok) return { error: res.status, body: (await res.text()).slice(0, 300) };
  return res.json();
}

async function count(where) {
  const r = await q("games/count", where ? `where ${where};` : "");
  return r?.count ?? `err ${r?.error}`;
}

const unix = iso => Math.floor(new Date(`${iso}T00:00:00Z`).getTime() / 1000);
const NOW = Math.floor(Date.now() / 1000);
const YEAR = `first_release_date >= ${unix("2026-01-01")} & first_release_date < ${NOW}`;

// --- 1. how many reviews is a review score? ----------------------------------

console.log("=== 1. what a count floor costs, 2026 ===\n");
console.log("  floor   games   what the row would look like");

for (const floor of [1, 3, 5, 10]) {
  const where = `${YEAR} & aggregated_rating != null & aggregated_rating_count >= ${floor}`;
  const n = await count(where);
  const top = await q("games",
    `fields name, aggregated_rating, aggregated_rating_count, parent_game;
     where ${where}; sort aggregated_rating desc; limit 3;`);
  console.log(`\n  >= ${String(floor).padStart(2)}   ${String(n).padStart(5)}`);
  if (top.error) { console.log(`          failed: ${top.error}`); continue; }
  for (const g of top) {
    const derived = g.parent_game ? "  [re-release]" : "";
    console.log(`          ${String(g.aggregated_rating?.toFixed(0)).padStart(3)} from ${String(g.aggregated_rating_count).padStart(3)} reviews  ${g.name}${derived}`);
  }
}
console.log(`
  Read down the [re-release] markers as much as the scores. A floor that still
  leaves ports at the top has not solved the problem, only narrowed it.
`);

// --- 2. what counts as a game -------------------------------------------------

console.log("=== 2. game types, and the port problem ===\n");

const types = await q("game_types", "fields id, type; limit 50;");
if (types.error) {
  console.log(`  /game_types unavailable (${types.error}). Counting by value instead.`);
} else {
  console.log("  every game_type:");
  for (const t of types) console.log(`    ${String(t.id).padStart(3)}  ${t.type}`);
}

console.log(`\n  2026 releases, filtered four ways:`);
console.log(`    everything                        ${await count(YEAR)}`);
console.log(`    scored                            ${await count(`${YEAR} & aggregated_rating != null`)}`);
console.log(`    scored, not a re-release          ${await count(`${YEAR} & aggregated_rating != null & parent_game = null`)}`);
console.log(`    scored, not a re-release, >=5     ${await count(`${YEAR} & aggregated_rating != null & parent_game = null & aggregated_rating_count >= 5`)}`);

const clean = await q("games",
  `fields name, aggregated_rating, aggregated_rating_count, first_release_date, game_type;
   where ${YEAR} & aggregated_rating != null & parent_game = null & aggregated_rating_count >= 5;
   sort aggregated_rating desc; limit 12;`);
console.log(`\n  the row, with both filters applied:\n`);
if (clean.error) console.log(`    failed: ${clean.error} ${clean.body}`);
else for (const g of clean) {
  const d = new Date(g.first_release_date * 1000).toISOString().slice(0, 10);
  console.log(`    ${String(g.aggregated_rating?.toFixed(0)).padStart(3)}  ${String(g.aggregated_rating_count).padStart(3)} reviews  ${d}  ${g.name}`);
}
console.log(`
  This is the row that would ship. If it reads like a list of 2026's best
  games, the filters are right. If it still reads like a list of obscurities,
  they are not, and no amount of sorting will fix it.
`);

// --- 3. video coverage among games anyone would be shown ---------------------

console.log("=== 3. video coverage, where it matters ===\n");
const since24 = `first_release_date >= ${unix("2024-01-01")} & first_release_date < ${NOW}`;
const shown = `${since24} & aggregated_rating_count >= 5 & parent_game = null`;
const shownAll = await count(shown);
const shownVideo = await count(`${shown} & videos != null`);
const shownShots = await count(`${shown} & screenshots != null`);
console.log(`  reviewed games since 2024:   ${shownAll}`);
console.log(`  ... with video:              ${shownVideo}`);
console.log(`  ... with screenshots:        ${shownShots}`);
if (typeof shownAll === "number" && shownAll > 0) {
  console.log(`\n  video coverage here: ${((shownVideo / shownAll) * 100).toFixed(1)}%  (28.9% across everything)`);
  console.log(`  If this is high, the dialog can lead with a trailer. If it is near 28%,`);
  console.log(`  absent video is the common case and the layout must assume it.`);
}
console.log();

// --- 4. what platform grouping actually exists -------------------------------

console.log("=== 4. platform grouping ===\n");
const plats = await q("platforms",
  `fields name, slug, abbreviation, generation, platform_family, platform_type, category;
   limit 250; sort name asc;`);
if (plats.error) {
  console.log(`  failed: ${plats.error} ${plats.body}`);
} else {
  const byFamily = new Map();
  const orphans = [];
  for (const p of plats) {
    if (p.platform_family) {
      if (!byFamily.has(p.platform_family)) byFamily.set(p.platform_family, []);
      byFamily.get(p.platform_family).push(p);
    } else {
      orphans.push(p);
    }
  }
  const fams = await q("platform_families", "fields id, name; limit 20;");
  const famName = new Map((Array.isArray(fams) ? fams : []).map(f => [f.id, f.name]));

  for (const [id, members] of byFamily) {
    console.log(`  ${famName.get(id) ?? `family ${id}`} — ${members.length} machines`);
    console.log(`    ${members.map(m => m.abbreviation ?? m.slug).join(", ")}`);
  }
  console.log(`\n  NO FAMILY — ${orphans.length} platforms:`);
  console.log(`    ${orphans.map(m => m.abbreviation ?? m.slug).join(", ")}\n`);

  // The field that might group the orphans. `category` was the old name and
  // appears to be gone; `platform_type` is the likely replacement. Whichever is
  // populated is what a hand-built tree would key on.
  const sample = orphans.slice(0, 6);
  console.log("  the orphans in full, to see what could group them:");
  for (const p of sample) console.log(`    ${JSON.stringify(p)}`);

  const ptypes = await q("platform_types", "fields id, name; limit 30;");
  if (!ptypes.error) {
    console.log(`\n  platform_types: ${ptypes.map(t => `${t.id}=${t.name}`).join(", ")}`);
  } else {
    console.log(`\n  /platform_types unavailable (${ptypes.error}).`);
  }
  console.log(`
  data/platforms.json holds 14 families and 51 machines and took two turns and
  two bugs to get right. IGDB has five families and PC is in none of them, so
  that tree gets hand-built rather than pinned. This prints what there is to
  build it from.`);
}

console.log(`\n---\n${requests} requests. Nothing written, nothing changed.\n`);
