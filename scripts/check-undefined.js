/**
 * Identifiers that are read and never declared. The bug `node --check` cannot see.
 *
 *   node scripts/check-undefined.js
 *
 * Offline. No key, no network, no cost.
 *
 * WHY THIS EXISTS
 *
 *   Turn 020 rewrote the heads of two command-line runners and broke one of them
 *   three separate times, each in the same way: a variable was removed from the
 *   top of the file and left in use further down.
 *
 *     `specific`    used by the platform verification, 60 lines below the edit
 *     `metacritic`  a RAWG field name, fixed in one file and not the other
 *     `vocabulary`  a guard for a loader that no longer exists
 *
 *   Every one of them parsed. `node --check` reports a file like that as fine,
 *   because it is syntactically fine — the failure is a `ReferenceError` at the
 *   moment the line executes, which for these scripts is after a live catalogue
 *   request. So each bug cost a real run to find, on a machine that is not mine.
 *
 *   After the second I wrote down the rule — grep for every identifier you
 *   remove — and then broke it on the next edit. **Sixth time in this project
 *   that writing a rule down has failed to prevent its next occurrence, against
 *   a much better record for guards that run.** That asymmetry is the argument
 *   for this file.
 *
 * WHAT IT DOES, AND WHAT IT DELIBERATELY DOES NOT
 *
 *   Parses each module with a real JavaScript parser, collects every name that
 *   is DECLARED anywhere in it, collects every name that is READ, and reports
 *   the difference.
 *
 *   **Scope-agnostic on purpose.** A name declared inside one function counts as
 *   declared for the whole file. That under-reports: it will not catch a
 *   use-before-declare in a different scope, or a shadowing mistake. What it buys
 *   is zero false positives, and false positives are a linter's running cost —
 *   enough of them and the output gets skimmed, which is the same as not running
 *   it. An earlier regex version produced sixty false hits from words inside
 *   template literals and was useless.
 *
 *   **JSX is not parsed.** `web/src/*.jsx` needs a different parser and is not
 *   covered. Said out loud rather than quietly skipped: an uncovered directory
 *   that looks covered is worse than one known to be uncovered.
 *
 *   **It does not check that a declared name is used.** Dead bindings are untidy,
 *   not broken, and a check that fires on them would fire constantly.
 */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { parse } from "acorn";
import * as walk from "acorn-walk";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Real globals, every one of them verified against the file that reported it.
 *
 * This list is not a way of silencing results. Each entry was added after
 * reading the line that used it and confirming it is a platform global rather
 * than a variable somebody forgot to declare — which is exactly the distinction
 * the whole file exists to make, so making it carelessly here would be absurd.
 */
const GLOBALS = new Set([
  "console", "process", "JSON", "Math", "Date", "Number", "Array", "String",
  "Object", "Set", "Map", "WeakMap", "WeakSet", "Promise", "Error", "TypeError",
  "RangeError", "Boolean", "RegExp", "Symbol", "BigInt", "Function", "Proxy",
  "parseInt", "parseFloat", "isNaN", "isFinite", "Infinity", "NaN", "undefined",
  "globalThis", "URL", "URLSearchParams", "fetch", "Headers", "Request",
  "Response", "Buffer", "structuredClone", "AbortController", "AbortSignal",
  "TextEncoder", "TextDecoder", "atob", "btoa",
  "setTimeout", "setInterval", "clearTimeout", "clearInterval", "setImmediate",
  "queueMicrotask", "performance",
  "encodeURIComponent", "decodeURIComponent", "encodeURI", "decodeURI",
  "__dirname", "__filename", "require", "module", "exports",
]);

/** Directories scanned, and the extension that acorn can read. */
const DIRS = ["scripts", "src", "netlify/functions"];

function filesIn(dir) {
  try {
    return readdirSync(join(ROOT, dir))
      .filter(f => f.endsWith(".js"))
      .map(f => join(dir, f))
      .sort();
  } catch {
    return [];
  }
}

