/**
 * Loop — Money Planner · pure maths for the debt-payoff simulator (phase 2).
 *
 * ALL logic for the planner lives here — the component only turns these month
 * OFFSETS into Thai Buddhist-year labels and the numbers into copy. Mirrors the
 * purity of debtAdvice.js / taxTH.js / moneyLeaks.js: every function is a pure,
 * null-safe read over the `debts` rows the Finance page already loaded. No
 * supabase import, no fetch, no schema change, and — deliberately — NO `Date`
 * or "now": the engine returns month offsets (integers from the current month,
 * 1 = next month) and leaves the calendar to the component.
 *
 * `debts` row shape (real columns): { id, name, scope, type, remaining_balance,
 * interest_rate (%/yr), monthly_payment, total_months, months_paid, due_day,
 * is_active }. A debt is ACTIVE unless is_active === false.
 *
 * The simulation is AVALANCHE with rollover: every month each unpaid debt gets
 * its own monthly payment as a floor, then the whole leftover pool (including
 * the extra, and any payment freed by a just-cleared debt) is thrown at the
 * highest-rate balance first. A debt whose floor is below its own monthly
 * interest grows (negative amortisation) until the rollover cascade reaches it.
 * The month cap (60 years) prevents an infinite loop: if the total pool can't
 * out-run the combined interest, a run may NOT clear — that is reported as
 * monthsToAllClear = null (censored), never silently as month 720.
 */
import { monthlyInterest, principalOf } from './debtAdvice.js';

// Hard ceiling on the month loop (60 years). A payoff that hasn't finished by
// here reports monthsToAllClear = null rather than looping forever.
const MONTH_CAP = 720;

// A balance at/under this many baht counts as cleared (float dust guard).
const CLEARED_EPS = 0.01;

