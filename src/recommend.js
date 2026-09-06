import { config } from "./config.js";
import { createBudget } from "./budget.js";
import { analysePlayedGames } from "./analysis.js";
import { match, loadCandidates, excludePlayed } from "./matching.js";
import { takeCalls } from "./callLog.js";
import { saveSession, saveCalls, storeConfigured } from "./store.js";

/**
 * The whole path A pipeline: played games in, one recommendation or an honest
 * decline out.
 *
 * The two stages share one call budget so the cap in criterion 11 applies to the
 * request rather than to each stage separately.
 *
 * Stage 1 is called without the candidate set in scope. It is loaded only after
 * the motifs come back — not for efficiency, but because it makes the rule the
 * design rests on visible in the code rather than merely intended.
 */
export async function recommendFromGames(games) {
  const budget = createBudget(config.maxCallsPerRequest);

  const analysis = await analysePlayedGames(games, budget);
  if (!analysis.ok) return { ok: false, phase: "analysis", ...analysis, budget };

  if (analysis.motifs.length === 0) {
    // Criterion 5. No recommendation is made. The user is sent to the preference
    // questions instead — that path is not built yet, so this reports the state
    // rather than pretending to handle it.
    return { ok: false, phase: "analysis", stage: "zero-motifs",
             failure_reason: "No shared motifs found. The preference questions (path B) are not built yet.",
             analysis, budget };
  }

  const candidates = excludePlayed(loadCandidates(), games);

  if (candidates.length === 0) {
    return { ok: false, phase: "matching", stage: "candidates",
             failure_reason: "Every candidate was one of the games you named.",
             analysis, budget };
  }

  const matched = await match(analysis.motifs, candidates, budget);
  if (!matched.ok) return { ok: false, phase: "matching", ...matched, analysis, budget };

  return { ok: true, analysis, matching: matched, candidates: candidates.length,
           excluded: loadCandidates().length - candidates.length, budget };
}


/**
 * The pipeline plus durable recording. Used by the deployed function; the CLI
 * scripts call recommendFromGames directly and keep the file log.
 *
 * Recording failures are reported, never thrown. A user waiting on a
 * recommendation should not lose it because a database insert failed — but a
 * silent recording failure would make criterion 10 a fiction, so it comes back
 * in the result.
 */
export async function recommendAndRecord(games) {
  const result = await recommendFromGames(games);

  const session = {
    path: "A",
    input_games: games,
    motifs: result.analysis?.motifs ?? null,
    outcome: result.ok ? result.matching.recommendation.outcome : "failed",
    failure_stage: result.ok ? null : `${result.phase ?? "?"}/${result.stage ?? "?"}`,
    failure_reason: result.ok ? null : (result.failure_reason ?? null),
    recommendation: result.ok ? result.matching.recommendation : null,
  };

  const calls = takeCalls();
  let sessionId = null;
  let recording = { ok: true, skipped: !storeConfigured() };

  if (storeConfigured()) {
    const saved = await saveSession(session);
    if (saved.ok) {
      sessionId = saved.id;
      const savedCalls = await saveCalls(sessionId, calls);
      if (!savedCalls.ok) recording = savedCalls;
    } else {
      recording = saved;
    }
  }

  return { ...result, sessionId, recording, callCount: calls.length };
}
