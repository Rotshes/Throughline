/**
 * Offline checks for the detail panel's shaping. No token, no network, no cost.
 *
 * Rewritten for IGDB — decision 0006. The previous version checked a two-request
 * RAWG shape: a game record plus a separate screenshots response, merged. IGDB
 * answers in one, so the merge is gone and two new things arrive that need
 * watching more closely than anything the old shape had.
 *
 * `shapeDetail` is the only code between a third party's JSON and a panel a
 * person reads, and two of its outputs land in attributes a browser acts on:
 *
 *   website  ->  an href, where `javascript:` runs
 *   videos   ->  an iframe src, where the wrong id points the frame anywhere
 *
 * The rest is the ordinary failure mode of shaping third-party data: a missing
 * publisher must not take the whole panel down.
 *
 *   node scripts/check-detail.js
 */

import { shapeDetail, safeHttpUrl, firstOfficialSite } from "../src/detail.js";

let passed = 0;
const failures = [];

function check(name, fn) {
  try { fn(); passed++; }
  catch (e) { failures.push(`${name}\n    ${e.message}`); }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || "assertion failed"); }

// --- fixtures ----------------------------------------------------------------
// Shaped like a real IGDB response and not taken from one. A check that reads
// live data is a check that fails when someone else's server is slow.

const VOCAB = {
  genreIdBySlug: new Map([["puzzle", 9]]),
  facetBySlug: new Map([
    ["horror", { id: 19, field: "themes" }],
    ["split-screen", { id: 4, field: "game_modes" }],
  ]),
  machineIdBySlug: new Map([["ngc", 21], ["win", 6]]),
  familyByMachine: new Map([["ngc", "nintendo"], ["win", "pc"]]),
  facetSlugs: new Set(["horror", "split-screen"]),
  excludedThemeIds: [42],
};

const FULL = {
  id: 1029,
  name: "A Game",
  slug: "a-game",
  summary:
    "A first sentence that is long enough to be worth keeping on its own, well past the floor. " +
    "A second sentence. " + "Filler. ".repeat(300),
  storyline: "A plot nobody asked for.",
  first_release_date: 1554163200,
  aggregated_rating: 91.6,
  aggregated_rating_count: 12,
  rating_count: 430,
  cover: { image_id: "cover1" },
  screenshots: [{ image_id: "sc1" }, { image_id: "sc2" }],
  artworks: [{ image_id: "art1" }],
  videos: [{ video_id: "vTaD8maruNs", name: "Launch trailer" }, { video_id: "dmDD7JSfhcE", name: "Gameplay" }],
  genres: [{ slug: "puzzle" }],
  themes: [{ slug: "horror" }],
  game_modes: [{ slug: "split-screen" }],
  platforms: [{ slug: "ngc" }],
  involved_companies: [
    { company: { name: "Dev One" }, developer: true },
    { company: { name: "Dev Two" }, developer: true },
    { company: { name: "Dev Three" }, developer: true },
    { company: { name: "Dev Four" }, developer: true },
    { company: { name: "Pub One" }, publisher: true },
    { company: { name: "Pub Two" }, publisher: true },
    { company: { name: "Pub Three" }, publisher: true },
  ],
  websites: [
    { category: 13, url: "https://store.steampowered.com/app/1" },
    { category: 1, url: "https://example.com/a-game" },
  ],
};

// --- the ordinary case --------------------------------------------------------

check("a full record shapes into a panel", () => {
  const d = shapeDetail(FULL, VOCAB);
  assert(d.id === 1029 && d.title === "A Game");
  assert(d.released === "2019-04-02", `got ${d.released}`);
  assert(d.criticScore === 92, `91.6 rounds to 92, got ${d.criticScore}`);
  assert(d.criticReviews === 12);
  assert(d.machines.join() === "ngc");
  assert(d.platforms.join() === "nintendo", "the family comes from the pinned tree");
});

check("the synopsis is trimmed and ends at a sentence", () => {
  const d = shapeDetail(FULL, VOCAB);
  assert(d.synopsis.length <= 1200, `got ${d.synopsis.length}`);
  assert(/[.!?]$/.test(d.synopsis) || d.synopsis.endsWith("…"), "cut somewhere sensible");
});

