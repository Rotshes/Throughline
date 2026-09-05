import fs from "node:fs";
import { loadPrompt } from "./prompt.js";
import { callModel } from "./openrouter.js";
import { logCall } from "./callLog.js";
import {
  validateRecommendationShape, errorsToText,
  checkRecommendation, parseJsonStrict,
} from "./validate.js";

const PROMPT_PATH = "prompts/matching.md";
const CANDIDATES_PATH = "data/candidates.json";

export function loadCandidates() {
  const raw = JSON.parse(fs.readFileSync(CANDIDATES_PATH, "utf8"));
  return raw.candidates;
}

/**
 * Stage 3. Motifs plus candidates in, one title or an honest decline out.
 *
 * This stage does not know, and must not be told, which path produced the
 * motifs. See CLAUDE.md.
 */
export async function match(motifs, candidates, budget) {
  if (motifs.length === 0) {
    // Criterion 5. Nothing was identified, so there is nothing to match against
    // and no call is worth making.
    return { ok: false, stage: "input", failure_reason: "No motifs to match against." };
  }

  const promptFile = loadPrompt(PROMPT_PATH);
  const prompt = promptFile.text
    .replace("{{CANDIDATES}}", candidates.map(c => `- ${c.title}: ${c.feel}`).join("\n"))
    .replace("{{MOTIFS}}", motifs.map(m => `- ${m.name}: ${m.description}`).join("\n"));

  const provenance = {
    prompt_file: promptFile.file,
    prompt_version: promptFile.version,
    prompt_sha256: promptFile.sha256,
  };

  const titles = candidates.map(c => c.title);
  const names = motifs.map(m => m.name);
  let last = null;

  for (let attempt = 1; attempt <= 2; attempt++) {
    if (!budget.spend()) {
      return { ok: false, stage: "budget",
               failure_reason: `Model-call cap of ${budget.max} reached. Aborting.` };
    }

    const result = await callModel({ prompt });

    if (!result.ok) {
      logCall({ call: "matching", model: result.model, latency_ms: result.latency_ms,
                ...provenance, success: false, failure_reason: result.failure_reason, attempt });
      last = { ok: false, stage: "call", failure_reason: result.failure_reason };
      continue;
    }

    const base = {
      call: "matching", model: result.model, ...provenance,
      tokens_in: result.tokens_in, tokens_out: result.tokens_out,
      cost_usd: result.cost_usd, latency_ms: result.latency_ms, attempt,
    };

    const parsed = parseJsonStrict(result.text);
    if (!parsed.ok) {
      logCall({ ...base, success: false, failure_reason: parsed.reason });
      last = { ok: false, stage: "parse", failure_reason: parsed.reason, raw: result.text };
      continue;
    }

    if (!validateRecommendationShape(parsed.value)) {
      const reason = errorsToText(validateRecommendationShape);
      logCall({ ...base, success: false, failure_reason: `schema: ${reason}` });
      last = { ok: false, stage: "schema", failure_reason: reason, raw: parsed.value };
      continue;
    }

    // Cross-reference checks. Unlike the path A evidence rule, a failure here is
    // not a quality problem — a title that is not in the candidate set is an
    // invented game, and showing it to a user would be the worst thing this
    // system can do. So it fails the attempt and retries, per criterion 7.
    const cross = checkRecommendation(parsed.value, titles, names);
    if (!cross.ok) {
      logCall({ ...base, success: false, failure_reason: `cross-check: ${cross.problems.join("; ")}` });
      last = { ok: false, stage: "cross-check", failure_reason: cross.problems.join("; "),
               raw: parsed.value };
      continue;
    }

    logCall({ ...base, success: true });

    return {
      ok: true,
      recommendation: parsed.value,
      usage: { tokens_in: result.tokens_in, tokens_out: result.tokens_out,
               cost_usd: result.cost_usd, latency_ms: result.latency_ms, attempts: attempt },
      prompt: promptFile,
    };
  }

  return last ?? { ok: false, stage: "call", failure_reason: "no attempts made" };
}
