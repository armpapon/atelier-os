-- ════════════════════════════════════════════════════════════════════════════
--  Shopee to-ship queue, shared between partner accounts (v4.12)
--  One queue for the couple: the account whose Gmail receives the shop's mail
--  syncs orders in; EITHER partner can tick "ส่งแล้ว" and the other sees it
--  clear. Partner linkage reuses public.partners (shared appointments).
--  Idempotent — safe to re-run.
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists public.shopee_orders (
  order_id   text primary key,                -- Shopee order sn (#260807PG5EP8HX)
  owner_id   uuid not null references auth.users(id) on delete cascade,
  buyer      text,
  label      text,
  state      text not null default 'open' check (state in ('open', 'shipped', 'cleared')),
  mail_ts    timestamptz,                     -- ts of the latest source mail
  thread_id  text,                            -- Gmail thread for the deep link
  shipped_by uuid references auth.users(id),
  shipped_at timestamptz,
  updated_at timestamptz not null default now()
);
create index if not exists shopee_orders_state_idx on public.shopee_orders(state);

alter table public.shopee_orders enable row level security;

-- Owner = the account that imported the order (mail receiver). The partner
-- (via public.partners, each user sees their own linkage row) gets the same
-- read/tick rights; inserts and deletes stay owner-only.
drop policy if exists "shopee select" on public.shopee_orders;
drop policy if exists "shopee insert" on public.shopee_orders;
drop policy if exists "shopee update" on public.shopee_orders;
drop policy if exists "shopee delete" on public.shopee_orders;

create policy "shopee select" on public.shopee_orders
  for select using (
    auth.uid() = owner_id
    or exists (select 1 from public.partners p
               where p.user_id = auth.uid() and p.partner_id = owner_id)
  );
create policy "shopee insert" on public.shopee_orders
  for insert with check (auth.uid() = owner_id);
create policy "shopee update" on public.shopee_orders
  for update using (
    auth.uid() = owner_id
    or exists (select 1 from public.partners p
               where p.user_id = auth.uid() and p.partner_id = owner_id)
  ) with check (
    auth.uid() = owner_id
    or exists (select 1 from public.partners p
               where p.user_id = auth.uid() and p.partner_id = owner_id)
  );
create policy "shopee delete" on public.shopee_orders
  for delete using (auth.uid() = owner_id);
