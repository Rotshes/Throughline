# Turn 007 — the interface

Date: 2026-09-11
Spiral turn 2, third of three. Nothing in this turn was deployed. Netlify builds
are stopped on both projects and no credit was spent.

**How the agent was directed.** Claude via the desktop app, with read and write
access to this repository folder. The migration, the local server and every
browser interaction were run by hand on the Windows machine; the agent holds no
key and opened no browser.

## 1. Intent

Put the pipeline in front of a person.

Turn 006 ended with a working command line. Criterion 1 asks for a deployed
address where someone selects a category, platforms and optionally tags and
receives three games. The plan was local first, one deploy at the end — five
Netlify credits remain before the 29 September reset, and turn 003 needed six
attempts to get a deploy right.

## 2. Specification

`docs/spec.md` v2.1. Criteria 1, 5, 10, 12, 13 and 15, and part 3's four layers.

## 3. Context supplied

The specification, `CLAUDE.md`, decisions 0003 and 0004, turn 003's account of
the six production-only failures, and turns 005–006.

## 4. Plan

1. The database first. A Netlify function has no persistent filesystem, so
   deploying before the schema existed would leave criterion 10 passing locally
   and silently failing in production — the same order turn 003 used, for the
   same reason.
2. `src/pipeline.js`, joining steps 1–3 and recording every outcome.
3. The function, with the browser's input validated against the pinned
   vocabularies.
4. The interface.
5. Run it locally until it is right. Deploy once.

## 5. Execution

**The database.** `db/migration-002-requests.sql` adds a `requests` table and a
nullable `request_id` on `model_calls`.

`sessions` was neither altered nor dropped. Its rows are the evidence that the
motif design worked, and turn 004's verdict cites them; reshaping the table to
fit this design would destroy that the same way editing the old turn records
would. Old rows keep `session_id`, new rows carry `request_id`, both stay
readable. Row-level security enabled with no policies, as before — the backend
uses the service key, which bypasses it, and without it the publishable key
could read every row.

`requests` stores the filters, **the candidate ids that were sent**, the picks as
they were shown, and the click. The candidate ids are criterion 7: after the
fact they are the only way to check criterion 2's claim that every pick came
from the set.

**The function.** `netlify/functions/shortlist.js`. The browser sends slugs, never
ids or query parameters, and every slug is checked against the pinned
vocabularies before it reaches the catalogue — the interface offers dropdowns,
but a request does not have to come from the interface. Tags are capped at six,
which is a bound on the request rather than a style preference: tags combine with
OR, so forty of them is a way to make this endpoint fetch three full pages for
nothing.

**The interface.** `web/src/App.jsx`. Four decisions came from the specification
rather than from taste:

- **A failure is shaped like a failure.** Red border, its own heading, no cards.
  Criterion 12 says a failure is never readable as a weak shortlist, and shape
  carries that faster than words.
- **Each failure stage has its own words.** A catalogue outage says "The game
  database did not answer" and that nothing was spent on the model; a rejected
  shortlist says the checks refused it and that this is the system working.
  Criterion 13 exists because two external services sit behind this page, and
  "something went wrong" tells a user nothing they can report.
- **The waiting state counts seconds.** Nothing streams, so a progress bar would
  be inventing information the page does not have.
- **The footer carries the RAWG attribution link.** A condition of their free
  tier, not a courtesy. It cannot be removed while the app uses their data.

Nine of the catalogue's fourteen platforms are offered. 3DO, Neo Geo,
Commodore/Amiga, Atari and SEGA make the form longer and the results emptier.

The three pinned vocabularies are imported at build time rather than fetched. A
form should not need a network round trip to know what it may offer, and the same
file then bounds both the interface and the function. `vite.config.js` needed
`server.fs.allow` for this: the build follows the import graph regardless, but
the dev server refuses reads outside its root — which would have produced an app
that builds and deploys and will not start locally, exactly the class of
difference turn 003 spent six bugs on.

## 6. Verification

**78 offline checks** unchanged and passing.

**Five requests through the local browser**, read back out of `requests`:

| category | platforms | tags | candidates | outcome | clicked |
|---|---|---|---|---|---|
| board-games | web | — | 0 | empty | — |
| action | pc | — | 24 | shortlisted | — |
| educational | nintendo | relaxing, funny | 2 | shortlisted | — |
| educational | playstation | relaxing, funny | 1 | shortlisted | — |
| educational | playstation | relaxing, funny | 1 | shortlisted | **2778** |

**Criterion 10 holds through the interface.** Every request wrote a row,
including the one that never reached a model.

**Criterion 15 holds.** `clicked_id` records *which* of the shortlist was chosen,
not whether one was. A count of people who liked something says nothing without
knowing what they picked it over.

**Criterion 5 holds where it counts.** A candidate set of two returned two picks
and a set of one returned one. Nothing was padded and no filter was relaxed.

### Corrections issued this turn

**A thin result reached a person with nothing to mark it.** `educational` on
`playstation` with two tags left one candidate, and the page returned that one
game under a button reading "Find me three" — with the only explanation in small
grey text at the foot of the page.

Not a criterion failure. Criterion 5 forbids padding, and it did not pad. It is
pitfall 10 reaching a user for the first time: *a shortlist drawn from a pool
barely larger than itself is not a recommendation*. `run-candidates.js` has
warned about this since turn 005; the interface said nothing, so a result with no
choice in it read exactly like a result with three.

The page now says so above the cards, in dashed grey rather than the warning
colour — nothing went wrong, there is simply not much there — and says plainly
that nothing was loosened to fill the gap.

## 7. Outcome

The whole product runs locally: three selectors, a filtered candidate set from a
catalogue of 500,000 games, one model call, nine gates, three cards with
screenshots and an argument for each, and a row in the database for every
outcome including the ones that never reached a model.

**Open:** the deploy. One, deliberately.

### What I did not verify

- **Nothing here has been deployed.** Every claim above is about a local server.
  Turn 003's finding stands: six failures existed only outside local development
  while every offline check passed. Until this runs at a public address, criterion
  1 is unmet and nothing is known about the bundled artifact.
- **Not one gate has fired on live data**, across turns 006 and 007. All nine
  have only ever failed against fixtures. Seven clean runs is a good sign about
  the prompt and says nothing about whether the checks catch a real violation.
- **Reference cases 5 and 6 are unrun.** The injection case needs a malicious
  candidate spliced into the set by a harness; repeatability needs the same
  filters three times with the overlap recorded. The two `educational`/
  `playstation` rows are the same filters twice, but a pool of one cannot vary.
- **Criterion 11 has never fired.** Every request used 1 of 4 calls.
- **`beautiful-one` has never been chosen** by the model, across every run.
- **The interface has been seen on one screen.** No narrow viewport, no
  keyboard-only pass, no screen reader.

### Open questions raised this turn, not answered

**Thin pools are common, not exceptional.** Three of the four non-empty requests
in this turn returned fewer than three candidates, and they were ordinary choices
rather than deliberately obscure ones. `MIN_RATINGS = 200` plus a narrow category
plus two tags empties a 500,000-game catalogue quickly. Whether the fix is a
lower threshold, a wider tag treatment, or telling people sooner that their
filters are narrow — before they wait fifteen seconds — is undecided.

**Still nothing counts requests.** The endpoint is about to be public again. One
visitor costs up to three catalogue requests of a monthly 20,000 and $0.005–0.011
of OpenRouter credit, and nothing bounds how many they make. Recorded since turn
003 on the model side and turn 005 on the catalogue side; still open, now
deliberately, on the eve of a deploy.
