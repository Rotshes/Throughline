/**
 * Offline checks for the showcase row. No key, no network, no cost.
 *
 * The failure this row is most likely to produce is not a crash. It is a card
 * that looks fine and says something the data does not support — a date in the
 * wrong tense, a "watch" link that goes somewhere else, a count of games that
 * came from an array of something other than ids.
 *
 *   node scripts/check-events.js
 */

import { shapeEvent, showable, safeHttpUrl } from "../src/events.js";

let passed = 0;
const failures = [];

function check(name, fn) {
  try { fn(); passed++; }
  catch (e) { failures.push(`${name}\n    ${e.message}`); }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || "assertion failed"); }

// --- fixtures ----------------------------------------------------------------
// The shape scripts/probe-events.js printed, not invented.

const RAW = {
  id: 289,
  name: "Nintendo Direct 2026.09.09 + Nintendo Treehouse",
  slug: "nintendo-direct-2026-09-09",
  start_time: 1789000000,
  end_time: 1789003600,
  time_zone: "PST",
  live_stream_url: "https://www.youtube.com/watch?v=CSxqwnlCi0k",
  event_logo: { image_id: "elbo", width: 1920, height: 1080 },
  games: [119388, 14119, 76882],
};

// --- the ordinary case --------------------------------------------------------

check("an event becomes a card", () => {
  const e = shapeEvent(RAW);
  assert(e.id === 289 && e.name.startsWith("Nintendo Direct"));
  assert(e.gameCount === 3, `got ${e.gameCount}`);
  assert(e.stream === "https://www.youtube.com/watch?v=CSxqwnlCi0k");
});

check("the logo is built through the same helper as a cover", () => {
  // That helper was written for covers and screenshots and had never been handed
  // a logo. The probe confirmed the URL shape is identical; this holds it there.
  const e = shapeEvent(RAW);
  assert(e.logo === "https://images.igdb.com/igdb/image/upload/t_720p/elbo.jpg", e.logo);
});

check("the start time becomes a date, not a number", () => {
  const e = shapeEvent(RAW);
  assert(/^\d{4}-\d{2}-\d{2}$/.test(e.startedAt), `got ${e.startedAt}`);
});

check("games are counted, not carried", () => {
  // A single indie showcase listed 219. A rail of twelve cards has no use for
  // two hundred ids, and the panel fetches the records when one is opened.
  const e = shapeEvent({ ...RAW, games: Array.from({ length: 219 }, (_, i) => i + 1) });
  assert(e.gameCount === 219);
  assert(!("games" in e), "the id list must not travel to the browser");
});

check("non-integer entries in the games array are not counted", () => {
  const e = shapeEvent({ ...RAW, games: [1, null, "2", 3, undefined] });
  assert(e.gameCount === 2, `got ${e.gameCount}`);
});

// --- the stream link ------------------------------------------------------------
//
// Third-party text landing in an href.

check("a javascript: stream url is refused", () => {
  assert(shapeEvent({ ...RAW, live_stream_url: "javascript:alert(1)" }).stream === null);
});

check("data: and file: are refused", () => {
  assert(safeHttpUrl("data:text/html,<script>alert(1)</script>") === null);
  assert(safeHttpUrl("file:///etc/passwd") === null);
});

check("an absent stream is null rather than a broken link", () => {
  assert(shapeEvent({ ...RAW, live_stream_url: null }).stream === null);
  assert(shapeEvent({ ...RAW, live_stream_url: 42 }).stream === null);
  assert(safeHttpUrl("") === null);
  assert(safeHttpUrl(null) === null);
});

// --- what is not worth a card ----------------------------------------------------

check("a showcase with no logo is not shown", () => {
  // It would be a line of text in a row of pictures.
  assert(showable(shapeEvent({ ...RAW, event_logo: null })) === false);
});

check("a showcase with no games is not shown", () => {
  // The games are the only thing tying this row to the rest of the app. Without
  // them the card is a link to somebody else's video.
  assert(showable(shapeEvent({ ...RAW, games: [] })) === false);
  assert(showable(shapeEvent({ ...RAW, games: null })) === false);
});

check("a showcase with both is shown", () => {
  assert(showable(shapeEvent(RAW)) === true);
});

check("showable tolerates nothing at all", () => {
  assert(showable(null) === false);
  assert(showable(undefined) === false);
});

// --- malformed records -------------------------------------------------------------

check("a record with no id or no name is refused", () => {
  assert(shapeEvent({ name: "No id", games: [1] }) === null);
  assert(shapeEvent({ id: 1, games: [1] }) === null, "a nameless showcase cannot be labelled");
  assert(shapeEvent({ id: "289", name: "x" }) === null, "a string id is not an id");
  assert(shapeEvent(null) === null);
});

check("a record with nothing but an id and a name still shapes", () => {
  const e = shapeEvent({ id: 7, name: "A Showcase" });
  assert(e !== null);
  assert(e.startedAt === null && e.logo === null && e.stream === null && e.gameCount === 0);
  // ... and is then refused by showable, which is the right division: shaping
  // says what the record is, showing says whether it is worth a card.
  assert(showable(e) === false);
});

check("a missing start time is null rather than 1970", () => {
  // `new Date(undefined * 1000)` is Invalid Date and `new Date(0)` is 1970.
  // Either would render as a date on a card in a row about recency.
  assert(shapeEvent({ ...RAW, start_time: null }).startedAt === null);
  assert(shapeEvent({ ...RAW, start_time: undefined }).startedAt === null);
  assert(shapeEvent({ ...RAW, start_time: "1789000000" }).startedAt === null, "a string is not a timestamp");
});

// --- report -------------------------------------------------------------------------

console.log(`\n${passed} checks passed, ${failures.length} failed\n`);
if (failures.length) {
  for (const f of failures) console.log(`FAILED  ${f}\n`);
  process.exit(1);
}
console.log("Offline, against fixtures. That the events data is current — 33 in ninety");
console.log("days and zero in the future — was established by scripts/probe-events.js,");
console.log("and no check here can keep it true.");
