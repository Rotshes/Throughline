/**
 * Does the stylesheet still say what it looks like it says?
 *
 * WHY THIS EXISTS
 *
 *   Turn 018. An edit to `.tab.primary` left a comment closed early and five
 *   lines of English prose loose inside the declaration block:
 *
 *       ... points at — below. *\/
 *          2.9s was a heartbeat. 7s is a signpost. ...          <- bare text
 *          opposite of what was asked for. *\/
 *       animation: tab-pulse 7s var(--ease) infinite;
 *
 *   A browser discards from the stray text to the end of that declaration, so
 *   the animation never applied. The file still *read* correctly — the intent
 *   was there in black and white, one character out of place from working.
 *
 *   What makes it worth a check rather than a lesson is how it was verified.
 *   The command was `esbuild styles.css --outfile=/dev/null`, and esbuild
 *   exits 0, prints nothing, and emits the wreckage as a single declaration:
 *
 *       stray text here *\/ animation: pulse 7s infinite;
 *
 *   A bundler that tolerates broken CSS is the right tool being asked the
 *   wrong question. "It parsed" was never the claim that mattered; "the rule
 *   still contains the declaration" was, and nothing was asking it. That is
 *   this project's oldest failure — a gate that passes for the wrong reason,
 *   `docs/failures.md` — in a file nobody thought of as code.
 *
 * WHAT THIS CHECKS
 *
 *   Not that the CSS is good. That every declaration this project depends on
 *   is still inside the rule it is supposed to be inside, after comments are
 *   removed the way a browser removes them.
 *
 *   It is deliberately a short list. A check over every rule in a 1,500-line
 *   stylesheet would fail on every legitimate edit and be deleted within a
 *   week. These are the ones where breakage is silent — motion and theming,
 *   where a dropped declaration shows up as "nothing happens" rather than as
 *   a visibly broken page.
 *
 *   node scripts/check-css.js
 *
 * Offline. No key, no network, no cost.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const CSS_PATH = join(HERE, "..", "web", "src", "styles.css");
const css = readFileSync(CSS_PATH, "utf8");

let passed = 0;
const failures = [];

function check(name, fn) {
  try { fn(); passed++; }
  catch (e) { failures.push(`${name}\n    ${e.message}`); }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || "assertion failed"); }

/**
 * Remove comments the way a browser does: `/*` opens, the FIRST `*\/` closes,
 * and CSS comments do not nest. Anything left over is real stylesheet text.
 *
 * This is the whole mechanism of the bug. An editor showing the second half of
 * a split comment in grey is showing you a lie — the parser stopped treating it
 * as a comment several lines earlier.
 */
function stripComments(src) {
  let out = "";
  let i = 0;
  while (i < src.length) {
    const open = src.indexOf("/*", i);
    if (open === -1) { out += src.slice(i); break; }
    out += src.slice(i, open);
    const close = src.indexOf("*/", open + 2);
    if (close === -1) throw new Error(`unterminated comment at offset ${open}`);
    i = close + 2;
  }
  return out;
}

const code = stripComments(css);

// --- the failure that produced this file ---------------------------------------

check("no stray comment terminator survives comment stripping", () => {
  // The exact signature of turn 018's bug. A `*/` still present after comments
  // are removed means a comment closed earlier than it looks like it closed,
  // and everything between the real close and this one is being parsed as CSS.
  const at = code.indexOf("*/");
  if (at !== -1) {
    const line = code.slice(0, at).split("\n").length;
    const context = code.split("\n")[line - 1]?.trim().slice(0, 80);
    throw new Error(
      `stray "*/" on line ${line} of the comment-stripped file:\n      ${context}\n` +
      `      A comment closed early. Everything after it is being parsed as CSS.`
    );
  }
});

check("no comment opener survives either", () => {
  // The mirror image: `/*` inside what a browser considers live CSS, which
  // happens when a `*/` is missing and the next comment's opener gets eaten.
  assert(!code.includes("/*"), 'a "/*" survived stripping — comments are unbalanced');
});

check("every brace is matched", () => {
  let depth = 0;
  for (const ch of code) {
    if (ch === "{") depth++;
    else if (ch === "}") depth--;
    if (depth < 0) throw new Error("a } closes a block that was never opened");
  }
  assert(depth === 0, `${depth} unclosed block${depth === 1 ? "" : "s"}`);
});

