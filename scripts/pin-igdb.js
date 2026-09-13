/**
 * Pin IGDB's vocabularies into data/, and hand-build the platform tree.
 *
 * Step 3 of docs/plans/igdb-migration.md. Writes `*.igdb.json` alongside the
 * RAWG files rather than over them, so the two can be compared and `main` keeps
 * working until the switch.
 *
 * Whatever ends up in these files is the entire vocabulary this product
 * understands. Read them after running this and decide whether they are good
 * enough, rather than discovering the gap through a user. That is pitfall 9 and
 * it does not change with the catalogue.
 *
 * THE MAPPING, AND WHY IT IS NOT THE OBVIOUS ONE
 *
 *   RAWG had two vocabularies: 19 genres and 9,736 tags. IGDB has four, and they
 *   do not line up one-to-one:
 *
 *     genres (23)              adventure, fighting, platform, puzzle, racing,
 *                              role-playing-rpg, shooter, simulator, sport,
 *                              strategy, visual-novel, ...
 *     themes (22)              action, fantasy, horror, open-world, sandbox,
 *                              stealth, survival, warfare, comedy, mystery, ...
 *     game_modes (~6)          single player, multiplayer, co-operative,
 *                              split screen, MMO, battle royale
 *     player_perspectives (~7) first person, third person, isometric, side view
 *
 *   The interesting part: RAWG's "Action" is a *genre* and IGDB's is a *theme*.
 *   So the mapping is not "genres become categories". It is:
 *
 *     category ("what kind of game")  <- genres
 *     facets   ("anything particular") <- themes + game_modes + player_perspectives
 *
 *   That gives roughly 50 curated terms from three clean lists, against 51 terms
 *   hand-picked out of 9,736 polluted ones. The curation problem mostly goes
 *   away, because IGDB's vocabularies are maintained rather than scraped.
 *
 *   game_modes matters more than its size suggests. "Split screen" is a
 *   structured field here. On RAWG it was a crowd tag, and 6 of 662 GameCube
 *   games carried it — which is why asking for split-screen GameCube games
 *   returned Sonic and nothing else. This script counts both so the difference
 *   is measured rather than hoped for.
 *
 * THE PLATFORM TREE IS NOT PINNED. IT IS BUILT.
 *
 *   IGDB has five platform families and PC is in none of them. Its "Linux"
 *   family contains Android and Stadia, which is technically defensible and
 *   useless. So the tree below is a hand-written selection, and every slug in it
 *   is resolved against the live list — anything that fails to resolve stops the
 *   script rather than quietly producing a family with a machine missing.
 *
 *   A missing machine is exactly the failure mode of turns 009 and 010, where a
 *   platform selection looked right and returned the wrong games.
 *
 *   node scripts/pin-igdb.js
 *
 * About 50 requests, paced under the rate limit. Takes roughly 20 seconds.
 */

import fs from "node:fs";
import path from "node:path";
import { igdbRequest, igdbCount } from "../src/igdb.js";

const outDir = path.resolve(process.cwd(), "data");
fs.mkdirSync(outDir, { recursive: true });

// --- the hand-written platform tree ------------------------------------------
//
// Ordered by how likely somebody is to be holding one, same as the RAWG tree.
// Machines within a family are newest first, because that is the order a person
// scans for their own console — and because assuming the source's order was the
// bug in turn 009.
//
// Deliberate omissions, so they read as choices rather than oversights:
//   - Japanese variants (Famicom, Super Famicom, Famicom Disk System,
//     Satellaview) duplicate their western counterparts in this catalogue.
//   - Peripherals and oddities (Virtual Boy, PocketStation, 64DD, e-Reader,
//     Pokemon Mini, Sega Pico, VMU) have almost no catalogue.
//   - VR headsets are their own question and are not offered yet.
//   - Arcade, and the 165 platforms with no family, are not offered. Somebody
//     choosing a platform is saying what hardware they own.

