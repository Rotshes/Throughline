/**
 * IGDB transport. Authentication, rate limiting, and one way to make a request.
 *
 * Step 2 of docs/plans/igdb-migration.md. Nothing else imports this yet — it is
 * the plumbing, not the catalogue. The catalogue surface (`assembleCandidates`,
 * `countFor`, `toCandidate` and the rest) arrives on top of this once the
 * vocabularies are pinned, and it will implement exactly the same exports as
 * `src/catalogue.js` so that nothing downstream learns which source it is
 * talking to.
 *
 * Three things here are different in kind from RAWG, not just in detail.
 *
 * ONE — the credential expires.
 *
 *   RAWG's key was a string that worked forever. This is a token minted from a
 *   client id and secret, good for about 57 days. A deployed function that
 *   fetches one at startup and holds it will work for two months and then stop,
 *   on a site whose deploys are switched off. So the token is cached with its
 *   expiry, refreshed before it lapses, and re-minted on a 401 — because a token
 *   can be revoked before it expires, and the only way to find out is to be
 *   refused while holding one that looks valid.
 *
 * TWO — there is a rate limit that can actually be hit.
 *
 *   Four requests per second per client id. A single shortlist makes up to six
 *   catalogue calls, and two people pressing the button at once exceeds it. RAWG
 *   had a monthly ceiling, which is a budget; this is a speed limit, which is a
 *   different problem and needs a different answer. Requests queue against a
 *   sliding window rather than being fired and hoped for.
 *
 * THREE — the query is a language, not a URL.
 *
 *   A POST body of Apicalypse: `fields name,rating; where platforms = (6);
 *   sort rating desc; limit 40;`. That has a consequence worth stating plainly
 *   at the transport layer: it is a query language, and catalogue text is
 *   attacker-controlled. Nothing user-supplied is ever concatenated into a query
 *   body here. Ids are checked as integers and slugs are matched against the
 *   pinned vocabularies before they get anywhere near this file.
 */

import { config } from "./config.js";

const TOKEN_URL = "https://id.twitch.tv/oauth2/token";
const BASE = "https://api.igdb.com/v4";

/**
 * Requests per second IGDB permits per client id, measured from their published
 * rules rather than guessed. The window is kept slightly under a full second so
 * clock drift between here and their edge cannot turn four into five.
 */
const MAX_PER_WINDOW = 4;
const WINDOW_MS = 1100;

/**
 * Refresh this long before the token actually expires.
 *
 * A token that dies mid-request produces a 401 that reads like bad credentials.
 * Ten minutes is far more than the clock skew between a container and Twitch,
 * and costs one extra token fetch every fifty-seven days.
 */
const REFRESH_MARGIN_MS = 10 * 60 * 1000;

let cached = null;         // { token, expiresAt }
let inFlight = null;       // a promise, so a cold start does not mint four tokens

/**
 * Fetch a token, or return the cached one.
 *
 * `force` skips the cache, which is what a 401 does: the token we hold looks
 * valid by its own expiry and has been refused anyway.
 *
 * The in-flight promise matters more than it looks. A cold function instance
 * handling a front page build fires several requests at once, and without it
 * each would mint its own token — four round trips to Twitch and four tokens
 * where one was needed.
 */
async function token({ force = false } = {}) {
  if (!force && cached && Date.now() < cached.expiresAt - REFRESH_MARGIN_MS) {
    return cached.token;
  }
  if (!force && inFlight) return inFlight;

  inFlight = (async () => {
    const url =
      `${TOKEN_URL}?client_id=${encodeURIComponent(config.twitchClientId)}` +
      `&client_secret=${encodeURIComponent(config.twitchClientSecret)}` +
      `&grant_type=client_credentials`;

    let res;
    try {
      res = await fetch(url, { method: "POST" });
    } catch (cause) {
      throw catalogueError(`Could not reach Twitch to authenticate: ${cause.message}`);
    }

    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body.access_token) {
      // Twitch distinguishes these and the distinction is the whole diagnosis:
      // "invalid client" is the id, "invalid client secret" is the secret, and
      // the usual cause of the second is generating a new secret after copying
      // the first. Passing their message through unchanged is more useful than
      // any sentence written here.
      throw catalogueError(
        `Twitch refused the credentials (HTTP ${res.status}): ${body.message ?? JSON.stringify(body).slice(0, 200)}`
      );
    }

    cached = {
      token: body.access_token,
      expiresAt: Date.now() + body.expires_in * 1000,
    };
    return cached.token;
  })();

  try {
    return await inFlight;
  } finally {
    inFlight = null;
  }
}

function catalogueError(message, status) {
  const e = new Error(message);
  // The same shape `src/catalogue.js` throws, so every caller's existing
  // handling of a catalogue failure keeps working across the swap. Criterion 13
  // depends on a failure being attributable to the right service.
  e.kind = "catalogue";
  if (status) e.status = status;
  return e;
}

/**
 * A sliding window over the last second's requests.
 *
 * Not a token bucket and not a fixed delay between calls. A fixed delay would
 * serialise a front page build that IGDB is happy to serve in parallel; a bucket
 * with burst would let a cold start fire six at once and collect a 429. This
 * allows four in flight per second and makes the fifth wait exactly as long as
 * it must.
 */
