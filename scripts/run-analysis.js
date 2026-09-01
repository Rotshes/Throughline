#!/usr/bin/env node
/**
 * Turn 1, step 3. Stage 1 path A only. No interface, no candidates, no matching.
 *
 *   npm run analyse -- "Animal Crossing" "Stardew Valley"
 *
 * The point of this step is to find out whether the motifs are any good before
 * anything is built on top of them.
 */
import { analysePlayedGames } from "../src/analysis.js";

const games = process.argv.slice(2);

if (games.length === 0) {
  console.error('Usage: npm run analyse -- "Game One" "Game Two"');
  process.exit(2);
}

console.log(`\nGames: ${games.join(", ")}\n`);

const result = await analysePlayedGames(games);

if (!result.ok) {
  console.log(`FAILED at "${result.stage}": ${result.failure_reason}`);
  if (result.raw) console.log("\nWhat came back:\n" + JSON.stringify(result.raw, null, 2).slice(0, 2000));
  process.exit(1);
}

const { motifs, evidenceCheck, usage } = result;

if (motifs.length === 0) {
  console.log("Zero motifs — the model found nothing these games share.");
  console.log("That is a valid answer. Whether it is the RIGHT answer is for you to judge.\n");
} else {
  for (const m of motifs) {
    console.log(`■ ${m.name}`);
    console.log(`  ${m.description}`);
    for (const e of m.evidence) console.log(`    · ${e.source}: ${e.detail}`);
    console.log("");
  }
}

if (evidenceCheck.ok) {
  console.log("Evidence check (criterion 3): passed");
} else {
  console.log("Evidence check (criterion 3): FAILED");
  for (const p of evidenceCheck.problems) console.log(`  - ${p}`);
  console.log("\nThe schema accepted this but the code did not. Fix prompts/analysis.md, not this check.");
}

console.log(
  `\nCall: ${usage.tokens_in ?? "?"} in / ${usage.tokens_out ?? "?"} out · ` +
  `${usage.cost_usd != null ? "$" + usage.cost_usd.toFixed(6) : "cost not reported"} · ` +
  `${usage.latency_ms}ms · attempt ${usage.attempts}`
);
console.log("Logged to logs/model-calls.jsonl\n");
