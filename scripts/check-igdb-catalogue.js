/**
 * Offline checks for the IGDB catalogue surface. No token, no network, no cost.
 *
 * The RAWG equivalent has 54 of these and they are why `buildPoolQuery` can be
 * trusted without spending a request. Two things here deserve more suspicion
 * than their RAWG counterparts did:
 *
 *   The query is a LANGUAGE. RAWG took URL parameters, where the worst a bad
 *   value could do was produce a wrong result. Apicalypse is parsed, so a value
 *   that reaches a query body unvalidated is a different class of problem. The
 *   design answer is that `resolveFilters` is the only path from user input to a
 *   query and it emits integers from a pinned file — but `buildPoolQuery`
 *   validates anyway, because "the caller is careful" is a property of today's
 *   caller.
 *
 *   `excludePlayed` now THROWS. After a catalogue swap the library holds ids
 *   from another namespace, and comparing them matches nothing silently. The
 *   checks below are mostly about that silence.
 *
 *   node scripts/check-igdb-catalogue.js
 */

import {
  buildPoolQuery, resolveFilters, toCandidate, usable, excludePlayed,
  rankByTagMatch, SOURCE, MIN_USER_RATINGS, MIN_CRITIC_REVIEWS,
} from "../src/igdb-catalogue.js";

let passed = 0;
const failures = [];

function check(name, fn) {
  try { fn(); passed++; }
  catch (e) { failures.push(`${name}\n    ${e.message}`); }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || "assertion failed"); }
function throws(fn, fragment) {
  try { fn(); } catch (e) {
    if (fragment && !e.message.includes(fragment)) {
      throw new Error(`threw, but for the wrong reason: ${e.message}`);
    }
    return;
  }
  throw new Error("expected a throw, got none");
}

// --- fixtures ----------------------------------------------------------------
// A fixture vocabulary, never data/*.igdb.json — pitfall 14. Ids and slugs are
// real ones printed by the probes, so the shapes match without the coupling.

const VOCAB = {
  genreIdBySlug: new Map([["puzzle", 9], ["shooter", 5], ["racing", 10]]),
  facetBySlug: new Map([
    ["horror", { id: 19, field: "themes" }],
    ["open-world", { id: 38, field: "themes" }],
    ["split-screen", { id: 4, field: "game_modes" }],
    ["first-person", { id: 1, field: "player_perspectives" }],
  ]),
  machineIdBySlug: new Map([["ngc", 21], ["win", 6], ["switch", 130]]),
  familyByMachine: new Map([["ngc", "nintendo"], ["switch", "nintendo"], ["win", "pc"]]),
  facetSlugs: new Set(["horror", "open-world", "split-screen", "first-person"]),
  excludedThemeIds: [42],
};

const RAW = {
  id: 1029,
  name: "A Game",
  slug: "a-game",
  summary: "A first sentence that is comfortably past the usable floor and then some. A second.",
  first_release_date: 1554163200,            // 2019-04-02
  aggregated_rating: 91.6,
  aggregated_rating_count: 12,
  rating: 88.2,
  rating_count: 430,
  total_rating_count: 442,
  cover: { image_id: "co3p2d" },
  screenshots: [{ image_id: "sc1" }, { image_id: "sc2" }],
  videos: [{ video_id: "vTaD8maruNs" }],
  genres: [{ slug: "puzzle" }, { slug: "indie" }],
  themes: [{ slug: "horror" }, { slug: "not-in-our-vocabulary" }],
  game_modes: [{ slug: "split-screen" }],
  player_perspectives: [{ slug: "first-person" }],
  platforms: [{ slug: "ngc" }, { slug: "switch" }],
  involved_companies: [{ company: { name: "Dev One" } }, { company: { name: "Dev Two" } }],
};

// --- resolveFilters -----------------------------------------------------------

check("slugs become ids grouped by their own field", () => {
  const r = resolveFilters(
    { categorySlug: "puzzle", tagSlugs: ["horror", "split-screen", "open-world"], machineSlugs: ["ngc"] },
    VOCAB
  );
  assert(r.genreId === 9, `got ${r.genreId}`);
  assert(r.platformIds.join() === "21", `got ${r.platformIds}`);
  assert(r.byField.get("themes").sort().join() === "19,38", `got ${r.byField.get("themes")}`);
  assert(r.byField.get("game_modes").join() === "4");
});

