-- ============================================================================
--  Journal entries — add long-form note + event time/location
--  Run in: Supabase Dashboard → Database → SQL Editor → New query
--  Idempotent — safe to re-run.
-- ============================================================================

alter table public.journal_entries
  add column if not exists note text,
  add column if not exists event_time time,
  add column if not exists event_end_time time,
  add column if not exists location text;
