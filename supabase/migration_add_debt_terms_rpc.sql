-- ============================================================================
--  Migration: editing a debt's terms recomputes its balance (batch C · B8)
--
--  THE DEFECT
--  updateDebt() patched whatever the form sent and never touched
--  remaining_balance, so re-terming a loan (12 → 24 instalments, a new
--  monthly payment, a corrected months_paid) left the stored balance at
--  whatever the last recorded payment happened to write. summarizeDebts
--  TRUSTS remaining_balance over the instalment maths, so the whole "คงเหลือ
--  รวม" figure inherited the stale number.
--
--  WHAT THIS ADDS
--  debt_update_terms(p_id uuid, p_patch jsonb) — row-locks the debt, applies
--  only the keys present in the patch, recomputes remaining_balance from the
--  RESULTING terms, and returns the updated row. One transaction: no
--  read-modify-write window for a concurrent "mark as paid" to fall into.
--
--  The patch is a whitelist, key by key — no dynamic SQL, no arbitrary column
--  reachable from the client. Keys absent from the patch keep their value;
--  keys explicitly present as null are set to null.
--
--  remaining_balance rule (same as debt_mark_paid, deliberately):
--      total_months is null  →  null  ("we don't know")
--      otherwise             →  greatest(0, (total_months − months_paid) × monthly_payment)
--  A remaining_balance sent explicitly in the patch wins — a human override.
--
--  SECURITY INVOKER → RLS applies; the row can only be one the caller owns.
--
--  Idempotent: CREATE OR REPLACE. Safe to re-run.
--  SAFE BEFORE IT RUNS: the client detects PGRST202/42883 and falls back to a
--  SINGLE guarded UPDATE that derives remaining_balance only from terms
--  carried in that same patch — still no read-modify-write.
--
--  Suggested tab name: loop_debt_update_terms_rpc
-- ============================================================================

create or replace function public.debt_update_terms(
  p_id    uuid,
  p_patch jsonb
) returns setof public.debts
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  d     public.debts%rowtype;
  v_rem numeric;
begin
  if v_uid is null then raise exception 'Not logged in'; end if;
  if p_id is null then raise exception 'ต้องระบุรายการหนี้'; end if;

  select * into d from debts where id = p_id for update;
  if not found then raise exception 'ไม่พบรายการหนี้'; end if;
  if d.user_id <> v_uid then raise exception 'รายการหนี้นี้ไม่ใช่ของผู้ใช้นี้'; end if;

  -- Whitelisted merge. `p_patch ? 'key'` = the client sent this key.
  if p_patch ? 'name'               then d.name               := p_patch->>'name'; end if;
  if p_patch ? 'creditor'           then d.creditor           := nullif(p_patch->>'creditor', ''); end if;
  if p_patch ? 'monthly_payment'    then d.monthly_payment    := (p_patch->>'monthly_payment')::numeric; end if;
  if p_patch ? 'due_day'            then d.due_day            := (p_patch->>'due_day')::int; end if;
  if p_patch ? 'total_months'       then d.total_months       := nullif(p_patch->>'total_months', '')::int; end if;
  if p_patch ? 'months_paid'        then d.months_paid        := coalesce(nullif(p_patch->>'months_paid', '')::int, 0); end if;
  if p_patch ? 'interest_rate'      then d.interest_rate      := nullif(p_patch->>'interest_rate', '')::numeric; end if;
  if p_patch ? 'original_principal' then d.original_principal := nullif(p_patch->>'original_principal', '')::numeric; end if;
  if p_patch ? 'type'               then d.type               := p_patch->>'type'; end if;
  if p_patch ? 'scope'              then d.scope              := p_patch->>'scope'; end if;
  if p_patch ? 'tone'               then d.tone               := p_patch->>'tone'; end if;
  if p_patch ? 'notes'              then d.notes              := nullif(p_patch->>'notes', ''); end if;
  if p_patch ? 'start_date'         then d.start_date         := nullif(p_patch->>'start_date', '')::date; end if;
  if p_patch ? 'end_date'           then d.end_date           := nullif(p_patch->>'end_date', '')::date; end if;
  if p_patch ? 'is_active'          then d.is_active          := (p_patch->>'is_active')::boolean; end if;

  -- Never claim more instalments paid than the loan has.
  if d.total_months is not null and d.months_paid is not null then
    d.months_paid := least(greatest(d.months_paid, 0), d.total_months);
  end if;

  if p_patch ? 'remaining_balance' then
    v_rem := nullif(p_patch->>'remaining_balance', '')::numeric;   -- human override
  elsif d.total_months is null then
    v_rem := null;
  else
    v_rem := greatest(0, (d.total_months - coalesce(d.months_paid, 0)) * coalesce(d.monthly_payment, 0));
  end if;

  -- Wrapped in a CTE so RETURN QUERY is handed a plain SELECT.
  return query
  with upd as (
  update debts set
    name               = d.name,
    creditor           = d.creditor,
    monthly_payment    = d.monthly_payment,
    due_day            = d.due_day,
    total_months       = d.total_months,
    months_paid        = d.months_paid,
    interest_rate      = d.interest_rate,
    original_principal = d.original_principal,
    type               = d.type,
    scope              = d.scope,
    tone               = d.tone,
    notes              = d.notes,
    start_date         = d.start_date,
    end_date           = d.end_date,
    is_active          = d.is_active,
    remaining_balance  = v_rem,
    updated_at         = now()
  where id = p_id
  returning *
  )
  select * from upd;
end;
$$;
