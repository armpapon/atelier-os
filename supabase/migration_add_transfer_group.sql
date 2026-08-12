-- ============================================================================
--  Migration: scope transfers are a PAIR, provably (audit batch C · B5)
--
--  THE DEFECT
--  createScopeTransfer wrote two rows — personal −X and family +X — with
--  nothing linking them: no shared id, no account endpoints. So
--    · deleting one leg left the other behind, silently inventing income or
--      expense in one scope;
--    · editing the title or the date of one leg split the pair, after which
--      even a human could no longer tell the two rows belonged together.
--  (The amount was already locked on both sides — that part held.)
--
--  WHAT THIS ADDS
--  transactions.transfer_group_id — one uuid shared by both legs. With it:
--    · deleting either visible leg deletes the pair (one statement);
--    · editing title / date / note applies to both legs (one statement);
--    · the amount stays locked, as before.
--  Each leg also records its own account endpoint in the existing
--  transactions.account_id; the counterpart's endpoint is one group read away.
--
--  ON ATOMICITY — a deliberate scope note for the auditor
--  No RPC is needed here and none is added. PostgREST executes a multi-row
--  INSERT as a SINGLE statement in a SINGLE transaction, so both legs already
--  landed together or not at all; what was missing was the shared IDENTIFIER,
--  not the atomicity. The uuid is generated client-side (crypto.randomUUID)
--  and written into both rows of that one insert. Likewise the pair delete
--  (DELETE … WHERE transfer_group_id = $1) and the pair edit (UPDATE … WHERE
--  transfer_group_id = $1) are each one statement, hence one transaction. An
--  RPC wrapping a single statement would add a deploy dependency and buy
--  nothing.
--
--  BACKFILL — unambiguous pairs only
--  Legacy legs are matched on (same user, same Bangkok calendar day, equal
--  absolute amount, opposite sign, two different scopes) and grouped ONLY
--  when exactly one candidate exists on each side of that key. Anything less
--  certain is left ungrouped rather than guessed; the app keeps those legs
--  working and warns, on delete, that the counterpart may need removing by
--  hand.
--
--  Idempotent: IF NOT EXISTS, and the backfill only ever touches rows whose
--  transfer_group_id is still NULL. Safe to re-run.
--  SAFE BEFORE IT RUNS: the client retries the insert without the column on
--  PGRST204 and simply has no pairs to act on, i.e. today's behaviour.
--
--  Suggested tab name: loop_transfer_group_id
-- ============================================================================

alter table public.transactions
  add column if not exists transfer_group_id uuid;

create index if not exists transactions_transfer_group_idx
  on public.transactions (user_id, transfer_group_id)
  where transfer_group_id is not null;

-- One-time backfill of existing pairs. gen_random_uuid() sits in the GROUPed
-- select, so it is evaluated once per group — both legs get the SAME uuid.
with legs as (
  select id,
         user_id,
         (occurred_at at time zone 'Asia/Bangkok')::date as bkk_day,
         abs(amount) as amt,
         sign(amount) as sgn,
         coalesce(scope, 'personal') as scope
    from public.transactions
   where type = 'transfer'
     and transfer_group_id is null
     and amount <> 0
),
grp as (
  select user_id, bkk_day, amt,
         gen_random_uuid() as gid
    from legs
   group by user_id, bkk_day, amt
  having count(*) = 2
     and count(*) filter (where sgn < 0) = 1
     and count(*) filter (where sgn > 0) = 1
     and count(distinct scope) = 2
)
update public.transactions t
   set transfer_group_id = g.gid
  from legs l
  join grp  g
    on g.user_id = l.user_id and g.bkk_day = l.bkk_day and g.amt = l.amt
 where t.id = l.id
   and t.transfer_group_id is null;
