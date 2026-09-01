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

const games = ["Animal Crossing", "Stardew Valley"];

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
