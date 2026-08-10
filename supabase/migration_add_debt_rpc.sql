-- ============================================================================
--  Migration: transactional debt payment counters (audit blocker #6)
--
--  Problem: marking a debt paid is 3 client round-trips (check payment row,
--  upsert it, read+write months_paid). A crash or a concurrent click between
--  the steps can desync months_paid from debt_payments.
--
--  Fix: one function = one transaction. Insert-or-noop on the unique
--  (debt_id, pay_month), months_paid moves only when a row is really
--  added/removed, clamped to [0, total_months]. Returns the new months_paid.
--  SECURITY INVOKER → RLS applies. Client falls back to the old guarded
--  path when these functions are not installed yet.
--
--  Idempotent: CREATE OR REPLACE. Safe to re-run.
--
--  Suggested tab name: loop_debt_payment_rpc
-- ============================================================================

create or replace function public.debt_mark_paid(
  p_debt_id        uuid,
  p_pay_month      date,
  p_amount         numeric default null,
  p_transaction_id uuid    default null,
  p_notes          text    default null
) returns int
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_uid    uuid := auth.uid();
  v_isnew  boolean := false;
  v_debt   record;
  v_months int;
begin
  if v_uid is null then raise exception 'Not logged in'; end if;

  -- Serialise concurrent marks on the same debt.
  perform pg_advisory_xact_lock(hashtext(p_debt_id::text || 'debt_pay'));

  select months_paid, total_months, monthly_payment
    into v_debt
    from debts where id = p_debt_id
    for update;
  if not found then raise exception 'Debt not found'; end if;

  insert into debt_payments (user_id, debt_id, pay_month, amount_paid, transaction_id, notes)
  values (v_uid, p_debt_id, p_pay_month,
          coalesce(p_amount, v_debt.monthly_payment), p_transaction_id, p_notes)
  on conflict (debt_id, pay_month) do update
    set amount_paid    = excluded.amount_paid,
        transaction_id = coalesce(excluded.transaction_id, debt_payments.transaction_id),
        notes          = coalesce(excluded.notes, debt_payments.notes)
  returning (xmax = 0) into v_isnew;   -- true only for a genuinely new row

  v_months := coalesce(v_debt.months_paid, 0);
  if v_isnew then
    v_months := v_months + 1;
    if v_debt.total_months is not null then
      v_months := least(v_months, v_debt.total_months);
    end if;
    v_months := greatest(v_months, 0);

    update debts set
      months_paid = v_months,
      remaining_balance = case
        when v_debt.total_months is not null
          then greatest(0, (v_debt.total_months - v_months) * v_debt.monthly_payment)
        else remaining_balance
      end,
      updated_at = now()
    where id = p_debt_id;
  end if;

  return v_months;
end;
$$;

create or replace function public.debt_unmark_paid(
  p_payment_id uuid
) returns int
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_uid     uuid := auth.uid();
  v_debt_id uuid;
  v_debt    record;
  v_months  int;
begin
  if v_uid is null then raise exception 'Not logged in'; end if;

  delete from debt_payments where id = p_payment_id
  returning debt_id into v_debt_id;
  if v_debt_id is null then
    raise exception 'Payment not found';
  end if;

  perform pg_advisory_xact_lock(hashtext(v_debt_id::text || 'debt_pay'));

  select months_paid, total_months, monthly_payment
    into v_debt from debts where id = v_debt_id for update;
  if not found then return 0; end if;

  v_months := greatest(0, coalesce(v_debt.months_paid, 0) - 1);
  if v_debt.total_months is not null then
    v_months := least(v_months, v_debt.total_months);
  end if;

  update debts set
    months_paid = v_months,
    remaining_balance = case
      when v_debt.total_months is not null
        then greatest(0, (v_debt.total_months - v_months) * v_debt.monthly_payment)
      else remaining_balance
    end,
    updated_at = now()
  where id = v_debt_id;

  return v_months;
end;
$$;
