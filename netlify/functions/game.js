import { fetchGameDetail } from "../../src/detail.js";

/**
 * GET /api/game?id=123 -> one game, in the depth a dialog needs.
 *
 * Read-only, no model, ONE catalogue request per uncached open — IGDB carries
 * the summary, the screenshots and the video ids on the same record, where RAWG
 * needed a second request for the description and sold video separately. It exists
 * because a card carries what the list endpoint gave it, and somebody who clicks
 * a card wants more than that.
 *
 * The id is the only input and it is the one thing that has to be checked: it
 * goes into a URL path. `Number.isInteger` is the whole defence and it is enough
 * — anything that is not a whole number never reaches the catalogue.
 */

export async function handler(event) {
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, body: "GET only" };
  }

  const id = Number(event.queryStringParameters?.id);
  if (!Number.isInteger(id) || id <= 0) {
    return {
      statusCode: 400,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ok: false, stage: "request", reason: "id must be a whole number." }),
    };
  }

  try {
    // The catalogue module loads and caches its own vocabulary now, from the
    // same pinned files the query builder resolves slugs against. Two copies
    // could disagree; one cannot.
    const game = await fetchGameDetail(id);
    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        // A game's record barely changes. An hour in the browser is generous and
        // still cheap, and unlike the front page there is no fix anyone would sit
        // waiting to see — this panel is a listing, not a thing being debugged.
        "Cache-Control": "public, max-age=3600",
      },
      body: JSON.stringify({ ok: true, game }),
    };
  } catch (e) {
    // Criterion 13, again: name the service that failed. Nothing here went near
    // the model and the panel must not imply otherwise.
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ok: false,
        stage: e.kind === "catalogue" ? "catalogue" : "unexpected",
        reason: e.message,
      }),
    };
  }
}
