// Acceptance evidence for the audit-blocker fixes (rounds 1 + 2).
// Runs the REAL src/lib/api/finance.js + lifeOS.js code against a mock
// PostgREST that enforces max-rows=1000 and has NO RPCs installed
// (i.e. proves every fallback path works before the SQL migrations run).
// Bundled + executed by audit/evidence.mjs — do not run this file directly.

import {
  listTransactions, listTransactionsRange, summarize, aggregateByMonth,
  bangkokDate, bangkokTime, bangkokMonth, txnKey, isTransfer,
  monthlyizeRecurring, monthlyRecurringTotal, simulatePayoff,
  financeMonthSummary, isRpcMissing,
  recordDebtPayment, deleteDebtPayment, upsertBudget,
  applyEffectiveBalances, getExistingTxnKeys, getMonthBounds,
  importTransactionsBatch,
  multisetDedupRows, getExistingTxnKeyCounts,
  createAccount, bulkUpsertAccountsByPocket, shouldApplyImportedBalance,
  pocketSourceKey, extractAccountsFromMapped, reassignAndArchiveAccount,
  createScopeTransfer, updateTransactionMaybePaired, deleteTransactionWithPair,
  debtLifecycle, updateDebt, archiveDebt, forecastDebts, forecastCashFlow,
  summarizeDebts, nextMonth, previousMonth,
  suggestDebtPaymentLinks, detectRecurringFromTransactions, checkRecurringStatus,
  parseCSV, detectKBankColumns, mapRowsToTransactions, mapRowsWithQuarantine,
  classifyImportRows, txnMinuteKey, txnSecond, setAccountBalanceAnchor,
  isDefinitiveServerError, currentYearMonth, getDebtStatus, loadEffectiveBalances,
} from '../src/lib/api/finance.js';
import { getFinancePulse } from '../src/lib/api/lifeOS.js';
import { toLocalYMD, todayStr, addDaysStr } from '../src/lib/dates.js';
import { __tables, __stats, __config, supabase } from './mock-supabase.mjs';

let pass = 0, fail = 0;
function check(name, cond, detail = '') {
  if (cond) { pass++; console.log(`  PASS  ${name}${detail ? '  → ' + detail : ''}`); }
  else      { fail++; console.log(`  FAIL  ${name}${detail ? '  → ' + detail : ''}`); }
}
function section(t) { console.log('\n== ' + t + ' =='); }

// ── Seed: 2,500 transactions in July 2026 (Bangkok) ─────────────────────────
const JULY = [];
for (let i = 0; i < 2496; i++) {
  const day = (i % 28) + 1;
  JULY.push({
    id: 'j' + i, user_id: 'user-1', scope: 'personal',
    title: 'txn ' + i, amount: -100, category: 'อาหาร', type: 'food',
    occurred_at: new Date(Date.UTC(2026, 5, 30, 17, 0) + day * 3600e3 * 12).toISOString(),
  });
}
JULY.push({ id: 'edge1', user_id: 'user-1', scope: 'personal', title: 'เที่ยงคืนหนึ่ง',
  amount: -350, category: 'อาหาร', type: 'food', occurred_at: '2026-06-30T17:30:00+00:00' });
JULY.push({ id: 'inc1', user_id: 'user-1', scope: 'personal', title: 'เงินเดือน',
  amount: 90000, category: 'รายรับ', type: 'income', occurred_at: '2026-07-01T02:00:00+00:00' });
JULY.push({ id: 'tr1', user_id: 'user-1', scope: 'personal', title: 'โอนไปครอบครัว',
  amount: -80000, category: 'โอนภายใน', type: 'transfer', occurred_at: '2026-07-05T03:00:00+00:00' });
JULY.push({ id: 'tr2', user_id: 'user-1', scope: 'family', title: 'รับจากส่วนตัว',
  amount: 80000, category: 'โอนภายใน', type: 'transfer', occurred_at: '2026-07-05T03:00:00+00:00' });
__tables.transactions.push(...JULY);

// ════════════════════════════════ ROUND 1 ════════════════════════════════

section('R1 · Blocker 5 · PostgREST max-rows cap (1000)');
{
  const { data: before } = await supabase.from('transactions').select('*')
    .gte('occurred_at', getMonthBounds('2026-07').startTs)
    .lt('occurred_at', getMonthBounds('2026-07').endTs)
    .eq('scope', 'personal')
    .order('occurred_at', { ascending: false }).limit(2000);
  check('BEFORE: single request truncated', before.length === 1000, `${before.length} of 2499 personal rows`);

  const after = await listTransactions({ yearMonth: '2026-07', scope: 'personal', limit: 20000 });
  check('AFTER: paginated listTransactions complete', after.length === 2499, `${after.length} rows`);

  const sums = summarize(after);
  check('AFTER: month totals complete + transfer-excluded',
    sums.income === 90000 && sums.expense === 2496 * 100 + 350,
    `income=${sums.income} expense=${sums.expense}`);

  const range = await listTransactionsRange({
    startDate: getMonthBounds('2026-07').startTs, endDate: getMonthBounds('2026-07').endTs });
  check('AFTER: paginated listTransactionsRange complete (both scopes)', range.length === 2500, `${range.length} rows`);

  const ms = await financeMonthSummary({ scope: 'personal', fromYm: '2026-07', toYm: '2026-07' });
  check('RPC missing → financeMonthSummary returns null (fallback signal)', ms === null);

  const agg = aggregateByMonth(range);
  const jul = agg.find(a => a.ym === '2026-07');
  check('Fallback aggregation (Bangkok-bucketed) correct',
    jul && jul.income === 90000 && jul.expense === 2496 * 100 + 350);
}

section('R1 · Blocker 4 · Bangkok date in transaction edit/display');
{
  const stored = '2026-06-30T17:30:00+00:00';       // = 1 ก.ค. 00:30 Bangkok
  check('BEFORE: UTC slice opens the wrong day', stored.split('T')[0] === '2026-06-30');
  check('AFTER: bangkokDate matches the displayed day', bangkokDate(stored) === '2026-07-01');
  const time = bangkokTime(stored) || '12:00:00';
  const resaved = `${bangkokDate(stored)}T${time}+07:00`;
  check('AFTER: re-save keeps the exact instant',
    new Date(resaved).getTime() === new Date(stored).getTime());
  check('AFTER: stable under device TZ ' + (process.env.TZ || 'system'),
    bangkokDate(stored) === '2026-07-01' && bangkokMonth(stored) === '2026-07');
}

section('R1 · Blocker 2 · getFinancePulse (Bangkok bounds + transfers excluded)');
{
  const now = new Date();
  const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const early = new Date(new Date(`${ym}-01T00:00:00+07:00`).getTime() + 30 * 60e3).toISOString();
  __tables.transactions.push(
    { id: 'p1', user_id: 'user-1', scope: 'personal', title: 'ตีหนึ่งวันแรกของเดือน', amount: -500, type: 'food', occurred_at: early },
    { id: 'p2', user_id: 'user-1', scope: 'personal', title: 'รายรับเดือนนี้', amount: 10000, type: 'income', occurred_at: new Date(new Date(`${ym}-05T12:00:00+07:00`)).toISOString() },
    { id: 'p3', user_id: 'user-1', scope: 'personal', title: 'โอน scope', amount: -7777, type: 'transfer', occurred_at: new Date(new Date(`${ym}-06T12:00:00+07:00`)).toISOString() },
    { id: 'p4', user_id: 'user-1', scope: 'family',   title: 'รับโอน scope', amount: 7777, type: 'transfer', occurred_at: new Date(new Date(`${ym}-06T12:00:00+07:00`)).toISOString() },
  );
  const pulse = await getFinancePulse();
  check('Pulse income excludes transfer leg', pulse.income === 10000, `income=${pulse.income}`);
  check('Pulse expense includes 00:30-Bangkok txn, excludes transfer', pulse.expense === 500, `expense=${pulse.expense}`);
  __tables.transactions = __tables.transactions.filter(t => !['p1','p2','p3','p4'].includes(t.id));
}

section('R1 · Blocker 7 · recurring header total monthlyized');
{
  const recurring = [
    { name: 'ประกันรถ', amount: 12000, frequency: 'yearly' },
    { name: 'Netflix',  amount: 300,   frequency: 'monthly' },
    { name: 'ค่าขยะ',   amount: 900,   frequency: 'quarterly' },
  ];
  check('BEFORE: face-value sum overstated', recurring.reduce((s, r) => s + r.amount, 0) === 13200);
  check('AFTER: monthlyized', Math.round(monthlyRecurringTotal(recurring)) === 1600);
  check('yearly bill ÷ 12', monthlyizeRecurring(recurring[0]) === 1000);
}

section('R1 · Blocker 6 · payoff model honesty (regression)');
{
  const sim = simulatePayoff([
    { id: 'a', name: 'A', monthly_payment: 10000, total_months: 24, months_paid: 0, interest_rate: 3 },
    { id: 'b', name: 'B', monthly_payment: 5000,  total_months: 12, months_paid: 0, interest_rate: 18 },
  ], 'snowball', 5000);
  check('extra payment saves months (labelled แบบไม่คิดดอกเบี้ย in UI)', sim.monthsSaved > 0, `${sim.monthsSaved} เดือน`);
  check('no-interest model claims ฿0 saved (UI shows —)', sim.cashSaved === 0);
}

section('R1 · Blocker 3 · effective balance = anchor + ledger after anchor');
{
  const anchorAt = '2026-08-01T05:00:00.000Z';
  __tables.accounts.push({ id: 'acc1', user_id: 'user-1', name: 'Make หลัก', balance: 10000,
    balance_anchor_at: anchorAt, is_active: true, scope: 'personal' });
  __tables.transactions.push(
    { id: 'b3a', user_id: 'user-1', scope: 'personal', account_id: 'acc1', title: 'ก่อน anchor', amount: -99999, type: 'food', occurred_at: '2026-07-20T05:00:00.000Z' },
    { id: 'b3b', user_id: 'user-1', scope: 'personal', account_id: 'acc1', title: 'หลัง anchor 1', amount: -500, type: 'food', occurred_at: '2026-08-02T05:00:00.000Z' },
    { id: 'b3c', user_id: 'user-1', scope: 'personal', account_id: 'acc1', title: 'หลัง anchor 2', amount: 2000, type: 'income', occurred_at: '2026-08-03T05:00:00.000Z' },
  );
  const [eff] = await applyEffectiveBalances(__tables.accounts.filter(a => a.id === 'acc1'));
  check('anchored account: 10000 − 500 + 2000', eff.balance === 11500, `displayed ฿${eff.balance}`);
  const [same] = await applyEffectiveBalances([{ id: 'acc2', balance: 777 }]);
  check('no anchor (migration unrun) → old snapshot behaviour', same.balance === 777);
  check('ANCHOR SEMANTICS: backdated txn before anchor does NOT move display',
    eff.balance === 11500, 'the −99999 row dated before the anchor is excluded by design');
}

section('R1 · Regressions · v4.6–v4.9 proofs still hold');
{
  const at5amBkk = new Date('2026-08-10T22:00:00Z');
  // Audit B10 hardened this: the assertion no longer needs the TZ escape
  // hatch it was written with — the answer is Bangkok's in every device zone.
  check('toLocalYMD at 05:00 Bangkok = next Bangkok day (TZ=' + process.env.TZ + ')',
    toLocalYMD(at5amBkk) === '2026-08-11');
  const a = { occurred_at: '2026-07-15T14:30:00+07:00', amount: -123.45, title: 'GrabFood' };
  const b = { occurred_at: '2026-07-15T07:30:00+00:00', amount: -123.45, title: 'GrabFood' };
  check('txnKey matches across offsets', txnKey(a) === txnKey(b));
  const s = summarize([
    { amount: 80000, type: 'transfer' }, { amount: -80000, type: 'transfer' },
    { amount: 1000, type: 'income' }, { amount: -400, type: 'food' },
  ]);
  check('summarize: transfers never in P&L', s.income === 1000 && s.expense === 400 && s.count === 2);
  const agg = aggregateByMonth([{ amount: -100, type: 'food', occurred_at: '2026-07-31T18:00:00Z' }]);
  check('aggregateByMonth buckets by Bangkok calendar', agg[0].ym === '2026-08');
}

// ════════════════════════════════ ROUND 2 ════════════════════════════════

section('R2 · B1 · MULTISET import dedup (client fn mirrors the RPC SQL)');
{
  // Two legitimate identical coffees in one batch (same minute/amount/title)
  const c = (id) => ({ id, occurred_at: '2026-07-10T09:15:00+07:00', amount: -65, title: 'กาแฟ', scope: 'personal' });
  const batch = [c('x1'), c('x2')];
  const keyOf = (r) => txnKey(r);

  check('ledger empty → BOTH legit identical rows import',
    multisetDedupRows(batch, new Map(), keyOf).length === 2);
  check('ledger has 1 → exactly the missing 1 imports',
    multisetDedupRows(batch, new Map([[keyOf(c()), 1]]), keyOf).length === 1);
  check('re-import of the same file → 0 (batch count == ledger count)',
    multisetDedupRows(batch, new Map([[keyOf(c()), 2]]), keyOf).length === 0);

  // SQL-logic unit simulation: the RPC keeps rows with rn > existing_count —
  // prove that formula produces the identical plan on the same data.
  const sqlPlan = (rows, existing) => {
    const rn = new Map();
    return rows.filter(r => {
      const k = keyOf(r);
      const n = (rn.get(k) || 0) + 1; rn.set(k, n);
      return n > (existing.get(k) || 0);
    });
  };
  for (const exist of [0, 1, 2]) {
    const em = exist ? new Map([[keyOf(c()), exist]]) : new Map();
    const a = multisetDedupRows(batch, em, keyOf).map(r => r.id).join(',');
    const b = sqlPlan(batch, em).map(r => r.id).join(',');
    check(`SQL rn>count formula ≡ client plan (existing=${exist})`, a === b, `[${a}]`);
  }

  // RPC still detected as missing → importer falls back (and REFUSES wipe
  // there — the destructive delete only ever runs inside the transaction).
  let threw = null;
  try { await importTransactionsBatch({ scope: 'personal', month: '2026-07', wipe: false, dedup: true, rows: [] }); }
  catch (e) { threw = e; }
  check('import RPC missing detected → fallback (append+dedup only, no wipe)', threw && isRpcMissing(threw));

  // Multiset key counts survive the 1000-row cap (paginated).
  // July personal rows at this point: 2,499 seeded + 1 from the anchor case
  // above (b3a, 20 Jul) = 2,500.
  const counts = await getExistingTxnKeyCounts({
    startDate: getMonthBounds('2026-07').startTs, endDate: getMonthBounds('2026-07').endTs, scope: 'personal' });
  const total = [...counts.values()].reduce((s, v) => s + v, 0);
  check('existing key COUNTS complete past 1000 rows', total === 2500, `${total} rows counted`);
}

