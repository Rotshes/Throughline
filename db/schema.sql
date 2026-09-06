-- Throughline — Supabase schema.
-- Run once in the Supabase SQL editor.
--
-- Row Level Security is enabled on both tables with NO policies. That is
-- deliberate: the backend uses the service key, which bypasses RLS, and nothing
-- else should ever read or write these. Without RLS enabled, the anon key
-- (which is public by design) could read every row.

create table if not exists sessions (
  id             uuid primary key default gen_random_uuid(),
  created_at     timestamptz not null default now(),
  path           text not null check (path in ('A', 'B')),
  input_games    text[],
  motifs         jsonb,
  outcome        text not null check (outcome in ('recommended', 'no_good_fit', 'failed')),
  failure_stage  text,
  failure_reason text,
  recommendation jsonb,
  -- Criterion 14. Null until the user commits; false is never written, because
  -- "did not click" and "declined" are different things and only one of them
  -- means anything.
  accepted       boolean,
  accepted_at    timestamptz
);

-- Criterion 10. One row per model call, including the ones that failed.
create table if not exists model_calls (
  id             bigint generated always as identity primary key,
  created_at     timestamptz not null default now(),
  session_id     uuid references sessions(id) on delete cascade,
  call           text not null,
  model          text,
  prompt_file    text,
  prompt_version text,
  prompt_sha256  text,
  tokens_in      int,
  tokens_out     int,
  cost_usd       numeric(12, 8),
  latency_ms     int,
  success        boolean not null,
  failure_reason text,
  attempt        int
);

create index if not exists model_calls_session_idx on model_calls (session_id);
create index if not exists model_calls_created_idx on model_calls (created_at desc);

alter table sessions    enable row level security;
alter table model_calls enable row level security;
