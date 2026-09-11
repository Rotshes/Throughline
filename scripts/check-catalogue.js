/**
 * Offline checks for the catalogue module. No key, no network, no cost.
 *
 * Every assertion runs against a fixture defined in this file. Nothing here
 * reads data/, and nothing here makes a request — CLAUDE.md, and pitfall 14: a
 * check that depends on mutable data stops being a check. The catalogue is now a
 * live external service, which makes that rule stricter rather than looser.
 *
 * What these can catch: the filter builder accepting bad input, the normaliser
 * breaking on a missing field, the exclusion missing an id.
 *
 * What these cannot catch: whether RAWG returns the fields the normaliser reads.
 * That is scripts/inspect-catalogue.js, and it needs a key and a network.
 *
 *   node scripts/check-catalogue.js
 */

import {
  buildPoolQuery,
  toCandidate,
  narrowTags,
  usable,
  excludePlayed,
  rankByTagMatch,
  dominanceReport,
  MIN_RATINGS,
} from "../src/catalogue.js";

let passed = 0;
const failures = [];

function check(name, fn) {
  try {
    fn();
    passed++;
  } catch (e) {
    failures.push(`${name}\n    ${e.message}`);
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || "assertion failed");
}

function throws(fn, matching) {
  let threw = null;
  try { fn(); } catch (e) { threw = e; }
  assert(threw, "expected a throw, got none");
  if (matching) {
    assert(
      threw.message.includes(matching),
      `expected message containing "${matching}", got "${threw.message}"`
    );
  }
}

// --- fixtures ---------------------------------------------------------------
// A record shaped the way the catalogue is believed to return one. Believed,
// not verified — see the header. Kept minimal and explicit so a change to the
// normaliser cannot quietly change what is being asserted.

const rawFull = {
  id: 3498,
  name: "Fixture Game",
  released: "2013-09-17",
  background_image: "https://example.invalid/a.jpg",
  short_screenshots: [
    { id: 1, image: "https://example.invalid/1.jpg" },
    { id: 2, image: "https://example.invalid/2.jpg" },
  ],
  parent_platforms: [
    { platform: { id: 1, slug: "pc", name: "PC" } },
    { platform: { id: 2, slug: "playstation", name: "PlayStation" } },
  ],
  // The machines under those families. A game is on "PlayStation" and on a
  // "PlayStation 5"; the two lists are filtered by different parameters.
  platforms: [
    { platform: { id: 4, slug: "pc", name: "PC" } },
    { platform: { id: 187, slug: "playstation5", name: "PlayStation 5" } },
  ],
  genres: [
    { id: 4, slug: "action", name: "Action" },
    { id: 3, slug: "adventure", name: "Adventure" },
  ],
  tags: [
    { slug: "singleplayer" },
    { slug: "atmospheric" },
    // The noise a real record carries: store plumbing and non-English
    // duplicates of tags the same game already has. Observed in turn 005.
    { slug: "steam-cloud" },
    { slug: "dlia-odnogo-igroka" },
    { slug: "atmosfera" },
  ],
  ratings_count: 6000,
  metacritic: 92,
};

const rawBare = { id: 99 };

/** Stands in for data/tags.json. A fixture, never the real file — pitfall 14. */
const VOCAB = new Set(["singleplayer", "atmospheric", "roguelike", "cozy", "difficult"]);

// --- buildPoolQuery ---------------------------------------------------------

check("buildPoolQuery rejects a missing category", () => {
  throws(() => buildPoolQuery({ platformIds: [1] }), "categorySlug is required");
});

check("buildPoolQuery rejects an empty platform list", () => {
  throws(
    () => buildPoolQuery({ categorySlug: "action", platformIds: [] }),
    "at least one platform id"
  );
});

check("buildPoolQuery rejects a missing platform list", () => {
  throws(() => buildPoolQuery({ categorySlug: "action" }), "at least one platform id");
});

check("buildPoolQuery rejects non-integer platform ids", () => {
  throws(
    () => buildPoolQuery({ categorySlug: "action", platformIds: ["pc"] }),
    "must be integers"
  );
});

check("buildPoolQuery joins platform ids with commas", () => {
  const q = buildPoolQuery({ categorySlug: "action", platformIds: [1, 2, 3] });
  assert(q.parent_platforms === "1,2,3", `got ${q.parent_platforms}`);
});

check("buildPoolQuery passes the category through unchanged", () => {
  const q = buildPoolQuery({ categorySlug: "role-playing-games-rpg", platformIds: [1] });
  assert(q.genres === "role-playing-games-rpg", `got ${q.genres}`);
});

