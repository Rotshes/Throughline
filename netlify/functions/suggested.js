import { buildSuggested } from "../../src/suggested.js";

/**
 * GET /api/suggested -> games this app has recently put in front of somebody.
 *
 * Read-only, no model, one database read and at most one catalogue request.
 * Never returns a failure: the strip sits above the find form and losing it must
 * not cost anybody the form. An empty list is the honest answer to "nothing has
 * been recorded yet" and to "the record could not be read", and here — unlike
 * every other list in this project — those two genuinely are the same outcome,
 * because a flourish that reports its own outage is a flourish nobody wanted.
 */
export async function handler(event) {
  if (event.httpMethod !== "GET") return { statusCode: 405, body: "GET only" };

  try {
    const { games } = await buildSuggested();
    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        // Short. This changes every time somebody runs a search, and it is the
        // one list on the site whose whole point is being recent.
        "Cache-Control": "public, max-age=120",
      },
      body: JSON.stringify({ ok: true, games }),
    };
  } catch (e) {
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ok: true, games: [], reason: e.message }),
    };
  }
}
