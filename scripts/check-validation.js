#!/usr/bin/env node
/**
 * Offline checks. No model, no key, no cost.
 *
 * These exercise the gates with responses a model plausibly produces, including
 * ones it should reject. A gate that has never rejected anything is not a gate.
 */
import {
  validateMotifsShape, checkGameCount, checkPathAEvidence, parseJsonStrict,
} from "../src/validate.js";
import { checkRecommendation } from "../src/validate.js";
import { loadPrompt } from "../src/prompt.js";
import { createBudget } from "../src/budget.js";
import { loadCandidates } from "../src/matching.js";

const games = ["Animal Crossing", "Stardew Valley"];

const TITLES = ["Hollow Knight", "Planet Coaster", "Celeste"];
const MOTIF_NAMES = ["Interconnected exploration", "Ability-gated progress"];
const REC = {
  outcome: "recommended",
  title: "Hollow Knight",
  rationale: "The feel line describes a map that folds back on itself, which is what both motifs point at.",
  satisfies: ["Interconnected exploration"],
};

const good = {
  name: "Work that cannot be failed",
  description: "Tasks arrive at a pace the player sets, and nothing punishes them for ignoring one.",
  evidence: [
    { source: "Animal Crossing", detail: "weeds grow if you skip days but nothing is lost permanently" },
    { source: "Stardew Valley", detail: "an unwatered crop dies and the day simply continues" },
  ],
};

const cases = [
  ["count: two games accepted", () => checkGameCount(games).ok, true],
  ["count: one game rejected", () => checkGameCount(["Super Metroid"]).ok, false],
  ["count: six games rejected", () => checkGameCount(new Array(6).fill("x")).ok, false],

  ["shape: zero motifs accepted", () => validateMotifsShape({ motifs: [] }), true],
  ["shape: valid motif accepted", () => validateMotifsShape({ motifs: [good] }), true],
  ["shape: five motifs rejected", () => validateMotifsShape({ motifs: new Array(5).fill(good) }), false],
  ["shape: motif with no evidence rejected",
    () => validateMotifsShape({ motifs: [{ ...good, evidence: [] }] }), false],
  ["shape: invented extra field rejected",
    () => validateMotifsShape({ motifs: [], confidence: 0.9 }), false],

  ["evidence: two distinct sources accepted",
    () => checkPathAEvidence([good], games).ok, true],
  ["evidence: only one distinct game cited rejected",
    () => checkPathAEvidence([{ ...good, evidence: [good.evidence[0]] }], games).ok, false],
  ["evidence: game not in the input rejected",
    () => checkPathAEvidence([{ ...good, evidence: [good.evidence[0], { source: "Terraria", detail: "mining at your own pace all night" }] }], games).ok, false],
  ["evidence: detail restating the motif name rejected",
    () => checkPathAEvidence([{ ...good, evidence: [
      { source: "Animal Crossing", detail: "it is work that cannot be failed" },
      { source: "Stardew Valley", detail: "an unwatered crop dies and the day continues" }] }], games).ok, false],
  ["evidence: case and spacing differences still match the input",
    () => checkPathAEvidence([{ ...good, evidence: [
      { source: "  animal crossing ", detail: "weeds grow but nothing is lost permanently" },
      { source: "STARDEW VALLEY", detail: "an unwatered crop dies and the day continues" }] }], games).ok, true],

  ["parse: bare JSON accepted", () => parseJsonStrict('{"motifs":[]}').ok, true],
  ["parse: fenced JSON recovered", () => parseJsonStrict('```json\n{"motifs":[]}\n```').ok, true],
  ["parse: prose rejected", () => parseJsonStrict("Here are the motifs I found:").ok, false],

  ["prompt: analysis.md declares a version",
    () => loadPrompt("prompts/analysis.md").version !== null, true],
  ["prompt: all three prompts declare a version",
    () => ["analysis", "preferences", "matching"]
            .every(n => loadPrompt(`prompts/${n}.md`).version !== null), true],
  ["prompt: hash is stable across loads",
    () => loadPrompt("prompts/analysis.md").sha256 === loadPrompt("prompts/analysis.md").sha256, true],
  ["prompt: the three prompts have different hashes",
    () => new Set(["analysis", "preferences", "matching"]
            .map(n => loadPrompt(`prompts/${n}.md`).sha256)).size === 3, true],

  ["budget: spends up to the cap", () => { const b = createBudget(2); return b.spend() && b.spend(); }, true],
  ["budget: refuses past the cap", () => { const b = createBudget(2); b.spend(); b.spend(); return b.spend(); }, false],

  ["candidates: every entry has a title and a feel line",
    () => loadCandidates().every(c => c.title?.length > 0 && c.feel?.length > 20), true],
  ["candidates: titles are unique",
    () => { const t = loadCandidates().map(c => c.title.toLowerCase());
            return new Set(t).size === t.length; }, true],

  ["rec: valid recommendation accepted",
    () => checkRecommendation(REC, TITLES, MOTIF_NAMES).ok, true],
  ["rec: title not in the candidate set rejected",
    () => checkRecommendation({ ...REC, title: "Skyrim" }, TITLES, MOTIF_NAMES).ok, false],
  ["rec: satisfying a motif stage 1 never produced rejected",
    () => checkRecommendation({ ...REC, satisfies: ["Cosy vibes"] }, TITLES, MOTIF_NAMES).ok, false],
  ["rec: recommendation satisfying nothing rejected",
    () => checkRecommendation({ ...REC, satisfies: [] }, TITLES, MOTIF_NAMES).ok, false],
  ["rec: decline with null title accepted",
    () => checkRecommendation({ outcome: "no_good_fit", title: null, rationale: "x".repeat(50), satisfies: [] }, TITLES, MOTIF_NAMES).ok, true],
  ["rec: decline naming the closest candidate accepted",
    () => checkRecommendation({ outcome: "no_good_fit", title: "Hollow Knight", rationale: "x".repeat(50), satisfies: [] }, TITLES, MOTIF_NAMES).ok, true],
  ["rec: decline that still claims a satisfied motif rejected",
    () => checkRecommendation({ outcome: "no_good_fit", title: null, rationale: "x".repeat(50), satisfies: ["Interconnected exploration"] }, TITLES, MOTIF_NAMES).ok, false],
  ["rec: title matching ignores case and spacing",
    () => checkRecommendation({ ...REC, title: "  hollow knight " }, TITLES, MOTIF_NAMES).ok, true],
];

let failed = 0;
for (const [name, run, expected] of cases) {
  const got = !!run();
  const pass = got === expected;
  if (!pass) failed++;
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}`);
}

console.log(failed === 0
  ? `\nall ${cases.length} checks behaved as expected`
  : `\n${failed} of ${cases.length} FAILED`);
process.exit(failed === 0 ? 0 : 1);
