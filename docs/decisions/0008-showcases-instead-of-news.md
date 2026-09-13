# 0008 — showcases instead of news

Status: accepted. Branch `igdb`, turn 017.

**No fourth service was added.** That is the decision, and it was nearly the
opposite one.

## What was asked for

A gaming news row, between "best reviewed" and the deals list.

## What I got wrong first

I said IGDB has no news, citing their v4 migration post about removing
"substandard endpoints and data points". That post names no endpoint. I turned an
inference into a statement of fact and used it to argue for a fourth external
service and the project's first XML-parsing dependency.

The user pushed back — *"are we sure IGDB doesn't have news? because I see it on
their website front page"* — which is more checking than I had done.

`docs/failures.md` has carried "a documented shape is not a verified one" since
turn 005. An **undocumented absence** is weaker still: it is the absence of
evidence read as evidence of absence.

## What was measured

`scripts/probe-igdb-news.js`, fourteen endpoints, one request each. IGDB answers
an unknown endpoint with a clean `404 Endpoint POST /x not found`, so there is
nothing to interpret.

    pulses  pulse_groups  pulse_sources  pulse_urls      404
    articles  news  feeds  feed_follows                  404
    events  event_networks  event_logos  game_videos     200

**The assertion was right and the reason given for it was wrong.** Those are
different things and only one of them is worth anything.

That probe then drew its own conclusion — *"4 endpoints answered with data → no
fourth service needed"* — which is false. `events` and `game_videos` are not
news; they were in the candidate list as plausible **renames**, and the summary
counted any answer as a yes without checking whether what answered was the thing
being asked about. Pitfall 27's family, fourth appearance, in a probe whose own
header comment is about that failure.

## What `events` turned out to be

`scripts/probe-events.js`:

    everything                  940
    last 12 months              195
    last 90 days                 33
    last 30 days                 17
    upcoming, next 90 days        0
    upcoming, any                 0

Of the twelve most recent: **twelve have a logo, ten a stream link, eleven at
least one game.** Nintendo Direct 2026.09.09 lists 86 games. State of Play lists
34. One indie showcase lists 219.

The games are joined **by id**. No title matching, no second service, no
dependency, and a key this project already holds.

## Decision

Build a showcase row instead of a news row.

For this app it is the better row on its own merits. A wire of headlines is about
the industry; a showcase is a list of games somebody just announced, and every
one of them can carry the same Add button as the rest of the site. That is the
difference between a row that belongs here and a row that could sit on any site.

## The constraint the data imposes, and the heading it forces

**Zero upcoming events. Not few — zero.** IGDB records a showcase after it has
happened.

So the row is called **"Just shown"** and its source line says "from the last few
months". It is not "what's coming up", and no heading, source line or line of
interface copy may imply a schedule. A row promising the future and delivering an
archive is the failure this project keeps writing down; here the data said
plainly which of the two it could be, before anything was built.

## What is deliberately unused

`event_networks` carries more links per event — Twitch, YouTube, an official
site — keyed by a `network_type` id into a vocabulary this project has not read.
Observed values are 1, 2, 3 and 4 and their meanings are guesses.

Only `live_stream_url` is used: it is on the event record itself and it means one
thing. Rendering a Twitter link under "watch it here" because a number was not
resolved would be a small lie with no upside.

## Known, open, deliberately unresolved

- **`usable()` is applied inside the panel and not on the front page rows.** The
  reason holds here and not there: panel games sit beside games from everywhere
  else and a 219-title indie showcase is mostly records with no cover and no
  audience. The panel says how many were cut. This is pitfall 24 being obeyed
  rather than tripped over, and it is worth noting that the same helper is
  correct in one place and wrong in another.
- **The window is 120 days**, chosen because 90 held 33 events. Not tuned.
- **The RSS route is still on the table and still unbuilt.** `scripts/probe-news.js`
  exists and has not been run. If showcases prove too sparse, that probe and the
  parser question in turn 017 are where it picks up.
