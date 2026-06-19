-- ============================================================================
--  Family events — add an optional memory photo
--  Run in: Supabase Dashboard → Database → SQL Editor → New query
--  Idempotent — safe to re-run.
-- ============================================================================

alter table public.family_events
  add column if not exists photo_url text;
