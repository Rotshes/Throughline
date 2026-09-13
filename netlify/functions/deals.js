import { buildDealsRow, searchDeals, COUNTRY } from "../../src/deals.js";

/**
 * GET /api/deals?window=N -> one page of discounted, well-reviewed games.
 * GET /api/deals?q=title   -> what one game costs, discounted or not.
 *
 * Exists so the refresh button does not have to rebuild the whole front page.
 * That matters twice: the page is cached for half an hour and pressing refresh
 * should not blow that away for everyone, and the other two rows have no reason
 * to be re-fetched because somebody wanted different prices.
 *
 * `window` is the only input and it is a whole number that is taken modulo the
 * number of windows inside `buildDealsRow` — so any integer is safe, and a
 * nonsense one is refused here rather than travelling further.
 *
 * NOT cached, deliberately. The point of the request is to get something
 * different from last time.
 *
 * There is no rate limiting on this endpoint, which is a known gap recorded in
 * the specification rather than an oversight: each call costs two catalogue
 * requests, a batch of price lookups, and one price request.
 */
export async function handler(event) {
  if (event.httpMethod !== "GET") return { statusCode: 405, body: "GET only" };

  // A search is a different question with a different answer shape, so it is
  // handled first rather than folded into the browse path with a flag.
  const q = event.queryStringParameters?.q;
  if (typeof q === "string" && q.trim()) {
    try {
      const found = await searchDeals(q);
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
        body: JSON.stringify({
          ok: true,
          search: true,
          query: found.query,
          games: found.games,
          // Games that matched but cannot be priced. Saying so beats an empty
          // result, which reads as "no such game".
          unpriceable: found.unpriceable ?? [],
          country: COUNTRY,
        }),
      };
    } catch (e) {
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ok: false,
          stage: e.kind === "prices" ? "prices" : e.kind === "catalogue" ? "catalogue" : "unexpected",
          reason: e.message,
          games: [],
        }),
      };
    }
  }

  const raw = event.queryStringParameters?.window;
  const window = raw == null || raw === "" ? null : Number(raw);
  if (window !== null && !Number.isInteger(window)) {
    return {
      statusCode: 400,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ok: false, reason: "window must be a whole number." }),
    };
  }

  try {
    const deals = await buildDealsRow({ offset: window });
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
      body: JSON.stringify({
        ok: true,
        games: deals.games,
        window: deals.window,
        windows: deals.windows,
        country: COUNTRY,
        // How many were priced to produce this many. A window where almost
        // nothing is discounted is a real answer and the interface says so
        // rather than showing a short list with no explanation.
        sampled: deals.sampled ?? null,
        resolved: deals.resolved ?? null,
      }),
    };
  } catch (e) {
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ok: false,
        // Its own service. Three of them now, and a person who cannot tell which
        // one broke cannot report anything useful — criterion 13.
        stage: e.kind === "prices" ? "prices" : e.kind === "catalogue" ? "catalogue" : "unexpected",
        reason: e.message,
        games: [],
      }),
    };
  }
}