section('R2 · B2 · balance anchor stamped on every balance write');
{
  // createAccount stamps the anchor
  const created = await createAccount({ name: 'บัญชีใหม่', type: 'savings', balance: 5000, tone: 'amber', scope: 'personal' });
  const row = __tables.accounts.find(x => x.id === created.id);
  check('createAccount stamps balance_anchor_at', !!row.balance_anchor_at);

  // createAccount falls back cleanly when the column is missing
  __config.missingColumns = { accounts: ['balance_anchor_at'] };
  const legacy = await createAccount({ name: 'บัญชีก่อน migration', type: 'savings', balance: 100, scope: 'personal' });
  const legacyRow = __tables.accounts.find(x => x.id === legacy.id);
  check('createAccount migration-unrun fallback (no anchor column)', legacyRow && !('balance_anchor_at' in legacyRow));
  __config.missingColumns = {};

  // shouldApplyImportedBalance — the never-rewind rule
  check('never anchored → imported CP Bal applies', shouldApplyImportedBalance(null, '2026-06-15T12:00:00+07:00') === true);
  check('older file (มิ.ย. < ส.ค.) → REFUSED', shouldApplyImportedBalance('2026-08-01T05:00:00Z', '2026-06-15T12:00:00+07:00') === false);
  check('same month → applies', shouldApplyImportedBalance('2026-08-01T05:00:00Z', '2026-08-20T12:00:00+07:00') === true);
  check('newer month → applies', shouldApplyImportedBalance('2026-06-01T05:00:00Z', '2026-08-02T12:00:00+07:00') === true);

  // bulkUpsertAccountsByPocket: rewind refused end-to-end + anchor stamped
  __tables.accounts.push({ id: 'poc1', user_id: 'user-1', name: 'Cashbox', scope: 'personal',
    balance: 99000, balance_anchor_at: '2026-08-05T10:00:00+07:00', is_active: true });
  await bulkUpsertAccountsByPocket([
    { pocket: 'Cashbox', scope: 'personal', latestBalance: 11111, latestDate: '2026-06-20T10:00:00+07:00', txCount: 5 },
  ]);
  const poc1 = __tables.accounts.find(a => a.id === 'poc1');
  check('CSV of an OLDER month cannot rewind balance/anchor',
    poc1.balance === 99000 && poc1.balance_anchor_at === '2026-08-05T10:00:00+07:00',
    `balance stays ฿${poc1.balance}`);
  await bulkUpsertAccountsByPocket([
    { pocket: 'Cashbox', scope: 'personal', latestBalance: 88000, latestDate: '2026-08-20T10:00:00+07:00', txCount: 5 },
  ]);
  check('newer file applies balance AND stamps anchor = file latest txn',
    poc1.balance === 88000 && poc1.balance_anchor_at === '2026-08-20T10:00:00+07:00');

  // no double-count: imported txns are dated ≤ the new anchor → Σ after
  // anchor excludes them; a later manual txn still moves the display.
  __tables.transactions.push(
    { id: 'dc1', user_id: 'user-1', scope: 'personal', account_id: 'poc1', title: 'อยู่ในไฟล์ import',
      amount: -1234, type: 'food', occurred_at: '2026-08-20T10:00:00+07:00' },   // == anchor
    { id: 'dc2', user_id: 'user-1', scope: 'personal', account_id: 'poc1', title: 'จดเองทีหลัง',
      amount: -300, type: 'food', occurred_at: '2026-08-25T10:00:00+07:00' },
  );
  const [pocEff] = await applyEffectiveBalances([poc1]);
  check('imported CP Bal not double-counted; manual txn after anchor counts',
    pocEff.balance === 88000 - 300, `displayed ฿${pocEff.balance}`);
}

section('R2 · B3 · debt fallback: insert-first, counter only on real insert');
{
  __tables.debts.push({ id: 'd1', user_id: 'user-1', name: 'บ้าน SCB', monthly_payment: 19000,
    total_months: 60, months_paid: 5, scope: 'personal', is_active: true });

  await recordDebtPayment({ debt_id: 'd1', pay_month: '2026-08-01', amount_paid: 19000 });
  const d1 = __tables.debts.find(d => d.id === 'd1');
  check('mark paid (fallback) increments once', d1.months_paid === 6,
    `rpc tried first: ${__stats.rpcCalls.includes('debt_mark_paid')}`);

  await recordDebtPayment({ debt_id: 'd1', pay_month: '2026-08-01', amount_paid: 20000 });
  const payRow = __tables.debt_payments.find(p => p.debt_id === 'd1');
  check('re-mark same month: counter untouched, amount refreshed (ON CONFLICT DO NOTHING + update)',
    d1.months_paid === 6 && __tables.debt_payments.length === 1 && payRow.amount_paid === 20000);

  await deleteDebtPayment(payRow.id);
  check('unmark decrements back', d1.months_paid === 5 && __tables.debt_payments.length === 0);
  check('debt_unmark_paid RPC tried first (lock-order-fixed v2 is the real closure)',
    __stats.rpcCalls.includes('debt_unmark_paid'));
}

section('R2 · CONDITIONAL · budget fallback cross-scope guard');
{
  __tables.budgets.length = 0;
  const ok = await upsertBudget({ category: 'อาหาร', monthly_limit: 8000, yearMonth: '2026-08', scope: 'personal' });
  check('42P10 → fallback still works for same/new scope', !!ok && __tables.budgets.length === 1);

  let guarded = null;
  try { await upsertBudget({ category: 'อาหาร', monthly_limit: 5000, yearMonth: '2026-08', scope: 'family' }); }
  catch (e) { guarded = e; }
  check('cross-scope write REFUSED with Thai error (no clobber)',
    !!guarded && /migration_fix_budget_scope_key/.test(guarded.message)
    && __tables.budgets[0].monthly_limit === 8000 && __tables.budgets[0].scope === 'personal');
}

section('R2 · Finding 1 · TxnForm edit sign preservation (logic as shipped)');
{
  // Replicates Finance.jsx handleSubmit exactly (see report file:lines).
  const decide = (form, initialTxn, isEdit) => {
    const isIncome = form.type === 'income';
    const isTransferEdit = isEdit && isTransfer(initialTxn);
    const abs = Math.abs(Number(form.amount));
    const typeChanged = isEdit && form.type !== initialTxn?.type;
    let amount;
    if (isTransferEdit) amount = abs * (Number(initialTxn.amount) < 0 ? -1 : 1);
    else if (isEdit && !typeChanged) amount = abs * (Number(initialTxn.amount) < 0 ? -1 : 1);
    else amount = abs * (isIncome ? 1 : -1);
    const type = isTransferEdit ? initialTxn.type : form.type;
    const category = isTransferEdit ? initialTxn.category : null; // null = derived from picked type
    return { amount, type, category };
  };

  const transferPlus = { type: 'transfer', category: 'โอนภายใน', amount: 80000 };
  const r1 = decide({ type: 'transfer', amount: '80000' }, transferPlus, true);
  check('note-edit on transfer +leg keeps +80000 and โอนภายใน',
    r1.amount === 80000 && r1.type === 'transfer' && r1.category === 'โอนภายใน');

  const csvCredit = { type: 'other', category: 'อื่น ๆ', amount: 1500 };  // positive non-'income'
  const r2 = decide({ type: 'other', amount: '1500' }, csvCredit, true);
  check('edit without type change preserves original + sign (was: flipped to −)', r2.amount === 1500);

  const r3 = decide({ type: 'food', amount: '1500' }, csvCredit, true);
  check('explicit type change to expense flips to −', r3.amount === -1500);

  const r4 = decide({ type: 'income', amount: '900' }, null, false);
  check('new income row is +', r4.amount === 900);
}

section('R2 · Finding 3 · debt-link suggester needs name evidence');
{
  const debts = [{ id: 'dd', name: 'BMW Leasing', creditor: 'BMW', monthly_payment: 19253 }];
  const amountOnly = [{ _rowIdx: 0, title: 'โอนเงินออก', amount: -19253, occurred_at: '2026-08-05T12:00:00+07:00' }];
  check('amount-only exact match stays BELOW threshold (40+10=50 < 60)',
    suggestDebtPaymentLinks(amountOnly, debts, []).length === 0);

  const withName = [{ _rowIdx: 1, title: 'BMW Leasing งวดรถ', amount: -19253, occurred_at: '2026-08-05T12:00:00+07:00' }];
  const sug = suggestDebtPaymentLinks(withName, debts, []);
  check('debt-NAME text in title crosses into the 60–79 opt-in tier (default-UNchecked)',
    sug.length === 1 && sug[0].confidence >= 60 && sug[0].confidence < 80,
    sug[0] && `confidence=${sug[0].confidence}`);

  const strongDebts = [{ id: 'dd2', name: 'KTC บัตรเครดิต', creditor: 'KTC Krungthai', monthly_payment: 5200 }];
  const strongTxn = [{ _rowIdx: 2, title: 'KTC Krung ชำระบัตร', amount: -5200, occurred_at: '2026-08-06T12:00:00+07:00' }];
  const strong = suggestDebtPaymentLinks(strongTxn, strongDebts, []);
  check('creditor evidence reaches ≥80 (auto-checked tier)',
    strong.length === 1 && strong[0].confidence >= 80,
    strong[0] && `confidence=${strong[0].confidence}`);

  const blocked = suggestDebtPaymentLinks(withName, debts, [{ debt_id: 'dd', pay_month: '2026-08-01' }]);
  check('already-recorded month is blocked (real existingPayments now passed by importer)', blocked.length === 0);
}

section('R2 · Finding 4 · recurring detector/status ignore transfers');
{
  const monthly = (ym, id, over = {}) => ({
    id, user_id: 'user-1', scope: 'personal', title: 'โอนไปครอบครัว', amount: -80000,
    type: 'transfer', category: 'โอนภายใน', occurred_at: `${ym}-05T12:00:00+07:00`, ...over,
  });
  const transfers = [monthly('2026-06', 't1'), monthly('2026-07', 't2'), monthly('2026-08', 't3')];
  check('repeating scope transfer is NOT suggested as a bill',
    detectRecurringFromTransactions(transfers).length === 0);

  const bills = ['2026-06', '2026-07', '2026-08'].map((ym, i) => ({
    id: 'n' + i, title: 'Netflix', amount: -419, type: 'bills', occurred_at: `${ym}-05T12:00:00+07:00`, scope: 'personal',
  }));
  check('real repeating bill IS suggested (detector works on 2+ months history)',
    detectRecurringFromTransactions(bills).length === 1);

  const bill = { id: 'r9', name: 'โอนไปครอบครัว', vendor: 'โอนไปครอบครัว', amount: 80000, due_day: 5 };
  const st = checkRecurringStatus(bill, transfers, '2026-08');
  check('a transfer leg can never mark a bill "paid"', st.status !== 'paid', `status=${st.status}`);
}

section('R2 · Finding 5 · suggestions feed (12-month window)');
{
  // The detector NEEDS 2+ distinct months — a single-month feed can never
  // produce a suggestion. RecurringTracker now receives historyTxns=trend12.
  const oneMonth = [
    { id: 's1', title: 'AIS', amount: -499, type: 'bills', occurred_at: '2026-08-01T12:00:00+07:00', scope: 'personal' },
    { id: 's2', title: 'AIS', amount: -499, type: 'bills', occurred_at: '2026-08-28T12:00:00+07:00', scope: 'personal' },
  ];
  check('single-month feed (old wiring) → 0 suggestions, provably starved',
    detectRecurringFromTransactions(oneMonth).length === 0);
  const twoMonths = [...oneMonth,
    { id: 's3', title: 'AIS', amount: -499, type: 'bills', occurred_at: '2026-07-01T12:00:00+07:00', scope: 'personal' }];
  check('multi-month feed (new historyTxns wiring) → suggestion appears',
    detectRecurringFromTransactions(twoMonths).length === 1);
}

// ════════════════════════════════ ROUND 3 ════════════════════════════════

section('R3 · B1 · anchor reconciliation (stale updated_at scenario)');
{
  // Legacy account: stored balance 50,000 is the CURRENT truth (it already
  // reflects the whole ledger). Its updated_at ≈ creation time.
  const staleAnchor = '2025-01-01T00:00:00.000Z';   // ≈ created_at
  const acct = { id: 'rec1', user_id: 'user-1', name: 'บัญชีเก่า', balance: 50000,
    is_active: true, scope: 'personal' };
  __tables.accounts.push(acct);
  __tables.transactions.push(
    { id: 'rc1', user_id: 'user-1', scope: 'personal', account_id: 'rec1', title: 'เก่า 1', amount: -20000, type: 'food', occurred_at: '2025-06-01T05:00:00.000Z' },
    { id: 'rc2', user_id: 'user-1', scope: 'personal', account_id: 'rec1', title: 'เก่า 2', amount: -10000, type: 'food', occurred_at: '2026-01-01T05:00:00.000Z' },
  );

  // v2 backfill behaviour (anchor = stale updated_at) → whole ledger
  // re-added on top of the current snapshot = double count. This is the
  // auditor's scenario, reproduced with the REAL applyEffectiveBalances.
  const [bad] = await applyEffectiveBalances([{ ...acct, balance_anchor_at: staleAnchor }]);
  check('BEFORE (v2, anchor=updated_at≈created): double count', bad.balance === 20000,
    `displayed ฿${bad.balance} — wrong, snapshot already contained those rows`);

  // v3 / reconcile file behaviour: anchor = now() → Σ(after now) = 0 →
  // display == stored snapshot exactly (pre-anchor behaviour restored).
  const [good] = await applyEffectiveBalances([{ ...acct, balance_anchor_at: new Date().toISOString() }]);
  check('AFTER (v3 backfill / reconcile: anchor=now): display == snapshot', good.balance === 50000,
    `displayed ฿${good.balance}`);

  // touch_account_anchor trigger decision table (JS mirror of the SQL:
  // stamp iff balance IS DISTINCT FROM old AND anchor IS NOT DISTINCT FROM old)
  const trig = (oldRow, newRow) => {
    const balChanged     = !Object.is(newRow.balance, oldRow.balance);
    const anchorUntouched = Object.is(newRow.balance_anchor_at, oldRow.balance_anchor_at);
    return (balChanged && anchorUntouched) ? { ...newRow, balance_anchor_at: 'NOW()' } : newRow;
  };
  const oldRow = { balance: 100, balance_anchor_at: 'T0' };
  check('trigger: balance write WITHOUT explicit anchor → stamped now()',
    trig(oldRow, { balance: 200, balance_anchor_at: 'T0' }).balance_anchor_at === 'NOW()');
  check('trigger: balance write WITH explicit anchor → explicit stamp respected',
    trig(oldRow, { balance: 200, balance_anchor_at: 'T9' }).balance_anchor_at === 'T9');
  check('trigger: non-balance update (rename etc.) → anchor untouched',
    trig(oldRow, { balance: 100, balance_anchor_at: 'T0' }).balance_anchor_at === 'T0');
}

section('R3 · B2 · popup transfer amount lock (decision table as shipped)');
{
  // Replicates Finance.jsx handleSubmit: for transfer edits the amount is
  // taken from the ORIGINAL row verbatim — the form field is read-only, and
  // even a tampered form value cannot desync the mirrored pair.
  const decide = (form, initialTxn, isEdit) => {
    const isTransferEdit = isEdit && isTransfer(initialTxn);
    const abs = Math.abs(Number(form.amount));
    const typeChanged = isEdit && form.type !== initialTxn?.type;
    if (isTransferEdit) return Number(initialTxn.amount);
    if (isEdit && !typeChanged) return abs * (Number(initialTxn.amount) < 0 ? -1 : 1);
    return abs * (form.type === 'income' ? 1 : -1);
  };
  const outLeg = { type: 'transfer', category: 'โอนภายใน', amount: -80000 };
  const inLeg  = { type: 'transfer', category: 'โอนภายใน', amount: 80000 };
  check('transfer −leg: tampered form amount 90000 ignored → −80000 kept',
    decide({ type: 'transfer', amount: '90000' }, outLeg, true) === -80000);
  check('transfer +leg: amount stays +80000 (legs remain mirrored)',
    decide({ type: 'transfer', amount: '12345' }, inLeg, true) === 80000);
  check('non-transfer edit still follows round-2 rules',
    decide({ type: 'food', amount: '500' }, { type: 'food', amount: -450 }, true) === -500);
}

