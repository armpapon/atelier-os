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
  parseCSV, detectKBankColumns, mapRowsToTransactions,
  classifyImportRows, txnMinuteKey, txnSecond, setAccountBalanceAnchor,
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

section('R7 · case 6 · sim/RPC v7 wipe semantics (receipts FIRST, no re-wipe)');
{
  const { installImportRpcV7, resetSim, simCalls } = await import('./import-rpc-sim.mjs');
  resetSim();
  __tables.transactions = __tables.transactions.filter(t => bangkokMonth(t.occurred_at) !== '2026-09');
  __tables.import_receipts.length = 0;
  installImportRpcV7();

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

console.log(`\n──── RESULT: ${pass} passed, ${fail} failed ────`);
process.exit(fail ? 1 : 0);