check("a slug the vocabulary does not know is dropped, not passed through", () => {
  // Pitfall 9: whatever is in the pinned files is the entire vocabulary. A slug
  // from anywhere else is not a filter this product understands — and this is
  // also the only path from user input toward a query body.
  const r = resolveFilters(
    { categorySlug: "not-a-genre", tagSlugs: ["horror", "made-up"], machineSlugs: ["ngc", "atari2600"] },
    VOCAB
  );
  assert(r.genreId === null, "an unknown category resolves to no filter");
  assert(r.knownTagSlugs.join() === "horror", `got ${r.knownTagSlugs}`);
  assert(r.platformIds.join() === "21", "an unknown machine is dropped");
});

check("a query-language payload in a slug resolves to nothing", () => {
  const r = resolveFilters(
    { categorySlug: 'puzzle); drop', tagSlugs: ["horror; limit 500"], machineSlugs: ["ngc"] },
    VOCAB
  );
  assert(r.genreId === null);
  assert(r.knownTagSlugs.length === 0);
});

check("duplicate machines collapse", () => {
  const r = resolveFilters({ machineSlugs: ["ngc", "ngc", "switch"] }, VOCAB);
  assert(r.platformIds.join() === "21,130", `got ${r.platformIds}`);
});

// --- buildPoolQuery -----------------------------------------------------------

check("a minimal query carries the platform and the re-release filter", () => {
  const q = buildPoolQuery({ platformIds: [21] });
  assert(q.includes("where "), "has a where clause");
  assert(q.includes("platforms = (21)"), q);
  assert(q.includes("parent_game = null"), "re-releases are excluded by default");
  assert(!q.includes("genres = "), "no category means no genre clause at all");
  assert(!q.includes("themes = ("), "no tags means no theme clause");
});

check("several ids in one field are OR, and fields are joined with AND", () => {
  const q = buildPoolQuery({
    platformIds: [21, 130],
    byField: new Map([["themes", [19, 38]], ["game_modes", [4]]]),
  });
  assert(q.includes("platforms = (21,130)"), q);
  assert(q.includes("themes = (19,38)"), q);
  assert(q.includes("game_modes = (4)"), q);
  assert(q.includes(" & "), "clauses are joined with AND");
  assert(!q.includes("themes = [") , "within a field it is OR, not AND — decision 0004");
});

check("the exclusion clause is present when there is something to exclude", () => {
  const q = buildPoolQuery({ platformIds: [6], excludedThemeIds: [42] });
  assert(q.includes("themes != (42)"), q);
});

check("no exclusion ids means no exclusion clause", () => {
  const q = buildPoolQuery({ platformIds: [6], excludedThemeIds: [] });
  assert(!q.includes("!="), q);
});

check("a category becomes a genre clause", () => {
  const q = buildPoolQuery({ platformIds: [6], genreId: 9 });
  assert(q.includes("genres = (9)"), q);
});

check("limit and offset are carried", () => {
  const q = buildPoolQuery({ platformIds: [6], limit: 100, offset: 200 });
  assert(q.includes("limit 100"), q);
  assert(q.includes("offset 200"), q);
});

// --- buildPoolQuery refuses -----------------------------------------------------
//
// Every one of these would be a caller's mistake rather than a user's. They
// throw anyway: a query language deserves the same suspicion as SQL even when
// the inputs are believed safe, because "believed safe" describes today's
// caller and this function will outlive it.

check("a query without a platform is refused", () => {
  throws(() => buildPoolQuery({ platformIds: [] }), "at least one platform");
});

check("a non-integer platform id is refused", () => {
  throws(() => buildPoolQuery({ platformIds: ["6; limit 500"] }), "must be integers");
  throws(() => buildPoolQuery({ platformIds: [6.5] }), "must be integers");
});

check("a non-integer genre id is refused", () => {
  throws(() => buildPoolQuery({ platformIds: [6], genreId: "9" }), "must be an integer");
});

check("a field name that is not a field name is refused", () => {
  throws(
    () => buildPoolQuery({ platformIds: [6], byField: new Map([["themes; drop", [1]]]) }),
    "is not a field name"
  );
});

check("a limit outside IGDB's range is refused", () => {
  throws(() => buildPoolQuery({ platformIds: [6], limit: 0 }), "1-500");
  throws(() => buildPoolQuery({ platformIds: [6], limit: 501 }), "1-500");
});