section('R3 · B3 · sharpened dedup key (second + title-80 + note)');
{
  const oldKey = (t) => {   // v2 key, for the BEFORE comparisons
    const d = new Date(t.occurred_at);
    return `${d.toISOString().substring(0, 16)}|${Math.round(t.amount * 100)}|${(t.title || '').trim().substring(0, 40)}`;
  };
  const r1 = { occurred_at: '2026-08-05T12:00:00+07:00', amount: -120, title: 'ข้าวมันไก่', note: null };
  const r2 = { occurred_at: '2026-08-05T12:00:01+07:00', amount: -120, title: 'ข้าวมันไก่', note: null };
  check('BEFORE: minute key collided two distinct same-minute rows', oldKey(r1) === oldKey(r2));
  check('AFTER: second-precision keys differ', txnKey(r1) !== txnKey(r2));

  const n1 = { ...r1, note: 'โต๊ะ 1' };
  const n2 = { ...r1, note: 'โต๊ะ 2' };
  check('note distinguishes otherwise-identical rows', txnKey(n1) !== txnKey(n2));
  check('null note ≡ empty note (JS matches SQL coalesce(trim(note),\'\'))',
    txnKey(r1) === txnKey({ ...r1, note: '' }) && txnKey(r1) === txnKey({ ...r1, note: '  ' }));

  const long1 = { ...r1, title: 'A'.repeat(40) + 'X'.repeat(20) };
  const long2 = { ...r1, title: 'A'.repeat(40) + 'Y'.repeat(20) };
  check('title-80 separates rows the old title-40 slice collided',
    oldKey(long1) === oldKey(long2) && txnKey(long1) !== txnKey(long2));

  // SQL ≡ JS: build the key with the exact SQL expressions
  // (date_trunc second → UTC, round(amount*100), left(trim(title),80),
  // coalesce(trim(note),'')) and compare with txnKey.
  const sqlKey = (t) => {
    const d = new Date(t.occurred_at);
    d.setUTCMilliseconds(0);
    const ts = d.toISOString().substring(0, 19);
    const amt = Math.round(Number(t.amount) * 100);
    const title = (t.title || '').trim().substring(0, 80);
    const note = t.note == null ? '' : String(t.note).trim();
    return `${ts}|${amt}|${title}|${note}`;
  };
  for (const t of [r1, r2, n1, long1, { ...r1, note: null }]) {
    if (sqlKey(t) !== txnKey(t)) { check('SQL key formula ≡ txnKey', false, `${sqlKey(t)} vs ${txnKey(t)}`); break; }
  }
  check('SQL key formula ≡ txnKey on all samples', [r1, r2, n1, long1].every(t => sqlKey(t) === txnKey(t)));

  // Cross-file multiset: ledger has the 12:00:00 row; a NEW export contains
  // a genuinely distinct second same-day row (synthetic :01). v2 (minute
  // key, existing=1, batch=1) dropped it; v3 imports it. True re-import of
  // the 12:00:00 row is still dropped.
  const existing = new Map([[txnKey(r1), 1]]);
  check('genuinely distinct 2nd row (different second) now imports',
    multisetDedupRows([r2], existing).length === 1);
  check('true duplicate (same second) still dedups',
    multisetDedupRows([{ ...r1 }], existing).length === 0);
}

section('R3 · B3 · synthetic incrementing seconds in the real parsers');
{
  // Generic bank CSV (date-only source) through the REAL pipeline:
  // parseCSV → detectKBankColumns → mapRowsToTransactions.
  const csv = 'Date,Description,Amount\n' +
    '05/08/2026,กาแฟ,-65\n' +
    '05/08/2026,กาแฟ,-65\n' +          // genuinely distinct 2nd coffee, same day
    '05/08/2026,ข้าวเย็น,-120\n' +
    '06/08/2026,กาแฟ,-65\n';
  const parsed = parseCSV(csv);
  const colMap = detectKBankColumns(parsed.headers);
  const txns = mapRowsToTransactions(parsed.rows, colMap, 'personal');
  const times = txns.map(t => t.occurred_at);
  check('same-day rows get incrementing synthetic seconds',
    times[0].includes('T12:00:00') && times[1].includes('T12:00:01') && times[2].includes('T12:00:02'),
    times.slice(0, 3).map(t => t.substring(11, 19)).join(' · '));
  check('counter resets per day (next day starts at :00)', times[3].includes('T12:00:00'));
  check('two distinct same-day coffees now have DIFFERENT dedup keys',
    txnKey(txns[0]) !== txnKey(txns[1]));

  // Determinism: re-parsing the same file reproduces identical timestamps →
  // re-import still dedups to zero via multiset.
  const txns2 = mapRowsToTransactions(parseCSV(csv).rows, detectKBankColumns(parseCSV(csv).headers), 'personal');
  check('same file re-parsed → identical timestamps (dedup-stable)',
    txns2.every((t, i) => t.occurred_at === txns[i].occurred_at));
  const ledgerCounts = new Map();
  for (const t of txns) ledgerCounts.set(txnKey(t), (ledgerCounts.get(txnKey(t)) || 0) + 1);
  check('re-import of the same file → 0 rows pass dedup',
    multisetDedupRows(txns2, ledgerCounts).length === 0);

  // Make format with a real HH:MM clock: same-minute rows split by seconds.
  const makeCsv = 'Time,Cloud Pocket,Type,Txn,Category,Memo,Note,Date\n' +
    '09:15,Cashbox,Payment,-65,ชา กาแฟ,,ร้านกาแฟ,05/08/2026\n' +
    '09:15,Cashbox,Payment,-65,ชา กาแฟ,,ร้านกาแฟ,05/08/2026\n';
  const mp = parseCSV(makeCsv);
  const mTxns = mapRowsToTransactions(mp.rows, detectKBankColumns(mp.headers), 'personal');
  check('Make same-minute rows get :00 / :01 (real HH:MM kept)',
    mTxns.length === 2 && mTxns[0].occurred_at.includes('T09:15:00') && mTxns[1].occurred_at.includes('T09:15:01'),
    mTxns.map(t => t.occurred_at.substring(11, 19)).join(' · '));
}

// ════════════════════════════════ ROUND 4 ════════════════════════════════

section('R4 · B1 · reconcile v2 MATERIALIZES (auditor counterexamples i–iii)');
{
  // Valid anchor: real balance was 50,000 at T0; one later −1,000 expense.
  const T0 = '2026-08-01T05:00:00.000Z';
  __tables.transactions.push({ id: 'rv1', user_id: 'user-1', scope: 'personal',
    account_id: 'recV', title: 'หลัง anchor', amount: -1000, type: 'food',
    occurred_at: '2026-08-05T05:00:00.000Z' });
  const acct = { id: 'recV', balance: 50000, balance_anchor_at: T0 };

  const [d0] = await applyEffectiveBalances([acct]);
  check('(setup) valid anchor displays 49,000', d0.balance === 49000);

  // (iii) the OLD blind reconcile — prove we understood the bug
  const blind = { ...acct, balance_anchor_at: new Date().toISOString() };
  const [dBlind] = await applyEffectiveBalances([blind]);
  check('(iii) OLD blind reconcile regressed the display to 50,000 (bug reproduced)',
    dBlind.balance === 50000, `displayed ฿${dBlind.balance} — silently gained ฿1,000`);

  // (i) reconcile v2: materialize Σ-after-anchor into balance, THEN re-anchor
  const reconcileV2 = async (a) => {
    const [eff] = await applyEffectiveBalances([a]);
    return { ...a, balance: eff.balance,
      balance_anchor_at: new Date().toISOString(), balance_anchor_source: 'reconcile' };
  };
  const r1 = await reconcileV2(acct);
  const [d1] = await applyEffectiveBalances([r1]);
  check('(i) reconcile v2 preserves the displayed value (49,000 stays 49,000)',
    r1.balance === 49000 && d1.balance === 49000);

  // (ii) idempotent: second run adds Σ(after now) = 0
  const r2 = await reconcileV2(r1);
  check('(ii) re-running reconcile v2 is a no-op (truly idempotent)',
    r2.balance === 49000 && r2.balance_anchor_source === 'reconcile');
}

section('R4 · B1 · anchor provenance stamped by every write path');
{
  const created = await createAccount({ name: 'ที่มา user', type: 'savings', balance: 1, scope: 'personal' });
  check("createAccount stamps source='user'",
    __tables.accounts.find(a => a.id === created.id)?.balance_anchor_source === 'user');

  await setAccountBalanceAnchor(created.id, 777);
  const after = __tables.accounts.find(a => a.id === created.id);
  check("set-balance modal stamps source='user' + fresh anchor",
    after.balance === 777 && after.balance_anchor_source === 'user');

  await bulkUpsertAccountsByPocket([
    { pocket: 'ที่มา import', scope: 'personal', latestBalance: 500, latestDate: '2026-08-09T10:00:00+07:00', txCount: 1 },
  ]);
  check("CSV import stamps source='import'",
    __tables.accounts.find(a => a.name === 'ที่มา import')?.balance_anchor_source === 'import');

  // Migration-unrun fallback: source column missing → anchor still written
  __config.missingColumns = { accounts: ['balance_anchor_source'] };
  const legacy = await createAccount({ name: 'ยังไม่มีคอลัมน์ source', type: 'savings', balance: 9, scope: 'personal' });
  const legacyRow = __tables.accounts.find(a => a.id === legacy.id);
  check('source column missing → falls back, anchor still stamped',
    legacyRow && !('balance_anchor_source' in legacyRow) && !!legacyRow.balance_anchor_at);
  __config.missingColumns = {};

  // The DB trigger (SQL) decision table was proven in R3; provenance adds
  // source='trigger' on the same condition — same three branches hold.
}

section('R4 · B3 · two-tier classifier (auditor counterexamples i–iv)');
{
  const mk = (over) => ({ user_id: 'user-1', scope: 'personal', type: 'food',
    title: 'กาแฟ', amount: -65, note: null, ...over });

  // (i) pre-v4.16 ledger: THREE identical rows all stored at :00 (legacy
  // parser pinned everything to 12:00:00). Re-import the same file with the
  // NEW parser → :00/:01/:02.
  const legacyLedger = [0, 1, 2].map(i => mk({ id: 'L' + i, occurred_at: '2026-08-05T05:00:00.000Z' }));
  const newParse = [0, 1, 2].map(i => mk({
    id: 'B' + i, _synthetic: true,
    occurred_at: `2026-08-05T05:00:0${i}.000Z`,
  }));
  const c1 = classifyImportRows(newParse, legacyLedger);
  // Round-5 semantics: the :00 exact match is synthetic-vs-:00 → AMBIGUOUS
  // too (was auto-dup in round 4). Still 0 inserts by default — but nothing
  // is silent any more.
  check('(i) old-file re-import → 0 inserts (ALL 3 surfaced as ambiguous, default skip)',
    c1.toImport.length === 0 && c1.duplicates.length === 0 && c1.ambiguous.length === 3,
    `toImport=${c1.toImport.length} dup=${c1.duplicates.length} amb=${c1.ambiguous.length}`);

  // (ii) two partial exports with distinct same-day txns: ledger has coffee A
  // (from file 1); file 2 = [breakfast, coffee B]. Coffee B is genuinely
  // distinct but minute-matches coffee A → AMBIGUOUS, not silently decided.
  const ledger2 = [mk({ id: 'A', occurred_at: '2026-08-06T05:00:00.000Z' })];
  const file2 = [
    mk({ id: 'bf', title: 'ข้าวเช้า', amount: -80, _synthetic: true, occurred_at: '2026-08-06T05:00:00.000Z' }),
    mk({ id: 'cB', _synthetic: true, occurred_at: '2026-08-06T05:00:01.000Z' }),
  ];
  const c2 = classifyImportRows(file2, ledger2);
  check('(ii) distinct row flagged AMBIGUOUS with both sides attached',
    c2.toImport.length === 1 && c2.toImport[0].id === 'bf'
    && c2.ambiguous.length === 1 && c2.ambiguous[0].row.id === 'cB' && c2.ambiguous[0].existing.id === 'A');
  const c2b = classifyImportRows(file2.map(r => r.id === 'cB' ? { ...r, _force: true } : r), ledger2);
  check('(ii) user-include path (force) imports the ambiguous row',
    c2b.toImport.length === 2 && c2b.ambiguous.length === 0);

  // (iii) v4.16-format ledger, same file re-imported → 0 inserts. Round-5
  // semantics: :01/:02 exact matches auto-dedup (existing seconds ≠ 0), the
  // :00 first-row match is surfaced as ambiguous (its ledger twin carries
  // the unknowable :00 signature).
  const c3 = classifyImportRows(newParse, newParse.map(r => ({ ...r })));
  check('(iii) same-file re-import → 0 inserts (2 auto-dup + 1 surfaced :00 row)',
    c3.toImport.length === 0 && c3.duplicates.length === 2 && c3.ambiguous.length === 1,
    `dup=${c3.duplicates.length} amb=${c3.ambiguous.length}`);

  // (iv) real-timestamp rows never enter tier-2 even when a legacy :00 row
  // shares their minute+amount+title.
  const realRow = mk({ id: 'real', occurred_at: '2026-08-05T05:00:37.000Z' });   // no _synthetic
  const c4 = classifyImportRows([realRow], legacyLedger);
  check('(iv) real-timestamp row unaffected by tier-2 → imports',
    c4.toImport.length === 1 && c4.ambiguous.length === 0);

  // tier-1 consumption starves tier-2 (multiset honesty): a :00 batch row
  // that exact-matches consumes the ledger row (round 5: as an AMBIGUITY,
  // since both clocks are synthetic) so tier-2 can't double-spend it — the
  // :01 row then imports instead of matching the same ledger row twice.
  const c5 = classifyImportRows(
    [mk({ id: 'x0', _synthetic: true, occurred_at: '2026-08-06T05:00:00.000Z' }),
     mk({ id: 'x1', _synthetic: true, occurred_at: '2026-08-06T05:00:01.000Z' })],
    ledger2);
  check('tier-1 match consumes the legacy row (tier-2 cannot double-spend it)',
    c5.duplicates.length === 0 && c5.ambiguous.length === 1
    && c5.ambiguous[0].row.id === 'x0' && c5.toImport.length === 1 && c5.toImport[0].id === 'x1',
    `dup=${c5.duplicates.length} amb=${c5.ambiguous.length} import=${c5.toImport.length}`);

  // SQL ≡ JS: the RPC's counting formula (rn_exact/exact counts; consumed =
  // :00 dup rows per minute key; rn_min ≤ legacy − consumed) must classify
  // identically on every scenario above.
  const sqlPlan = (rows, existing) => {
    const exact = new Map(), legacy = new Map();
    for (const e of existing) {
      const k = txnKey(e); exact.set(k, (exact.get(k) || 0) + 1);
      if (txnSecond(e) === 0) { const m = txnMinuteKey(e); legacy.set(m, (legacy.get(m) || 0) + 1); }
    }
    const rnE = new Map(); const out = { ins: [], dup: [], amb: [] };
    const t1 = rows.map(r => {
      if (r._force) return { r, cls: 'ins' };
      const k = txnKey(r); const n = (rnE.get(k) || 0) + 1; rnE.set(k, n);
      if (n <= (exact.get(k) || 0)) {
        // v5: synthetic-vs-:00 exact matches are ambiguous, not auto-dup
        return { r, cls: (r._synthetic && txnSecond(r) === 0) ? 'amb' : 'dup', matched: true };
      }
      return { r, cls: null };
    });
    const consumed = new Map();
    for (const t of t1) if (t.matched && txnSecond(t.r) === 0) {
      const m = txnMinuteKey(t.r); consumed.set(m, (consumed.get(m) || 0) + 1);
    }
    const rnM = new Map();
    for (const t of t1) {
      if (t.cls) { out[t.cls].push(t.r); continue; }
      if (t.r._synthetic) {
        const m = txnMinuteKey(t.r); const n = (rnM.get(m) || 0) + 1; rnM.set(m, n);
        if (n <= Math.max(0, (legacy.get(m) || 0) - (consumed.get(m) || 0))) { out.amb.push(t.r); continue; }
      }
      out.ins.push(t.r);
    }
    return out;
  };
  const same = (cls, plan) =>
    cls.toImport.map(r => r.id).join() === plan.ins.map(r => r.id).join() &&
    cls.duplicates.map(r => r.id).join() === plan.dup.map(r => r.id).join() &&
    cls.ambiguous.map(a => a.row.id).join() === plan.amb.map(r => r.id).join();
  check('SQL counting formula ≡ JS classifier on all four scenarios',
    same(c1, sqlPlan(newParse, legacyLedger)) &&
    same(c2, sqlPlan(file2, ledger2)) &&
    same(c3, sqlPlan(newParse, newParse)) &&
    same(c4, sqlPlan([realRow], legacyLedger)) &&
    same(c5, sqlPlan(
      [mk({ id: 'x0', _synthetic: true, occurred_at: '2026-08-06T05:00:00.000Z' }),
       mk({ id: 'x1', _synthetic: true, occurred_at: '2026-08-06T05:00:01.000Z' })], ledger2)));

  // Parsers flag statement rows as synthetic (feeds the classifier).
  const p = parseCSV('Date,Description,Amount\n05/08/2026,กาแฟ,-65\n');
  const [pr] = mapRowsToTransactions(p.rows, detectKBankColumns(p.headers), 'personal');
  check('parser rows carry _synthetic: true', pr._synthetic === true);
}

