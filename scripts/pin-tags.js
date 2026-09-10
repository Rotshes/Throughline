/**
 * Resolve every proposed tag against the catalogue, then pin the survivors.
 *
 * Reads data/tag-candidates.json — the hand-picked list — and checks each slug
 * by actually filtering on it, not by searching for it. The probe in turn 005
 * used /tags?search= and reported `open-world` as absent while it demonstrably
 * has 9,338 games: that endpoint ranks fuzzily and is not a membership test.
 * Anything this project relies on gets resolved by the same call the app will
 * make, or it is not resolved at all.
 *
 * A tag that does not exist, or exists with too few games to be worth putting in
 * a dropdown, is reported and left out. A dropdown entry that returns nothing is
 * worse than a missing one — the user blames themselves.
 *
 *   node scripts/pin-tags.js
 *   node scripts/pin-tags.js --min 300
 *
 * Costs one request per proposed tag. About fifty.
 */

import fs from "node:fs";
import path from "node:path";
import { config } from "../src/config.js";
import { readData } from "../src/paths.js";

const args = process.argv.slice(2);
const minIndex = args.indexOf("--min");
/**
 * Below this many games a tag is not worth offering. Not a quality bar — a
 * usability one. Crossed with a genre and a platform, a 200-game tag can easily
 * leave nothing at all, and criterion 5 says we then return fewer than three
 * rather than relax anything. Better not to offer the combination.
 */
const MIN_GAMES = minIndex === -1 ? 400 : Number(args[minIndex + 1]);

const proposal = JSON.parse(readData("data/tag-candidates.json"));

async function countFor(slug) {
  const q = new URLSearchParams({
    key: config.rawgKey,
    tags: slug,
    page_size: "1",
    exclude_additions: "true",
  });
  const res = await fetch(`https://api.rawg.io/api/games?${q}`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) return { ok: false, status: res.status };
  const data = await res.json();
  return { ok: true, count: data.count ?? 0, sample: data.results?.[0]?.name ?? null };
}

const kept = [];
const dropped = [];

for (const facet of proposal.facets) {
  console.log(`\n=== ${facet.label} (${facet.id}) ===`);
  const keptHere = [];

  for (const slug of facet.tags) {
    const r = await countFor(slug);

    if (!r.ok) {
      console.log(`  ERROR    ${slug.padEnd(22)} HTTP ${r.status}`);
      dropped.push({ slug, facet: facet.id, reason: `http ${r.status}` });
      continue;
    }
    if (r.count === 0) {
      console.log(`  ABSENT   ${slug.padEnd(22)} no such tag, or nothing carries it`);
      dropped.push({ slug, facet: facet.id, reason: "no games" });
      continue;
    }
    if (r.count < MIN_GAMES) {
      console.log(`  THIN     ${slug.padEnd(22)} ${String(r.count).padStart(7)} games — under ${MIN_GAMES}, not offered`);
      dropped.push({ slug, facet: facet.id, reason: `only ${r.count} games` });
      continue;
    }

    console.log(`  keep     ${slug.padEnd(22)} ${String(r.count).padStart(7)} games   e.g. ${r.sample ?? "?"}`);
    keptHere.push({ slug, count: r.count });
  }

  if (keptHere.length) {
    kept.push({ id: facet.id, label: facet.label, tags: keptHere });
  }
}

const outDir = path.resolve(process.cwd(), "data");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(
  path.join(outDir, "tags.json"),
  JSON.stringify(
    {
      $comment:
        "Pinned by scripts/pin-tags.js from data/tag-candidates.json. Every slug " +
        "here was resolved by the same query the app makes, and returned at least " +
        `${MIN_GAMES} games. This is the entire vocabulary the interface may offer.`,
      source: "rawg",
      pinnedOn: new Date().toISOString().slice(0, 10),
      minGames: MIN_GAMES,
      facets: kept,
    },
    null,
    2
  ) + "\n"
);

const keptCount = kept.reduce((n, f) => n + f.tags.length, 0);
console.log(`\n\ndata/tags.json  ${keptCount} tags kept across ${kept.length} facets, ${dropped.length} dropped\n`);

if (dropped.length) {
  console.log("Dropped:");
  for (const d of dropped) console.log(`  ${d.slug.padEnd(22)} ${d.reason}`);
  console.log(
    "\nA dropped tag is a thing this product cannot express. If one of these is " +
    "something you would actually pick, look for the slug RAWG uses instead and " +
    "put that in tag-candidates.json — do not force the one that does not work."
  );
}
