-- ============================================================================
--  Migration: accounts get an IMMUTABLE source key (audit batch C · B2)
--
--  THE DEFECT
--  bulkUpsertAccountsByPocket identified an imported account by its EDITABLE
--  display name, so:
--    (a) an archived (hidden) account was still matched and silently updated;
--    (b) renaming an imported account made the next import create a duplicate;
--    (c) creation was select-then-insert with no DB uniqueness, so two tabs
--        importing the same file both created the pocket.
--
--  WHAT THIS ADDS
--   1. accounts.source_key — the pocket's identity IN THE SOURCE SYSTEM,
--      written once at first import and never rewritten by the app. The Make
--      by KBank / bank CSV export carries no pocket UUID; the stable
--      identifier it does carry is the Cloud Pocket NAME AT EXPORT TIME. That
--      value is captured as
--          'make:pocket:' || lower(collapse_ws(trim(pocket)))
--      and thereafter decoupled from accounts.name, which the user is free to
--      rename in Loop. Renaming in Loop no longer changes identity; renaming
--      the pocket in Make (rare, and a genuine re-identification) creates a
--      new account, which is the honest outcome — the app never guesses.
--   2. A PARTIAL UNIQUE INDEX on (user_id, scope, source_key) — the DB-level
--      guarantee behind (c). Partial (source_key is not null) so hand-made
--      accounts, which have no source, are unaffected.
--   3. accounts_upsert_by_source_key(p_rows jsonb) — one transactional
--      insert-or-return per pocket via ON CONFLICT, so two concurrent tabs
--      converge on ONE row. Also reactivates an archived match and REPORTS
--      it (was_reactivated) so the import summary can say so out loud.
--
--  ARCHIVED-ACCOUNT POLICY (explicit choice, audit B2)
--  An import that matches an archived account REACTIVATES it and names it in
--  the import summary ("บัญชีที่เก็บไว้ ถูกเปิดใช้อีกครั้ง"). The rejected
--  alternative — refuse and surface for a decision — would strand the owner:
--  Loop has no un-archive UI, every reader filters is_active, so a refused
--  pocket would be un-importable forever with no way to act on the prompt.
--  Reactivating is visible, reversible (archive again) and never writes into
--  a row the user cannot see. What is forbidden either way — silently
--  updating a hidden row — no longer happens.
--
--  BACKFILL — one-time, name-derived, NEVER guessing
--  Existing rows get source_key derived from their CURRENT name, but only
--  where that normalised name is unique within (user_id, scope) and no
--  already-keyed row holds it. Ambiguous names are left NULL: the client then
--  refuses to name-match them at all, so a duplicate pair can never be
--  silently merged into one identity.
--
--  Idempotent: IF NOT EXISTS / NULL-guarded backfill / CREATE OR REPLACE.
--  Safe to re-run.
--  SAFE BEFORE IT RUNS: the client degrades to the previous name-matching
--  behaviour when the column (PGRST204) or the RPC (PGRST202) is absent.
--
--  Suggested tab name: loop_account_source_key
-- ============================================================================

-- 0. scope must be non-NULL before it can take part in an identity key.
--    (migration_add_scope.sql defaults it to 'personal'; rows created before
--    that migration may still be NULL.)
update public.accounts set scope = 'personal' where scope is null;

-- 1. The column.
alter table public.accounts add column if not exists source_key text;

-- 2. The DB-level identity guarantee.
create unique index if not exists accounts_source_key_uniq
  on public.accounts (user_id, scope, source_key)
  where source_key is not null;

-- 3. One-time backfill — unambiguous names only.
with named as (
  select id,
         user_id,
         coalesce(scope, 'personal') as scope,
         'make:pocket:' || lower(btrim(regexp_replace(name, '\s+', ' ', 'g'))) as key
    from public.accounts
   where source_key is null
     and name is not null
     and btrim(name) <> ''
),
uniq as (
  select user_id, scope, key
    from named
   group by user_id, scope, key
  having count(*) = 1
)
update public.accounts a
   set source_key = n.key
  from named n
  join uniq u
    on u.user_id = n.user_id and u.scope = n.scope and u.key = n.key
 where a.id = n.id
   and a.source_key is null
   and not exists (
     select 1 from public.accounts x
      where x.user_id = n.user_id
        and coalesce(x.scope, 'personal') = n.scope
        and x.source_key = n.key
   );

-- 4. Atomic insert-or-return per pocket.
--    SECURITY INVOKER → RLS applies; every row is written with auth.uid().
create or replace function public.accounts_upsert_by_source_key(p_rows jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_uid         uuid := auth.uid();
  r             record;
  v_id          uuid;
  v_name        text;
  v_active      boolean;
  v_scope       text;
  v_created     boolean;
  v_reactivated boolean;
  v_out         jsonb := '[]'::jsonb;
begin
  if v_uid is null then raise exception 'Not logged in'; end if;

  for r in
    select * from jsonb_to_recordset(coalesce(p_rows, '[]'::jsonb)) as x(
      source_key            text,
      name                  text,
      type                  text,
      tone                  text,
      scope                 text,
      balance               numeric,
      balance_anchor_at     timestamptz,
      balance_anchor_source text
    )
  loop
    if r.source_key is null or btrim(r.source_key) = '' then
      raise exception 'source_key is required for every row';
    end if;

    -- Reset per iteration: RETURNING ... INTO leaves the previous value in
    -- place when ON CONFLICT DO NOTHING inserts nothing.
    v_id := null; v_name := null; v_active := null;
    v_created := false; v_reactivated := false;
    v_scope := coalesce(r.scope, 'personal');

    insert into accounts (
      user_id, name, type, balance, tone, scope, is_active,
      source_key, balance_anchor_at, balance_anchor_source
    )
    values (
      v_uid, r.name, coalesce(r.type, 'savings'), coalesce(r.balance, 0),
      r.tone, v_scope, true,
      r.source_key, r.balance_anchor_at, r.balance_anchor_source
    )
    on conflict (user_id, scope, source_key) where source_key is not null
    do nothing
    returning id, name, is_active into v_id, v_name, v_active;

    if v_id is null then
      -- Another tab (or an earlier import) owns this identity already.
      select id, name, is_active
        into v_id, v_name, v_active
        from accounts
       where user_id = v_uid and scope = v_scope and source_key = r.source_key
       for update;

      if v_active is false then
        -- Archived match: reactivate and SAY SO. Never write into a row the
        -- user cannot see.
        update accounts set is_active = true where id = v_id;
        v_active := true;
        v_reactivated := true;
      end if;
    else
      v_created := true;
    end if;

    v_out := v_out || jsonb_build_object(
      'source_key',      r.source_key,
      'id',              v_id,
      'name',            v_name,
      'scope',           v_scope,
      'is_active',       v_active,
      'was_created',     v_created,
      'was_reactivated', v_reactivated
    );
  end loop;

  return v_out;
end;
$$;
