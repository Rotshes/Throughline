/**
 * The front page.
 *
 * Three rows, each with a source it can stand behind.
 *
 * Two rows that a site like this usually carries are absent, deliberately:
 *
 *   "Popular right now" needs live player counts. That is Steam's API, not the
 *   catalogue's. The nearest thing available is "most added to collections on
 *   RAWG", which is a different claim wearing the same label, and labelling it
 *   the first would be the exact failure this project keeps writing down.
 *
 *   "Best deals" is a paid catalogue feature. Purchase links and prices are
 *   Business tier — the same discovery as trailers in turn 005.
 *
 * Each row says where it comes from, because "out in the last 90 days, ordered
 * by how many people added it" and "popular" are not the same sentence.
 *
 * Cost: two catalogue requests per uncached build, against a monthly twenty
 * thousand. The third row costs nothing — it reads this project's own records.
 */

import { toCandidate } from "./catalogue.js";
import { config } from "./config.js";
import { readData } from "./paths.js";
import { storeConfigured, baseUrl, restHeaders } from "./store.js";

const BASE = "https://api.rawg.io/api";

/**
 * How long a built front page is reused.
 *
 * Module scope, so it survives only as long as a warm function instance — a
 * cold start rebuilds. That is a weak cache and it is the honest description of
 * it: it takes the edge off repeated visits and does not bound the monthly
 * total. A durable cache would be a table, and is not worth one for three rows.
 */
const TTL_MS = 30 * 60 * 1000;
let cached = null;

function vocabulary() {
  const file = JSON.parse(readData("data/tags.json"));
  return new Set(file.facets.flatMap(f => f.tags.map(t => t.slug)));
}

function ymd(d) {
  return d.toISOString().slice(0, 10);
}

async function fetchGames(params) {
  const q = new URLSearchParams({ ...params, key: config.rawgKey });
  const res = await fetch(`${BASE}/games?${q}`, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    const e = new Error(`Catalogue returned ${res.status}`);
    e.kind = "catalogue";
    throw e;
  }
  return (await res.json()).results ?? [];
}

/**
 * Trim a candidate to what a front-page card shows.
 *
 * Deliberately NOT `usable()`. That helper enforces `MIN_RATINGS`, which exists
 * for exactly one reason: keeping the shortlist to games the *model* can write
 * about truthfully — the only defence this project has against pitfall 1.
 *
 * Nothing on the front page goes near a model. It is a listing, and a game
 * released last month has had no time to collect two hundred ratings. Applying
 * the threshold here left one game in a row of forty and emptied the next row
 * entirely.
 *
 * A threshold carried into a context where its reason does not hold is not a
 * safeguard, it is a bug with a good name.
 *
 * The bar here is only that a card can be drawn: a title and a picture. For the
 * recent row, `ordering=-added` already ranks by how much attention a game has
 * had, which is the sort that actually belongs to this question.
 */
function toCard(raw, vocab) {
  const c = toCandidate(raw, vocab);
  if (!c || !c.title || !c.image) return null;
  return {
    id: c.id,
    title: c.title,
    slug: c.slug,
    released: c.released,
    image: c.image,
    platforms: c.platforms,
    metacritic: c.metacritic,
    ratingCount: c.ratingCount,
  };
}

/**
 * Games this app has put in front of someone recently.
 *
 * The only row that is genuinely ours rather than the catalogue's, and it costs
 * no catalogue request at all — `requests.picks` has been recorded since turn
 * 007. Newest first, deduplicated, and it carries the angle each was given,
 * which is the part no other site could show.
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

  const vocab = vocabulary();
  const today = new Date();
  const ninetyDaysAgo = new Date(today.getTime() - 90 * 24 * 60 * 60 * 1000);
  const yearStart = new Date(Date.UTC(today.getUTCFullYear(), 0, 1));

  const rows = [];
  const failures = [];

  // --- out recently ----------------------------------------------------------
  try {
    const raw = await fetchGames({
      dates: `${ymd(ninetyDaysAgo)},${ymd(today)}`,
      // How many people have added it to a collection. NOT how many are playing
      // it — the catalogue does not know that, and the label says what this is.
      ordering: "-added",
      page_size: "40",
      exclude_additions: "true",
    });
    const games = raw.map(g => toCard(g, vocab)).filter(Boolean).slice(0, 12);
    if (games.length === 0) {
      // Same rule as the row below: everything discarded is a thing to report.
      failures.push({
        row: "recent",
        reason: `the catalogue returned ${raw.length} recent releases and none had both a title and a picture`,
      });
    } else {
      rows.push({
        id: "recent",
        title: "Out in the last three months",
        source: "Ordered by how many people have added it to a collection on RAWG. Not a player count — the catalogue does not have one.",
        // Every game in this row came out inside one ninety-day window, so the
        // year says nothing and the date says everything. The row declares it
        // rather than leaving the interface to infer it from the data.
        fullDate: true,
        games,
      });
    }
  } catch (e) {
    failures.push({ row: "recent", reason: e.message });
  }

  // --- best reviewed this year -----------------------------------------------
  try {
    const raw = await fetchGames({
      dates: `${ymd(yearStart)},${ymd(today)}`,
      ordering: "-metacritic",
      page_size: "40",
      exclude_additions: "true",
    });
    const games = raw.map(g => toCard(g, vocab)).filter(Boolean)
      .filter(g => g.metacritic != null).slice(0, 12);

    // An empty row is a failure, not a state.
    //
    // This row was empty for a week and looked like a design decision, because
    // `games: []` renders as "Nothing here yet." — the same words a row would
    // show if it were working and the catalogue genuinely held nothing. Forty
    // records came back and every one was discarded here, and nothing said so.
    //
    // The rule underneath: when code throws away everything it was given, that
    // is the most interesting thing that happened in the request, and it is the
    // one thing the old version did not report.
    if (games.length === 0) {
      failures.push({
        row: "acclaimed",
        reason:
          `asked the catalogue for games released since January ordered by ` +
          `Metacritic score; it returned ${raw.length} and none of them carried a score`,
      });
    } else {
      rows.push({
        id: "acclaimed",
        title: `Best reviewed this year`,
        // Metacritic is itself the quality bar here — a game that has one has been
        // reviewed by the press. No ratings floor on top of it.
        source: "Metacritic score, for games released since January. Only games the press has actually reviewed have one.",
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

  const value = { rows, failures, builtAt: new Date().toISOString() };
  cached = { at: Date.now(), value };
  return { ...value, cachedFor: 0 };
}
