# Plan: replace RAWG with IGDB

Branch `igdb`. `main` stays deployable throughout. If this does not land by the
deadline, `main` ships and this branch is still evidence of directed work.

Decision 0004 concluded IGDB "was considered and is not needed". Two measurements
have since contradicted that: RAWG holds no Metacritic score for any 2026 release
(probe-front, probe-front-2), and its free tier carries no video. This plan
reopens that decision rather than quietly overriding it.

---

## The one that fails silently

Everything else in this migration fails loudly. This one does not, so it goes
first.

`library.game_id` holds RAWG ids. After the swap, the catalogue speaks IGDB ids.
`excludePlayed` compares one against the other, matches nothing, and criterion 8
— *a game in the library is never recommended again* — stops working. Nothing on
screen looks wrong. The shortlist still returns three games, the gates still
pass, the page still says "0 games in your library were kept out of this" and
that sentence is now a lie.

**The guard comes before the migration, not after.**

1. Add `source` to the library table (`'rawg' | 'igdb'`), defaulting to `'rawg'`
   for existing rows. One migration file.
2. `excludePlayed` takes the catalogue's own source name and compares it against
   the sources present in the library. A mismatch is not a silent no-op: it
   raises, and the pipeline reports it the way `libraryError` is already
   reported. A criterion that cannot be checked must say so.
3. An offline check that fails when library rows and catalogue ids disagree about
   their source. This check must fail today, before any IGDB code exists, if the
   source column is populated wrongly — otherwise it is decoration.

Only then, the data itself. Two options, and this one is yours:

- **Wipe it.** It is a demonstration library on a shared row with no accounts.
  Honest, instant, and the only cost is re-adding a few games.
- **Re-resolve it.** A one-off script matches each RAWG title and release year
  against IGDB, writes the IGDB id, and *prints every row it could not match*
  for you to resolve by hand. This is title matching — the thing v1 died on —
  but done once, offline, with its failures visible, which is a different
  activity from doing it in the hot path on every request. It is defensible
  precisely because the failures are printed rather than absorbed.

I lean to wiping it. The library has a handful of rows and the migration script
is an hour that buys nothing you cannot get by clicking Add four times.

---

## The trick that keeps this small

`src/catalogue.js` exports a known surface: `assembleCandidates`, `countFor`,
`fetchGenres`, `fetchParentPlatforms`, `buildPoolQuery`, `toCandidate`,
`usable`, `excludePlayed`, `rankByTagMatch`, `dominanceReport`,
`fetchDescription`.

`src/igdb.js` implements **the same surface**, with the same argument shapes and
the same return shapes. `src/pipeline.js`, `src/shortlist.js` and every gate stay
untouched, because they were written against that surface rather than against
RAWG.

This is the interfaces-are-code point from Lesson 8. Whatever must be reliable is
enforced in code, and the thing that must be reliable here is that the rest of
the program cannot tell which catalogue it is talking to.

It also gives something better than a cutover: **both modules can exist at once.**
A script that asks RAWG and IGDB for the identical request and prints the two
candidate sets side by side is an N-version comparison of two independent
sources — Lesson 8's pattern, applied to the actual problem rather than to an
exercise. It answers "is IGDB better here" with a diff instead of an opinion, and
it is the strongest artefact this branch could produce whether or not the
migration lands.

---

## Order of work

Each step ends with something that can be run and read. Nothing proceeds on an
assumption the previous step did not measure.

**0. Probe.** `npm run probe:igdb`. Numbers for everything below. *Blocking.*

**1. Decision 0006.** What was measured, what it costs, what it breaks, what was
chosen and what was given up. Written before the code, not after it.

**2. `src/igdb.js` — transport only.** Token acquisition with a module-scope
cache and refresh, the Apicalypse POST helper, the `/count` helper, and an
inspect script that prints a real response. Nothing else imports it yet. The
token is the new failure mode: it lasts about sixty days, so the cache must
refresh on expiry *and* recover from a 401, because a token can be revoked before
it expires.

**3. Pin the vocabularies.** `data/categories.igdb.json`,
`platforms.igdb.json`, `tags.igdb.json`, written alongside the RAWG files rather
than over them. IGDB splits what RAWG calls tags across themes, keywords and
player perspectives; the probe says how big each is and whether a hand pass is
needed again. The RAWG files stay until the switch, so the two can be compared.

**4. The library source guard.** Section one above. Before any switch.

**5. Port the surface.** `src/igdb.js` grows the rest of the exports. Its own
check suite with IGDB-shaped fixtures. The existing RAWG suites keep passing —
this step adds checks and deletes none.

**6. The comparison script.** Same request, both catalogues, printed side by
side. This is where "is this actually better" gets answered.

**7. Switch.** One import changes in `src/pipeline.js` and the endpoints. Data
files renamed into place. RAWG checks retired in the same commit that retires
RAWG, not before.

**8. Verify against the written criteria.** The reference set, criterion by
criterion, on the branch. Then reference cases 5 and 6, which have never been
run.

**9. Front page and dialog on the new source.** Critic scores in the row that has
been empty, and video in the dialog — the two things that started this.

---

## What this does not touch

- The rule the design rests on. The model still chooses only from a set it was
  given and code still verifies every id came back from that set. A different
  catalogue changes where the set comes from, not what may be done with it.
- The nine gates. Their vocabularies change; their logic does not.
- The prompt. It never names a catalogue.
- `main`.

## What it costs, stated plainly

Two check suites rewritten against new fixtures (114 checks). Three pinned
vocabularies rebuilt, one of which was a hand pass over 9,736 entries last time.
A query builder rewritten from URL parameters to a query language. A new secret
in Netlify's environment. An auth token that expires, on a site with deploys
stopped and five credits left.

And a real chance of being half-migrated on Friday, which is why `main` is not
being touched.