const TREE = [
  { slug: "pc", name: "PC", machines: ["win", "dos"] },
  {
    slug: "playstation", name: "PlayStation",
    // "ps4--1", not "ps4". IGDB carries a disambiguating suffix on that one
    // slug and nowhere else in this family. Typed from memory it would have
    // silently dropped the PlayStation 4 out of the PlayStation family — the
    // single most-owned console in the list — and the resolver is the only
    // reason that was a stopped script rather than a bug reaching a user.
    machines: ["ps5", "ps4--1", "ps3", "ps2", "ps", "psvita", "psp"],
  },
  {
    slug: "xbox", name: "Xbox",
    machines: ["series-x-s", "xboxone", "xbox360", "xbox"],
  },
  {
    slug: "nintendo", name: "Nintendo",
    machines: [
      "switch-2", "switch", "wiiu", "wii", "ngc", "n64", "snes", "nes",
      "3ds", "nds", "gba", "gbc", "gb",
    ],
  },
  {
    slug: "sega", name: "Sega",
    machines: ["dc", "saturn", "genesis-slash-megadrive", "sega-cd", "sega32", "gamegear", "sms"],
  },
  { slug: "mac", name: "Mac", machines: ["mac"] },
  { slug: "linux", name: "Linux", machines: ["linux"] },
  { slug: "mobile", name: "Phone or tablet", machines: ["ios", "android"] },
  { slug: "web", name: "Browser", machines: ["browser"] },
];

const sleep = ms => new Promise(r => setTimeout(r, ms));

console.log("Resolving platforms against the live list...\n");

// 250 is above IGDB's platform count, so this is the whole list in one request.
const allPlatforms = await igdbRequest("platforms",
  "fields id, name, slug, abbreviation, generation, platform_family, platform_type; limit 250;");

const bySlug = new Map(allPlatforms.map(p => [p.slug, p]));

const unresolved = [];
const platforms = [];

for (const family of TREE) {
  const machines = [];
  for (const slug of family.machines) {
    const p = bySlug.get(slug);
    if (!p) { unresolved.push(`${family.name} -> ${slug}`); continue; }
    machines.push({
      id: p.id,
      slug: p.slug,
      name: p.name,
      short: p.abbreviation ?? p.name,
      generation: p.generation ?? null,
    });
  }
  platforms.push({ slug: family.slug, name: family.name, platforms: machines });
}

if (unresolved.length) {
  // Loud rather than quiet. A family missing a machine looks like a working
  // family, and the user who picked that console gets somebody else's games.
  console.error("\nThese slugs did not resolve against IGDB:\n");
  for (const u of unresolved) console.error(`  ${u}`);
  console.error("\nNothing was written. Fix the tree in this script and run it again.");
  console.error("Candidate slugs containing a similar string:\n");
  for (const u of unresolved) {
    const want = u.split(" -> ")[1];
    const near = allPlatforms
      .filter(p => p.slug.includes(want.slice(0, 3)) || (p.abbreviation ?? "").toLowerCase().includes(want.slice(0, 3)))
      .map(p => `${p.slug} (${p.abbreviation ?? p.name})`);
    console.error(`  for "${want}": ${near.slice(0, 8).join(", ") || "nothing similar"}`);
  }
  process.exit(1);
}

// How much catalogue each machine actually has. A platform in the list with
// eleven games is a trap: it looks like a choice and returns nothing.
console.log("Counting the catalogue behind each machine...\n");
for (const family of platforms) {
  const counts = [];
  for (const m of family.platforms) {
    m.games = await igdbCount("games", `platforms = (${m.id}) & parent_game = null`);
    counts.push(`${m.short} ${m.games.toLocaleString("en-GB")}`);
  }
  console.log(`  ${family.name.padEnd(16)} ${counts.join(" · ")}`);
}

// --- the facet vocabularies ---------------------------------------------------

console.log("\nFetching genres, themes, modes and perspectives...\n");

