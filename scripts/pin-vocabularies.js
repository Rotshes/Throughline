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
    "Parent platforms, not platforms. 'PlayStation' rather than 'PlayStation 5' " +
    "is the granularity a person has in mind when they say what they can play on.",
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
console.log(`\ndata/platforms.json   ${platforms.length} platforms`);
for (const p of platforms) {
  console.log(`  ${String(p.id).padStart(3)}  ${p.slug.padEnd(16)} ${p.name}`);
}

console.log(
  "\nRead the category list before committing. If the things people actually " +
  "want are not expressible in it, that is the finding of this turn, not a bug."
);
