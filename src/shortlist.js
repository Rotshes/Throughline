/**
 * Step 3. One model call: candidate set in, three picks out.
 *
 * Everything the model returns is checked here. The division the specification
 * asks for is that the model writes the argument and code decides what it is
 * permitted to argue about, so nothing in this file trusts the response for a
 * fact the catalogue already holds.
 *
 * The gates, in the order they run and with the criterion each serves:
 *
 *   parse            valid JSON, fences tolerated              12
 *   schema           three entries, each id/angle/case          —
 *   inSet            every id was in the set we sent            2   ← the spine
 *   distinct         no id twice                                5
 *   platform         on a platform the user selected            3
 *   category         carries the category the user selected     4
 *   tag              catalogue says it carries a chosen tag     4a
 *   angleKnown       angle is in data/angles.json, once each    6
 *   angleFits        constrained angles supported by the data   6
 *
 * `inSet` is the one the design rests on. A model answering from memory will
 * name a game that is not on the platform in question and nothing catches it;
 * here an id that did not come from the candidate set is a failure, not an
 * interesting suggestion.
 */

import { config } from "./config.js";
import { loadPrompt } from "./prompt.js";
import { callModel } from "./openrouter.js";
import { logCall } from "./callLog.js";
import { readData } from "./paths.js";
import { validateShortlistShape, errorsToText, parseJsonStrict } from "./validate.js";

const PROMPT_PATH = "prompts/shortlist.md";

/** The angle vocabulary, and which angles code can check. Criterion 6. */
export function loadAngles() {
  return JSON.parse(readData("data/angles.json")).angles;
}

/**
 * Does the catalogue's own data support this angle for this candidate?
 *
 * Only some angles can be checked. `safe-pick` and `deep-cut` are judgements
 * with nothing to test against; `with-someone`, `hard-one` and `short-one` name
 * conditions the catalogue can answer. Which is which lives in data/angles.json
 * rather than here, so adding an angle is one file rather than two.
 *
 * Inherits pitfall 18 knowingly. Tags fail in both directions, so a genuinely
 * co-operative game RAWG has not tagged will be rejected — the same defect that
 * leaves Hades untagged for difficulty. Every rejection is reported with its
 * reason so the false-rejection rate can be measured rather than assumed.
 */
export function angleFits(angleDef, candidate) {
  const c = angleDef?.constraint;
  if (!c) return { ok: true };

  if (c.kind === "anyTag") {
    const has = (candidate.tags || []).some(t => c.tags.includes(t));
    return has
      ? { ok: true }
      : { ok: false, reason: `"${angleDef.label}" needs one of [${c.tags.join(", ")}]; the catalogue lists [${(candidate.tags || []).join(", ") || "none"}]` };
  }

  if (c.kind === "maxPlaytime") {
    const p = candidate.playtime ?? 0;
    // A playtime of 0 means the catalogue does not know, not that the game is
    // instant. An unknown length is not evidence of a short game, so it fails.
    if (p === 0) {
      return { ok: false, reason: `"${angleDef.label}" needs a recorded playtime; the catalogue has none for this game` };
    }
    return p <= c.hours
      ? { ok: true }
      : { ok: false, reason: `"${angleDef.label}" needs ${c.hours}h or less; the catalogue says ${p}h` };
  }

  // An unknown constraint kind must never silently pass. A gate that does
  // nothing is worse than no gate, because it is trusted.
  return { ok: false, reason: `unknown constraint kind "${c.kind}" on angle "${angleDef.id}"` };
}

/**
 * Why this game got this angle, written from the catalogue rather than asked of
 * the model.
 *
 * Five of the six angles rest on something already on the candidate record: how
 * many people rated it, what the catalogue tags it, how long it takes, how much
 * of the request it matched. Asking the model to justify a label it has just
 * applied would spend tokens to produce a sentence nothing can check, and it is
 * the model reviewing its own choice — which agents do badly, because they
 * defend themselves.
 *
 * `beautiful-one` returns null. Nothing on a catalogue record says a game is
 * beautiful, and inventing a number to stand in for that would be worse than
 * leaving the line off.
 *
 * Pure. `siblings` is the rest of the shortlist, needed only so the deep cut can
 * say what it is a deep cut relative to.
 */
