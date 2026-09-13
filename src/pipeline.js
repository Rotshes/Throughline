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

// Whichever catalogue is active. src/source.js is the switch and the only place
// either module is named — see decision 0006.
import { assembleCandidates, fetchDescription, countFor } from "./source.js";
import { shortlist } from "./shortlist.js";
import { createBudget } from "./budget.js";
import { takeCalls } from "./callLog.js";
import { saveRequest, saveCalls, storeConfigured, recentPickIds } from "./store.js";
import { libraryIds } from "./library.js";
import { config } from "./config.js";

/**
 * What goes in the record when no category was chosen.
 *
 * `requests.category` is `not null`, and a sentinel avoids a second migration
 * for a column that is otherwise fine. It is unambiguous — no catalogue this
 * project has used has a genre called "any" — but it is a sentinel, which is
 * worth knowing rather than
 * discovering. If the column is ever altered, this becomes null.
 */
const ANY_CATEGORY = "any";

/**
 * Why is this pool so small?
 *
 * Runs only when a result comes back thin, and asks the catalogue the same
 * question again with one filter removed at a time. One or two extra requests,
 * on the path where something already went wrong, and none at all when things
 * are working.
 *
 * This exists because the app's advice was wrong. A request for split-screen
 * GameCube games returned one, and the page suggested widening to the whole
 * Nintendo family — when the catalogue holds 662 GameCube games and exactly six
 * carry the split-screen tag. Mario Kart: Double Dash is tagged "singleplayer,
 * multiplayer" and nothing else. The console was never the problem.
 *
 * Guessing which filter emptied a pool produces advice that sounds confident
 * and sends people the wrong way. Two numbers settle it.
 *
 * Never throws. A diagnosis is a courtesy and must not cost anybody a result.
 */
