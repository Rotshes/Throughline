import {
  listLibrary, upsertEntry, removeEntry, isValidStatus, statuses, defaultStatus,
} from "../../src/library.js";

const json = (status, body) => ({
  statusCode: status,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

/**
 * GET    /api/library                          -> every entry, and the statuses
 * POST   /api/library   { gameId, status, … }  -> add, or change a status
 * DELETE /api/library?gameId=123               -> remove
 *
 * One shared library — no accounts, no per-visitor identity. Anyone who can
 * open the site can change it. See docs/decisions/0005.
 *
 * The Supabase service key lives here and never reaches the browser. The
 * browser sends a game and a status; this decides whether either is acceptable.
 */
export async function handler(event) {
  if (event.httpMethod === "GET") {
    const result = await listLibrary();
    return json(result.ok ? 200 : 500, {
      ok: result.ok,
      entries: result.entries,
      statuses: statuses(),
      reason: result.reason ?? null,
    });
  }

  if (event.httpMethod === "DELETE") {
    const gameId = Number(event.queryStringParameters?.gameId);
    if (!Number.isInteger(gameId)) {
      return json(400, { error: "gameId must be a whole number." });
    }
    const r = await removeEntry(gameId);
    return json(r.ok ? 200 : 500, r.ok ? { ok: true } : { ok: false, error: r.reason });
  }

  if (event.httpMethod !== "POST") return json(405, { error: "GET, POST or DELETE." });

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return json(400, { error: "Body must be JSON." });
  }

  const gameId = Number(body.gameId);
  if (!Number.isInteger(gameId)) {
    return json(400, { error: "gameId must be a whole number." });
  }

  const title = String(body.title ?? "").trim();
  if (!title) {
    // The library renders from its own rows rather than re-reading the
    // catalogue, so an entry without a title is a row that can never be shown.
    return json(400, { error: "A title is required — the library shows its own copy." });
  }

  // An absent status means the default rather than a refusal: adding something
  // you have just been shown almost always means you intend to play it.
  const status = body.status == null ? defaultStatus() : String(body.status);
  if (!isValidStatus(status)) {
    return json(400, {
      error: `"${status}" is not a status. Use one of: ${statuses().map(s => s.id).join(", ")}.`,
    });
  }

  const r = await upsertEntry({
    gameId,
    status,
    title,
    slug: body.slug ?? null,
    image: body.image ?? null,
    released: body.released ?? null,
    // Trusted only as display text — these are a copy of what the catalogue
    // said when the game was added, never used to decide anything.
    platforms: Array.isArray(body.platforms)
      ? body.platforms.map(p => String(p)).slice(0, 12)
      : [],
  });

  return json(r.ok ? 200 : 500, r.ok ? { ok: true, entry: r.entry } : { ok: false, error: r.reason });
}
