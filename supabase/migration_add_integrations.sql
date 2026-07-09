-- ============================================================================
--  Phase 0 — Integrations foundation (OAuth token store)
--  Run in: Supabase Dashboard → Database → SQL Editor → New query
--  Idempotent — safe to re-run.
--
--  Holds per-user OAuth tokens for external providers (google, asana, ...).
--  Tokens are written by Edge Functions using the service role. RLS lets the
--  owner read their own row (client only reads status columns, never posts
--  tokens directly).
-- ============================================================================

create table if not exists public.integrations (
  id uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  provider      text not null,                 -- 'google' | 'asana'
  access_token  text,
  refresh_token text,
  expires_at    timestamptz,
  scope         text,
  meta          jsonb not null default '{}'::jsonb,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now(),
  unique (user_id, provider)
);

alter table public.integrations enable row level security;
drop policy if exists "own_integrations" on public.integrations;
create policy "own_integrations" on public.integrations
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
