-- ════════════════════════════════════════════════════════════════════════════
--  Gmail dismissed threads — "เมลค้างตอบ" manual dismiss (v3.14)
--  A thread the user marked as handled (e.g. resolved by phone). We keep the
--  timestamp of the thread's latest message at dismissal time so that if the
--  client emails again later, the thread resurfaces automatically.
--  Idempotent — safe to re-run.
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists gmail_dismissed (
  user_id      uuid not null references auth.users(id) on delete cascade,
  thread_id    text not null,
  dismissed_ts bigint not null,          -- internalDate (ms) of the last message when dismissed
  created_at   timestamptz not null default now(),
  primary key (user_id, thread_id)
);

alter table gmail_dismissed enable row level security;

drop policy if exists "gmail_dismissed_own" on gmail_dismissed;
create policy "gmail_dismissed_own" on gmail_dismissed
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