check("a negative offset is refused", () => {
  throws(() => buildPoolQuery({ platformIds: [6], offset: -1 }), "whole number");
});

check("non-integer ids inside a field are dropped rather than written", () => {
  const q = buildPoolQuery({ platformIds: [6], byField: new Map([["themes", [19, "x"]]]) });
  assert(q.includes("themes = (19)"), q);
  assert(!q.includes("x"), q);
});

// --- toCandidate ---------------------------------------------------------------

check("a record becomes a candidate", () => {
  const c = toCandidate(RAW, VOCAB);
  assert(c.id === 1029 && c.title === "A Game");
  assert(c.released === "2019-04-02", `got ${c.released}`);
  assert(c.machines.join() === "ngc,switch");
});

check("families are derived from the pinned tree, deduplicated", () => {
  // Criterion 3 is checked against whichever granularity the user asked for,
  // and IGDB records carry machines only. Both machines here are Nintendo.
  const c = toCandidate(RAW, VOCAB);
  assert(c.platforms.join() === "nintendo", `got ${c.platforms}`);
});

check("a machine outside the tree contributes no family rather than an invented one", () => {
  const c = toCandidate({ ...RAW, platforms: [{ slug: "atari2600" }] }, VOCAB);
  assert(c.machines.join() === "atari2600");
  assert(c.platforms.length === 0, `got ${c.platforms}`);
});

check("facets from three fields merge, and unknown ones are dropped", () => {
  const c = toCandidate(RAW, VOCAB);
  assert(c.tags.includes("horror"));
  assert(c.tags.includes("split-screen"));
  assert(c.tags.includes("first-person"));
  assert(!c.tags.includes("not-in-our-vocabulary"), `got ${c.tags}`);
});

check("indie is not a category", () => {
  const c = toCandidate(RAW, VOCAB);
  assert(c.categories.join() === "puzzle", `got ${c.categories}`);
});

check("the critic score is rounded and keeps its panel size", () => {
  const c = toCandidate(RAW, VOCAB);
  assert(c.criticScore === 92, `91.6 should round to 92, got ${c.criticScore}`);
  assert(c.criticReviews === 12, `got ${c.criticReviews}`);
  assert(!("metacritic" in c), "the field must not be named after a source this app does not use");
});

check("images and video are built, not passed through", () => {
  const c = toCandidate(RAW, VOCAB);
  assert(c.image.startsWith("https://images.igdb.com/"), c.image);
  assert(c.screenshots.length === 2);
  assert(c.video === "https://www.youtube.com/embed/vTaD8maruNs", c.video);
});

check("the display image is a screenshot, not the box art", () => {
  // `cover` is portrait box art and every frame in this interface is 16:9.
  // Putting a cover there cropped Stray's card to the middle of the cat.
  const c = toCandidate(RAW, VOCAB);
  assert(c.image === c.screenshots[0], `got ${c.image}`);
  assert(c.cover !== c.image, "the cover is kept, under its own name");
  assert(c.cover.includes("/t_cover_big/"), c.cover);
});

check("a game with no screenshots falls back to the cover rather than nothing", () => {
  const c = toCandidate({ ...RAW, screenshots: [] }, VOCAB);
  assert(c.image !== null, "a card with no picture is a card that cannot be drawn");
  assert(c.image.includes("coc7me") || c.image.includes(RAW.cover.image_id), c.image);
  assert(c.screenshots.length === 0);
});

check("a video id that is not a youtube id yields no video", () => {
  const c = toCandidate({ ...RAW, videos: [{ video_id: "../evil" }] }, VOCAB);
  assert(c.video === null, `got ${c.video}`);
});

check("a record with nothing but an id still shapes", () => {
  const c = toCandidate({ id: 7 }, VOCAB);
  assert(c !== null);
  assert(c.title === null && c.machines.length === 0 && c.tags.length === 0);
  assert(c.criticScore === null && c.ratingCount === 0);
});

check("a record with no id is refused", () => {
  assert(toCandidate(null, VOCAB) === null);
  assert(toCandidate({ name: "No id" }, VOCAB) === null);
  assert(toCandidate({ id: "1029" }, VOCAB) === null, "a string id is not an id");
});

// --- usable ---------------------------------------------------------------------

