/**
 * The catalogue, on IGDB.
 *
 * Implements the same exported surface as `src/catalogue.js`, so
 * `src/pipeline.js`, `src/shortlist.js` and all nine gates do not change: they
 * were written against this surface rather than against a vendor. Swapping
 * sources is one import line, which is the whole payoff of turn 005's decision
 * to put every catalogue call in one file.
 *
 * Every filter used here was verified to actually filter before this was
 * written — scripts/inspect-igdb-catalogue.js, comparing filtered counts against
 * an unfiltered baseline of 320,307. Pitfall 20: an ignored query parameter
 * looks exactly like a working one.
 *
 * WHAT CHANGED IN THE SHAPE OF A CANDIDATE, AND WHY
 *
 *   metacritic  ->  criticScore + criticReviews
 *
 *     Not a rename for tidiness. `src/shortlist.js` wrote "The best reviewed of
 *     the three, at 92 on Metacritic" straight out of that field. IGDB's
 *     `aggregated_rating` is IGDB's own aggregation over IGDB's own critic list
 *     — Elden Ring's is drawn from ten reviews — and calling it Metacritic would
 *     have the app name a source it is not using. The count travels with the
 *     score because a 100 from one review and a 97 from twenty-seven are not the
 *     same claim, and only one of them belongs at the top of a sort.
 *
 *   playtime    ->  gone
 *
 *     IGDB games carry no playtime field and `game_time_to_beat` returns 404.
 *     The `short-one` angle's constraint cannot be checked, so the angle is
 *     removed from data/angles.json rather than left as one whose gate can never
 *     pass. A gate that cannot fail is not a gate; an angle that can never be
 *     granted is the same defect facing the other way.
 *
 *   video       ->  actually present
 *
 *     RAWG charged $149/month. Here it is a YouTube id on the record, validated
 *     before it reaches an iframe.
 *
 * TAGS ARE STILL CLAIMS, AND SO ARE CATEGORIES NOW.
 *
 *   RAWG filed God of War as a souls-like. IGDB files Breath of the Wild under
 *   `puzzle`. The vocabularies are cleaner here — curated lists rather than
 *   9,736 scraped labels — but a genre is still a claim the catalogue makes, not
 *   a fact it holds. Platforms and release dates are facts. Criterion 4 proves
 *   the catalogue says so and nothing more, and no line of interface copy may
 *   claim otherwise.
 */

import { igdbRequest, igdbCount, imageUrl, youTubeUrl } from "./igdb.js";
import { trimDescription } from "./text.js";
import { readData } from "./paths.js";

export const CANDIDATE_TARGET = 24;

/**
 * How many people must have rated a game, OR how many critics reviewed it.
 *
 * RAWG's `MIN_RATINGS = 200` existed for one reason: keeping the shortlist to
 * games the *model* can write about truthfully, which is the only defence this
 * project has against pitfall 1. The reason survives the migration; the number
 * does not, because IGDB counts different things.
 *
 * Two thresholds instead of one, because a single user-rating floor is wrong
 * here. The Witness has a critic score of 96 from seven reviews and a user
 * rating count of zero — a famous game that a user floor alone would discard.
 * Either signal means the game is known enough to be written about.
 *
 * Both numbers are measured, not chosen: see section 5 of
 * scripts/inspect-igdb-catalogue.js, which prints the distribution they came
 * from. If that section has not been run, treat them as provisional and say so
 * rather than defending them.
 */
export const MIN_USER_RATINGS = 50;
export const MIN_CRITIC_REVIEWS = 3;

/**
 * Themes never offered and never returned.
 *
 * Removing the checkbox is not the same as removing the games: "any kind of
 * game" on PC with no filters would still reach them. So this is a clause on
 * every candidate query rather than an omission from a vocabulary.
 *
 * Verified exact — 177,303 PC games, 8,353 carrying the theme, 168,950 with the
 * clause applied — and verified not to also discard games with no themes at all,
 * which was the likelier failure and would have been invisible.
 */
