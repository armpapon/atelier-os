-- ============================================================================
--  Migration: reassign + archive an account in ONE transaction (batch C · B3)
--
--  THE DEFECT
--  Finance.jsx archived an account in two separate PostgREST requests:
--      await reassignTransactionsAccount(from, to);   -- request 1
--      await archiveAccount(from);                    -- request 2
--  A failure (or a closed tab) between them left the ledger already moved and
--  the source account still ACTIVE and now empty — a state no retry detects,
--  because the reassign half is idempotent and reports "0 rows to move".
--
--  WHAT THIS ADDS
--  reassign_and_archive_account(p_from uuid, p_to uuid) — moves every
--  transaction link and flips is_active in a single transaction, returning
--  the number of transactions moved. A failure at either stage rolls the
--  whole thing back: both accounts and every transaction link are untouched.
--
--  p_to may be NULL — "archive without moving anything" (the picker's
--  "ไม่ย้ายรายการ" option). Then no transaction is touched at all.
--
--  SECURITY INVOKER → RLS applies exactly as it does to the client. The
--  explicit user_id checks are on top of RLS, not instead of it: they turn a
--  cross-user id into a named error instead of a silent zero-row no-op.
--
--  LOCK ORDER: both accounts are row-locked in a single statement ordered by
--  id, so two concurrent archives involving the same pair cannot deadlock.
--
--  Idempotent: CREATE OR REPLACE. Safe to re-run.
--  SAFE BEFORE IT RUNS: the client detects PGRST202/42883 and falls back to
--  the previous two-request path (non-atomic — noted in the code comment).
--
--  Suggested tab name: loop_account_reassign_archive_rpc
-- ============================================================================

create or replace function public.reassign_and_archive_account(
  p_from uuid,
  p_to   uuid default null
) returns int
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_from  record;
  v_to    record;
  v_moved int := 0;
begin
  if v_uid is null then raise exception 'Not logged in'; end if;
  if p_from is null then raise exception 'ต้องระบุบัญชีต้นทาง'; end if;
  if p_to is not null and p_to = p_from then
    raise exception 'ย้ายรายการเข้าบัญชีเดิมไม่ได้';
  end if;

  -- Deterministic lock order (by id) for the whole pair, in one statement.
  perform id from accounts
   where id = p_from or (p_to is not null and id = p_to)
   order by id
     for update;

  select id, user_id into v_from from accounts where id = p_from;
  if not found then raise exception 'ไม่พบบัญชีต้นทาง'; end if;
  if v_from.user_id <> v_uid then raise exception 'บัญชีต้นทางไม่ใช่ของผู้ใช้นี้'; end if;

  if p_to is not null then
    select id, user_id into v_to from accounts where id = p_to;
    if not found then raise exception 'ไม่พบบัญชีปลายทาง'; end if;
    if v_to.user_id <> v_uid then raise exception 'บัญชีปลายทางไม่ใช่ของผู้ใช้นี้'; end if;

    update transactions
       set account_id = p_to
     where account_id = p_from
       and user_id = v_uid;
    get diagnostics v_moved = row_count;
  end if;

  update accounts set is_active = false where id = p_from;

  return v_moved;
end;
$$;
