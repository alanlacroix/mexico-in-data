-- The Mexico Brief — capture store (Supabase / Postgres).
--
-- Fable's Fork 2 ruling: CAPTURE is the spine. Raw article text is unrepeatable
-- (links rot); derived structure (entities, storylines, trends) is always
-- re-derivable later from the captured text with one batch job. So we store the
-- raw bodies + the pipeline's own judgments + the published issues NOW, and keep the
-- schema minimal. Entity/storyline tables are intentionally parked until a named
-- trigger fires (a wrong continuity claim, a trend query a script can't answer, or a
-- second read surface). Do not add them speculatively.
--
-- The captured bodies are for INTERNAL derivation only (summaries, later structure),
-- never republished. This lives in a private Supabase project, never the public repo.
--
-- Setup: create a dedicated Supabase project for The Mexico Brief, run this file in
-- the SQL editor, then set SUPABASE_URL + SUPABASE_SERVICE_KEY as repo secrets. The
-- pipeline writes via PostgREST with the service key (RLS is bypassed by that key;
-- these tables are private, so no anon policies are defined).

-- Every news item the pipeline has ever pulled, plus the judgments it made about it.
create table if not exists mb_items (
  id            text primary key,           -- sha1(url) slice, the ledger id
  url           text not null,
  source        text,
  source_name   text,
  tier          text,
  beat          text,
  lang          text,
  title         text,
  dek           text,
  published_at  timestamptz,
  first_seen    timestamptz,
  score         numeric,                     -- significance score, when build-email ranked it
  room          text,                        -- routed room, when ranked
  published_in  text,                        -- issue week if it appeared in an email (else null)
  updated_at    timestamptz not null default now()
);
create index if not exists mb_items_published_at on mb_items (published_at desc);
create index if not exists mb_items_beat         on mb_items (beat);
create index if not exists mb_items_room         on mb_items (room);
create index if not exists mb_items_published_in on mb_items (published_in);

-- The raw captured article text, one row per item. The irreversible asset.
create table if not exists mb_item_bodies (
  item_id     text primary key references mb_items (id) on delete cascade,
  body        text,
  char_count  int,
  ok          boolean,                       -- false = fetch failed / too thin (kept so we don't retry forever)
  fetched_at  timestamptz not null default now()
);

-- Every issue we built, as its full draft JSON. The product's own memory: this is
-- what powers "second straight pause" / "week 3 of X" continuity, read back into the
-- summarizer context.
create table if not exists mb_issues (
  week      text primary key,                -- ISO week, e.g. 2026-W28
  issue_no  int,
  subject   text,
  status    text,                            -- draft | sent
  draft     jsonb,                           -- the full assembled draft (topOfWeek, board, rooms, watch, ...)
  built_at  timestamptz,
  sent_at   timestamptz,
  updated_at timestamptz not null default now()
);
create index if not exists mb_issues_built_at on mb_issues (built_at desc);
