/**
 * The catalogue. Every call to an external game database happens in this file.
 *
 * Nothing else in the project may import a catalogue URL, a catalogue key, or a
 * catalogue field name. The point is that swapping RAWG for another source costs
 * this file and a decision record — see docs/decisions/0003 and 0004.
 *
 * Two rules that come from the specification rather than from convenience:
 *
 *   - This module makes no model call, ever. Steps 1 and 2 of the pipeline are
 *     pure code, which is what lets them be checked with no key and no cost.
 *   - The catalogue is the authority on facts. Platforms, dates, images and
 *     classification come from here and are never asked of the model. Criteria 3
 *     and 4 are checked against the `platforms`, `categories` and `tags` on a
 *     candidate, which is why every candidate carries them even though the
 *     interface only shows some.
 *
 * On what a tag check can honestly claim: see `TAGS ARE CLAIMS` below.
 */

import { config } from "./config.js";

const BASE = "https://api.rawg.io/api";

/**
 * TAGS ARE CLAIMS, NOT FACTS.
 *
 * Platforms and release dates are facts the catalogue holds. Tags are not — they
 * are crowd-applied labels, and turn 005 found them loose in both directions:
 *
 *     souls-like        → God of War (2018)
 *     tower-defense     → Dota 2
 *     pixel-graphics    → Limbo, which has no pixel art in it
 *     real-time-strategy → Brutal Legend
 *
 * So a tag gate can verify that *the catalogue says* a game carries a tag. It
 * cannot verify the tag is true. That is a weaker claim than criteria 3 and 4
 * make, and it is stated rather than blurred — see spec.md part 5, pitfall 18.
 *
 * The second half of the same finding: a game with thousands of ratings collects
 * dozens of tags, so ordering by rating floats the same handful of mega-titles
 * to the top of almost any tag query. `dominanceReport` exists to make that
 * visible rather than letting it hide.
 */

/**
 * A candidate as the rest of the project sees it.
 *
 *   id          stable catalogue id. Everything downstream matches on this and
 *               never on a title. This is what makes v1's title-matching
 *               pitfall disappear rather than get solved.
 *   title       display only.
 *   released    ISO date or null.
 *   image       one URL or null.
 *   screenshots array of URLs, possibly empty.
 *   video       null on RAWG's free tier — trailers are a paid feature there.
 *               The field exists so swapping to a catalogue that has them
 *               changes this file and nothing else.
 *   platforms   parent-platform slugs, e.g. ["pc","playstation"]. Criterion 3.
 *   categories  genre slugs. Criterion 4.
 *   tags        only the tags that are in our pinned vocabulary. See
 *               `narrowTags` — the raw list is mostly noise.
 *   ratingCount how many people rated it. See `MIN_RATINGS`.
 *
 * @typedef {object} Candidate
 */

/**
 * Below this many ratings, a game is one the model probably does not know.
 *
 * The only defence available against pitfall 1 — nothing checks whether the
 * written case is true, so the mitigation is to keep the shortlist to games the
 * model has actually seen written about. Blunt, and it biases the product
 * towards popular games. That cost is real and recorded rather than hidden.
 *
 * Evidence it earns its place: the top five roguelikes on PC by rating are The
 * Enchanted Cave 2 (7 ratings), Escape Dungeon 2 (6), Hades, Inscryption, Hades
 * II. Without the threshold, two of five picks would be games nobody can write
 * truthfully about.
 */
export const MIN_RATINGS = 200;

/**
 * How many candidates go to the model.
 *
 * Large enough that the shortlist is a choice rather than the whole pool minus
 * one (pitfall 10), small enough to sit in a prompt without the cost of a
 * hundred entries. A guess, to be revisited once there are logs.
 */
export const CANDIDATE_TARGET = 24;

function keyed(params) {
  const q = new URLSearchParams(params);
  q.set("key", config.rawgKey);
  return q;
}

/**
 * One catalogue request.
 *
 * Errors carry `kind: "catalogue"` so the layer above can satisfy criterion 13 —
 * a catalogue failure has to be distinguishable from a model failure and from an
 * empty result. A user who cannot tell which of two external services broke
 * cannot report anything useful.
 */