export function explainAngle(pick, candidate, siblings, request) {
  const n = x => Number(x ?? 0).toLocaleString("en-GB");

  switch (pick.angle) {
    case "safe-pick": {
      const wanted = request?.tagSlugs ?? [];
      const matched = wanted.filter(t => (candidate.tags || []).includes(t));
      if (wanted.length && matched.length === wanted.length) {
        return `Matches everything you asked for — ${matched.join(" and ")}.`;
      }
      if (candidate.metacritic) {
        return `The best reviewed of the three, at ${candidate.metacritic} on Metacritic.`;
      }
      return `The most rated of the three, by ${n(candidate.ratingCount)} people.`;
    }

    case "deep-cut": {
      const best = siblings.reduce(
        (a, b) => ((b.ratingCount ?? 0) > (a.ratingCount ?? 0) ? b : a),
        siblings[0] ?? candidate
      );
      if (best && best.id !== candidate.id && best.ratingCount > candidate.ratingCount) {
        return `${n(candidate.ratingCount)} ratings, against ${n(best.ratingCount)} for ${best.title}.`;
      }
      return `Only ${n(candidate.ratingCount)} people have rated it.`;
    }

    case "hard-one": {
      const marks = (candidate.tags || []).filter(t => ["difficult", "souls-like"].includes(t));
      return marks.length
        ? `The catalogue tags it ${marks.join(" and ")}.`
        : null;
    }

    case "short-one":
      return candidate.playtime
        ? `About ${candidate.playtime} hours, going by the catalogue.`
        : null;

    case "with-someone": {
      const how = (candidate.tags || []).filter(t =>
        ["co-op", "local-co-op", "online-co-op", "multiplayer", "split-screen", "local-multiplayer", "pvp"].includes(t)
      );
      return how.length ? `Tagged ${how.join(", ")}.` : null;
    }

    // beautiful-one, and anything added later without a fact behind it.
    default:
      return null;
  }
}

/**
 * Every gate that needs the candidate set or the request. Pure — no network, no
 * model, no key — so the whole of the checking can be exercised offline.
 *
 * Returns every problem found rather than the first. One malformed response
 * should produce one readable account of what was wrong with it.
 */
export function checkShortlist(picks, candidates, request, angleDefs) {
  const problems = [];
  const byId = new Map(candidates.map(c => [c.id, c]));
  const angleById = new Map(angleDefs.map(a => [a.id, a]));
  const expected = Math.min(3, candidates.length);

  // Criterion 5. Fewer than three only when the set held fewer; never padded,
  // and never more than was asked for.
  if (picks.length !== expected) {
    problems.push(`Returned ${picks.length} picks; ${expected} expected for a candidate set of ${candidates.length}.`);
  }

  const seenIds = new Set();
  const seenAngles = new Set();

  for (const pick of picks) {
    const candidate = byId.get(pick.id);

    // Criterion 2. Everything below depends on the candidate existing, so this
    // is the one failure that stops the rest of the checks for this pick.
    if (!candidate) {
      problems.push(`Pick id ${pick.id} was not in the candidate set. The model may only choose from the set it was given.`);
      continue;
    }

    if (seenIds.has(pick.id)) {
      problems.push(`"${candidate.title}" appears twice.`);
    }
    seenIds.add(pick.id);

    // Criterion 3. Against catalogue data, never against a claim in the case.
    //
    // Checked at whichever granularity was asked for. Someone who selected a
    // PS5 is not served by a game that is "on PlayStation" — that is what the
    // whole specific-machine option exists to fix, so the check has to follow
    // it or the feature is decorative.
    const wantedPlatforms = request.specific ? request.machineSlugs : request.platformSlugs;
    if (wantedPlatforms?.length) {
      const held = request.specific ? candidate.machines : candidate.platforms;
      const onPlatform = (held || []).some(p => wantedPlatforms.includes(p));
      if (!onPlatform) {
        problems.push(`"${candidate.title}" is on [${(held || []).join(", ")}], none of the selected [${wantedPlatforms.join(", ")}].`);
      }
    }

    // Criterion 4.
    if (request.categorySlug && !(candidate.categories || []).includes(request.categorySlug)) {
      problems.push(`"${candidate.title}" is not classified as ${request.categorySlug}; the catalogue says [${(candidate.categories || []).join(", ")}].`);
    }

    // Criterion 4a. Note the wording: the catalogue says it carries the tag.
    // Not that the game is like that — see pitfall 18.
    if (request.tagSlugs?.length) {
      const carries = request.tagSlugs.some(t => (candidate.tags || []).includes(t));
      if (!carries) {
        problems.push(`The catalogue does not list "${candidate.title}" under any of [${request.tagSlugs.join(", ")}].`);
      }
    }

    // Criterion 6, first half: the label exists and is used once.
    const angleDef = angleById.get(pick.angle);
    if (!angleDef) {
      problems.push(`"${pick.angle}" is not an angle in the vocabulary.`);
      continue;
    }
    if (seenAngles.has(pick.angle)) {
      problems.push(`The angle "${angleDef.label}" is used more than once.`);
    }
    seenAngles.add(pick.angle);

    // Criterion 6, second half: the label is supported by the data.
    const fits = angleFits(angleDef, candidate);
    if (!fits.ok) {
      problems.push(`"${candidate.title}" — ${fits.reason}`);
    }

    // --- tag notes ---------------------------------------------------------
    // What keeps these an elaboration rather than a new claim: the tag is the
    // catalogue's and has already been checked, and the model may only write a
    // sentence about one this game is actually listed under. A note for a tag
    // the candidate does not carry is the model inventing a property, which is
    // precisely what the rest of this function exists to stop.
    const wantedTags = request.tagSlugs ?? [];
    const carried = wantedTags.filter(t => (candidate.tags || []).includes(t));
    const notes = pick.tagNotes ?? [];

    const seenNotes = new Set();
    for (const note of notes) {
      if (!wantedTags.includes(note.tag)) {
        problems.push(`"${candidate.title}" explains "${note.tag}", which was not asked for.`);
        continue;
      }
      if (!(candidate.tags || []).includes(note.tag)) {
        problems.push(`"${candidate.title}" explains "${note.tag}", which the catalogue does not list it under.`);
        continue;
      }
      if (seenNotes.has(note.tag)) {
        problems.push(`"${candidate.title}" explains "${note.tag}" more than once.`);
      }
      seenNotes.add(note.tag);
    }

    // A gate that can fail in the other direction too: silently dropping the
    // notes would leave the feature quietly not happening, which looks exactly
    // like a candidate that happened to carry nothing.
    if (carried.length > 0 && notes.length === 0) {
      problems.push(
        `"${candidate.title}" carries [${carried.join(", ")}] but explains none of them.`
      );
    }
  }

  return { ok: problems.length === 0, problems };
}

