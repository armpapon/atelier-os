-- ============================================================================
--  Migration: Atomic CSV import RPC (audit blocker #1)
--  v3 (audit round 3): SHARPENED natural key — second precision + note.
--
--  Fix history:
--  v1  one SQL function = one transaction; per-user/month advisory lock.
--  v2  MULTISET dedup — per natural key insert
--        max(0, count_in_batch − count_already_in_ledger)
--      so in-batch duplicates are handled and two legitimate identical
--      transactions are never collapsed.
--  v3  the natural key is now near-collision-proof:
--        (occurred_at truncated to the SECOND,          -- was: minute
--         round(amount*100),
--         left(trim(title), 80),                        -- was: 40
--         coalesce(trim(note), ''))                     -- new component
--      Genuinely distinct transactions that share minute+amount+title no
--      longer collide across separate export files. The client parsers now
--      assign INCREMENTING synthetic seconds to date-only/minute-only rows
--      (per day / per displayed minute, by row order), so a re-import of
--      the same file still dedups exactly, while two distinct same-day
--      rows get different seconds and both survive.
--      KNOWN RESIDUAL LIMIT (documented, accepted): for date-only sources
--      the synthetic seconds are row-order-dependent, so two DIFFERENT
--      export files covering the same data must present the same rows in
--      the same per-day order to dedup perfectly; the multiset floor is
--      the backstop when they do not.
--      The JS client mirrors this exact key (txnKey in finance.js) —
--      equivalence is proven by audit/evidence.mjs.
--
--  SECURITY INVOKER → RLS still applies to every statement inside.
--  Idempotent: CREATE OR REPLACE. Safe to re-run (replaces v1/v2).
--
--  Suggested tab name: loop_import_transactions_rpc
-- ============================================================================

create or replace function public.import_transactions(
  p_scope text,                 -- 'personal' | 'family' (all rows in the batch)
  p_month text,                 -- 'YYYY-MM' (Bangkok calendar month of the batch)
  p_wipe  boolean,              -- true = delete this scope+month first
  p_rows  jsonb,                -- [{title, occurred_at, amount, category, type, note, account_id}]
  p_dedup boolean default true  -- multiset-skip rows already in the ledger
) returns int
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_start timestamptz;
  v_end   timestamptz;
  v_count int := 0;
begin
  if v_uid is null then
    raise exception 'Not logged in';
  end if;
  if p_month is null or p_month !~ '^\d{4}-\d{2}$' then
    raise exception 'p_month must be YYYY-MM';
  end if;

  -- Serialise concurrent imports of the same user+month (released at commit).
  perform pg_advisory_xact_lock(hashtext(v_uid::text || p_month));

  -- Bangkok month bounds: [YYYY-MM-01 00:00+07, next month 00:00+07)
  v_start := (p_month || '-01 00:00:00+07:00')::timestamptz;
  v_end   := ((to_date(p_month || '-01', 'YYYY-MM-DD') + interval '1 month')::date::text
              || ' 00:00:00+07:00')::timestamptz;

  if p_wipe then
    delete from transactions t
    where t.user_id = v_uid
      and t.scope = p_scope
      and t.occurred_at >= v_start
      and t.occurred_at <  v_end;
  end if;

  with incoming as (
    select
      r.title, r.occurred_at, r.amount, r.category, r.type, r.note, r.account_id,
      date_trunc('second', r.occurred_at) as k_ts,
      round(r.amount * 100)               as k_amt,
      left(trim(r.title), 80)             as k_title,
      coalesce(trim(r.note), '')          as k_note,
      row_number() over (
        partition by date_trunc('second', r.occurred_at),
                     round(r.amount * 100),
                     left(trim(r.title), 80),
                     coalesce(trim(r.note), '')
        order by r.occurred_at
      ) as rn
    from jsonb_to_recordset(p_rows) as r(
      title text, occurred_at timestamptz, amount numeric,
      category text, type text, note text, account_id uuid
    )
  ), existing as (
    -- Ledger multiset counts per natural key (empty when wiping / not deduping)
    select
      date_trunc('second', t.occurred_at) as k_ts,
      round(t.amount * 100)               as k_amt,
      left(trim(t.title), 80)             as k_title,
      coalesce(trim(t.note), '')          as k_note,
      count(*)                            as c
    from transactions t
    where (not p_wipe) and p_dedup
      and t.user_id = v_uid
      and t.scope = p_scope
      and t.occurred_at >= v_start and t.occurred_at < v_end
    group by 1, 2, 3, 4
  ), ins as (
    insert into transactions (user_id, title, occurred_at, amount, category, type, note, account_id, scope)
    select v_uid, i.title, i.occurred_at, i.amount, i.category, i.type, i.note, i.account_id, p_scope
    from incoming i
    left join existing e
      on e.k_ts = i.k_ts and e.k_amt = i.k_amt and e.k_title = i.k_title and e.k_note = i.k_note
    where p_wipe
       or not p_dedup
       or i.rn > coalesce(e.c, 0)      -- MULTISET: insert only the missing copies
    returning 1
  )
  select count(*) into v_count from ins;

  return v_count;
end;
$$;
