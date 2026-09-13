# 0005 — One shared library, and no accounts

Date: 2026-09-12
Status: accepted

## The decision

Games can be put on a list with one of five states — playing, plan to play, on
hold, dropped, completed — and anything on that list is never recommended again.

**There is one list, shared by everyone who opens the site.** No accounts, no
sign-in, no per-browser identity. Anyone who can reach the page can add to it,
change it and empty it.

## Why

This is coursework, and the app is a demonstration of a way of working rather
than a service with users. An account system would be the largest single piece
of infrastructure in the project — email delivery, session handling in the
function, row-level policies per user instead of the service key doing
everything — and none of it would demonstrate anything the course is about.

It would also land on a deploy budget of five Netlify credits, and auth is the
part most likely to need a second attempt.

## What it costs, plainly

- **Anyone can change it.** There is no protection and none is claimed.
- **The exclusion is global.** A game somebody adds stops being recommended to
  *everyone*, not only to them. For a demonstration this reads as the feature
  working; for a product it would be a defect.
- **It is not private.** Nothing here should be treated as personal data, and
  nothing in the interface implies otherwise — the library page says out loud
  that this is one shared list.

The interface states this rather than letting a reader assume the list is theirs.
A shared list that looks personal would be worse than either.

## What was considered

**An anonymous browser id.** A random identifier in local storage, one library
per browser. Half a turn more, and better in one way — nobody else edits your
list. Worse in two: clearing site data destroys it with nothing to recover it
from, and it produces an empty library for anyone opening the deployed site,
which is exactly the demonstration that matters here.

**Real accounts.** What MyAnimeList actually is, and the right answer for a
product. Closer to two turns, most of it spent on infrastructure the course does
not grade.

**The shape does not close either door.** `library` is keyed on the catalogue's
game id with no user column. Adding one, plus a policy, is a migration that keeps
every existing row.

## Why every status excludes

The recommender asks only whether an id is present. It never looks at the status.

Completed and dropped are obvious. Playing and on hold are stronger still —
being told to play something currently sitting in your console is the most
annoying version of this failure. Plan to play is the arguable one, and it
excludes too: the point of a shortlist is to show you something you have not
already decided on.

Keeping the recommender ignorant of the status means a sixth state could be
added without anything in the pipeline changing.

## What the entry stores, and why it is a copy

A library row keeps the title, image, release date and platforms as they were
when the game was added. The library page renders from those rows and does not
ask the catalogue again: twenty games would otherwise be twenty requests of a
monthly twenty thousand every time the page opened.

They are a copy and may drift. **The catalogue remains the authority** — if the
two ever disagree, the catalogue is right and the row is stale.
