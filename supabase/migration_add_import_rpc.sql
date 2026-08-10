-- ============================================================================
--  Migration: Atomic CSV import RPC (audit blocker #1)
--  v4 (audit round 4): two-tier identity — backward compatible with
--  pre-v4.16 (:00-second) rows + EXPLICIT ambiguity, never a silent call.
--
--  Fix history:
--  v1  one SQL function = one transaction; per-user/month advisory lock.
--  v2  MULTISET dedup (count_in_batch − count_in_ledger per key).
--  v3  key sharpened to second + amount + title-80 + note; parsers emit
--      deterministic incrementing synthetic seconds.
--  v4  two defects closed:
--      (a) pre-v4.16 ledgers store ALL statement rows at :00 seconds, so
--          v3's exact key re-imported every non-first row of an old file.
--      (b) v3's equal-count minute skip was a SILENT LOSS for genuinely
--          distinct rows (concession: our earlier "never silent loss"
--          claim was wrong).
--      v4 dedup, identical in SQL and the JS fallback (classifyImportRows):
--        tier-1  exact second-key multiset            → skip (duplicate)
--        tier-2  ONLY for still-unmatched rows flagged synthetic=true:
--                minute-key multiset against REMAINING existing rows with
--                the legacy :00-second signature (rows consumed by tier-1
--                are not re-matchable) → AMBIGUOUS. The function does NOT
--                decide: ambiguous rows are NOT inserted and are counted
--                in ambiguous_skipped. The client pre-classifies with the
--                same algorithm, shows both sides to the user (default
--                skip), and re-sends user-approved rows with force=true,
--                which bypasses both tiers.
--      Rows without synthetic=true (real timestamps) never enter tier-2.
--
--  Returns jsonb: {"inserted": n, "dup_skipped": n, "ambiguous_skipped": n}
--  (return type changed from int → the old signature must be dropped).
--
--  SECURITY INVOKER → RLS still applies to every statement inside.
--  Idempotent: DROP IF EXISTS + CREATE. Safe to re-run (replaces v1–v3).
--
--  Suggested tab name: loop_import_transactions_rpc
-- ============================================================================

-- Return type changes (int → jsonb): CREATE OR REPLACE cannot do that.
drop function if exists public.import_transactions(text, text, boolean, jsonb, boolean);

create function public.import_transactions(
  p_scope text,                 -- 'personal' | 'family' (all rows in the batch)
  p_month text,                 -- 'YYYY-MM' (Bangkok calendar month of the batch)
  p_wipe  boolean,              -- true = delete this scope+month first
  p_rows  jsonb,                -- [{title, occurred_at, amount, category, type,
                                --   note, account_id, synthetic, force}]
  p_dedup boolean default true
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_start timestamptz;
  v_end   timestamptz;
  v_ins   int := 0;
  v_dup   int := 0;
  v_amb   int := 0;
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
      coalesce(r.synthetic, false) as synthetic,
      coalesce(r.force, false)     as force,
      o.ord,
      date_trunc('second', r.occurred_at) as k_ts,
      date_trunc('minute', r.occurred_at) as k_min,
      round(r.amount * 100)               as k_amt,
      left(trim(r.title), 80)             as k_title,
      coalesce(trim(r.note), '')          as k_note,
      row_number() over (
        partition by coalesce(r.force, false),
                     date_trunc('second', r.occurred_at),
                     round(r.amount * 100),
                     left(trim(r.title), 80),
                     coalesce(trim(r.note), '')
        order by o.ord
      ) as rn_exact
    from jsonb_array_elements(p_rows) with ordinality as o(elem, ord),
         jsonb_to_record(o.elem) as r(
           title text, occurred_at timestamptz, amount numeric,
           category text, type text, note text, account_id uuid,
           synthetic boolean, force boolean
         )
  ), ex as (
    -- Ledger multiset counts per EXACT key (empty when wiping / not deduping)
    select
      date_trunc('second', t.occurred_at) as k_ts,
      round(t.amount * 100)               as k_amt,
      left(trim(t.title), 80)             as k_title,
      coalesce(trim(t.note), '')          as k_note,
      count(*)                            as c
    from transactions t
    where (not p_wipe) and p_dedup
      and t.user_id = v_uid and t.scope = p_scope
      and t.occurred_at >= v_start and t.occurred_at < v_end
    group by 1, 2, 3, 4
  ), lg as (
    -- Existing rows with the LEGACY signature (seconds exactly zero),
    -- counted per minute key — the tier-2 match pool.
    select
      date_trunc('minute', t.occurred_at) as k_min,
      round(t.amount * 100)               as k_amt,
      left(trim(t.title), 80)             as k_title,
      coalesce(trim(t.note), '')          as k_note,
      count(*)                            as c
    from transactions t
    where (not p_wipe) and p_dedup
      and t.user_id = v_uid and t.scope = p_scope
      and t.occurred_at >= v_start and t.occurred_at < v_end
      and date_trunc('second', t.occurred_at) = date_trunc('minute', t.occurred_at)
    group by 1, 2, 3, 4
  ), t1 as (
    -- tier-1: exact second-key multiset
    select i.*,
           (not i.force) and (i.rn_exact <= coalesce(e.c, 0)) as is_dup
    from incoming i
    left join ex e
      on e.k_ts = i.k_ts and e.k_amt = i.k_amt and e.k_title = i.k_title and e.k_note = i.k_note
  ), consumed as (
    -- :00 rows swallowed by tier-1 consume their legacy pool entry too
    select k_min, k_amt, k_title, k_note, count(*) as c
    from t1
    where is_dup and k_ts = k_min
    group by 1, 2, 3, 4
  ), amb as (
    -- tier-2: still-unmatched SYNTHETIC rows vs remaining legacy pool.
    -- Matched rows are AMBIGUOUS — not inserted, not silently equated.
    select t.ord
    from (
      select t1.*,
             row_number() over (
               partition by k_min, k_amt, k_title, k_note order by ord
             ) as rn_min
      from t1
      where (not force) and (not is_dup) and synthetic
    ) t
    left join lg on lg.k_min = t.k_min and lg.k_amt = t.k_amt
                and lg.k_title = t.k_title and lg.k_note = t.k_note
    left join consumed cn on cn.k_min = t.k_min and cn.k_amt = t.k_amt
                and cn.k_title = t.k_title and cn.k_note = t.k_note
    where t.rn_min <= greatest(0, coalesce(lg.c, 0) - coalesce(cn.c, 0))
  ), ins as (
    insert into transactions (user_id, title, occurred_at, amount, category, type, note, account_id, scope)
    select v_uid, t1.title, t1.occurred_at, t1.amount, t1.category, t1.type, t1.note, t1.account_id, p_scope
    from t1
    where (not t1.is_dup)
      and t1.ord not in (select ord from amb)
    returning 1
  )
  select
    (select count(*) from ins),
    (select count(*) from t1 where is_dup),
    (select count(*) from amb)
  into v_ins, v_dup, v_amb;

  return jsonb_build_object(
    'inserted', v_ins,
    'dup_skipped', v_dup,
    'ambiguous_skipped', v_amb
  );
end;
$$;