const EXCLUDED_THEME_SLUGS = ["erotic"];

/**
 * `indie` describes who made a game, not what it is.
 *
 * It is IGDB's largest genre at 127,216 of 320,307 and it narrows nothing. This
 * is RAWG's "Action holds 192,185 games" in different clothes: a category so
 * broad that choosing it is indistinguishable from choosing nothing, while
 * looking to the user like a decision.
 */
const EXCLUDED_GENRE_SLUGS = ["indie"];

// --- the vocabulary ----------------------------------------------------------

let vocab = null;

/**
 * Load the pinned vocabularies and index them for both directions.
 *
 * Query building needs slug -> id. Shaping a record needs the set of slugs the
 * product understands. Deriving a family from a machine needs machine -> family.
 * All three come from the same pinned files, so they cannot disagree.
 */
export function loadVocabulary() {
  if (vocab) return vocab;

  const platformsFile = JSON.parse(readData("data/platforms.igdb.json"));
  const categoriesFile = JSON.parse(readData("data/categories.igdb.json"));
  const facetsFile = JSON.parse(readData("data/tags.igdb.json"));

  const genreIdBySlug = new Map();
  for (const c of categoriesFile.categories) {
    if (!EXCLUDED_GENRE_SLUGS.includes(c.slug)) genreIdBySlug.set(c.slug, c.id);
  }

  // A facet slug carries the field it belongs to. A user ticks "split screen"
  // and "horror" without knowing one is a game_mode and the other a theme; the
  // query has to know, because they are separate filters joined with AND.
  const facetBySlug = new Map();
  for (const f of facetsFile.facets) {
    for (const t of f.tags) facetBySlug.set(t.slug, { id: t.id, field: f.field });
  }

  const machineIdBySlug = new Map();
  const familyByMachine = new Map();
  for (const family of platformsFile.platforms) {
    for (const m of family.platforms) {
      machineIdBySlug.set(m.slug, m.id);
      familyByMachine.set(m.slug, family.slug);
    }
  }

  vocab = {
    genreIdBySlug,
    facetBySlug,
    machineIdBySlug,
    familyByMachine,
    // What `toCandidate` is allowed to keep. Same role as the RAWG tag Set.
    facetSlugs: new Set(facetBySlug.keys()),
    excludedThemeIds: facetsFile.facets
      .flatMap(f => f.tags)
      .filter(t => EXCLUDED_THEME_SLUGS.includes(t.slug))
      .map(t => t.id),
  };
  return vocab;
}

/** Cleared so a check cannot pass on a vocabulary another check loaded. */
export function __resetVocabularyForTests() { vocab = null; }

/**
 * Turn what the user picked into ids the query can carry.
 *
 * Pure, and it is where every user-supplied value stops being text. Apicalypse
 * is a query language and catalogue data is attacker-controlled, so nothing
 * reaches a query body except integers that came out of a pinned file. A slug
 * the vocabulary does not know is dropped rather than passed through — it cannot
 * be a filter the product understands, by definition of pitfall 9.
 */
export function resolveFilters({ categorySlug, tagSlugs = [], machineSlugs = [] }, v) {
  const genreId = categorySlug ? v.genreIdBySlug.get(categorySlug) ?? null : null;

  // Grouped by field. Within a field the ids are OR; across fields, AND.
  const byField = new Map();
  const known = [];
  for (const slug of tagSlugs) {
    const entry = v.facetBySlug.get(slug);
    if (!entry) continue;
    if (!byField.has(entry.field)) byField.set(entry.field, []);
    byField.get(entry.field).push(entry.id);
    known.push(slug);
  }

  const platformIds = [];
  for (const slug of machineSlugs) {
    const id = v.machineIdBySlug.get(slug);
    if (Number.isInteger(id) && !platformIds.includes(id)) platformIds.push(id);
  }

  return { genreId, byField, platformIds, knownTagSlugs: known };
}