// ════════════════════════════════ ROUND 5 ════════════════════════════════

const { assignRowIds } = await import('../src/lib/api/finance.js');

section('R5 · Bug 1 · per-row identity (_rid) for every source incl. PDF');
{
  // PDF-shaped rows: parseKBankPDF emits NO _rowIdx (the round-5 bug).
  const pdfRows = [
    { _synthetic: true, title: 'กาแฟ', amount: -65, note: null, occurred_at: '2026-08-06T05:00:01.000Z', scope: 'personal' },
    { _synthetic: true, title: 'ข้าวเที่ยง', amount: -120, note: null, occurred_at: '2026-08-06T06:30:00.000Z', scope: 'personal' },
  ];
  const beforeKeys = new Set(pdfRows.map(r => r._rowIdx));
  check('BEFORE: PDF rows all keyed to undefined (one decision hit every row)',
    beforeKeys.size === 1 && beforeKeys.has(undefined));

  const withIds = assignRowIds(pdfRows);
  check('AFTER: assignRowIds gives unique immutable _rid per row',
    new Set(withIds.map(r => r._rid)).size === 2);

  // Integration (i): one ambiguous + one clean PDF row → INDEPENDENT calls.
  const ledger = [{ title: 'กาแฟ', amount: -65, note: null, occurred_at: '2026-08-06T05:00:00.000Z' }];
  const cls = classifyImportRows(withIds, ledger);
  check('(i) clean PDF row imports while the ambiguous one waits for the user',
    cls.toImport.length === 1 && cls.toImport[0].title === 'ข้าวเที่ยง'
    && cls.ambiguous.length === 1 && cls.ambiguous[0].row.title === 'กาแฟ');
  const decided = new Set([cls.ambiguous[0].row._rid]);   // tick ONLY that row
  check('(i) decision Set keyed by _rid touches exactly one row',
    decided.has(withIds[0]._rid) && !decided.has(withIds[1]._rid));
}

section('R5 · Bug 2 · classification follows the SELECTED batch');
{
  const ledger = [{ id: 'A', title: 'กาแฟ', amount: -65, note: null, occurred_at: '2026-08-06T05:00:00.000Z' }];
  const preview = assignRowIds([
    { _synthetic: true, title: 'กาแฟ', amount: -65, note: null, occurred_at: '2026-08-06T05:00:00.000Z', scope: 'personal' },  // consumer
    { _synthetic: true, title: 'กาแฟ', amount: -65, note: null, occurred_at: '2026-08-06T05:00:01.000Z', scope: 'personal' },  // :01 row
  ]);

  const fullCls = classifyImportRows(preview, ledger);
  check('(setup) full-preview classification: :01 row looks importable',
    fullCls.toImport.length === 1 && fullCls.toImport[0]._rid === 1);

  // User deselects the consumer → classify the SELECTED batch only.
  const selectedCls = classifyImportRows([preview[1]], ledger);
  check('(ii) deselecting the consumer re-classifies the :01 row as AMBIGUOUS (shown, not silently skipped)',
    selectedCls.toImport.length === 0 && selectedCls.ambiguous.length === 1
    && selectedCls.ambiguous[0].row._rid === 1 && selectedCls.ambiguous[0].existing.id === 'A');
  check('(ii) shown != executed divergence is real without the fix',
    fullCls.toImport.some(r => r._rid === 1) && selectedCls.ambiguous.some(a => a.row._rid === 1),
    'CSVImporter now derives the UI AND the execution plan from the same selection-driven useMemo');
}

section('R5 · Bug 3 · synthetic exact matches are never silent');
{
  // Two distinct ONE-ROW exports: both files synthesize :00 for their only
  // same-day row. v4 tier-1 silently skipped the second — REJECTED. v5
  // routes synthetic-vs-:00 exact matches to AMBIGUOUS.
  const ledgerFromFile1 = [{ id: 'A', title: 'กาแฟ', amount: -65, note: null, occurred_at: '2026-08-06T05:00:00.000Z' }];
  const file2 = assignRowIds([
    { _synthetic: true, title: 'กาแฟ', amount: -65, note: null, occurred_at: '2026-08-06T05:00:00.000Z', scope: 'personal' },
  ]);
  const cls = classifyImportRows(file2, ledgerFromFile1);
  check('(iii) second one-row export → AMBIGUOUS decision, no auto-skip',
    cls.duplicates.length === 0 && cls.ambiguous.length === 1 && cls.toImport.length === 0);

  // Real-source timestamps keep automatic exact-dup (no _synthetic flag).
  const realDup = classifyImportRows(
    [{ title: 'กาแฟ', amount: -65, note: null, occurred_at: '2026-08-06T05:00:00.000Z' }],
    ledgerFromFile1);
  check('real-timestamp exact match still auto-dedups', realDup.duplicates.length === 1);
}

section('R5 · Bug 2b/4 · execution-time ambiguity round-trips to a decision');
{
  // (iv) Ambiguity first discovered at EXECUTION: preview classified against
  // an empty ledger, then a concurrent import lands a :00 row before the
  // authoritative run.
  const row = assignRowIds([
    { _synthetic: true, title: 'กาแฟ', amount: -65, note: null, occurred_at: '2026-08-06T05:00:00.000Z', scope: 'personal' },
  ])[0];
  const previewCls = classifyImportRows([row], []);   // ledger empty at preview
  check('(iv) preview time: row is importable (no ambiguity shown)',
    previewCls.toImport.length === 1);

  const concurrent = [{ id: 'C', title: 'กาแฟ', amount: -65, note: null, occurred_at: '2026-08-06T05:00:00.000Z' }];
  const execCls = classifyImportRows([row], concurrent);   // authoritative re-run
  check('(iv) execution time: the SAME algorithm discovers the ambiguity → decision step reopens',
    execCls.ambiguous.length === 1 && execCls.ambiguous[0].existing.id === 'C');

  const forced = classifyImportRows([{ ...row, _force: true }], concurrent);
  check('(iv) user approves → force bypasses both tiers and the row imports',
    forced.toImport.length === 1 && forced.ambiguous.length === 0);

  // RPC v5 return-shape round-trip: ord maps back to the caller's _rid.
  __config.rpcHandlers.import_transactions = (args) => ({
    data: {
      inserted: 0, dup_skipped: 0,
      ambiguous: [{
        ord: 1,
        incoming: { occurred_at: row.occurred_at, title: row.title, amount: row.amount, note: null },
        existing: { occurred_at: concurrent[0].occurred_at, title: concurrent[0].title, amount: concurrent[0].amount, note: null },
      }],
    },
    error: null,
  });
  const res5 = await importTransactionsBatch({ scope: 'personal', month: '2026-08', wipe: false, dedup: true, rows: [row] });
  check('(iv) RPC v5 ambiguous ord → caller row identity (_rid intact)',
    res5.ambiguous.length === 1 && res5.ambiguous[0].row?._rid === row._rid
    && res5.ambiguous[0].existing?.title === 'กาแฟ');

  __config.rpcHandlers.import_transactions = () => ({ data: 7, error: null });   // v3 shape
  const res3 = await importTransactionsBatch({ scope: 'personal', month: '2026-08', wipe: false, dedup: true, rows: [row] });
  check('older v3 int return still normalised', res3.insertedCount === 7 && res3.ambiguous.length === 0);

  __config.rpcHandlers.import_transactions = () => ({ data: { inserted: 2, dup_skipped: 1, ambiguous_skipped: 1 }, error: null });   // v4 shape
  const res4 = await importTransactionsBatch({ scope: 'personal', month: '2026-08', wipe: false, dedup: true, rows: [row] });
  check('older v4 count-only return still normalised (count surfaces, no round-trip rows)',
    res4.insertedCount === 2 && res4.dupSkipped === 1 && res4.ambiguousSkipped === 1 && res4.ambiguous.length === 0);

  // v6 mapping shape (round 6): inserted becomes [{ord, transaction_id}]
  __config.rpcHandlers.import_transactions = (args) => ({
    data: { v: 6, inserted: [{ ord: row._rid, transaction_id: 'tx-777' }], dup_skipped: 0, ambiguous: [] },
    error: null,
  });
  const res6 = await importTransactionsBatch({ scope: 'personal', month: '2026-08', wipe: false, dedup: true, rows: [row], importKey: 'k-1' });
  check('v6 mapping return: ord → transaction_id, insertedCount derived',
    res6.inserted.length === 1 && res6.inserted[0].ord === row._rid
    && res6.inserted[0].transaction_id === 'tx-777' && res6.insertedCount === 1);

  delete __config.rpcHandlers.import_transactions;
}

// ════════════════════════════════ ROUND 7 ════════════════════════════════

section('R7 · case 6 · sim/RPC v8 wipe semantics (receipts FIRST, no re-wipe)');
{
  const { installImportRpcV8, resetSim, simCalls } = await import('./import-rpc-sim.mjs');
  resetSim();
  __tables.transactions = __tables.transactions.filter(t => bangkokMonth(t.occurred_at) !== '2026-09');
  __tables.import_receipts.length = 0;
  installImportRpcV8();

  // Old data in the target month.
  __tables.transactions.push({ id: 'old-sep', user_id: 'user-1', scope: 'personal',
    title: 'ของเก่า ก.ย.', amount: -999, type: 'food', note: null,
    occurred_at: '2026-09-01T05:00:00.000Z' });

  const rows = [
    { _rid: 901, _synthetic: true, title: 'กาแฟ', amount: -65, note: null, category: 'อาหาร', type: 'food', occurred_at: '2026-09-05T12:00:00+07:00', scope: 'personal' },
    { _rid: 902, _synthetic: true, title: 'ข้าวเที่ยง', amount: -120, note: null, category: 'อาหาร', type: 'food', occurred_at: '2026-09-06T12:00:00+07:00', scope: 'personal' },
  ];
  const sepRows = () => __tables.transactions.filter(t => bangkokMonth(t.occurred_at) === '2026-09');

  // First call: wipe clears the month BEFORE insert; receipts written.
  const r1 = await importTransactionsBatch({ scope: 'personal', month: '2026-09', wipe: true, dedup: true, rows, importKey: 'K-wipe' });
  check('wipe clears the month before insert', sepRows().length === 2
    && !sepRows().some(t => t.title === 'ของเก่า ก.ย.') && r1.insertedCount === 2);
  check('receipts written with the inserts', __tables.import_receipts.length === 2);

  // Retry (same key, same ords) — the v6 bug would re-wipe and leave the
  // month EMPTY; v7 must return the mappings without touching the month.
  const r2 = await importTransactionsBatch({ scope: 'personal', month: '2026-09', wipe: true, dedup: true, rows, importKey: 'K-wipe' });
  check('retry with receipts = recovery READ: month intact, no re-wipe',
    sepRows().length === 2 && r2.insertedCount === 2
    && r2.inserted.every(m => m.transaction_id));
  check('recovered mappings equal the original ords',
    JSON.stringify(r2.inserted.map(m => m.ord).sort()) === JSON.stringify([901, 902]));

  // Non-retry path unchanged: a DIFFERENT group (other ords) under the same
  // key still processes normally (receipts are group-scoped).
  const r3 = await importTransactionsBatch({ scope: 'personal', month: '2026-09', wipe: false, dedup: true,
    rows: [{ _rid: 903, _synthetic: true, title: 'ชาเย็น', amount: -30, note: null, category: 'อาหาร', type: 'food', occurred_at: '2026-09-07T12:00:00+07:00', scope: 'personal' }],
    importKey: 'K-wipe' });
  check('other-group call with same key is NOT short-circuited', r3.insertedCount === 1 && sepRows().length === 3);
  check('sim recorded wipe flags faithfully', simCalls.filter(c => c.wipe).length === 2);
}

// ════════════════════════════════ ROUND 8 ════════════════════════════════

