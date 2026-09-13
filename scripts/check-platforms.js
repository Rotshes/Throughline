/**
 * Offline checks for platform resolution. No key, no network, no cost.
 *
 * This file exists because the logic it checks was wrong twice in one evening
 * while it lived inside the Netlify handler, where nothing offline could reach
 * it. Both bugs reached a person through the browser. Neither could have failed
 * a test, because there was no test to fail.
 *
 *   node scripts/check-platforms.js
 */

import { resolvePlatforms } from "../src/platforms.js";

let passed = 0;
const failures = [];

function check(name, fn) {
  try { fn(); passed++; }
  catch (e) { failures.push(`${name}\n    ${e.message}`); }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || "assertion failed"); }

// --- fixture -----------------------------------------------------------------
// A trimmed platform tree. A fixture, never data/platforms.json — pitfall 14.

const TREE = {
  pc: ["pc"],
  nintendo: ["nintendo-switch", "nintendo-3ds", "game-boy-advance", "nes"],
  playstation: ["playstation5", "playstation4", "psp"],
};
const childrenOf = f => TREE[f];

const eq = (a, b) => a.join(",") === b.join(",");

// --- no machines: families as they are ---------------------------------------

check("no machines named means family mode", () => {
  const r = resolvePlatforms({ familySlugs: ["pc", "nintendo"], machineSlugs: [], childrenOf });
  assert(r.specific === false);
  assert(r.machines.length === 0, "family mode sends no machine list");
  assert(eq(r.selection, ["pc", "nintendo"]), `got ${r.selection}`);
});

check("families are deduplicated", () => {
  const r = resolvePlatforms({ familySlugs: ["pc", "pc"], machineSlugs: [], childrenOf });
  assert(eq(r.selection, ["pc"]), `got ${r.selection}`);
});

// --- the bug that returned Breath of the Wild for a Game Boy Advance request --

check("a narrowed family contributes only the machines named", () => {
  // THE SECOND BUG. The interface keeps a family lit while you narrow inside it,
  // so "Nintendo" plus "Game Boy Advance" is a request for a GBA game. Expanding
  // the family to all its children put nintendo-switch in the accepted set, and
  // Breath of the Wild passed a gate that had been told Switch was fine.
  const r = resolvePlatforms({
    familySlugs: ["nintendo"],
    machineSlugs: ["game-boy-advance"],
    childrenOf,
  });
  assert(r.specific === true);
  assert(eq(r.machines, ["game-boy-advance"]), `got ${r.machines}`);
  assert(!r.machines.includes("nintendo-switch"), "the Switch must not be acceptable");
});

check("a narrowed family reads back as the machines, not the family", () => {
  // "Nintendo, Game Boy Advance" describes no request anyone made, and it would
  // reach both the stored record and the prompt.
  const r = resolvePlatforms({
    familySlugs: ["nintendo"],
    machineSlugs: ["game-boy-advance"],
    childrenOf,
  });
  assert(eq(r.selection, ["game-boy-advance"]), `got ${r.selection}`);
});

check("two machines under one family keep both and nothing else", () => {
  const r = resolvePlatforms({
    familySlugs: ["nintendo"],
    machineSlugs: ["nintendo-switch", "nes"],
    childrenOf,
  });
  assert(eq(r.machines, ["nintendo-switch", "nes"]), `got ${r.machines}`);
});

// --- the bug that rejected every possible answer -----------------------------

check("a whole family alongside a narrowed one expands", () => {
  // THE FIRST BUG. Selecting PC and a Game Boy Advance asks the catalogue for
  // PC-or-GBA games. If PC does not expand into the accepted set, every PC game
  // the query legitimately returned is rejected and the request is impossible.
  const r = resolvePlatforms({
    familySlugs: ["pc", "nintendo"],
    machineSlugs: ["game-boy-advance"],
    childrenOf,
  });
  assert(r.machines.includes("pc"), "PC must be acceptable — the query asked for it");
  assert(r.machines.includes("game-boy-advance"));
  assert(!r.machines.includes("nintendo-switch"), "but Nintendo was narrowed");
  assert(eq(r.machines, ["pc", "game-boy-advance"]), `got ${r.machines}`);
});

check("a whole family alongside a narrowed one reads back by name", () => {
  const r = resolvePlatforms({
    familySlugs: ["pc", "nintendo"],
    machineSlugs: ["game-boy-advance"],
    childrenOf,
  });
  assert(eq(r.selection, ["pc", "game-boy-advance"]), `got ${r.selection}`);
});

check("two families both narrowed keep only their own machines", () => {
  const r = resolvePlatforms({
    familySlugs: ["nintendo", "playstation"],
    machineSlugs: ["nintendo-switch", "playstation5"],
    childrenOf,
  });
  assert(eq(r.machines, ["nintendo-switch", "playstation5"]), `got ${r.machines}`);
});

check("a family left whole expands fully when another is narrowed", () => {
  const r = resolvePlatforms({
    familySlugs: ["playstation", "nintendo"],
    machineSlugs: ["nes"],
    childrenOf,
  });
  assert(eq(r.machines, ["playstation5", "playstation4", "psp", "nes"]), `got ${r.machines}`);
  assert(eq(r.selection, ["playstation", "nes"]), `got ${r.selection}`);
});

// --- edges -------------------------------------------------------------------

check("a machine whose family was not selected is honoured, not dropped", () => {
  // Impossible from the interface. Silently discarding part of a request is
  // worse than serving one the form cannot produce.
  const r = resolvePlatforms({
    familySlugs: [],
    machineSlugs: ["playstation5"],
    childrenOf,
  });
  assert(eq(r.machines, ["playstation5"]), `got ${r.machines}`);
  assert(eq(r.selection, ["playstation5"]), `got ${r.selection}`);
});

check("an unknown family contributes nothing rather than throwing", () => {
  const r = resolvePlatforms({
    familySlugs: ["dreamcast-that-is-not-a-family"],
    machineSlugs: ["nes"],
    childrenOf,
  });
  assert(eq(r.machines, ["nes"]), `got ${r.machines}`);
});

check("machines never repeat when families overlap", () => {
  const r = resolvePlatforms({
    familySlugs: ["nintendo", "nintendo"],
    machineSlugs: ["nes"],
    childrenOf,
  });
  assert(eq(r.machines, ["nes"]), `got ${r.machines}`);
});

check("nothing selected returns nothing, without throwing", () => {
  const r = resolvePlatforms({ familySlugs: [], machineSlugs: [], childrenOf });
  assert(r.specific === false);
  assert(r.machines.length === 0 && r.selection.length === 0);
});

check("resolvePlatforms tolerates missing arguments", () => {
  const r = resolvePlatforms({ childrenOf });
  assert(r.specific === false && r.selection.length === 0);
});

// --- report -------------------------------------------------------------------

console.log(`\n${passed} checks passed, ${failures.length} failed\n`);
if (failures.length) {
  for (const f of failures) console.log(`FAILED  ${f}\n`);
  process.exit(1);
}
console.log("The logic these cover reached users broken twice while it lived inside");
console.log("the Netlify handler, where no offline check could run against it.");
