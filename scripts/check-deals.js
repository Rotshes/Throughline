/**
 * Offline checks for the deals row's shaping. No key, no network, no cost.
 *
 * A price is the one thing on this page a person might act on with their own
 * money, so the failures worth guarding are not crashes:
 *
 *   showing a game that is NOT discounted in a row headed "cheaper than usual"
 *   showing a discount computed from numbers that were not both present
 *   rewriting the link, which breaches the terms this data arrives under
 *
 * All three produce a page that looks entirely normal.
 *
 *   node scripts/check-deals.js
 */

import { shapeDeal, rankByCut, safeSearch, COUNTRY } from "../src/deals.js";

let passed = 0;
const failures = [];

function check(name, fn) {
  try { fn(); passed++; }
  catch (e) { failures.push(`${name}\n    ${e.message}`); }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || "assertion failed"); }

// --- fixtures ----------------------------------------------------------------
// The shape scripts/probe-deals-2.js printed from /games/prices/v3, not invented.

const GAME = {
  id: 1029,
  title: "A Game",
  slug: "a-game",
  released: "2019-04-02",
  image: "https://images.igdb.com/igdb/image/upload/t_720p/sc1.jpg",
  cover: "https://images.igdb.com/igdb/image/upload/t_cover_big/co1.jpg",
  platforms: ["pc"],
  machines: ["win"],
  criticScore: 96,
  criticReviews: 13,
  ratingCount: 1885,
};

const priced = (over = {}) => ({
  id: "018d937f-2664-702e-8fec-cc69857b8d9d",
  deals: [{
    shop: { id: 61, name: "Steam" },
    price: { amount: 2.49, amountInt: 249, currency: "USD" },
    regular: { amount: 9.99, amountInt: 999, currency: "USD" },
    cut: 75,
    url: "https://itad.link/018d937f/?app=a4yx1b",
    ...over,
  }],
});

// --- the ordinary case --------------------------------------------------------

check("a discounted game becomes a card", () => {
  const c = shapeDeal(priced(), GAME);
  assert(c !== null);
  assert(c.id === 1029 && c.title === "A Game");
  assert(c.price.now === 2.49 && c.price.was === 9.99 && c.price.cut === 75);
  assert(c.price.shop === "Steam");
  assert(c.price.currency === "USD");
});

check("the game's own fields survive so the card can be drawn", () => {
  // The row shares a component with the others. A card missing its cover or its
  // score would render as a broken variant rather than as an error.
  const c = shapeDeal(priced(), GAME);
  assert(c.image === GAME.image && c.cover === GAME.cover);
  assert(c.criticScore === 96 && c.criticReviews === 13);
  assert(c.platforms.join() === "pc" && c.machines.join() === "win");
});

// --- the link ------------------------------------------------------------------
//
// ITAD's terms forbid stripping the affiliate tags from their URLs. That is a
// licence condition, and the tempting "improvement" is to rebuild it as a direct
// store link — the same breach with better intentions.

check("the buy link is passed through exactly as given", () => {
  const c = shapeDeal(priced(), GAME);
  assert(c.price.buyUrl === "https://itad.link/018d937f/?app=a4yx1b", c.price.buyUrl);
  assert(c.price.buyUrl.includes("?app="), "the affiliate tag is still on it");
});

check("a missing link is null rather than a broken href", () => {
  assert(shapeDeal(priced({ url: null }), GAME).price.buyUrl === null);
  assert(shapeDeal(priced({ url: 42 }), GAME).price.buyUrl === null);
});

// --- what must not appear in a row about discounts ------------------------------

check("a game at full price is not a deal", () => {
  // Return of the Obra Dinn came back from the probe at $19.99 against a regular
  // of $19.99. In a row headed "cheaper than usual" that is a small lie, and it
  // is exactly the kind that nobody reports because the page looks fine.
  assert(shapeDeal(priced({ cut: 0 }), GAME) === null);
});

check("a negative or absent cut is not a deal either", () => {
  assert(shapeDeal(priced({ cut: -5 }), GAME) === null);
  assert(shapeDeal(priced({ cut: null }), GAME) === null);
  assert(shapeDeal(priced({ cut: undefined }), GAME) === null);
  assert(shapeDeal(priced({ cut: "75" }), GAME) === null, "a string is not a number here");
});

check("a discount with no price behind it is refused", () => {
  // A cut with a missing amount would render as "$undefined was $9.99, -75%".
  assert(shapeDeal(priced({ price: null }), GAME) === null);
  assert(shapeDeal(priced({ regular: null }), GAME) === null);
  assert(shapeDeal(priced({ price: { amount: null, currency: "USD" } }), GAME) === null);
  assert(shapeDeal(priced({ regular: { amount: "9.99" } }), GAME) === null);
});

check("a free game is still a deal", () => {
  // The Epic giveaways in the probe were amount 0 with cut 100. Zero is a real
  // price and `Number.isFinite(0)` is true — but a falsy check would have
  // dropped them, which is the playtime-zero mistake in a new costume.
  const c = shapeDeal(priced({ cut: 100, price: { amount: 0, currency: "USD" } }), GAME);
  assert(c !== null, "zero is a price");
  assert(c.price.now === 0);
});

// --- absent everything ----------------------------------------------------------