/**
 * How a candidate is presented to the model.
 *
 * No description: the catalogue's list endpoint has none, and fetching one per
 * candidate would cost twenty-four requests of a monthly twenty thousand. So the
 * case is written from the model's own knowledge of the title, which is pitfall
 * 1 at its sharpest and why `MIN_RATINGS` exists.
 *
 * Everything here is a fact the catalogue holds. The model is never asked for
 * any of it back — the pick is an id, and the id is the join.
 */
export function formatCandidate(c, tagSlugs = []) {
  const matched = tagSlugs.filter(t => (c.tags || []).includes(t));
  const lines = [
    `id: ${c.id}`,
    `title: ${c.title}`,
    `released: ${c.released ?? "unknown"}`,
    `categories: ${(c.categories || []).join(", ") || "none"}`,
    `tags: ${(c.tags || []).join(", ") || "none"}`,
  ];
  if (tagSlugs.length) {
    lines.push(`matches what they asked for: ${matched.length ? matched.join(", ") : "none of it"}`);
  }
  lines.push(`typical playtime: ${c.playtime ? `${c.playtime} hours` : "not recorded"}`);
  lines.push(`metacritic: ${c.metacritic ?? "none"}   ratings: ${c.ratingCount}`);
  return lines.join("\n");
}

/** A sentence describing the request, for the prompt. */
export function describeRequest({
  categorySlug, platformSlugs = [], machineSlugs = [], selectionSlugs,
  specific = false, tagSlugs = [],
}) {
  // What was ticked, not what it resolved to. "on playstation5 or playstation4
  // or playstation3 or playstation2 or playstation or ps-vita or psp" is a
  // worse description of a request than "on playstation".
  const where = selectionSlugs ?? (specific ? machineSlugs : platformSlugs);
  const parts = [categorySlug ? `${categorySlug} games` : "games of any kind"];
  if (where.length) parts.push(`on ${where.join(" or ")}`);
  if (tagSlugs.length) parts.push(`that are ${tagSlugs.join(" and ")}`);
  return parts.join(" ");
}

/**
 * Step 3, end to end.
 *
 * One retry on a malformed or failing response, then the failure is reported as
 * a failure. Never a partial shortlist — criterion 12.
 *
 * A candidate set of zero returns without calling. Reference case 4 checks that
 * by the absence of a logged call, not by reading the screen: a result that
 * looks right while the thing being tested never ran is how this project's gates
 * have failed twice before.
 */