check("buildPoolQuery sends family ids by default", () => {
  const q = buildPoolQuery({ categorySlug: "action", platformIds: [2] });
  assert(q.parent_platforms === "2", `got ${q.parent_platforms}`);
  assert(!("platforms" in q), "the machine parameter must be absent");
});

check("buildPoolQuery sends machine ids when asked, and only those", () => {
  const q = buildPoolQuery({ categorySlug: "action", platformIds: [187, 18], specific: true });
  assert(q.platforms === "187,18", `got ${q.platforms}`);
  // Sending both would depend on how the catalogue combines them, which this
  // project has not measured. Tags turned out to be OR when a reader expects
  // AND; no second interaction gets assumed.
  assert(!("parent_platforms" in q), "never both parameters in one request");
});

check("buildPoolQuery excludes DLC", () => {
  const q = buildPoolQuery({ categorySlug: "action", platformIds: [1] });
  assert(q.exclude_additions === "true", "DLC is not a game someone plays next");
});

check("buildPoolQuery omits tags entirely when none are given", () => {
  // `tags=` empty is a different request from no `tags` at all, and sending one
  // would be a filter the user did not set.
  const q = buildPoolQuery({ categorySlug: "action", platformIds: [1] });
  assert(!("tags" in q), "an unset filter must not appear in the query");
});

check("buildPoolQuery joins tag slugs with commas", () => {
  const q = buildPoolQuery({
    categorySlug: "action",
    platformIds: [1],
    tagSlugs: ["roguelike", "difficult"],
  });
  assert(q.tags === "roguelike,difficult", `got ${q.tags}`);
});

check("buildPoolQuery rejects a non-array tag list", () => {
  throws(
    () => buildPoolQuery({ categorySlug: "action", platformIds: [1], tagSlugs: "cozy" }),
    "must be an array"
  );
});

check("buildPoolQuery rejects empty or non-string tag slugs", () => {
  throws(
    () => buildPoolQuery({ categorySlug: "action", platformIds: [1], tagSlugs: [""] }),
    "non-empty strings"
  );
  throws(
    () => buildPoolQuery({ categorySlug: "action", platformIds: [1], tagSlugs: [7] }),
    "non-empty strings"
  );
});

check("buildPoolQuery makes no network call and reads no key", () => {
  // If this ever needs a key, the pure/impure split in the module has broken and
  // the offline checks stop being offline.
  const before = process.env.RAWG_API_KEY;
  delete process.env.RAWG_API_KEY;
  try {
    buildPoolQuery({ categorySlug: "action", platformIds: [1] });
  } finally {
    if (before !== undefined) process.env.RAWG_API_KEY = before;
  }
});

// --- toCandidate ------------------------------------------------------------

check("toCandidate rejects a record with no id", () => {
  assert(toCandidate({ name: "x" }) === null);
  assert(toCandidate(null) === null);
  assert(toCandidate({ id: "3498" }) === null, "a string id is not an id");
});

check("toCandidate maps every field it is asked for", () => {
  const c = toCandidate(rawFull);
  assert(c.id === 3498, "id");
  assert(c.title === "Fixture Game", "title");
  assert(c.released === "2013-09-17", "released");
  assert(c.image === "https://example.invalid/a.jpg", "image");
  assert(c.screenshots.length === 2, "screenshots");
  assert(c.ratingCount === 6000, "ratingCount");
  assert(c.metacritic === 92, "metacritic");
});

check("toCandidate flattens parent platforms to slugs", () => {
  const c = toCandidate(rawFull);
  assert(c.platforms.join(",") === "pc,playstation", `got ${c.platforms}`);
});

check("toCandidate keeps the machines separately from the families", () => {
  const c = toCandidate(rawFull);
  assert(c.machines.join(",") === "pc,playstation5", `got ${c.machines}`);
  assert(c.platforms.length !== c.machines.length || c.platforms[1] !== c.machines[1],
    "families and machines must not be the same list");
});

check("toCandidate defaults machines to empty rather than undefined", () => {
  assert(Array.isArray(toCandidate(rawBare).machines));
  assert(toCandidate(rawBare).machines.length === 0);
});

check("toCandidate flattens genres to slugs", () => {
  const c = toCandidate(rawFull);
  assert(c.categories.join(",") === "action,adventure", `got ${c.categories}`);
});

check("toCandidate survives every optional field being absent", () => {
  const c = toCandidate(rawBare);
  assert(c !== null, "a bare record still has an id and is still a record");
  assert(c.platforms.length === 0, "platforms defaults to empty, not undefined");
  assert(c.categories.length === 0, "categories defaults to empty");
  assert(c.screenshots.length === 0, "screenshots defaults to empty");
  assert(c.tags.length === 0, "tags defaults to empty");
  assert(c.ratingCount === 0, "ratingCount defaults to 0, not undefined");
  assert(c.title === null && c.image === null && c.released === null);
});

