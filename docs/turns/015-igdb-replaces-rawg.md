# Turn 015 — IGDB replaces RAWG

Date: 2026-09-13
Branch `igdb`. `main` left on RAWG and deployable throughout. Nothing deployed.

> **Written retrospectively on 2026-09-13, hours after the work.** See the notice
> in turn 010. This is the largest turn in the project and the one whose record
> matters most, which is exactly why writing it afterwards is a loss.

## 1. Intent

Decision 0004 concluded "IGDB was considered and is not needed." Two measurements
contradicted it:

- RAWG holds no press score for **any** 2026 release, so turn 013's review row
  could not exist.
- RAWG's free tier carries no video at any price under $149/month.

A third emerged during the probes and is the strongest of the three: RAWG tags
6 of 662 GameCube games as split-screen. IGDB records it as a structured field
and marks **302 of 713**. The user's complaint in turn 012 — "how did this only
pick Sonic, there's a lot more split screen on GameCube" — was never about the
GameCube.

## 2. Specification

`docs/spec.md` v2.1 throughout, and the rule the whole design rests on: *the
model may only choose from the set it was given, and code verifies every id came
back from that set.* Nothing about that changes when the set comes from
elsewhere. Decision 0006 records what was measured and what it cost.

## 3. Context supplied

The specification, `CLAUDE.md`, decisions 0003 and 0004, the RAWG probes, and
`docs/plans/igdb-migration.md` — written and reviewed before any IGDB code
existed, because `CLAUDE.md` says the plan comes first and it is the cheapest
place to catch a misunderstanding.

Deliberately left out of the plan's scope: anything that could be deferred. The
plan names nine steps and the ones that were not needed were not done.

## 4. Plan

`docs/plans/igdb-migration.md`. The user approved it with one change: the
library would be **wiped** rather than re-resolved. Re-resolution means matching
RAWG titles to IGDB games, and title matching is what v1 of this project died of.

The plan's central device: `src/igdb-catalogue.js` implements the **same exported
surface** as `src/catalogue.js`, so `pipeline.js`, `shortlist.js` and all nine
gates never learn which catalogue they are talking to. That is the interfaces-
are-code point from Lesson 8, and it is why a source swap cost one import line
rather than a rewrite.

## 5. Execution

**Everything was measured before it was built.** Four probes, ~80 requests, no
code changed by any of them.

| question | answer |
|---|---|
| scored 2026 releases | 294, against RAWG's 0 |
| video coverage, reviewed non-re-releases since 2024 | 107 of 107 |
| AND vs OR in the query | distinguishable: 288 vs 11 on GameCube |
| GameCube split-screen | 302 of 713, against RAWG's 6 of 662 |
| Steam ids on well-reviewed games | 46% |

**Two filters were found only by printing output.** Sorting by
`aggregated_rating` with no floor returns games rated 100 by a single critic —
every one of the top five was exactly 100, and the first was a Switch 2
re-release of a 2020 game. `parent_game = null` and a review-count floor were
both discovered this way, not read from a field list.

**The platform tree is hand-built.** IGDB has five platform families and PC is in
none of them; its "Linux" family contains Android and Stadia. So the nine
families are written out in `scripts/pin-igdb.js` and **every slug is resolved
against the live list**, with the script refusing to write when one does not
match. Two of mine did not, including `ps4--1` — which would have silently
produced a PlayStation family with no PlayStation 4 in it.

**Two angles could not survive.** `short-one` needs a playtime IGDB does not
have; `game_time_to_beat` returns 404. `hard-one` needs a difficulty label and
IGDB's vocabularies contain no concept of difficulty at all. Leaving `hard-one`
as an unchecked judgement would have let the model call anything the hard one
with nothing able to contradict it, which is worse than not offering it.

`acclaimed-one` replaces both, gated on a critic score **and** the number of
critics behind it — a gate RAWG could not have supported, because it held no
score for any recent release. The prompt went to v2.0 and length rejoined the
forbidden list: nothing here can check it any more.

**`metacritic` became `criticScore` + `criticReviews`.** Not a rename for
tidiness. `src/shortlist.js` wrote *"The best reviewed of the three, at 92 on
Metacritic"* straight out of that field, and it is not Metacritic.

**The library's silent failure was handled before the switch, not after.**
`library.game_id` held RAWG ids. After the swap the exclusion would have matched
nothing, three games would still have come back, every gate would still have
passed, and the page would still have said "0 games in your library were kept out
of this" — a false sentence with nothing on screen looking wrong. Migration 004
adds a `source` column; `excludePlayed` now **throws** rather than returning an
empty exclusion.

**The front page and the panel were rewritten too**, not because the plan asked
for it but because leaving them on RAWG would have written RAWG ids into the
library under an IGDB `source`, corrupting the column that exists to prevent
exactly that.

## 6. Verification

| Criterion | Method | Result |
|---|---|---|
| every filter filters | filtered counts against an unfiltered 320,307 | all narrow |
| the exclusion excludes | 177,303 PC − 8,353 = 168,950, exact | pass |
| … and nothing else | untagged games not discarded | pass |
| 3 — platform | machine granularity always; families derived from the pinned tree | 14 checks |
| 4 — category | vocabulary rebuilt; gate logic unchanged | 60 checks |
| 6 — angles | five angles, two constrained | pass |
| 8 — library | cross-source entries throw | 10 checks |
| offline total | seven suites | 217 |

**Mutation-tested**, because a suite that has never failed is a suite nobody has
tested: unknown tag slugs passed through, the source guard disabled, the
critic-review path removed from `usable`, the field-name validation dropped, the
image size-token anchoring removed. Each failed the right checks. One check was
decoration until this found it.

**What I did not verify:**

- **The deployed artifact.** `CLAUDE.md` has carried "local green says nothing
  about a deployed artifact" since turn 003, and this entire migration has only
  ever run locally. Three new secrets have to reach Netlify's environment before
  the build.
- **Reference cases 5 and 6** — injection and repeatability — remain unrun, now
  across a different catalogue.
- **IGDB's own `offset` ceiling.** Not documented anywhere this project could
  find, so the deals sampling clamps to the pool and would surface a failure
  rather than silently returning nothing.

## 7. Outcome

The app runs on IGDB. `src/catalogue.js` is untouched and still passes its 54
checks; the switch is one commented line in `src/source.js` and reverting is the
same line.

### Corrections issued this turn

**A query I wrote returning nothing is not a finding about the world.** The first
deals probe reported "0 of 0 well-reviewed games carry a Steam app id" because it
filtered on `external_games.category`, a field IGDB has renamed. The real field
answers 175,517 where the stale one answers 753 — small enough to look like a
genuine absence. **Read the field names before filtering on them.**

**An empty result from a wrong field name looks exactly like an empty result
from a correct one.** This is turn 005's "an ignored query parameter looks
exactly like a working one" in a new costume, and it is the fourth appearance of
that family of failure in this project.

### Open questions raised this turn, not answered

**Genres are claims too.** IGDB files Breath of the Wild under `puzzle`.
`CLAUDE.md` says "platforms are facts, tags are claims" — that line is now too
narrow, and the correction is applied in turn 016's documentation pass.

**The review floor of 5 is provisional.** It yields ten games for a row of twelve
in the current calendar year and would yield none in January. The front page uses
an eighteen-month window instead, which is a workaround rather than an answer.