export async function shortlist({ candidates, request, budget }) {
  if (!Array.isArray(candidates) || candidates.length === 0) {
    return {
      ok: false,
      stage: "empty",
      // Deliberately says the set was empty rather than that the filters matched
      // nothing. They are different: the catalogue may hold thirteen games for a
      // filter and have none of them survive MIN_RATINGS. The caller knows which
      // and says so; a message that guesses would be one more count that lies.
      failure_reason: "The candidate set was empty. No model call was made.",
      calls: 0,
    };
  }

  const angleDefs = loadAngles();
  const promptFile = loadPrompt(PROMPT_PATH);
  const expected = Math.min(3, candidates.length);

  const candidateBlock = candidates
    .map(c => formatCandidate(c, request.tagSlugs))
    .join("\n\n");

  let prompt = promptFile.text
    .replace("{{REQUEST}}", describeRequest(request))
    .replace("{{CANDIDATES}}", candidateBlock);

  if (expected < 3) {
    prompt += `\n\nThis candidate list holds only ${candidates.length}. Return ${expected}, not three.`;
  }

  const provenance = {
    prompt_file: promptFile.file,
    prompt_version: promptFile.version,
    prompt_sha256: promptFile.sha256,
  };

  const maxAttempts = Math.min(2, config.maxCallsPerRequest);
  let last = null;
  let calls = 0;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (budget && !budget.spend()) {
      return { ok: false, stage: "budget", calls,
               failure_reason: `Model-call cap of ${budget.max} reached. Aborting.` };
    }

    const result = await callModel({ prompt });
    calls++;

    if (!result.ok) {
      logCall({ call: "shortlist", model: result.model, latency_ms: result.latency_ms,
                ...provenance, success: false, failure_reason: result.failure_reason, attempt });
      last = { ok: false, stage: "call", failure_reason: result.failure_reason, calls };
      continue;
    }

    const base = {
      call: "shortlist", model: result.model, ...provenance,
      tokens_in: result.tokens_in, tokens_out: result.tokens_out,
      cost_usd: result.cost_usd, latency_ms: result.latency_ms, attempt,
    };

    const parsed = parseJsonStrict(result.text);
    if (!parsed.ok) {
      logCall({ ...base, success: false, failure_reason: parsed.reason });
      last = { ok: false, stage: "parse", failure_reason: parsed.reason, raw: result.text, calls };
      continue;
    }

    if (!validateShortlistShape(parsed.value)) {
      const reason = errorsToText(validateShortlistShape);
      logCall({ ...base, success: false, failure_reason: `schema: ${reason}` });
      last = { ok: false, stage: "schema", failure_reason: reason, raw: parsed.value, calls };
      continue;
    }

    const checked = checkShortlist(parsed.value.picks, candidates, request, angleDefs);
    if (!checked.ok) {
      // A gate failure is a failed call. Unlike the motif design — where the
      // evidence rule was about content quality and was logged separately — every
      // check here is about whether the response is usable at all, so a response
      // that fails one is not a success with a caveat.
      logCall({ ...base, success: false, failure_reason: `gate: ${checked.problems.join(" | ")}` });
      last = { ok: false, stage: "gate", problems: checked.problems, raw: parsed.value, calls };
      continue;
    }

    logCall({ ...base, success: true });

    // Join each pick back to its catalogue record. The model returned an id, a
    // label and an argument; everything shown to a person — title, images,
    // platforms — comes from the catalogue.
    const byId = new Map(candidates.map(c => [c.id, c]));
    const angleById = new Map(angleDefs.map(a => [a.id, a]));
    const chosen = parsed.value.picks.map(p => byId.get(p.id));

    return {
      ok: true,
      calls,
      picks: parsed.value.picks.map(p => {
        const candidate = byId.get(p.id);
        return {
          ...candidate,
          angle: p.angle,
          angleLabel: angleById.get(p.angle).label,
          // Written by code from the catalogue, never asked of the model.
          angleReason: explainAngle(p, candidate, chosen, request),
          case: p.case,
          // Checked above: every tag here was asked for and is one the
          // catalogue lists this game under.
          tagNotes: p.tagNotes ?? [],
        };
      }),
      usage: { tokens_in: result.tokens_in, tokens_out: result.tokens_out,
               cost_usd: result.cost_usd, latency_ms: result.latency_ms, attempts: attempt },
      prompt: promptFile,
    };
  }

  return last ?? { ok: false, stage: "call", failure_reason: "no attempts made", calls };
}
