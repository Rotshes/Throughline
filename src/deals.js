/**
 * Prices, from IsThereAnyDeal.
 *
 * A third service, and the last one this project adds — decision 0007.
 *
 * WHY THIS JOIN IS ALLOWED WHEN THE OPENCRITIC ONE WAS NOT
 *
 *   Attaching a critic score to a game would have meant matching by title, which
 *   is what v1 of this project died of. This is different: IGDB records carry
 *   Steam app ids in `external_games`, and ITAD can be addressed by Steam app
 *   id. Nothing is matched on a name at any point.
 *
 *   Measured before this file existed, not after: 46% of well-reviewed games
 *   carry a Steam id, and every one of those that was tried resolved on ITAD —
 *   11 of 11.
 *
 * WHY THE ROW IS BUILT FROM GAMES RATHER THAN FROM DEALS
 *
 *   The obvious design is to ask ITAD for the biggest discounts and show them.
 *   It is cheap — two requests for a whole row — and the probe killed it twice
 *   over.
 *
 *   First, a deal carries no Steam app id and its url is an affiliate redirect
 *   rather than a store address, so there is no id to join on and nothing to
 *   parse. Second, and worse: sorted by discount, the top of the list was two
 *   Epic giveaways, a demo, and six Fanatical certification bundles — AWS,
 *   Kali Linux, cybersecurity courses. The biggest discount on the internet is
 *   rarely on a game.
 *
 *   So the row starts from games this app would recommend anyway and asks what
 *   they cost. That makes it a different claim — "well reviewed and currently
 *   cheaper" rather than "the best deals anywhere" — and the heading says so.
 *
 * WHAT IS OWED TO THEM
 *
 *   ITAD's terms require attribution and forbid stripping the affiliate tags
 *   from their URLs or altering the data. So `buyUrl` is their link, passed
 *   through untouched, and the footer credits them. That is a licence condition
 *   and not a courtesy — the same standing as RAWG's backlink was.
 */

import { config } from "./config.js";
import { igdbRequest } from "./igdb.js";
import { toCandidate, loadVocabulary } from "./igdb-catalogue.js";

const BASE = "https://api.isthereanydeal.com";

/**
 * Whose prices these are.
 *
 * There is no neutral country. Every figure this row shows is a US figure, and
 * somebody in Europe looking at their own store will see a different number —
 * so the row says which country it means rather than leaving them to work it
 * out from the mismatch.
 */
export const COUNTRY = "US";

/** IGDB's id for Steam in `external_game_source`. */
const STEAM_SOURCE = 1;

/**
 * How good a game has to be to appear.
 *
 * This row is not a price comparison site — it is a recommender that happens to
 * mention prices. A discount on something nobody should play is not a reason to
 * play it, and the whole reason the deals-first design was rejected is that it
 * surfaced things that were not games at all.
 */
const MIN_SCORE = 82;
const MIN_REVIEWS = 5;

/**
 * How many games to price to fill a row.
 *
 * 73% of a sampled pool was discounted when this was measured, and 46% of
 * well-reviewed games carry a Steam id at all. Sampling 30 to fill 12 leaves
 * room for both to be worse on another day without the row collapsing.
 */
const SAMPLE = 40;
const ROW_SIZE = 18;

/**
 * Where in the pool to sample from.
 *
 * Without this the row is the same every time, because "the 40 highest-rated
 * games" is a fixed list. A refresh button on a fixed list is a button that
 * does nothing, which is worse than no button — it makes the page look broken
 * rather than finished.
 *
 * So the sample walks. Each refresh moves one window further down the pool and
 * wraps at the end. That also means the row is not permanently the same twenty
 * famous games, which is the same complaint that produced the recent-picks
 * exclusion in the shortlist.
 *
 * IGDB's own ceiling on `offset` is not documented anywhere this project could
 * verify, so it is clamped to the pool and a request past whatever the real
 * limit is would surface as a failed row rather than a silent empty one.
 */
let poolSize = null;

