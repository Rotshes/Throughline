/**
 * Can RAWG's tags carry the vocabulary its genres cannot?
 *
 * The finding of turn 005 is that nineteen flat genres do not describe what
 * people want. "Action" holds 192,185 games and catches both Portal and
 * Minecraft. There is no roguelike, no metroidvania, no deckbuilder.
 *
 * RAWG appears to have a separate tag vocabulary and a `tags` filter parameter.
 * If tags are rich, filterable, and actually populated on real games, the
 * category problem is solvable inside RAWG for the price of one more pinned
 * file. If they are not, the choice is IGDB or accepting the coarse vocabulary.
 *
 * That is a decision worth several days of work either way, so it gets measured
 * rather than assumed — same reason scripts/inspect-catalogue.js exists.
 *
 *   node scripts/probe-tags.js
 *
 * Costs four catalogue requests.
 */

import { config } from "../src/config.js";

const BASE = "https://api.rawg.io/api";

async function get(path, params = {}) {
  const q = new URLSearchParams(params);
  q.set("key", config.rawgKey);
  const res = await fetch(`${BASE}${path}?${q}`, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    console.error(`  ${res.status} on ${path}: ${(await res.text()).slice(0, 200)}`);
    return null;
  }
  return res.json();
}

// --- 1. Does a tag vocabulary exist, and how big is it? ---------------------

console.log("=== 1. the tag vocabulary ===\n");
const tags = await get("/tags", { page_size: 40, ordering: "-games_count" });
if (!tags) {
  console.error("No /tags endpoint. Tags are not an option; the question is IGDB or accept the genres.");
  process.exit(1);
}
console.log(`${tags.count} tags exist. The 40 most used:\n`);
for (const t of tags.results || []) {
  console.log(`  ${String(t.games_count).padStart(7)}  ${t.slug.padEnd(28)} ${t.name}`);
}

// --- 2. Are the tags people actually search for in there? -------------------

console.log("\n=== 2. the words that matter ===\n");
console.log("These are the things v1's candidate list was built around. If they");
console.log("are absent, tags do not solve the vocabulary problem either.\n");

const wanted = [
  "roguelike", "roguelite", "metroidvania", "souls-like", "deckbuilding",
  "cozy", "atmospheric", "relaxing", "difficult", "story-rich",
  "open-world", "turn-based", "co-op", "local-multiplayer", "short",
  "exploration", "survival", "psychological-horror", "pixel-graphics", "sandbox",
];

for (const slug of wanted) {
  const hit = await get("/tags", { search: slug, page_size: 5 });
  const exact = (hit?.results || []).find(t => t.slug === slug);
  const near = (hit?.results || [])[0];
  if (exact) {
    console.log(`  FOUND    ${slug.padEnd(22)} ${String(exact.games_count).padStart(7)} games`);
  } else if (near) {
    console.log(`  nearest  ${slug.padEnd(22)} → ${near.slug} (${near.games_count} games)`);
  } else {
    console.log(`  ABSENT   ${slug}`);
  }
}

// --- 3. Does filtering by tag actually work? --------------------------------

console.log("\n=== 3. does ?tags= filter, or is it ignored? ===\n");
console.log("An ignored parameter returns a full unfiltered list and looks like success.");
console.log("So: compare a tag-filtered count against the same query without it.\n");

const withTag = await get("/games", {
  tags: "roguelike",
  parent_platforms: "1",
  ordering: "-rating",
  page_size: "5",
  exclude_additions: "true",
});
const withoutTag = await get("/games", {
  parent_platforms: "1",
  ordering: "-rating",
  page_size: "5",
  exclude_additions: "true",
});

console.log(`  with tags=roguelike : ${withTag?.count ?? "failed"} games`);
console.log(`  without any tag     : ${withoutTag?.count ?? "failed"} games`);

if (withTag && withoutTag) {
  if (withTag.count === withoutTag.count) {
    console.log("\n  IDENTICAL COUNTS — the parameter is being ignored. Tags do not filter.");
  } else {
    console.log(`\n  Filtered down by ${(100 - (withTag.count / withoutTag.count) * 100).toFixed(1)}%. The parameter works.`);
    console.log("\n  Top 5 roguelikes on PC:");
    for (const g of withTag.results || []) {
      console.log(`    ${g.name} — ${g.ratings_count} ratings, genres: ${(g.genres || []).map(x => x.slug).join(", ")}`);
      console.log(`      tags on this record: ${(g.tags || []).length ? g.tags.map(t => t.slug).slice(0, 8).join(", ") : "NONE RETURNED"}`);
    }
  }
}

console.log("\n=== what this decides ===\n");
console.log("Tags rich + filterable  → pin a tag vocabulary, category problem solved in RAWG.");
console.log("Tags absent or ignored  → IGDB, or accept nineteen genres and say so in the spec.");
console.log("\nEither way it is a decision record, not a quiet choice.");