section('R8 · B1 · v8 receipts describe EVERY row → complete response recovery');
{
  const { installImportRpcV8, resetSim } = await import('./import-rpc-sim.mjs');
  resetSim();
  __tables.import_receipts.length = 0;
  __tables.transactions = __tables.transactions.filter(t => bangkokMonth(t.occurred_at) !== '2026-10');

  // A legacy :00 ledger row makes the synthetic incoming row AMBIGUOUS.
  __tables.transactions.push({ id: 'oct-legacy', user_id: 'user-1', scope: 'personal',
    title: 'กาแฟ', amount: -65, note: null, type: 'food',
    occurred_at: '2026-10-05T05:00:00.000Z' });

  const R = (rid, title, amount, iso) => ({ _rid: rid, _synthetic: true, title, amount, note: null,
    category: 'อาหาร', type: 'food', occurred_at: iso, scope: 'personal' });
  const ambRow   = R(801, 'กาแฟ', -65, '2026-10-05T12:00:00+07:00');
  const cleanRow = R(802, 'ข้าวเที่ยง', -120, '2026-10-06T12:00:00+07:00');
  const KEY = 'K-r8-mixed';
  const oct = () => __tables.transactions.filter(t => bangkokMonth(t.occurred_at) === '2026-10');
  const rc  = () => __tables.import_receipts.filter(r => r.import_key === KEY);

  // Call 1 commits (1 insert + 1 execution-time ambiguity) and LOSES its response.
  installImportRpcV8({ postCommitFailPredicate: (c) => c === 1 });
  let lost = null;
  try {
    await importTransactionsBatch({ scope: 'personal', month: '2026-10', wipe: false, dedup: true,
      rows: [ambRow, cleanRow], importKey: KEY });
  } catch (e) { lost = e; }
  check('mixed clean+ambiguous call commits, then the response is lost', !!lost);
  check('a receipt exists for EVERY processed ord, not just the inserted one', rc().length === 2);
  check('the ambiguous receipt persists the {incoming, existing} snapshot',
    rc().find(r => r.ord === 801)?.outcome === 'ambiguous'
    && rc().find(r => r.ord === 801)?.detail?.existing?.title === 'กาแฟ'
    && rc().find(r => r.ord === 801)?.detail?.incoming?.amount === -65);
  check('the inserted receipt carries the exact transaction id',
    rc().find(r => r.ord === 802)?.outcome === 'inserted'
    && !!rc().find(r => r.ord === 802)?.transaction_id);

  // Retry, same key. v7 answered { inserted:[802], ambiguous: [] } — the
  // ambiguous row was never shown again and never imported.
  const rec = await importTransactionsBatch({ scope: 'personal', month: '2026-10', wipe: false, dedup: true,
    rows: [ambRow, cleanRow], importKey: KEY });
  check('retry short-circuits as a recovery read', rec.recovered === true);
  check('reconstruction returns the clean row mapping',
    rec.inserted.length === 1 && rec.inserted[0].ord === 802);
  check('reconstruction returns the AMBIGUOUS row too (the v7 data loss)',
    rec.ambiguous.length === 1 && rec.ambiguous[0].ord === 801
    && rec.ambiguous[0].row?._rid === 801
    && rec.ambiguous[0].existing?.title === 'กาแฟ');
  check('the recovery read wrote nothing', oct().length === 2);

  // The user answers the replayed ambiguity → force REOPENS the receipt.
  const forced = await importTransactionsBatch({ scope: 'personal', month: '2026-10', wipe: false, dedup: true,
    rows: [{ ...ambRow, _force: true }], importKey: KEY });
  check('force on a replayed ambiguity actually imports it',
    forced.inserted.length === 1 && forced.inserted[0].ord === 801 && oct().length === 3);
  check('its receipt flips ambiguous → inserted', rc().find(r => r.ord === 801)?.outcome === 'inserted');

  const again = await importTransactionsBatch({ scope: 'personal', month: '2026-10', wipe: false, dedup: true,
    rows: [{ ...ambRow, _force: true }], importKey: KEY });
  check('a lost response ON the force call replays as a mapping, not a 2nd insert',
    again.recovered === true && again.inserted.length === 1 && oct().length === 3);

  // A duplicate is receipted too, so its count survives a lost response.
  const dupRow = R(803, 'กาแฟ', -65, '2026-10-05T12:00:00+07:00');
  const KEY2 = 'K-r8-dup';
  const d1 = await importTransactionsBatch({ scope: 'personal', month: '2026-10', wipe: false, dedup: true,
    rows: [{ ...dupRow, _synthetic: false }], importKey: KEY2 });
  check('an exact duplicate is skipped and RECEIPTED as dup',
    d1.dupSkipped === 1
    && __tables.import_receipts.find(r => r.import_key === KEY2 && r.ord === 803)?.outcome === 'dup');
  const d2 = await importTransactionsBatch({ scope: 'personal', month: '2026-10', wipe: false, dedup: true,
    rows: [{ ...dupRow, _synthetic: false }], importKey: KEY2 });
  check('the dup count is reconstructed on retry (not silently reset to 0)',
    d2.recovered === true && d2.dupSkipped === 1 && d2.inserted.length === 0);
}

section('R8 · B1 · edge cases — wipe never repeats, probe is read-only, FK nulls the mapping');
{
  const { installImportRpcV8, resetSim } = await import('./import-rpc-sim.mjs');
  resetSim(); installImportRpcV8();
  __tables.import_receipts.length = 0;
  __tables.transactions = __tables.transactions.filter(t => bangkokMonth(t.occurred_at) !== '2026-11');
  __tables.transactions.push({ id: 'nov-old', user_id: 'user-1', scope: 'personal',
    title: 'ของเก่า พ.ย.', amount: -999, note: null, type: 'food',
    occurred_at: '2026-11-02T05:00:00.000Z' });

  const R = (rid, title, amount, iso) => ({ _rid: rid, _synthetic: true, title, amount, note: null,
    category: 'บิล', type: 'bills', occurred_at: iso, scope: 'personal' });
  const a = R(811, 'ค่าน้ำ', -100, '2026-11-05T12:00:00+07:00');
  const b = R(812, 'ค่าไฟ', -200, '2026-11-06T12:00:00+07:00');
  const KEY = 'K-r8-edge';
  const nov = () => __tables.transactions.filter(t => bangkokMonth(t.occurred_at) === '2026-11');

  await importTransactionsBatch({ scope: 'personal', month: '2026-11', wipe: true, dedup: false,
    rows: [a], importKey: KEY });
  check('wipe executes on the first, unreceipted call',
    nov().length === 1 && !nov().some(t => t.title === 'ของเก่า พ.ย.'));

  // Client changed its selection between attempts: 811 receipted, 812 new.
  const w2 = await importTransactionsBatch({ scope: 'personal', month: '2026-11', wipe: true, dedup: false,
    rows: [a, b], importKey: KEY });
  check('edge case: the unreceipted ord is processed with wipe FORCED OFF',
    nov().length === 2 && w2.recovered === true && w2.inserted.length === 2);
  check('the already-committed ord is not re-inserted',
    nov().filter(t => t.title === 'ค่าน้ำ').length === 1);

  const probe = await importTransactionsBatch({ scope: 'personal', month: '2026-11', wipe: true, dedup: false,
    rows: [{ _rid: 811 }, { _rid: 812 }], importKey: KEY, probe: true });
  check('p_probe reconstructs the full response without writing or wiping',
    probe.recovered === true && probe.inserted.length === 2 && nov().length === 2);

  // FK: import_receipts.transaction_id → transactions(id) ON DELETE SET NULL.
  const victim = nov().find(t => t.title === 'ค่าไฟ');
  await supabase.from('transactions').delete().eq('id', victim.id);
  const rec812 = __tables.import_receipts.find(r => r.import_key === KEY && r.ord === 812);
  check('deleting an imported transaction NULLs the receipt mapping (SET NULL, not CASCADE)',
    !!rec812 && rec812.transaction_id === null && rec812.outcome === 'inserted');
  const after = await importTransactionsBatch({ scope: 'personal', month: '2026-11', wipe: true, dedup: false,
    rows: [a, b], importKey: KEY });
  check('a same-key retry does NOT resurrect the deleted row',
    nov().length === 1 && !nov().some(t => t.title === 'ค่าไฟ'));
  check('the retry returns the null mapping instead of a stale id',
    after.inserted.find(m => m.ord === 812)?.transaction_id === null);
  check('finalisation skips a null mapping (no debt link can be forged)',
    after.inserted.filter(m => m.transaction_id).length === 1);
}

section('R8 · B2 · outcome-unknown errors must never clear the recovery state');
{
  check('PostgREST error code is definitive (request reached Postgres, rejected)',
    isDefinitiveServerError({ code: 'PGRST202', message: 'could not find the function' }) === true);
  check('SQLSTATE is definitive', isDefinitiveServerError({ code: '23505', message: 'duplicate key' }) === true);
  check('bare fetch failure is NOT definitive',
    isDefinitiveServerError({ message: 'Failed to fetch' }) === false);
  check('gateway timeout (504) is NOT definitive',
    isDefinitiveServerError({ code: '504', message: 'Gateway Timeout' }) === false);
  check('a coded error whose message says timeout is NOT definitive',
    isDefinitiveServerError({ code: '57014', message: 'canceling statement due to statement timeout' }) === false);
  check('no error object is not definitive', isDefinitiveServerError(null) === false);
}

// ════════════════════════════════ ROUND 10 ═══════════════════════════════

section('R10 · resume fidelity · per-group wipe/dedup are honoured group by group under ONE key');
{
  // The server half of the two mounted cases (X2, X3): a resumed session
  // re-sends every group under the same import key, and the options it sends
  // per group are the ones the run was STARTED with. The client decides
  // (CSVImporter.resumeStoredSession); this proves the RPC obeys, and that a
  // wipe cannot leak from one group to another or repeat on a committed one.
  const { installImportRpcV8, resetSim, simCalls } = await import('./import-rpc-sim.mjs');
  resetSim(); installImportRpcV8();
  __tables.import_receipts.length = 0;
  __tables.transactions = __tables.transactions.filter(t =>
    !['2027-01', '2027-02'].includes(bangkokMonth(t.occurred_at)));

  const KEY = 'K-r10-resume';
  const inMonth = (ym) => __tables.transactions.filter(t => bangkokMonth(t.occurred_at) === ym);
  const stale = (id, ym) => ({ id, user_id: 'user-1', scope: 'personal', title: 'ของเก่า ' + ym,
    amount: -999, note: null, type: 'food', occurred_at: `${ym}-02T12:00:00+07:00` });
  __tables.transactions.push(stale('old-jan', '2027-01'), stale('old-feb', '2027-02'));
  // An exact copy of the February row: dedup=false must import it anyway.
  __tables.transactions.push({ id: 'twin-feb', user_id: 'user-1', scope: 'personal',
    title: 'ค่าหนังสือ', amount: -300, note: null, type: 'shop',
    occurred_at: '2027-02-05T12:00:00+07:00' });

  const jan = { _rid: 1001, title: 'กาแฟ', amount: -65, note: null, category: 'อาหาร', type: 'food',
    occurred_at: '2027-01-05T12:00:00+07:00', scope: 'personal' };
  const feb = { _rid: 1002, title: 'ค่าหนังสือ', amount: -300, note: null, category: 'ช้อปปิ้ง', type: 'shop',
    occurred_at: '2027-02-05T12:00:00+07:00', scope: 'personal' };

  // Original run: group 1 (January) executes with wipe on / dedup off; group 2
  // (February) never runs — its call is the one that failed.
  await importTransactionsBatch({ scope: 'personal', month: '2027-01', wipe: true, dedup: false,
    rows: [jan], importKey: KEY });
  check('group 1 wipes its own month exactly once and inserts',
    inMonth('2027-01').length === 1 && inMonth('2027-01')[0].title === 'กาแฟ');
  check('group 1 did NOT touch group 2\'s month', inMonth('2027-02').length === 2);

  // ── The resume ──────────────────────────────────────────────────────────
  // Group 1 already committed → the client sends wipe:false (its receipts also
  // force it off server-side); group 2 never ran → it sends the PERSISTED
  // wipe:true / dedup:false.
  const r1 = await importTransactionsBatch({ scope: 'personal', month: '2027-01', wipe: false, dedup: false,
    rows: [jan], importKey: KEY });
  check('resuming a committed group is a pure recovery read (no re-wipe, no re-insert)',
    r1.recovered === true && inMonth('2027-01').length === 1
    && r1.inserted.length === 1 && r1.inserted[0].ord === 1001);

  const r2 = await importTransactionsBatch({ scope: 'personal', month: '2027-02', wipe: true, dedup: false,
    rows: [feb], importKey: KEY });
  check('the unstarted group still executes its persisted wipe — exactly once, only its own month',
    inMonth('2027-02').length === 1 && inMonth('2027-02')[0].title === 'ค่าหนังสือ'
    && !inMonth('2027-02').some(t => t.id === 'twin-feb'));
  check('the committed group\'s month is untouched by the second wipe',
    inMonth('2027-01').length === 1 && r2.insertedCount === 1);
  check('every call rode the SAME import key', new Set(simCalls.map(c => c.key)).size === 1);

  // dedup=false, without a wipe, must still import a row the ledger already
  // holds — the whole point of switching "ข้ามรายการซ้ำ" off.
  const KEY2 = 'K-r10-dedup-off';
  const marchTwin = { _rid: 1003, title: 'ค่าหนังสือ', amount: -300, note: null,
    category: 'ช้อปปิ้ง', type: 'shop', occurred_at: '2027-02-05T12:00:00+07:00', scope: 'personal' };
  const offRes = await importTransactionsBatch({ scope: 'personal', month: '2027-02', wipe: false, dedup: false,
    rows: [marchTwin], importKey: KEY2 });
  check('dedup=false imports the exact duplicate the persisted intent asked for',
    offRes.insertedCount === 1 && inMonth('2027-02').length === 2);
  const onRes = await importTransactionsBatch({ scope: 'personal', month: '2027-02', wipe: false, dedup: true,
    rows: [{ ...marchTwin, _rid: 1004 }], importKey: 'K-r10-dedup-on' });
  check('the same row under dedup=true is skipped — so re-deriving the flag really does change the outcome',
    onRes.insertedCount === 0 && onRes.dupSkipped === 1 && inMonth('2027-02').length === 2);
}

// ═══════════════════════════ AUDIT BATCH A (v4.26) ═══════════════════════
// Codex clean-slate review — B1, B6, B10, B11. (B4 and B7 are mounted-only;
// they live in audit/ui/importer.test.jsx.)

/**
 * Freeze `new Date()` / `Date.now()` at one instant while `fn` runs, so a
 * "what day is it" assertion has a single right answer in EVERY device
 * timezone. Everything else about Date (parsing, Date.UTC, toLocaleDateString)
 * is the real implementation.
 */
function withFrozenNow(iso, fn) {
  const RealDate = Date;
  const fixed = new RealDate(iso).getTime();
  class FrozenDate extends RealDate {
    constructor(...args) { if (args.length === 0) super(fixed); else super(...args); }
    static now() { return fixed; }
  }
  globalThis.Date = FrozenDate;
  try { return fn(); } finally { globalThis.Date = RealDate; }
}

