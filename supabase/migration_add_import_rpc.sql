-- ============================================================================
--  Migration: Atomic CSV import RPC (audit blocker #1)
--  v6 (audit round 6): PERSISTENT IDEMPOTENCY — import receipts make
--  retries and lost responses safe, and `inserted` returns the exact
--  ord → transaction_id mapping.
--
--  Fix history:
--  v1  one SQL function = one transaction; per-user/month advisory lock.
--  v2  MULTISET dedup.
--  v3  second-precision key + synthetic seconds.
--  v4  two-tier dedup + ambiguous count.
--  v5  trust-aware tier-1 + ambiguous rows returned for a user decision.
--  v6  round-6 blocker B1: a multi-group import that partially fails could
--      re-send already-committed force rows on retry → duplicates; a lost
--      response after a committed call had the same effect. Now:
--      - import_receipts table: (user_id, import_key, ord) → transaction_id,
--        written IN THE SAME TRANSACTION as each insert.
--      - the function takes p_import_key (one uuid per client import
--        session, covering all groups + the force phase). Rows whose ord is
--        already receipted for this key are excluded from processing and
--        their existing mapping is returned — a retry with the same key
--        inserts ONLY uncommitted rows, and a lost response is recovered by
--        simply calling again with the same key.
--      - `ord` is now CLIENT-ASSIGNED per row (the importer's stable _rid),
--        unique across ALL groups of the session; jsonb ordinality is only
--        the tie-breaker ordering.
--      - round-6 blocker B3: `inserted` is a mapping
--        [{ord, transaction_id}], so debt auto-links use the exact inserted
--        id — no re-query, no natural-key matching.
--
--  Returns jsonb:
--    { "v": 6,
--      "inserted": [ { "ord": n, "transaction_id": uuid } ],   -- incl. rows
--            receipted by EARLIER calls with the same import_key
--      "dup_skipped": n,
--      "ambiguous":  [ { "ord": n, "incoming": {...}, "existing": {...} } ] }
--
--  SECURITY INVOKER → RLS applies. Idempotent: DROP IF EXISTS + CREATE,
--  CREATE TABLE IF NOT EXISTS. Safe to re-run (replaces v1–v5).
--
--  Suggested tab name: loop_import_transactions_rpc
-- ============================================================================

-- Receipts: one row per committed insert of an import session.
create table if not exists public.import_receipts (
  user_id        uuid not null references auth.users(id) on delete cascade,
  import_key     uuid not null,
  ord            int  not null,
  transaction_id uuid,
  created_at     timestamptz default now(),
  primary key (user_id, import_key, ord)
);

alter table public.import_receipts enable row level security;
drop policy if exists "own rows" on public.import_receipts;
create policy "own rows" on public.import_receipts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Old signatures (return type / parameter list changed).
drop function if exists public.import_transactions(text, text, boolean, jsonb, boolean);
drop function if exists public.import_transactions(text, text, boolean, jsonb, boolean, uuid);

create function public.import_transactions(
  p_scope text,                  -- 'personal' | 'family' (all rows in the batch)
  p_month text,                  -- 'YYYY-MM' (Bangkok calendar month of the batch)
  p_wipe  boolean,               -- true = delete this scope+month first
  p_rows  jsonb,                 -- [{ord, title, occurred_at, amount, category,
                                 --   type, note, account_id, synthetic, force}]
  p_dedup boolean default true,
  p_import_key uuid default null -- one per client import session
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_start timestamptz;
  v_end   timestamptz;
  v_ins   jsonb := '[]'::jsonb;
  v_dup   int := 0;
  v_amb   jsonb := '[]'::jsonb;
  rec     record;
  v_tid   uuid;
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

  -- Idempotency: mappings already committed for this key are returned as-is
  -- and their ords are excluded from processing below.
  if p_import_key is not null then
    select coalesce(jsonb_agg(jsonb_build_object(
             'ord', r.ord, 'transaction_id', r.transaction_id) order by r.ord), '[]'::jsonb)
      into v_ins
      from import_receipts r
     where r.user_id = v_uid and r.import_key = p_import_key;
  end if;

  for rec in (
    with incoming as (
      select
        r.title, r.occurred_at, r.amount, r.category, r.type, r.note, r.account_id,
        coalesce(r.synthetic, false) as synthetic,
        coalesce(r.force, false)     as force,
        coalesce(r.ord, o.ord::int)  as cord,   -- client-assigned, session-unique
        o.ord                        as pos,    -- payload order (tie-breaker)
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
             ord int, title text, occurred_at timestamptz, amount numeric,
             category text, type text, note text, account_id uuid,
             synthetic boolean, force boolean
           )
      where p_import_key is null
         or coalesce(r.ord, o.ord::int) not in (
              select ir.ord from import_receipts ir
              where ir.user_id = v_uid and ir.import_key = p_import_key)
    ), ex as (
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
      -- v5 trust split: synthetic-vs-:00 exact matches are ambiguous.
      select t1.*,
             matched1 and not (synthetic and k_ts = k_min) as is_dup,
             matched1 and     (synthetic and k_ts = k_min) as is_amb1
      from t1
    ), consumed as (
      select k_min, k_amt, k_title, k_note, count(*) as c
      from t2
      where matched1 and k_ts = k_min
      group by 1, 2, 3, 4
    ), amb2 as (
      select t.pos, lg.rep_at, lg.rep_title, lg.rep_amount, lg.rep_note
      from (
        select t2.*,
               row_number() over (
                 partition by k_min, k_amt, k_title, k_note order by pos
               ) as rn_min
        from t2
        where (not force) and (not matched1) and synthetic
      ) t
      left join lg on lg.k_min = t.k_min and lg.k_amt = t.k_amt
                  and lg.k_title = t.k_title and lg.k_note = t.k_note
      left join consumed cn on cn.k_min = t.k_min and cn.k_amt = t.k_amt
                  and cn.k_title = t.k_title and cn.k_note = t.k_note
      where t.rn_min <= greatest(0, coalesce(lg.c, 0) - coalesce(cn.c, 0))
    )
    select t2.*,
           case
             when t2.is_dup then 'dup'
             when t2.is_amb1 or a.pos is not null then 'amb'
             else 'ins'
           end as cls,
           coalesce(t2.ex_at,    a.rep_at)     as amb_at,
           coalesce(t2.ex_title, a.rep_title)  as amb_title,
           coalesce(t2.ex_amount, a.rep_amount) as amb_amount,
           coalesce(t2.ex_note,  a.rep_note)   as amb_note
    from t2
    left join amb2 a on a.pos = t2.pos
    order by t2.pos
  ) loop
    if rec.cls = 'ins' then
      insert into transactions (user_id, title, occurred_at, amount, category, type, note, account_id, scope)
      values (v_uid, rec.title, rec.occurred_at, rec.amount, rec.category, rec.type, rec.note, rec.account_id, p_scope)
      returning id into v_tid;
      if p_import_key is not null then
        insert into import_receipts (user_id, import_key, ord, transaction_id)
        values (v_uid, p_import_key, rec.cord, v_tid)
        on conflict do nothing;
      end if;
      v_ins := v_ins || jsonb_build_object('ord', rec.cord, 'transaction_id', v_tid);
    elsif rec.cls = 'dup' then
      v_dup := v_dup + 1;
    else
      v_amb := v_amb || jsonb_build_object(
        'ord', rec.cord,
        'incoming', jsonb_build_object(
          'occurred_at', rec.occurred_at, 'title', rec.title,
          'amount', rec.amount, 'note', rec.note),
        'existing', jsonb_build_object(
          'occurred_at', rec.amb_at, 'title', rec.amb_title,
          'amount', rec.amb_amount, 'note', rec.amb_note));
    end if;
  end loop;

  return jsonb_build_object(
    'v', 6,
    'inserted', v_ins,
    'dup_skipped', v_dup,
    'ambiguous', v_amb
  );
end;
$$;
