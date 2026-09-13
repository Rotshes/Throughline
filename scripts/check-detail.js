/**
 * Offline checks for the detail panel's shaping. No key, no network, no cost.
 *
 * `shapeDetail` is the only code between a third party's JSON and a panel a
 * person reads, and every field in it is optional on the way in. The failure
 * mode it guards against is not a wrong answer — it is a missing publisher
 * taking the whole panel down.
 *
 * The `safeHttpUrl` cases are a different kind of check. `website` is a string
 * a third party wrote, and it goes into an href. An href is the one place text
 * from the catalogue stops being inert: `javascript:` in one runs.
 *
 *   node scripts/check-detail.js
 */

import { shapeDetail, safeHttpUrl } from "../src/detail.js";

let passed = 0;
const failures = [];

function check(name, fn) {
  try { fn(); passed++; }
  catch (e) { failures.push(`${name}\n    ${e.message}`); }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || "assertion failed"); }

// --- fixture -----------------------------------------------------------------
// Shaped like a real /games/{id} response and not taken from one. A check that
// reads live data is a check that fails when someone else's server is slow.

const VOCAB = new Set(["roguelike", "difficult", "split-screen"]);

const FULL = {
  id: 3498,
  slug: "a-game",
  name: "A Game",
  released: "2019-04-02",
  background_image: "https://img/header.jpg",
  description_raw:
    "A first sentence that is long enough to be worth keeping on its own, well past the floor. " +
    "A second sentence. " + "Filler. ".repeat(300),
  metacritic: 84,
  ratings_count: 4200,
  playtime: 22,
  website: "https://example.com/a-game",
  esrb_rating: { name: "Mature" },
  developers: [{ name: "Dev One" }, { name: "Dev Two" }, { name: "Dev Three" }, { name: "Dev Four" }],
  publishers: [{ name: "Pub One" }, { name: "Pub Two" }, { name: "Pub Three" }],
  genres: [{ slug: "action" }],
  parent_platforms: [{ platform: { slug: "pc" } }],
  platforms: [{ platform: { slug: "pc" } }, { platform: { slug: "playstation4" } }],
  tags: [{ slug: "roguelike" }, { slug: "steam-achievements" }],
};

const SHOTS = [
  { id: 1, image: "https://img/one.jpg" },
  { id: 2, image: "https://img/two.jpg" },
];

// --- the ordinary case --------------------------------------------------------

check("a full record shapes into a panel", () => {
  const d = shapeDetail(FULL, SHOTS, VOCAB);
  assert(d.id === 3498, "id survives");
  assert(d.title === "A Game");
  assert(d.metacritic === 84);
  assert(d.esrb === "Mature");
  assert(d.website === "https://example.com/a-game");
});

check("the synopsis is trimmed and ends at a sentence", () => {
  const d = shapeDetail(FULL, SHOTS, VOCAB);
  assert(d.synopsis.length <= 1200, `got ${d.synopsis.length}`);
  assert(/[.!?]$/.test(d.synopsis) || d.synopsis.endsWith("…"), "cut somewhere sensible");
});

check("the vocabulary is applied to tags", () => {
  const d = shapeDetail(FULL, SHOTS, VOCAB);
  assert(d.tags.includes("roguelike"), "a known tag is kept");
  assert(!d.tags.includes("steam-achievements"), "store plumbing is dropped");
});

check("credits are capped", () => {
  const d = shapeDetail(FULL, SHOTS, VOCAB);
  assert(d.developers.length === 3, `three developers at most, got ${d.developers.length}`);
  assert(d.publishers.length === 2, `two publishers at most, got ${d.publishers.length}`);
});

// --- the gallery --------------------------------------------------------------

check("the header image is not repeated in the gallery", () => {
  const d = shapeDetail(FULL, [{ image: "https://img/header.jpg" }, ...SHOTS], VOCAB);
  assert(!d.gallery.includes("https://img/header.jpg"), "header is shown above, not again");
  assert(d.gallery.length === 2, `got ${d.gallery.length}`);
});

check("duplicate screenshots collapse", () => {
  const d = shapeDetail(FULL, [...SHOTS, ...SHOTS], VOCAB);
  assert(d.gallery.length === 2, `got ${d.gallery.length}`);
});

check("the gallery is capped at eight", () => {
  const many = Array.from({ length: 25 }, (_, i) => ({ image: `https://img/${i}.jpg` }));
  const d = shapeDetail(FULL, many, VOCAB);
  assert(d.gallery.length === 8, `got ${d.gallery.length}`);
});

