-- ============================================================================
--  Family — Kid Quotes (precious things the kids say)
--  Run in: Supabase Dashboard → Database → SQL Editor → New query
--  Idempotent — safe to re-run.
-- ============================================================================

create table if not exists public.family_quotes (
  id uuid primary key default gen_random_uuid(),
  user_id   uuid not null references auth.users(id) on delete cascade,
  member_id uuid references public.family_members(id) on delete set null,
  quote     text not null,
  said_on   date not null default current_date,
  created_at timestamptz default now()
);
create index if not exists family_quotes_user_idx on public.family_quotes(user_id, said_on desc);

alter table public.family_quotes enable row level security;
drop policy if exists "own_quotes" on public.family_quotes;
create policy "own_quotes" on public.family_quotes
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