// --- the query ---------------------------------------------------------------

const FIELDS = [
  "id", "name", "slug", "summary", "first_release_date",
  "aggregated_rating", "aggregated_rating_count", "rating", "rating_count",
  "total_rating_count", "game_type", "parent_game",
  "cover.image_id", "screenshots.image_id", "videos.video_id",
  "genres.slug", "themes.slug", "game_modes.slug", "player_perspectives.slug",
  "platforms.slug", "involved_companies.company.name",
].join(",");

/**
 * Build the Apicalypse body for a candidate pool. Pure — no network, no token.
 *
 * Takes ids, never slugs. `resolveFilters` is the only thing that turns user
 * input into ids, and it does it against a pinned file, so by the time a value
 * reaches this function it is an integer that the product itself chose.
 *
 * Everything is validated anyway. A query language deserves the same suspicion
 * as SQL even when the inputs are believed safe, because "believed safe" is a
 * property of today's caller and this function will outlive it.
 */
export function buildPoolQuery({
  genreId = null,
  platformIds = [],
  byField = new Map(),
  excludedThemeIds = [],
  limit = 100,
  offset = 0,
}) {
  if (genreId !== null && !Number.isInteger(genreId)) {
    throw new Error("buildPoolQuery: genreId must be an integer or null.");
  }
  if (!Array.isArray(platformIds) || platformIds.length === 0) {
    throw new Error("buildPoolQuery: at least one platform id is required.");
  }
  if (platformIds.some(id => !Number.isInteger(id))) {
    throw new Error("buildPoolQuery: platform ids must be integers.");
  }
  if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
    throw new Error("buildPoolQuery: limit must be 1-500.");
  }
  if (!Number.isInteger(offset) || offset < 0) {
    throw new Error("buildPoolQuery: offset must be a whole number.");
  }

  const where = [
    // A re-release is a real game and not a new one. IGDB's equivalent of
    // RAWG's exclude_additions, and the filter that kept a Switch 2 port of a
    // 2020 game out of a row about 2026.
    "parent_game = null",
    `platforms = (${platformIds.join(",")})`,
  ];

  if (genreId !== null) where.push(`genres = (${genreId})`);

  for (const [field, ids] of byField) {
    if (!/^[a-z_]+$/.test(field)) {
      throw new Error(`buildPoolQuery: "${field}" is not a field name.`);
    }
    const clean = ids.filter(Number.isInteger);
    // Within a field, OR. Two themes ticked means either, and `rankByTagMatch`
    // puts the games carrying both in front — decision 0004's reasoning, which
    // outlived the catalogue that caused it. IGDB can express AND here, and on
    // GameCube it took 151 games down to 9; criterion 5 then forbids relaxing
    // the filter, so the honest result would be an empty page.
    if (clean.length) where.push(`${field} = (${clean.join(",")})`);
  }

  const excluded = excludedThemeIds.filter(Number.isInteger);
  // Verified to remove exactly the games carrying the theme, and not to discard
  // games with no themes at all.
  if (excluded.length) where.push(`themes != (${excluded.join(",")})`);

  return (
    `fields ${FIELDS};\n` +
    `where ${where.join(" & ")};\n` +
    // How many people have rated it — the proxy for "the model has heard of
    // this game", same reasoning as RAWG's -rating ordering and MIN_RATINGS.
    `sort total_rating_count desc;\n` +
    `limit ${limit};\noffset ${offset};`
  );
}

// --- shaping ------------------------------------------------------------------

const slugs = list => (Array.isArray(list) ? list.map(x => x?.slug).filter(Boolean) : []);

function isoDate(unixSeconds) {
  if (!Number.isFinite(unixSeconds)) return null;
  return new Date(unixSeconds * 1000).toISOString().slice(0, 10);
}

