import { runRequest } from "../../src/pipeline.js";
import { recordClick } from "../../src/store.js";
import { readData } from "../../src/paths.js";

const json = (status, body) => ({
  statusCode: status,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

/**
 * POST /api/shortlist        { category, platforms: [slug], tags: [slug] }
 * POST /api/shortlist/click  { requestId, pickId }
 *
 * The OpenRouter key, the RAWG key and the Supabase service key live here and
 * never reach the browser. Nothing about correctness is decided client-side.
 *
 * The browser sends slugs, never ids or query parameters. Anything it sends is
 * checked against the pinned vocabularies below before it reaches the catalogue —
 * the interface offers dropdowns, but a request does not have to come from the
 * interface.
 */

let vocab = null;
function vocabularies() {
  if (!vocab) {
    const categories = JSON.parse(readData("data/categories.json"));
    const platforms = JSON.parse(readData("data/platforms.json"));
    const tags = JSON.parse(readData("data/tags.json"));
    vocab = {
      categories: new Set(categories.categories.map(c => c.slug)),
      platformIdBySlug: new Map(platforms.platforms.map(p => [p.slug, p.id])),
      tags: new Set(tags.facets.flatMap(f => f.tags.map(t => t.slug))),
    };
  }
  return vocab;
}

export async function handler(event) {
  if (event.httpMethod !== "POST") return json(405, { error: "POST only" });

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return json(400, { error: "Body must be JSON." });
  }

  if (event.path.endsWith("/click")) {
    if (!body.requestId || !Number.isInteger(body.pickId)) {
      return json(400, { error: "requestId and pickId are required." });
    }
    const r = await recordClick(body.requestId, body.pickId);
    return r.ok ? json(200, { ok: true }) : json(500, { error: r.reason });
  }

  const v = vocabularies();

  const category = String(body.category ?? "").trim();
  if (!v.categories.has(category)) {
    return json(400, { error: `"${category}" is not a category this app offers.` });
  }

  const platformSlugs = Array.isArray(body.platforms)
    ? [...new Set(body.platforms.map(p => String(p).trim()))]
    : [];
  if (platformSlugs.length === 0) {
    return json(400, { error: "Choose at least one platform." });
  }
  const unknownPlatform = platformSlugs.filter(p => !v.platformIdBySlug.has(p));
  if (unknownPlatform.length) {
    return json(400, { error: `Unknown platform: ${unknownPlatform.join(", ")}` });
  }

  const tagSlugs = Array.isArray(body.tags)
    ? [...new Set(body.tags.map(t => String(t).trim()).filter(Boolean))]
    : [];
  const unknownTag = tagSlugs.filter(t => !v.tags.has(t));
  if (unknownTag.length) {
    return json(400, { error: `Unknown tag: ${unknownTag.join(", ")}` });
  }
  // A bound on the request, not a style preference. Every extra tag widens the
  // catalogue query — tags combine with OR, decision 0004 — and a request with
  // forty of them is a way to make this endpoint fetch three full pages for
  // nothing.
  if (tagSlugs.length > 6) {
    return json(400, { error: "Six tags at most." });
  }

  let result;
  try {
    result = await runRequest({
      categorySlug: category,
      platformSlugs,
      platformIds: platformSlugs.map(p => v.platformIdBySlug.get(p)),
      tagSlugs,
    });
  } catch (e) {
    // An unexpected fault must still look like a failure, never like an empty
    // shortlist. Criterion 12.
    return json(500, { ok: false, stage: "unexpected", failureReason: e.message });
  }

  return json(200, {
    ok: result.ok,
    requestId: result.requestId ?? null,
    stage: result.ok ? null : result.stage,
    failureReason: result.ok ? null : result.failureReason,
    problems: result.problems ?? null,
    picks: result.ok
      ? result.picks.map(p => ({
          id: p.id,
          title: p.title,
          released: p.released,
          angle: p.angle,
          angleLabel: p.angleLabel,
          case: p.case,
          image: p.image,
          screenshots: p.screenshots?.slice(0, 3) ?? [],
          platforms: p.platforms,
          metacritic: p.metacritic,
          tags: p.tags,
        }))
      : [],
    meta: {
      candidateCount: result.query?.usableFound ?? null,
      shownFrom: result.query?.catalogueCount ?? null,
      fullMatches: result.query?.fullMatches ?? null,
      callsUsed: result.budget?.used ?? null,
      callCap: result.budget?.max ?? null,
      latencyMs: result.usage?.latency_ms ?? null,
      prompt: result.prompt ? `${result.prompt.file} v${result.prompt.version}` : null,
      // Surfaced rather than swallowed: if recording failed, criterion 10 did
      // not hold for this request and somebody should be able to tell.
      recording: result.recording ?? null,
    },
  });
}