check("summary wins over storyline", () => {
  // The storyline is often a plot description and occasionally a spoiler. It is
  // a fallback, not a supplement.
  const d = shapeDetail(FULL, VOCAB);
  assert(!d.synopsis.includes("nobody asked for"), d.synopsis);
});

check("storyline is used when there is no summary at all", () => {
  const d = shapeDetail({ ...FULL, summary: null }, VOCAB);
  assert(d.synopsis === "A plot nobody asked for.", `got ${d.synopsis}`);
});

check("the vocabulary is applied to labels", () => {
  const d = shapeDetail({ ...FULL, themes: [{ slug: "horror" }, { slug: "unknown-theme" }] }, VOCAB);
  assert(d.tags.includes("horror"));
  assert(!d.tags.includes("unknown-theme"), `got ${d.tags}`);
});

check("developers and publishers are separated and capped", () => {
  // IGDB puts both in one involved_companies array with boolean flags. Reading
  // the array without the flags would list a publisher as a developer.
  const d = shapeDetail(FULL, VOCAB);
  assert(d.developers.length === 3, `three developers at most, got ${d.developers.length}`);
  assert(d.publishers.length === 2, `two publishers at most, got ${d.publishers.length}`);
  assert(!d.developers.includes("Pub One"), "a publisher is not a developer");
  assert(d.publishers[0] === "Pub One", `got ${d.publishers}`);
});

// --- the gallery --------------------------------------------------------------

check("the header is the first screenshot and the gallery is the rest", () => {
  // The display image is a screenshot rather than the cover — a cover is
  // portrait box art and every frame in this interface is 16:9. So the first
  // screenshot is shown above and the gallery carries what is left: one more
  // screenshot and one artwork.
  const d = shapeDetail(FULL, VOCAB);
  assert(d.image.includes("sc1"), `the header should be the first screenshot, got ${d.image}`);
  assert(d.gallery.length === 2, `got ${d.gallery.length}`);
  assert(d.gallery.every(u => u.startsWith("https://images.igdb.com/")), d.gallery.join(" "));
  assert(!d.gallery.some(u => u.includes("cover1")), "box art is not a gallery picture");
});

check("the header image is not repeated in the gallery", () => {
  const d = shapeDetail({ ...FULL, screenshots: [{ image_id: "sc1" }, { image_id: "sc2" }], artworks: [] }, VOCAB);
  assert(d.gallery.length === 1, `sc1 is shown above, not again — got ${d.gallery.length}`);
  assert(d.gallery[0].includes("sc2"), d.gallery[0]);
});

check("duplicate images collapse", () => {
  const d = shapeDetail({ ...FULL, screenshots: [{ image_id: "sc1" }, { image_id: "sc1" }, { image_id: "sc2" }], artworks: [] }, VOCAB);
  assert(d.gallery.length === 1, `sc1 is the header, sc2 is the gallery — got ${d.gallery.length}`);
});

check("a game with no screenshots falls back to box art rather than no picture", () => {
  const d = shapeDetail({ ...FULL, screenshots: [], artworks: [] }, VOCAB);
  assert(d.image !== null, "a panel with no picture at all is worse than a letterboxed one");
  assert(d.image.includes("cover1"), d.image);
});

check("the gallery is capped at eight", () => {
  const many = Array.from({ length: 25 }, (_, i) => ({ image_id: `s${i}` }));
  const d = shapeDetail({ ...FULL, screenshots: many, artworks: [] }, VOCAB);
  assert(d.gallery.length === 8, `got ${d.gallery.length}`);
});

check("an image row with no id is skipped rather than rendered empty", () => {
  const d = shapeDetail({
    ...FULL,
    screenshots: [{}, { image_id: null }, { image_id: "sc1" }, { image_id: "sc2" }],
    artworks: [],
  }, VOCAB);
  assert(d.image.includes("sc1"), `the header skips the empty rows too, got ${d.image}`);
  assert(d.gallery.length === 1, `got ${d.gallery.length}`);
});