async function diagnoseThin({ categorySlug, machineSlugs, tagSlugs, withFilters }) {
  const out = { withFilters };
  try {
    // The unfiltered baseline too, now. The catalogue no longer returns a total
    // with each page — IGDB has a separate /count endpoint — so the number the
    // interface quotes as "the catalogue holds N for this combination" has to be
    // asked for rather than read off the response that came back thin.
    if (out.withFilters == null) {
      out.withFilters = await countFor({ categorySlug, machineSlugs, tagSlugs });
    }
    if (tagSlugs.length) {
      out.withoutTags = await countFor({ categorySlug, machineSlugs, tagSlugs: [] });
    }
    if (categorySlug) {
      out.withoutCategory = await countFor({ categorySlug: null, machineSlugs, tagSlugs });
    }
  } catch {
    // A catalogue failure here means no explanation, not a failed request.
  }
  return out;
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
    selectionSlugs, specific = false, tagSlugs = [], playedIds = [],
  } = request;

  // What was ticked, as opposed to what it resolved to. The record and the
  // prompt want the first; the gate wants the second.
  const asked = selectionSlugs ?? (specific ? machineSlugs : platformSlugs);

  const budget = createBudget(config.maxCallsPerRequest);

  // --- criterion 8 -----------------------------------------------------------
  // Anything in the library is never recommended again, whatever state it is
  // in. The status matters to the person reading their list and not to this:
  // asking only whether an id is present means a new status can be added
  // without anything here changing.
  //
  // A failure to read the library is reported, not thrown. Losing a shortlist
  // because the exclusion could not run would be worse than running without it
  // — but a silent failure would make criterion 8 a fiction, so it comes back
  // in the response.
  const library = await libraryIds();
  const excludeIds = [...new Set([...playedIds, ...library.ids])];

  // --- steps 1 and 2 ---------------------------------------------------------
  // A catalogue failure is not a model failure and must not read as one.
  // Criterion 13: with two external services, a user who cannot say which broke
  // cannot report anything useful.
  let assembled;
  try {
    assembled = await assembleCandidates({
      categorySlug, machineSlugs, tagSlugs,
      playedIds: excludeIds,
      // Carried so the exclusion can refuse to run against ids from another
      // catalogue rather than silently matching none of them. A criterion that
      // cannot be checked has to say so — see db/migration-004-library-source.sql.
      libraryEntries: library.entries ?? null,
    });
  } catch (e) {
    const failure = {
      category: categorySlug ?? ANY_CATEGORY, platforms: asked, tags: tagSlugs,
      candidate_ids: [], candidate_count: 0, catalogue_count: null,
      outcome: "failed",
      failure_stage:
        e.kind === "catalogue" ? "catalogue"
        : e.kind === "library-source" ? "library-source"
        : "unexpected",
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

  // Only when something is wrong. A healthy pool costs no extra requests.
  const diagnosis = candidates.length < 3
    ? await diagnoseThin({
        categorySlug, machineSlugs, tagSlugs,
        withFilters: query.catalogueCount ?? null,
      })
    : null;

  const base = {
    category: categorySlug ?? ANY_CATEGORY,
    // What was ticked. A shortlist judged later needs to know what was asked
    // for; "playstation" and "playstation5" are very different requests, and
    // the resolved list would record the first as the second.
    platforms: asked,
    tags: tagSlugs,
    candidate_ids: candidates.map(c => c.id),
    candidate_count: candidates.length,
    // Null unless the result was thin enough for diagnoseThin to go and ask.
    // IGDB's list endpoint carries no total, and spending a request on every
    // healthy shortlist to record a number nobody reads is not worth it.
    catalogue_count: query.catalogueCount ?? diagnosis?.withFilters ?? null,
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
      diagnosis,
      recording: await record({ ...base, outcome: "empty" }),
    };
  }

  // --- variety, and why it is soft -------------------------------------------
  // Games shown in the last few shortlists step aside, so running the same
  // search twice does not hand back the same three.
  //
  // Applied only when the pool can spare them. Criterion 5 forbids padding a
  // thin result, and it would be absurd to manufacture one: a filter with four
  // candidates should keep returning those four rather than run out because
  // they were shown a minute ago. Freshness is a preference and never costs an
  // answer.
  //
  // Note what this deliberately does not do. Sampling deeper into the catalogue
  // would give more variety and would drag in games below MIN_RATINGS, which
  // the model cannot write about truthfully — trading a visible repetition for
  // an invisible fabrication. This trades nothing.
  const recent = await recentPickIds();
  const fresher = recent.length
    ? candidates.filter(c => !recent.includes(c.id))
    : candidates;
  const pool = fresher.length >= Math.min(3, candidates.length) ? fresher : candidates;
  const repeatsAvoided = candidates.length - pool.length;

  // --- step 3 ----------------------------------------------------------------
  const result = await shortlist({
    candidates: pool,
    // machineSlugs is the resolved set the query used — the gate has to accept
    // exactly what was asked for. selectionSlugs is what the person ticked, and
    // is only used to describe the request in the prompt.
    request: { categorySlug, platformSlugs, machineSlugs, selectionSlugs: asked, specific, tagSlugs },
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
      diagnosis,
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
  const descriptions = await Promise.all(result.picks.map(p => fetchDescription(p.id, p)));
  const picksWithDetail = result.picks.map((p, i) => ({ ...p, synopsis: descriptions[i] }));

  // Stored as shown. Criterion 15 ties a click to the text that persuaded, so
  // the case cannot be regenerated later and treated as the same thing.
  // The synopsis is the catalogue's and can be refetched, so it is not stored.
  const picks = picksWithDetail.map(p => ({
    id: p.id, title: p.title, angle: p.angle, angleLabel: p.angleLabel,
    angleReason: p.angleReason, case: p.case, tagNotes: p.tagNotes ?? [],
  }));

  const recording = await record({ ...base, outcome: "shortlisted", picks });

  return {
    ok: true,
    requestId: recording.id ?? null,
    // Criterion 8, reported rather than assumed. `excluded` is how many the
    // library kept out; `libraryError` is set when the exclusion could not run
    // at all, which is the case where the criterion silently does not hold.
    excluded: library.ids.length,
    libraryError: library.ok ? null : library.reason,
    // How many recently-shown games stepped aside for this one. Zero when the
    // pool was too thin to spare any — see the note above step 3.
    repeatsAvoided,
    picks: picksWithDetail,
    diagnosis,
    synopsesMissing: descriptions.filter(d => d === null).length,
    query,
    budget: { used: budget.used, max: budget.max },
    usage: result.usage,
    prompt: result.prompt,
    recording,
  };
}
