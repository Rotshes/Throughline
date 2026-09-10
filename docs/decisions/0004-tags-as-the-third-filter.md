# 0004 — Tags as the third filter, and what a tag gate can claim

Date: 2026-09-10
Status: accepted
Follows: 0003. Answers the question turn 005 opened.

## The decision

A request is **category + platforms + zero or more tags**. The tag vocabulary is
hand-picked, pinned to `data/tags.json`, and is the complete set the interface
may offer. RAWG stays; IGDB is not needed.

## Why the question came up

Turn 005 pinned RAWG's genre list and it was worse than expected. Nineteen flat
genres, of which the largest — action, 192,185 games — catches both Portal and
Minecraft, and one of which, indie, is a business model rather than a kind of
game. Nothing in the list can say roguelike, metroidvania, deckbuilder, cozy or
souls-like. Those are the words v1's candidate set was built around.

A second problem arrived with the first. With a fixed ordering and only 19 × 14
filter combinations, every user asking for the same thing gets the same
twenty-four games. Decision 0003 accepted that the output would not be personal;
it did not intend for it to be a static list per combination.

## What was measured before deciding

`scripts/probe-tags.js`, four requests.

- RAWG holds **9,736 tags**, and the words that matter are all there: roguelike,
  roguelite, metroidvania, souls-like, cozy, relaxing, difficult, story-rich,
  turn-based, exploration, survival.
- `?tags=` **filters**, checked by comparing a filtered count against an
  unfiltered one — 557,283 games down to 12,586. An ignored parameter would have
  returned the full list and looked like success.
- `scripts/pin-tags.js` then resolved 55 proposed slugs by making the same query
  the app makes. **51 survived**; `point-and-click` (5 games), `grinding` (6) and
  `casual` (0) did not, and are things this product cannot say.

## Why the vocabulary is hand-picked rather than taken by frequency

The 40 most-used tags are mostly store plumbing: `steam-cloud`,
`steam-trading-cards`, `full-controller-support`, `partial-controller-support`,
`steam-leaderboards`, `steam-achievements`. Nobody chooses a game by those.

Records also carry non-English duplicates of tags they already have —
`dlia-odnogo-igroka` beside `singleplayer`, `atmosfera` beside `atmospheric`,
`ekshen`, `indi-2`, `rolevaia-igra`, `glubokii-siuzhet`. Noise to a reader, and
prompt weight to a model.

So 9,736 tags is a pile, not a vocabulary. Fifty-one chosen ones is a vocabulary.
This is the same move as decision 0002 and for the same reason: where the
automatic version produces garbage, a person picks.

`narrowTags` intersects each record's tags with the pinned vocabulary. Better
than capping at an arbitrary count: the result is bounded, every entry is a word
the interface itself offers, and it is exactly the set a tag check can run
against.

## What a tag gate can honestly claim

**Platforms are facts. Tags are claims.** Measured on live data in turn 005:

| tag | top-rated game carrying it |
|---|---|
| souls-like | God of War (2018) |
| tower-defense | Dota 2 |
| pixel-graphics | Limbo, which contains no pixel art |
| real-time-strategy | Brutal Legend |
| cute | Hollow Knight |

These are crowd-applied labels and they are wrong often enough to matter.

So criterion 4a is written carefully: **the catalogue says this game carries this
tag.** Not: this game is like that. Criteria 3 and 4 assert facts; 4a asserts
that a label is present. The difference is written into the specification rather
than blurred, because a gate whose claim is overstated is worse than no gate —
it produces confidence that was never earned.

## The finding this does not fix

**Popular games accumulate tags.** GTA V is the top-rated example for
atmospheric, funny, open-world, sandbox, singleplayer, co-op, multiplayer,
first-person *and* third-person. Witcher 3, Portal 2, Left 4 Dead 2 and Tomb
Raider do the same across the rest of the vocabulary. A game with seven thousand
ratings collects labels, and `-rating` ordering then floats it to the top of
almost any tag query.

If that dominates, tags widen the filter space far less than fifty-one words
suggests, and two users with different tags still meet the same three games.

`dominanceReport` measures it — mean vocabulary tags per candidate, and the five
most-tagged in the pool — and `scripts/run-candidates.js` prints it on every run.
Deliberately not fixed. Fixing it means sampling deeper into the pool, where
games fall below `MIN_RATINGS` and the model can no longer write truthfully about
them, which trades a visible problem for an invisible one. The decision to make
that trade should rest on the numbers, and now there will be numbers.

## Several tags combine with OR, and what was done about it

Measured, not assumed. `action` on `pc`:

| filter | games the catalogue holds |
|---|---|
| tagged `roguelike` | 5,864 |
| tagged `roguelike,difficult` | **10,512** |

Larger. Adding a tag widens the filter. The second pool contains Dark Souls III,
Sekiro, Elden Ring, Half-Life, Cuphead and Hitman: none of them roguelikes, all
of them difficult.

A person ticking two boxes means "difficult roguelike". Three ways to serve that:

- **Leave it as OR.** No work, never thin, and the filter stops meaning anything
  — ticking a second tag currently makes the result *less* specific.
- **Strict AND**, enforced in code. Says exactly what the user meant, and empties
  fast: cozy plus difficult is close to nothing, and criterion 5 forbids relaxing
  a filter the user set, so the honest result is an empty page.
- **Rank by match count.** Chosen. Fetch the OR pool, order by how many requested
  tags each candidate carries, keep everything. Full matches first, partial
  matches behind them, nothing discarded and no cliff.

`rankByTagMatch` does this, and every candidate gains `matchedTags` so the
interface and the model can both see which part of the request a game answers
rather than inferring it. Ranking happens **before** the set is truncated to
twenty-four, or the best matches would be cut by an arbitrary slice while worse
ones survived on rating. `query.fullMatches` is logged, because a shortlist of
three games that each match half the request needs to be attributable later.

**What made this possible:** in the `roguelike` run, all 22 candidates carried
`roguelike` in their narrowed tags — zero missing. RAWG's per-record tag data is
complete enough to rank against, so the ordering is ours regardless of what the
API's parameters do. Had it been patchy, none of this would have been available
and OR would have been the only honest option.