check("a row with no deals at all is refused", () => {
  assert(shapeDeal({ id: "x", deals: [] }, GAME) === null);
  assert(shapeDeal({ id: "x" }, GAME) === null);
  assert(shapeDeal({ id: "x", deals: null }, GAME) === null);
});

check("a price with no game behind it is refused", () => {
  // The join is by id and a miss is possible. A card with a price and no title
  // is worse than no card.
  assert(shapeDeal(priced(), null) === null);
  assert(shapeDeal(priced(), undefined) === null);
});

check("nothing at all is refused rather than thrown on", () => {
  assert(shapeDeal(null, GAME) === null);
  assert(shapeDeal(undefined, null) === null);
});

check("a missing shop name does not become the string undefined", () => {
  const c = shapeDeal(priced({ shop: null }), GAME);
  assert(c.price.shop === null, `got ${c.price.shop}`);
});

// --- ordering -------------------------------------------------------------------

check("the biggest discount comes first", () => {
  const cards = [
    { price: { cut: 20 } }, { price: { cut: 75 } }, { price: { cut: 50 } },
  ];
  assert(rankByCut(cards).map(c => c.price.cut).join() === "75,50,20");
});

check("ranking copies rather than sorting in place", () => {
  const cards = [{ price: { cut: 20 } }, { price: { cut: 75 } }];
  rankByCut(cards);
  assert(cards[0].price.cut === 20, "the caller's array was reordered");
});

// --- the country ------------------------------------------------------------------

check("the country is stated rather than implied", () => {
  // Every figure in this row is a US figure and somebody elsewhere will see a
  // different number in their own store. The row's source line quotes this.
  assert(typeof COUNTRY === "string" && COUNTRY.length === 2, COUNTRY);
});

// --- the search box ---------------------------------------------------------
//
// THE ONLY PLACE in this project where text a person typed reaches a query
// language. Every other input is a slug resolved to an integer out of a pinned
// file before it goes near a query, which is why none of those need this.
//
// The rule is filter, not escape. A quote closes the string literal, a backslash
// could escape the closing one, and a semicolon ends the statement and starts
// another — none of which belongs in a game title, so they are removed rather
// than encoded. An encoder can be got wrong by a later change; a character that
// is never present cannot.

check("an ordinary title comes through unchanged", () => {
  assert(safeSearch("God of War") === "God of War");
  assert(safeSearch("Half-Life 2: Episode One") === "Half-Life 2: Episode One");
});

check("a quote cannot close the literal", () => {
  const out = safeSearch('a"; fields *; limit 500;');
  assert(!out.includes('"'), out);
  assert(!out.includes(";"), out);
});

check("a backslash cannot escape the closing quote", () => {
  const out = safeSearch('zelda\\');
  assert(!out.includes("\\"), out);
});

check("braces and brackets are removed", () => {
  // `[a,b]` is AND and `(a,b)` is OR in this query language. Neither belongs in
  // a search term arriving from a text box.
  const out = safeSearch("doom [1,2] (3)");
  assert(!/[[\]{}()]/.test(out), out);
});

check("control characters and newlines cannot break the statement across lines", () => {
  const out = safeSearch("doom\nwhere id = 1");
  assert(!out.includes("\n"), JSON.stringify(out));
  assert(out === "doom where id = 1", JSON.stringify(out));
});

check("whitespace collapses rather than travelling", () => {
  assert(safeSearch("   elden     ring   ") === "elden ring");
});

check("a term too short to mean anything is refused", () => {
  // A one-character search returns most of the catalogue ranked by nothing.
  assert(safeSearch("a") === null);
  assert(safeSearch(" ") === null);
  assert(safeSearch('"') === null, "a term that is only punctuation leaves nothing");
});

check("a very long term is cut rather than sent", () => {
  const out = safeSearch("x".repeat(500));
  assert(out.length === 80, `got ${out.length}`);
});

check("anything that is not a string is refused", () => {
  assert(safeSearch(null) === null);
  assert(safeSearch(undefined) === null);
  assert(safeSearch(42) === null);
  assert(safeSearch({}) === null);
});

// --- a search may answer "no" ------------------------------------------------

check("a search keeps a game that is not discounted", () => {
  // Somebody asking whether a game is on sale is owed "no, it is $59.99" rather
  // than an empty result that reads as "we have never heard of it".
  const c = shapeDeal(priced({ cut: 0 }), GAME, { requireDiscount: false });
  assert(c !== null, "full price is an answer to a search");
  assert(c.price.cut === 0);
  assert(c.price.now === 2.49);
});

check("a search still refuses a row with no price at all", () => {
  assert(shapeDeal(priced({ price: null }), GAME, { requireDiscount: false }) === null);
  assert(shapeDeal({ id: "x", deals: [] }, GAME, { requireDiscount: false }) === null);
});

check("the browse list still drops full price by default", () => {
  // The default has to stay strict: the row is headed "cheaper than usual".
  assert(shapeDeal(priced({ cut: 0 }), GAME) === null);
});

// --- report -----------------------------------------------------------------------

console.log(`\n${passed} checks passed, ${failures.length} failed\n`);
if (failures.length) {
  for (const f of failures) console.log(`FAILED  ${f}\n`);
  process.exit(1);
}
console.log("Offline, against fixtures. Whether the join still resolves against real");
console.log("games is a different question — scripts/probe-deals-2.js is what asks it.");