check("a list record's short_screenshots still fill the gallery", () => {
  // A card handed straight to the shaper has no screenshots endpoint behind it.
  const listRecord = { ...FULL, short_screenshots: [{ image: "https://img/short.jpg" }] };
  const d = shapeDetail(listRecord, [], VOCAB);
  assert(d.gallery.includes("https://img/short.jpg"));
});

check("a screenshot the catalogue has withdrawn is not shown", () => {
  // `is_deleted` was found by printing a real screenshots response, not by
  // reading a field list. Anything but an explicit `true` is shown — an absent
  // flag means present, and a missing field must not empty the gallery.
  const d = shapeDetail(FULL, [
    { image: "https://img/gone.jpg", is_deleted: true },
    { image: "https://img/kept.jpg", is_deleted: false },
    { image: "https://img/noflag.jpg" },
  ], VOCAB);
  assert(!d.gallery.includes("https://img/gone.jpg"), "withdrawn image is dropped");
  assert(d.gallery.includes("https://img/kept.jpg"), "is_deleted:false is kept");
  assert(d.gallery.includes("https://img/noflag.jpg"), "an absent flag means present");
});

check("a screenshot row with no image is skipped rather than rendered empty", () => {
  const d = shapeDetail(FULL, [{ id: 9 }, { image: null }, ...SHOTS], VOCAB);
  assert(d.gallery.length === 2, `got ${d.gallery.length}`);
});

// --- what is missing ----------------------------------------------------------

check("a record with nothing but an id still shapes", () => {
  const d = shapeDetail({ id: 7 }, [], VOCAB);
  assert(d !== null, "does not throw and does not return null");
  assert(d.synopsis === null && d.developers.length === 0 && d.gallery.length === 0);
});

check("a record with no id is refused", () => {
  assert(shapeDetail({ name: "No id" }, [], VOCAB) === null);
  assert(shapeDetail(null, [], VOCAB) === null);
  assert(shapeDetail({ id: "3498" }, [], VOCAB) === null, "a string id is not an id");
});

check("screenshots that are not an array are survivable", () => {
  const d = shapeDetail(FULL, null, VOCAB);
  assert(d !== null && Array.isArray(d.gallery));
});

check("developers shaped as strings rather than objects do not appear as nulls", () => {
  const d = shapeDetail({ ...FULL, developers: ["Dev One", { name: "Dev Two" }] }, [], VOCAB);
  assert(d.developers.length === 1 && d.developers[0] === "Dev Two", `got ${JSON.stringify(d.developers)}`);
});

// --- playtime -----------------------------------------------------------------
//
// The catalogue writes 0 for "no figure". Every reader of that field has to know
// it, so the ambiguity is resolved here once instead of in each of them.

check("playtime 0 becomes null rather than a very short game", () => {
  const d = shapeDetail({ ...FULL, playtime: 0 }, [], VOCAB);
  assert(d.playtime === null, `got ${d.playtime}`);
});

check("a real playtime survives", () => {
  const d = shapeDetail(FULL, [], VOCAB);
  assert(d.playtime === 22, `got ${d.playtime}`);
});

// --- the href -----------------------------------------------------------------

check("http and https addresses are kept", () => {
  assert(safeHttpUrl("https://example.com/x") === "https://example.com/x");
  assert(safeHttpUrl("http://example.com/x") === "http://example.com/x");
});

check("a javascript: url is refused", () => {
  assert(safeHttpUrl("javascript:alert(1)") === null);
  assert(safeHttpUrl("JavaScript:alert(1)") === null, "scheme comparison is case-insensitive");
});

check("data: and file: are refused", () => {
  assert(safeHttpUrl("data:text/html,<script>alert(1)</script>") === null);
  assert(safeHttpUrl("file:///etc/passwd") === null);
});

check("nonsense and absent values are refused rather than thrown on", () => {
  assert(safeHttpUrl("") === null);
  assert(safeHttpUrl("not a url") === null);
  assert(safeHttpUrl(null) === null);
  assert(safeHttpUrl(undefined) === null);
  assert(safeHttpUrl(42) === null);
});

check("a refused website never reaches the panel", () => {
  const d = shapeDetail({ ...FULL, website: "javascript:alert(1)" }, [], VOCAB);
  assert(d.website === null, `got ${d.website}`);
});

// --- report -------------------------------------------------------------------

console.log(`\n${passed} checks passed, ${failures.length} failed\n`);
if (failures.length) {
  for (const f of failures) console.log(`FAILED  ${f}\n`);
  process.exit(1);
}
console.log("These run against fixtures. They say nothing about whether the catalogue");
console.log("still returns records this shape — scripts/probe-front.js is what asks that.");
