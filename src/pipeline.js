/**
 * The whole request, and the record of it.
 *
 * Steps 1 and 2 are `src/catalogue.js`; step 3 is `src/shortlist.js`. This joins
 * them and writes what happened, including when nothing happened.
 *
 * Every outcome is recorded — shortlisted, empty, failed. Criterion 10 is about
 * the model calls, but a request that never reached a model is the one most
 * worth being able to find later: it is the difference between "the filters were
 * too narrow" and "the service was down", and neither leaves a model_calls row.
 *
 * Recording failures are returned, never thrown. Someone waiting on an answer
 * should not lose it because an insert failed — but a silent recording failure
 * would make criterion 10 a fiction, so it comes back in the response and the
 * interface shows it.
 */

import { assembleCandidates, fetchDescription } from "./catalogue.js";
import { shortlist } from "./shortlist.js";
import { createBudget } from "./budget.js";
import { takeCalls } from "./callLog.js";
import { saveRequest, saveCalls, storeConfigured } from "./store.js";
import { config } from "./config.js";
import { readData } from "./paths.js";

let vocabularyCache = null;

/** The pinned tag vocabulary, read once per process. */
function tagVocabulary() {
  if (!vocabularyCache) {
    const file = JSON.parse(readData("data/tags.json"));
    vocabularyCache = new Set(file.facets.flatMap(f => f.tags.map(t => t.slug)));
  }
  return vocabularyCache;
}

async function record(row) {
  if (!storeConfigured()) return { skipped: true };

  const saved = await saveRequest(row);
  if (!saved.ok) return { ok: false, reason: saved.reason };

  const calls = takeCalls();
  const callsSaved = calls.length ? await saveCalls(saved.id, calls) : { ok: true };

  return {
    ok: callsSaved.ok,
    id: saved.id,
    calls: calls.length,
    reason: callsSaved.ok ? null : callsSaved.reason,
  };
}

/**
 * @param {object} request  { categorySlug, platformIds, platformSlugs, tagSlugs, playedIds }
 */
export async function runRequest(request) {
  const {
    categorySlug, platformIds, platformSlugs, machineSlugs = [],
    specific = false, tagSlugs = [], playedIds = [],
  } = request;

  const budget = createBudget(config.maxCallsPerRequest);

  // --- steps 1 and 2 ---------------------------------------------------------
  // A catalogue failure is not a model failure and must not read as one.
  // Criterion 13: with two external services, a user who cannot say which broke
  // cannot report anything useful.
  let assembled;
  try {
    assembled = await assembleCandidates({
      categorySlug, platformIds, specific, tagSlugs,
      vocabulary: tagVocabulary(), playedIds,
    });
  } catch (e) {
    const failure = {
      category: categorySlug, platforms: platformSlugs, tags: tagSlugs,
      candidate_ids: [], candidate_count: 0, catalogue_count: null,
      outcome: "failed",
      failure_stage: e.kind === "catalogue" ? "catalogue" : "unexpected",
      failure_reason: e.message,
    };
    return {
      ok: false,
      stage: failure.failure_stage,
      failureReason: e.message,
      recording: await record(failure),
      query: null,
    };
  }

  const { candidates, query } = assembled;

  const base = {
    category: categorySlug,
    // The machines when specific ones were named, the families otherwise. A
    // shortlist judged later needs to know which was asked for; "playstation"
    // and "playstation5" are very different requests.
    platforms: specific ? machineSlugs : platformSlugs,
    tags: tagSlugs,
    candidate_ids: candidates.map(c => c.id),
    candidate_count: candidates.length,
    catalogue_count: query.catalogueCount ?? null,
  };

  // --- the empty case --------------------------------------------------------
  // Recorded and returned before any model call. Reference case 4 is checked by
  // the absence of a model_calls row for this request, never by this message.
  if (candidates.length === 0) {
    return {
      ok: false,
      stage: "empty",
      failureReason: "Nothing in the catalogue matched, or nothing that matched was well enough known to write about.",
      query,
      recording: await record({ ...base, outcome: "empty" }),
    };
  }

  // --- step 3 ----------------------------------------------------------------
  const result = await shortlist({
    candidates,
    request: { categorySlug, platformSlugs, machineSlugs, specific, tagSlugs },
    budget,
  });

  if (!result.ok) {
    const reason = result.problems ? result.problems.join(" | ") : result.failure_reason;
    return {
      ok: false,
      stage: result.stage,
      problems: result.problems ?? null,
      failureReason: reason,
      query,
      budget: { used: budget.used, max: budget.max },
      recording: await record({
        ...base, outcome: "failed", failure_stage: result.stage, failure_reason: reason,
      }),
    };
  }

  // The catalogue's own description of each chosen game. One request per pick,
  // made only after the shortlist has passed every gate — never for the whole
  // candidate set, which would be twenty-four requests of a monthly twenty
  // thousand for twenty-one descriptions nobody reads.
  //
  // In parallel, and each one already swallows its own failure. A shortlist that
  // has passed nine gates must not be lost because a description did not load;
  // the card simply has no synopsis, and `synopsesMissing` says how many.
  const descriptions = await Promise.all(result.picks.map(p => fetchDescription(p.id)));
  const picksWithDetail = result.picks.map((p, i) => ({ ...p, synopsis: descriptions[i] }));

  // Stored as shown. Criterion 15 ties a click to the text that persuaded, so
  // the case cannot be regenerated later and treated as the same thing.
  // The synopsis is the catalogue's and can be refetched, so it is not stored.
  const picks = picksWithDetail.map(p => ({
    id: p.id, title: p.title, angle: p.angle, angleLabel: p.angleLabel,
    angleReason: p.angleReason, case: p.case,
  }));

  const recording = await record({ ...base, outcome: "shortlisted", picks });

  return {
    ok: true,
    requestId: recording.id ?? null,
    picks: picksWithDetail,
    synopsesMissing: descriptions.filter(d => d === null).length,
    query,
    budget: { used: budget.used, max: budget.max },
    usage: result.usage,
    prompt: result.prompt,
    recording,
  };
}