/**
 * Normalise one IGDB record into the candidate shape the rest of the app knows.
 *
 * Every field guarded. The shape was verified against real responses by
 * scripts/inspect-igdb.js before this was written, and a record may still omit
 * any of them.
 */
export function toCandidate(raw, v = loadVocabulary()) {
  if (!raw || typeof raw.id !== "number") return null;

  const machines = slugs(raw.platforms);

  const shots = (Array.isArray(raw.screenshots) ? raw.screenshots : [])
    .map(s => imageUrl(s, "screenshot"))
    .filter(Boolean);
  const firstShot = shots[0] ?? null;

  // IGDB games carry machines, not families. RAWG gave both, and criterion 3 is
  // checked against whichever granularity the user asked for — saying a game is
  // "on Nintendo" is no use to someone who asked for a GameCube and owns only
  // that. So the family is derived from the pinned tree rather than fetched,
  // and a machine outside the tree contributes no family rather than an invented
  // one.
  const families = [];
  for (const m of machines) {
    const f = v.familyByMachine.get(m);
    if (f && !families.includes(f)) families.push(f);
  }

  const facets = [
    ...slugs(raw.themes),
    ...slugs(raw.game_modes),
    ...slugs(raw.player_perspectives),
  ].filter(s => v.facetSlugs.has(s));

  return {
    id: raw.id,
    slug: raw.slug ?? null,
    title: raw.name ?? null,
    released: isoDate(raw.first_release_date),
    // `cover` is BOX ART, and box art is portrait. RAWG's `background_image` was
    // a landscape still, so the interface was built around one and handed the
    // other by the migration: a 16:9 frame cropped Stray's cover to the middle
    // of the cat.
    //
    // Screenshots are 1920x1080 and fit the frame exactly, so the display image
    // is the first screenshot wherever there is one. The cover is kept under its
    // own name for anywhere that genuinely wants box art, rather than thrown
    // away — it is the better picture for a shelf, just not for a wide card.
    cover: imageUrl(raw.cover, "cover"),
    image: firstShot ?? imageUrl(raw.cover, "card"),
    screenshots: shots,
    // The thing RAWG's free tier would not sell.
    video: youTubeUrl((Array.isArray(raw.videos) ? raw.videos : [])[0]),
    platforms: families,
    machines,
    categories: slugs(raw.genres).filter(s => !EXCLUDED_GENRE_SLUGS.includes(s)),
    tags: [...new Set(facets)],
    // IGDB's own users, not critics. Kept under the name the rest of the app
    // already uses for "how many people have registered an opinion".
    ratingCount: Number.isFinite(raw.rating_count) ? raw.rating_count : 0,
    // Critics, with the size of the panel attached. Never called metacritic.
    criticScore: Number.isFinite(raw.aggregated_rating) ? Math.round(raw.aggregated_rating) : null,
    criticReviews: Number.isFinite(raw.aggregated_rating_count) ? raw.aggregated_rating_count : 0,
    // On the list record here, where RAWG needed a second request per game.
    summary: trimDescription(raw.summary),
    developers: (Array.isArray(raw.involved_companies) ? raw.involved_companies : [])
      .map(c => c?.company?.name).filter(Boolean).slice(0, 3),
  };
}

/**
 * Drop anything the shortlist stage would have to reject anyway. Pure.
 *
 * The platform check is against machines rather than families: a record with no
 * machines cannot be checked against criterion 3 at any granularity.
 */
export function usable(candidate) {
  if (!candidate) return false;
  if (!candidate.title) return false;
  if (candidate.machines.length === 0) return false;
  const knownToTheWorld =
    candidate.ratingCount >= MIN_USER_RATINGS ||
    candidate.criticReviews >= MIN_CRITIC_REVIEWS;
  return knownToTheWorld;
}