section('A · B1 · the never-rewind guard compares INSTANTS, and ties go to the human');
{
  const USER_ANCHOR = '2026-08-12T09:00:00+07:00';   // Arm typed the real balance
  const OLD_IMPORT  = '2026-08-10T23:59:00+07:00';   // a statement from two days earlier

  // The defect: both are 2026-08, so the month compare let the older file win.
  check('same Bangkok month, OLDER import vs a 12 ส.ค. user anchor → REFUSED',
    shouldApplyImportedBalance(USER_ANCHOR, OLD_IMPORT, 'user') === false);
  check('…and it is refused against an IMPORT anchor of the same date too',
    shouldApplyImportedBalance(USER_ANCHOR, OLD_IMPORT, 'import') === false);
  check('…and with provenance unknown (column migration unrun)',
    shouldApplyImportedBalance(USER_ANCHOR, OLD_IMPORT, null) === false);

  // Precedence at an exact tie.
  check('TIE against a user anchor → the human number stands',
    shouldApplyImportedBalance(USER_ANCHOR, USER_ANCHOR, 'user') === false);
  check('TIE against an import anchor → allowed (idempotent overwrite)',
    shouldApplyImportedBalance(USER_ANCHOR, USER_ANCHOR, 'import') === true);
  check('a tie is an INSTANT tie, not a month tie',
    shouldApplyImportedBalance('2026-08-12T09:00:00+07:00', '2026-08-12T02:00:00+00:00', 'user') === false,
    'same instant expressed in two offsets');

  // Strict ordering beats provenance in both directions.
  check('a genuinely NEWER import still applies, even over a user anchor',
    shouldApplyImportedBalance(USER_ANCHOR, '2026-08-12T18:00:00+07:00', 'user') === true);
  check('one minute newer is newer — no month granularity left',
    shouldApplyImportedBalance(USER_ANCHOR, '2026-08-12T09:01:00+07:00', 'user') === true);
  check('one minute older is older, even against an import anchor',
    shouldApplyImportedBalance(USER_ANCHOR, '2026-08-12T08:59:00+07:00', 'import') === false);
  check('never anchored → the import applies', shouldApplyImportedBalance(null, OLD_IMPORT, 'user') === true);
  check('no imported instant → nothing to apply', shouldApplyImportedBalance(USER_ANCHOR, null, 'user') === false);
  check('an unreadable imported instant never overwrites',
    shouldApplyImportedBalance(USER_ANCHOR, 'not-a-date', 'user') === false);

  // End to end through bulkUpsertAccountsByPocket.
  __tables.accounts.push({ id: 'b1-acc', user_id: 'user-1', name: 'KBank หลัก', scope: 'personal',
    balance: 87654, balance_anchor_at: USER_ANCHOR, balance_anchor_source: 'user', is_active: true });
  await bulkUpsertAccountsByPocket([
    { pocket: 'KBank หลัก', scope: 'personal', latestBalance: 12000, latestDate: OLD_IMPORT, txCount: 9 },
  ]);
  let acc = __tables.accounts.find(a => a.id === 'b1-acc');
  check('END TO END: a 10 ส.ค. statement cannot overwrite the 12 ส.ค. user anchor',
    acc.balance === 87654 && acc.balance_anchor_at === USER_ANCHOR && acc.balance_anchor_source === 'user',
    `balance stays ฿${acc.balance}`);

  await bulkUpsertAccountsByPocket([
    { pocket: 'KBank หลัก', scope: 'personal', latestBalance: 12000, latestDate: USER_ANCHOR, txCount: 9 },
  ]);
  acc = __tables.accounts.find(a => a.id === 'b1-acc');
  check('END TO END: an exact tie against the user anchor is refused too',
    acc.balance === 87654 && acc.balance_anchor_source === 'user');

  await bulkUpsertAccountsByPocket([
    { pocket: 'KBank หลัก', scope: 'personal', latestBalance: 55555,
      latestDate: '2026-08-13T20:00:00+07:00', txCount: 9 },
  ]);
  acc = __tables.accounts.find(a => a.id === 'b1-acc');
  check('END TO END: a genuinely newer statement DOES apply and re-stamps provenance',
    acc.balance === 55555 && acc.balance_anchor_at === '2026-08-13T20:00:00+07:00'
    && acc.balance_anchor_source === 'import', `balance now ฿${acc.balance}`);
}

section('A · B4 · a failed effective-balance overlay is never presented as truth');
{
  // acc-b4 is anchored at ฿10,000 on 1 ส.ค. with −2,500 of ledger after it:
  // the CONFIRMED balance is 7,500 and the raw anchor 10,000 is a lie.
  __tables.accounts.push(
    { id: 'acc-b4', user_id: 'user-1', name: 'KBank ออมทรัพย์', scope: 'personal',
      balance: 10000, balance_anchor_at: '2026-08-01T12:00:00+07:00', is_active: true },
    { id: 'acc-b4-plain', user_id: 'user-1', name: 'กระปุก', scope: 'personal',
      balance: 300, is_active: true },
  );
  __tables.transactions.push(
    { id: 'b4t1', user_id: 'user-1', scope: 'personal', account_id: 'acc-b4',
      title: 'ค่าเช่า', amount: -2500, type: 'home', occurred_at: '2026-08-04T12:00:00+07:00' },
  );

  const ok = await loadEffectiveBalances(__tables.accounts.filter(a => a.id.startsWith('acc-b4')));
  check('happy path: the overlay applies and nothing is flagged',
    ok.unconfirmed === false
    && ok.accounts.find(a => a.id === 'acc-b4').balance === 7500
    && !ok.accounts.some(a => a._balance_unconfirmed), `฿${ok.accounts[0].balance}`);

  // Now the ledger read fails — exactly the case Finance.jsx used to swallow.
  __config.opFailures['select:transactions'] = 1;
  const bad = await loadEffectiveBalances(__tables.accounts.filter(a => a.id.startsWith('acc-b4')));
  __config.opFailures['select:transactions'] = 0;

  check('failure is REPORTED, not swallowed', bad.unconfirmed === true);
  const anchored = bad.accounts.find(a => a.id === 'acc-b4');
  check('the anchored account is flagged unconfirmed', anchored._balance_unconfirmed === true);
  check('…and its raw anchor is NOT dressed up as an effective balance',
    anchored.balance === 10000 && anchored._stored_balance === 10000,
    'the number survives for display, but only alongside the flag');
  const plain = bad.accounts.find(a => a.id === 'acc-b4-plain');
  check('an un-anchored account is untouched — nothing about it is in doubt',
    plain._balance_unconfirmed === undefined && plain.balance === 300);

  // Net Worth and the emergency fund are computed from the SAME list, so the
  // flag has to travel with it — the page reads `unconfirmed` once and labels
  // all three surfaces (Finance.jsx:1023-1025 + the account list).
  check('every anchored account in the list carries the flag',
    bad.accounts.filter(a => a.balance_anchor_at).every(a => a._balance_unconfirmed === true));

  // Don't cry wolf: a failure with nothing anchored is not a warning.
  __config.opFailures['select:transactions'] = 1;
  const noAnchor = await loadEffectiveBalances([{ id: 'acc-b4-plain', balance: 300 }]);
  __config.opFailures['select:transactions'] = 0;
  check('no anchored accounts → no overlay was owed → no warning',
    noAnchor.unconfirmed === false && noAnchor.accounts[0].balance === 300);

  __tables.accounts = __tables.accounts.filter(a => !a.id.startsWith('acc-b4'));
  __tables.transactions = __tables.transactions.filter(t => t.id !== 'b4t1');
}

section('A · B6 · debt auto-link can never cross personal/family scope');
{
  // The personal importer maps BOTH scopes out of one Make export while the
  // page hands it personal debts only, so scope has to be a hard gate.
  const personalDebt = { id: 'b6-p', name: 'บัตรเครดิต', creditor: 'KTC BANK',
    monthly_payment: 4500, scope: 'personal' };
  const familyDebt   = { id: 'b6-f', name: 'บัตรเครดิต', creditor: 'KTC BANK',
    monthly_payment: 4500, scope: 'family' };
  const familyTxn = { _rid: 1, title: 'KTC BANK ผ่อนบัตร', amount: -4500, scope: 'family',
    occurred_at: '2026-08-05T12:00:00+07:00' };
  const personalTxn = { _rid: 2, title: 'KTC BANK ผ่อนบัตร', amount: -4500, scope: 'personal',
    occurred_at: '2026-08-05T12:00:00+07:00' };

  check('a FAMILY transaction produces zero suggestions against a personal debt',
    suggestDebtPaymentLinks([familyTxn], [personalDebt]).length === 0);
  check('…and a PERSONAL transaction produces none against a family debt',
    suggestDebtPaymentLinks([personalTxn], [familyDebt]).length === 0);

  const sameScope = suggestDebtPaymentLinks([personalTxn], [personalDebt]);
  check('a matching SAME-scope debt still scores',
    sameScope.length === 1 && sameScope[0].debt.id === 'b6-p' && sameScope[0].confidence >= 80,
    `confidence ${sameScope[0]?.confidence}`);
  const famSame = suggestDebtPaymentLinks([familyTxn], [familyDebt]);
  check('…in the family scope too', famSame.length === 1 && famSame[0].debt.id === 'b6-f');

  // The realistic mixed batch: both debts loaded (the B6 caller fix), both
  // transactions present — each must land on its OWN side.
  const mixed = suggestDebtPaymentLinks([personalTxn, familyTxn], [personalDebt, familyDebt]);
  check('a mixed batch against BOTH scopes pairs each txn with its own scope',
    mixed.length === 2
    && mixed.find(s => s.txn._rid === 2).debt.id === 'b6-p'
    && mixed.find(s => s.txn._rid === 1).debt.id === 'b6-f');

  // 'personal' is the schema default: a row with no scope is personal, and
  // must not be treated as a wildcard that matches everything.
  const noScopeTxn = { _rid: 3, title: 'KTC BANK ผ่อนบัตร', amount: -4500,
    occurred_at: '2026-08-05T12:00:00+07:00' };
  const noScopeDebt = { id: 'b6-n', name: 'บัตรเครดิต', creditor: 'KTC BANK', monthly_payment: 4500 };
  check('a scope-less transaction is personal — it matches a personal debt',
    suggestDebtPaymentLinks([noScopeTxn], [personalDebt]).length === 1);
  check('…and is refused by a family debt',
    suggestDebtPaymentLinks([noScopeTxn], [familyDebt]).length === 0);
  check('a scope-less DEBT is personal too',
    suggestDebtPaymentLinks([personalTxn], [noScopeDebt]).length === 1
    && suggestDebtPaymentLinks([familyTxn], [noScopeDebt]).length === 0);
}

section('A · B10 · "Bangkok today" no longer follows the device timezone');
{
  // 2026-09-01 00:30 Bangkok. The same instant is 2026-08-31 13:30 in New
  // York and 2026-08-31 17:30 UTC — so a device-local implementation answers
  // "August" on two of the three machines the harness runs on.
  const NOW = '2026-08-31T17:30:00.000Z';
  const TZ  = process.env.TZ || '(unset)';

  withFrozenNow(NOW, () => {
    const deviceMonth = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
    check(`device-local month under TZ=${TZ} is what the OLD code returned`,
      deviceMonth === (TZ === 'Asia/Bangkok' ? '2026-09' : '2026-08'), deviceMonth);

    // Finance.jsx:711 + dashboard/MonthNav.jsx:15 — the month the page opens on.
    check('month-nav default = 2026-09 in every device timezone',
      currentYearMonth() === '2026-09', currentYearMonth());

    // Finance.jsx:244 — TxnForm's `occurred_at` default.
    check('form default date = 2026-09-01 in every device timezone',
      todayStr() === '2026-09-01', todayStr());
    check('toLocalYMD reads the Bangkok calendar, not the device one',
      toLocalYMD(new Date(NOW)) === '2026-09-01');

    // getDebtStatus — September is the CURRENT month (day 1, due day 5).
    const debt = { id: 'b10-d1', due_day: 5, monthly_payment: 5000 };
    const sep = getDebtStatus(debt, [], '2026-09');
    check('debt status: current Bangkok month, before the due day → pending',
      sep.status === 'pending', sep.status);
    const aug = getDebtStatus(debt, [], '2026-08');
    check('debt status: the month that just ended, unpaid → overdue',
      aug.status === 'overdue', aug.status);
    const oct = getDebtStatus(debt, [], '2026-10');
    check('debt status: a future month → upcoming', oct.status === 'upcoming', oct.status);
    const paidSep = getDebtStatus(debt, [{ id: 'p1', pay_month: '2026-09-01', amount_paid: 5000 }], '2026-09');
    check('debt status: a recorded payment still wins', paidSep.status === 'paid', paidSep.status);

    // checkRecurringStatus — same three verdicts, same instant.
    const bill = { id: 'b10-r1', name: 'ค่าเน็ต', vendor: 'AIS Fibre', amount: 599, due_day: 5 };
    check('recurring status: current Bangkok month, before the due day → pending',
      checkRecurringStatus(bill, [], '2026-09').status === 'pending');
    check('recurring status: the month that just ended → overdue',
      checkRecurringStatus(bill, [], '2026-08').status === 'overdue');
    check('recurring status: a future month → upcoming',
      checkRecurringStatus(bill, [], '2026-10').status === 'upcoming');
    check('recurring status: a matching paid transaction still wins',
      checkRecurringStatus(bill, [{ id: 't1', title: 'AIS Fibre', amount: -599, type: 'utility',
        occurred_at: '2026-09-01T09:00:00+07:00' }], '2026-09').status === 'paid');
  });

  // The reverse boundary: 23:30 Bangkok on the last day of August is still
  // August, even on a device that has already rolled over (UTC+13 etc.).
  withFrozenNow('2026-08-31T16:30:00.000Z', () => {
    check('23:30 Bangkok on 31 ส.ค. is still 2026-08 everywhere',
      currentYearMonth() === '2026-08' && todayStr() === '2026-08-31');
    check('…and the debt due on the 5th is overdue, not upcoming',
      getDebtStatus({ id: 'x', due_day: 5, monthly_payment: 1 }, [], '2026-08').status === 'overdue');
  });

  // addDaysStr arithmetic must not be nudged by the device zone either.
  check('addDaysStr crosses a month boundary identically in every TZ',
    addDaysStr(1, '2026-08-31') === '2026-09-01' && addDaysStr(-1, '2026-09-01') === '2026-08-31');
  check('addDaysStr crosses a DST boundary in the device zone unharmed',
    addDaysStr(1, '2026-03-08') === '2026-03-09' && addDaysStr(-1, '2026-11-01') === '2026-10-31');
}

section('A · B11 · a row with no readable date is quarantined, never dated to now()');
{
  const CSV =
    'Date,Description,Amount\n' +
    '05/08/2026,ค่ากาแฟ,-65\n' +
    ',ค่าไม่มีวันที่,-120\n' +           // empty date cell
    '\n' +                                // blank line — must not shift numbering
    'ไม่ใช่วันที่,ค่าอ่านไม่ออก,-300\n' + // unparseable
    '31/02/2026,ค่าวันที่ไม่มีจริง,-400\n' + // 31 กุมภา
    '06/08/2026,ค่าเน็ต,-599\n';

  const parsed = parseCSV(CSV);
  check('parseCSV reports the 1-based SOURCE line of every kept row',
    JSON.stringify(parsed.rowLines) === JSON.stringify([2, 3, 5, 6, 7]),
    JSON.stringify(parsed.rowLines));

  const cols = detectKBankColumns(parsed.headers);
  const out = mapRowsWithQuarantine(parsed.rows, cols, 'personal', { rowLines: parsed.rowLines });

  check('only the dated rows are mapped', out.rows.length === 2,
    out.rows.map(r => r.title).join(', '));
  check('three rows are quarantined', out.quarantined.length === 3,
    out.quarantined.map(q => q.title).join(', '));

  // NEVER a fabricated date — the whole point of the blocker.
  const todayYmd = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Bangkok' });
  check('NO mapped row carries today\'s date',
    !out.rows.some(r => String(r.occurred_at).startsWith(todayYmd)),
    `today = ${todayYmd}`);
  check('every mapped occurred_at is a real instant from the FILE',
    out.rows.every(r => !isNaN(new Date(r.occurred_at)))
    && out.rows.map(r => String(r.occurred_at).slice(0, 10)).sort().join(',') === '2026-08-05,2026-08-06');

  // Each quarantined row names its source line and its reason.
  const byLine = Object.fromEntries(out.quarantined.map(q => [q.sourceRow, q]));
  check('the empty date cell is reported at source line 3',
    byLine[3] && /ไม่มีวันที่/.test(byLine[3].reason), byLine[3]?.reason);
  check('the unparseable date is reported at line 5 — blank lines do not shift it',
    byLine[5] && /อ่านวันที่ไม่ออก/.test(byLine[5].reason), byLine[5]?.reason);
  check('31 กุมภาพันธ์ is refused as a date that does not exist',
    byLine[6] && /ไม่มีอยู่จริง/.test(byLine[6].reason), byLine[6]?.reason);
  check('a quarantined row keeps its title and amount so the user can find it',
    byLine[3].title === 'ค่าไม่มีวันที่' && byLine[3].amount === -120);

  // The legacy entry point keeps working and simply never returns the bad rows.
  check('mapRowsToTransactions is unchanged in shape and excludes the quarantine',
    mapRowsToTransactions(parsed.rows, cols, 'personal').length === 2);

  // Make format: the same rule, on the other branch.
  const makeCsv =
    'Date,Time,Cloud Pocket,Type,Txn,CP Bal,Category,Memo,Note\n' +
    '05/08/2026,09:15,Cashbox,Payment,-65,1000,ชา กาแฟ,,ร้านกาแฟ\n' +
    ',10:00,Cashbox,Payment,-500,900,อื่นๆ,,ของบ้าน\n' +
    '05/08/2026,11:00,Cashbox,Move Money,-100,800,อื่นๆ,,ย้ายเงิน\n';
  const mp = parseCSV(makeCsv);
  const mOut = mapRowsWithQuarantine(mp.rows, detectKBankColumns(mp.headers), 'personal',
    { rowLines: mp.rowLines });
  check('Make branch: the dateless row is quarantined too, at its source line',
    mOut.rows.length === 1 && mOut.quarantined.length === 1
    && mOut.quarantined[0].sourceRow === 3, JSON.stringify(mOut.quarantined));
  check('Make branch: a Move Money row is still dropped, not quarantined',
    !mOut.quarantined.some(q => q.title === 'ย้ายเงิน'));

  // A file where every date is readable must produce an EMPTY quarantine —
  // the section only ever appears when there is something to report.
  const clean = parseCSV('Date,Description,Amount\n05/08/2026,ค่ากาแฟ,-65\n');
  check('a clean file quarantines nothing',
    mapRowsWithQuarantine(clean.rows, detectKBankColumns(clean.headers), 'personal',
      { rowLines: clean.rowLines }).quarantined.length === 0);
}

