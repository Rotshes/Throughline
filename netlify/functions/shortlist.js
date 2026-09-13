import { runRequest } from "../../src/pipeline.js";
import { recordClick } from "../../src/store.js";
import { resolvePlatforms } from "../../src/platforms.js";
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
 * The OpenRouter key, the catalogue credentials and the Supabase service key live
 * here and never reach the browser. Nothing about correctness is decided client-side.
 *
 * The browser sends slugs, never ids or query parameters. Anything it sends is
 * checked against the pinned vocabularies below before it reaches the catalogue —
 * the interface offers dropdowns, but a request does not have to come from the
 * interface.
 */

let vocab = null;
function vocabularies() {
  if (!vocab) {
    // The IGDB vocabularies — decision 0006. The RAWG files remain in data/
    // until the RAWG module is deleted, so a record written before the swap can
    // still be read against the vocabulary that produced it.
    const categories = JSON.parse(readData("data/categories.igdb.json"));
    const platforms = JSON.parse(readData("data/platforms.igdb.json"));
    const tags = JSON.parse(readData("data/tags.igdb.json"));
    vocab = {
      categories: new Set(categories.categories.map(c => c.slug)),
      // Families: "playstation". Machines: "playstation5". Different catalogue
      // parameters, never mixed in one request — see buildPoolQuery.
      familyIdBySlug: new Map(platforms.platforms.map(p => [p.slug, p.id])),
      familyChildren: new Map(
        platforms.platforms.map(p => [p.slug, (p.platforms || []).map(c => c.id)])
      ),
      familyChildSlugs: new Map(
        platforms.platforms.map(p => [p.slug, (p.platforms || []).map(c => c.slug)])
      ),
      machineIdBySlug: new Map(
        platforms.platforms.flatMap(p => (p.platforms || []).map(c => [c.slug, c.id]))
      ),
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

  // "any" and an absent category both mean no genre filter. Accepted as a real
  // request rather than a missing one: the nineteen genres are coarse, and
  // someone asking for something cosy on a Switch has no reason to care whether
  // the catalogue files it under adventure or simulation.
  const rawCategory = String(body.category ?? "").trim();
  const anyCategory = rawCategory === "" || rawCategory === "any";
  if (!anyCategory && !v.categories.has(rawCategory)) {
    return json(400, { error: `"${rawCategory}" is not a category this app offers.` });
  }
  const category = anyCategory ? null : rawCategory;

  const familySlugs = Array.isArray(body.platforms)
    ? [...new Set(body.platforms.map(p => String(p).trim()).filter(Boolean))]
    : [];
  const machineSlugs = Array.isArray(body.machines)
    ? [...new Set(body.machines.map(p => String(p).trim()).filter(Boolean))]
    : [];

  if (familySlugs.length === 0 && machineSlugs.length === 0) {
    return json(400, { error: "Choose at least one platform." });
  }
  const unknownFamily = familySlugs.filter(p => !v.familyIdBySlug.has(p));
  if (unknownFamily.length) {
    return json(400, { error: `Unknown platform: ${unknownFamily.join(", ")}` });
  }
  const unknownMachine = machineSlugs.filter(p => !v.machineIdBySlug.has(p));
  if (unknownMachine.length) {
    return json(400, { error: `Unknown console: ${unknownMachine.join(", ")}` });
  }

  // Whether the person named a console, as opposed to a whole family. It no
  // longer changes which parameter is sent — IGDB games carry machines and have
  // no family granularity at all, so every request resolves to machines — but it
  // still decides how the request is described back to them. "on playstation" is
  // a better account of what was asked than "on ps5 or ps4 or ps3 or ps2 or ps1
  // or psvita or psp", which is what it resolves to.
  const specific = machineSlugs.length > 0;

  // ONE list, resolved once, used for both the catalogue query and the gate
  // that checks the answer.
  //
  // Turn 009 shipped these as two lists and they disagreed. Selecting PC plus a
  // Game Boy Advance expanded PC into its machines for the query but not for the
  // check, so the catalogue was asked for PC-or-GBA games while the gate demanded
  // GBA alone. Every possible answer was rejected. The gate was right and the
  // request was impossible.
  //
  // A filter and the check on its result are the same statement said twice. They
  // are derived here rather than assembled separately, so they cannot drift.
  // In src/platforms.js, pure and checked offline. It has been wrong twice while
  // it lived here, both times in ways no test could reach.
  const resolved = resolvePlatforms({
    familySlugs,
    machineSlugs,
    childrenOf: s => v.familyChildSlugs.get(s),
  });

  // Always machines. A family with no console ticked means every console in it,
  // expanded here rather than sent as a family id, because this catalogue has no
  // family id to send.
  const resolvedMachines = specific
    ? resolved.machines
    : familySlugs.flatMap(f => v.familyChildSlugs.get(f) ?? []);

  // What the person ticked, for the record and for describing the request.
  const selectionSlugs = specific ? resolved.selection : familySlugs;

  if (resolvedMachines.length === 0) {
    return json(400, { error: "Those platforms have no machines the catalogue knows about." });
  }

  const tagSlugs = Array.isArray(body.tags)
    ? [...new Set(body.tags.map(t => String(t).trim()).filter(Boolean))]
    : [];
  const unknownTag = tagSlugs.filter(t => !v.tags.has(t));
  if (unknownTag.length) {
    return json(400, { error: `Unknown tag: ${unknownTag.join(", ")}` });
  }
  // A bound on the request, not a style preference. Every extra tag widens the
  // catalogue query — within a facet the ids combine with OR, decision 0004 —
  // and a request with
  // forty of them is a way to make this endpoint fetch three full pages for
  // nothing.
  if (tagSlugs.length > 6) {
    return json(400, { error: "Six tags at most." });
  }

  let result;
  try {
    result = await runRequest({
      categorySlug: category,
      platformSlugs: familySlugs,
      // The full resolved set — what the query asked for, and therefore what the
      // gate must accept.
      machineSlugs: resolvedMachines,
      // What the person ticked, for the record and the prompt.
      selectionSlugs,
      // Criterion 3 is checked at machine granularity always, because that is
      // the granularity the query asked at. Saying a game is "on Nintendo" is no
      // use to someone who asked for a GameCube and owns only that.
      specific: true,
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
    // Present only when the pool came back thin. Says which filter emptied it,
    // measured rather than guessed.
    diagnosis: result.diagnosis ?? null,
    picks: result.ok
      ? result.picks.map(p => ({
          id: p.id,
          title: p.title,
          released: p.released,
          angle: p.angle,
          angleLabel: p.angleLabel,
          // Written by code from catalogue data. May be null — `beautiful-one`
          // has no fact behind it and gets no line rather than an invented one.
          angleReason: p.angleReason ?? null,
          case: p.case,
          // One sentence per tag the person asked for and this game carries.
          // The tag is the catalogue's; the sentence is the model's.
          tagNotes: p.tagNotes ?? [],
          // The catalogue's own words, kept separate from the model's argument
          // above. May be null when the detail request failed.
          synopsis: p.synopsis ?? null,
          // Where the button goes. Built here rather than in the browser so the
          // catalogue's address shape stays on this side of the boundary.
          url: p.slug ? `https://www.igdb.com/games/${p.slug}` : null,
          image: p.image,
          // Box art. Not shown on a shortlist card — the frame there is 16:9 —
          // but carried so that adding a game to the library stores the picture
          // the library actually wants.
          cover: p.cover ?? null,
          screenshots: p.screenshots?.slice(0, 5) ?? [],
          platforms: p.platforms,
          machines: p.machines,
          // Named for what it is. IGDB's own aggregation over IGDB's own critic
          // list, with the size of that list attached — a 100 from one reviewer
          // and a 97 from twenty-seven are not the same claim.
          criticScore: p.criticScore,
          criticReviews: p.criticReviews,
          // Free here. RAWG wanted $149 a month for it.
          video: p.video ?? null,
          tags: p.tags,
        }))
      : [],
    meta: {
      candidateCount: result.query?.usableFound ?? null,
      shownFrom: result.query?.catalogueCount ?? null,
      fullMatches: result.query?.fullMatches ?? null,
      callsUsed: result.budget?.used ?? null,
      callCap: result.budget?.max ?? null,
      synopsesMissing: result.synopsesMissing ?? null,
      excluded: result.excluded ?? null,
      repeatsAvoided: result.repeatsAvoided ?? null,
      // Surfaced rather than swallowed: if the library could not be read,
      // criterion 8 did not hold for this request and somebody should be told.
      libraryError: result.libraryError ?? null,
      latencyMs: result.usage?.latency_ms ?? null,
      prompt: result.prompt ? `${result.prompt.file} v${result.prompt.version}` : null,
      // Surfaced rather than swallowed: if recording failed, criterion 10 did
      // not hold for this request and somebody should be able to tell.
      recording: result.recording ?? null,
    },
  });
}
