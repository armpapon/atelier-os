-- ════════════════════════════════════════════════════════════════════════════
--  Shared appointments between partner accounts (v3.37)
--  Mark a meeting "ด้วยกัน" so it appears on BOTH partners' Daily Journals.
--  Two-way: either partner can tick done / edit; only the owner inserts/deletes.
--  Additive for own data — a user never loses access to their own rows.
--  Idempotent — safe to re-run.
-- ════════════════════════════════════════════════════════════════════════════

-- 1) Link the two accounts (one row per user → their partner).
create table if not exists public.partners (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  partner_id uuid not null       references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.partners enable row level security;
drop policy if exists "own rows" on public.partners;
create policy "own rows" on public.partners
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 2) Which partner a journal entry is shared with (null = private, as before).
alter table public.journal_entries
  add column if not exists shared_with uuid references auth.users(id);
create index if not exists journal_shared_with_idx
  on public.journal_entries(shared_with);

-- 3) Replace the single "own rows" policy with per-command policies so a partner
--    can SEE and TICK/EDIT shared entries, while INSERT/DELETE stay owner-only.
drop policy if exists "own rows" on public.journal_entries;
create policy "journal select" on public.journal_entries
  for select using (auth.uid() = user_id or auth.uid() = shared_with);
create policy "journal insert" on public.journal_entries
  for insert with check (auth.uid() = user_id);
create policy "journal update" on public.journal_entries
  for update using (auth.uid() = user_id or auth.uid() = shared_with)
             with check (auth.uid() = user_id or auth.uid() = shared_with);
create policy "journal delete" on public.journal_entries
  for delete using (auth.uid() = user_id);

-- ── ONE-TIME LINKAGE — run once, then the "ด้วยกัน" toggle appears in the app.
--    (Kept commented so re-running the migration won't touch data.)
-- insert into public.partners (user_id, partner_id)
--   select a.id, b.id from auth.users a, auth.users b
--   where a.email = 'armpapon@gmail.com' and b.email = 'patparnrada@gmail.com'
--   on conflict (user_id) do update set partner_id = excluded.partner_id;
-- insert into public.partners (user_id, partner_id)
--   select b.id, a.id from auth.users a, auth.users b
--   where a.email = 'armpapon@gmail.com' and b.email = 'patparnrada@gmail.com'
--   on conflict (user_id) do update set partner_id = excluded.partner_id;
