-- Throughline — migration 003. Run once in the Supabase SQL editor.
--
-- One library, shared by everyone who opens the site. There is no account
-- system and no per-visitor identity: this is a demonstration of the feature
-- rather than a personal account, and the decision is recorded in
-- docs/decisions/0005 rather than left to be inferred from the absence of a
-- users table.
--
-- Consequences, stated so nobody has to work them out later:
--   * Anyone who can open the site can add to, change and empty this library.
--   * Recommendations exclude its contents for every visitor, not just the one
--     who added them.
--   * A real account system would add a user_id column and a policy; the shape
--     below does not have to change for that to happen.

create table if not exists library (
  -- The catalogue id, and the primary key. A game is either in the library or
  -- it is not — there is no second copy of Hades at a different status.
  game_id     int primary key,

  status      text not null check (status in
                ('playing', 'plan', 'on_hold', 'dropped', 'completed')),

  added_at    timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  -- Enough of the catalogue record to render the library without asking the
  -- catalogue again. Twenty games would otherwise be twenty requests of a
  -- monthly twenty thousand every time somebody opens the page.
  --
  -- These are a copy, deliberately. They are what the game looked like when it
  -- was added; the catalogue is still the authority if they ever disagree.
  title       text not null,
  slug        text,
  image       text,
  released    text,
  platforms   text[] not null default '{}'
);

create index if not exists library_status_idx  on library (status);
create index if not exists library_updated_idx on library (updated_at desc);

-- Same reasoning as the other two tables: the backend uses the service key,
-- which bypasses RLS. With RLS off, the publishable key — public by design in
-- any frontend — could read and write every row directly.
alter table library enable row level security;
