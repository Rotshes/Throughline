# Turn 005 — the catalogue

Date: 2026-09-10
Spiral turn 2, first of three. Steps 1 and 2 of the pipeline. No model call was
made anywhere in this turn.

**How the agent was directed.** Claude via the desktop app, with read and write
access to this repository folder. Every live command was run by hand on the
Windows machine and its output read back into the session; the agent has no key
and made no catalogue request itself.

## 1. Intent

Replace the twenty-game static list with a real catalogue, and find out what that
catalogue can actually express before anything is built on top of it.

`docs/decisions/0003` had already accepted that the design changes from motifs to
filters. This turn is the first half of that: the filter and the candidate set,
with no model in the loop, so it can be checked with no key and no cost.

## 2. Specification

`docs/spec.md` v2.0 at the start of the turn, v2.1 by the end. Criteria 3, 4, 5,
7 and 13. Part 3's steps 1 and 2.

## 3. Context supplied

The specification, `CLAUDE.md`, decision 0003, and the turn 001–004 records for
what the previous design had already learned.

## 4. Plan

Four steps, in this order and for this reason:

1. **Look before writing.** RAWG's reference pages are not publicly fetchable, so
   the field list the normaliser depends on could not be verified from
   documentation. Write an inspection script first and read a real response.
2. Pin the vocabularies into `data/` rather than fetching them per request.
3. Build `src/catalogue.js` with the filter and the candidate set, all of it
   offline-checkable.
4. Run it against live data and read what came back rather than whether it ran.

## 5. Execution

`src/catalogue.js` holds every catalogue call; nothing else in the project
imports a RAWG URL, key or field name. `scripts/inspect-catalogue.js`,
`pin-vocabularies.js`, `pin-tags.js`, `probe-tags.js`, `run-candidates.js`, and
48 offline checks in `check-catalogue.js` — no key, no network, no cost, all
against fixtures.

Two decisions inside the module that are not obvious from reading it:

**`MIN_RATINGS = 200`.** The only defence available against pitfall 1. Nothing
checks whether the written case is true, so the mitigation is keeping the
shortlist to games the model has actually seen written about. It biases the whole
product towards popular games, which is a real cost and is recorded as one.

**`CANDIDATE_TARGET = 24`.** A guess. Large enough that three picks are a choice
rather than the pool minus a few, small enough not to bloat a prompt. Not derived
from anything, and should be revisited once there are logs.

## 6. Verification

**48 offline checks**, every one against a fixture.

**Live, against the catalogue:**

- Every field the normaliser reads was present in a real response. It was written
  against a shape that could not be verified from any documentation, and it
  happened to be right — the inspection script is why that is known rather than
  assumed.
- `action` on `pc`: 24 candidates, **0 off-platform, 0 off-category**. Criteria 3
  and 4 hold on live data.
- `action` on `pc` tagged `roguelike`: 22 candidates, **all 22 carrying the tag**.
  Criterion 4a holds, and the pool is genuinely good — Hades, Dead Cells, Binding
  of Isaac, Enter the Gungeon, Nuclear Throne, Noita, Crypt of the NecroDancer,
  Risk of Rain, Rogue Legacy, Downwell, Darkwood.
- `card` on `linux`: 46 in the catalogue, **3 usable**, `poolExhausted` true, and
  the thin-pool warning fired. Reference case 3 now has a real pair.

**What the runs found.**

**Nineteen genres cannot express what anyone wants.** Action holds 192,185 games
and catches both Portal and Minecraft. Indie is a business model. No roguelike,
no metroidvania, no deckbuilder, no cozy — the words v1's candidate set was built
around. This is why the turn went looking for tags at all.

**Tags solve it, and 51 hand-picked ones beat 9,736.** Decision 0004 has the
detail. The vocabulary is chosen rather than taken by frequency because the most
frequent tags are store plumbing (`steam-cloud`, `full-controller-support`) and
non-English duplicates of tags the record already carries (`atmosfera` beside
`atmospheric`).

