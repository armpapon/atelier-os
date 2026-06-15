-- ════════════════════════════════════════════════════════════════════════════
--  Second Brain — Notes (Zettelkasten-style)
--
--  CONTEXT (v1.4)
--  A single home for free-form notes that link to each other via [[wiki links]].
--  Search is substring-based (ilike) so Thai text — which has no word spaces and
--  is poorly tokenised by Postgres FTS — searches reliably. pg_trgm GIN indexes
--  keep "%...%" matching fast.
--
--  RUN ONCE IN SUPABASE SQL EDITOR.  Idempotent — safe to re-run.
-- ════════════════════════════════════════════════════════════════════════════

create extension if not exists pg_trgm;

create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'ไม่มีชื่อ',
  body  text not null default '',
  tags  text[] not null default '{}',
  pinned boolean not null default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists notes_user_updated_idx on public.notes(user_id, pinned desc, updated_at desc);
create index if not exists notes_title_trgm_idx on public.notes using gin (title gin_trgm_ops);
create index if not exists notes_body_trgm_idx  on public.notes using gin (body  gin_trgm_ops);
create index if not exists notes_tags_idx        on public.notes using gin (tags);

alter table public.notes enable row level security;
drop policy if exists "own_notes" on public.notes;
create policy "own_notes" on public.notes
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