// --- video, which lands in an iframe src ----------------------------------------

check("videos become embed urls and keep their names", () => {
  const d = shapeDetail(FULL, VOCAB);
  assert(d.videos.length === 2, `got ${d.videos.length}`);
  assert(d.videos[0].url === "https://www.youtube.com/embed/vTaD8maruNs", d.videos[0].url);
  assert(d.videos[0].name === "Launch trailer");
});

check("a video id outside YouTube's alphabet is dropped", () => {
  // The value is written by a third party and ends up in an iframe src.
  const d = shapeDetail({
    ...FULL,
    videos: [{ video_id: "../../evil" }, { video_id: 'x" onload="' }, { video_id: "vTaD8maruNs" }],
  }, VOCAB);
  assert(d.videos.length === 1, `got ${JSON.stringify(d.videos)}`);
  assert(d.videos[0].url.endsWith("vTaD8maruNs"));
});

check("videos are capped at three", () => {
  const many = Array.from({ length: 9 }, (_, i) => ({ video_id: `vTaD8maruN${i}` }));
  const d = shapeDetail({ ...FULL, videos: many }, VOCAB);
  assert(d.videos.length === 3, `got ${d.videos.length}`);
});

check("a video with no name still plays", () => {
  const d = shapeDetail({ ...FULL, videos: [{ video_id: "vTaD8maruNs" }] }, VOCAB);
  assert(d.videos[0].name === null);
  assert(d.videos[0].url.length > 0);
});

check("no videos is an empty list, not a null the panel has to guard", () => {
  const d = shapeDetail({ ...FULL, videos: null }, VOCAB);
  assert(Array.isArray(d.videos) && d.videos.length === 0);
});

// --- the href -------------------------------------------------------------------

check("the official site is chosen over a store page", () => {
  // IGDB website category 1 is official. Everything else is a storefront, a
  // subreddit or a social account, and "Official site" on a button means one
  // specific thing.
  const d = shapeDetail(FULL, VOCAB);
  assert(d.website === "https://example.com/a-game", `got ${d.website}`);
});

check("no official site means no link rather than the first one going", () => {
  const d = shapeDetail({ ...FULL, websites: [{ category: 13, url: "https://store.example/x" }] }, VOCAB);
  assert(d.website === null, `got ${d.website}`);
});

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
  assert(safeHttpUrl(42) === null);
  assert(firstOfficialSite(null) === null);
  assert(firstOfficialSite("not an array") === null);
});

check("a refused website never reaches the panel", () => {
  const d = shapeDetail({ ...FULL, websites: [{ category: 1, url: "javascript:alert(1)" }] }, VOCAB);
  assert(d.website === null, `got ${d.website}`);
});

// --- what is missing ------------------------------------------------------------

check("a record with nothing but an id still shapes", () => {
  const d = shapeDetail({ id: 7 }, VOCAB);
  assert(d !== null, "does not throw and does not return null");
  assert(d.synopsis === null && d.developers.length === 0 && d.gallery.length === 0);
  assert(d.criticScore === null && d.website === null);
});

check("a record with no id is refused", () => {
  assert(shapeDetail(null, VOCAB) === null);
  assert(shapeDetail({ name: "No id" }, VOCAB) === null);
  assert(shapeDetail({ id: "1029" }, VOCAB) === null, "a string id is not an id");
});

check("a company entry with no name does not appear as a null", () => {
  const d = shapeDetail({
    ...FULL,
    involved_companies: [{ developer: true }, { company: {}, developer: true }, { company: { name: "Real" }, developer: true }],
  }, VOCAB);
  assert(d.developers.join() === "Real", `got ${JSON.stringify(d.developers)}`);
});

// --- report -----------------------------------------------------------------------

console.log(`\n${passed} checks passed, ${failures.length} failed\n`);
if (failures.length) {
  for (const f of failures) console.log(`FAILED  ${f}\n`);
  process.exit(1);
}
console.log("These run against fixtures. Whether the catalogue still returns records");
console.log("this shape is a different question — scripts/inspect-igdb.js asks it.");