async function itad(path, { method = "GET", body = null, params = {} } = {}) {
  const q = new URLSearchParams({ ...params, key: config.itadKey });
  let res;
  try {
    res = await fetch(`${BASE}${path}?${q}`, {
      method,
      headers: body ? { "Content-Type": "application/json" } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (cause) {
    const e = new Error(`Price service unreachable: ${cause.message}`);
    e.kind = "prices";
    throw e;
  }
  if (!res.ok) {
    const e = new Error(`Price service returned ${res.status} for ${path}`);
    // Its own kind, not "catalogue". Criterion 13 is about a person being able
    // to say which service broke, and there are three of them now.
    e.kind = "prices";
    e.status = res.status;
    throw e;
  }
  return res.json();
}

/**
 * Steam app id -> ITAD game id.
 *
 * Cached because it is the one call that cannot be batched — ITAD's lookup takes
 * one app id — and because the mapping is permanent. The same thirty games
 * recur between builds, so a warm instance makes almost none of these.
 *
 * Bounded, because an unbounded map keyed on anything reachable from a request
 * is a memory leak with a remote trigger.
 */
const CACHE_MAX = 500;
const itadIdByAppId = new Map();

function remember(appid, id) {
  itadIdByAppId.set(appid, id);
  if (itadIdByAppId.size > CACHE_MAX) {
    itadIdByAppId.delete(itadIdByAppId.keys().next().value);
  }
  return id;
}

async function resolveItadId(appid) {
  if (itadIdByAppId.has(appid)) return itadIdByAppId.get(appid);
  const found = await itad("/games/lookup/v1", { params: { appid } });
  // `null` is a real answer and is cached like any other: a game ITAD does not
  // know will still not be known on the next build, and asking again every time
  // spends a request to learn nothing.
  return remember(appid, found?.found && found.game?.id ? found.game.id : null);
}

/**
 * Turn one ITAD price row and its game into a card. Pure, so it is checked
 * offline.
 *
 * Returns null rather than a card when there is no discount. A row called "on
 * sale" containing things that are not on sale is the kind of small lie this
 * project exists to avoid.
 */
export function shapeDeal(priceRow, game, { requireDiscount = true } = {}) {
  if (!priceRow || !game) return null;

  const best = Array.isArray(priceRow.deals) ? priceRow.deals[0] : null;
  if (!best) return null;

  const cut = Number.isFinite(best.cut) ? best.cut : 0;
  // The browse list drops anything at full price: a row headed "cheaper than
  // usual" containing things that are not cheaper is a small lie. A SEARCH is
  // the opposite — somebody asking whether a game is on sale is owed "no, it is
  // $59.99" rather than an empty result that reads as "we have never heard of
  // it".
  if (requireDiscount && cut <= 0) return null;

  const now = best.price?.amount;
  const was = best.regular?.amount;
  if (!Number.isFinite(now) || !Number.isFinite(was)) return null;

  return {
    id: game.id,
    title: game.title,
    slug: game.slug,
    released: game.released,
    image: game.image,
    cover: game.cover,
    platforms: game.platforms,
    machines: game.machines,
    criticScore: game.criticScore,
    criticReviews: game.criticReviews,
    ratingCount: game.ratingCount,
    price: {
      now,
      was,
      cut,
      currency: best.price?.currency ?? "USD",
      shop: best.shop?.name ?? null,
      // Their URL, unaltered. Stripping the affiliate tag out of it would be a
      // breach of the terms this data comes under, and rebuilding it as a direct
      // store link is the same thing wearing a disguise.
      buyUrl: typeof best.url === "string" ? best.url : null,
    },
  };
}

/**
 * Make a typed phrase safe to put inside an Apicalypse `search "..."`.
 *
 * THE ONLY PLACE in this project where text a person typed reaches a query
 * language. Everywhere else — categories, platforms, facets — a user's input is
 * a slug that gets resolved to an integer out of a pinned file before it goes
 * anywhere near a query, which is why none of those need escaping.
 *
 * A search box cannot work that way, so the string is filtered rather than
 * escaped: a double quote would close the literal, a backslash could escape the
 * closing one, and a semicolon would end the statement and start another. None
 * of those can appear in a game title in a way worth preserving, so they are
 * removed instead of encoded — a rule that cannot be got wrong by a later
 * change to the encoder.
 *
 * Pure, and checked offline with the payloads it exists to stop.
 */
export function safeSearch(query) {
  if (typeof query !== "string") return null;
  const cleaned = query
    // Quotes, backslashes, semicolons, braces and control characters. Anything
    // that could end the literal or the statement.
    .replace(/["'\\;{}()\[\]]/g, " ")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
  return cleaned.length >= 2 ? cleaned : null;
}

/**
 * What one game costs, whether or not it is discounted.
 *
 * Up to five matches, because a search for "god of war" is a real question with
 * more than one right answer and picking the first silently is the title
 * matching this project refuses. The person sees what was found — title, year,
 * cover — and decides which one they meant.
 */
export async function searchDeals(query) {
  const term = safeSearch(query);
  if (!term) return { games: [], query: null };

  const v = loadVocabulary();
  const now = Math.floor(Date.now() / 1000);

  const picks = await igdbRequest("games",
    `search "${term}";
     fields id, name, slug, summary, first_release_date, aggregated_rating,
            aggregated_rating_count, rating_count, cover.image_id,
            screenshots.image_id, platforms.slug, genres.slug, themes.slug,
            game_modes.slug, player_perspectives.slug;
     where first_release_date < ${now} & parent_game = null & cover != null
           & themes != (${v.excludedThemeIds.join(",") || 0});
     limit 5;`);

  const games = (Array.isArray(picks) ? picks : [])
    .map(g => toCandidate(g, v))
    .filter(g => g && g.title);
  if (games.length === 0) return { games: [], query: term };

  const ext = await igdbRequest("external_games",
    `fields game, uid; where game = (${games.map(g => g.id).join(",")})
      & external_game_source = ${STEAM_SOURCE}; limit 50;`);
  const appIdByGame = new Map(
    (Array.isArray(ext) ? ext : []).map(e => [e.game, String(e.uid)])
  );

  const resolved = [];
  for (const g of games) {
    const appid = appIdByGame.get(g.id);
    if (!appid) continue;
    const id = await resolveItadId(appid);
    if (id) resolved.push({ game: g, itadId: id });
  }

  // Games with no Steam release, or none ITAD knows, are reported rather than
  // dropped — "we cannot price this one" and "this game does not exist" are
  // different answers and only one of them is true.
  const unpriceable = games.filter(g => !resolved.some(r => r.game.id === g.id));

  if (resolved.length === 0) {
    return { games: [], query: term, unpriceable: unpriceable.map(g => g.title) };
  }

  const prices = await itad("/games/prices/v3", {
    method: "POST",
    params: { country: COUNTRY, capacity: "1", nondeals: "true" },
    body: resolved.map(r => r.itadId),
  });

  const gameByItadId = new Map(resolved.map(r => [r.itadId, r.game]));
  const cards = (Array.isArray(prices) ? prices : [])
    .map(row => shapeDeal(row, gameByItadId.get(row.id), { requireDiscount: false }))
    .filter(Boolean);

  return {
    games: rankByCut(cards),
    query: term,
    unpriceable: unpriceable.map(g => g.title),
  };
}

/** Biggest discount first — that is what a row of prices is sorted by. */
export function rankByCut(cards) {
  return [...cards].sort((a, b) => b.price.cut - a.price.cut);
}

/**
 * Build the row.
 *
 * Cost: two IGDB requests, up to SAMPLE ITAD lookups on a cold instance and
 * almost none on a warm one, and one batched price request. Against ITAD's
 * thousand per five minutes that is comfortable, and the front page caches for
 * half an hour on top.
 *
 * Throws with `kind: "prices"` when the price service fails, so the front page
 * can lose this row without losing the others or blaming the catalogue.
 */
/** How many games are eligible at all. One request, remembered per instance. */
async function eligibleCount(where) {
  if (poolSize !== null) return poolSize;
  const r = await igdbRequest("games/count", `where ${where};`);
  poolSize = Number.isInteger(r?.count) ? r.count : SAMPLE;
  return poolSize;
}

/**
 * Build the row.
 *
 * `offset` walks the sample window through the pool so a refresh returns
 * different games. Absent, it starts at a random window rather than the top —
 * otherwise every first visit sees the same twenty games and the row reads as a
 * fixed list of famous titles rather than a thing that changes.
 *
 * Cost: two IGDB requests plus a count on a cold instance, up to SAMPLE ITAD
 * lookups the first time a window is seen and almost none afterwards, and one
 * batched price request. There is no rate limiting on the endpoint that calls
 * this — a known and recorded gap, and pressing refresh quickly is the cheapest
 * way to find it.
 *
 * Throws with `kind: "prices"` when the price service fails, so the front page
 * can lose this row without losing the others or blaming the catalogue.
 */
export async function buildDealsRow({ offset = null } = {}) {
  const v = loadVocabulary();
  const now = Math.floor(Date.now() / 1000);

  const where =
    `first_release_date < ${now} & parent_game = null & cover != null` +
    ` & aggregated_rating >= ${MIN_SCORE}` +
    ` & aggregated_rating_count >= ${MIN_REVIEWS}` +
    ` & themes != (${v.excludedThemeIds.join(",") || 0})`;

  const total = await eligibleCount(where);
  const windows = Math.max(1, Math.ceil(total / SAMPLE));
  const window = offset === null
    ? Math.floor(Math.random() * windows)
    : ((offset % windows) + windows) % windows;
  const start = window * SAMPLE;

  const picks = await igdbRequest("games",
    `fields id, name, slug, summary, first_release_date, aggregated_rating,
            aggregated_rating_count, rating_count, cover.image_id,
            screenshots.image_id, platforms.slug, genres.slug, themes.slug,
            game_modes.slug, player_perspectives.slug;
     where ${where};
     sort aggregated_rating desc; limit ${SAMPLE}; offset ${start};`);

  const games = (Array.isArray(picks) ? picks : [])
    .map(g => toCandidate(g, v))
    .filter(g => g && g.title && g.image);
  const window_ = { window, windows, offset: window };
  if (games.length === 0) return { games: [], sampled: 0, ...window_ };

  // Steam ids for the whole sample in one request, filtered on
  // `external_game_source`. NOT `category` — that field still exists and still
  // answers, with 753 rows against 175,517. A filter on the stale name returns
  // almost nothing and looks exactly like a game with no Steam release.
  const ext = await igdbRequest("external_games",
    `fields game, uid; where game = (${games.map(g => g.id).join(",")})
      & external_game_source = ${STEAM_SOURCE}; limit 200;`);

  const appIdByGame = new Map(
    (Array.isArray(ext) ? ext : []).map(e => [e.game, String(e.uid)])
  );

  const withApp = games.filter(g => appIdByGame.has(g.id));
  if (withApp.length === 0) return { games: [], sampled: games.length, ...window_ };

  const resolved = [];
  for (const g of withApp) {
    const id = await resolveItadId(appIdByGame.get(g.id));
    if (id) resolved.push({ game: g, itadId: id });
  }
  if (resolved.length === 0) return { games: [], sampled: games.length, ...window_ };

  const prices = await itad("/games/prices/v3", {
    method: "POST",
    params: { country: COUNTRY, capacity: "1", nondeals: "false" },
    body: resolved.map(r => r.itadId),
  });

  const gameByItadId = new Map(resolved.map(r => [r.itadId, r.game]));
  const cards = (Array.isArray(prices) ? prices : [])
    .map(row => shapeDeal(row, gameByItadId.get(row.id)))
    .filter(Boolean);

  return {
    games: rankByCut(cards).slice(0, ROW_SIZE),
    sampled: games.length,
    withSteamId: withApp.length,
    resolved: resolved.length,
    ...window_,
  };
}
