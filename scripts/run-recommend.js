#!/usr/bin/env node
/**
 * Turn 1, step 4. The full path A pipeline, still with no interface.
 *
 *   node scripts/run-recommend.js "Super Metroid" "Hollow Knight"
 */
import { recommendFromGames } from "../src/recommend.js";

const games = process.argv.slice(2);
if (games.length === 0) {
  console.error('Usage: node scripts/run-recommend.js "Game One" "Game Two"');
  process.exit(2);
}

console.log(`\nGames: ${games.join(", ")}\n`);

const r = await recommendFromGames(games);

if (r.analysis?.ok) {
  console.log("MOTIFS");
  for (const m of r.analysis.motifs) console.log(`  ■ ${m.name}`);
  console.log(`  evidence check: ${r.analysis.evidenceCheck.ok ? "passed" : "FAILED"}`);
  if (!r.analysis.evidenceCheck.ok) {
    for (const p of r.analysis.evidenceCheck.problems) console.log(`    - ${p}`);
  }
  console.log("");
}

if (!r.ok) {
  console.log(`STOPPED in ${r.phase} at "${r.stage}": ${r.failure_reason}`);
  if (r.raw) console.log("\nWhat came back:\n" + JSON.stringify(r.raw, null, 2).slice(0, 1500));
  console.log(`\nCalls used: ${r.budget.used} of ${r.budget.max}\n`);
  process.exit(1);
}

const rec = r.matching.recommendation;

if (rec.outcome === "no_good_fit") {
  console.log(`DECLINED — nothing in the ${r.candidates} candidates fits.`);
  if (rec.title) console.log(`Closest: ${rec.title}`);
} else {
  console.log(`RECOMMENDED: ${rec.title}`);
  console.log(`Satisfies: ${rec.satisfies.join(", ")}`);
}
console.log(`\n${rec.rationale}\n`);

const a = r.analysis.usage, m = r.matching.usage;
const cost = (a.cost_usd ?? 0) + (m.cost_usd ?? 0);
console.log(
  `Calls used: ${r.budget.used} of ${r.budget.max} · ` +
  `${a.latency_ms + m.latency_ms}ms total (${a.latency_ms} + ${m.latency_ms}) · ` +
  `$${cost.toFixed(6)}`
);
console.log(`Prompts: analysis v${r.analysis.prompt.version} · matching v${r.matching.prompt.version}\n`);