// ════════════════════════════════ BATCH C ═══════════════════════════════════
// B2 · B3 · B5 · B8 — schema identity + atomicity.
// Every check in this block FAILS at e7d53e7 (v4.26) unless marked otherwise.

section('C · B2 · imported accounts have a stable identity (source_key)');
{
  // The key is derived from the SOURCE pocket, normalised the same way the
  // SQL backfill normalises it — never from the editable display name.
  check('pocketSourceKey normalises trim / inner whitespace / case',
    pocketSourceKey('  Cash  Box ') === 'make:pocket:cash box'
    && pocketSourceKey('CASHBOX') === pocketSourceKey('cashbox'),
    pocketSourceKey('  Cash  Box '));
  check('an empty pocket has no identity (never a key of "")',
    pocketSourceKey('') === null && pocketSourceKey(null) === null);
  check('extractAccountsFromMapped carries the key alongside the pocket',
    extractAccountsFromMapped([
      { _pocket: 'ซองเที่ยว', scope: 'personal', _cp_bal: 100, occurred_at: '2026-08-01T10:00:00+07:00' },
    ])[0].sourceKey === 'make:pocket:ซองเที่ยว');

  // (a) an ARCHIVED account is never silently updated while hidden.
  __tables.accounts.push({ id: 'c2-arc', user_id: 'user-1', name: 'พ็อกเก็ตที่เก็บไว้',
    scope: 'personal', balance: 500, is_active: false });
  const arcMap = await bulkUpsertAccountsByPocket([
    { pocket: 'พ็อกเก็ตที่เก็บไว้', scope: 'personal', latestBalance: 9999,
      latestDate: '2026-08-20T10:00:00+07:00', txCount: 3 },
  ]);
  const arc = __tables.accounts.find(a => a.id === 'c2-arc');
  check('an import NEVER leaves a hidden account silently updated',
    !(arc.balance === 9999 && arc.is_active === false),
    `balance=${arc.balance} is_active=${arc.is_active}`);
  check('the archived match is REACTIVATED (chosen policy) …',
    arc.is_active === true);
  check('… and reported by name so the import summary can say so',
    arcMap.reactivated.length === 1 && arcMap.reactivated[0].accountId === 'c2-arc',
    JSON.stringify(arcMap.reactivated));

  // (b) renaming an imported account must not fork it into two.
  const first = await bulkUpsertAccountsByPocket([
    { pocket: 'ซองค่าเดินทาง', scope: 'personal', latestBalance: 100,
      latestDate: '2026-08-01T10:00:00+07:00', txCount: 1 },
  ]);
  const travelId = first.get('ซองค่าเดินทาง');
  const travelRow = __tables.accounts.find(a => a.id === travelId);
  check('a newly imported account is stamped with its source key',
    travelRow.source_key === 'make:pocket:ซองค่าเดินทาง', travelRow.source_key);
  travelRow.name = 'กระเป๋าเดินทาง (เปลี่ยนชื่อเอง)';        // the user renames it in Loop
  const second = await bulkUpsertAccountsByPocket([
    { pocket: 'ซองค่าเดินทาง', scope: 'personal', latestBalance: 250,
      latestDate: '2026-08-05T10:00:00+07:00', txCount: 1 },
  ]);
  check('renaming in Loop does NOT fork the account on the next import',
    second.get('ซองค่าเดินทาง') === travelId
    && __tables.accounts.filter(a => a.source_key === 'make:pocket:ซองค่าเดินทาง').length === 1,
    `${__tables.accounts.filter(a => a.source_key === 'make:pocket:ซองค่าเดินทาง').length} row(s)`);
  check('the renamed account still receives the newer balance',
    travelRow.balance === 250 && travelRow.name === 'กระเป๋าเดินทาง (เปลี่ยนชื่อเอง)',
    `฿${travelRow.balance} · ${travelRow.name}`);

  // Legacy adoption: a pre-column row is claimed ONCE, by unambiguous name.
  __tables.accounts.push({ id: 'c2-legacy', user_id: 'user-1', name: 'ซองเก่าไม่มีคีย์',
    scope: 'personal', balance: 10, is_active: true });
  const adopted = await bulkUpsertAccountsByPocket([
    { pocket: 'ซองเก่าไม่มีคีย์', scope: 'personal', latestBalance: 20,
      latestDate: '2026-08-06T10:00:00+07:00', txCount: 1 },
  ]);
  check('a legacy row is adopted by name ONCE and stamped, not duplicated',
    adopted.get('ซองเก่าไม่มีคีย์') === 'c2-legacy'
    && __tables.accounts.find(a => a.id === 'c2-legacy').source_key === 'make:pocket:ซองเก่าไม่มีคีย์');

  // Ambiguity is never guessed at: two same-named rows in one scope.
  __tables.accounts.push(
    { id: 'c2-dup-a', user_id: 'user-1', name: 'ซองซ้ำ', scope: 'personal', balance: 1, is_active: true },
    { id: 'c2-dup-b', user_id: 'user-1', name: 'ซองซ้ำ', scope: 'personal', balance: 2, is_active: true },
  );
  const dupMap = await bulkUpsertAccountsByPocket([
    { pocket: 'ซองซ้ำ', scope: 'personal', latestBalance: 77,
      latestDate: '2026-08-07T10:00:00+07:00', txCount: 1 },
  ]);
  check('an AMBIGUOUS legacy name is never guessed — neither twin is touched',
    __tables.accounts.find(a => a.id === 'c2-dup-a').balance === 1
    && __tables.accounts.find(a => a.id === 'c2-dup-b').balance === 2
    && !__tables.accounts.find(a => a.id === 'c2-dup-a').source_key
    && !__tables.accounts.find(a => a.id === 'c2-dup-b').source_key);
  check('… a fresh, properly keyed account is created for the pocket instead',
    dupMap.get('ซองซ้ำ') !== 'c2-dup-a' && dupMap.get('ซองซ้ำ') !== 'c2-dup-b'
    && __tables.accounts.find(a => a.id === dupMap.get('ซองซ้ำ')).source_key === 'make:pocket:ซองซ้ำ');

  // A row already owned by ANOTHER pocket is never stolen by a name collision.
  __tables.accounts.push({ id: 'c2-owned', user_id: 'user-1', name: 'ชื่อชนกัน',
    scope: 'personal', balance: 5, is_active: true, source_key: 'make:pocket:ชื่อเดิมของฉัน' });
  const stolen = await bulkUpsertAccountsByPocket([
    { pocket: 'ชื่อชนกัน', scope: 'personal', latestBalance: 42,
      latestDate: '2026-08-08T10:00:00+07:00', txCount: 1 },
  ]);
  check('a row that already carries a DIFFERENT source key is never stolen',
    stolen.get('ชื่อชนกัน') !== 'c2-owned'
    && __tables.accounts.find(a => a.id === 'c2-owned').balance === 5);

  // (c) creation goes through the ON CONFLICT RPC when it is installed.
  const rpcSeen = [];
  __config.rpcHandlers['accounts_upsert_by_source_key'] = (args) => {
    rpcSeen.push(args);
    const out = [];
    for (const r of args.p_rows) {
      const hit = __tables.accounts.find(a =>
        a.user_id === 'user-1' && (a.scope || 'personal') === (r.scope || 'personal')
        && a.source_key === r.source_key);
      if (hit) {
        const was = hit.is_active === false;
        if (was) hit.is_active = true;
        out.push({ source_key: r.source_key, id: hit.id, name: hit.name, scope: hit.scope,
                   is_active: true, was_created: false, was_reactivated: was });
      } else {
        const row = { id: 'rpc-' + (__tables.accounts.length + 1), user_id: 'user-1', ...r };
        __tables.accounts.push(row);
        out.push({ source_key: r.source_key, id: row.id, name: row.name, scope: row.scope,
                   is_active: true, was_created: true, was_reactivated: false });
      }
    }
    return { data: out, error: null };
  };
  const tabA = bulkUpsertAccountsByPocket([
    { pocket: 'ซองแข่งกัน', scope: 'personal', latestBalance: 1,
      latestDate: '2026-08-09T10:00:00+07:00', txCount: 1 },
  ]);
  const tabB = bulkUpsertAccountsByPocket([
    { pocket: 'ซองแข่งกัน', scope: 'personal', latestBalance: 1,
      latestDate: '2026-08-09T10:00:00+07:00', txCount: 1 },
  ]);
  const [ra, rb] = await Promise.all([tabA, tabB]);
  check('creation goes through the atomic ON CONFLICT RPC when installed',
    rpcSeen.length === 2, `${rpcSeen.length} rpc call(s)`);
  check('two tabs importing the same pocket converge on ONE account',
    ra.get('ซองแข่งกัน') === rb.get('ซองแข่งกัน')
    && __tables.accounts.filter(a => a.source_key === 'make:pocket:ซองแข่งกัน').length === 1,
    `${__tables.accounts.filter(a => a.source_key === 'make:pocket:ซองแข่งกัน').length} row(s)`);

  // The RPC also reports a reactivation it performed itself.
  __tables.accounts.push({ id: 'c2-rpc-arc', user_id: 'user-1', name: 'ซองที่ RPC ปลุก',
    scope: 'personal', balance: 3, is_active: false, source_key: 'make:pocket:ซองที่ rpc ปลุก' });
  // Hide it from the client-side index so the RPC is the one that finds it.
  const hidden = __tables.accounts.pop();
  const rpcArc = bulkUpsertAccountsByPocket([
    { pocket: 'ซองที่ RPC ปลุก', scope: 'personal', latestBalance: 3,
      latestDate: '2026-08-10T10:00:00+07:00', txCount: 1 },
  ]);
  __tables.accounts.push(hidden);
  const rpcArcMap = await rpcArc;
  check('a reactivation performed inside the RPC is reported too',
    rpcArcMap.reactivated.some(r => r.accountId === 'c2-rpc-arc') && hidden.is_active === true,
    JSON.stringify(rpcArcMap.reactivated));
  delete __config.rpcHandlers['accounts_upsert_by_source_key'];

  // MIGRATION UNRUN: the column is absent → the old name behaviour, no crash.
  __config.missingColumns = { accounts: ['source_key'] };
  const legacyMap = await bulkUpsertAccountsByPocket([
    { pocket: 'ซองก่อน migration', scope: 'personal', latestBalance: 60,
      latestDate: '2026-08-11T10:00:00+07:00', txCount: 1 },
  ]);
  const preMig = __tables.accounts.find(a => a.id === legacyMap.get('ซองก่อน migration'));
  check('source_key column missing → account still created, no source_key written',
    !!preMig && !('source_key' in preMig), JSON.stringify(Object.keys(preMig || {})));
  const preMigAgain = await bulkUpsertAccountsByPocket([
    { pocket: 'ซองก่อน migration', scope: 'personal', latestBalance: 90,
      latestDate: '2026-08-12T10:00:00+07:00', txCount: 1 },
  ]);
  check('… and the pre-migration import still matches by name (old behaviour)',
    preMigAgain.get('ซองก่อน migration') === preMig.id && preMig.balance === 90);
  __config.missingColumns = {};
}