async function request(path, params = {}) {
  const url = `${BASE}${path}?${keyed(params)}`;
  let res;
  try {
    res = await fetch(url, { headers: { Accept: "application/json" } });
  } catch (cause) {
    const e = new Error(`Catalogue unreachable: ${cause.message}`);
    e.kind = "catalogue";
    throw e;
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    const e = new Error(
      `Catalogue returned ${res.status} for ${path}. ${body.slice(0, 200)}`
    );
    e.kind = "catalogue";
    e.status = res.status;
    throw e;
  }
  return res.json();
}

/**
 * The vocabularies the interface is allowed to offer.
 *
 * Fetched once and pinned into data/ rather than fetched per request. A dropdown
 * should not depend on an external service being up, and an offline check cannot
 * make a network call (CLAUDE.md).
 *
 * Pinning also makes pitfall 9 visible in the repository: whatever is in those
 * files is the entire vocabulary this product can understand.
 */
export async function fetchGenres() {
  const data = await request("/genres", { page_size: 50 });
  return (data.results || []).map(g => ({
    slug: g.slug,
    name: g.name,
    count: g.games_count ?? null,
  }));
}

/**
 * The platform tree: each family and the machines under it.
 *
 * `/platforms/lists/parents` returns the children inline, so the whole tree is
 * one request. Families are what a person says out loud — "PlayStation" — and
 * the children are what they actually own — a PS5, or a PS2 still under the
 * television.
 *
 * Child order is the catalogue's own, which is roughly newest first — Switch
 * before NES, PS5 before PSP. An earlier version reversed it on the assumption
 * that the catalogue listed oldest first; running it showed otherwise, with the
 * Switch thirteenth of thirteen under Nintendo. The assumption was the bug, and
 * the fix is to stop having one.
 */
export async function fetchParentPlatforms() {
  const data = await request("/platforms/lists/parents", { page_size: 50 });
  return (data.results || []).map(p => ({
    id: p.id,
    slug: p.slug,
    name: p.name,
    platforms: (p.platforms || []).map(c => ({ id: c.id, slug: c.slug, name: c.name })),
  }));
}

/**
 * Trim a catalogue description to something a person will read.
 *
 * RAWG descriptions run to several paragraphs and often carry store copy,
 * bullet lists and occasionally a second language after the English. Cut at a
 * sentence boundary rather than mid-word, and prefer stopping early over
 * running long: this sits beside the model's argument, and if it is longer than
 * the argument it stops being context and becomes the page.
 *
 * Pure, so it is checked offline.
 */
export function trimDescription(raw, limit = 420) {
  if (typeof raw !== "string") return null;
  const text = raw.replace(/\s+/g, " ").trim();
  if (!text) return null;
  if (text.length <= limit) return text;

  const window = text.slice(0, limit);
  const lastStop = Math.max(window.lastIndexOf(". "), window.lastIndexOf("! "), window.lastIndexOf("? "));

  // Cut at the sentence if that leaves something worth reading; otherwise take
  // the window and mark it. The floor is an absolute number of characters, not
  // a fraction of the limit: a description whose first sentence ends at 150
  // should be cut there whether the limit is 420 or 800, and "Hi." should never
  // be the whole synopsis just because the limit happened to be small.
  const MIN_USEFUL = 120;
  if (lastStop >= MIN_USEFUL) return window.slice(0, lastStop + 1);
  return window.trimEnd() + "…";
}

/**
 * The catalogue's own description of one game.
 *
 * The list endpoint carries no description — verified in turn 005 — so this is
 * one request per game, made only for the three that were actually chosen.
 * Never for the whole candidate set: twenty-four requests per shortlist would
 * spend a monthly twenty thousand in under a thousand uses.
 *
 * Returns null on any failure rather than throwing. A shortlist that has passed
 * every gate must not be lost because a description could not be fetched, and
 * the caller reports which ones were missing instead.
 */
export async function fetchDescription(id) {
  try {
    const data = await request(`/games/${encodeURIComponent(id)}`, {});
    return trimDescription(data?.description_raw);
  } catch {
    return null;
  }
}

/**
 * Build the query for a filtered pool. Pure — no network, no key read.
 *
 * Separated from the fetch so the filter logic can be checked offline against
 * fixtures. This is step 1 of the pipeline in its entirety.
 *
 * `platformIds` are parent-platform ids, not platform ids. "PlayStation" rather
 * than "PlayStation 5" is the granularity a person has in mind when they say
 * what they can play on.
 *
 * `tagSlugs` is optional and may be empty — category plus platform is a complete
 * request. Whether the catalogue treats several tags as AND or as OR is not
 * documented anywhere this project could verify, so `assembleCandidates` returns
 * the pool size and scripts/run-candidates.js prints it. Compare one tag against
 * two and the behaviour is visible rather than assumed.
 */
