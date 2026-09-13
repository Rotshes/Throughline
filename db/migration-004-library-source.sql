-- Throughline — migration 004. Run once in the Supabase SQL editor.
--
-- The catalogue changed, and this is the only place in the system where that
-- fact can hide.
--
-- `game_id` holds catalogue ids. Every row written before today holds a RAWG id;
-- from now on the catalogue speaks IGDB ids. They are numbers from two different
-- namespaces that look exactly alike, and criterion 8 — a game in the library is
-- never recommended again — is implemented by comparing them.
--
-- Without a source column, after the swap:
--
--   * excludePlayed compares IGDB candidate ids against RAWG library ids
--   * nothing matches
--   * three games come back, every one of the nine gates passes
--   * the page prints "0 games in your library were kept out of this"
--   * that sentence is false and nothing on screen looks wrong
--
-- An empty exclusion and an empty library are indistinguishable from the
-- outside. This column is what makes the difference visible, and
-- src/igdb-catalogue.js throws rather than silently excluding nothing when it
-- finds a row it cannot check.
--
-- Decision 0006 chose to discard the existing rows rather than re-resolve them:
-- re-resolution means matching RAWG titles to IGDB games, and title matching is
-- what v1 of this project died of.

alter table library
  add column if not exists source text not null default 'rawg'
  check (source in ('rawg', 'igdb'));

-- The default above is deliberate and is the safe direction. Existing rows ARE
-- RAWG rows; labelling them 'igdb' to make the error go away would be writing
-- down something untrue to silence a check that is working.

comment on column library.source is
  'Which catalogue game_id belongs to. RAWG and IGDB ids are both integers and '
  'mean different games. See db/migration-004-library-source.sql and '
  'docs/decisions/0006.';

-- --------------------------------------------------------------------------
-- Discarding the RAWG rows.
--
-- Separate from the column, and deliberately NOT run automatically: adding a
-- column is reversible and deleting rows is not. Run this only when the switch
-- to IGDB actually happens, and read the count first.
--
--   select source, count(*) from library group by source;
--
--   delete from library where source = 'rawg';
--
-- Everything the library shows is a copy of catalogue data taken at the moment
-- a game was added, so there is nothing here that cannot be recovered by
-- clicking Add again on the new catalogue.
-- --------------------------------------------------------------------------