// --- declarations whose absence is silent ------------------------------------------

/**
 * Find a rule's body by selector and return it with comments already gone.
 * Naive on purpose: exact selector text, first match, up to the next `}`. It
 * does not need to understand CSS, only to prove a declaration is inside the
 * block it is written in.
 */
function body(selector) {
  const at = code.indexOf(selector + " {");
  assert(at !== -1, `no rule for "${selector}" — the selector itself is gone`);
  const open = code.indexOf("{", at);
  const close = code.indexOf("}", open);
  assert(close !== -1, `rule "${selector}" is never closed`);
  return code.slice(open + 1, close);
}

/** Each entry: the rule, and the declarations that must be inside it. */
const REQUIRED = [
  // The find tab. This is the rule that broke.
  [".tab.primary", ["animation:", "background:", "color:"]],
  // The pause. If this loses `animation: none` the tab pulses on the page it
  // points at, which looks like a design choice rather than a bug.
  [".tab.on.primary", ["animation: none"]],
  // The logo shine, same shape of risk: fails to nothing, visibly to no one.
  [".logo-word", ["animation:"]],
];

for (const [selector, decls] of REQUIRED) {
  check(`${selector} keeps its declarations`, () => {
    const b = body(selector);
    for (const d of decls) {
      assert(b.includes(d), `"${d}" is not inside ${selector} — comment or brace ate it`);
    }
  });
}

check("every animation named in a rule has a @keyframes behind it", () => {
  // An animation naming a keyframes block that does not exist is valid CSS and
  // does exactly nothing. Renaming the keyframes and not the reference is the
  // obvious way to get there.
  const named = new Set();
  for (const m of code.matchAll(/animation:\s*([A-Za-z_-][\w-]*)/g)) {
    if (m[1] !== "none") named.add(m[1]);
  }
  const defined = new Set(
    [...code.matchAll(/@keyframes\s+([A-Za-z_-][\w-]*)/g)].map(m => m[1])
  );
  const missing = [...named].filter(n => !defined.has(n));
  assert(missing.length === 0, `no @keyframes for: ${missing.join(", ")}`);
});

check("every custom property used is defined somewhere", () => {
  // var(--typo) falls back to nothing and the declaration is dropped. Silent,
  // and the commonest way a colour goes missing in one theme only.
  //
  // "Somewhere" includes the components. `--i` is set per-card from JSX as an
  // inline style to stagger the entrance animation, and it is as defined as
  // anything in :root — the first draft of this check called it missing, which
  // is the same class of mistake as the bug it was written for: a rule that
  // fires on something true. A check that cries wolf on correct code gets
  // deleted, and then it is not there for the real one.
  const used = new Set([...code.matchAll(/var\(\s*(--[\w-]+)/g)].map(m => m[1]));

  const defined = new Set([...code.matchAll(/(--[\w-]+)\s*:/g)].map(m => m[1]));
  for (const file of ["App.jsx", "Home.jsx", "GameDialog.jsx"]) {
    let src;
    try { src = readFileSync(join(HERE, "..", "web", "src", file), "utf8"); }
    catch { continue; }
    // style={{ "--i": index }} — the quoted-key form React requires.
    for (const m of src.matchAll(/["'](--[\w-]+)["']\s*:/g)) defined.add(m[1]);
  }

  const missing = [...used].filter(v => !defined.has(v));
  assert(missing.length === 0, `used but never defined: ${missing.join(", ")}`);
});

check("the pulse colours are defined in both themes", () => {
  // A variable defined only in :root renders the dark theme's ring in the light
  // theme's colour. It still animates, so nothing looks broken — it just looks
  // wrong, which is harder to notice and harder to report.
  for (const v of ["--accent-ring", "--accent-lift"]) {
    const n = [...code.matchAll(new RegExp(`${v}\\s*:`, "g"))].length;
    assert(n >= 2, `${v} is defined ${n} time(s); light and dark both need one`);
  }
});

// --- report ----------------------------------------------------------------------------

console.log(`\n${passed} checks passed, ${failures.length} failed\n`);
if (failures.length) {
  for (const f of failures) console.log(`FAILED  ${f}\n`);
  process.exit(1);
}
console.log("Offline, against web/src/styles.css. This checks that declarations survive");
console.log("parsing — not that the design is right. A stylesheet that passes here can");
console.log("still be ugly; it cannot silently lose the rule it appears to contain.");
