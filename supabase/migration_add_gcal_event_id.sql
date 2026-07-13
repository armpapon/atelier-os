-- ════════════════════════════════════════════════════════════════════════════
--  Google Calendar event id on journal entries (v3.29)
--  Stores the stable Google Calendar event id on each imported meeting so that
--  re-pulling the day UPDATES the same card (e.g. a moved meeting 10:00 → 12:00
--  keeps ONE card at the new time) instead of creating a duplicate.
--  Idempotent — safe to re-run.
-- ════════════════════════════════════════════════════════════════════════════

alter table journal_entries
  add column if not exists gcal_event_id text;

-- Fast lookup when reconciling a re-import against existing rows.
create index if not exists journal_entries_gcal_event_id_idx
  on journal_entries (user_id, gcal_event_id);
