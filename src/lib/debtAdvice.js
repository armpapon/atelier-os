/**
 * Loop — คำแนะนำเรื่องหนี้ · pure maths for the Debt Advice card.
 *
 * ALL logic for the card lives here — the component only turns these numbers
 * and reason tags into Thai copy. Mirrors the purity of taxTH.js / moneyLeaks.js:
 * every function is a pure, null-safe read over the `debts` rows the Finance
 * page already loaded. No supabase import, no fetch, no schema change.
 *
 * `debts` row shape (real columns): { id, name, scope, type, remaining_balance,
 * interest_rate (%/yr), monthly_payment, total_months, months_paid, due_day,
 * is_active }. A debt is ACTIVE unless is_active === false.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DATED CONSTANT — Bank of Thailand credit-card minimum-payment rise.
 *
 * The BoT stepped the mandated minimum payment back up after the COVID relief:
 * 5% (relief) → 8% (2567–2569) → 10% (from 2570). This card warns that the
 * minimum on revolving cards jumps from 8% to 10% of the balance at the
 * ม.ค. 2570 billing cycle, so a card should be paid down before the floor rises.
 *
 * ⚠️ REVISIT AFTER THE DATE PASSES: once ม.ค. 2570 (Jan 2027 CE) is in the past
 * the "future" figure is just the present, and this whole deadline callout
 * should be removed or re-pointed at the next scheduled change. This constant is
 * the single place to edit / delete when that happens.
 */
const MIN_PAYMENT_RISE = {
  effective: '2570-01',        // Thai Buddhist-year, YYYY-MM (Jan 2027 CE)
  label: 'ม.ค. 2570',
  fromPct: 8,                  // current mandated minimum, % of balance
  toPct: 10,                   // minimum from the effective cycle onward
  note: 'ธปท. ปรับขั้นต่ำบัตรเครดิตจาก 8% เป็น 10% ของยอดคงเหลือ ตั้งแต่รอบบิล ม.ค. 2570',
};