**Tags are claims, not facts.** The catalogue calls God of War (2018) a
souls-like, Dota 2 a tower defence, Limbo pixel-graphics, and Vampire Survivors a
metroidvania. Criterion 4a is worded to claim only that a label is present.
Overstating a gate is worse than not having it.

**Several tags combine with OR, which is the opposite of what a user means.**
`roguelike` gives 5,864 games; `roguelike,difficult` gives 10,512. Fixed by
ranking on match count rather than by strict AND — decision 0004 for why. After
the fix, 8 of 24 candidates carry both tags and rank above the 16 that carry one.

**A missing tag costs as much as a wrong one.** Ranking demoted **Hades** from
first to ninth, because RAWG has it tagged `roguelike` but not `difficult`. Hades
is the single best answer to "difficult roguelike" and it lost to Noita, which
has 299 ratings against Hades' 2,119 and a metacritic of 76 against 93.

The code did exactly what it should. The data was thin. Pitfall 18 was written
after seeing tags that were *wrong* — souls-like on God of War — and this is the
same defect in the other direction: a tag that should be there and is not. Both
are the same underlying fact, that a crowd-applied label is evidence rather than
truth, and the pitfall now says so.

No fix attempted. Weighting by rating within a match level would promote Hades,
and would also promote every popular game over every precise match, which is a
worse product. Recorded rather than solved.

**Two failures worth keeping.**

*A search endpoint is not a membership test.* `probe-tags.js` used
`/tags?search=` and reported `open-world` absent, offering `open-world-2` with 6
games, while `open-world` with 9,338 games existed. Fuzzy ranking produces false
negatives. `pin-tags.js` resolves by making the same query the app makes.

*A count that lies is how a real bug hides.* `run-candidates.js` printed
`excluded 1` on every run with no `--played` flag. `"".split(",")` is `[""]`,
`Number("")` is 0, and `Number.isInteger(0)` is true, so `playedIds` was `[0]`.
Harmless — no game has id 0 — and caught only by reading a number that should
have been zero. Fixed.

**What I did not verify.**

- **Nothing here has been near a model, a browser, or a deploy.** Steps 1 and 2
  only. Criteria 1, 2, 6, 12, 14 and 15 are untouched by this turn.
- **Whether the tag filter changes the shortlist** — reference case 9. The
  candidate *pools* for `roguelike` and `roguelike,difficult` overlap in only two
  of twenty-odd entries, which is encouraging, but a pool is not a shortlist and
  there is no shortlist yet.
- **Whether `dominanceReport` is measuring a real problem.** Mean vocabulary tags
  per candidate came out at 9.2, 8.3 and 8.5 across three runs, and the
  most-tagged list differed each time — Don't Starve Together and Risk of Rain in
  one, Returnal and Nuclear Throne in another. Not the same mega-titles
  everywhere, which is the opposite of what pitfall 19 feared. Encouraging, and
  three runs of one category is not evidence. Keep watching it.
- **The catalogue's rate limit and quota.** 20,000 requests a month, and nothing
  in this project counts them. Pitfall 17 is open.
- **RAWG's attribution requirement.** The free tier's licence requires an active
  hyperlink back to RAWG on every page showing their data. It is in the spec and
  it is not in any interface, because there is no interface yet.

## 7. Outcome

Steps 1 and 2 work against a real catalogue of 500,000 games, with three
vocabularies pinned and every filter verified on live data rather than assumed.

**Open:** the shortlist call and its gates (turn 006); the interface, the
attribution link and the deploy (turn 007); the played library and the Steam
import after that. Rate limiting is still unbuilt and still recorded rather than
fixed.

### Corrections issued this turn

Two, both above: the search-endpoint false negative, and the `excluded 1` count.

### Open questions raised this turn, not answered

**`CANDIDATE_TARGET = 24` is unjustified.** It was picked to feel right. Once the
shortlist call exists, the question becomes measurable: does a pool of 40 produce
better picks than a pool of 15, and what does either cost per request?

**Nothing bounds catalogue requests.** `assembleCandidates` fetches up to three
pages per call, so one user request costs up to three of a monthly 20,000. That
is fine until the endpoint is public and unrated, which is the same open hole
turn 003 recorded on the model side. One blast radius is now two.
