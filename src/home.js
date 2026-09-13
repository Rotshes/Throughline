/**
 * The front page.
 *
 * Three rows, each with a source it can stand behind.
 *
 * Rewritten for IGDB — decision 0006. The row this page existed to carry, "best
 * reviewed", was empty for a week on RAWG because RAWG holds no press score for
 * any 2026 release. It has 294 here, and the filters that make it correct were
 * found by printing output rather than by reading a field list:
 *
 *   parent_game = null          without it the row's top entry was a Switch 2
 *                               re-release of a 2020 game
 *   aggregated_rating_count     without it every entry scored exactly 100, each
 *                               from a single reviewer
 *
 * One row a site like this usually carries is still absent. "Popular right now"
 * needs live player counts, which is Steam's API and not a catalogue's. Calling
 * something else by that name would be the exact failure this project keeps
 * writing down.
 *
 * Cost: two catalogue requests per uncached build. The third row costs nothing —
 * it reads this project's own records.
 */

import { igdbRequest } from "./igdb.js";
import { toCandidate, loadVocabulary, MIN_CRITIC_REVIEWS } from "./igdb-catalogue.js";
import { storeConfigured, baseUrl, restHeaders } from "./store.js";

/**
 * How long a built front page is reused.
 *
 * Module scope, so it survives only as long as a warm function instance — a cold
 * start rebuilds. That is a weak cache and it is the honest description of it: it
 * takes the edge off repeated visits and does not bound the monthly total.
 */
const TTL_MS = 30 * 60 * 1000;
let cached = null;

/**
 * How many critics before a score is a review rather than an opinion.
 *
 * Five, and the number is not arbitrary: Elden Ring's score comes from ten
 * reviews and Breath of the Wild's from twenty-seven, so five is not a small
 * panel in this catalogue. At a floor of ten, 2026 had nothing at all.
 */
const ACCLAIM_MIN_REVIEWS = 5;

/**
 * How far back "recently" reaches for the review row.
 *
 * Not the calendar year. At a five-review floor, 2026 offers ten games for a row
 * of twelve — and in January it would offer none, because critics have not
 * reviewed anything yet. A row that is correct in September and empty in
 * February is a bug with a seasonal trigger.
 */
const ACCLAIM_MONTHS = 18;

const unix = d => Math.floor(d.getTime() / 1000);
const monthsAgo = n => {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  return d;
};

/** Trim a candidate to what a front-page card shows. */
function toCard(raw, v) {
  const c = toCandidate(raw, v);
  // Deliberately NOT `usable()`. That helper enforces a popularity floor whose
  // reason is keeping the shortlist to games the *model* can write about
  // truthfully. Nothing on this page goes near a model, and a game released last
  // month has had no time to collect ratings. A threshold carried into a context
  // where its reason does not hold is not a safeguard, it is a bug with a good
  // name — which is what emptied this page's rows once already.
  if (!c || !c.title || !c.image) return null;
  return {
    id: c.id,
    title: c.title,
    slug: c.slug,
    released: c.released,
    image: c.image,
    cover: c.cover,
    platforms: c.platforms,
    machines: c.machines,
    criticScore: c.criticScore,
    criticReviews: c.criticReviews,
    ratingCount: c.ratingCount,
  };
}

/**
 * Games this app has put in front of someone recently.
 *
 * The only row that is genuinely ours rather than the catalogue's, and it costs
 * no catalogue request at all. Newest first, deduplicated, carrying the angle
 * each was given — the part no other site could show.
 */
async function recentlySuggested(limit = 12) {
  if (!storeConfigured()) return [];
  try {
    const url =
      `${baseUrl()}/rest/v1/requests` +
      `?select=picks,created_at&outcome=eq.shortlisted&order=created_at.desc&limit=25`;
    const res = await fetch(url, { headers: restHeaders() });
    if (!res.ok) return [];
    const rows = await res.json();

    const seen = new Set();
    const out = [];
    for (const row of rows) {
      for (const p of Array.isArray(row.picks) ? row.picks : []) {
        if (!Number.isInteger(p?.id) || seen.has(p.id)) continue;
        seen.add(p.id);
        out.push({ id: p.id, title: p.title, angleLabel: p.angleLabel ?? null });
        if (out.length >= limit) return out;
      }
    }
    return out;
  } catch {
    return [];
  }
}

