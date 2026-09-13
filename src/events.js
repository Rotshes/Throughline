/**
 * Showcases, and the games shown in them.
 *
 * The user asked for a news row. IGDB has no news: `pulses`, `articles`, `news`
 * and `feeds` all 404, measured rather than inferred — decision 0008. What it
 * does have is `events`, and for this app that is the better row anyway. A wire
 * of headlines is about the industry; a showcase is a list of games somebody
 * just announced, joined to this catalogue **by id**.
 *
 * No fourth service, no XML, no dependency, and a key this project already has.
 *
 * WHAT THE DATA WILL NOT SUPPORT, AND THEREFORE WHAT THIS IS NOT CALLED
 *
 *   940 events exist. 33 started in the last ninety days and 17 in the last
 *   thirty, so the data is current. **Zero are in the future** — not few, zero.
 *   IGDB records a showcase after it has happened.
 *
 *   So this row is "what was just shown". It is not "what is coming up", and no
 *   heading, source line or interface copy may imply that it is. A row promising
 *   a schedule and delivering an archive is the failure this project keeps
 *   writing down, and here the data says plainly which one it can be.
 *
 * WHAT IS DELIBERATELY UNUSED
 *
 *   `event_networks` carries more links per event — a Twitch URL, a YouTube URL,
 *   an official site — keyed by a `network_type` id into a vocabulary this
 *   project has not read. Rendering a Twitter link and a stream link identically
 *   because the number was not resolved is a small lie with no upside, so only
 *   `live_stream_url` is used: it is on the event itself and it means one thing.
 */

import { igdbRequest, imageUrl } from "./igdb.js";
import { toCandidate, loadVocabulary, usable } from "./igdb-catalogue.js";

/** How far back the row looks. Ninety days held 33 events when measured. */
const WINDOW_DAYS = 120;

/** How many cards. Twelve fills a rail without a second row. */
const ROW_SIZE = 12;

/**
 * How many games to show inside one event.
 *
 * A single Nintendo Direct carried 86 and one indie showcase carried 219.
 * Fetching all of them to draw a panel would be a request for two hundred
 * records to show a dozen, so the panel takes the best of them and says how many
 * there were.
 */
const GAMES_IN_PANEL = 24;

const unix = d => Math.floor(d.getTime() / 1000);
const daysAgo = n => unix(new Date(Date.now() - n * 86400000));

/**
 * Shape one event record into a card. Pure, so it is checked offline.
 *
 * Every field is guarded. `games` arrives as an array of ids and is kept as a
 * count rather than a list — the panel fetches the records when somebody opens
 * one, and a row of twelve cards has no use for two hundred ids.
 */
export function shapeEvent(raw) {
  if (!raw || typeof raw.id !== "number" || !raw.name) return null;

  const games = Array.isArray(raw.games) ? raw.games.filter(Number.isInteger) : [];

  return {
    id: raw.id,
    name: raw.name,
    slug: raw.slug ?? null,
    // Seconds to a date string, matching every other date in this project.
    startedAt: Number.isFinite(raw.start_time)
      ? new Date(raw.start_time * 1000).toISOString().slice(0, 10)
      : null,
    // The logo is the card. Built through the same helper as covers, because the
    // URL shape is identical — verified rather than assumed, since that helper
    // was written for covers and had never been handed a logo.
    logo: imageUrl(raw.event_logo, "card"),
    // Only ever an http(s) address, checked before it can reach an href.
    stream: safeHttpUrl(raw.live_stream_url),
    gameCount: games.length,
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
 * Worth showing as a card.
 *
 * A showcase with no logo is a line of text in a row of pictures, and one with
 * no games attached is a link to somebody else's video — which this app has no
 * reason to be. Both were measured before this rule was written: of the twelve
 * most recent, twelve had a logo and eleven had at least one game.
 */
export function showable(event) {
  return Boolean(event && event.logo && event.gameCount > 0);
}

const EVENT_FIELDS =
  "id, name, slug, start_time, live_stream_url, event_logo.image_id, games";

/**
 * The row. One catalogue request.
 *
 * Returns `{ events }`, and an empty list is the caller's problem to report —
 * an empty row is a failure, not a state (pitfall 23).
 */
export async function buildEventsRow() {
  const rows = await igdbRequest("events",
    `fields ${EVENT_FIELDS};
     where start_time > ${daysAgo(WINDOW_DAYS)} & start_time <= ${unix(new Date())}
           & event_logo != null & games != null;
     sort start_time desc; limit ${ROW_SIZE * 2};`);

  const events = (Array.isArray(rows) ? rows : [])
    .map(shapeEvent)
    .filter(showable)
    .slice(0, ROW_SIZE);

  return { events, windowDays: WINDOW_DAYS };
}

/**
 * One showcase, and the games announced in it.
 *
 * Two requests: the event for its game ids, then those games as candidates. The
 * same `toCandidate` every other part of this app uses, so the cards inside the
 * panel are the cards on the rest of the site and carry the same Add button.
 *
 * `usable()` applies here and its reason does hold: these are shown beside games
 * from everywhere else, and a showcase of two hundred titles is mostly things
 * with no cover and no audience. Unlike the front page rows, cutting them loses
 * nothing — the panel says how many there were.
 */
export async function fetchEvent(id) {
  if (!Number.isInteger(id) || id <= 0) {
    const e = new Error("Not an event id.");
    e.kind = "request";
    throw e;
  }

  const rows = await igdbRequest("events",
    `fields ${EVENT_FIELDS}; where id = ${id}; limit 1;`);
  const raw = Array.isArray(rows) ? rows[0] : null;
  if (!raw) {
    const e = new Error("The catalogue has no event with that id.");
    e.kind = "catalogue";
    throw e;
  }

  const event = shapeEvent(raw);
  const ids = (Array.isArray(raw.games) ? raw.games : []).filter(Number.isInteger);
  if (ids.length === 0) return { event, games: [], totalGames: 0 };

  const v = loadVocabulary();
  const picks = await igdbRequest("games",
    `fields id, name, slug, summary, first_release_date, aggregated_rating,
            aggregated_rating_count, rating_count, cover.image_id,
            screenshots.image_id, platforms.slug, genres.slug, themes.slug,
            game_modes.slug, player_perspectives.slug;
     where id = (${ids.join(",")}) & parent_game = null & cover != null
           & themes != (${v.excludedThemeIds.join(",") || 0});
     sort rating_count desc; limit ${GAMES_IN_PANEL};`);

  const games = (Array.isArray(picks) ? picks : [])
    .map(g => toCandidate(g, v))
    .filter(g => g && usable(g));

  return { event, games, totalGames: ids.length };
}
