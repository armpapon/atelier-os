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
 * ⚠️ TEMPORARY RELIEF MEASURE — re-check policy BEFORE ม.ค. 2570, not only after.
 * The 8% floor is confirmed by the BoT only for 1 ม.ค.–31 ธ.ค. 2569; the return
 * to the normal 10% in 2570 is the *scheduled* next step, not a certainty — the
 * BoT may extend or revise it (official source, checked ส.ค. 2569:
 * app.bot.or.th/FIPCS/Thai/PFIPCS_summary.aspx?packId=25680245). Treat the
 * "future" figure as a dated scenario. This constant is the single place to edit
 * / delete when the policy for 2570 is confirmed.
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
 * True principal outstanding for a debt — the number APR may honestly accrue on.
 *
 * ⚠️ The data model stores two DIFFERENT things in `remaining_balance`:
 *   • Revolving debts (no `total_months`, e.g. credit cards) store the real
 *     principal outstanding.
 *   • Fixed-term debts (`total_months` set — mortgage / hire-purchase / lease)
 *     store the SUM OF REMAINING PAYMENTS: (total_months − months_paid) ×
 *     monthly_payment (see debt_mark_paid / debt_unmark_paid in
 *     supabase/migration_add_debt_rpc.sql:74-80 and :132-137). That figure
 *     ALREADY bakes in every future interest charge — accruing APR on it again
 *     double-counts interest (the A9 · Major-1 root cause).
 *
 * So principalOf recovers the principal for a fixed-term debt via the annuity
 * present-value of its remaining payments (r = rate/1200, n = remaining months):
 *   principal = payment × (1 − (1+r)^(−n)) / r
 * clamped to [0, remaining_balance] (it can never exceed the payment-sum).
 *
 * Fallbacks that return remaining_balance unchanged:
 *   • no term → revolving row already holds true principal.
 *   • rate 0 (a genuine 0% instalment: payment-sum == principal).
 *   • no monthly_payment / unreadable term → can't derive, use the stored value.
 * Non-finite inputs coerce to 0, like the other finance libs.
 */
export function principalOf(debt) {
  const balance = pos(debt?.remaining_balance);
  const tm = debt?.total_months;
  const termBlank = tm == null || (typeof tm === 'string' && tm.trim() === '');
  const totalMonths = Number(tm);
  // Revolving (no term) or an unreadable term → remaining_balance IS principal.
  if (termBlank || !Number.isFinite(totalMonths)) return balance;

  const rate = pos(debt?.interest_rate);
  const payment = pos(debt?.monthly_payment);
  // 0% instalment (payment-sum == principal) or missing payment → fall back.
  if (!rate || !payment) return balance;

  const paidRaw = Number(debt?.months_paid);
  const paid = Number.isFinite(paidRaw) ? paidRaw : 0;
  const n = Math.max(1, totalMonths - paid);
  const r = rate / 1200;
  const pv = payment * (1 - Math.pow(1 + r, -n)) / r;
  if (!Number.isFinite(pv) || pv <= 0) return balance; // defensive
  return Math.min(balance, pv);                        // clamp to [0, remaining_balance]
}

/**
 * Monthly interest a single debt is burning right now — on its TRUE principal
 * (principalOf), never the payment-inclusive stored balance. Returns the RAW
 * figure (principal × rate/1200); callers round only where they display it
 * (A9 · Minor 6 wants the payment-vs-interest compare done on the raw value).
 * 0 when principal or rate is null / non-numeric / ≤ 0.
 */
export function monthlyInterest(debt) {
  const principal = principalOf(debt);
  const rate = pos(debt?.interest_rate);
  if (!principal || !rate) return 0;
  return principal * rate / 1200;
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
 *   'low-rate-no-rush'   — a debt tied at the LOWEST rate in the list, that rate
 *                          under 6%, AND at least one OTHER debt has a strictly
 *                          higher rate (mortgage-style: don't rush to prepay,
 *                          attack the pricier balance first). Mutually exclusive
 *                          with 'highest-rate': a portfolio with no dearer debt
 *                          gets no no-rush tag at all.
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
  // no-rush only makes sense when there's somewhere dearer to send the money.
  const hasStrictlyHigherRate = sorted.some(d => pos(d.interest_rate) > lowestRate);

  return sorted.map((debt, i) => {
    const rank = i + 1;
    const rate = pos(debt.interest_rate);
    const balance = pos(debt.remaining_balance);
    const reasonTags = [];
    const isHighest = rank === 1;
    if (isHighest) reasonTags.push('highest-rate');
    if (rank === 2) reasonTags.push('second-rate');
    // Mutually exclusive with 'highest-rate' (the isHighest guard makes it
    // explicit; the hasStrictlyHigherRate condition already implies rank 1,
    // being the max, is never tied at the strict-lowest here).
    if (!isHighest && rate === lowestRate && rate < 6 && hasStrictlyHigherRate) {
      reasonTags.push('low-rate-no-rush');
    }
    if (debt.type === 'credit_card') reasonTags.push('credit-card-bureau');
    return { debt, rank, rate, balance, monthlyInterest: monthlyInterest(debt), reasonTags };
  });
}

