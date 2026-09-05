import { config } from "./config.js";
import { createBudget } from "./budget.js";
import { analysePlayedGames } from "./analysis.js";
import { match, loadCandidates } from "./matching.js";

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

  const candidates = loadCandidates();
  const matched = await match(analysis.motifs, candidates, budget);
  if (!matched.ok) return { ok: false, phase: "matching", ...matched, analysis, budget };

  return { ok: true, analysis, matching: matched, candidates: candidates.length, budget };
}