export function buildPoolQuery({
  categorySlug,
  platformIds,
  specific = false,
  tagSlugs = [],
  pageSize = 40,
  page = 1,
}) {
  // A category is optional. "Any kind of game" is a real request — someone who
  // knows they want something cosy on a Switch does not necessarily care whether
  // the catalogue files it under adventure or simulation, and the nineteen
  // genres are coarse enough (pitfall 9) that insisting on one excludes good
  // answers for a distinction the user did not make.
  if (categorySlug != null && typeof categorySlug !== "string") {
    throw new Error("buildPoolQuery: categorySlug must be a string or absent.");
  }
  if (!Array.isArray(platformIds) || platformIds.length === 0) {
    throw new Error("buildPoolQuery: at least one platform id is required.");
  }
  if (platformIds.some(id => !Number.isInteger(id))) {
    throw new Error("buildPoolQuery: platform ids must be integers.");
  }
  if (!Array.isArray(tagSlugs)) {
    throw new Error("buildPoolQuery: tagSlugs must be an array.");
  }
  if (tagSlugs.some(t => typeof t !== "string" || !t)) {
    throw new Error("buildPoolQuery: tag slugs must be non-empty strings.");
  }

  const query = {
    // Omitted entirely when no category was chosen. An empty `genres=` is not
    // the same request as no `genres` at all — the same reasoning as tags.
    ...(categorySlug ? { genres: categorySlug } : {}),
    // Two parameters, never both. `parent_platforms` takes family ids — 2 is
    // every PlayStation ever made — and `platforms` takes machine ids, where 187
    // is a PS5 and nothing else.
    //
    // Sending both would raise a question this project has not measured: whether
    // the catalogue combines them with AND or OR. Tags turned out to be OR,
    // which was the opposite of what a reader expects (decision 0004), so no
    // code here assumes anything about a second untested interaction. One
    // parameter per request, and the caller resolves the mixture beforehand.
    ...(specific
      ? { platforms: platformIds.join(",") }
      : { parent_platforms: platformIds.join(",") }),
    // Ordered by rating rather than relevance or release date. Popularity is the
    // proxy for "the model knows this game" — same reasoning as MIN_RATINGS.
    ordering: "-rating",
    page_size: String(pageSize),
    page: String(page),
    // DLC and episodes are not games someone chooses to play next.
    exclude_additions: "true",
  };

  // Omitted entirely when empty. An empty `tags=` is not the same request as no
  // `tags` at all, and sending one would be a filter the user did not set.
  if (tagSlugs.length) query.tags = tagSlugs.join(",");

  return query;
}

/**
 * How many games the catalogue holds for a filter. One request, one number.
 *
 * Used to explain a thin result rather than to produce one. When a pool comes
 * back nearly empty the person needs to know *which* filter did it, and the
 * only honest way to answer is to ask the same question again without that
 * filter and compare.
 */
export async function countFor({ categorySlug, platformIds, specific, tagSlugs = [] }) {
  const query = buildPoolQuery({
    categorySlug, platformIds, specific, tagSlugs, pageSize: 1,
  });
  const data = await request("/games", query);
  return data.count ?? null;
}

/**
 * Keep only the tags that are in our pinned vocabulary.
 *
 * A raw record carries store plumbing (`steam-cloud`, `steam-trading-cards`,
 * `full-controller-support`) and non-English duplicates of tags it already has
 * (`dlia-odnogo-igroka` beside `singleplayer`, `atmosfera` beside `atmospheric`,
 * `ekshen` beside `action`). None of that means anything to a reader or to a
 * model, and all of it costs prompt weight.
 *
 * Intersecting with the vocabulary is better than capping at an arbitrary count:
 * the result is bounded by the vocabulary, every entry is a word the interface
 * itself offers, and it is exactly the set a tag check can be run against.
 *
 * `vocabulary` is passed in rather than read from disk so this stays pure and
 * offline-checkable. Absent, every tag is kept — used only by the inspection
 * scripts, never by the pipeline.
 */
