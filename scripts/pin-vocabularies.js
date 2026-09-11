/**
 * Fetch the catalogue's genre and parent-platform lists and pin them into data/.
 *
 * Run rarely — when the catalogue changes, or when swapping catalogues. Not per
 * request, for two reasons: a dropdown should not stop working because an
 * external service is down, and no offline check may make a network call.
 *
 * The committed result is also the honest statement of pitfall 9. Whatever ends
 * up in data/categories.json is the entire vocabulary this product understands.
 * Read it after running this and decide whether it is good enough, rather than
 * discovering the gap through a user.
 *
 *   node scripts/pin-vocabularies.js
 *
 * Costs two catalogue requests.
 */

import fs from "node:fs";
import path from "node:path";
import { fetchGenres, fetchParentPlatforms } from "../src/catalogue.js";
import { config } from "../src/config.js";

const outDir = path.resolve(process.cwd(), "data");
fs.mkdirSync(outDir, { recursive: true });

const [genres, platforms] = await Promise.all([
  fetchGenres(),
  fetchParentPlatforms(),
]);

const stamp = new Date().toISOString().slice(0, 10);

const categoriesFile = {
  $comment:
    "Pinned from the catalogue by scripts/pin-vocabularies.js. This is the " +
    "complete list of categories this product can understand — see docs/spec.md " +
    "part 5, pitfall 9. Do not hand-add an entry the catalogue does not have; " +
    "it will return nothing.",
  source: "rawg",
  pinnedOn: stamp,
  categories: genres.sort((a, b) => (b.count ?? 0) - (a.count ?? 0)),
};

const platformsFile = {
  $comment:
    "The platform tree. `platforms` is the families — PlayStation, Nintendo — " +
    "which is how people describe what they own. Each carries the machines under " +
    "it, in the catalogue's own order which runs roughly newest first, for " +
    "someone who owns a PS5 specifically and cannot play a PS3 game. The two are " +
    "filtered with different catalogue parameters and are never mixed in one " +
    "request; see buildPoolQuery.",
  source: "rawg",
  pinnedOn: stamp,
  platforms,
};

fs.writeFileSync(
  path.join(outDir, "categories.json"),
  JSON.stringify(categoriesFile, null, 2) + "\n"
);
fs.writeFileSync(
  path.join(outDir, "platforms.json"),
  JSON.stringify(platformsFile, null, 2) + "\n"
);

console.log(`data/categories.json  ${genres.length} categories`);
for (const g of categoriesFile.categories) {
  console.log(`  ${g.slug.padEnd(20)} ${String(g.count ?? "?").padStart(7)} games`);
}
const machineCount = platforms.reduce((n, p) => n + p.platforms.length, 0);
console.log(`\ndata/platforms.json   ${platforms.length} families, ${machineCount} machines`);
for (const p of platforms) {
  console.log(`  ${String(p.id).padStart(3)}  ${p.slug.padEnd(16)} ${p.name}`);
  if (p.platforms.length) {
    console.log(`       ${p.platforms.map(c => `${c.name} (${c.id})`).join(", ")}`);
  }
}

// --- does `platforms=a,b` narrow or widen? -----------------------------------
// Tags turned out to combine with OR, which is the opposite of what a reader
// expects, and it was only found by measuring. No second parameter gets trusted
// on the same assumption. An ignored or misread parameter returns a plausible
// list and looks exactly like success.

console.log("\n=== how several machines combine ===\n");

async function countFor(params) {
  const q = new URLSearchParams({ ...params, page_size: "1", exclude_additions: "true" });
  q.set("key", config.rawgKey);
  const res = await fetch(`https://api.rawg.io/api/games?${q}`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) return null;
  return (await res.json()).count ?? null;
}

const playstation = platforms.find(p => p.slug === "playstation");
if (playstation && playstation.platforms.length >= 2) {
  const [a, b] = playstation.platforms;
  const one = await countFor({ platforms: String(a.id) });
  const two = await countFor({ platforms: `${a.id},${b.id}` });
  const family = await countFor({ parent_platforms: String(playstation.id) });

  console.log(`  platforms=${a.id} (${a.name})          ${one ?? "failed"}`);
  console.log(`  platforms=${a.id},${b.id} (+ ${b.name})   ${two ?? "failed"}`);
  console.log(`  parent_platforms=${playstation.id} (all PlayStation)  ${family ?? "failed"}`);

  if (one != null && two != null) {
    console.log(
      two > one
        ? "\n  Two machines gave MORE than one. They combine with OR, as tags do."
        : two < one
          ? "\n  Two machines gave FEWER than one. They combine with AND — which for " +
            "\n  platforms means 'released on both', and would be wrong to offer as a filter."
          : "\n  IDENTICAL. The parameter is being ignored; do not build on it."
    );
  }
  if (family != null && two != null && family < two) {
    console.log(
      "\n  WARNING: the family holds fewer than two of its own machines. The two\n" +
      "  parameters do not mean what this code assumes. Stop and read the raw responses."
    );
  }
}

console.log(
  "\nRead the category list before committing. If the things people actually " +
  "want are not expressible in it, that is the finding of this turn, not a bug."
);
