/**
 * One game, in the depth a dialog needs.
 *
 * Rewritten for IGDB — decision 0006 — and it got smaller, because this
 * catalogue answers in one request what RAWG took two to answer. `summary`,
 * every screenshot and the video ids all ride on the same record; RAWG had no
 * description on its list endpoint and no video at any price under $149/month.
 *
 * Still a second read rather than something prefetched: a front page of twelve
 * cards would be twelve requests against a rate limit of four per second, for
 * eleven panels nobody opens.
 *
 * Nothing here involves the model. A dialog is a listing of what the catalogue
 * holds, and if it ever starts making an argument, that argument needs gates.
 */

import { igdbRequest, imageUrl, youTubeUrl } from "./igdb.js";
import { toCandidate, loadVocabulary } from "./igdb-catalogue.js";
import { trimDescription } from "./text.js";

/**
 * A dialog's synopsis can run longer than a shortlist's.
 *
 * 420 is right beside the model's written case, where a long synopsis would
 * drown the argument it sits next to. Here there is no argument to drown — the
 * person opened a panel to read about a game.
 */
const SYNOPSIS_LIMIT = 1200;

/** The catalogue returns as many screenshots as it has; a gallery of twenty is a page. */
const MAX_SHOTS = 8;

/** At most this many trailers. The first is usually the one worth watching. */
const MAX_VIDEOS = 3;

const DETAIL_FIELDS = [
  "id", "name", "slug", "summary", "storyline", "first_release_date",
  "aggregated_rating", "aggregated_rating_count", "rating", "rating_count",
  "cover.image_id", "screenshots.image_id", "artworks.image_id",
  "videos.video_id", "videos.name",
  "genres.slug", "themes.slug", "game_modes.slug", "player_perspectives.slug",
  "platforms.slug", "platforms.abbreviation",
  "involved_companies.company.name", "involved_companies.developer",
  "involved_companies.publisher",
  "age_ratings.rating_category", "websites.url", "websites.category",
].join(",");

/**
 * Shape a detail record into what the dialog renders.
 *
 * Pure — no network, no token — so it is checked offline against fixtures, which
 * is the only way any of this gets tested without spending requests.
 *
 * All text here is third-party and attacker-controlled; nobody in this project
 * wrote a word of it. It is rendered as text by React and never as markup, and
 * it never enters a prompt from this path.
 */
export function shapeDetail(raw, v = loadVocabulary()) {
  const base = toCandidate(raw, v);
  if (!base) return null;

  // Screenshots first, then artwork. Both are real pictures of the game and the
  // catalogue keeps them apart; a panel with three screenshots and no art looks
  // thinner than one that uses what is there.
  const gallery = [];
  const sources = [
    ...(Array.isArray(raw.screenshots) ? raw.screenshots : []),
    ...(Array.isArray(raw.artworks) ? raw.artworks : []),
  ];
  // Deduplicated on the catalogue's image id, NOT on the URL those ids build.
  // The header is rendered at one size token and a gallery thumbnail at another,
  // so the same picture produces two different URLs and comparing URLs would let
  // the cover appear again as the first thumbnail. Found by a check that
  // expected the old behaviour and got the new one.
  const seen = new Set();
  if (typeof raw?.cover?.image_id === "string") seen.add(raw.cover.image_id);
  for (const s of sources) {
    const id = typeof s?.image_id === "string" ? s.image_id : null;
    if (id && seen.has(id)) continue;
    const url = imageUrl(s, "screenshot");
    if (!url || url === base.image) continue;
    if (id) seen.add(id);
    else if (gallery.includes(url)) continue;
    gallery.push(url);
    if (gallery.length >= MAX_SHOTS) break;
  }

  const videos = [];
  for (const vid of Array.isArray(raw.videos) ? raw.videos : []) {
    const url = youTubeUrl(vid);
    if (!url || videos.some(x => x.url === url)) continue;
    // The name is the catalogue's own text and goes into the page as text only.
    videos.push({ url, name: typeof vid?.name === "string" ? vid.name : null });
    if (videos.length >= MAX_VIDEOS) break;
  }

  const companies = Array.isArray(raw.involved_companies) ? raw.involved_companies : [];
  const named = pick => companies.filter(pick).map(c => c?.company?.name).filter(Boolean);

  return {
    id: base.id,
    slug: base.slug,
    title: base.title,
    released: base.released,
    image: base.image,
    gallery,
    videos,
    platforms: base.platforms,
    machines: base.machines,
    categories: base.categories,
    tags: base.tags,
    criticScore: base.criticScore,
    criticReviews: base.criticReviews,
    ratingCount: base.ratingCount,
    // `summary` is what the game is; `storyline` is its plot, which is often
    // absent and occasionally a spoiler. Summary first, storyline only as a
    // fallback when there is no summary at all.
    synopsis: trimDescription(raw?.summary ?? raw?.storyline, SYNOPSIS_LIMIT),
    developers: named(c => c?.developer).slice(0, 3),
    publishers: named(c => c?.publisher).slice(0, 2),
    website: firstOfficialSite(raw?.websites),
  };
}

/**
 * The game's own site, if it has one.
 *
 * IGDB's website category 1 is "official". Anything else is a store page, a
 * subreddit or a social account, none of which is what "Official site" on a
 * button means.
 */
export function firstOfficialSite(websites) {
  if (!Array.isArray(websites)) return null;
  for (const w of websites) {
    if (w?.category !== 1) continue;
    const url = safeHttpUrl(w.url);
    if (url) return url;
  }
  return null;
}

/** An href is only rendered for a URL this project can name the scheme of. */
export function safeHttpUrl(value) {
  if (typeof value !== "string" || !value) return null;
  try {
    const u = new URL(value);
    // A catalogue field going into an href is the one place third-party text
    // stops being inert: `javascript:` in an href runs.
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}

/**
 * Detail records, kept for as long as the function instance lives.
 *
 * Bounded, because an unbounded map keyed on user input is a memory leak with a
 * remote trigger. Oldest out first.
 */
const CACHE_MAX = 120;
const cache = new Map();

function remember(id, value) {
  cache.set(id, value);
  if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
  return value;
}

/**
 * Fetch and shape one game. One request, where the RAWG version needed two.
 *
 * Throws with `kind: "catalogue"` on a failure that is the catalogue's, so the
 * interface can say which service broke — a user who cannot tell cannot report
 * anything useful.
 */
export async function fetchGameDetail(id, v = loadVocabulary()) {
  if (!Number.isInteger(id) || id <= 0) {
    const e = new Error("Not a catalogue id.");
    e.kind = "request";
    throw e;
  }
  if (cache.has(id)) return { ...cache.get(id), cached: true };

  // `where id = N` with an integer that has already been checked. Nothing
  // user-supplied is interpolated into an Apicalypse body anywhere in this
  // project, and an id is the only input this endpoint has.
  const rows = await igdbRequest("games", `fields ${DETAIL_FIELDS}; where id = ${id}; limit 1;`);

  const raw = Array.isArray(rows) ? rows[0] : null;
  if (!raw) {
    const e = new Error("The catalogue has no game with that id.");
    e.kind = "catalogue";
    throw e;
  }

  const shaped = shapeDetail(raw, v);
  if (!shaped) {
    const e = new Error("The catalogue returned a record this app could not read.");
    e.kind = "catalogue";
    throw e;
  }
  return { ...remember(id, shaped), cached: false };
}
