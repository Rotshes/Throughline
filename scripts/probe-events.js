/**
 * Is IGDB's `events` data alive, or an archive?
 *
 * The news probe turned up `events` — showcases and announcement streams, with
 * logos, live stream URLs, and the games featured in each one joined by id. That
 * would be a row with no fourth service, no XML parser and no new dependency.
 *
 * The sample it printed was **Nintendo Direct E3 2021**, which is five years old.
 * One old row proves nothing either way: it could be the newest thing there, or
 * simply the lowest id. A row called "what's coming up" built on an archive that
 * stopped in 2021 would be worse than no row.
 *
 * THE QUESTION THIS ANSWERS: how many events are in the recent past and the near
 * future, and do they carry enough to draw a card.
 *
 * A note on the probe that sent me here. Its summary counted `events`,
 * `event_logos` and `game_videos` as evidence that news exists, because it
 * treated "an endpoint answered" as "the thing I asked about exists". None of
 * those is news. `docs/failures.md` entry one — ask what a pass would look like
 * if the thing being tested had failed — and it was written into a file whose
 * own header is about that failure. This probe states each count separately and
 * draws no conclusion beyond the arithmetic.
 *
 *   node scripts/probe-events.js
 *
 * About 12 requests.
 */

import "dotenv/config";
import { igdbRequest } from "../src/igdb.js";

const NOW = Math.floor(Date.now() / 1000);
const DAY = 86400;
const ago = d => NOW - d * DAY;
const ahead = d => NOW + d * DAY;
const when = t => (Number.isFinite(t) ? new Date(t * 1000).toISOString().slice(0, 10) : "—");

async function count(where) {
  const r = await igdbRequest("events/count", where ? `where ${where};` : "");
  return Number.isInteger(r?.count) ? r.count : `err`;
}

// --- 1. is it alive? ---------------------------------------------------------

console.log("=== 1. events by window ===\n");

const rows = [
  ["everything", ""],
  ["before 2023", `start_time < ${Math.floor(new Date("2023-01-01").getTime() / 1000)}`],
  ["last 12 months", `start_time > ${ago(365)} & start_time <= ${NOW}`],
  ["last 90 days", `start_time > ${ago(90)} & start_time <= ${NOW}`],
  ["last 30 days", `start_time > ${ago(30)} & start_time <= ${NOW}`],
  ["upcoming, next 90 days", `start_time > ${NOW} & start_time < ${ahead(90)}`],
  ["upcoming, any", `start_time > ${NOW}`],
];

for (const [label, where] of rows) {
  console.log(`  ${label.padEnd(24)} ${String(await count(where)).padStart(6)}`);
}

console.log(`
  The row that decides this is "last 90 days" plus "upcoming".
  Near zero in both and the data is an archive: a showcase row would be
  correct, current, and about 2021.
`);

// --- 2. what a card would have ------------------------------------------------

console.log("=== 2. the most recent twelve, with everything a card needs ===\n");

const recent = await igdbRequest("events",
  `fields name, slug, start_time, end_time, time_zone, live_stream_url,
          event_logo.image_id, event_logo.width, event_logo.height,
          games.name, games.cover.image_id;
   where start_time < ${ahead(365)};
   sort start_time desc; limit 12;`);

if (!Array.isArray(recent) || recent.length === 0) {
  console.log("  nothing returned.\n");
} else {
  let withLogo = 0;
  let withStream = 0;
  let withGames = 0;

  for (const e of recent) {
    const games = Array.isArray(e.games) ? e.games : [];
    if (e.event_logo?.image_id) withLogo++;
    if (e.live_stream_url) withStream++;
    if (games.length) withGames++;

    const tense = e.start_time > NOW ? "upcoming" : "past";
    console.log(`  ${when(e.start_time)}  ${tense.padEnd(8)} ${String(e.name).slice(0, 44)}`);
    console.log(
      `              logo ${e.event_logo?.image_id ? "yes" : "no "}` +
      `   stream ${e.live_stream_url ? "yes" : "no "}` +
      `   games ${String(games.length).padStart(3)}` +
      `${games.length ? `  e.g. ${games.slice(0, 3).map(g => g.name).join(", ").slice(0, 60)}` : ""}`
    );
  }

  console.log(`\n  of ${recent.length}:  ${withLogo} have a logo, ${withStream} a stream link, ${withGames} at least one game`);
  console.log(`
  A card needs a name and a date, which every row has by definition. A logo is
  what makes it a card rather than a list item, and the games are the only part
  that ties this row to the rest of the app — a showcase with no games attached
  is a link to somebody else's video.
`);
}

// --- 3. the logo url shape ----------------------------------------------------

console.log("=== 3. event logo urls ===\n");

const logos = await igdbRequest("event_logos", "fields image_id, url, width, height; limit 3;");
if (Array.isArray(logos)) {
  for (const l of logos) console.log(`  ${JSON.stringify(l)}`);
  console.log(`
  Expect the same //images.igdb.com/.../t_thumb/<id>.jpg shape as covers, which
  src/igdb.js already builds correctly. Confirmed rather than assumed, because
  that helper was written for covers and screenshots and nothing has ever passed
  it a logo.
`);
} else {
  console.log(`  failed: ${JSON.stringify(logos).slice(0, 160)}\n`);
}

// --- 4. do events carry links other than a stream? ---------------------------

console.log("=== 4. event_networks — where else an event points ===\n");

const nets = await igdbRequest("event_networks", "fields event, url, network_type; limit 6;");
if (Array.isArray(nets)) {
  for (const n of nets) console.log(`  ${JSON.stringify(n)}`);
  console.log(`
  network_type is an id into a vocabulary this project has not read. If a row
  needs "watch it here", the type has to be resolved rather than guessed — a
  Twitter link and a YouTube link would otherwise be rendered the same.
`);
} else {
  console.log(`  failed: ${JSON.stringify(nets).slice(0, 160)}\n`);
}

console.log("---\nNothing written. Evidence for decision 0008.\n");
