/**
 * Prove every filter the candidate query will use actually filters.
 *
 * Pitfall 20: an ignored query parameter looks exactly like a working one. It
 * returns a full list and a plausible result, and the only way to tell is to
 * compare a filtered count against an unfiltered one. Turn 005 did this for
 * every RAWG parameter before `src/catalogue.js` was written. This is the same
 * exercise for IGDB, before `src/igdb-catalogue.js` is written.
 *
 * It also answers the two questions that decide the shape of a candidate, both
 * of which are fields RAWG had and IGDB does not obviously have:
 *
 *   PLAYTIME. `short-one` is one of six angles and its constraint is
 *   `maxPlaytime` — code refuses the angle when the catalogue has no figure, and
 *   `explainAngle` quotes the number. IGDB games carry no playtime field at all.
 *   There is a separate `game_time_to_beat` endpoint which, if it exists and is
 *   populated, is better data than RAWG's single vague number: separate figures
 *   for rushing it and for finishing everything. If it does not, `short-one` has
 *   to go, and that is a feature lost to the migration rather than a detail.
 *
 *   REVIEW SCORE. RAWG's field was `metacritic` and the app says so out loud —
 *   `The best reviewed of the three, at 92 on Metacritic.` IGDB's
 *   `aggregated_rating` is its own aggregation over its own critic list, and it
 *   is not Metacritic. Keeping the field name would make the app state a source
 *   it does not have. This prints both numbers for the same games so the size of
 *   the difference is visible rather than assumed.
 *
 *   node scripts/inspect-igdb-catalogue.js
 *
 * About 25 requests.
 */

import { igdbRequest, igdbCount } from "../src/igdb.js";

const NOW = Math.floor(Date.now() / 1000);
const pct = (a, b) => (b > 0 ? `${((a / b) * 100).toFixed(1)}%` : "—");

// Resolve everything by the call the app will make. Turn 005: a search endpoint
// is not a membership test, and an id typed from memory is a guess.
const [genres, themes, modes, platforms] = await Promise.all([
  igdbRequest("genres", 'fields id, slug; where slug = ("puzzle", "racing", "shooter");'),
  igdbRequest("themes", 'fields id, slug; where slug = ("horror", "erotic", "open-world");'),
  igdbRequest("game_modes", 'fields id, slug; where slug = ("split-screen", "co-operative");'),
  igdbRequest("platforms", 'fields id, slug, name; where slug = ("ngc", "win", "ps5");'),
]);

const id = (list, slug) => list.find(x => x.slug === slug)?.id;

const PUZZLE = id(genres, "puzzle");
const SHOOTER = id(genres, "shooter");
const HORROR = id(themes, "horror");
const EROTIC = id(themes, "erotic");
const SPLIT = id(modes, "split-screen");
const NGC = id(platforms, "ngc");
const WIN = id(platforms, "win");

console.log("resolved ids:", { PUZZLE, SHOOTER, HORROR, EROTIC, SPLIT, NGC, WIN }, "\n");

// --- 1. does each filter narrow? ---------------------------------------------

console.log("=== 1. every filter, against an unfiltered baseline ===\n");

const ALL = "parent_game = null";
const base = await igdbCount("games", ALL);
console.log(`  no filter at all                       ${base.toLocaleString("en-GB")}`);

const cases = [
  ["platform: GameCube", `${ALL} & platforms = (${NGC})`],
  ["platform: PC", `${ALL} & platforms = (${WIN})`],
  ["genre: puzzle", `${ALL} & genres = (${PUZZLE})`],
  ["theme: horror", `${ALL} & themes = (${HORROR})`],
  ["mode: split screen", `${ALL} & game_modes = (${SPLIT})`],
  ["GameCube + split screen", `${ALL} & platforms = (${NGC}) & game_modes = (${SPLIT})`],
  ["GameCube + puzzle OR shooter", `${ALL} & platforms = (${NGC}) & genres = (${PUZZLE},${SHOOTER})`],
  ["GameCube + puzzle AND shooter", `${ALL} & platforms = (${NGC}) & genres = [${PUZZLE},${SHOOTER}]`],
];

for (const [label, where] of cases) {
  const n = await igdbCount("games", where);
  const flag = n === base ? "   <- IDENTICAL TO UNFILTERED. IGNORED PARAMETER." : "";
  console.log(`  ${label.padEnd(38)} ${String(n.toLocaleString("en-GB")).padStart(9)}${flag}`);
}

// --- 2. does the exclusion actually exclude? ---------------------------------
//
// The one clause in the whole query whose job is to remove rather than select,
// and the one nobody would notice failing until it failed in front of an
// audience. `!=` on an array field is not obviously the same operation as `=`
// with a negation, so it is measured rather than reasoned about.

console.log("\n=== 2. the exclusion clause ===\n");