check("enough user ratings is enough", () => {
  assert(usable(toCandidate({ ...RAW, rating_count: MIN_USER_RATINGS, aggregated_rating_count: 0 }, VOCAB)));
});

check("enough critic reviews is also enough, with no user ratings at all", () => {
  // The Witness: critic score 96 from 7 reviews, user rating count 0. A single
  // user-rating floor would discard a famous game, which is the opposite of
  // what the threshold exists to do.
  const c = toCandidate({ ...RAW, rating_count: 0, aggregated_rating_count: MIN_CRITIC_REVIEWS }, VOCAB);
  assert(usable(c), "a reviewed game with no user ratings is still known");
});

check("neither signal is not usable", () => {
  const c = toCandidate({ ...RAW, rating_count: 2, aggregated_rating_count: 0 }, VOCAB);
  assert(!usable(c));
});

check("a game on no machine is not usable at any popularity", () => {
  // Criterion 3 cannot be checked against a record with no platforms, so it
  // cannot be allowed into a set the model chooses from.
  const c = toCandidate({ ...RAW, platforms: [], rating_count: 99999 }, VOCAB);
  assert(!usable(c));
});

check("a game with no title is not usable", () => {
  assert(!usable(toCandidate({ ...RAW, name: null }, VOCAB)));
});

// --- excludePlayed and the source guard -------------------------------------------

check("ids in the library are removed", () => {
  const pool = [{ id: 1 }, { id: 2 }, { id: 3 }];
  assert(excludePlayed(pool, [2]).map(c => c.id).join() === "1,3");
});

check("entries from this catalogue exclude normally", () => {
  const pool = [{ id: 1 }, { id: 2 }];
  const entries = [{ game_id: 2, source: SOURCE }];
  assert(excludePlayed(pool, [2], entries).map(c => c.id).join() === "1");
});

check("entries from another catalogue throw rather than quietly excluding nothing", () => {
  // The failure this exists for: after a swap the ids belong to another
  // namespace, nothing matches, three games come back, every gate passes, and
  // the page says "0 games in your library were kept out of this" — which is
  // false. An empty exclusion is indistinguishable from an empty library.
  const pool = [{ id: 1 }, { id: 2 }];
  const entries = [{ game_id: 900, source: "rawg" }];
  throws(() => excludePlayed(pool, [900], entries), "different catalogue");
});

check("an entry with no source at all is treated as the old catalogue's", () => {
  // Rows written before the source column existed. Defaulting to the current
  // source would make them invisible, which is the silent failure again.
  throws(() => excludePlayed([{ id: 1 }], [1], [{ game_id: 1 }]), "different catalogue");
});

check("no entries passed means no source check, and exclusion still works", () => {
  assert(excludePlayed([{ id: 1 }, { id: 2 }], [1]).map(c => c.id).join() === "2");
});

// --- ranking ---------------------------------------------------------------------

check("more matched tags come first, ties keep the incoming order", () => {
  const pool = [
    { id: 1, tags: ["horror"] },
    { id: 2, tags: ["horror", "split-screen"] },
    { id: 3, tags: [] },
    { id: 4, tags: ["split-screen"] },
  ];
  const r = rankByTagMatch(pool, ["horror", "split-screen"]);
  assert(r.map(c => c.id).join() === "2,1,4,3", `got ${r.map(c => c.id)}`);
});

check("ranking never discards", () => {
  const pool = [{ id: 1, tags: [] }, { id: 2, tags: [] }];
  assert(rankByTagMatch(pool, ["horror"]).length === 2);
});

check("ranking copies rather than sorting in place", () => {
  // The candidate set that gets logged must stay the set that was sent.
  const pool = [{ id: 1, tags: [] }, { id: 2, tags: ["horror"] }];
  rankByTagMatch(pool, ["horror"]);
  assert(pool[0].id === 1, "the caller's array was reordered");
  assert(!("matchedTags" in pool[0]), "the caller's objects were mutated");
});

// --- report -----------------------------------------------------------------------

console.log(`\n${passed} checks passed, ${failures.length} failed\n`);
if (failures.length) {
  for (const f of failures) console.log(`FAILED  ${f}\n`);
  process.exit(1);
}
console.log("Offline, against fixtures. That every filter here actually filters was");
console.log("established separately by scripts/inspect-igdb-catalogue.js, which is the");
console.log("only thing that can answer it.");