/** Positive number or 0 — coerces strings like the other finance libs do. */
function pos(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** A debt counts as active unless is_active is explicitly false. */
function isActive(d) {
  return d && d.is_active !== false;
}

/**
 * A rate is KNOWN when it is a finite number ≥ 0 — a genuine 0% instalment
 * counts as known data, only a null / blank / non-finite rate is missing. This
 * is the distinction the debt-advice card (dataGaps) already draws: 0% is a
 * fact, not a gap (A9 · Major 4).
 */
function rateKnown(d) {
  const v = d?.interest_rate;
  if (v == null) return false;
  if (typeof v === 'string' && v.trim() === '') return false;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0;
}

/**
 * The debts the planner simulates: ACTIVE debts with a positive remaining_balance
 * AND a KNOWN rate (finite ≥ 0 — INCLUDING 0%; only a missing rate is excluded).
 * This intentionally includes the mortgage / hire-purchase and any 0% instalment
 * too — the owner asked to plan over ALL filled-in debts. A 0% debt appears in
 * the plan and timeline, and its payment stays in the rollover pool.
 */
export function planDebts(debts = []) {
  return (debts || []).filter(
    d => isActive(d) && pos(d.remaining_balance) > 0 && rateKnown(d),
  );
}

/**
 * Simulate paying off planDebts with `extraPerMonth` on top of the summed
 * monthly payments, using avalanche + rollover.
 *
 * Each month, in order:
 *   1. Accrue interest on every unpaid debt (balance × rate/100/12), adding it
 *      to the balance and to a running totalInterest.
 *   2. Floor pass — pay each unpaid debt min(its monthly_payment, balance,
 *      remaining pool). Consumes the pool in list order.
 *   3. Avalanche pass — throw the leftover pool at unpaid debts sorted by
 *      interest_rate DESC then balance ASC, paying min(remaining, balance) down
 *      the list (rollover cascade).
 * A debt whose balance drops to ~0 records clearedAtMonth[id] = m (1 = next
 * month) and is pinned to exactly 0.
 *
 * Returns:
 *   { monthsToAllClear, clearedAtMonth, totalInterest, perDebt }
 *   - monthsToAllClear: int, or null if the cap is hit before all clear.
 *   - clearedAtMonth: { id → month offset } (1 = next month).
 *   - totalInterest: total interest accrued over the run, rounded to the baht.
 *   - perDebt: [{ id, name, clearedMonth }] sorted by clearedMonth ASC.
 */
export function simulatePayoff(debts = [], extraPerMonth = 0) {
  const plan = planDebts(debts);
  // Working copies — never mutate the caller's rows. The starting balance is the
  // TRUE principal (principalOf), NOT the stored remaining_balance: for a
  // fixed-term debt the latter is the payment-sum and already includes all
  // future interest, so accruing APR on it would double-count (A9 · Major 1).
  const cs = plan.map(d => ({
    id: d.id,
    name: d.name,
    rate: pos(d.interest_rate),
    payment: pos(d.monthly_payment),
    balance: principalOf(d),
  }));

  const monthlyPool = cs.reduce((s, c) => s + c.payment, 0) + pos(extraPerMonth);
  const clearedAtMonth = {};
  let totalInterest = 0;
  let monthsToAllClear = null;

  if (!cs.length) {
    return { monthsToAllClear: 0, clearedAtMonth, totalInterest: 0, perDebt: [] };
  }

  for (let m = 1; m <= MONTH_CAP; m++) {
    // 1 · accrue interest on everything still owing.
    for (const c of cs) {
      if (c.balance > CLEARED_EPS) {
        const i = c.balance * c.rate / 100 / 12;
        c.balance += i;
        totalInterest += i;
      }
    }

    let pool = monthlyPool;

    // 2 · floor pass — each debt's own payment, in list order.
    for (const c of cs) {
      if (pool <= 0) break;
      if (c.balance > CLEARED_EPS) {
        const p = Math.min(c.payment, c.balance, pool);
        c.balance -= p;
        pool -= p;
      }
    }

    // 3 · avalanche pass — leftover pool at the priciest balance first,
    //     cascading (rollover) as each debt is cleared.
    const active = cs
      .filter(c => c.balance > CLEARED_EPS)
      .sort((a, b) => (b.rate - a.rate) || (a.balance - b.balance));
    for (const c of active) {
      if (pool <= 0) break;
      const p = Math.min(pool, c.balance);
      c.balance -= p;
      pool -= p;
    }

    // Record newly cleared debts, pin them to exactly 0.
    for (const c of cs) {
      if (c.balance <= CLEARED_EPS && clearedAtMonth[c.id] == null) {
        clearedAtMonth[c.id] = m;
        c.balance = 0;
      }
    }

    if (cs.every(c => c.balance <= CLEARED_EPS)) {
      monthsToAllClear = m;
      break;
    }
  }

  // A debt not cleared within the cap has clearedMonth = null (censored /
  // unknown) — NEVER MONTH_CAP, which the UI would render as an exact date at
  // month 720 (A9 · Major 3). Nulls sort to the end.
  const perDebt = cs
    .map(c => ({
      id: c.id,
      name: c.name,
      clearedMonth: clearedAtMonth[c.id] ?? null,
    }))
    .sort((a, b) => (a.clearedMonth ?? Infinity) - (b.clearedMonth ?? Infinity));

  return {
    monthsToAllClear,
    clearedAtMonth,
    totalInterest: Math.round(totalInterest),
    perDebt,
  };
}

/**
 * Compare paying the extra vs. paying only the minimums.
 *
 * baseline = simulatePayoff(debts, 0); plan = simulatePayoff(debts, extra).
 * BOTH runs use the SAME avalanche + rollover method — the ONLY difference is
 * the extra money — so interestSaved / monthsSaved isolate the value of the
 * extra, not of switching strategy.
 *
 * Returns { plan, baseline, censored, interestSaved, monthsSaved }.
 * If EITHER run fails to clear within the cap (monthsToAllClear == null), the
 * comparison is CENSORED: the true lifetime interest / payoff month of the
 * unfinished run is unknown, so interestSaved and monthsSaved are null (unknown)
 * rather than a fabricated delta against the 720-month cap (A9 · Major 3).
 */
export function comparePayoff(debts = [], extraPerMonth = 0) {
  const baseline = simulatePayoff(debts, 0);
  const plan = simulatePayoff(debts, extraPerMonth);
  const censored = baseline.monthsToAllClear == null || plan.monthsToAllClear == null;
  return {
    plan,
    baseline,
    censored,
    interestSaved: censored ? null : Math.max(0, baseline.totalInterest - plan.totalInterest),
    monthsSaved: censored ? null : Math.max(0, baseline.monthsToAllClear - plan.monthsToAllClear),
  };
}

/**
 * Plan debts whose monthly payment is at/below the interest they burn each
 * month — the balance can't fall on its own payment (it only shrinks once the
 * rollover cascade reaches it).
 *
 * The compare is on the RAW interest (principalOf × rate/1200, via monthlyInterest)
 * vs. the raw payment — no pre-rounding, so the ฿1 boundary is classified honestly
 * (A9 · Minor 6). Because the interest is now on the TRUE principal, a
 * normally-amortizing mortgage (payment above interest on its real principal) is
 * NOT flagged — the old "payment below interest" reading was an artifact of
 * accruing APR on the payment-inclusive balance.
 *
 * Returns [{ id, name, monthlyPayment, monthlyInterest }].
 */
export function paymentBelowInterest(debts = []) {
  return planDebts(debts)
    .map(d => ({
      id: d.id,
      name: d.name,
      monthlyPayment: pos(d.monthly_payment),
      monthlyInterest: monthlyInterest(d),
    }))
    .filter(o => o.monthlyPayment <= o.monthlyInterest);
}

// Exposed for the component so the cap is a single source of truth.
export { MONTH_CAP };
