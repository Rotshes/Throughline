/**
 * Does IGDB serve news through the API, or only on their website?
 *
 * WHY THIS EXISTS: I asserted it did not, from a v4 migration post saying the
 * team "removed the substandard endpoints and data points for now". That post
 * names no endpoint. I turned an inference into a statement of fact and used it
 * to argue for a fourth external service.
 *
 * `docs/failures.md` has carried "a documented shape is not a verified one"
 * since turn 005. An *undocumented absence* is weaker still — it is the absence
 * of evidence being read as evidence of absence, which is how this project
 * nearly bought a dependency it may not need.
 *
 * IGDB answers an unknown endpoint with a clean 404 and a named message —
 * `Endpoint POST /game_time_to_beat not found` — so this is unambiguous. Each
 * candidate is asked for once and the status printed. No interpretation.
 *
 *   node scripts/probe-igdb-news.js
 *
 * About 14 requests.
 */

import "dotenv/config";
import { igdbRequest } from "../src/igdb.js";

/**
 * Names worth trying, and why each one.
 *
 * `pulses` and everything around it is what the v3 API called news. The rest are
 * plausible v4 renames — IGDB has renamed things during this project already
 * (`category` became `game_type`, and `external_games.category` became
 * `external_game_source`), so a rename is more likely than a removal.
 */
const CANDIDATES = [
  "pulses",
  "pulse_groups",
  "pulse_sources",
  "pulse_urls",
  "articles",
  "news",
  "feeds",
  "feed_follows",
  "events",
  "event_networks",
  "event_logos",
  "game_videos",
];

console.log("Asking IGDB for each endpoint once. A 404 is a real answer.\n");

const found = [];

for (const name of CANDIDATES) {
  try {
    const rows = await igdbRequest(name, "fields *; limit 2;");
    const n = Array.isArray(rows) ? rows.length : 0;
    console.log(`  ${name.padEnd(16)} 200   ${n} row${n === 1 ? "" : "s"}`);
    if (n > 0) {
      const keys = [...new Set(rows.flatMap(Object.keys))].sort();
      console.log(`  ${"".padEnd(16)}       fields: ${keys.join(", ")}`);
      console.log(`  ${"".padEnd(16)}       first:  ${JSON.stringify(rows[0]).slice(0, 220)}`);
      found.push({ name, keys, sample: rows[0] });
    } else {
      // An endpoint that exists and is empty is not the same as one that does
      // not exist, and it is not the same as one with data either. All three
      // would look identical if this printed only a pass or a fail.
      console.log(`  ${"".padEnd(16)}       exists but returned nothing`);
      found.push({ name, keys: [], sample: null, empty: true });
    }
  } catch (e) {
    const status = e.status ?? "?";
    console.log(`  ${name.padEnd(16)} ${String(status).padEnd(5)} ${status === 404 ? "not an endpoint" : e.message.slice(0, 80)}`);
  }
}

console.log("\n" + "=".repeat(60) + "\n");

const live = found.filter(f => !f.empty);

if (live.length === 0) {
  console.log("  No news endpoint answers with data.");
  console.log();
  console.log("  That settles it: their website carries news their API does not");
  console.log("  serve, and a news row needs a source outside IGDB. The assertion");
  console.log("  was right and was made for the wrong reason — which is worth");
  console.log("  exactly as little as being wrong would have been.");
} else {
  console.log(`  ${live.length} endpoint${live.length === 1 ? "" : "s"} answered with data:`);
  for (const f of live) console.log(`    ${f.name} — ${f.keys.join(", ")}`);
  console.log();
  console.log("  So no fourth service, no XML, and no dependency. The news row is");
  console.log("  a query against a catalogue this project already has a key for,");
  console.log("  and decision 0008 becomes a paragraph instead of a trade-off.");
  console.log();
  console.log("  Next question, not answered here: whether the rows carry a");
  console.log("  headline, a link and a date, or only ids that need a second");
  console.log("  request each.");
}
console.log();