/** Every binding form that introduces a name. Patterns nest, so this recurses. */
function declaredNames(ast) {
  const out = new Set();

  const addPattern = n => {
    if (!n) return;
    switch (n.type) {
      case "Identifier": out.add(n.name); break;
      case "ObjectPattern":
        for (const p of n.properties) {
          addPattern(p.type === "RestElement" ? p.argument : p.value);
        }
        break;
      case "ArrayPattern": n.elements.forEach(addPattern); break;
      case "AssignmentPattern": addPattern(n.left); break;
      case "RestElement": addPattern(n.argument); break;
    }
  };

  walk.full(ast, node => {
    switch (node.type) {
      case "VariableDeclarator": addPattern(node.id); break;
      case "FunctionDeclaration":
      case "FunctionExpression":
      case "ClassDeclaration":
      case "ClassExpression": addPattern(node.id); break;
      case "ImportDefaultSpecifier":
      case "ImportSpecifier":
      case "ImportNamespaceSpecifier": addPattern(node.local); break;
      case "CatchClause": addPattern(node.param); break;
    }
    if (node.params) node.params.forEach(addPattern);
  });

  return out;
}

/**
 * Every name that is READ.
 *
 * The exclusions are what keep this honest. `c.metacritic` reads `c`, not
 * `metacritic` — a property name is not an identifier reference, and counting it
 * as one is how the regex version produced its noise. Same for a non-computed
 * object key, the name being bound by a declaration, and an import specifier.
 */
function readNames(ast) {
  const out = new Set();
  walk.ancestor(ast, {
    Identifier(node, _state, ancestors) {
      const parent = ancestors[ancestors.length - 2];
      if (!parent) return;
      if (parent.type === "MemberExpression" && parent.property === node && !parent.computed) return;
      if (parent.type === "Property" && parent.key === node && !parent.computed) return;
      if (parent.type === "VariableDeclarator" && parent.id === node) return;
      if (parent.type === "MethodDefinition" && parent.key === node) return;
      if (parent.type.startsWith("Import") || parent.type.startsWith("Export")) return;
      if (["FunctionDeclaration", "FunctionExpression", "ClassDeclaration", "ClassExpression"].includes(parent.type)
          && parent.id === node) return;
      if (["LabeledStatement", "BreakStatement", "ContinueStatement"].includes(parent.type)) return;
      out.add(node.name);
    },
  });
  return out;
}

// --- run ----------------------------------------------------------------------

const files = DIRS.flatMap(filesIn);
const problems = [];
let scanned = 0;

for (const rel of files) {
  let ast;
  try {
    ast = parse(readFileSync(join(ROOT, rel), "utf8"), {
      ecmaVersion: "latest",
      sourceType: "module",
    });
  } catch (e) {
    // A file that will not parse is a worse problem than an undefined name, and
    // must not be reported as "clean" by being skipped.
    problems.push(`${rel}\n    will not parse: ${e.message}`);
    continue;
  }
  scanned++;

  const declared = declaredNames(ast);
  const missing = [...readNames(ast)]
    .filter(n => !declared.has(n) && !GLOBALS.has(n))
    .sort();

  if (missing.length) {
    problems.push(
      `${rel}\n    read but never declared: ${missing.join(", ")}\n` +
      `    Either it was removed from this file and left in use, or it is a\n` +
      `    global this check does not know about — read the line before deciding.`
    );
  }
}

console.log(`\n${scanned} files scanned, ${problems.length} with problems\n`);
if (problems.length) {
  for (const p of problems) console.log(`FAILED  ${p}\n`);
  process.exit(1);
}
console.log("Offline, scope-agnostic, and blind to web/src/*.jsx, which needs a JSX");
console.log("parser. It catches a name removed from the top of a file and left in use");
console.log("further down — which happened three times in one turn and cost three runs.");
