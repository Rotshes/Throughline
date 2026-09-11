-- Throughline — migration 002. Run once in the Supabase SQL editor.
--
-- The `sessions` table from turn 003 is shaped for the motif design: a path of
-- 'A' or 'B', a list of input games, motifs, and one recommendation. None of
-- those exist any more.
--
-- `sessions` is NOT altered and NOT dropped. Its rows are the record of what
-- turns 001 to 004 actually did, and turn 004's verdict cites them. Rewriting
-- the table to fit the new design would destroy the evidence that the old design
-- worked — the same reason the turn records for it stay as written.
--
-- So: a new table, and one nullable column on model_calls. Old rows keep
-- session_id, new rows carry request_id, and both remain readable.

create table if not exists requests (
  id              uuid primary key default gen_random_uuid(),
  created_at      timestamptz not null default now(),

  -- What was asked for. Criterion 7: without the filters, a bad shortlist
  -- cannot be attributed to the filter rather than to the model.
  category        text not null,
  platforms       text[] not null,
  tags            text[] not null default '{}',

  -- What the model was given to choose from. The ids are the whole point:
  -- criterion 2 says every pick must have come from this set, and after the
  -- fact this column is the only way to check that claim.
  candidate_ids   int[] not null,
  candidate_count int  not null,
  -- How many the catalogue held before MIN_RATINGS. The gap between this and
  -- candidate_count is pitfall 10 made visible.
  catalogue_count int,

  outcome         text not null check (outcome in ('shortlisted', 'empty', 'failed')),
  failure_stage   text,
  failure_reason  text,

  -- The three picks as they were shown: id, angle, case, title. Criterion 15
  -- requires the case be stored exactly as displayed, so a click can be tied to
  -- the text that persuaded rather than to a regenerated version of it.
  picks           jsonb,

  -- Criterion 15. Null until someone clicks. Which of the three, not whether.
  clicked_id      int,
  clicked_at      timestamptz
);

-- Criterion 10 continues to hold across the design change: one row per model
-- call, including failures. Nullable because the historic rows have none.
alter table model_calls
  add column if not exists request_id uuid references requests(id) on delete cascade;

create index if not exists model_calls_request_idx on model_calls (request_id);
create index if not exists requests_created_idx    on requests (created_at desc);

-- Same reasoning as the original schema: the backend uses the service key,
-- which bypasses RLS. With RLS off, the publishable key — public by design in
-- any frontend — could read every row.
alter table requests enable row level security;