check("toCandidate drops malformed entries inside arrays", () => {
  const c = toCandidate({
    id: 1,
    parent_platforms: [{ platform: { slug: "pc" } }, {}, null, { platform: {} }],
    genres: [null, { slug: "indie" }],
    short_screenshots: [{ image: "https://example.invalid/1.jpg" }, {}, null],
  });
  assert(c.platforms.join(",") === "pc", `got ${c.platforms}`);
  assert(c.categories.join(",") === "indie", `got ${c.categories}`);
  assert(c.screenshots.length === 1, `got ${c.screenshots.length}`);
});

check("toCandidate always reports no video", () => {
  // RAWG's free tier has no trailers. This asserts the honest null rather than
  // letting a later reader assume the field is merely unpopulated for this game.
  assert(toCandidate(rawFull).video === null);
  assert(toCandidate(rawBare).video === null);
});

// --- narrowTags ---------------------------------------------------------------

check("narrowTags keeps only vocabulary entries", () => {
  const got = narrowTags(rawFull.tags, VOCAB);
  assert(got.join(",") === "singleplayer,atmospheric", `got ${got}`);
});

check("narrowTags drops store plumbing and non-English duplicates", () => {
  const got = narrowTags(rawFull.tags, VOCAB);
  assert(!got.includes("steam-cloud"), "steam-cloud is not a reason to play a game");
  assert(!got.includes("dlia-odnogo-igroka"), "the record already carries singleplayer");
  assert(!got.includes("atmosfera"), "the record already carries atmospheric");
});

check("narrowTags accepts a plain array as a vocabulary", () => {
  assert(narrowTags(rawFull.tags, ["atmospheric"]).join(",") === "atmospheric");
});

check("narrowTags keeps everything when no vocabulary is given", () => {
  // Inspection scripts only. The pipeline always passes one.
  assert(narrowTags(rawFull.tags).length === 5);
});

check("narrowTags accepts bare strings as well as objects", () => {
  assert(narrowTags(["cozy", "steam-cloud"], VOCAB).join(",") === "cozy");
});

check("narrowTags survives junk", () => {
  assert(narrowTags(null, VOCAB).length === 0);
  assert(narrowTags(undefined, VOCAB).length === 0);
  assert(narrowTags([null, {}, { slug: "cozy" }], VOCAB).join(",") === "cozy");
});

check("toCandidate narrows tags through the vocabulary", () => {
  const c = toCandidate(rawFull, VOCAB);
  assert(c.tags.join(",") === "singleplayer,atmospheric", `got ${c.tags}`);
});

// --- usable -----------------------------------------------------------------

check("usable accepts a well-formed popular candidate", () => {
  assert(usable(toCandidate(rawFull)) === true);
});

check("usable rejects a candidate with no title", () => {
  assert(usable({ title: null, platforms: ["pc"], ratingCount: 9999 }) === false);
});

check("usable rejects a candidate on no platform", () => {
  assert(usable({ title: "x", platforms: [], ratingCount: 9999 }) === false);
});

check("usable rejects an obscure candidate", () => {
  assert(usable({ title: "x", platforms: ["pc"], ratingCount: MIN_RATINGS - 1 }) === false);
});

check("usable accepts exactly at the threshold", () => {
  // Stated so that moving MIN_RATINGS is a deliberate act with a visible effect,
  // rather than an off-by-one nobody notices.
  assert(usable({ title: "x", platforms: ["pc"], ratingCount: MIN_RATINGS }) === true);
});

check("usable rejects null", () => {
  assert(usable(null) === false);
  assert(usable(undefined) === false);
});

// --- excludePlayed ----------------------------------------------------------

check("excludePlayed removes by id", () => {
  const list = [{ id: 1 }, { id: 2 }, { id: 3 }];
  assert(excludePlayed(list, [2]).map(c => c.id).join(",") === "1,3");
});

check("excludePlayed coerces string ids", () => {
  // A played library arriving from a database or a form may hand back strings.
  const list = [{ id: 1 }, { id: 2 }];
  assert(excludePlayed(list, ["2"]).map(c => c.id).join(",") === "1");
});

check("excludePlayed with nothing played is the identity", () => {
  const list = [{ id: 1 }, { id: 2 }];
  assert(excludePlayed(list, []).length === 2);
  assert(excludePlayed(list, null).length === 2);
  assert(excludePlayed(list, undefined).length === 2);
});

check("excludePlayed can empty the set entirely", () => {
  // Not an error. A user who has played everything in a thin category gets
  // nothing, and criterion 5 says that is reported rather than padded.
  const list = [{ id: 1 }, { id: 2 }];
  assert(excludePlayed(list, [1, 2]).length === 0);
});

