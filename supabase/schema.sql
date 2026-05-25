-- ============================================================================
--  Atelier OS — Database Schema
--  Run this in Supabase SQL Editor (Database → SQL Editor → New query → paste)
--  Idempotent: ใช้ IF NOT EXISTS / drop-then-create เพื่อ re-run ได้
-- ============================================================================

-- ── Extensions ──────────────────────────────────────────────────────────────
create extension if not exists "pgcrypto";   -- gen_random_uuid()

-- ── Helper: updated_at trigger ──────────────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end; $$;


-- ============================================================================
--  PROFILES — เก็บข้อมูล user เพิ่มเติม (ผูกกับ auth.users)
-- ============================================================================
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text,
  initial text,
  avatar_url text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- auto-create profile เมื่อ user signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, name, initial)
  values (new.id, coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)), '?');
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- ============================================================================
--  TASKS — งานประจำวัน (สำหรับ dashboard "วันนี้ของคุณ")
-- ============================================================================
create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  text text not null,
  tag text,                        -- TRADE / READ / FAMILY / FINANCE / LEARN / WORK
  done boolean default false,
  due_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists tasks_user_due_idx on public.tasks(user_id, due_at desc);


-- ============================================================================
--  TRADING JOURNAL
-- ============================================================================
create table if not exists public.trades (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  trade_date date not null,
  symbol text not null,            -- EURUSD, XAUUSD, etc.
  side text not null check (side in ('long', 'short')),
  setup text,                      -- 'OB + FVG', 'Liquidity Sweep', etc.
  entry_price numeric,
  exit_price numeric,
  stop_loss numeric,
  take_profit numeric,
  position_size numeric,
  rr text,                         -- '1:3.2'
  pnl numeric,                     -- in THB
  status text check (status in ('WIN', 'LOSS', 'BREAKEVEN', 'OPEN')),
  session text,                    -- 'NY', 'LDN', 'ASIA'
  bias text,
  reason text,                     -- why I took this trade
  emotion text,                    -- what I felt
  tags text[],                     -- ['OB', 'FVG', 'A+ Setup']
  screenshot_url text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists trades_user_date_idx on public.trades(user_id, trade_date desc);

create trigger trades_updated_at before update on public.trades
  for each row execute function public.set_updated_at();


-- ============================================================================
--  LEARNING HUB
-- ============================================================================
create table if not exists public.learning_sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('youtube', 'udemy', 'podcast', 'book', 'blog', 'course')),
  title text not null,
  author text,
  url text,
  duration_min int,
  progress int default 0 check (progress >= 0 and progress <= 100),
  status text default 'active' check (status in ('active', 'completed', 'paused', 'dropped')),
  cover text,                      -- 'ink', 'paper', 'rose', 'blue'
  glyph text,                      -- 2-3 char for book cover
  category text,                   -- 'TRADING', 'TECH', etc.
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists learning_user_type_idx on public.learning_sources(user_id, type);

create table if not exists public.learning_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_id uuid references public.learning_sources(id) on delete cascade,
  title text,
  body text not null,
  tags text[],
  created_at timestamptz default now()
);
create index if not exists notes_user_idx on public.learning_notes(user_id, created_at desc);


-- ============================================================================
--  DAILY JOURNAL (bullet journal)
-- ============================================================================
create table if not exists public.journal_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  entry_date date not null,
  bullet_type text not null check (bullet_type in ('task', 'event', 'note', 'star', 'migrate')),
  text text not null,
  tag text,
  done boolean default false,
  created_at timestamptz default now()
);
create index if not exists journal_user_date_idx on public.journal_entries(user_id, entry_date desc);

create table if not exists public.moods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  mood_date date not null,
  value int not null check (value between 1 and 5),
  note text,
  created_at timestamptz default now(),
  unique(user_id, mood_date)
);


-- ============================================================================
--  HABITS
-- ============================================================================
create table if not exists public.habits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  target_per_week int default 7,
  active boolean default true,
  created_at timestamptz default now()
);

create table if not exists public.habit_logs (
  id uuid primary key default gen_random_uuid(),
  habit_id uuid not null references public.habits(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  log_date date not null,
  completed boolean default true,
  created_at timestamptz default now(),
  unique(habit_id, log_date)
);
create index if not exists habit_logs_user_date_idx on public.habit_logs(user_id, log_date desc);


-- ============================================================================
--  FINANCE
-- ============================================================================
create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  type text,                       -- 'savings', 'checking', 'investment', 'cash', 'crypto'
  balance numeric default 0,
  tone text default 'amber',       -- color tag
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid references public.accounts(id) on delete set null,
  title text not null,
  category text,                   -- 'อาหาร', 'เดินทาง', 'บิล', etc.
  amount numeric not null,         -- positive = income, negative = expense
  type text check (type in ('food', 'transport', 'bills', 'income', 'shop', 'family', 'other')),
  occurred_at timestamptz default now(),
  note text,
  created_at timestamptz default now()
);
create index if not exists txn_user_date_idx on public.transactions(user_id, occurred_at desc);

create table if not exists public.budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null,
  monthly_limit numeric not null,
  month date not null,             -- store as first day of month
  created_at timestamptz default now(),
  unique(user_id, category, month)
);

create table if not exists public.financial_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  target_amount numeric not null,
  current_amount numeric default 0,
  deadline date,
  created_at timestamptz default now()
);


-- ============================================================================
--  FAMILY
-- ============================================================================
create table if not exists public.family_members (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  role text,                       -- 'แม่', 'ภรรยา', 'ลูกสาว', etc.
  color text default '#d4a574',
  initial text,
  birth_date date,
  note text,
  created_at timestamptz default now()
);

create table if not exists public.family_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  member_id uuid references public.family_members(id) on delete set null,
  title text not null,
  event_date date not null,
  note text,
  reminded boolean default false,
  created_at timestamptz default now()
);

create table if not exists public.family_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  author text,                     -- 'พี่ใหม่', 'อาทิตย์' (manual entry)
  title text,
  body text not null,
  created_at timestamptz default now()
);


-- ============================================================================
--  ROW LEVEL SECURITY (RLS)
--  เปิด RLS ทุก table แล้วตั้ง policy ให้ user เห็นแค่ข้อมูลตัวเอง
-- ============================================================================
do $$
declare t text;
begin
  for t in
    select unnest(array[
      'profiles', 'tasks', 'trades', 'learning_sources', 'learning_notes',
      'journal_entries', 'moods', 'habits', 'habit_logs',
      'accounts', 'transactions', 'budgets', 'financial_goals',
      'family_members', 'family_events', 'family_notes'
    ])
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "own rows" on public.%I', t);
  end loop;
end $$;

-- profiles: id = user id
create policy "own rows" on public.profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

-- ทุก table อื่นใช้ user_id
create policy "own rows" on public.tasks
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own rows" on public.trades
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own rows" on public.learning_sources
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own rows" on public.learning_notes
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own rows" on public.journal_entries
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own rows" on public.moods
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own rows" on public.habits
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own rows" on public.habit_logs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own rows" on public.accounts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own rows" on public.transactions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own rows" on public.budgets
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own rows" on public.financial_goals
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own rows" on public.family_members
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own rows" on public.family_events
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own rows" on public.family_notes
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ============================================================================
--  DONE — ตรวจสอบได้ที่ Database → Tables
-- ============================================================================