/**
 * Build the page. Returns rows plus whichever of them failed, rather than
 * throwing — one dead row should not take the whole page with it.
 */
export async function buildHome({ force = false } = {}) {
  if (!force && cached && Date.now() - cached.at < TTL_MS) {
    return { ...cached.value, cachedFor: Math.round((Date.now() - cached.at) / 1000) };
  }

  const v = loadVocabulary();
  const now = unix(new Date());
  const rows = [];
  const failures = [];

  const FIELDS =
    "id, name, slug, first_release_date, aggregated_rating, aggregated_rating_count, " +
    // Screenshots as well as the cover. A card's frame is 16:9 and a cover is
    // portrait box art; asking only for the cover would leave every card cropped
    // through the middle of its subject.
    "rating_count, cover.image_id, screenshots.image_id, platforms.slug, genres.slug, " +
    "themes.slug, game_modes.slug, player_perspectives.slug";

  // --- out recently ----------------------------------------------------------
  try {
    const raw = await igdbRequest("games",
      `fields ${FIELDS};
       where first_release_date > ${unix(monthsAgo(3))}
             & first_release_date <= ${now}
             & parent_game = null & cover != null
             & themes != (${v.excludedThemeIds.join(",") || 0});
       sort rating_count desc; limit 40;`);

    const games = raw.map(g => toCard(g, v)).filter(Boolean).slice(0, 12);
    if (games.length === 0) {
      // An empty row is a failure, not a state. `games: []` renders the same
      // words a working row would show if the catalogue genuinely held nothing,
      // which is how this page hid a bug for a week.
      failures.push({
        row: "recent",
        reason: `asked the catalogue for games released in the last three months; ` +
                `it returned ${raw.length} and none had both a title and a picture`,
      });
    } else {
      rows.push({
        id: "recent",
        title: "Out in the last three months",
        source: "Ordered by how many people have rated it on IGDB. Not a player count — the catalogue does not have one.",
        // Every game here came out inside one ninety-day window, so the year
        // says nothing and the date says everything.
        fullDate: true,
        games,
      });
    }
  } catch (e) {
    failures.push({ row: "recent", reason: e.message });
  }

  // --- best reviewed ---------------------------------------------------------
  try {
    const raw = await igdbRequest("games",
      `fields ${FIELDS};
       where first_release_date > ${unix(monthsAgo(ACCLAIM_MONTHS))}
             & first_release_date <= ${now}
             & parent_game = null & cover != null
             & aggregated_rating != null
             & aggregated_rating_count >= ${ACCLAIM_MIN_REVIEWS}
             & themes != (${v.excludedThemeIds.join(",") || 0});
       sort aggregated_rating desc; limit 40;`);

    const games = raw.map(g => toCard(g, v)).filter(Boolean)
      .filter(g => g.criticScore != null).slice(0, 12);

    if (games.length === 0) {
      failures.push({
        row: "acclaimed",
        reason: `asked for games reviewed by at least ${ACCLAIM_MIN_REVIEWS} critics ` +
                `in the last ${ACCLAIM_MONTHS} months; the catalogue returned ${raw.length}`,
      });
    } else {
      rows.push({
        id: "acclaimed",
        title: "Best reviewed in the last year and a half",
        // The heading says a year and a half rather than "this year" because
        // that is the window. A calendar year is empty every January, when the
        // critics have not reviewed anything yet.
        source: `Critic score on IGDB, from at least ${ACCLAIM_MIN_REVIEWS} reviews. A high score from one reviewer is not acclaim, so those are not here.`,
        showScore: true,
        games,
      });
    }
  } catch (e) {
    failures.push({ row: "acclaimed", reason: e.message });
  }

  // --- what this app has been suggesting -------------------------------------
  const suggested = await recentlySuggested();
  if (suggested.length) {
    rows.push({
      id: "suggested",
      title: "Recently suggested here",
      source: "Games this app has actually put in front of somebody, newest first, with the angle each was given.",
      games: suggested,
      plain: true,
    });
  }

  const value = { rows, failures, source: "igdb", builtAt: new Date().toISOString() };
  cached = { at: Date.now(), value };
  return { ...value, cachedFor: 0 };
}

export { MIN_CRITIC_REVIEWS };
