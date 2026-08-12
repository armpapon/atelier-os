-- ════════════════════════════════════════════════════════════════════════════
--  วางแผนภาษี — tax_profiles (v4.28)
--
--  CONTEXT
--  One row per PERSON per TAX YEAR. The owner plans for himself, แพท, and
--  anyone else he supports (พ่อ), so "person" is a free-form name rather than
--  an account: none of these people log in.
--
--  `tax_year` stores the GREGORIAN year (2026). The UI only ever displays
--  พ.ศ. (2569) — one place to add 543, no ambiguity in the data.
--
--  `income` / `deductions` are jsonb on purpose. Caps, brackets and combined
--  ceilings live in src/lib/taxTH.js, which is pure and testable; the day the
--  Revenue Department changes a cap, that is a code change and a redeploy —
--  never a migration and never a backfill of everyone's saved figures.
--    income     = { salaryMonthly, bonus, other: [{label, amount}], wht }
--    deductions = { <key>: number, custom: [{label, amount}] }
--
--  RUN ONCE IN SUPABASE SQL EDITOR.  Idempotent — safe to re-run.
--  Suggested tab name: loop_tax_planner
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists public.tax_profiles (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  tax_year    int  not null,
  person_name text not null,
  is_self     boolean default false,
  sort_order  int default 0,
  income      jsonb not null default '{}'::jsonb,
  deductions  jsonb not null default '{}'::jsonb,
  notes       text,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- Re-runnable equivalents of the inline constraints, for a table that already
-- exists from an earlier partial run.
alter table public.tax_profiles alter column income     set default '{}'::jsonb;
alter table public.tax_profiles alter column deductions set default '{}'::jsonb;

-- unique (user_id, tax_year, person_name) — one card per person per year.
-- Expressed as an index so `if not exists` applies (ADD CONSTRAINT has no such
-- form, and would abort the whole script on a re-run).
create unique index if not exists tax_profiles_person_uniq
  on public.tax_profiles (user_id, tax_year, person_name);

-- The page's only query shape: everyone in one year, in display order.
create index if not exists tax_profiles_user_year_idx
  on public.tax_profiles (user_id, tax_year, sort_order);

alter table public.tax_profiles enable row level security;

-- Owner-only, all four verbs. These are the owner's household finances; there
-- is no sharing story here and no reason to invent one.
drop policy if exists "own_tax_profiles" on public.tax_profiles;
create policy "own_tax_profiles" on public.tax_profiles
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ── Check it landed ─────────────────────────────────────────────────────────
-- select count(*) as profiles from public.tax_profiles;