/**
 * Criterion 8, and the reason it is code rather than a prompt line.
 *
 * `source` is checked, not just the id. After a catalogue swap the library holds
 * ids from a namespace this catalogue does not share, and comparing them matches
 * nothing — silently. The shortlist would still return three games, every gate
 * would still pass, and the page would still say "0 games in your library were
 * kept out of this", which would be false.
 *
 * A criterion that cannot be checked has to say so. Throwing is the only way the
 * caller finds out, because the successful-looking empty exclusion is
 * indistinguishable from an empty library.
 */
export const SOURCE = "igdb";

export function excludePlayed(candidates, playedIds, entries = null) {
  if (entries) {
    const foreign = entries.filter(e => (e.source ?? "rawg") !== SOURCE);
    if (foreign.length) {
      const e = new Error(
        `${foreign.length} library entries came from a different catalogue ` +
        `(${[...new Set(foreign.map(f => f.source ?? "rawg"))].join(", ")}), ` +
        `so they cannot be excluded from an ${SOURCE} shortlist.`
      );
      e.kind = "library-source";
      throw e;
    }
  }
  const played = new Set((playedIds || []).map(Number));
  return candidates.filter(c => !played.has(c.id));
}

/**
 * Order a pool by how many of the requested tags each candidate carries.
 *
 * Unchanged in spirit from the RAWG version, and for a reason that outlived the
 * catalogue: within a facet the query is OR, so a person ticking two boxes gets
 * either, and ranking gives the intent without the cliff that strict AND
 * produces. Full matches first, partial behind, nothing discarded.
 *
 * Ties keep the incoming order. Pure, and it copies rather than sorting in
 * place: the candidate set that gets logged must stay the set that was sent.
 */
export function rankByTagMatch(candidates, tagSlugs) {
  const wanted = tagSlugs || [];
  const scored = candidates.map((c, index) => ({
    ...c,
    matchedTags: wanted.filter(t => c.tags.includes(t)),
    index,
  }));
  scored.sort((a, b) => b.matchedTags.length - a.matchedTags.length || a.index - b.index);
  return scored.map(({ index, ...c }) => c);
}

/** How concentrated a pool is in games carrying a great many labels. Pure. */
export function dominanceReport(candidates) {
  const counts = candidates.map(c => c.tags.length);
  const total = counts.reduce((a, b) => a + b, 0);
  return {
    poolSize: candidates.length,
    meanTagsPerCandidate: candidates.length ? +(total / candidates.length).toFixed(1) : 0,
    mostTagged: [...candidates]
      .sort((a, b) => b.tags.length - a.tags.length)
      .slice(0, 5)
      .map(c => ({ title: c.title, tagCount: c.tags.length, ratingCount: c.ratingCount })),
  };
}

// --- network ------------------------------------------------------------------

/**
 * How many games the catalogue holds for a filter. One request, one number.
 *
 * A separate endpoint here, where RAWG carried the total on every list response.
 * That makes `diagnoseThin` more expensive than it was — three counts is three
 * requests — and it is still worth it: being told confidently to change the
 * wrong filter is worse than being told nothing.
 */
export async function countFor({ categorySlug, tagSlugs = [], machineSlugs = [] }) {
  const v = loadVocabulary();
  const { genreId, byField, platformIds } = resolveFilters(
    { categorySlug, tagSlugs, machineSlugs }, v
  );
  const body = buildPoolQuery({
    genreId, platformIds, byField, excludedThemeIds: v.excludedThemeIds, limit: 1,
  });
  // Only the `where` travels to /count. Everything else is list syntax.
  const where = body.match(/where ([\s\S]*?);/)?.[1];
  return igdbCount("games", where);
}

/**
 * Step 2. Assemble the candidate set that will be sent to the model.
 *
 * Returns the set and the query that produced it. Both are logged — criterion 7
 * — because without the query a bad shortlist cannot be attributed to the filter
 * rather than to the model, and pitfall 5 becomes invisible.
 *
 * One request usually does it. IGDB allows 500 records where RAWG allowed 40,
 * and a single page of 100 with every expansion attached replaces three RAWG
 * pages plus a description request per pick.
 */
