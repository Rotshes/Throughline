# Turn 011 — the library

Date: 2026-09-12
Local only; nothing deployed.

> **Written retrospectively on 2026-09-13.** See the notice in turn 010.

**How the agent was directed.** Claude via the desktop app, writing into this
repository folder. SQL was run by hand in the Supabase editor and its output
pasted back; the agent has never held the database key.

## 1. Intent

Give criterion 8 something to do.

`excludePlayed` had existed since turn 005 and had never excluded anything,
because nothing in the product could put a game on a list. A criterion with no
data behind it is not a guarantee, it is a sentence in a specification.

## 2. Specification

`docs/spec.md` v2.1, criterion 8. Decision 0005 was written this turn and records
the part the specification does not fix: one library, shared by everyone, with no
accounts.

## 3. Context supplied

The specification, `CLAUDE.md`, decision 0004, and a screenshot of MyAnimeList
supplied by the user as the shape to aim at.

Deliberately left out: any notion of personalisation. The library excludes and
does not inform the shortlist. That is in `CLAUDE.md` and was not revisited.

## 4. Plan

1. Five statuses, pinned in `data/` because the browser needs them too.
2. A table keyed on the catalogue id — a game is in the library or it is not.
3. Enough of the catalogue record copied in to render the page without asking
   the catalogue again.
4. Its own page with status tabs, not a panel beside the finder.
5. `excludePlayed` finally fed by real ids.

The user changed two things in this plan after seeing it work: the library
became a separate page rather than a section of the finder, and the card size
became a choice rather than a fixed value.

## 5. Execution

**The table copies rather than references.** Title, cover, release date and
platforms are stored on the row. Twenty games would otherwise be twenty
catalogue requests every time the page opens. They are a snapshot of what the
game looked like when it was added, and the catalogue stays the authority if
they ever disagree — which came back to matter in turn 016, when the stored
picture was the wrong *kind* of picture and no code could rewrite it.

**One status per game, and the upsert is the status change.** `Prefer:
resolution=merge-duplicates` means clicking "add" twice is not an error and
changing a status is the same operation as adding.

**Everything added goes in as "plan to play".** The user removed the status
dropdown from the add button: you are being shown something you have not played,
so the other four states are answers to a question nobody asked there.

**RLS enabled with no policies**, matching the other two tables. The service key
bypasses it; the publishable key — public by design in any frontend — can then
read and write nothing.

Files: `db/migration-003-library.sql`, `data/statuses.json`, `src/library.js`,
`netlify/functions/library.js`, `web/src/Library.jsx`, `web/src/App.jsx`,
`web/src/styles.css`, `docs/decisions/0005-one-shared-library.md`.

## 6. Verification

| Criterion | Method | Result |
|---|---|---|
| 8 — exclusion | add a game, re-run the same filters | not returned |
| 8 — reported | `meta.excluded` on the response | counts the library, shown on the page |
| 8 — failure | library read fails | page says the exclusion did not run |
| vocabulary | 8 offline checks against the schema | pass |

**What I did not verify:** concurrent writes. One shared row set with no
per-visitor identity means two people editing at once is possible and untested.
Decision 0005 records that as accepted for a demonstration.

## 7. Outcome

Criterion 8 holds and says so on the page. The failure case says so too — "your
library could not be read, so nothing was excluded" — which turned out to matter
in turn 015, when a missing column made exactly that message appear.

### Corrections issued this turn

**"Nothing here yet" and "could not be read" are opposite facts that render
identically.** Every list in this project now distinguishes them. This is the
same shape as the front page's empty row in turn 013 and was not recognised as a
general rule until then.

### Open questions raised this turn, not answered

**A Steam import was discussed and not built.** It would fill the same table and
change nothing about the exclusion. Not started.
