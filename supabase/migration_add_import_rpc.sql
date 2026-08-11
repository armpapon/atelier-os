-- ============================================================================
--  Migration: Atomic CSV import RPC (audit blocker #1)
--  v8 (audit round 8 — B1): receipts describe EVERY processed row, so a lost
--  response is reconstructed COMPLETELY, not just its inserted rows.
--
--  v7's recovery was lossy for mixed outcomes. Receipts existed only for
--  INSERTED rows, yet the retry short-circuited on "any receipt exists" and
--  returned `ambiguous: []`. One call that inserted a clean row AND reported
--  an execution-time ambiguity, whose response was then lost, replayed as
--  "everything is fine": the ambiguous row was never shown again and never
--  imported. v8:
--   1. import_receipts carries `outcome` ('inserted' | 'dup' | 'ambiguous')
--      and, for ambiguities, `detail` = the {incoming, existing} snapshot
--      exactly as the live path returns it. A committed group is therefore
--      FULLY described by its receipts.
--   2. every processed ord gets a receipt, in the same transaction as the
--      inserts — not just the ones that inserted.
--   3. the retry reconstructs the COMPLETE response from those receipts
--      (inserted mappings + dup count + the full ambiguous array) and returns
--      recovered:true, with NO wipe and NO processing. The ambiguity decision
--      UI reappears identically after a lost response.
--
--  Sequence (v8):
--   1. load receipts for (p_import_key, THIS call's ords) FIRST, before any
--      write. Nothing is wiped or processed until this is known.
--   2. reconstruct the settled outcomes from those receipts.
--   3. decide what still needs processing:
--        · payload ords with NO receipt          → process
--        · payload ords whose receipt outcome is 'ambiguous' AND whose
--          incoming row carries force=true       → REOPEN and process
--        · everything else                       → settled, reconstruct only
--   4. if ANY receipt exists for this call's ords the group already
--      committed, so p_wipe is FORCED OFF for the rest of this call — a
--      receipt proves the month was already wiped+filled once and must never
--      be wiped again. (Edge case: the client changed its selection between
--      attempts, so some ords are receipted and some are new. Only the
--      unreceipted ords are processed, wipe off, and the results are merged
--      with the reconstruction.)
--   5. process the remaining ords + write their receipts, one transaction.
--
--  Why 'ambiguous' + force reopens: an ambiguity receipt records "we told the
--  client this row was undecidable", not "this row is finished". When the user
--  answers by re-sending it with force=true that is a NEW decision and must
--  execute. It stays idempotent because the receipt is then UPDATED to
--  'inserted' — a lost response on the force call replays as a recovery read.
--
--  p_probe (v8): a strictly read-only reconstruction. Never wipes, never
--  processes, never writes a receipt — used by the client's "มีการนำเข้าค้าง
--  อยู่ — ตรวจสอบผลอีกครั้ง" recovery, which knows the import key and the ords
--  that were in flight but no longer holds the row payload (page reload).
--
--  Degenerate case (documented): p_import_key IS NULL with p_wipe=true has
--  no receipts to consult and keeps the legacy wipe-every-call behaviour —
--  the shipped client always sends a key.
--
--  Fix history:
--  v1  one SQL function = one transaction; per-user/month advisory lock.
--  v2  MULTISET dedup.
--  v3  second-precision key + synthetic seconds.
--  v4  two-tier dedup + ambiguous count.
--  v5  trust-aware tier-1 + ambiguous rows returned for a user decision.
--  v6  import_receipts (user_id, import_key, ord) → transaction_id, written
--      in the same transaction as each insert; `ord` is CLIENT-ASSIGNED (the
--      importer's stable _rid, unique across all groups of one session);
--      `inserted` is a mapping so debt auto-links use the exact inserted id.
--  v7  round-7 CRITICAL: receipts load BEFORE any write, so a committed
--      wipe-import whose response was lost is never re-wiped on retry.
--  v8  round-8 B1: per-ord outcome receipts + complete response
--      reconstruction + FK transaction_id → transactions(id) ON DELETE SET
--      NULL + p_probe read-only recovery.
--
--  Returns jsonb:
--    { "v": 8,
--      "inserted": [ { "ord": n, "transaction_id": uuid } ],
--      "dup_skipped": n,
--      "ambiguous":  [ { "ord": n, "incoming": {...}, "existing": {...} } ],
--      "recovered": bool }   -- true = at least part of this answer was
--                            --        reconstructed from receipts
--
--  ── RECEIPT RETENTION (round 9, F2) ────────────────────────────────────────
--  Receipts are unbounded bookkeeping: without a policy the table grows for
--  ever. Policy: OPPORTUNISTIC PURGE — every non-probe call deletes the
--  CALLER'S OWN receipts older than RETENTION_DAYS = 90, excluding this call's
--  own import_key. No cron, no extension, no privileged job: the purge rides
--  on the import the user is already running and is bounded by RLS to that
--  user's rows.
--
--  Why age alone is safe (no "is this session finished?" test is needed):
--  a receipt is only ever consulted by a client that still holds the import
--  key of an IN-FLIGHT session. An in-flight session is minutes old — a page
--  reload, a retry, a recovery read. 90 days is four orders of magnitude
--  beyond any plausible in-flight window, and created_at is stamped when the
--  receipt is written, so nothing that a client could still be recovering can
--  fall inside the window. The client adds its own belt: it refuses to
--  reconstruct a stored session older than 60 days (CSVImporter.jsx,
--  SESSION_MAX_AGE_MS), leaving a 30-day margin in which "the probe found
--  zero outcomes" can only mean "nothing committed" and never "the receipts
--  were purged". The purge is also skipped entirely when p_probe is true — a
--  recovery read must not write.
--
--  SECURITY INVOKER → RLS applies. Fully idempotent OVER v7: the table gains
--  its new columns with ADD COLUMN IF NOT EXISTS, existing receipts backfill
--  to outcome='inserted', and the constraints are added only when absent.
--  The round-9 retention purge + its index are ADDITIVE over v8 and equally
--  idempotent — re-running this file on a v8 database changes nothing else.
--  Safe to re-run (replaces v1–v8).
--
--  Suggested tab name: loop_import_transactions_rpc_v8
-- ============================================================================

-- ── Receipts: one row per PROCESSED row of an import session ────────────────
create table if not exists public.import_receipts (
  user_id        uuid not null references auth.users(id) on delete cascade,
  import_key     uuid not null,
  ord            int  not null,
  transaction_id uuid,
  created_at     timestamptz default now(),
  primary key (user_id, import_key, ord)
);

-- v8 columns (idempotent; PK unchanged).
alter table public.import_receipts add column if not exists outcome text;
alter table public.import_receipts add column if not exists detail  jsonb;

-- Backfill: every pre-v8 receipt existed only because its row INSERTED.
update public.import_receipts set outcome = 'inserted' where outcome is null;

do $mig$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.import_receipts'::regclass
      and conname  = 'import_receipts_outcome_check'
  ) then
    alter table public.import_receipts
      add constraint import_receipts_outcome_check
      check (outcome in ('inserted', 'dup', 'ambiguous'));
  end if;
end
$mig$;

-- SET NOT NULL is a no-op when already set → safe to re-run.
alter table public.import_receipts alter column outcome set not null;

-- FK on the mapping (round-8 auditor note). ON DELETE SET NULL, NOT CASCADE:
-- deleting an imported transaction must never be able to resurrect it via a
-- same-key retry (a cascade would drop the receipt, and the ord would look
-- unprocessed again), while the now-meaningless id is cleared so no caller
-- can link a debt payment or a balance anchor to a row that no longer exists.
-- Clear any pre-existing orphan first so ADD CONSTRAINT validates.
update public.import_receipts r
   set transaction_id = null
 where r.transaction_id is not null
   and not exists (select 1 from public.transactions t where t.id = r.transaction_id);

do $mig$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.import_receipts'::regclass
      and conname  = 'import_receipts_transaction_id_fkey'
  ) then
    alter table public.import_receipts
      add constraint import_receipts_transaction_id_fkey
      foreign key (transaction_id) references public.transactions(id)
      on delete set null;
  end if;
end
$mig$;

-- Round-9 F2: keeps the opportunistic retention purge (user_id + created_at)
-- an index scan instead of a table scan on every import call.
create index if not exists import_receipts_user_created_idx
  on public.import_receipts (user_id, created_at);

alter table public.import_receipts enable row level security;
drop policy if exists "own rows" on public.import_receipts;
create policy "own rows" on public.import_receipts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Old signatures (return type / parameter list changed).
drop function if exists public.import_transactions(text, text, boolean, jsonb, boolean);
drop function if exists public.import_transactions(text, text, boolean, jsonb, boolean, uuid);
drop function if exists public.import_transactions(text, text, boolean, jsonb, boolean, uuid, boolean);

create function public.import_transactions(
  p_scope text,                  -- 'personal' | 'family' (all rows in the batch)
  p_month text,                  -- 'YYYY-MM' (Bangkok calendar month of the batch)
  p_wipe  boolean,               -- true = delete this scope+month first
  p_rows  jsonb,                 -- [{ord, title, occurred_at, amount, category,
                                 --   type, note, account_id, synthetic, force}]
  p_dedup boolean default true,
  p_import_key uuid default null,-- one per client import session
  p_probe boolean default false  -- true = read-only reconstruction, no writes
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_uid    uuid := auth.uid();
  v_start  timestamptz;
  v_end    timestamptz;
  v_ins    jsonb := '[]'::jsonb;
  v_dup    int := 0;
  v_amb    jsonb := '[]'::jsonb;
  v_seen   boolean := false;     -- any receipt for THIS call's ords?
  v_wipe   boolean;
  v_probe  boolean := coalesce(p_probe, false);
  rec      record;
  v_tid    uuid;
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

  -- ══ STEP 1+2 — receipts FIRST, before any write, then RECONSTRUCT ════════
  -- Scoped to THIS call's ords: one key covers every group of the session,
  -- and another group's receipts must not describe this one. A receipt whose
  -- outcome is 'ambiguous' and whose incoming row now carries force=true is
  -- REOPENED (the user answered) — excluded from the reconstruction and
  -- processed below.
  if p_import_key is not null then
    with payload as (
      select (e.elem->>'ord')::int                          as ord,
             coalesce((e.elem->>'force')::boolean, false)   as force
      from jsonb_array_elements(p_rows) as e(elem)
      where e.elem ? 'ord'
    ), mine as (
      select ir.ord, ir.outcome, ir.transaction_id, ir.detail,
             (ir.outcome = 'ambiguous' and p.force) as reopen
      from import_receipts ir
      join payload p on p.ord = ir.ord
      where ir.user_id = v_uid and ir.import_key = p_import_key
    )
    select
      count(*) > 0,
      coalesce(jsonb_agg(jsonb_build_object('ord', ord, 'transaction_id', transaction_id)
                         order by ord)
               filter (where outcome = 'inserted' and not reopen), '[]'::jsonb),
      coalesce(count(*) filter (where outcome = 'dup' and not reopen), 0),
      coalesce(jsonb_agg(jsonb_build_object('ord', ord,
                                            'incoming', detail->'incoming',
                                            'existing', detail->'existing')
                         order by ord)
               filter (where outcome = 'ambiguous' and not reopen), '[]'::jsonb)
      into v_seen, v_ins, v_dup, v_amb
    from mine;
  end if;

  -- ══ STEP 3+4 — what is left to do, and may we still wipe? ════════════════
  -- A receipt proves this group already committed once (each group is one
  -- transaction, all-or-nothing) — so the month was already wiped and filled.
  -- NEVER wipe again, even when unreceipted ords remain in the payload.
  v_wipe := coalesce(p_wipe, false) and not v_seen and not v_probe;

  if not v_probe then
    -- ══ RETENTION (round-9 F2) — opportunistic, own rows only ══════════════
    -- Age-based at 90 days, and this call's key is excluded outright, so a
    -- session that is still in flight can never be touched. Skipped on a
    -- probe: a recovery read must not write. See the header for the full
    -- reasoning.
    delete from import_receipts ir
     where ir.user_id = v_uid
       and ir.created_at < now() - interval '90 days'
       and (p_import_key is null or ir.import_key is distinct from p_import_key);

    if v_wipe then
      delete from transactions t
      where t.user_id = v_uid
        and t.scope = p_scope
        and t.occurred_at >= v_start
        and t.occurred_at <  v_end;
    end if;

    -- ══ STEP 5 — process the unsettled ords + receipt EVERY one of them ════
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
        -- Settled ords are excluded; unreceipted ords and REOPENED
        -- ambiguities (receipt says 'ambiguous', client now says force) pass.
        where p_import_key is null
           or not exists (
                select 1 from import_receipts ir
                where ir.user_id = v_uid
                  and ir.import_key = p_import_key
                  and ir.ord = coalesce(r.ord, o.ord::int))
           or (coalesce(r.force, false) and exists (
                select 1 from import_receipts ir
                where ir.user_id = v_uid
                  and ir.import_key = p_import_key
                  and ir.ord = coalesce(r.ord, o.ord::int)
                  and ir.outcome = 'ambiguous'))
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
        where (not v_wipe) and p_dedup
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
        where (not v_wipe) and p_dedup
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
          insert into import_receipts (user_id, import_key, ord, transaction_id, outcome, detail)
          values (v_uid, p_import_key, rec.cord, v_tid, 'inserted', null)
          on conflict (user_id, import_key, ord) do update
            set transaction_id = excluded.transaction_id,
                outcome        = excluded.outcome,
                detail         = excluded.detail;
        end if;
        v_ins := v_ins || jsonb_build_object('ord', rec.cord, 'transaction_id', v_tid);

      elsif rec.cls = 'dup' then
        if p_import_key is not null then
          insert into import_receipts (user_id, import_key, ord, transaction_id, outcome, detail)
          values (v_uid, p_import_key, rec.cord, null, 'dup', null)
          on conflict (user_id, import_key, ord) do update
            set transaction_id = excluded.transaction_id,
                outcome        = excluded.outcome,
                detail         = excluded.detail;
        end if;
        v_dup := v_dup + 1;

      else
        -- The ambiguity snapshot is persisted EXACTLY as it is returned, so
        -- the reconstruction on a lost response is byte-identical.
        declare
          v_detail jsonb := jsonb_build_object(
            'incoming', jsonb_build_object(
              'occurred_at', rec.occurred_at, 'title', rec.title,
              'amount', rec.amount, 'note', rec.note),
            'existing', jsonb_build_object(
              'occurred_at', rec.amb_at, 'title', rec.amb_title,
              'amount', rec.amb_amount, 'note', rec.amb_note));
        begin
          if p_import_key is not null then
            insert into import_receipts (user_id, import_key, ord, transaction_id, outcome, detail)
            values (v_uid, p_import_key, rec.cord, null, 'ambiguous', v_detail)
            on conflict (user_id, import_key, ord) do update
              set transaction_id = excluded.transaction_id,
                  outcome        = excluded.outcome,
                  detail         = excluded.detail;
          end if;
          v_amb := v_amb || jsonb_build_object(
            'ord', rec.cord,
            'incoming', v_detail->'incoming',
            'existing', v_detail->'existing');
        end;
      end if;
    end loop;
  end if;

  return jsonb_build_object(
    'v', 8,
    'inserted', v_ins,
    'dup_skipped', v_dup,
    'ambiguous', v_amb,
    'recovered', v_seen or v_probe
  );
end;
$$;