export async function assembleCandidates({
  categorySlug,
  tagSlugs = [],
  machineSlugs = [],
  playedIds = [],
  libraryEntries = null,
  target = CANDIDATE_TARGET,
  pageSize = 100,
  maxPages = 2,
}) {
  const v = loadVocabulary();
  const { genreId, byField, platformIds, knownTagSlugs } =
    resolveFilters({ categorySlug, tagSlugs, machineSlugs }, v);

  if (platformIds.length === 0) {
    const e = new Error("No platform was recognised from the pinned vocabulary.");
    e.kind = "request";
    throw e;
  }

  const seen = new Map();
  let queries = [];
  let exhausted = false;

  for (let page = 0; page < maxPages; page++) {
    const body = buildPoolQuery({
      genreId, platformIds, byField,
      excludedThemeIds: v.excludedThemeIds,
      limit: pageSize,
      offset: page * pageSize,
    });
    queries.push(body);

    const rows = await igdbRequest("games", body);
    for (const raw of rows) {
      const c = toCandidate(raw, v);
      if (usable(c) && !seen.has(c.id)) seen.set(c.id, c);
    }

    if (rows.length < pageSize) { exhausted = true; break; }
    if (seen.size >= target * 2) break;
  }

  // Rank before truncating, or the best matches get cut off by an arbitrary
  // slice while worse ones survive because the catalogue ranked them higher.
  const ranked = rankByTagMatch(
    excludePlayed([...seen.values()], playedIds, libraryEntries),
    knownTagSlugs
  );
  const candidates = ranked.slice(0, target);

  // The same `query` shape `src/catalogue.js` returns, field for field. The
  // point of two modules with one surface is that `src/pipeline.js` cannot tell
  // which it is talking to, and that has to include what gets logged — criterion
  // 7 is only useful if a record from before the swap and one from after can be
  // read the same way.
  return {
    candidates,
    query: {
      source: SOURCE,
      categorySlug: categorySlug ?? null,
      machineSlugs: [...machineSlugs],
      platformIds: [...platformIds],
      // Always true here. IGDB games carry machines and not families, so every
      // request resolves to machine ids — there is no second granularity to
      // record, where RAWG had two parameters and the choice between them
      // mattered when reading a result back.
      platformsAreSpecific: true,
      tagSlugs: [...knownTagSlugs],
      // How many candidates carry every requested tag. Within a facet the query
      // is OR, so this is the difference between "four split-screen horror
      // games" and "one, plus twenty that are one or the other".
      fullMatches: knownTagSlugs.length
        ? candidates.filter(c => c.matchedTags.length === knownTagSlugs.length).length
        : null,
      excludedCount: playedIds.length,
      minUserRatings: MIN_USER_RATINGS,
      minCriticReviews: MIN_CRITIC_REVIEWS,
      pagesFetched: queries.length,
      poolExhausted: exhausted,
      // What the catalogue holds for this filter before our own thresholds.
      // A separate request here, where RAWG returned it with every page — so it
      // is fetched only when the result is thin enough to need explaining.
      catalogueCount: null,
      // Distinguishes "the catalogue has only four of these" from "we stopped
      // looking". Pitfall 10 needs the difference.
      usableFound: seen.size,
      dominance: dominanceReport(candidates),
      bodies: queries,
    },
  };
}

/**
 * Kept for interface compatibility and does nothing, deliberately.
 *
 * RAWG's list endpoint carried no description, so the pipeline fetched one per
 * pick — three extra requests per shortlist. IGDB puts `summary` on the list
 * record, so the description is already on every candidate by the time anything
 * asks for it. Returning it from the candidate rather than removing the function
 * keeps the swap to one import line; the call site is removed when the RAWG
 * module is.
 */
export async function fetchDescription(_id, candidate = null) {
  return candidate?.summary ?? null;
}