/** Positive number or 0 — coerces strings like the other finance libs do. */
function pos(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** A debt counts as active unless is_active is explicitly false. */
function isActive(d) {
  return d && d.is_active !== false;
}

/** Only the active debts, defensively. */
function activeDebts(debts) {
  return (debts || []).filter(isActive);
}

/**
 * Monthly interest a single debt is burning right now.
 * remaining_balance × (interest_rate/100) / 12, rounded to the baht.
 * 0 when either input is null / non-numeric / ≤ 0.
 */
export function monthlyInterest(debt) {
  const bal  = pos(debt?.remaining_balance);
  const rate = pos(debt?.interest_rate);
  if (!bal || !rate) return 0;
  return Math.round(bal * (rate / 100) / 12);
}

/**
 * Total interest being burned across all ACTIVE debts.
 * Returns { perMonth, perYear } — perYear is simply perMonth × 12.
 */
export function totalInterestBurn(debts = []) {
  const perMonth = activeDebts(debts).reduce((s, d) => s + monthlyInterest(d), 0);
  return { perMonth, perYear: perMonth * 12 };
}

/** Convenience — the annualised burn figure alone. */
export function annualInterestBurn(debts = []) {
  return totalInterestBurn(debts).perYear;
}

/**
 * Avalanche payoff order: which debt to attack first.
 *
 * Considers only ACTIVE debts that have BOTH a positive remaining_balance AND a
 * positive interest_rate (a debt with no rate/balance can't be ranked by cost).
 * Sorted by interest_rate DESC, ties broken by remaining_balance DESC.
 *
 * Each entry carries fact-derived `reasonTags` (a debt may carry several):
 *   'highest-rate'       — rank 1 (most expensive rate in the port)
 *   'second-rate'        — rank 2
 *   'low-rate-no-rush'   — the LOWEST rate in the list AND under 6% (mortgage-
 *                          style: don't rush to prepay, refinance instead)
 *   'credit-card-bureau' — type === 'credit_card' (paying it down cuts
 *                          utilisation → helps the credit bureau)
 *
 * Returns [{ debt, rank, rate, balance, monthlyInterest, reasonTags }].
 */
export function payoffPriority(debts = []) {
  const eligible = activeDebts(debts).filter(
    d => pos(d.remaining_balance) > 0 && pos(d.interest_rate) > 0,
  );
  const sorted = [...eligible].sort((a, b) => {
    const rateDiff = pos(b.interest_rate) - pos(a.interest_rate);
    if (rateDiff !== 0) return rateDiff;
    return pos(b.remaining_balance) - pos(a.remaining_balance);
  });

  const lowestRate = sorted.length
    ? Math.min(...sorted.map(d => pos(d.interest_rate)))
    : 0;

  return sorted.map((debt, i) => {
    const rank = i + 1;
    const rate = pos(debt.interest_rate);
    const balance = pos(debt.remaining_balance);
    const reasonTags = [];
    if (rank === 1) reasonTags.push('highest-rate');
    if (rank === 2) reasonTags.push('second-rate');
    if (rate === lowestRate && rate < 6) reasonTags.push('low-rate-no-rush');
    if (debt.type === 'credit_card') reasonTags.push('credit-card-bureau');
    return { debt, rank, rate, balance, monthlyInterest: monthlyInterest(debt), reasonTags };
  });
}

/**
 * Debts about to finish — an instalment freeing up soon, so its monthly payment
 * can be rolled straight onto a high-rate balance without finding new money.
 *
 * ACTIVE debts where total_months and months_paid are both known and 1–3 (incl.)
 * instalments remain. Returns [{ debt, monthsLeft, freesPerMonth }] sorted by
 * monthsLeft ASC (soonest first).
 */
export function rolloverOpportunities(debts = []) {
  return activeDebts(debts)
    .filter(d => d.total_months != null && d.months_paid != null)
    .map(d => ({
      debt: d,
      monthsLeft: Number(d.total_months) - Number(d.months_paid),
      freesPerMonth: pos(d.monthly_payment),
    }))
    .filter(o => o.monthsLeft >= 1 && o.monthsLeft <= 3)
    .sort((a, b) => a.monthsLeft - b.monthsLeft);
}

/**
 * The BoT minimum-payment-rise deadline (see MIN_PAYMENT_RISE above).
 *
 * null when there are no active credit_card debts with a positive balance AND a
 * positive interest_rate. Otherwise:
 *   { effectiveLabel, currentMinTotal, futureMinTotal }
 * currentMinTotal = Σ each card's monthly_payment, falling back to
 *                   balance × fromPct/100 when monthly_payment is missing.
 * futureMinTotal  = Σ balance × toPct/100.
 */
export function creditCardDeadline(debts = []) {
  const cards = activeDebts(debts).filter(
    d => d.type === 'credit_card'
      && pos(d.remaining_balance) > 0
      && pos(d.interest_rate) > 0,
  );
  if (!cards.length) return null;

  let currentMinTotal = 0;
  let futureMinTotal  = 0;
  for (const d of cards) {
    const bal = pos(d.remaining_balance);
    const mp  = pos(d.monthly_payment);
    currentMinTotal += mp > 0 ? mp : Math.round(bal * MIN_PAYMENT_RISE.fromPct / 100);
    futureMinTotal  += Math.round(bal * MIN_PAYMENT_RISE.toPct / 100);
  }
  return {
    effectiveLabel: MIN_PAYMENT_RISE.label,
    currentMinTotal,
    futureMinTotal,
  };
}

/**
 * Active debts missing an interest_rate OR a remaining_balance, so the burn
 * headline is understated. An interest-free instalment legitimately has a null
 * rate — it still counts here, and the wording stays neutral ("ยังไม่ได้กรอก
 * ดอก/ยอด"), never accusatory.
 *
 * Returns { debts: [...names], count }.
 */
export function dataGaps(debts = []) {
  const isMissing = v => v == null || pos(v) <= 0;
  const gapped = activeDebts(debts).filter(
    d => isMissing(d.interest_rate) || isMissing(d.remaining_balance),
  );
  return { debts: gapped.map(d => d.name), count: gapped.length };
}