const pcAll = await igdbCount("games", `${ALL} & platforms = (${WIN})`);
const pcErotic = await igdbCount("games", `${ALL} & platforms = (${WIN}) & themes = (${EROTIC})`);
const pcExcluded = await igdbCount("games", `${ALL} & platforms = (${WIN}) & themes != (${EROTIC})`);

console.log(`  PC games                       ${pcAll.toLocaleString("en-GB")}`);
console.log(`  ... carrying the theme         ${pcErotic.toLocaleString("en-GB")}`);
console.log(`  ... with themes != (erotic)    ${pcExcluded.toLocaleString("en-GB")}`);
console.log(`\n  expected if the clause works:  ${(pcAll - pcErotic).toLocaleString("en-GB")}`);

if (pcExcluded === pcAll) {
  console.log(`  -> NOT EXCLUDING. The clause is being ignored and the games are still there.`);
} else if (pcExcluded === pcAll - pcErotic) {
  console.log(`  -> exact. The clause removes precisely the games carrying the theme.`);
} else {
  // The interesting case. On IGDB a game with no themes at all may fail a `!=`
  // test rather than passing it, which would silently discard every untagged
  // game — a far bigger filter than the one intended.
  const diff = pcAll - pcErotic - pcExcluded;
  console.log(`  -> off by ${diff.toLocaleString("en-GB")}. It is removing more than asked.`);
  const noThemes = await igdbCount("games", `${ALL} & platforms = (${WIN}) & themes = null`);
  console.log(`     PC games with no themes at all: ${noThemes.toLocaleString("en-GB")}`);
  console.log(`     If that number matches the gap, "!=" also drops untagged games`);
  console.log(`     and the exclusion has to be written a different way.`);
}

// --- 3. playtime: does game_time_to_beat exist and is it populated? ----------

console.log("\n=== 3. time to beat ===\n");

const ttb = await igdbRequest("game_time_to_beat",
  "fields game_id, hastily, normally, completely, count; limit 5;").catch(e => ({ error: e.message }));

if (ttb.error || !Array.isArray(ttb)) {
  console.log(`  endpoint unavailable: ${ttb.error ?? JSON.stringify(ttb).slice(0, 200)}`);
  console.log(`  -> no playtime data. The "short one" angle cannot be checked and`);
  console.log(`     must be removed from data/angles.json rather than left as an`);
  console.log(`     angle whose gate can never pass.`);
} else {
  console.log(`  endpoint responds. first rows:`);
  for (const r of ttb) {
    const h = s => (Number.isFinite(s) ? `${(s / 3600).toFixed(1)}h` : "—");
    console.log(`    game ${String(r.game_id).padStart(7)}  hastily ${h(r.hastily)}  normally ${h(r.normally)}  completely ${h(r.completely)}  (${r.count} submissions)`);
  }

  const total = await igdbCount("game_time_to_beat", "");
  console.log(`\n  games with a time to beat: ${total.toLocaleString("en-GB")} of ${base.toLocaleString("en-GB")}  (${pct(total, base)})`);

  // Coverage on everything is the wrong population — the same error this project
  // has now made twice. What matters is coverage among games a shortlist would
  // actually contain.
  const reviewed = await igdbCount("games", `${ALL} & aggregated_rating_count >= 5`);
  const sample = await igdbRequest("games",
    `fields id; where ${ALL} & aggregated_rating_count >= 5; limit 40;`);
  const ids = sample.map(g => g.id);
  const covered = await igdbCount("game_time_to_beat", `game_id = (${ids.join(",")})`);
  console.log(`  among 40 reviewed games: ${covered} have one  (${pct(covered, ids.length)})`);
  console.log(`  reviewed games in total: ${reviewed.toLocaleString("en-GB")}`);
  console.log(`\n  -> "normally" in hours replaces RAWG's playtime, and is better data:`);
  console.log(`     three figures from submissions rather than one number of unclear origin.`);
}

// --- 4. the review score is not Metacritic ------------------------------------

console.log("\n=== 4. aggregated_rating is not a Metacritic score ===\n");

const scored = await igdbRequest("games",
  `fields name, aggregated_rating, aggregated_rating_count, rating, rating_count, total_rating;
   where ${ALL} & aggregated_rating != null & aggregated_rating_count >= 5;
   sort aggregated_rating desc; limit 6;`);

console.log("  name                             critic  n   users   n");
for (const g of scored) {
  console.log(
    `  ${String(g.name).slice(0, 30).padEnd(32)}` +
    `${String(g.aggregated_rating?.toFixed(0)).padStart(5)} ${String(g.aggregated_rating_count).padStart(3)}` +
    `${String(g.rating?.toFixed(0) ?? "—").padStart(8)} ${String(g.rating_count ?? 0).padStart(4)}`
  );
}
console.log(`
  Two separate numbers: aggregated_rating is IGDB's critic aggregation, rating is
  its own users. Neither is Metacritic. src/shortlist.js currently writes "at 92
  on Metacritic" from this field, which would be a false statement about a source
  the app is not using — so the field is renamed to criticScore and that sentence
  is rewritten to say whose score it is.
`);
