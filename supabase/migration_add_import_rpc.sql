-- ============================================================================
--  Migration: Atomic CSV import RPC (audit blocker #1)
--  v5 (audit round 5): ambiguity ROUND-TRIPS — the function returns the
--  ambiguous rows themselves, and synthetic-vs-:00 exact matches are no
--  longer silently auto-skipped.
--
--  Fix history:
--  v1  one SQL function = one transaction; per-user/month advisory lock.
--  v2  MULTISET dedup (count_in_batch − count_in_ledger per key).
--  v3  key sharpened to second + amount + title-80 + note; parsers emit
--      deterministic incrementing synthetic seconds.
--  v4  two-tier dedup + ambiguous_skipped count.
--  v5  two round-5 corrections:
--      (a) tier-1 exact matches where the INCOMING row is synthetic AND the
--          matched ledger row carries the legacy :00-second signature are
--          AMBIGUOUS, not automatic duplicates — when both clocks are made
--          up, identity is unknowable and only the user may decide.
--          Real-source timestamps keep the automatic exact-dup.
--      (b) the function is authoritative under its advisory lock and can
--          discover ambiguities the client preview did not (concurrent
--          writes) — so it returns the ambiguous rows' identities:
--            { "inserted": n, "dup_skipped": n,
--              "ambiguous": [ { "ord": <1-based p_rows position>,
--                               "incoming": {occurred_at,title,amount,note},
--                               "existing": {occurred_at,title,amount,note} } ] }
--          The client reopens the decision step for rows it had not already
--          shown, then re-sends user-approved rows with force=true (which
--          bypasses both tiers) in a second call.
--
--  Two-tier classification (identical to classifyImportRows in JS):
--    tier-1  exact second-key multiset → duplicate, EXCEPT synthetic-vs-:00
--            which is ambiguous. Every match consumes the ledger row from
--            both pools.
--    tier-2  still-unmatched synthetic rows vs remaining :00-signature rows
--            at minute-key precision → ambiguous.
--
--  SECURITY INVOKER → RLS still applies to every statement inside.
--  Idempotent: DROP IF EXISTS + CREATE. Safe to re-run (replaces v1–v4).
--
--  Suggested tab name: loop_import_transactions_rpc
-- ============================================================================

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
  v_amb   jsonb := '[]'::jsonb;
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
    -- Ledger multiset per EXACT key + a representative row for display
    -- (rows sharing an exact key are identical in every displayed field).
    select
      date_trunc('second', t.occurred_at) as k_ts,
      round(t.amount * 100)               as k_amt,
      left(trim(t.title), 80)             as k_title,
      coalesce(trim(t.note), '')          as k_note,
      count(*)                            as c,
      min(t.occurred_at)                  as rep_at,
      min(t.title)                        as rep_title,
      min(t.amount)                       as rep_amount,
      min(t.note)                         as rep_note
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
      count(*)                            as c,
      min(t.occurred_at)                  as rep_at,
      min(t.title)                        as rep_title,
      min(t.amount)                       as rep_amount,
      min(t.note)                         as rep_note
    from transactions t
    where (not p_wipe) and p_dedup
      and t.user_id = v_uid and t.scope = p_scope
      and t.occurred_at >= v_start and t.occurred_at < v_end
      and date_trunc('second', t.occurred_at) = date_trunc('minute', t.occurred_at)
    group by 1, 2, 3, 4
  ), t1 as (
    select i.*,
           (not i.force) and (i.rn_exact <= coalesce(e.c, 0)) as matched1,
           e.rep_at as ex_at, e.rep_title as ex_title,
           e.rep_amount as ex_amount, e.rep_note as ex_note
    from incoming i
    left join ex e
      on e.k_ts = i.k_ts and e.k_amt = i.k_amt and e.k_title = i.k_title and e.k_note = i.k_note
  ), t2 as (
    -- v5 split: trustworthy exact matches = duplicate; synthetic-vs-:00 =
    -- ambiguous (both clocks made up → user decides).
    select t1.*,
           matched1 and not (synthetic and k_ts = k_min) as is_dup,
           matched1 and     (synthetic and k_ts = k_min) as is_amb1
    from t1
  ), consumed as (
    -- ANY tier-1 match on a :00 key consumes the legacy pool entry too
    select k_min, k_amt, k_title, k_note, count(*) as c
    from t2
    where matched1 and k_ts = k_min
    group by 1, 2, 3, 4
  ), amb2 as (
    select t.ord, lg.rep_at, lg.rep_title, lg.rep_amount, lg.rep_note
    from (
      select t2.*,
             row_number() over (
               partition by k_min, k_amt, k_title, k_note order by ord
             ) as rn_min
      from t2
      where (not force) and (not matched1) and synthetic
    ) t
    left join lg on lg.k_min = t.k_min and lg.k_amt = t.k_amt
                and lg.k_title = t.k_title and lg.k_note = t.k_note
    left join consumed cn on cn.k_min = t.k_min and cn.k_amt = t.k_amt
                and cn.k_title = t.k_title and cn.k_note = t.k_note
    where t.rn_min <= greatest(0, coalesce(lg.c, 0) - coalesce(cn.c, 0))
  ), ambiguous_all as (
    select t2.ord, t2.occurred_at, t2.title, t2.amount, t2.note,
           t2.ex_at as e_at, t2.ex_title as e_title,
           t2.ex_amount as e_amount, t2.ex_note as e_note
    from t2 where is_amb1
    union all
    select t2.ord, t2.occurred_at, t2.title, t2.amount, t2.note,
           a.rep_at, a.rep_title, a.rep_amount, a.rep_note
    from amb2 a
    join t2 on t2.ord = a.ord
  ), ins as (
    insert into transactions (user_id, title, occurred_at, amount, category, type, note, account_id, scope)
    select v_uid, t2.title, t2.occurred_at, t2.amount, t2.category, t2.type, t2.note, t2.account_id, p_scope
    from t2
    where (not t2.matched1)
      and t2.ord not in (select ord from amb2)
    returning 1
  )
  select
    (select count(*) from ins),
    (select count(*) from t2 where is_dup),
    coalesce((select jsonb_agg(jsonb_build_object(
        'ord', a.ord,
        'incoming', jsonb_build_object(
          'occurred_at', a.occurred_at, 'title', a.title,
          'amount', a.amount, 'note', a.note),
        'existing', jsonb_build_object(
          'occurred_at', a.e_at, 'title', a.e_title,
          'amount', a.e_amount, 'note', a.e_note)
      ) order by a.ord) from ambiguous_all a), '[]'::jsonb)
  into v_ins, v_dup, v_amb;

  return jsonb_build_object(
    'inserted', v_ins,
    'dup_skipped', v_dup,
    'ambiguous', v_amb
  );
end;
$$;