/**
 * Debts about to finish — an instalment freeing up soon, so its monthly payment
 * can be rolled straight onto a high-rate balance without finding new money.
 *
 * ACTIVE debts where total_months and months_paid are both known and 1–3 (incl.)
 * instalments remain AND the monthly payment it frees is positive (a debt with
 * no monthly_payment frees no cash — there's no "โอกาส ฿0/เดือน" to show).
 * Returns [{ debt, monthsLeft, freesPerMonth }] sorted by monthsLeft ASC
 * (soonest first).
 */
export function rolloverOpportunities(debts = []) {
  return activeDebts(debts)
    .filter(d => d.total_months != null && d.months_paid != null)
    .map(d => ({
      debt: d,
      monthsLeft: Number(d.total_months) - Number(d.months_paid),
      freesPerMonth: pos(d.monthly_payment),
    }))
    .filter(o => o.monthsLeft >= 1 && o.monthsLeft <= 3 && o.freesPerMonth > 0)
    .sort((a, b) => a.monthsLeft - b.monthsLeft);
}

/**
 * The BoT minimum-payment-rise deadline (see MIN_PAYMENT_RISE above).
 *
 * Eligibility is a REVOLVING credit card only: active && type === 'credit_card'
 * && balance > 0 && total_months == null. A fixed instalment (total_months set,
 * e.g. a card-linked ประกัน paid over N months) is NOT revolving, so it is
 * excluded. Eligibility does NOT depend on interest_rate — the minimum-payment
 * floor is a % of the BALANCE, not of the rate.
 *
 * null when no card qualifies. Otherwise:
 *   { effectiveLabel, fromPct, toPct, currentMinTotal, futureMinTotal, actualPaymentTotal }
 * Both floors are computed from the SAME base (the balance), rounded per-card
 * before summing, so they are honestly comparable:
 *   currentMinTotal    = Σ round(balance × fromPct/100)   // today's 8% floor
 *   futureMinTotal     = Σ round(balance × toPct/100)     // the 2570 10% floor
 *   actualPaymentTotal = Σ monthly_payment                // what's actually paid
 * Since toPct (10) > fromPct (8) and every card has a positive balance,
 * futureMinTotal > currentMinTotal always — the honest "the floor rises" figure.
 */
export function creditCardDeadline(debts = []) {
  const cards = activeDebts(debts).filter(
    d => d.type === 'credit_card'
      && pos(d.remaining_balance) > 0
      && d.total_months == null,
  );
  if (!cards.length) return null;

  let currentMinTotal   = 0;
  let futureMinTotal    = 0;
  let actualPaymentTotal = 0;
  for (const d of cards) {
    const bal = pos(d.remaining_balance);
    currentMinTotal    += Math.round(bal * MIN_PAYMENT_RISE.fromPct / 100);
    futureMinTotal     += Math.round(bal * MIN_PAYMENT_RISE.toPct / 100);
    actualPaymentTotal += pos(d.monthly_payment);
  }
  return {
    effectiveLabel: MIN_PAYMENT_RISE.label,
    fromPct: MIN_PAYMENT_RISE.fromPct,
    toPct: MIN_PAYMENT_RISE.toPct,
    currentMinTotal,
    futureMinTotal,
    actualPaymentTotal,
  };
}

/**
 * Active debts whose interest_rate OR remaining_balance is genuinely MISSING —
 * null, blank, or non-finite — so the burn headline is understated by an unknown
 * amount. A value that is explicitly a numeric 0 is KNOWN, not missing: a genuine
 * 0% instalment (rate 0) or a fully-cleared balance (0) is complete data, not a
 * gap, and must not be reported as "ตัวเลขจริงสูงกว่านี้". The wording stays
 * neutral ("ยังไม่ได้กรอกดอก/ยอด"), never accusatory.
 *
 * Returns { debts: [...names], count }.
 */
export function dataGaps(debts = []) {
  const isMissing = v => {
    if (v == null) return true;
    if (typeof v === 'string' && v.trim() === '') return true;
    return !Number.isFinite(Number(v));
  };
  const gapped = activeDebts(debts).filter(
    d => isMissing(d.interest_rate) || isMissing(d.remaining_balance),
  );
  return { debts: gapped.map(d => d.name), count: gapped.length };
}
