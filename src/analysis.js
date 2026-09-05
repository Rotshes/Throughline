import { config } from "./config.js";
import { loadPrompt } from "./prompt.js";
import { callModel } from "./openrouter.js";
import { logCall } from "./callLog.js";
import {
  validateMotifsShape, errorsToText,
  checkGameCount, checkPathAEvidence, parseJsonStrict,
} from "./validate.js";

const PROMPT_PATH = "prompts/analysis.md";

/**
 * Stage 1, path A.
 *
 * Given games the user has played, return motifs. This function is never given
 * the candidate set and must not be changed to accept it — see CLAUDE.md.
 *
 * Every outcome is logged, including failures. One retry on a malformed
 * response, then the failure is reported as a failure. Criterion 12.
 */
export async function analysePlayedGames(games, budget) {
  const count = checkGameCount(games);
  if (!count.ok) {
    // Rejected before any call. Nothing was spent, so there is nothing to log.
    return { ok: false, stage: "input", failure_reason: count.reason };
  }

  const promptFile = loadPrompt(PROMPT_PATH);
  const prompt = promptFile.text.replace("{{GAMES}}", games.map(g => `- ${g}`).join("\n"));

  // Recorded on every row so a result can be attributed to the text that made it.
  const provenance = {
    prompt_file: promptFile.file,
    prompt_version: promptFile.version,
    prompt_sha256: promptFile.sha256,
  };

  const maxAttempts = Math.min(2, config.maxCallsPerRequest);
  let last = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (budget && !budget.spend()) {
      return { ok: false, stage: "budget",
               failure_reason: `Model-call cap of ${budget.max} reached. Aborting.` };
    }

    const result = await callModel({ prompt });

    if (!result.ok) {
      logCall({ call: "analysis", model: result.model, latency_ms: result.latency_ms,
                ...provenance,
                success: false, failure_reason: result.failure_reason, attempt });
      last = { ok: false, stage: "call", failure_reason: result.failure_reason };
      continue;
    }

    const base = {
      call: "analysis", model: result.model, ...provenance, tokens_in: result.tokens_in,
      tokens_out: result.tokens_out, cost_usd: result.cost_usd,
      latency_ms: result.latency_ms, attempt,
    };

    const parsed = parseJsonStrict(result.text);
    if (!parsed.ok) {
      logCall({ ...base, success: false, failure_reason: parsed.reason });
      last = { ok: false, stage: "parse", failure_reason: parsed.reason, raw: result.text };
      continue;
    }

    if (!validateMotifsShape(parsed.value)) {
      const reason = errorsToText(validateMotifsShape);
      logCall({ ...base, success: false, failure_reason: `schema: ${reason}` });
      last = { ok: false, stage: "schema", failure_reason: reason, raw: parsed.value };
      continue;
    }

    // The call succeeded and the shape is valid. Log it as a success before the
    // path-A rule is applied: that rule is about content quality, not about
    // whether the model call worked, and conflating them makes the log useless
    // for judging reliability.
    logCall({ ...base, success: true });

    const evidence = checkPathAEvidence(parsed.value.motifs, games);
    return {
      ok: true,
      motifs: parsed.value.motifs,
      evidenceCheck: evidence,
      usage: { tokens_in: result.tokens_in, tokens_out: result.tokens_out,
               cost_usd: result.cost_usd, latency_ms: result.latency_ms, attempts: attempt },
      prompt: promptFile,
    };
  }

  return last ?? { ok: false, stage: "call", failure_reason: "no attempts made" };
}
