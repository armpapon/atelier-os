-- ============================================================================
--  Family events — support multiple memory photos
--  Run in: Supabase Dashboard → Database → SQL Editor → New query
--  Idempotent — safe to re-run. Keeps the old single photo_url for back-compat;
--  new code reads `photos` (a JSON array of URLs) and falls back to photo_url.
-- ============================================================================

alter table public.family_events
  add column if not exists photos jsonb not null default '[]'::jsonb;

-- Migrate any existing single photo into the array.
update public.family_events
   set photos = jsonb_build_array(photo_url)
 where photo_url is not null
   and (photos is null or photos = '[]'::jsonb);
