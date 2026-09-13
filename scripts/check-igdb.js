/**
 * Offline checks for the IGDB transport's pure parts. No token, no network.
 *
 * Two of the three things in this file end up inside an attribute a browser
 * acts on — an `img src` and an `iframe src` — carrying values a third party
 * wrote. That is the reason they are checked, more than the URL shaping.
 *
 *   node scripts/check-igdb.js
 */

import { imageUrl, youTubeUrl, IMAGE_SIZES } from "../src/igdb.js";

let passed = 0;
const failures = [];

function check(name, fn) {
  try { fn(); passed++; }
  catch (e) { failures.push(`${name}\n    ${e.message}`); }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || "assertion failed"); }

// --- fixtures ----------------------------------------------------------------
// Copied from a real response printed by scripts/probe-igdb.js, not invented.

const COVER = { id: 569750, url: "//images.igdb.com/igdb/image/upload/t_thumb/coc7me.jpg", image_id: "coc7me" };
const SHOT = { id: 1854694, url: "//images.igdb.com/igdb/image/upload/t_thumb/sc13r3a.jpg", image_id: "sc13r3a" };

// --- images -------------------------------------------------------------------

check("an image_id builds a full url", () => {
  const u = imageUrl(COVER, "cover");
  assert(u === `https://images.igdb.com/igdb/image/upload/t_cover_big/coc7me.jpg`, `got ${u}`);
});

check("a scheme-less url gets https", () => {
  const u = imageUrl(COVER.url, "card");
  assert(u.startsWith("https://"), `got ${u}`);
});

check("the size token is replaced, not appended", () => {
  const u = imageUrl(SHOT.url, "screenshot");
  assert(u.includes("/t_screenshot_big/"), `got ${u}`);
  assert(!u.includes("t_thumb"), "the thumbnail token must be gone");
});

check("an unknown size falls back rather than producing a broken token", () => {
  const u = imageUrl(COVER, "enormous");
  assert(u.includes(`/${IMAGE_SIZES.card}/`), `got ${u}`);
});

check("image_id wins over url when both are present", () => {
  // Building from the id cannot be defeated by an unexpected url shape.
  const odd = { url: "https://example.com/not-igdb.png", image_id: "coc7me" };
  const u = imageUrl(odd, "cover");
  assert(u.includes("images.igdb.com"), `got ${u}`);
  assert(u.includes("coc7me"), `got ${u}`);
});

check("only the size segment is rewritten", () => {
  const u = imageUrl("//images.igdb.com/igdb/image/upload/t_thumb/at_thumbxy.jpg", "cover");
  assert(u.endsWith("/at_thumbxy.jpg"), `the id was corrupted: ${u}`);
  assert(u.includes("/t_cover_big/"), `got ${u}`);
});

check("a filename that looks like a size token is left alone", () => {
  // This is the case the slash anchoring exists for, and the one the check
  // above does NOT catch: without a size segment to match, an unanchored
  // pattern rewrites the filename and the image 404s.
  //
  // Written after the first version of this suite survived removing the
  // anchoring. A check that cannot fail for the thing it claims to test is not
  // a check — the rule is already in CLAUDE.md from turn 001 and it applies to
  // my own checks as readily as to a gate.
  const u = imageUrl("//images.igdb.com/igdb/image/upload/t_thumbxy.jpg", "cover");
  assert(u === "https://images.igdb.com/igdb/image/upload/t_thumbxy.jpg", `got ${u}`);
});

check("nothing shapeable returns null rather than a broken src", () => {
  assert(imageUrl(null) === null);
  assert(imageUrl(undefined) === null);
  assert(imageUrl("") === null);
  assert(imageUrl({}) === null);
  assert(imageUrl({ url: null, image_id: null }) === null);
  assert(imageUrl(42) === null);
});

// --- video --------------------------------------------------------------------
//
// This value goes into an iframe src. A third party wrote it.

check("a real video id becomes an embed url", () => {
  const u = youTubeUrl({ video_id: "vTaD8maruNs" });
  assert(u === "https://www.youtube.com/embed/vTaD8maruNs", `got ${u}`);
});

check("a bare string id works too", () => {
  assert(youTubeUrl("dmDD7JSfhcE") === "https://www.youtube.com/embed/dmDD7JSfhcE");
});

check("an id of the wrong length is refused", () => {
  assert(youTubeUrl({ video_id: "short" }) === null);
  assert(youTubeUrl({ video_id: "waytoolongtobeanid" }) === null);
});

check("anything outside the id alphabet is refused", () => {
  // The failure being guarded against: a value that escapes the src attribute
  // or points the iframe somewhere else entirely.
  assert(youTubeUrl({ video_id: "abc/../../def" }) === null);
  assert(youTubeUrl({ video_id: 'a" onload="x' }) === null);
  assert(youTubeUrl({ video_id: "abcdefghij?" }) === null);
  assert(youTubeUrl({ video_id: "../evilvideo" }) === null);
});

check("absent video is null rather than an empty embed", () => {
  assert(youTubeUrl(null) === null);
  assert(youTubeUrl({}) === null);
  assert(youTubeUrl({ video_id: null }) === null);
  assert(youTubeUrl(undefined) === null);
});

// --- report -------------------------------------------------------------------

console.log(`\n${passed} checks passed, ${failures.length} failed\n`);
if (failures.length) {
  for (const f of failures) console.log(`FAILED  ${f}\n`);
  process.exit(1);
}
console.log("Transport only. The token flow and the rate limiter need a network and");
console.log("are exercised by scripts/inspect-igdb.js, which costs real requests.");
