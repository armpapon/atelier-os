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
  suggestDebtPaymentLinks, detectRecurringFromTransactions, checkRecurringStatus,
} from '../src/lib/api/finance.js';
import { getFinancePulse } from '../src/lib/api/lifeOS.js';
import { toLocalYMD } from '../src/lib/dates.js';
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
  check('toLocalYMD at 05:00 Bangkok = next local day (TZ=' + process.env.TZ + ')',
    process.env.TZ !== 'Asia/Bangkok' || toLocalYMD(at5amBkk) === '2026-08-11');
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

console.log(`\n──── RESULT: ${pass} passed, ${fail} failed ────`);
process.exit(fail ? 1 : 0);