section('C · B3 · reassign + archive is one transaction, or nothing');
{
  const seedPair = (tag) => {
    __tables.accounts.push(
      { id: `${tag}-src`, user_id: 'user-1', name: `ต้นทาง ${tag}`, scope: 'personal', balance: 0, is_active: true },
      { id: `${tag}-dst`, user_id: 'user-1', name: `ปลายทาง ${tag}`, scope: 'personal', balance: 0, is_active: true },
    );
    __tables.transactions.push(
      { id: `${tag}-t1`, user_id: 'user-1', scope: 'personal', account_id: `${tag}-src`,
        title: 'ค่ากาแฟ', amount: -65, type: 'food', occurred_at: '2026-08-01T10:00:00+07:00' },
      { id: `${tag}-t2`, user_id: 'user-1', scope: 'personal', account_id: `${tag}-src`,
        title: 'ค่าเน็ต', amount: -599, type: 'bills', occurred_at: '2026-08-02T10:00:00+07:00' },
    );
  };
  const stateOf = (tag) => ({
    srcActive: __tables.accounts.find(a => a.id === `${tag}-src`).is_active,
    dstActive: __tables.accounts.find(a => a.id === `${tag}-dst`).is_active,
    links: __tables.transactions.filter(t => t.id.startsWith(`${tag}-t`)).map(t => t.account_id),
  });

  // ── The RPC installed: one call, one transaction. ────────────────────────
  seedPair('b3ok');
  let rpcArgs = null;
  __config.rpcHandlers['reassign_and_archive_account'] = (args) => {
    // Mirrors migration_add_account_reassign_rpc.sql: p_to NULL ⇒ archive
    // only, no transaction touched; both effects in one unit either way.
    rpcArgs = args;
    let moved = 0;
    if (args.p_to != null) {
      const rows = __tables.transactions.filter(t => t.account_id === args.p_from);
      rows.forEach(t => { t.account_id = args.p_to; });
      moved = rows.length;
    }
    __tables.accounts.find(a => a.id === args.p_from).is_active = false;
    return { data: moved, error: null };
  };
  const okRes = await reassignAndArchiveAccount('b3ok-src', 'b3ok-dst');
  const ok = stateOf('b3ok');
  check('the RPC path moves every link and archives in ONE call',
    okRes.atomic === true && okRes.moved === 2
    && ok.srcActive === false && ok.links.every(l => l === 'b3ok-dst'),
    JSON.stringify({ ...okRes, ...ok }));
  check('both account ids are handed to the server, not resolved client-side',
    rpcArgs.p_from === 'b3ok-src' && rpcArgs.p_to === 'b3ok-dst');

  // "archive without moving anything" — p_to is NULL, no transaction touched.
  seedPair('b3keep');
  const keepRes = await reassignAndArchiveAccount('b3keep-src', null);
  const keep = stateOf('b3keep');
  check('archiving WITHOUT a target moves nothing and still archives',
    keepRes.moved === 0 && keep.srcActive === false
    && keep.links.every(l => l === 'b3keep-src'), JSON.stringify(keep));

  // ── The RPC raising: the whole unit rolls back. ──────────────────────────
  seedPair('b3fail');
  __config.rpcHandlers['reassign_and_archive_account'] =
    () => ({ data: null, error: { code: 'P0001', message: 'บัญชีปลายทางไม่ใช่ของผู้ใช้นี้' } });
  let raised = null;
  try { await reassignAndArchiveAccount('b3fail-src', 'b3fail-dst'); }
  catch (e) { raised = e.message; }
  const failed = stateOf('b3fail');
  check('a failure inside the transaction leaves BOTH accounts unchanged …',
    failed.srcActive === true && failed.dstActive === true, JSON.stringify(failed));
  check('… and every transaction link unchanged',
    failed.links.every(l => l === 'b3fail-src'), JSON.stringify(failed.links));
  check('the error reaches the user rather than being swallowed',
    raised === 'บัญชีปลายทางไม่ใช่ของผู้ใช้นี้', String(raised));
  delete __config.rpcHandlers['reassign_and_archive_account'];

  // ── The RPC absent: the documented non-atomic fallback still works. ──────
  seedPair('b3old');
  const oldRes = await reassignAndArchiveAccount('b3old-src', 'b3old-dst');
  const old = stateOf('b3old');
  check('RPC missing → the two-step fallback still completes the job',
    oldRes.atomic === false && old.srcActive === false
    && old.links.every(l => l === 'b3old-dst'), JSON.stringify({ ...oldRes, ...old }));

  // …and the caveat, demonstrated: the fallback CAN split. This is the state
  // the RPC exists to prevent — asserted so the regression is visible if the
  // client ever stops preferring the RPC.
  seedPair('b3split');
  __config.opFailures = { 'update:accounts': 1 };
  let splitThrew = false;
  try { await reassignAndArchiveAccount('b3split-src', 'b3split-dst'); }
  catch { splitThrew = true; }
  __config.opFailures = {};
  const split = stateOf('b3split');
  check('CAVEAT (fallback only): a mid-sequence failure DOES split — hence the RPC',
    splitThrew && split.srcActive === true && split.links.every(l => l === 'b3split-dst'),
    JSON.stringify(split));
}

section('C · B5 · a scope transfer is one pair, not two loose rows');
{
  const legs = await createScopeTransfer({
    from_scope: 'personal', to_scope: 'family', amount: 8000,
    occurred_at: '2026-09-02T12:00:00+07:00', title: 'งบครอบครัว ก.ย.', note: 'รอบเดือน',
    from_account_id: 'acct-out', to_account_id: 'acct-in',
  });
  const gid = legs[0].transfer_group_id;
  check('both legs carry the SAME transfer_group_id',
    !!gid && legs[1].transfer_group_id === gid, String(gid));
  check('each leg records its own account endpoint',
    legs.find(l => l.amount < 0).account_id === 'acct-out'
    && legs.find(l => l.amount > 0).account_id === 'acct-in');
  check('the pair is written by ONE insert statement — mirrored and opposite',
    legs.length === 2 && legs[0].amount === -8000 && legs[1].amount === 8000
    && legs[0].scope === 'personal' && legs[1].scope === 'family');

  // Editing the shared fields moves BOTH legs.
  const outLeg = legs.find(l => l.amount < 0);
  await updateTransactionMaybePaired(outLeg, {
    title: 'งบครอบครัว ก.ย. (แก้ชื่อ)', occurred_at: '2026-09-05T12:00:00+07:00', note: 'แก้โน้ต',
  });
  const bothAfterEdit = __tables.transactions.filter(t => t.transfer_group_id === gid);
  check('editing title / date / note applies to BOTH legs',
    bothAfterEdit.length === 2
    && bothAfterEdit.every(l => l.title === 'งบครอบครัว ก.ย. (แก้ชื่อ)'
      && l.occurred_at === '2026-09-05T12:00:00+07:00' && l.note === 'แก้โน้ต'),
    JSON.stringify(bothAfterEdit.map(l => l.title)));
  check('the amounts stay locked and mirrored through the edit',
    bothAfterEdit.map(l => Number(l.amount)).sort((a, b) => a - b).join(',') === '-8000,8000');

  // A patch that is NOT purely pair-level stays on the single row it targets.
  await updateTransactionMaybePaired(outLeg, { account_id: 'acct-other' });
  const stillPaired = __tables.transactions.filter(t => t.transfer_group_id === gid);
  check('a non-pair field (account endpoint) edits only the leg it belongs to',
    stillPaired.find(l => l.amount < 0).account_id === 'acct-other'
    && stillPaired.find(l => l.amount > 0).account_id === 'acct-in');

  // Deleting either visible leg deletes the pair.
  const inLeg = stillPaired.find(l => l.amount > 0);
  const delRes = await deleteTransactionWithPair(inLeg);
  check('deleting EITHER leg removes the pair in one statement',
    delRes.deleted === 2 && delRes.orphan === false
    && __tables.transactions.filter(t => t.transfer_group_id === gid).length === 0,
    JSON.stringify(delRes));

  // Legacy ungrouped legs keep working, and say what they could not do.
  __tables.transactions.push(
    { id: 'legacy-out', user_id: 'user-1', scope: 'personal', title: 'โอนไปครอบครัว',
      amount: -5000, category: 'โอนภายใน', type: 'transfer', occurred_at: '2026-05-02T12:00:00+07:00' },
    { id: 'legacy-in', user_id: 'user-1', scope: 'family', title: 'รับจากส่วนตัว',
      amount: 5000, category: 'โอนภายใน', type: 'transfer', occurred_at: '2026-05-02T12:00:00+07:00' },
  );
  const legacyRes = await deleteTransactionWithPair(
    __tables.transactions.find(t => t.id === 'legacy-out'));
  check('an UNGROUPED legacy leg still deletes …',
    legacyRes.deleted === 1 && !__tables.transactions.some(t => t.id === 'legacy-out'));
  check('… and reports orphan:true so the UI can warn about the counterpart',
    legacyRes.orphan === true && __tables.transactions.some(t => t.id === 'legacy-in'));

  // A plain (non-transfer) row is never described as an orphaned leg.
  __tables.transactions.push({ id: 'plain-1', user_id: 'user-1', scope: 'personal',
    title: 'ค่ากาแฟ', amount: -65, type: 'food', occurred_at: '2026-05-03T12:00:00+07:00' });
  const plainRes = await deleteTransactionWithPair(
    __tables.transactions.find(t => t.id === 'plain-1'));
  check('an ordinary row deletes alone and is never called an orphan leg',
    plainRes.deleted === 1 && plainRes.orphan === false);

  // MIGRATION UNRUN: the column is absent → today's un-paired behaviour.
  __config.missingColumns = { transactions: ['transfer_group_id'] };
  const bare = await createScopeTransfer({
    from_scope: 'personal', to_scope: 'family', amount: 1200,
    occurred_at: '2026-09-10T12:00:00+07:00', title: 'ก่อน migration', note: null,
  });
  check('transfer_group_id column missing → both legs still land, un-paired',
    bare.length === 2 && bare.every(l => !('transfer_group_id' in l))
    && bare[0].amount === -1200 && bare[1].amount === 1200,
    JSON.stringify(bare.map(l => l.amount)));
  const bareEdit = await updateTransactionMaybePaired(bare[0], { title: 'แก้ก่อน migration' });
  check('… and an edit before the migration still updates its own row',
    bareEdit.title === 'แก้ก่อน migration');
  __config.missingColumns = {};
}

section('C · B8 · a debt has a life: upcoming → active → completed');
{
  // Everything is anchored to the CURRENT Bangkok month, so these hold on any
  // day the harness runs.
  const THIS = currentYearMonth();
  const NEXT = nextMonth(THIS);
  const PREV = previousMonth(THIS);

  const future = {
    id: 'c8-future', name: 'สินเชื่อที่ยังไม่เริ่ม', monthly_payment: 5000, due_day: 5,
    start_date: `${NEXT}-01`, total_months: 12, months_paid: 0, scope: 'personal',
  };
  const done = {   // the owner's โมนี่ shape: 12 of 12 instalments paid
    id: 'c8-done', name: 'โมนี่ 1', monthly_payment: 19253, due_day: 5,
    start_date: '2025-08-01', end_date: '2026-07-05',
    total_months: 12, months_paid: 12, remaining_balance: 0, scope: 'personal',
  };
  const running = {
    id: 'c8-run', name: 'ผ่อนรถ', monthly_payment: 8000, due_day: 5,
    start_date: `${PREV}-01`, total_months: 24, months_paid: 1, scope: 'personal',
  };

  check('lifecycle: before start_date → upcoming',
    debtLifecycle(future, THIS) === 'upcoming' && debtLifecycle(future, NEXT) === 'active');
  check('lifecycle: every instalment paid → completed, in every month',
    debtLifecycle(done, THIS) === 'completed' && debtLifecycle(done, NEXT) === 'completed');
  check('lifecycle: a debt with no dates at all is still simply active',
    debtLifecycle({ monthly_payment: 100 }, THIS) === 'active');
  check('lifecycle: past end_date with nothing outstanding → completed',
    debtLifecycle({ monthly_payment: 100, end_date: `${PREV}-28`, remaining_balance: 0 }, THIS) === 'completed');
  check('lifecycle: past end_date but money STILL outstanding stays active',
    debtLifecycle({ monthly_payment: 100, end_date: `${PREV}-28`, remaining_balance: 4200 }, THIS) === 'active');

  check('a debt that has not started is never overdue',
    getDebtStatus(future, [], THIS).status === 'upcoming',
    getDebtStatus(future, [], THIS).status);
  check('… and it names the date it actually starts',
    getDebtStatus(future, [], THIS).startDate === `${NEXT}-01`);
  check('a fully paid loan (12/12) reads as completed, not overdue',
    getDebtStatus(done, [], THIS).status === 'completed',
    getDebtStatus(done, [], THIS).status);
  check('… and it stays completed next month, and the month after',
    getDebtStatus(done, [], NEXT).status === 'completed'
    && getDebtStatus(done, [], nextMonth(NEXT)).status === 'completed');
  check('a real payment record still wins over everything else',
    getDebtStatus(done, [{ debt_id: 'c8-done', pay_month: `${THIS}-01`, amount_paid: 19253, paid_at: `${THIS}-05` }], THIS)
      .status === 'paid');

  const sum = summarizeDebts([done, future, running], [], THIS);
  check('a completed loan is out of the monthly burden — only the live one counts',
    sum.monthlyBurden === 8000 + 5000, `฿${sum.monthlyBurden}`);
  check('a completed loan is out of the overdue total and its count',
    sum.overdue === 8000 && sum.overdueCount === 1, `฿${sum.overdue} / ${sum.overdueCount}`);
  check('the summary reports the completed and not-yet-started counts',
    sum.completedCount === 1 && sum.upcomingCount === 1,
    `${sum.completedCount} / ${sum.upcomingCount}`);
  check('a stale remaining_balance on a completed loan cannot inflate คงเหลือรวม',
    summarizeDebts([{ ...done, remaining_balance: 19253 }], [], THIS).totalRemaining === 0);

  const fc = forecastDebts([future], 14);
  check('the forecast does not bill a debt before its start_date',
    fc[0].outflow === 0 && fc[0].activeCount === 0 && fc[1].outflow === 5000,
    JSON.stringify(fc.slice(0, 3).map(f => f.outflow)));
  check('… and it bills exactly its 12 instalments, counted from the START',
    fc.filter(f => f.outflow > 0).length === 12 && fc[13].outflow === 0,
    `${fc.filter(f => f.outflow > 0).length} billed months`);
  check('the forecast never bills a completed loan',
    forecastDebts([done], 6).every(f => f.outflow === 0));
  check('an ordinary running debt forecasts exactly as before',
    forecastDebts([running], 24).filter(f => f.outflow > 0).length === 23,
    `${forecastDebts([running], 24).filter(f => f.outflow > 0).length} months`);

  const cash = forecastCashFlow({ monthlyIncome: 100000, recurring: [], debts: [done, running], avgVariableExpense: 0 });
  check('the cash-flow forecast drops the completed loan from "ตอนนี้" too',
    cash.debtPaymentNow === 8000, `฿${cash.debtPaymentNow}`);
  check('a completed loan is not part of the payoff plan',
    simulatePayoff([done, running], 'snowball', 0).debts.length === 1);

  // ── Editing the terms recomputes remaining_balance in one write ──────────
  __tables.debts.push({ id: 'c8-edit', user_id: 'user-1', name: 'แก้เงื่อนไข',
    monthly_payment: 1000, total_months: 12, months_paid: 2, remaining_balance: 10000,
    scope: 'personal', is_active: true });
  await updateDebt('c8-edit', { total_months: 24, months_paid: 3, monthly_payment: 1000 });
  const edited = __tables.debts.find(d => d.id === 'c8-edit');
  check('RPC missing → the single guarded UPDATE still recomputes the balance',
    Number(edited.remaining_balance) === 21000, `฿${edited.remaining_balance}`);
  await updateDebt('c8-edit', { notes: 'แค่แก้โน้ต' });
  check('a patch that does not touch the terms leaves the balance alone',
    Number(__tables.debts.find(d => d.id === 'c8-edit').remaining_balance) === 21000);
  await updateDebt('c8-edit', { total_months: null, months_paid: 3, monthly_payment: 1000 });
  check('clearing total_months makes the balance honestly unknown (null)',
    __tables.debts.find(d => d.id === 'c8-edit').remaining_balance === null);

  // …and through the RPC when it is installed.
  __config.rpcHandlers['debt_update_terms'] = (args) => {
    const row = __tables.debts.find(d => d.id === args.p_id);
    Object.assign(row, args.p_patch);
    row.remaining_balance = row.total_months == null ? null
      : Math.max(0, (Number(row.total_months) - Number(row.months_paid || 0)) * Number(row.monthly_payment || 0));
    row.updated_at = 'rpc';
    return { data: [row], error: null };
  };
  const viaRpc = await updateDebt('c8-edit', { total_months: 10, months_paid: 4, monthly_payment: 500 });
  check('RPC installed → the recompute happens server-side, in one transaction',
    viaRpc.updated_at === 'rpc' && Number(viaRpc.remaining_balance) === 3000,
    `฿${viaRpc.remaining_balance}`);

  // Archiving a finished loan takes it out of the tracker, history intact.
  __tables.debts.push({ id: 'c8-arch', user_id: 'user-1', name: 'โมนี่ 2',
    monthly_payment: 19253, total_months: 12, months_paid: 12,
    scope: 'personal', is_active: true });
  await archiveDebt('c8-arch');
  check('a completed loan can be filed away (is_active false), history intact',
    __tables.debts.find(d => d.id === 'c8-arch').is_active === false);
  delete __config.rpcHandlers['debt_update_terms'];
}

console.log(`\n──── RESULT: ${pass} passed, ${fail} failed ────`);
process.exit(fail ? 1 : 0);