export function narrowTags(rawTags, vocabulary) {
  const slugs = Array.isArray(rawTags)
    ? rawTags.map(t => (typeof t === "string" ? t : t?.slug)).filter(Boolean)
    : [];
  if (!vocabulary) return slugs;
  const allowed = vocabulary instanceof Set ? vocabulary : new Set(vocabulary);
  return slugs.filter(s => allowed.has(s));
}

/**
 * Normalise one catalogue record.
 *
 * Every field is guarded. Verified against a live response in turn 005 by
 * scripts/inspect-catalogue.js — every field read here was present — but a
 * record may still omit any of them, so nothing is assumed.
 */
export function toCandidate(raw, vocabulary) {
  if (!raw || typeof raw.id !== "number") return null;

  const screenshots = Array.isArray(raw.short_screenshots)
    ? raw.short_screenshots.map(s => s?.image).filter(Boolean)
    : [];

  return {
    id: raw.id,
    // The catalogue's own slug, which is how a game's page is addressed. Kept
    // so a pick can link somewhere: rawg.io/games/<slug> always exists, carries
    // screenshots and where-to-buy links, and linking there is the attribution
    // their free tier requires rather than a second thing to remember.
    slug: raw.slug ?? null,
    title: raw.name ?? null,
    released: raw.released ?? null,
    image: raw.background_image ?? null,
    screenshots,
    // RAWG's free tier does not include trailers. Not an oversight.
    video: null,
    platforms: Array.isArray(raw.parent_platforms)
      ? raw.parent_platforms.map(p => p?.platform?.slug).filter(Boolean)
      : [],
    // The actual machines, as opposed to the families above. Criterion 3 is
    // checked against whichever the user selected — saying a game is "on
    // PlayStation" is no use to someone who asked for PS5 and owns only that.
    machines: Array.isArray(raw.platforms)
      ? raw.platforms.map(p => p?.platform?.slug).filter(Boolean)
      : [],
    categories: Array.isArray(raw.genres)
      ? raw.genres.map(g => g?.slug).filter(Boolean)
      : [],
    tags: narrowTags(raw.tags, vocabulary),
    ratingCount: raw.ratings_count ?? 0,
    metacritic: raw.metacritic ?? null,
    // Hours, per the catalogue. Frequently 0, which means unknown rather than
    // instant — the fan game in turn 005's inspection had playtime 0. Anything
    // reading this must treat 0 as "no information", never as a small number.
    playtime: Number.isFinite(raw.playtime) ? raw.playtime : 0,
  };
}

/**
 * Order a pool by how many of the requested tags each candidate carries.
 *
 * The catalogue combines several tags with **OR**, measured in turn 005:
 * `roguelike` alone returns 5,864 games, `roguelike,difficult` returns 10,512.
 * Adding a tag widens the filter. The second pool contains Dark Souls III,
 * Sekiro, Half-Life and Hitman — none of them roguelikes, all of them difficult.
 *
 * A person ticking two boxes means "difficult roguelike". Strict AND would
 * express that, but it empties fast — cozy plus difficult is close to nothing —
 * and criterion 5 then forbids relaxing the filter, so the honest result is an
 * empty page. Ranking gives the intent without the cliff: full matches first,
 * partial matches behind them, nothing discarded.
 *
 * Each candidate gains `matchedTags`, so the interface and the model can both
 * see which of the request a game actually answers rather than inferring it.
 *
 * Ties keep the catalogue's own order, which is by rating — so within a match
 * level the better-regarded game comes first. Pure, and it copies rather than
 * sorting in place: the candidate set that gets logged must stay the set that
 * was sent.
 */
export function rankByTagMatch(candidates, tagSlugs) {
  const wanted = tagSlugs || [];
  const scored = candidates.map((c, index) => {
    const matchedTags = wanted.filter(t => c.tags.includes(t));
    return { ...c, matchedTags, index };
  });
  scored.sort((a, b) =>
    b.matchedTags.length - a.matchedTags.length || a.index - b.index
  );
  return scored.map(({ index, ...c }) => c);
}

/** Drop anything the shortlist stage would have to reject anyway. Pure. */
export function usable(candidate) {
  if (!candidate) return false;
  if (!candidate.title) return false;
  if (candidate.platforms.length === 0) return false;
  if (candidate.ratingCount < MIN_RATINGS) return false;
  return true;
}

/**
 * Criterion 8, and the reason it is code rather than a prompt line.
 *
 * A rule too obvious to write down is a rule the model does not have — v1
 * recommended games the user had just named, twice, while passing every gate.
 * Matching is by id, so none of v1's title-normalisation problems apply.
 */
