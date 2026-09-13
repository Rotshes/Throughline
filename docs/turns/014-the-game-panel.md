# Turn 014 — the game panel

Date: 2026-09-13
Local only; nothing deployed.

> **Written retrospectively on 2026-09-13.** See the notice in turn 010.

## 1. Intent

A card carries what the list endpoint gave it. Somebody who clicks a card wants
more than that.

## 2. Specification

`docs/spec.md` v2.1, criterion 13 — a failure names the service that failed. No
other criterion applies, because no model call happens here either.

## 3. Context supplied

The specification, `CLAUDE.md`, `src/catalogue.js`, and turn 013's front page.

## 4. Plan

1. A native `<dialog>`, not a div with a high z-index.
2. Fetched on click only, never prefetched for a row.
3. The panel lists what the catalogue holds and makes no argument.

## 5. Execution

**`showModal()` supplies the focus trap, the Escape key, the inert background
and the backdrop.** Every one of those is something a hand-rolled modal gets
wrong. The only behaviour written by hand is closing on a backdrop click, which
the element does not do by itself.

**Two requests per open, and only on a click.** Twelve cards prefetched would be
twenty-four requests for eleven panels nobody opens.

**The panel makes no claims.** The written case for a game lives in the
shortlist, where it is gated. A panel that started arguing would need gates of
its own, so it does not argue.

**Full release dates on the recent row.** Every game in it came out inside one
ninety-day window, so the year says nothing and the date says everything. The row
declares `fullDate` rather than the interface inferring it from the data.

Files: `src/detail.js`, `netlify/functions/game.js`, `web/src/GameDialog.jsx`,
`web/src/api.js`, `web/src/App.jsx`, `web/src/Home.jsx`, `web/src/styles.css`,
`scripts/check-detail.js`, `netlify.toml`.

## 6. Verification

| Criterion | Method | Result |
|---|---|---|
| 13 — which service | catalogue failure names the catalogue, not the model | pass |
| shaping | 21 offline checks against fixtures | pass |
| mutation | three deliberate breakages | each failed the right check |

The three mutations: removing the URL scheme check, keeping playtime 0 instead of
null, and removing the gallery deduplication. Each failed the check written for
it. A suite that passes on the first run and has never been made to fail is a
suite nobody has tested.

**What I did not verify:** keyboard behaviour beyond Escape. Tab order inside the
dialog is the browser's and was not exercised.

## 7. Outcome

Cards open. 156 offline checks.

### Corrections issued this turn

**A field named `is_deleted` exists because it is sometimes true.** The
screenshots endpoint returns it on every row and the shaper was not reading it,
so the gallery would have rendered images the catalogue had withdrawn. Found by
printing a real response, not by reading a field list — which is turn 005's rule
holding up again.

**A probe's own conclusion can pass for the wrong reason.** `probe-front.js`
called `/games/{id}/movies`, got HTTP 200 with `count: 0`, and printed "Trailers
ARE reachable." The sampled game has no trailers — a 200 with an empty list is
what a working endpoint returns for a game with no videos *and* what a silently
empty one returns for everything.

`CLAUDE.md` has carried "a gate can pass for the wrong reason" since turn 001,
and turn 004 records that writing it down did not make it apply. This is the
third time, and the first time it was aimed at the tooling rather than the code:
the check I wrote to verify something verified nothing, and said so confidently.

**An id typed from memory is a guess.** The same probe asserted id 634198 was
Hollow Knight: Silksong. It is a web puzzle game called All-Nighter. Nothing
depended on it, and nothing depended on it *only because* the probe printed the
name it actually got rather than the name it expected.

### Open questions raised this turn, not answered

**Trailers.** The question the faulty probe was meant to answer was still open at
the end of this turn. Turn 015 answered it: free on IGDB.