const recent = [];

async function waitForSlot() {
  for (;;) {
    const now = Date.now();
    while (recent.length && now - recent[0] >= WINDOW_MS) recent.shift();
    if (recent.length < MAX_PER_WINDOW) {
      recent.push(now);
      return;
    }
    await sleep(WINDOW_MS - (now - recent[0]) + 5);
  }
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

/**
 * One IGDB request.
 *
 * `body` is Apicalypse, built by the caller from values that have already been
 * validated. This function does not interpolate anything into it.
 *
 * Retries exactly twice, and only for the two conditions where a retry is the
 * correct response rather than a wish: a 401, which means re-mint the token, and
 * a 429, which means wait the interval they name. A 400 is a bad query and
 * retrying it produces the same bad query.
 */
export async function igdbRequest(endpoint, body) {
  let attempt = 0;

  for (;;) {
    await waitForSlot();

    const bearer = await token({ force: attempt === 1 });
    let res;
    try {
      res = await fetch(`${BASE}/${endpoint}`, {
        method: "POST",
        headers: {
          "Client-ID": config.twitchClientId,
          Authorization: `Bearer ${bearer}`,
          Accept: "application/json",
          "Content-Type": "text/plain",
        },
        body,
      });
    } catch (cause) {
      throw catalogueError(`Catalogue unreachable: ${cause.message}`);
    }

    if (res.status === 401 && attempt === 0) {
      // The token we hold has not expired by its own clock and has been refused
      // anyway. Mint a new one and try once more; if that is also refused, the
      // credentials are wrong and saying so is more useful than looping.
      attempt = 1;
      continue;
    }

    if (res.status === 429 && attempt < 2) {
      const after = Number(res.headers.get("Retry-After"));
      await sleep(Number.isFinite(after) && after > 0 ? after * 1000 : WINDOW_MS);
      attempt += 1;
      continue;
    }

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw catalogueError(
        `Catalogue returned ${res.status} for ${endpoint}. ${text.slice(0, 300)}`,
        res.status
      );
    }

    return res.json();
  }
}

/**
 * How many games match a condition.
 *
 * A separate endpoint, unlike RAWG where the total rode along on every list
 * response. Everything that diagnoses a thin result — `countFor`,
 * `diagnoseThin` — costs a request of its own here, which is a real cost worth
 * knowing before those are ported.
 */
export async function igdbCount(endpoint, where) {
  const r = await igdbRequest(`${endpoint}/count`, where ? `where ${where};` : "");
  if (!Number.isInteger(r?.count)) {
    throw catalogueError(`Expected a count from ${endpoint}/count, got ${JSON.stringify(r).slice(0, 120)}`);
  }
  return r.count;
}

/**
 * Turn an IGDB image reference into a URL a browser can load.
 *
 * They arrive scheme-less and at thumbnail size:
 *
 *     //images.igdb.com/igdb/image/upload/t_thumb/coc7me.jpg
 *
 * Both facts were found by printing a response, not by reading a field list, and
 * neither is guessable: a scheme-less src silently fails to load and a t_thumb
 * looks like a working image until you see it at card size.
 *
 * Pure, so it is checked offline. `image_id` is preferred over `url` when the
 * record carries it — building the URL is more reliable than rewriting one.
 */
export const IMAGE_SIZES = {
  thumb: "t_thumb",
  cover: "t_cover_big",     // 264x374
  card: "t_720p",           // 1280x720
  screenshot: "t_screenshot_big",
  full: "t_1080p",
};

export function imageUrl(ref, size = "card") {
  const token = IMAGE_SIZES[size] ?? IMAGE_SIZES.card;

  if (ref && typeof ref === "object") {
    if (typeof ref.image_id === "string" && ref.image_id) {
      return `https://images.igdb.com/igdb/image/upload/${token}/${ref.image_id}.jpg`;
    }
    ref = ref.url;
  }
  if (typeof ref !== "string" || !ref) return null;

  // A URL rather than an id: swap whatever size token it carries and give it a
  // scheme. Anchored on the path segment so a game whose id happened to contain
  // "t_thumb" is not corrupted.
  const withScheme = ref.startsWith("//") ? `https:${ref}` : ref;
  return withScheme.replace(/\/t_[a-z0-9_]+\//, `/${token}/`);
}

/** A YouTube id from IGDB's video record. Nothing else is a video here. */
export function youTubeUrl(video) {
  const id = typeof video === "string" ? video : video?.video_id;
  // YouTube ids are 11 characters of a known alphabet. Checked rather than
  // trusted, because this value ends up in an iframe src and it arrives from a
  // third party that nobody in this project controls.
  return typeof id === "string" && /^[A-Za-z0-9_-]{11}$/.test(id)
    ? `https://www.youtube.com/embed/${id}`
    : null;
}

/** Cleared between checks so a cached token cannot make a test pass. */
export function __resetAuthForTests() {
  cached = null;
  inFlight = null;
  recent.length = 0;
}