export function excludePlayed(candidates, playedIds) {
  const played = new Set((playedIds || []).map(Number));
  return candidates.filter(c => !played.has(c.id));
}

/**
 * How concentrated is this pool in games that carry a great many tags?
 *
 * Turn 005's second finding: GTA V is the top-rated example for atmospheric,
 * funny, open-world, sandbox, singleplayer, co-op, multiplayer, first-person and
 * third-person. A game with thousands of ratings accumulates labels, and
 * `-rating` ordering then floats it to the top of nearly any tag query.
 *
 * If that dominates, tags widen the filter space far less than the arithmetic
 * suggests and two users with different tags still get the same three games.
 * This does not fix it — it measures it, so the decision to fix it is made on
 * evidence rather than on the arithmetic. Pure.
 */
export function dominanceReport(candidates) {
  const counts = candidates.map(c => c.tags.length);
  const total = counts.reduce((a, b) => a + b, 0);
  return {
    poolSize: candidates.length,
    meanTagsPerCandidate: candidates.length ? +(total / candidates.length).toFixed(1) : 0,
    // The candidates carrying the most vocabulary tags are the ones most likely
    // to reappear under unrelated filters.
    mostTagged: [...candidates]
      .sort((a, b) => b.tags.length - a.tags.length)
      .slice(0, 5)
      .map(c => ({ title: c.title, tagCount: c.tags.length, ratingCount: c.ratingCount })),
  };
}

/**
 * Step 2. Assemble the candidate set that will be sent to the model.
 *
 * Returns the set and the query that produced it. Both are logged — criterion 7
 * — because without the query a bad shortlist cannot be attributed to the filter
 * rather than to the model, and pitfall 5 becomes invisible.
 */
export async function assembleCandidates({
  categorySlug,
  platformIds,
  specific = false,
  tagSlugs = [],
  vocabulary,
  playedIds = [],
  target = CANDIDATE_TARGET,
  maxPages = 3,
}) {
  const seen = new Map();
  let pagesFetched = 0;
  let exhausted = false;
  let poolSize = null;

  for (let page = 1; page <= maxPages; page++) {
    const query = buildPoolQuery({ categorySlug, platformIds, specific, tagSlugs, page });
    const data = await request("/games", query);
    pagesFetched++;

    // How many the catalogue holds for this filter, before our own thresholds.
    // Recorded on the first page so that comparing one tag against two shows
    // whether several tags narrow or widen — which the docs do not say.
    if (poolSize === null) poolSize = data.count ?? null;

    for (const raw of data.results || []) {
      const c = toCandidate(raw, vocabulary);
      if (usable(c) && !seen.has(c.id)) seen.set(c.id, c);
    }

    if (!data.next) { exhausted = true; break; }
    if (seen.size >= target * 2) break;
  }

  // Rank before truncating, or the best matches get cut off by an arbitrary
  // slice at 24 while worse ones survive because the catalogue rated them higher.
  const ranked = rankByTagMatch(excludePlayed([...seen.values()], playedIds), tagSlugs);
  const candidates = ranked.slice(0, target);

  const fullMatches = tagSlugs.length
    ? candidates.filter(c => c.matchedTags.length === tagSlugs.length).length
    : null;

  return {
    candidates,
    // What produced this set. Logged with the request; criterion 7.
    query: {
      categorySlug,
      platformIds: [...platformIds],
      // Which parameter was used. A shortlist that looks wrong later cannot be
      // judged without knowing whether it was filtered by family or by machine.
      platformsAreSpecific: specific,
      tagSlugs: [...tagSlugs],
      // How many candidates carry every requested tag. The catalogue's tag
      // filter is OR, so this is the difference between "here are four difficult
      // roguelikes" and "here is one, plus twenty things that are one or the
      // other". Logged because a thin shortlist needs to be attributable.
      fullMatches,
      excludedCount: playedIds.length,
      minRatings: MIN_RATINGS,
      pagesFetched,
      poolExhausted: exhausted,
      // What the catalogue says exists for this filter, before MIN_RATINGS.
      catalogueCount: poolSize,
      // Distinguishes "the catalogue has only four of these" from "we stopped
      // looking". Pitfall 10 needs the difference.
      usableFound: seen.size,
    },
  };
}
