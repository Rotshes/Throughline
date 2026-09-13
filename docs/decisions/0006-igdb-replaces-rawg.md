# 0006 — IGDB replaces RAWG

Status: accepted. Branch `igdb`. `main` stays on RAWG until this lands.

Supersedes the conclusion of 0004, which read: *"IGDB was considered and is not
needed."* That was true when it was written. It stopped being true for reasons
that were measured, not argued.

## What forced the question

The front page carried a row called "Best reviewed this year" that was empty for
a week. It looked like a design state rather than a defect, because an empty row
and a broken row render the same words.

Two probes established why (`scripts/probe-front.js`, `probe-front-2.js`):

    RAWG, 2026 releases                     2,016
    ... carrying a Metacritic score             0

Not a sort problem, not a dropped parameter. RAWG holds no press score for any
2026 release. Separately, its free tier carries no video at all — found in turn
005 and re-confirmed.

## What was measured

`scripts/probe-igdb.js` and `probe-igdb-2.js`, 56 requests, nothing written.

**Critic coverage.** Scored releases per year, `aggregated_rating != null`:

    2019  703    2022  550    2025  524
    2020  652    2023  607    2026  294
    2021  651    2024  586

294 against RAWG's 0. The question the row was asking now has an answer.

**Review counts are not review scores.** Sorting by `aggregated_rating` with no
floor returns games rated 100 by one critic. The top five were all exactly 100;
the first was a Switch 2 re-release of a 2020 game with a single review. Two
filters fix it, and both were discovered by printing output rather than by
reading a field list:

    2026 releases                        15,759
    scored                                  294
    scored, not a re-release                255
    scored, not a re-release, >= 5 reviews   10

`parent_game = null` is the port of RAWG's `exclude_additions`. IGDB has fifteen
`game_type` values — Port, Remaster, Remake, Expanded Game, Bundle, Pack — and a
re-release is a real game that is not a new one.

At a floor of 5 the row reads: Mina the Hollower, Resident Evil Requiem, Forza
Horizon 6, Nioh 3, Pragmata, Monster Hunter Stories 3, Marvel Tokon, 007 First
Light, Directive 8020, God of War Sons of Sparta. At a floor of 10 it is empty.

**Video.** 28.9% of everything released since 2024 carries a video. Among games
that are reviewed and are not re-releases, 107 of 107 do — and the ids are
YouTube ids, playable without a paid tier. RAWG charges $149/month for the same
thing.

**AND is expressible.** GameCube games in two genres:

    platform OR racing   288
    platform AND racing   11

RAWG could only do OR, which is why 0004 softened criterion 4 into ranking.

**Vocabulary.** 23 genres and 22 themes against RAWG's 19 flat genres. The themes
are the facets RAWG never had — open-world, survival, stealth, horror, sandbox,
warfare, party — and they are curated rather than scraped. 7,528 keywords remain
a polluted long tail and are not planned for use.

## Decision

Replace RAWG with IGDB. `src/igdb.js` implements the same exported surface as
`src/catalogue.js`, so `pipeline.js`, `shortlist.js` and all nine gates do not
change: they were written against that surface rather than against a vendor.

## What it costs, and what is given up

**The platform tree is hand-built.** IGDB has five platform families and PC is in
none of them. `data/platforms.json` — 14 families, 51 machines, two turns and two
bugs to get right — cannot be pinned from this source. `platform_family` covers
Nintendo (26 machines), PlayStation (10), Xbox (4) and Sega (12); everything else
is grouped by `platform_type` (1 Console, 2 Arcade, 3 Platform, 4 Operating
system, 5 Portable console, 6 Computer) by hand. IGDB's "Linux" family contains
Android, Stadia and Linux, which is technically defensible and useless; it is
ignored.

**The token expires.** RAWG's key never did. IGDB uses a Twitch client-credentials
token lasting about 57 days, so a deployed function must cache and refresh it,
and recover from a 401 — a token can be revoked before it expires. This is a new
production failure mode on a site with deploys stopped.

**The library is wiped.** `library.game_id` holds RAWG ids; after the swap the
catalogue speaks IGDB ids and criterion 8 would match nothing *silently*. A
`source` column is added and `excludePlayed` raises on a mismatch rather than
returning an empty exclusion. The existing rows are discarded — there are few,
and a title-matching migration would reintroduce exactly what v1 died of.

**Two check suites are rebuilt** against IGDB-shaped fixtures, and images need a
scheme and a size token: `//images.igdb.com/.../t_thumb/coc7me.jpg` becomes
`https:` plus `t_cover_big`.

## What was rejected

**Metacritic directly.** No public API exists and never has. Every result calling
itself one is a scraper, and Metacritic's terms — Fandom's, since the
acquisition — prohibit it. Not something to put in submitted coursework.

**OpenCritic.** A real API, but its ids are not RAWG's, so attaching a score to a
game means matching by title. v1 died on title matching and 0003 removed it.

**Both catalogues at once.** Same objection, plus a seam through the library that
would leave criterion 8 half-working.

## Known, open, deliberately unresolved

- **The review floor of 5 is provisional.** It yields 10 games for a row of 12,
  and near zero in January. A twelve-month window rather than a calendar year is
  the likely answer and is not yet measured.
- **100% video coverage was measured on the wrong population** for the shortlist.
  107 reviewed modern games all have video; a GameCube or Game Boy Advance
  shortlist almost certainly does not. Promising video in the dialog before
  measuring coverage on *that* population would repeat the error this project has
  now made twice.
- **AND is available but not obviously right.** Strict AND left 11 GameCube games
  where OR left 288. Criterion 5 forbids padding a thin result, so switching to
  AND would make thin results far more common. The likely design is AND with a
  measured fallback to OR and the count shown. Not decided here.
- **IGDB and RAWG disagree.** 933 GameCube games against 662. Neither is wrong;
  they are different databases, and the app inherits whichever it uses.
