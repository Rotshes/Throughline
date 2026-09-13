# Turn 017 — showcases

Date: 2026-09-13
Branch `igdb`. Nothing deployed.

**Written during the turn**, unlike 010 to 016. That is the first thing worth
recording about it.

## 1. Intent

The user asked for a gaming news row between "best reviewed" and the deals list.

## 2. Specification

`docs/spec.md` v3.0. No criterion covers this row — no model call happens on it,
the same as the other front page rows. Criterion 13 applies: a failure here must
name the service that failed.

The rule that decided the turn is in `CLAUDE.md` rather than the specification:
**adding a dependency, a service or a model provider is a stop-and-ask.** This
was both, so it was asked.

## 3. Context supplied

The specification, `CLAUDE.md`, `docs/failures.md`, decisions 0006 and 0007, and
the user's own observation that IGDB's website shows news.

## 4. Plan

1. Establish whether a fourth service is needed at all.
2. Only then choose between a dependency and a hand-rolled parser — the question
   put to the user, and the question that turned out not to need answering.

## 5. Execution

**The turn began with me being wrong in a way the user caught.**

I asserted IGDB has no news API, citing a v4 migration post about removing
"substandard endpoints". That post names no endpoint. I turned an inference into
a fact and used it to argue for a fourth external service and this project's
first XML dependency. The user replied *"are we sure IGDB doesn't have news?
because I see it on their website front page"* — which is more checking than I
had done.

`scripts/probe-igdb-news.js` settled it in fourteen requests. `pulses`,
`pulse_groups`, `pulse_sources`, `pulse_urls`, `articles`, `news`, `feeds` and
`feed_follows` all return a clean 404. **The assertion was right and the reason
given for it was wrong**, which is worth about as much as being wrong.

**Then that probe lied in its summary.** It printed *"4 endpoints answered with
data → no fourth service, no XML, and no dependency"*. What answered was
`events`, `event_networks`, `event_logos` and `game_videos` — none of which is
news. They were in the candidate list as plausible **renames**, and the summary
counted any answer as a yes without checking whether the thing that answered was
the thing being asked about.

That is `docs/failures.md` entry one, in a file whose own header comment is about
that exact failure. Fourth appearance in this project.

**`events` turned out to be the better feature anyway.** 940 records, 33 in the
last ninety days, 17 in the last thirty. Twelve of the twelve most recent carry a
logo, ten a stream link, eleven at least one game — and the games are joined **by
id**, so no title matching, no second service, no dependency.

**One measurement dictated the heading.** Zero upcoming events. Not few, zero:
IGDB records a showcase after it airs. So the row is "Just shown" and its source
line says "from the last few months". A row promising a schedule and delivering
an archive is the failure this project keeps writing down, and the data said
which of the two it could be before a line was written.

**`event_networks` was left unused.** It carries Twitch, YouTube and official
links keyed by a `network_type` id whose vocabulary this project has not read.
Only `live_stream_url` is used — it is on the event itself and means one thing.

Files: `src/events.js`, `netlify/functions/event.js`, `src/home.js`,
`netlify.toml`, `web/src/api.js`, `web/src/Home.jsx`, `web/src/styles.css`,
`scripts/probe-igdb-news.js`, `scripts/probe-events.js`,
`scripts/check-events.js`, `docs/decisions/0008-showcases-instead-of-news.md`.

## 6. Verification

| Criterion | Method | Result |
|---|---|---|
| the data is current | counts by window | 33 in 90 days, 17 in 30 |
| the row can be drawn | 12 most recent, field by field | 12 logos, 11 with games |
| the heading is supportable | upcoming count | 0 — so "just shown", not "coming up" |
| 13 — which service | a catalogue failure is `stage: "catalogue"` | pass |
| shaping | 15 offline checks | pass |
| mutation | four deliberate breakages | each failed the right checks |

The four mutations: `showable` accepting anything, game ids unvalidated, the
start time unguarded (which would render 1970 as a date on a row about
recency), and the stream URL not scheme-checked.

262 offline checks across nine suites.

**What I did not verify:**

- **Nothing is deployed.** This row makes one extra catalogue request per
  uncached front page build and two per panel opened, and none of that has run
  anywhere but locally.
- **`network_type` values 1 to 4** are observed and unresolved. Nothing depends
  on them because nothing uses them.
- **The 120-day window** is a guess anchored to one measurement: 90 days held 33
  events. Not tuned.

## 7. Outcome

Four rows on the front page, three external services, and no new dependency. The
row the user asked for is not the row that was built, and decision 0008 says why
in terms of what the data can support rather than what would have been nice.

### Corrections issued this turn

**An undocumented absence is not a measurement.** "The docs do not mention it"
and "I asked and it is not there" are different claims. This one cost nothing
because the user pushed back; it was one step from a fourth service and a
dependency bought on the strength of a blog post.

**A probe's summary is code and gets the same suspicion as its body.** The
conclusion line is the part a reader trusts most and the part least likely to
have been tested. This one counted four unrelated endpoints as evidence for a
claim about news.

Both belong in `docs/failures.md` and are added there this turn.

### Open questions raised this turn, not answered

**`scripts/probe-news.js` exists and has never been run.** It was written to
measure RSS feeds before the IGDB question reopened, and the parser
question — dependency or hand-rolled — was put to the user and overtaken by
events. If showcases prove too sparse in practice, that is where this picks up.
