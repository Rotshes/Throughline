import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Resolve a repository-relative data file.
 *
 * Locally this runs from the repo root, so "schemas/motifs.schema.json" works.
 * Inside a bundled Netlify function neither the working directory nor the
 * module's own location is the repo root, and the files are only present
 * because netlify.toml lists them in included_files.
 *
 * Rather than guess which layout a runtime produces, try each candidate root and
 * use the first where the file exists. A wrong guess would fail at request time
 * with an unhelpful ENOENT; this fails with a message naming every path tried.
 */

/**
 * The module's own directory, whichever module system it ends up in.
 *
 * Netlify bundles these ES modules into CommonJS with esbuild, and in that
 * output `import.meta.url` is undefined. The first version of this file called
 * fileURLToPath(import.meta.url) at the top level, so it threw on load — before
 * any fallback could run — and the function returned a 500 with a stack trace
 * about `path` being undefined.
 *
 * Everything here is guarded because this file must work in both module
 * systems. `typeof __dirname` rather than `__dirname` matters: a bare reference
 * throws a ReferenceError under ESM instead of being undefined.
 */
function moduleDir() {
  try {
    if (typeof import.meta !== "undefined" && import.meta.url) {
      return path.dirname(fileURLToPath(import.meta.url));
    }
  } catch {
    // Fall through to the CommonJS path below.
  }
  try {
    if (typeof __dirname === "string") return __dirname;
  } catch {
    // Neither is available. The cwd-based roots below still apply.
  }
  return null;
}

const HERE = moduleDir();

const ROOTS = [
  process.env.THROUGHLINE_ROOT,          // explicit override, if ever needed
  process.cwd(),                         // local: run from the repo root
  HERE,                                  // bundled: included_files sit beside the function
  HERE && path.resolve(HERE, ".."),      // local: imported from src/
  HERE && path.resolve(HERE, "../.."),
].filter(Boolean);

export function dataPath(relative) {
  for (const root of ROOTS) {
    const full = path.join(root, relative);
    if (fs.existsSync(full)) return full;
  }
  throw new Error(
    `Cannot find "${relative}". Tried:\n` +
    ROOTS.map(r => `  ${path.join(r, relative)}`).join("\n") +
    `\ncwd=${process.cwd()} moduleDir=${HERE ?? "unavailable"}\n` +
    `If this is a deploy, check included_files in netlify.toml.`
  );
}

export function readData(relative) {
  return fs.readFileSync(dataPath(relative), "utf8");
}
