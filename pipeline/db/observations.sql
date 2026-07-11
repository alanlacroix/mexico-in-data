-- observations.sql — the historical VINTAGE store behind The Read (Fable's analysis architecture).
--
-- The JSON files already hold the latest full history per metric; this store adds the thing they
-- can't: what each source said AT EACH FETCH. INEGI revises GDP, SESNSP revises homicides, Banxico
-- revises trade — and today that revision overwrites the JSON and the old number is lost. Here it's
-- kept, so "INEGI revised Q1 GDP down 0.2pp" becomes content. Three tables, change-only inserts.
--
-- Run once in the Supabase SQL editor (idempotent). RLS on; service key only, no anon access —
-- this store is private, the site never reads it in the render path.

create table if not exists mb_runs (
  run_id      uuid primary key default gen_random_uuid(),
  started_at  timestamptz not null default now(),
  git_sha     text,
  status      text not null default 'success',       -- success | partial | failed
  n_inserted  integer default 0,
  notes       jsonb
);

create table if not exists mb_metrics (
  metric_id        text primary key,                 -- e.g. 'banxico-inflacion'
  source           text,                             -- 'Banco de México (SIE)'
  source_series_id text,                             -- 'SP1'
  unit             text,
  cadence          text,
  title            text
);

create table if not exists mb_observations (
  metric_id  text not null references mb_metrics on delete cascade,
  period     date not null,                          -- the date the value is FOR
  value      numeric not null,
  fetched_at timestamptz not null default now(),     -- when we first saw THIS value for this period
  run_id     uuid references mb_runs,
  primary key (metric_id, period, fetched_at)
);
create index if not exists mb_obs_metric_period on mb_observations (metric_id, period);

-- the current view of the world: the most recently fetched value for each (metric, period)
create or replace view mb_latest_observations as
  select distinct on (metric_id, period) metric_id, period, value, fetched_at, run_id
  from mb_observations
  order by metric_id, period, fetched_at desc;

-- revisions: any (metric, period) with more than one distinct value over time
create or replace view mb_revisions as
  select metric_id, period, count(distinct value) as versions,
         min(value) as first_value, max(fetched_at) as last_seen
  from mb_observations
  group by metric_id, period
  having count(distinct value) > 1;

alter table mb_runs         enable row level security;
alter table mb_metrics      enable row level security;
alter table mb_observations enable row level security;
-- no policies = service role only. The public site never touches this store.
