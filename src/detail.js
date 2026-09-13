/**
 * One game, in the depth a dialog needs.
 *
 * Everything on the front page and in a shortlist comes from the catalogue's
 * *list* endpoint, which carries a title, one image, platforms and a score. That
 * is enough for a card and not enough for a panel somebody opened on purpose.
 *
 * So this is a second read, made only when a person clicks — never speculatively,
 * never for a whole row. Two catalogue requests per open, against a monthly
 * twenty thousand. Twelve cards on the front page would be twenty-four requests
 * if they were prefetched, which is why they are not.
 *
 * Nothing here involves the model. A dialog is a listing of what the catalogue
 * holds, and if it ever starts making an argument, that argument needs gates.
 */

import { trimDescription, toCandidate } from "./catalogue.js";
import { config } from "./config.js";

const BASE = "https://api.rawg.io/api";

/**
 * A dialog's synopsis can run longer than a shortlist's.
 *
 * 420 is right beside the model's written case, where a long synopsis would
 * drown the argument it sits next to. Here there is no argument to drown — the
 * person opened a panel to read about a game. The trimming rule is the same one,
 * with room to finish a thought.
 */
const SYNOPSIS_LIMIT = 1200;

/**
 * How many screenshots the dialog carries.
 *
 * The catalogue returns as many as it has, sometimes over twenty. A gallery of
 * twenty is a page of its own, and every one is a full-size image over somebody
 * else's bandwidth.
 */
const MAX_SHOTS = 8;

/**
 * Shape a detail record plus its screenshots into what the dialog renders.
 *
 * Pure — no network, no key — so it is checked offline against fixtures, which
 * is the only way any of this gets tested without spending requests.
 *
 * Every field is guarded. The probe in scripts/probe-front.js printed the real
 * response before this was written (turn 005's rule: a documented shape is not a
 * verified one), but a record may still omit any field, and a missing developer
 * must not take the panel down.
 *
 * All text here is third-party and attacker-controlled — nobody in this project
 * wrote a word of it. It is rendered as text by React and never as markup, and
 * it never enters a prompt from this path.
 */
export function shapeDetail(raw, screenshotRows = [], vocabulary) {
  const base = toCandidate(raw, vocabulary);
  if (!base) return null;

  // The list record's `short_screenshots` and the screenshots endpoint overlap.
  // Merge and deduplicate rather than picking one: a record fetched by id has no
  // `short_screenshots` at all, and a game with a dead screenshots endpoint
  // still has its header image.
  const fromEndpoint = Array.isArray(screenshotRows)
    ? screenshotRows
        // `is_deleted` is on every screenshot row. A field named that exists
        // because it is sometimes true, and a withdrawn image is one the
        // catalogue has decided should not be shown — a dead thumbnail at best
        // and something nobody chose at worst. Found by printing the response
        // rather than by reading a field list.
        .filter(s => s?.is_deleted !== true)
        .map(s => s?.image)
        .filter(s => typeof s === "string" && s)
    : [];
  const gallery = [];
  for (const url of [...fromEndpoint, ...base.screenshots]) {
    // The header image is already shown above the gallery. Repeating it as the
    // first thumbnail makes the panel look like it has one fewer picture than it
    // does.
    if (url === base.image) continue;
    if (!gallery.includes(url)) gallery.push(url);
    if (gallery.length >= MAX_SHOTS) break;
  }

  const names = list => (Array.isArray(list) ? list.map(x => x?.name).filter(Boolean) : []);

  return {
    id: base.id,
    slug: base.slug,
    title: base.title,
    released: base.released,
    image: base.image,
    gallery,
    platforms: base.platforms,
    machines: base.machines,
    categories: base.categories,
    tags: base.tags,
    metacritic: base.metacritic,
    ratingCount: base.ratingCount,
    // 0 means the catalogue has no figure, not a game you finish instantly. Every
    // reader of this field has to know that, so it is carried as null instead and
    // the ambiguity dies here.
    playtime: base.playtime > 0 ? base.playtime : null,
    synopsis: trimDescription(raw?.description_raw, SYNOPSIS_LIMIT),
    developers: names(raw?.developers).slice(0, 3),
    publishers: names(raw?.publishers).slice(0, 2),
    esrb: raw?.esrb_rating?.name ?? null,
    // Only ever an http(s) address. A catalogue field going into an href is the
    // one place third-party text stops being inert: `javascript:` in an href
    // runs. Checked here rather than trusted.
    website: safeHttpUrl(raw?.website),
  };
}

/** An href is only rendered for a URL this project can name the scheme of. */
export function safeHttpUrl(value) {
  if (typeof value !== "string" || !value) return null;
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}

/**
 * Detail records, kept for as long as the function instance lives.
 *
 * Module scope, so a cold start empties it — the same weak cache as the front
 * page's, and described the same way rather than dressed up. It exists because
 * opening the same panel twice should not cost four requests, not because it
 * bounds anything.
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

async function get(path) {
  const res = await fetch(`${BASE}${path}?key=${encodeURIComponent(config.rawgKey)}`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    const e = new Error(`Catalogue returned ${res.status} for ${path}`);
    e.kind = "catalogue";
    e.status = res.status;
    throw e;
  }
  return res.json();
}

/**
 * Fetch and shape one game. Throws with `kind: "catalogue"` on a failure that is
 * the catalogue's, so the interface can say which service broke — a user who
 * cannot tell cannot report anything useful.
 */
export async function fetchGameDetail(id, vocabulary) {
  if (!Number.isInteger(id) || id <= 0) {
    const e = new Error("Not a catalogue id.");
    e.kind = "request";
    throw e;
  }
  if (cache.has(id)) return { ...cache.get(id), cached: true };

  const raw = await get(`/games/${id}`);

  // The screenshots are the softer of the two requests: a panel with no gallery
  // is worth showing, a panel with no game is not. So this one failure is
  // swallowed and the record still opens.
  let shots = [];
  try {
    shots = (await get(`/games/${id}/screenshots`))?.results ?? [];
  } catch {
    shots = [];
  }

  const shaped = shapeDetail(raw, shots, vocabulary);
  if (!shaped) {
    const e = new Error("The catalogue returned a record this app could not read.");
    e.kind = "catalogue";
    throw e;
  }
  return { ...remember(id, shaped), cached: false };
}
