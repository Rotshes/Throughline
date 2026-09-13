import { buildHome } from "../../src/home.js";

/**
 * GET /api/home -> the front page's rows.
 *
 * Read-only, cacheable, and the only endpoint here that costs catalogue
 * requests without somebody having asked a question. Two per uncached build.
 */
export async function handler(event) {
  if (event.httpMethod !== "GET") return { statusCode: 405, body: "GET only" };

  // Local development never caches. There are two caches behind this endpoint —
  // a module-scope TTL inside the function and this header — and restarting the
  // server clears only the first. That combination made a fixed page look
  // unfixed: the browser kept serving its own copy and never asked. A cache you
  // cannot see is one you will debug around.
  const isDev = Boolean(process.env.NETLIFY_DEV) || process.env.NODE_ENV === "development";

  try {
    const home = await buildHome({ force: isDev });
    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        // The rows change slowly in production — a release list and a review
        // ranking are not live data — so letting the browser and the edge hold
        // them keeps a reload from spending catalogue quota.
        "Cache-Control": isDev
          ? "no-store"
          : "public, max-age=600, stale-while-revalidate=1800",
      },
      body: JSON.stringify({ ok: true, ...home }),
    };
  } catch (e) {
    // Criterion 13: a catalogue failure reads as a catalogue failure. Nothing
    // here involves the model, and the page should not imply it did.
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ok: false,
        stage: e.kind === "catalogue" ? "catalogue" : "unexpected",
        reason: e.message,
        rows: [],
      }),
    };
  }
}
