import { fetchEvent } from "../../src/events.js";

/**
 * GET /api/event?id=123 -> one showcase and the games announced in it.
 *
 * Read-only, no model, two catalogue requests per uncached open. The row on the
 * front page carries only a logo, a name, a date and a count; the game records
 * arrive when somebody opens one, because a single showcase can list two hundred
 * games and twelve cards have no use for them.
 *
 * The id is the only input. `Number.isInteger` is the whole defence and it is
 * enough — nothing that is not a whole number reaches the query.
 */
export async function handler(event) {
  if (event.httpMethod !== "GET") return { statusCode: 405, body: "GET only" };

  const id = Number(event.queryStringParameters?.id);
  if (!Number.isInteger(id) || id <= 0) {
    return {
      statusCode: 400,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ok: false, stage: "request", reason: "id must be a whole number." }),
    };
  }

  try {
    const found = await fetchEvent(id);
    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        // A showcase that has already happened does not change. An hour is
        // conservative for something whose content is fixed the moment it airs.
        "Cache-Control": "public, max-age=3600",
      },
      body: JSON.stringify({ ok: true, ...found }),
    };
  } catch (e) {
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        // Criterion 13. Three services, and a catalogue failure must not read as
        // the model or the price service.
        ok: false,
        stage: e.kind === "catalogue" ? "catalogue" : e.kind === "request" ? "request" : "unexpected",
        reason: e.message,
        games: [],
      }),
    };
  }
}