const [genres, themes, modes, perspectives] = await Promise.all([
  igdbRequest("genres", "fields id, name, slug; sort name asc; limit 50;"),
  igdbRequest("themes", "fields id, name, slug; sort name asc; limit 50;"),
  igdbRequest("game_modes", "fields id, name, slug; sort name asc; limit 50;"),
  igdbRequest("player_perspectives", "fields id, name, slug; sort name asc; limit 50;"),
]);

/** How many games carry a term, so a dead vocabulary entry is visible. */
async function withCounts(list, field) {
  const out = [];
  for (const t of list) {
    out.push({
      id: t.id,
      slug: t.slug,
      name: t.name,
      games: await igdbCount("games", `${field} = (${t.id}) & parent_game = null`),
    });
  }
  return out.sort((a, b) => b.games - a.games);
}

const genreRows = await withCounts(genres, "genres");
const themeRows = await withCounts(themes, "themes");
const modeRows = await withCounts(modes, "game_modes");
const perspectiveRows = await withCounts(perspectives, "player_perspectives");

const show = (label, rows) => {
  console.log(`  ${label} (${rows.length})`);
  for (const r of rows) {
    console.log(`    ${String(r.games).padStart(7)}  ${r.slug}`);
  }
  console.log();
};

show("genres — these become the category list", genreRows);
show("themes", themeRows);
show("game modes", modeRows);
show("player perspectives", perspectiveRows);

// --- the split-screen question ------------------------------------------------
//
// Not decoration. RAWG tagged 6 of 662 GameCube games split-screen, so asking
// for split-screen GameCube games returned one. If IGDB's structured field is
// better populated, a complaint about this app is fixed by the swap; if it is
// not, the same disappointment is waiting on the other side.

const gc = bySlug.get("ngc");
const splitScreen = modeRows.find(m => m.slug.includes("split"));
if (gc && splitScreen) {
  const total = await igdbCount("games", `platforms = (${gc.id}) & parent_game = null`);
  const split = await igdbCount("games",
    `platforms = (${gc.id}) & game_modes = (${splitScreen.id}) & parent_game = null`);
  console.log("  --- the GameCube split-screen question ---\n");
  console.log(`    IGDB GameCube games:               ${total}`);
  console.log(`    ... with the split screen mode:    ${split}`);
  console.log(`    RAWG, for comparison:              6 of 662 carried the tag\n`);
}

// --- write --------------------------------------------------------------------

const stamp = { source: "igdb", pinnedAt: new Date().toISOString() };

fs.writeFileSync(
  path.join(outDir, "platforms.igdb.json"),
  `${JSON.stringify({ ...stamp, handBuilt: true, platforms }, null, 2)}\n`
);

fs.writeFileSync(
  path.join(outDir, "categories.igdb.json"),
  `${JSON.stringify({ ...stamp, categories: genreRows }, null, 2)}\n`
);

// Written as candidates, not as the vocabulary. The RAWG equivalent went through
// a hand pass before anything used it, and these three lists are short enough
// that the pass is reading the counts above and deleting rows.
fs.writeFileSync(
  path.join(outDir, "tag-candidates.igdb.json"),
  `${JSON.stringify({
    ...stamp,
    facets: [
      { id: "theme", label: "Setting and feel", field: "themes", tags: themeRows },
      { id: "mode", label: "How you play it", field: "game_modes", tags: modeRows },
      { id: "view", label: "Point of view", field: "player_perspectives", tags: perspectiveRows },
    ],
  }, null, 2)}\n`
);

console.log("Written:");
console.log("  data/platforms.igdb.json       hand-built, every slug resolved");
console.log("  data/categories.igdb.json      IGDB genres");
console.log("  data/tag-candidates.igdb.json  themes, modes, perspectives — NOT yet the vocabulary");
console.log("\nThe RAWG files are untouched. Read the three new ones before anything");
console.log("depends on them: whatever is in them is all this product can understand.\n");
