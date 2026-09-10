/**
 * Print what the catalogue actually returns, before anything is built on it.
 *
 * The RAWG list endpoint's field list is not documented anywhere this project
 * could verify — the reference pages are not publicly fetchable. Rather than
 * write src/catalogue.js against a remembered shape and find out at request
 * time, this prints one raw record and a summary of which fields were present.
 *
 * Turn 003's finding was that local green says nothing about a deployed
 * artifact. This is the same lesson pointed at a dependency: a normaliser
 * written against an assumed shape is an assumption, not code.
 *
 *   node scripts/inspect-catalogue.js
 *   node scripts/inspect-catalogue.js action pc
 *
 * Costs one catalogue request.
 */

import { config } from "../src/config.js";

const [, , genre = "action", platform = "1"] = process.argv;

const params = new URLSearchParams({
  key: config.rawgKey,
  genres: genre,
  parent_platforms: platform,
  ordering: "-rating",
  page_size: "3",
  exclude_additions: "true",
});

const url = `https://api.rawg.io/api/games?${params}`;
console.log(`GET https://api.rawg.io/api/games?${String(params).replace(config.rawgKey, "…")}\n`);

const res = await fetch(url, { headers: { Accept: "application/json" } });
if (!res.ok) {
  console.error(`Catalogue returned ${res.status}`);
  console.error((await res.text()).slice(0, 500));
  process.exit(1);
}

const data = await res.json();
const first = (data.results || [])[0];

if (!first) {
  console.error("No results. Check the genre slug and platform id.");
  process.exit(1);
}

console.log(`count: ${data.count}   next page: ${data.next ? "yes" : "no"}\n`);

console.log("--- top-level keys on one game ---");
console.log(Object.keys(first).sort().join("\n"));

console.log("\n--- the fields src/catalogue.js depends on ---");
const needed = {
  id: first.id,
  name: first.name,
  released: first.released,
  background_image: first.background_image ? "present" : "MISSING",
  short_screenshots: Array.isArray(first.short_screenshots)
    ? `${first.short_screenshots.length} entries`
    : "MISSING",
  parent_platforms: Array.isArray(first.parent_platforms)
    ? first.parent_platforms.map(p => p?.platform?.slug).join(", ")
    : "MISSING",
  genres: Array.isArray(first.genres)
    ? first.genres.map(g => g?.slug).join(", ")
    : "MISSING",
  tags: Array.isArray(first.tags) ? `${first.tags.length} entries` : "MISSING",
  ratings_count: first.ratings_count,
  metacritic: first.metacritic,
};
for (const [k, v] of Object.entries(needed)) {
  console.log(`${k.padEnd(20)} ${v}`);
}

console.log("\n--- is there any description in the list response? ---");
const descKeys = Object.keys(first).filter(k => /desc|summary|about|overview/i.test(k));
console.log(descKeys.length ? descKeys.join(", ") : "none — a per-game request would be needed");

console.log("\n--- full raw record ---");
console.log(JSON.stringify(first, null, 2));
