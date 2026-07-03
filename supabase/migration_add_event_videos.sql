-- ============================================================================
--  Family events — attach video links (YouTube / Google Drive / direct file)
--  Run in: Supabase Dashboard → Database → SQL Editor → New query
--  Idempotent — safe to re-run. Stores an array of video URLs (no upload).
-- ============================================================================

alter table public.family_events
  add column if not exists videos jsonb not null default '[]'::jsonb;