// --- rankByTagMatch -----------------------------------------------------------

const pool = [
  { id: 1, title: "one tag",   tags: ["roguelike"] },
  { id: 2, title: "both tags", tags: ["roguelike", "difficult"] },
  { id: 3, title: "other tag", tags: ["difficult"] },
  { id: 4, title: "no tags",   tags: ["cozy"] },
];

check("rankByTagMatch puts full matches first", () => {
  const r = rankByTagMatch(pool, ["roguelike", "difficult"]);
  assert(r[0].title === "both tags", `got ${r[0].title}`);
});

check("rankByTagMatch keeps partial matches rather than discarding them", () => {
  // The whole reason this is not strict AND. cozy + difficult would be empty.
  const r = rankByTagMatch(pool, ["roguelike", "difficult"]);
  assert(r.length === 4, `got ${r.length}`);
  assert(r[3].title === "no tags", "non-matching candidates go last, not away");
});

check("rankByTagMatch records which tags each candidate matched", () => {
  const r = rankByTagMatch(pool, ["roguelike", "difficult"]);
  assert(r[0].matchedTags.join(",") === "roguelike,difficult", `got ${r[0].matchedTags}`);
  assert(r[3].matchedTags.length === 0, "a candidate matching nothing says so");
});

check("rankByTagMatch is stable within a match level", () => {
  // Ties keep the catalogue's order, which is by rating. Without this the sort
  // would reorder equally-matching candidates arbitrarily between runs, and a
  // shortlist would change for no reason anyone could explain.
  const tied = [
    { id: 10, title: "higher rated", tags: ["roguelike"] },
    { id: 11, title: "lower rated",  tags: ["roguelike"] },
  ];
  const r = rankByTagMatch(tied, ["roguelike"]);
  assert(r[0].title === "higher rated", `got ${r[0].title}`);
});

check("rankByTagMatch does not mutate or reorder the pool it is given", () => {
  const original = pool.map(c => c.title).join(",");
  rankByTagMatch(pool, ["roguelike", "difficult"]);
  assert(pool.map(c => c.title).join(",") === original, "the logged set must be the sent set");
});

check("rankByTagMatch leaves the order alone when no tags were requested", () => {
  const r = rankByTagMatch(pool, []);
  assert(r.map(c => c.id).join(",") === "1,2,3,4", `got ${r.map(c => c.id)}`);
  assert(r.every(c => c.matchedTags.length === 0));
});

check("rankByTagMatch tolerates a missing tag list", () => {
  assert(rankByTagMatch(pool).length === 4);
});

check("rankByTagMatch strips its internal sort key", () => {
  const r = rankByTagMatch(pool, ["roguelike"]);
  assert(!("index" in r[0]), "an internal field must not reach the prompt or the log");
});

// --- dominanceReport ----------------------------------------------------------

check("dominanceReport averages vocabulary tags per candidate", () => {
  const d = dominanceReport([
    { title: "a", tags: ["x", "y"], ratingCount: 10 },
    { title: "b", tags: [], ratingCount: 10 },
  ]);
  assert(d.poolSize === 2, "poolSize");
  assert(d.meanTagsPerCandidate === 1, `got ${d.meanTagsPerCandidate}`);
});

check("dominanceReport ranks the most-tagged first", () => {
  const d = dominanceReport([
    { title: "thin", tags: ["x"], ratingCount: 1 },
    { title: "fat", tags: ["x", "y", "z"], ratingCount: 1 },
  ]);
  assert(d.mostTagged[0].title === "fat", "the widely-tagged game is the one that reappears everywhere");
});

check("dominanceReport handles an empty pool without dividing by zero", () => {
  const d = dominanceReport([]);
  assert(d.poolSize === 0);
  assert(d.meanTagsPerCandidate === 0, `got ${d.meanTagsPerCandidate}`);
  assert(d.mostTagged.length === 0);
});

check("dominanceReport does not mutate the pool it is given", () => {
  // It sorts. A sort in place would silently reorder the candidate set that is
  // about to be sent to the model and logged as the set that was sent.
  const pool = [
    { title: "a", tags: ["x"], ratingCount: 1 },
    { title: "b", tags: ["x", "y"], ratingCount: 1 },
  ];
  dominanceReport(pool);
  assert(pool[0].title === "a", "the candidate set must be in the order it was assembled");
});

// --- report -----------------------------------------------------------------

console.log(`\n${passed} checks passed, ${failures.length} failed\n`);
if (failures.length) {
  for (const f of failures) console.log(`FAILED  ${f}\n`);
  process.exit(1);
}
console.log("These are offline checks against fixtures. They say nothing about");
console.log("what the catalogue returns — run scripts/inspect-catalogue.js for that.");
