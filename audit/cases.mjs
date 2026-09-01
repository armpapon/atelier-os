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
import {
  TAX_BRACKETS, EXPENSE_CAP, RETIREMENT_COMBINED_CAP, DEDUCTIONS,
  SSO_WAGE_CEILING, SSO_RATE, WHT_TOLERANCE,
  taxFromNetIncome, marginalRate, computeTax, deductionHeadroom,
  planningSummary, baht, toBE, toCE, taxYearOf,
  storedUnit, defaultPeriod, periodFor, toStored, toDisplay, annualOf,
  periodDerivation, ssoSettings, deriveSSO, ssoLegalMax, resolveSSO,
  sanityWarnings, derivations, fmtNumber, pct,
  SPOUSE_ALLOWANCE, CHILD_ALLOWANCE, CHILD_ALLOWANCE_SECOND,
  CHILD_SECOND_BORN_FROM_BE, PARENT_ALLOWANCE, PARENT_MAX_COUNT,
  PARENT_ELIGIBILITY, CHILD_SECOND_NEEDS_TWO, RESTORE_LABEL,
  STATUTORY_KEYS, COUNT_KEYS, DEDUCTION_BY_KEY,
  statutoryAmount, statutoryHint, resolveStatutory,
  childrenAllowance, childrenDerivation, maxQualifyingChildren,
  parentsAllowance, parentsDerivation,
  countCeiling, countDerivation, countBlockedNote, countPatch, resolveCounts,
} from '../src/lib/taxTH.js';
import {
  listProfiles, listYears, createProfile, updateProfile, deleteProfile,
  copyYear, isTableMissing, SQL_NOT_RUN_MESSAGE,
} from '../src/lib/api/tax.js';
import { toLocalYMD, todayStr, addDaysStr } from '../src/lib/dates.js';
import {
  utilizationPct, waiverStatus, nextCycleDates, nextDayOfMonth,
  monthlyInterestEstimate, cardBalance, summarizeCards, sortCards,
  feeProfileRows, installmentRows, cycleDateLabel, daysInMonth, safeHttpUrl, safeFaceUrl,
  lineOf, lineLimit, lineBalance, lineUtilizationPct, isSharedLine, cardTips,
  canShareInto, lineSharersOf,
  HEALTHY_UTILIZATION, DEFAULT_INTEREST_RATE,
} from '../src/lib/creditCards.js';
import {
  listCreditCards, createCreditCard, updateCreditCard, deleteCreditCard,
  isTableMissing as isCardTableMissing, SQL_NOT_RUN_MESSAGE as CARD_SQL_NOT_RUN,
} from '../src/lib/api/creditCards.js';
import {
  cashflowWindow, cashflowSeries, savingsRate, pctDelta, monthReadout,
  resolveSelection, filterToMonths, compactBaht, chartGeometry, barPath,
  averageMonthlyNet,
} from '../src/lib/cashflow.js';
import {
  normalizeCategory, categoryKey, sortNewestFirst, sumExpense, leakDateLabel,
  groupExpensesByCategory, buildLeakInsights, isRecurringAlive, resolveYearMonth,
  CREEP_MIN_DELTA, FREQUENT_MIN_COUNT, OTHER_CATEGORY, MAX_RECURRING_ROWS,
} from '../src/lib/moneyLeaks.js';
import {
  monthlyInterest, principalOf, totalInterestBurn, annualInterestBurn,
  payoffPriority, rolloverOpportunities, creditCardDeadline, dataGaps,
} from '../src/lib/debtAdvice.js';
import {
  planDebts, simulatePayoff as simulatePayoffMP, comparePayoff,
  paymentBelowInterest, MONTH_CAP,
} from '../src/lib/moneyPlanner.js';
import { __tables, __stats, __config, supabase } from './mock-supabase.mjs';

// ── Palette acceptance (v4.53 · A10 finding 4) ────────────────────────────
// Pure colour maths + a literal read of src/styles.css. No DOM, no network.
import {
  monoSites, monoSitesIn, monoOnWords, wordsAmong, styleFacts, cssStyleFacts,
  interactiveComponentsIn,
  emojiSites, emojiSitesIn,
  unnamedIconControls, unnamedIconControlsIn, interactiveComponents,
} from './style-scan.mjs';
import { readFileSync as paletteRead } from 'node:fs';
import { join as paletteJoin, basename as paletteBase, relative as paletteRelative } from 'node:path';
const paletteRel = (p) => paletteRelative(paletteJoin(__LOOP_ROOT__, 'src'), p).split(paletteSep).join('/');
import { sep as paletteSep } from 'node:path';
import { readdirSync as paletteReaddir } from 'node:fs';
import {
  contrast as paletteContrast,
  separation as paletteSeparation,
  composite as paletteComposite,
  hexToRgb as paletteRgb,
  selfTest as colorSelfTest,
} from './colorcheck.mjs';
import {
  ACCENT_OPTIONS, DEFAULT_ACCENT, ACCENT_VAR_NAMES, THEMES,
  accentOption, accentVars, isKnownAccent, variantsFor, rgbChannels,
} from '../src/lib/accents.js';

/** Every source file under src/, recursively. */
function paletteSrcFiles(dir) {
  const out = [];
  for (const e of paletteReaddir(dir, { withFileTypes: true })) {
    const p = paletteJoin(dir, e.name);
    if (e.isDirectory()) out.push(...paletteSrcFiles(p));
    else if (/\.(jsx?|css|html)$/.test(e.name)) out.push(p);
  }
  return out;
}

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
  // 2026-09-01: this used to build `ym` from the DEVICE clock
  //   const now = new Date();
  //   const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  // …while getFinancePulse() filters by BANGKOK month bounds. The two agree for
  // most of the year, so it looked fine — until 2026-09-01, when 00:00–07:00
  // Bangkok is still the previous month in UTC and New York. The fixture then
  // wrote August rows while the query asked for September and every figure read
  // 0. A fixture must take its dates from the SAME clock as the code under
  // test; currentYearMonth() is that clock.
  const ym = currentYearMonth();
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

section('2026-09-01 harness hardening · fixture ต้องใช้นาฬิกาเดียวกับโค้ด');
{
  // Why this section exists: on 2026-09-01 three cases failed under TZ=UTC and
  // TZ=America/New_York and nothing in the suite explained why. The cause was
  // never the app — it was a fixture that built its month from the DEVICE
  // clock while the code under test filtered by the BANGKOK calendar. Between
  // 00:00 and 07:00 Bangkok on the FIRST day of a month those are different
  // months, so the harness's own "runs in any timezone" claim was false for
  // that seven-hour window once a month, not every day.
  //
  // These cases are the guard. They are deterministic in every zone because
  // they pin the instant rather than reading the wall clock.

  const TZ = process.env.TZ || '(unset)';
  const bangkokNow = new Intl.DateTimeFormat('en-CA',
    { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit' }).format(new Date());

  check('currentYearMonth() คือเดือนตามปฏิทินกรุงเทพจริง (ไม่ใช่ของเครื่อง)',
    currentYearMonth() === bangkokNow, `${currentYearMonth()} · TZ=${TZ}`);

  // The window, pinned: 2026-09-01 00:30 Bangkok is still
  // 2026-08-31 in UTC and New York. Whatever zone this process runs in, the
  // helper the fixtures must use has to answer September.
  withFrozenNow('2026-08-31T17:30:00.000Z', () => {
    const deviceYm = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
    check('ณ 00:30 กรุงเทพของวันที่ 1 — currentYearMonth() ตอบเดือนใหม่เสมอ',
      currentYearMonth() === '2026-09', currentYearMonth());
    check('… และ todayStr() ตอบวันที่ตามกรุงเทพ ไม่ใช่ของเครื่อง',
      todayStr() === '2026-09-01', todayStr());
    // Not an assertion about the device — a record of WHY the rule exists.
    // Under UTC/NY this prints a different month; that gap is the whole bug.
    check(`นาฬิกาเครื่อง (TZ=${TZ}) ให้ ${deviceYm} — fixture ที่ใช้ค่านี้จะพังเมื่อไม่ตรงกับกรุงเทพ`,
      /^\d{4}-\d{2}$/.test(deviceYm), `device ${deviceYm} vs bangkok 2026-09`);
  });

  // Month arithmetic must not drift across a year boundary either.
  check('nextMonth / previousMonth ข้ามปีได้ถูกต้อง',
    nextMonth('2026-12') === '2027-01' && previousMonth('2027-01') === '2026-12',
    `${nextMonth('2026-12')} · ${previousMonth('2027-01')}`);
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
    // The expectation must come from the EFFECTIVE zone, not the TZ env var:
    // with TZ unset Node falls back to the host zone, and on a machine that
    // is itself set to Asia/Bangkok the device month IS 2026-09 — guessing
    // '2026-08' for every non-Bangkok TZ string made this the harness's one
    // host-dependent check.
    const effectiveTZ = process.env.TZ || Intl.DateTimeFormat().resolvedOptions().timeZone;
    const expectedDeviceMonth = new Intl.DateTimeFormat('en-CA',
      { timeZone: effectiveTZ, year: 'numeric', month: '2-digit' }).format(new Date(NOW));
    check(`device-local month under TZ=${TZ} is what the OLD code returned`,
      deviceMonth === expectedDeviceMonth, deviceMonth);

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
  // 2026-09-01: this used to read
  //   check('a completed loan is out of the overdue total and its count',
  //     sum.overdue === 8000 && sum.overdueCount === 1);
  // against the REAL clock. `running` is due on the 5th, so "overdue" only
  // became true from the 6th onward — the case passed for 25 days a month and
  // failed for 5. It failed on 2026-09-01 for the RIGHT reason: nothing due on
  // the 5th is overdue on the 1st. The app was correct; the fixture was
  // asserting the calendar. Both sides of the boundary are now pinned with
  // withFrozenNow, so this holds on every day and in every timezone.
  const SEPT = '2026-09';
  const pinnedDone   = { ...done };                                  // ends 2026-07-05, 12/12 → completed
  const pinnedFuture = { ...future, start_date: '2026-10-01' };      // starts next month → upcoming
  const pinnedRun    = { ...running, start_date: '2026-08-01' };     // live, ฿8,000 due on the 5th

  // 10:00 Bangkok on the 1st — before the due day.
  withFrozenNow('2026-09-01T03:00:00.000Z', () => {
    const s1 = summarizeDebts([pinnedDone, pinnedFuture, pinnedRun], [], SEPT);
    check('วันที่ 1 ของเดือน: ยังไม่ถึงกำหนดชำระ (วันที่ 5) → ไม่มีอะไร overdue',
      s1.overdue === 0 && s1.overdueCount === 0, `฿${s1.overdue} / ${s1.overdueCount}`);
    check('… และก้อนที่ยังวิ่งอยู่ถูกนับเป็น pending ไม่ใช่ overdue',
      getDebtStatus(pinnedRun, [], SEPT).status === 'pending',
      getDebtStatus(pinnedRun, [], SEPT).status);
  });

  // The exact boundary: due day itself is not late, the day after is.
  withFrozenNow('2026-09-05T03:00:00.000Z', () => {
    check('วันครบกำหนดพอดี (วันที่ 5) ยังไม่ถือว่าเลยกำหนด',
      getDebtStatus(pinnedRun, [], SEPT).status === 'pending',
      getDebtStatus(pinnedRun, [], SEPT).status);
  });
  withFrozenNow('2026-09-06T03:00:00.000Z', () => {
    check('วันถัดจากกำหนด (วันที่ 6) กลายเป็น overdue',
      getDebtStatus(pinnedRun, [], SEPT).status === 'overdue',
      getDebtStatus(pinnedRun, [], SEPT).status);
  });

  // 10:00 Bangkok on the 20th — well past the due day. THIS is what the old
  // assertion meant to test: a completed loan stays out of the overdue total.
  withFrozenNow('2026-09-20T03:00:00.000Z', () => {
    const s20 = summarizeDebts([pinnedDone, pinnedFuture, pinnedRun], [], SEPT);
    check('a completed loan is out of the overdue total and its count',
      s20.overdue === 8000 && s20.overdueCount === 1, `฿${s20.overdue} / ${s20.overdueCount}`);
  });
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

// ═══════════════════════ D · TAX PLANNER (v4.28) ═══════════════════════════
// The whole point of src/lib/taxTH.js is that it is pure, so these cases call
// it directly — no mocking, no fixtures, no dates. Every statutory number the
// module claims to enforce is pinned here; if the Revenue Department changes
// one, exactly one of these fails and says which.

const near = (a, b, eps = 0.01) => Math.abs(Number(a) - Number(b)) <= eps;

/** A profile that reaches `gross` with nothing but a bonus, plus deductions. */
const profileOf = (gross, deductions = {}, wht = 0) =>
  ({ income: { salaryMonthly: 0, bonus: gross, wht }, deductions });

section('D1 · Tax brackets — every boundary');
{
  // Cumulative tax AT each boundary, worked by hand from the statute.
  const BOUNDARIES = [
    [0,          0],
    [150000,     0],
    [300000,     7500],        //             150,000 × 5%
    [500000,     27500],       //   7,500 +   200,000 × 10%
    [750000,     65000],       //  27,500 +   250,000 × 15%
    [1000000,    115000],      //  65,000 +   250,000 × 20%
    [2000000,    365000],      // 115,000 + 1,000,000 × 25%
    [5000000,    1265000],     // 365,000 + 3,000,000 × 30%
    [6000000,    1615000],     // 1,265,000 + 1,000,000 × 35%
  ];
  for (const [net, tax] of BOUNDARIES) {
    check(`เงินได้สุทธิ ${baht(net)} → ภาษี ${baht(tax)}`,
      near(taxFromNetIncome(net).tax, tax), baht(taxFromNetIncome(net).tax));
  }

  // One baht INTO the next band pays that band's rate on that baht — the
  // classic "does the whole income jump to the new rate?" error.
  const STEPS = [[150001, 0.05], [300001, 0.10], [500001, 0.15],
                 [750001, 0.20], [1000001, 0.25], [2000001, 0.30], [5000001, 0.35]];
  for (const [net, rate] of STEPS) {
    const base = BOUNDARIES.find(([n]) => n === net - 1)[1];
    check(`฿1 เหนือขั้น ${baht(net - 1)} เสียเพิ่มแค่ ${Math.round(rate * 100)}% ของบาทนั้น`,
      near(taxFromNetIncome(net).tax, base + rate),
      `${taxFromNetIncome(net).tax} vs ${base + rate}`);
  }

  check('ขั้นแรก ฿150,000 ยกเว้นภาษี',
    taxFromNetIncome(150000).tax === 0 && taxFromNetIncome(149999.99).tax === 0);
  check('เงินได้สุทธิติดลบไม่ทำให้ภาษีติดลบ', taxFromNetIncome(-500000).tax === 0);
  check('ขั้นสูงสุดคือ 35% และไม่มีเพดานด้านบน',
    TAX_BRACKETS[TAX_BRACKETS.length - 1].rate === 0.35
    && TAX_BRACKETS[TAX_BRACKETS.length - 1].upTo === Infinity);

  // The per-band breakdown the results panel prints line by line.
  const b = taxFromNetIncome(736000).bands;
  check('breakdown แจกแจงครบทุกขั้นที่ใช้จริง และผลรวมเท่ากับภาษีทั้งก้อน',
    b.length === 4 && near(b.reduce((s, x) => s + x.tax, 0), 62900),
    b.map(x => `${Math.round(x.rate * 100)}%:${x.tax}`).join(' '));
  check('ขั้นสุดท้ายของ breakdown ตัดที่เงินได้สุทธิ ไม่ใช่ที่ยอดเพดานขั้น',
    near(b[3].amount, 236000), `${b[3].amount}`);
}

section('D2 · Marginal rate — the rate the LAST baht paid');
{
  check('ที่ ฿150,000 พอดี บาทสุดท้ายยังอยู่ในขั้นยกเว้น → 0%', marginalRate(150000) === 0);
  check('ที่ ฿150,001 บาทสุดท้ายอยู่ขั้น 5%', marginalRate(150001) === 0.05);
  check('ที่ ฿300,000 พอดี → ยังเป็น 5%', marginalRate(300000) === 0.05);
  check('ที่ ฿2,000,001 → 30%', marginalRate(2000001) === 0.30);
  check('ที่ ฿9,000,000 → 35%', marginalRate(9000000) === 0.35);
  check('เงินได้สุทธิศูนย์ → 0%', marginalRate(0) === 0);
}

section('D3 · ค่าใช้จ่าย 50% เพดาน ฿100,000');
{
  const small = computeTax(profileOf(120000));
  check('รายได้น้อย หักค่าใช้จ่ายได้ 50% เต็ม (ยังไม่ชนเพดาน)',
    near(small.expense, 60000) && small.expenseCapped === false, baht(small.expense));
  const exact = computeTax(profileOf(200000));
  check('ที่รายได้ ฿200,000 พอดี 50% = เพดานพอดี ยังไม่ถือว่าชน',
    near(exact.expense, EXPENSE_CAP) && exact.expenseCapped === false);
  const big = computeTax(profileOf(2100000));
  check('รายได้สูง หักค่าใช้จ่ายได้แค่ ฿100,000 และติดธงว่าชนเพดาน',
    near(big.expense, EXPENSE_CAP) && big.expenseCapped === true, baht(big.expense));

  const salaried = computeTax({ income: { salaryMonthly: 50000, bonus: 0 }, deductions: {} });
  check('เงินเดือน/เดือน คูณ 12 ให้เองเป็นเงินได้ทั้งปี',
    near(salaried.income.salaryAnnual, 600000) && near(salaried.income.gross, 600000));

  const mixed = computeTax({
    income: { salaryMonthly: 50000, bonus: 100000, other: [{ label: 'ค่าเช่า', amount: 240000 }] },
    deductions: {},
  });
  check('เงินได้พึงประเมิน = เงินเดือน×12 + โบนัส + รายได้อื่นทุกบรรทัด',
    near(mixed.income.gross, 940000) && near(mixed.income.otherTotal, 240000), baht(mixed.income.gross));
}

section('D4 · เพดานลดหย่อนรายช่อง — ทีละช่อง');
{
  // Income high enough that no percentage cap binds where an absolute one is
  // being tested; each row is exercised ALONE so no shared ceiling interferes.
  const G = 4000000;   // 30% = 1.2M, 15% = 600k — both above every absolute cap
  const capCase = (key, put, expect, note) => {
    const r = computeTax(profileOf(G, { [key]: put }));
    check(`${key}: ใส่ ${baht(put)} → หักได้ ${baht(expect)}${note ? ' · ' + note : ''}`,
      near(r.rows[key].allowed, expect) && r.rows[key].capped === (put > expect),
      baht(r.rows[key].allowed));
  };
  capCase('spouse', 100000, 60000);
  // NOT ฿9,000 — that figure was stale. The ceiling is ฿17,500 × 5% × 12.
  capCase('socialSecurity', 12000, 10500);
  capCase('lifeInsurance', 150000, 100000);
  capCase('healthInsurance', 40000, 25000);
  capCase('parentsHealth', 30000, 15000);
  capCase('pvd', 900000, 500000, 'เพดานสัมบูรณ์');
  capCase('rmf', 900000, 500000, 'เพดานสัมบูรณ์');
  capCase('ssf', 900000, 200000, 'เพดานสัมบูรณ์');
  capCase('thaiEsg', 900000, 300000, 'เพดานสัมบูรณ์');
  capCase('pensionInsurance', 900000, 200000, 'เพดานสัมบูรณ์');
  capCase('homeLoanInterest', 250000, 100000);

  // …and the percentage caps, at an income low enough that THEY bind instead.
  const pct = (key, gross, put, expect, note) => {
    const r = computeTax(profileOf(gross, { [key]: put }));
    check(`${key} ที่เงินได้ ${baht(gross)}: หักได้ ${baht(expect)} · ${note}`,
      near(r.rows[key].allowed, expect), baht(r.rows[key].allowed));
  };
  pct('pvd', 1000000, 500000, 150000, '15% ของเงินได้');
  pct('rmf', 1000000, 500000, 300000, '30% ของเงินได้');
  pct('ssf', 400000, 200000, 120000, '30% ของเงินได้');
  pct('thaiEsg', 500000, 300000, 150000, '30% ของเงินได้');
  pct('pensionInsurance', 800000, 200000, 120000, '15% ของเงินได้');

  // Head-count rows.
  const kids = computeTax(profileOf(G, { children: 3, childrenExtra: 2 }));
  check('บุตร 3 คน = ฿90,000 · และคนที่ 2+ ที่เกิดตั้งแต่ปี 2561 อีก 2 คน เพิ่มอีก ฿60,000',
    near(kids.rows.children.allowed, 90000) && near(kids.rows.childrenExtra.allowed, 60000),
    baht(kids.rows.children.allowed + kids.rows.childrenExtra.allowed));
  const parents = computeTax(profileOf(G, { parents: 6 }));
  check('บิดามารดาหักได้ไม่เกิน 4 คน (฿120,000) แม้กรอก 6',
    near(parents.rows.parents.allowed, 120000) && parents.rows.parents.count === 4
    && parents.rows.parents.capped === true, baht(parents.rows.parents.allowed));

  check('ลดหย่อนส่วนตัว ฿60,000 ได้อัตโนมัติ ไม่ต้องกรอก',
    near(computeTax(profileOf(G)).rows.personal.allowed, 60000));
  check('ค่าลดหย่อนที่กรอกติดลบ/ขยะ ถูกอ่านเป็นศูนย์ ไม่ใช่ทำให้ภาษีเพี้ยน',
    near(computeTax(profileOf(G, { ssf: -50000, rmf: 'abc' })).rows.ssf.allowed, 0)
    && near(computeTax(profileOf(G, { ssf: -50000, rmf: 'abc' })).rows.rmf.allowed, 0));
}

section('D5 · เพดานรวม — ประกันชีวิต+สุขภาพ ฿100,000');
{
  const r = computeTax(profileOf(2000000, { lifeInsurance: 90000, healthInsurance: 25000 }));
  check('ชีวิต 90,000 + สุขภาพ 25,000 = 115,000 → ถูกตัดเหลือ ฿100,000 รวม',
    near(r.rows.lifeInsurance.allowed + r.rows.healthInsurance.allowed, 100000)
    && near(r.lifeHealth.trimmed, 15000),
    `ชีวิต ${r.rows.lifeInsurance.allowed} + สุขภาพ ${r.rows.healthInsurance.allowed}`);
  check('… และแถวที่โดนตัดคือแถวหลัง (สุขภาพ) ไม่ใช่แถวแรก',
    near(r.rows.lifeInsurance.allowed, 90000) && near(r.rows.healthInsurance.allowed, 10000)
    && r.rows.healthInsurance.groupCapped === true);
  const ok = computeTax(profileOf(2000000, { lifeInsurance: 60000, healthInsurance: 25000 }));
  check('ไม่เกินเพดานรวม → ไม่ถูกตัดสักบาท',
    near(ok.rows.healthInsurance.allowed, 25000) && ok.lifeHealth.trimmed === 0);
}

section('D6 · เพดานรวมเกษียณ ฿500,000');
{
  const r = computeTax(profileOf(2100000, { pvd: 100000, rmf: 300000, ssf: 200000 }));
  const used = ['pvd', 'rmf', 'ssf', 'thaiEsg', 'pensionInsurance']
    .reduce((s, k) => s + r.rows[k].allowed, 0);
  check('PVD 100k + RMF 300k + SSF 200k = 600k → หักรวมได้แค่ ฿500,000',
    near(used, RETIREMENT_COMBINED_CAP) && near(r.retirement.trimmed, 100000), baht(used));
  check('… ส่วนที่โดนตัดคือช่องท้ายแถว (SSF เหลือ 100,000) ช่องแรกยังเต็ม',
    near(r.rows.pvd.allowed, 100000) && near(r.rows.rmf.allowed, 300000)
    && near(r.rows.ssf.allowed, 100000) && r.rows.ssf.groupCapped === true);
  check('เพดานรวมนับประกันบำนาญด้วย — เต็ม 500k แล้วบำนาญหักไม่ได้อีกเลย',
    near(computeTax(profileOf(4000000, { rmf: 500000, pensionInsurance: 200000 }))
      .rows.pensionInsurance.allowed, 0));

  const under = computeTax(profileOf(2100000, { pvd: 100000, ssf: 150000 }));
  check('รวมกันยังไม่ถึงเพดาน → ไม่ตัด และเหลือห้องอีก ฿250,000',
    under.retirement.trimmed === 0 && near(under.retirement.remaining, 250000),
    baht(under.retirement.remaining));
}

section('D7 · เงินบริจาค — 2 เท่า และเพดาน 10%');
{
  // gross 1,000,000 · ค่าใช้จ่าย 100,000 · ลดหย่อนส่วนตัว 60,000 → ฐาน 840,000
  const base = { personal: true };
  const dbl = computeTax(profileOf(1000000, { donationEdu: 10000 }));
  check('บริจาคการศึกษา ฿10,000 หักได้ 2 เท่า = ฿20,000',
    near(dbl.rows.donationEdu.allowed, 20000) && dbl.rows.donationEdu.capped === false,
    baht(dbl.rows.donationEdu.allowed));

  const capped = computeTax(profileOf(1000000, { donationEdu: 50000 }));
  check('บริจาค 2 เท่า ยังชนเพดาน 10% ของฐาน ฿840,000 → หักได้ ฿84,000 ไม่ใช่ ฿100,000',
    near(capped.rows.donationEdu.allowed, 84000) && capped.rows.donationEdu.capped === true,
    baht(capped.rows.donationEdu.allowed));

  const both = computeTax(profileOf(1000000, { donationEdu: 50000, donationGeneral: 20000 }));
  check('บริจาคทั่วไปคิดเพดาน 10% จากฐานที่หักบริจาค 2 เท่าไปแล้ว (10% ของ 756,000)',
    near(both.rows.donationGeneral.cap, 75600) && near(both.rows.donationGeneral.allowed, 20000),
    `เพดาน ${baht(both.rows.donationGeneral.cap)}`);
  check('… เงินได้สุทธิหลังบริจาคทั้งสองก้อน = ฿736,000 · ภาษี ฿62,900',
    near(both.netIncome, 736000) && near(both.tax, 62900),
    `${baht(both.netIncome)} → ${baht(both.tax)}`);

  const over = computeTax(profileOf(1000000, { donationGeneral: 500000 }));
  check('บริจาคทั่วไปเกิน 10% ของฐาน → หักได้แค่ ฿84,000',
    near(over.rows.donationGeneral.allowed, 84000) && over.rows.donationGeneral.capped === true,
    baht(over.rows.donationGeneral.allowed));
  void base;
}

section('D8 · ลดหย่อนอื่น ๆ ที่กรอกเอง (มาตรการรายปี)');
{
  const r = computeTax(profileOf(1000000, {
    custom: [{ label: 'Easy E-Receipt', amount: 50000 }, { label: 'เที่ยวเมืองรอง', amount: 15000 }],
  }));
  check('แถวลดหย่อนอื่นบวกเข้าไปเต็มจำนวน (ระบบไม่เดาเพดานของมาตรการรายปี)',
    near(r.customTotal, 65000) && near(r.netIncome, 1000000 - 100000 - 60000 - 65000),
    `${baht(r.customTotal)} → สุทธิ ${baht(r.netIncome)}`);
  check('ไม่มีมาตรการรายปีถูกฝังไว้ในแค็ตตาล็อกลดหย่อน',
    !DEDUCTIONS.some(d => /e-receipt|ช้อปดี|เที่ยว|คนละครึ่ง/i.test(d.label + d.key)));
}

section('D9 · ต้องจ่ายเพิ่ม vs ขอคืนได้');
{
  const payable = computeTax(profileOf(1000000, { donationEdu: 50000, donationGeneral: 20000 }, 10000));
  check('หัก ณ ที่จ่ายน้อยกว่าภาษี → ต้องจ่ายเพิ่ม ฿52,900 และ refund = 0',
    near(payable.payable, 52900) && payable.refund === 0 && payable.balance > 0, baht(payable.payable));

  const refund = computeTax(profileOf(1000000, { donationEdu: 50000, donationGeneral: 20000 }, 100000));
  check('หัก ณ ที่จ่ายมากกว่าภาษี → ขอคืนได้ ฿37,100 และ payable = 0',
    near(refund.refund, 37100) && refund.payable === 0 && refund.balance < 0, baht(refund.refund));

  const even = computeTax(profileOf(1000000, { donationEdu: 50000, donationGeneral: 20000 }, 62900));
  check('หักพอดี → ไม่จ่ายเพิ่ม ไม่มีคืน', even.balance === 0 && even.payable === 0 && even.refund === 0);

  const exempt = computeTax(profileOf(300000, {}, 5000));
  check('เงินได้สุทธิต่ำกว่า ฿150,000 → ภาษี 0 และขอคืนที่ถูกหักไปได้ทั้งก้อน',
    exempt.netIncome === 140000 && exempt.tax === 0 && near(exempt.refund, 5000) && exempt.exempt === true,
    `สุทธิ ${baht(exempt.netIncome)}`);
}

section('D10 · "ควรทำยังไงต่อ" — headroom × ขั้นภาษี');
{
  // The brief's own worked example: ฿120,000 of SSF room at a 15% marginal
  // rate must read "ประหยัดภาษี ~฿18,000".
  const r = computeTax(profileOf(940000, { ssf: 80000 }));
  check('ฉากตัวอย่าง: เงินได้สุทธิ ฿700,000 · ขั้นภาษีสูงสุด 15%',
    near(r.netIncome, 700000) && r.marginalRate === 0.15, baht(r.netIncome));
  const ssf = deductionHeadroom(r).find(x => x.key === 'ssf');
  check('SSF ซื้อเพิ่มได้อีก ฿120,000 → ประหยัดภาษี ~฿18,000',
    near(ssf.room, 120000) && near(ssf.taxSaved, 18000), `${baht(ssf.room)} → ${baht(ssf.taxSaved)}`);
  check('… ในกรณีที่ไม่ข้ามขั้น ตัวเลขจริงเท่ากับ headroom × marginal rate พอดี',
    near(ssf.taxSaved, ssf.taxSavedAtMarginal));

  // …and where the room DOES cross a boundary, the honest number is smaller
  // than headroom × marginal rate. This is why taxSaved re-runs the brackets.
  const r2 = computeTax(profileOf(1000000, { ssf: 50000 }));
  const ssf2 = deductionHeadroom(r2).find(x => x.key === 'ssf');
  check('ห้องที่ข้ามขั้นภาษี: ประหยัดจริง ฿24,500 ไม่ใช่ ฿30,000 ที่ได้จากคูณอัตราเดียว',
    near(ssf2.room, 150000) && near(ssf2.taxSaved, 24500) && near(ssf2.taxSavedAtMarginal, 30000),
    `จริง ${baht(ssf2.taxSaved)} · คูณตรง ๆ ${baht(ssf2.taxSavedAtMarginal)}`);

  // The combined ceiling has to bound the ADVICE too, not just the maths.
  const full = computeTax(profileOf(2100000, { pvd: 100000, rmf: 300000, ssf: 100000 }));
  const esg = deductionHeadroom(full).find(x => x.key === 'thaiEsg');
  check('เพดานรวมเกษียณเต็มแล้ว → ไม่แนะนำให้ซื้อ Thai ESG เพิ่ม (ห้องเหลือ 0)',
    esg.room === 0 && esg.taxSaved === 0, `ห้อง ${baht(esg.room)}`);
  const ph = deductionHeadroom(full).find(x => x.key === 'parentsHealth');
  check('… แต่ช่องที่ไม่เกี่ยวกับเกษียณยังเหลือห้องตามปกติ (สุขภาพพ่อแม่ ฿15,000 ที่ขั้น 25%)',
    near(ph.room, 15000) && near(ph.taxSaved, 3750), `${baht(ph.room)} → ${baht(ph.taxSaved)}`);

  const life = deductionHeadroom(computeTax(profileOf(2000000, { lifeInsurance: 90000 })))
    .find(x => x.key === 'healthInsurance');
  check('ประกันสุขภาพ: ห้องถูกจำกัดด้วยเพดานรวม ฿100,000 เหลือแค่ ฿10,000 ไม่ใช่ ฿25,000',
    near(life.room, 10000), baht(life.room));

  const edu = deductionHeadroom(computeTax(profileOf(1000000, { donationEdu: 20000 })))
    .find(x => x.key === 'donationEdu');
  check('บริจาค 2 เท่า: บริจาคไป ฿20,000 (หักได้ ฿40,000) เหลือห้องอีก ฿22,000 ของเงินสด',
    near(edu.room, 22000) && edu.weight === 2, baht(edu.room));
  check('… ทุกตัวเลขในบรรทัดเดียวกันเป็น "เงินสดที่จ่าย" หน่วยเดียวกันหมด ไม่ปนกับยอดที่หักได้',
    near(edu.used, 20000) && near(edu.cap, 42000),
    `ใช้ไป ${baht(edu.used)} / ${baht(edu.cap)}`);

  check('เรียงจากช่องที่ประหยัดภาษีได้มากที่สุดก่อน',
    deductionHeadroom(r).every((x, i, a) => i === 0 || a[i - 1].taxSaved >= x.taxSaved));
  check('ช่องที่ระบบถือว่า "ซื้อเพิ่มไม่ได้" ไม่โผล่ในคำแนะนำ',
    !deductionHeadroom(r).some(x => ['personal', 'spouse', 'children', 'parents', 'socialSecurity'].includes(x.key)));
}

section('D11 · สรุป "ควรทำยังไงต่อ" ไม่ขายของเมื่อไม่มีภาษีให้ประหยัด');
{
  const none = planningSummary(computeTax(profileOf(0)));
  check('ยังไม่กรอกรายได้ → บอกให้กรอกก่อน', none.state === 'empty');

  const exempt = planningSummary(computeTax(profileOf(300000)));
  check('ต่ำกว่าเกณฑ์ → บอกตรง ๆ ว่าไม่ต้องเสียภาษี และซื้อเพิ่มไม่ช่วย',
    exempt.state === 'exempt' && /ไม่ต้องเสียภาษี/.test(exempt.detail));

  const taxable = planningSummary(computeTax(profileOf(940000, { ssf: 80000 })));
  check('มีภาษีต้องเสีย → บอกขั้นภาษีสูงสุดเป็นเปอร์เซ็นต์',
    taxable.state === 'taxable' && /15%/.test(taxable.headline), taxable.headline);

  // Deductions can carry a taxable income back UNDER the threshold — and then
  // the panel must stop selling. (There is no fourth state: tax is zero
  // exactly when net income is ≤ ฿150,000.)
  const zeroedProfile = computeTax(profileOf(600000, { rmf: 300000, ssf: 200000, socialSecurity: 9000, spouse: 60000 }));
  const zeroed = planningSummary(zeroedProfile);
  check('ลดหย่อนกดเงินได้สุทธิลงต่ำกว่าเกณฑ์ → ไม่เสนอให้ซื้ออะไรเพิ่ม',
    zeroedProfile.tax === 0 && zeroed.state === 'exempt',
    `สุทธิ ${baht(zeroedProfile.netIncome)}`);

  check('ไม่มีคำแนะนำใดเอ่ยชื่อผลิตภัณฑ์หรือ บลจ.',
    !/ควรซื้อ|แนะนำให้ซื้อ|กองทุนของ/.test(JSON.stringify([none, exempt, taxable, zeroed])));
}

section('D12 · พ.ศ. / ค.ศ. และการฟอร์แมตเงิน');
{
  check('เก็บ ค.ศ. แสดง พ.ศ. — 2026 → 2569', toBE(2026) === 2569 && toCE(2569) === 2026);
  check('ปีภาษีอ่านจากวันที่แบบ Bangkok YYYY-MM-DD', taxYearOf('2026-08-12') === 2026);
  check('วันที่พังอ่านเป็น null ไม่ใช่ NaN', taxYearOf('') === null && taxYearOf(undefined) === null);
  check('ฟอร์แมตเงินใส่ ฿ และคอมมา', baht(1234567) === '฿1,234,567' && baht(-2500) === '-฿2,500');
}

section('D13 · ตาราง tax_profiles ยังไม่ถูกสร้าง — แอปต้องไม่พัง');
{
  const saved = __tables.tax_profiles;
  delete __tables.tax_profiles;                       // migration not run yet

  const res = await listProfiles(2026);
  check('อ่านรายชื่อได้ผลว่าง + ธง missingTable แทนที่จะ throw',
    res.missingTable === true && Array.isArray(res.rows) && res.rows.length === 0);
  const yrs = await listYears();
  check('รายการปีก็คืนธงเดียวกัน ไม่ throw', yrs.missingTable === true && yrs.years.length === 0);

  let msg = '';
  try { await createProfile({ tax_year: 2026, person_name: 'อาร์ม' }); } catch (e) { msg = e.message; }
  check('การเขียนกลับเป็น error ภาษาไทยที่บอกให้ไปรัน SQL ไม่ใช่ error ดิบ',
    msg === SQL_NOT_RUN_MESSAGE, msg);

  check('ตัวตรวจจับรู้จักทั้ง 42P01 (Postgres) และ PGRST205 (PostgREST)',
    isTableMissing({ code: '42P01' }) && isTableMissing({ code: 'PGRST205' })
    && isTableMissing({ message: 'Could not find the table \'public.tax_profiles\'' })
    && !isTableMissing({ code: '23505' }) && !isTableMissing(null));

  __tables.tax_profiles = saved;
}

section('D14 · บันทึกจริง · คัดลอกจากปีก่อน');
{
  __tables.tax_profiles = [];

  const arm = await createProfile({ tax_year: 2026, person_name: 'อาร์ม', is_self: true, sort_order: 0 });
  const pat = await createProfile({ tax_year: 2026, person_name: 'แพท', sort_order: 1 });
  await createProfile({ tax_year: 2026, person_name: 'พ่อ', sort_order: 2 });
  check('เพิ่มคนได้หลายคนในปีเดียวกัน (ตัวเอง + แพท + คนอื่น)',
    (await listProfiles(2026)).rows.length === 3);

  await updateProfile(arm.id, {
    income: { salaryMonthly: 150000, bonus: 300000, wht: 180000 },
    deductions: { ssf: 200000, rmf: 300000, socialSecurity: 9000 },
  });
  const back = (await listProfiles(2026)).rows.find(r => r.id === arm.id);
  check('income/deductions เก็บเป็น jsonb แล้วอ่านกลับมาครบ',
    back.income.salaryMonthly === 150000 && back.deductions.rmf === 300000);
  const armTax = computeTax({ income: back.income, deductions: back.deductions });
  check('คำนวณจากแถวที่อ่านกลับมาได้เลข ฿222,750 (สุทธิ ฿1,431,000)',
    near(armTax.netIncome, 1431000) && near(armTax.tax, 222750),
    `${baht(armTax.netIncome)} → ${baht(armTax.tax)}`);
  check('… และเทียบกับหัก ณ ที่จ่าย ฿180,000 แล้วต้องจ่ายเพิ่ม ฿42,750',
    near(armTax.payable, 42750), baht(armTax.payable));

  check('เรียงตาม sort_order เสมอ — เจ้าของขึ้นก่อน',
    (await listProfiles(2026)).rows.map(r => r.person_name).join(',') === 'อาร์ม,แพท,พ่อ');

  // คัดลอกจากปีก่อน
  await createProfile({ tax_year: 2027, person_name: 'แพท', sort_order: 0 });
  const copied = await copyYear(2026, 2027);
  check('คัดลอกปีก่อนมาเฉพาะคนที่ยังไม่มี — ไม่ทับของที่กรอกไว้แล้ว',
    copied.copied === 2 && copied.skipped.join(',') === 'แพท',
    `copied ${copied.copied} · skipped ${copied.skipped.join(',')}`);
  const y27 = (await listProfiles(2027)).rows;
  check('ปีใหม่ได้ค่าลดหย่อนเดิมติดมาด้วย',
    y27.find(r => r.person_name === 'อาร์ม').deductions.rmf === 300000);
  check('แต่ภาษีหัก ณ ที่จ่ายของปีเก่าไม่ถูกคัดลอกมา (ไม่งั้นจะโชว์เงินคืนปลอม)',
    y27.find(r => r.person_name === 'อาร์ม').income.wht === 0
    && y27.find(r => r.person_name === 'อาร์ม').income.salaryMonthly === 150000);

  let copyMsg = '';
  try { await copyYear(2024, 2025); } catch (e) { copyMsg = e.message; }
  check('คัดลอกจากปีที่ไม่มีข้อมูล → บอกเป็นภาษาไทยพร้อมปี พ.ศ.',
    /2567/.test(copyMsg), copyMsg);

  // Save failure must surface, not be swallowed.
  __config.opFailures['update:tax_profiles'] = 1;
  let saveMsg = '';
  try { await updateProfile(pat.id, { notes: 'x' }); } catch (e) { saveMsg = e.message; }
  check('บันทึกล้มเหลวถูกโยนออกมาให้ UI แสดง ไม่ถูกกลืน', saveMsg.length > 0, saveMsg);

  // An update that matches no row (deleted elsewhere / RLS) is NOT a success.
  let ghostMsg = '';
  try { await updateProfile('no-such-id', { notes: 'x' }); } catch (e) { ghostMsg = e.message; }
  check('อัปเดตแถวที่ไม่มีอยู่ = error ไม่ใช่ "บันทึกแล้ว" เงียบ ๆ',
    /บันทึกไม่สำเร็จ/.test(ghostMsg), ghostMsg);

  await deleteProfile(pat.id);
  check('ลบคนออกจากปีได้ และเหลือคนอื่นครบ',
    (await listProfiles(2026)).rows.map(r => r.person_name).join(',') === 'อาร์ม,พ่อ');

  const years = await listYears();
  check('รายการปีที่มีข้อมูล เรียงใหม่สุดก่อน', years.years.join(',') === '2027,2026');
}

// ═══════════════ E · กรอกจากสลิป — เดือน/ปี, ประกันสังคม, คำเตือน (v4.29) ═══
// The owner's complaint in one line: "ตรงที่ต้องคำนวณเองแล้วใส่เป็นก้อน …
// คือแค่ลดความผิดพลาดแหละ". Everything in this section exists to make sure the
// app does the multiplying, and that doing it never changes what an already
// saved figure means.

section('E1 · หน่วย เดือน/ปี ต่อช่อง — และค่าเริ่มต้นของแถวเก่า');
{
  check('เงินเดือนเก็บเป็นรายเดือน · ช่องอื่นเก็บเป็นรายปี',
    storedUnit('salary') === 'month' && storedUnit('wht') === 'year'
    && storedUnit('ded:ssf') === 'year');

  // THE backward-compatibility case: a v4.28 row has no `periods` key at all.
  // Reading a missing period as anything other than what the old label said
  // would multiply or divide every saved figure by 12, silently.
  check('แถวที่บันทึกไว้ก่อน v4.29 ไม่มีคีย์ periods → ช่องเงินเดือนคือ "เดือน" ตามป้ายเดิม',
    periodFor(undefined, 'salary') === 'month' && defaultPeriod('salary') === 'month');
  check('… และช่องอื่นทุกช่องคือ "ปี" ตามที่ UI เดิมหมายถึง',
    periodFor(undefined, 'wht') === 'year' && periodFor({}, 'ded:lifeInsurance') === 'year'
    && periodFor({ wht: 'ขยะ' }, 'wht') === 'year' && defaultPeriod('bonus') === 'year');

  // A legacy row read through the new code must compute EXACTLY what v4.28
  // computed for it — same salary, same WHT, same tax, to the satang.
  const legacy = { income: { salaryMonthly: 150000, bonus: 300000, wht: 180000 },
                   deductions: { ssf: 200000, rmf: 300000, socialSecurity: 9000 } };
  const legacyOut = computeTax(legacy);
  check('แถว v4.28 คำนวณออกมาเท่าเดิมทุกบาท (สุทธิ ฿1,431,000 · ภาษี ฿222,750)',
    near(legacyOut.income.gross, 2100000) && near(legacyOut.netIncome, 1431000)
    && near(legacyOut.tax, 222750), `${baht(legacyOut.netIncome)} → ${baht(legacyOut.tax)}`);

  // Round trip: what he types monthly is what he sees monthly, after the
  // stored annual figure has been through the database and back.
  check('พิมพ์ 5,410.42/เดือน → เก็บ ฿64,925.04/ปี → แสดงกลับเป็น 5,410.42/เดือน',
    near(toStored('wht', 5410.42, 'month'), 64925.04)
    && near(toDisplay('wht', 64925.04, 'month'), 5410.42),
    `${toStored('wht', 5410.42, 'month')}`);
  check('พิมพ์ 875/เดือน → ฿10,500/ปี · และกลับมาเป็น 875 พอดี',
    near(toStored('ded:socialSecurity', 875, 'month'), 10500)
    && near(toDisplay('ded:socialSecurity', 10500, 'month'), 875));
  check('ช่องเงินเดือนสลับเป็น "ปี": พิมพ์ 1,080,000 → เก็บเป็น 90,000/เดือน',
    near(toStored('salary', 1080000, 'year'), 90000)
    && near(toDisplay('salary', 90000, 'year'), 1080000));
  check('สลับหน่วยไปกลับไม่ทำให้ตัวเลขเพี้ยน',
    near(toDisplay('bonus', toStored('bonus', 12345.67, 'month'), 'month'), 12345.67));
  check('ยอดรายปีอ่านได้จากค่าที่เก็บ ไม่ว่าช่องนั้นเก็บหน่วยอะไร',
    near(annualOf('salary', 90000), 1080000) && near(annualOf('wht', 64925.04), 64925.04));

  check('ใต้ช่องที่ตั้งเป็น "เดือน" มีบรรทัดโชว์การคูณให้เห็น',
    periodDerivation('ded:socialSecurity', 10500, 'month') === '875 × 12 = ฿10,500/ปี',
    periodDerivation('ded:socialSecurity', 10500, 'month'));
  check('ช่องเงินเดือนที่ตั้งเป็น "ปี" โชว์การหารกลับเป็นรายเดือน',
    periodDerivation('salary', 90000, 'year') === '1,080,000 ÷ 12 = ฿90,000/เดือน',
    periodDerivation('salary', 90000, 'year'));
  check('ช่องที่พิมพ์ในหน่วยเดียวกับที่เก็บ ไม่ต้องมีบรรทัดอธิบาย',
    periodDerivation('wht', 64925.04, 'year') === null);
}

section('E2 · ประกันสังคม — คำนวณให้ตามกฎหมาย');
{
  check('ค่าตั้งต้นตามสลิปจริง: ฐาน ฿17,500 × 5% = ฿875/เดือน',
    SSO_WAGE_CEILING === 17500 && SSO_RATE === 0.05
    && near(deriveSSO(90000).monthly, 875) && near(deriveSSO(90000).annual, 10500),
    baht(deriveSSO(90000).annual));
  check('เงินเดือนต่ำกว่าเพดาน → คิดจากเงินเดือนจริง ไม่ใช่เพดาน',
    near(deriveSSO(10000).monthly, 500) && near(deriveSSO(10000).annual, 6000),
    baht(deriveSSO(10000).annual));
  check('ยังไม่กรอกเงินเดือน → ประกันสังคมเป็นศูนย์ ไม่ใช่ ฿10,500 ลอย ๆ',
    deriveSSO(0).annual === 0);

  // Part-year: joined in June, seven months of contributions.
  const part = deriveSSO(90000, { monthsWorked: 7 });
  check('เข้างานกลางปี ส่งสมทบ 7 เดือน → ฿6,125 ไม่ใช่ ฿10,500',
    near(part.annual, 6125) && part.monthsWorked === 7, baht(part.annual));
  check('… และบรรทัดที่มาที่ไปบอกจำนวนเดือนตรงตามที่ตั้ง',
    part.formula === '5% ของ ฿17,500 × 7 เดือน', part.formula);

  // Both parameters are editable — they are government numbers, not constants.
  const tweaked = deriveSSO(90000, { wageCeiling: 20000, rate: 0.03 });
  check('เพดานค่าจ้างและอัตราแก้ได้ — ฐาน ฿20,000 อัตรา 3% → ฿600/เดือน',
    near(tweaked.monthly, 600) && near(tweaked.annual, 7200), baht(tweaked.annual));
  check('เพดานลดหย่อนทั้งปีมาจากค่าเดียวกัน ไม่ใช่เลขฝังตาย ฿9,000',
    near(ssoLegalMax(), 10500) && near(ssoLegalMax({ wageCeiling: 20000, rate: 0.03 }), 7200),
    baht(ssoLegalMax()));
  check('ค่าตั้งค่าที่กรอกมั่ว ถูกแทนที่ด้วยค่าเริ่มต้น ไม่ทำให้ผลลัพธ์เพี้ยน',
    ssoSettings({ wageCeiling: -5, rate: 9, monthsWorked: 99 }).wageCeiling === 17500
    && ssoSettings({}).rate === 0.05 && ssoSettings({ monthsWorked: 99 }).monthsWorked === 12);

  // Mode precedence.
  const auto = resolveSSO({ income: { salaryMonthly: 90000 }, deductions: { ssoMode: 'auto' } });
  check('โหมดอัตโนมัติ: ไม่ต้องกรอกอะไรเลย ได้ ฿10,500 พร้อมที่มา',
    auto.mode === 'auto' && near(auto.amount, 10500) && auto.overridden === false,
    baht(auto.amount));

  const manual = resolveSSO({
    income: { salaryMonthly: 90000 },
    deductions: { ssoMode: 'manual', socialSecurity: 12000 },
  });
  check('กรอกเองชนะเสมอ — ระบบไม่แอบเขียนทับตัวเลขที่พิมพ์',
    manual.mode === 'manual' && near(manual.amount, 12000) && manual.overridden === true,
    baht(manual.amount));
  check('… แต่ก็ยังบอกว่าเลขที่คำนวณได้คือเท่าไหร่ เผื่อจะกด "คำนวณใหม่"',
    near(manual.derived.annual, 10500));

  const same = resolveSSO({
    income: { salaryMonthly: 90000 },
    deductions: { ssoMode: 'manual', socialSecurity: 10500 },
  });
  check('กรอกเองด้วยตัวเลขเดียวกับที่คำนวณได้ ไม่ถือว่า "ทับค่า"', same.overridden === false);

  // …and the legacy row, which has no mode at all.
  const old9k = resolveSSO({ income: { salaryMonthly: 90000 }, deductions: { socialSecurity: 9000 } });
  check('แถวเก่าที่ไม่มีคีย์ ssoMode → ใช้ตัวเลขที่บันทึกไว้เหมือนเดิม ไม่ถูกคำนวณทับ',
    old9k.mode === 'manual' && near(old9k.amount, 9000), baht(old9k.amount));
  const oldEmpty = resolveSSO({ income: { salaryMonthly: 90000 }, deductions: {} });
  check('แถวเก่าที่ไม่เคยติ๊กประกันสังคม → ยังเป็นศูนย์ ไม่ถูกเติมให้เอง',
    oldEmpty.amount === 0);

  // The deduction row itself, through computeTax.
  const overMax = computeTax({
    income: { salaryMonthly: 90000 },
    deductions: { ssoMode: 'manual', socialSecurity: 12000 },
  });
  check('กรอกเกินเพดาน → หักได้แค่ ฿10,500 (เพดานใหม่ ไม่ใช่ ฿9,000)',
    near(overMax.rows.socialSecurity.allowed, 10500) && overMax.rows.socialSecurity.capped === true,
    baht(overMax.rows.socialSecurity.allowed));
  const tightCeiling = computeTax({
    income: { salaryMonthly: 90000 },
    deductions: { ssoMode: 'manual', socialSecurity: 12000, ssoSettings: { wageCeiling: 20000, rate: 0.03 } },
  });
  check('เพดานลดหย่อนขยับตามค่าที่ตั้งไว้ — ฐาน ฿20,000 อัตรา 3% → หักได้ ฿7,200',
    near(tightCeiling.rows.socialSecurity.allowed, 7200),
    baht(tightCeiling.rows.socialSecurity.allowed));
  check('ไม่มีเลข 9000 ฝังอยู่ในแค็ตตาล็อกลดหย่อนอีกแล้ว',
    !DEDUCTIONS.some(d => d.key === 'socialSecurity' && d.cap != null));
}

section('E3 · สลิปจริง มิ.ย. 2569 — กรอกรายเดือน แล้วออกมาเป็นทั้งปี');
{
  // บริษัท อเดลล่า กรุ๊ป · เงินเดือน 90,000 · ประกันสังคม 875 · "อื่นๆ" 5,410.42
  // (875 + 5,410.42 = 6,285 = รวมเงินหักในสลิป) · เงินได้สุทธิในสลิป 83,715.
  const SLIP = { salary: 90000, sso: 875, wht: 5410.42, netPay: 83715 };
  // The slip itself prints รวมเงินหัก and เงินได้สุทธิ rounded to the baht —
  // 875 + 5,410.42 is 6,285.42, and 90,000 − that is 83,714.58. Allowing one
  // baht here is the honest tolerance; anything wider would stop being a check.
  check('สลิปสอดคล้องกันเอง: 875 + 5,410.42 ≈ ฿6,285 และ 90,000 − 6,285 ≈ ฿83,715',
    near(SLIP.sso + SLIP.wht, 6285, 1) && near(SLIP.salary - SLIP.sso - SLIP.wht, SLIP.netPay, 1),
    `${SLIP.sso + SLIP.wht} · ${SLIP.salary - SLIP.sso - SLIP.wht}`);

  // What the owner actually types: three monthly boxes, nothing multiplied.
  const profile = {
    income: {
      entryMode: 'slip',
      salaryMonthly: toStored('salary', SLIP.salary, 'month'),
      wht: toStored('wht', SLIP.wht, 'month'),
      periods: { salary: 'month', wht: 'month' },
    },
    deductions: { ssoMode: 'auto' },
  };
  const r = computeTax(profile);

  check('เงินเดือน 90,000/เดือน → เงินได้พึงประเมิน ฿1,080,000',
    near(r.income.salaryAnnual, 1080000) && near(r.income.gross, 1080000), baht(r.income.gross));
  check('ประกันสังคมคำนวณให้เอง = ฿10,500/ปี (875 × 12) โดยไม่ต้องกรอก',
    near(r.sso.amount, 10500) && near(r.sso.derived.monthly, SLIP.sso)
    && near(r.rows.socialSecurity.allowed, 10500), baht(r.sso.amount));
  check('ภาษีหัก ณ ที่จ่าย 5,410.42/เดือน → ฿64,925.04/ปี ครบสตางค์',
    near(r.income.wht, 64925.04), `${r.income.wht}`);
  check('หักค่าใช้จ่าย ฿100,000 (ชนเพดาน) + ส่วนตัว ฿60,000 + ประกันสังคม ฿10,500',
    near(r.expense, 100000) && r.expenseCapped === true && near(r.deductionTotal, 70500),
    baht(r.deductionTotal));
  check('เงินได้สุทธิ ฿909,500 · ภาษีทั้งปี ฿96,900 · ขั้นภาษีสูงสุด 20%',
    near(r.netIncome, 909500) && near(r.tax, 96900) && r.marginalRate === 0.20,
    `${baht(r.netIncome)} → ${baht(r.tax)}`);
  check('เทียบกับที่ถูกหักไปแล้ว → ต้องจ่ายเพิ่ม ฿31,974.96 (ไม่ใช่ได้คืน)',
    near(r.payable, 31974.96) && r.refund === 0, `${r.payable}`);

  // Reload: the row goes to jsonb and comes back, and means the same thing.
  const reloaded = JSON.parse(JSON.stringify(profile));
  check('บันทึกลง jsonb แล้วโหลดกลับ — หน่วยที่เลือกไว้ยังอยู่ ตัวเลขไม่ขยับ',
    periodFor(reloaded.income.periods, 'salary') === 'month'
    && periodFor(reloaded.income.periods, 'wht') === 'month'
    && near(toDisplay('wht', reloaded.income.wht, 'month'), SLIP.wht)
    && near(computeTax(reloaded).tax, 96900));

  // Same slip, entered the other way round — the annual boxes — must agree.
  const typedYearly = computeTax({
    income: { salaryMonthly: toStored('salary', 1080000, 'year'), wht: 64925.04 },
    deductions: { ssoMode: 'auto' },
  });
  check('กรอกเป็นรายปีแทน ได้ตัวเลขเดียวกันเป๊ะ — หน่วยเป็นเรื่องการพิมพ์ ไม่ใช่การคำนวณ',
    near(typedYearly.tax, r.tax) && near(typedYearly.netIncome, r.netIncome));

  const d = derivations(r);
  check('ทุกเลขที่คำนวณให้ มีบรรทัดบอกที่มา ไม่มีเลขลอย',
    d.gross === 'เงินเดือน 90,000 × 12 = ฿1,080,000'
    && d.expense === '50% ของ ฿1,080,000 สูงสุด ฿100,000'
    && d.sso === '5% ของ ฿17,500 × 12 เดือน'
    && d.netIncome === '฿1,080,000 − ฿100,000 − ฿70,500'
    && d.balance === '฿96,900 − หัก ณ ที่จ่าย ฿64,925',
    d.gross);
  check('ตัวเลขในบรรทัดที่มามีทศนิยมเมื่อจำเป็น และมีคอมมาเสมอ',
    fmtNumber(5410.42) === '5,410.42' && fmtNumber(90000) === '90,000'
    && pct(0.05) === '5%' && pct(0.155) === '15.5%');
}

section('E4 · คำเตือนสติ — เตือนแต่ไม่ขวาง');
{
  const clean = { income: { salaryMonthly: 90000, wht: 96900 }, deductions: { ssoMode: 'auto' } };
  check('กรอกครบและสมเหตุสมผล → ไม่มีคำเตือนสักข้อ', sanityWarnings(clean).length === 0);
  check('เพดานหัก ณ ที่จ่ายผ่อนผันได้ 25% ก่อนจะเตือน', WHT_TOLERANCE === 0.25);
  check('ต่างกันแค่ 20% ยังไม่เตือน — ชีวิตจริงมันไม่เป๊ะ',
    sanityWarnings({ income: { salaryMonthly: 90000, wht: 77520 }, deductions: { ssoMode: 'auto' } })
      .length === 0);

  const low = sanityWarnings({ income: { salaryMonthly: 90000, wht: 64925.04 }, deductions: { ssoMode: 'auto' } });
  check('หัก ณ ที่จ่ายน้อยกว่าภาษีเกิน 25% → เตือนว่าน่าจะต้องจ่ายเพิ่ม พร้อมยอด',
    low.length === 1 && low[0].key === 'whtLow' && /ต้องจ่ายเพิ่มอีก ฿31,975/.test(low[0].detail),
    low[0]?.text);

  const high = sanityWarnings({ income: { salaryMonthly: 90000, wht: 150000 }, deductions: { ssoMode: 'auto' } });
  check('หัก ณ ที่จ่ายมากกว่าภาษีเกิน 25% → เตือนว่าน่าจะได้คืน พร้อมยอด',
    high.length === 1 && high[0].key === 'whtHigh' && /ขอคืนได้ ฿53,100/.test(high[0].detail),
    high[0]?.text);
  check('… และทิศทางของคำเตือนสองแบบนี้ตรงข้ามกันจริง ๆ ไม่ใช่ข้อความเดียวกัน',
    /ต้องจ่ายเพิ่ม/.test(low[0].detail) && /ขอคืน/.test(high[0].detail)
    && !/ขอคืน/.test(low[0].detail));

  const over = sanityWarnings({
    income: { salaryMonthly: 90000, wht: 96900 },
    deductions: { ssoMode: 'manual', socialSecurity: 12000 },
  });
  check('กรอกประกันสังคมเกินเพดานตามกฎหมาย → เตือน พร้อมบอกว่าหักได้จริงเท่าไหร่',
    over.some(w => w.key === 'ssoOverMax' && /฿10,500/.test(w.text) && /฿10,500/.test(w.detail)),
    over.find(w => w.key === 'ssoOverMax')?.text);
  check('… โหมดคำนวณอัตโนมัติไม่มีทางเกินเพดาน จึงไม่เตือน',
    !sanityWarnings(clean).some(w => w.key === 'ssoOverMax'));
  check('… และกรอกเองแบบพอดีเพดาน ก็ไม่เตือน',
    !sanityWarnings({ income: { salaryMonthly: 90000, wht: 96900 },
                      deductions: { ssoMode: 'manual', socialSecurity: 10500 } })
      .some(w => w.key === 'ssoOverMax'));

  const noIncome = sanityWarnings({ income: {}, deductions: { ssf: 200000 } });
  check('กรอกลดหย่อนไว้แต่ยังไม่มีรายได้ → เตือนว่ายังไม่ช่วยอะไร',
    noIncome.some(w => w.key === 'zeroIncome' && /฿200,000/.test(w.text)),
    noIncome.find(w => w.key === 'zeroIncome')?.text);
  check('… โปรไฟล์ว่างเปล่าที่ยังไม่ได้กรอกอะไรเลย ไม่ต้องเตือน',
    sanityWarnings({ income: {}, deductions: {} }).length === 0);
  check('คำเตือนเป็นข้อความล้วน ไม่มีสถานะบล็อกการกรอก',
    [...low, ...high, ...over, ...noIncome].every(w => typeof w.text === 'string' && w.text.length > 0
      && typeof w.detail === 'string' && !('blocking' in w)));
}

// ═══ F · ติ๊กแล้วเติมให้ · นับเป็นคนไม่ใช่บาท (v4.30) ═══════════════════════
// The owner's complaint, verbatim: "แม่ไม่มีเงินได้เลย เลขต้องกรอกยังไง จริงๆ
// ติ๊กควร Auto นะ". A statutory allowance has one legal value; a headcount is a
// count. Everything below exists so the app never asks him to compute a number
// it already knows how to work out — and so that doing the work for him never
// moves a figure he saved before this version existed.

section('F1 · ค่าลดหย่อนยอดตายตัว — ติ๊กแล้วเติมให้');
{
  check(`คู่สมรสไม่มีเงินได้คือยอดตายตัว ${baht(SPOUSE_ALLOWANCE)} และอยู่ในสเปค ไม่ใช่ใน JSX`,
    SPOUSE_ALLOWANCE === 60000 && statutoryAmount('spouse') === 60000
    && DEDUCTION_BY_KEY.spouse.statutory === SPOUSE_ALLOWANCE);
  check('ช่องที่ "ตามที่จ่ายจริง" ไม่มียอดตายตัว — ระบบต้องไม่เติมให้มั่ว',
    statutoryAmount('ssf') === null && statutoryAmount('lifeInsurance') === null
    && statutoryAmount('homeLoanInterest') === null && statutoryAmount('ไม่มีช่องนี้') === null);
  check('รายการช่องยอดตายตัวมีแค่คู่สมรสในตอนนี้ (ส่วนตัวเป็น auto อยู่แล้ว)',
    STATUTORY_KEYS.join(',') === 'spouse', STATUTORY_KEYS.join(','));

  // Tick → the law's figure. Untick → nothing. No third state.
  const ticked = resolveStatutory('spouse', SPOUSE_ALLOWANCE);
  check('ติ๊กแล้วได้ยอดตามกฎหมายเป๊ะ และไม่ถือว่า "กรอกเอง"',
    ticked.on === true && near(ticked.amount, 60000) && ticked.overridden === false,
    baht(ticked.amount));
  const unticked = resolveStatutory('spouse', 0);
  check('ติ๊กออกแล้วเป็นศูนย์ ไม่ใช่ค้างไว้ที่ ฿60,000',
    unticked.on === false && unticked.amount === 0 && unticked.overridden === false);
  check('ช่องที่ไม่ใช่ยอดตายตัว resolveStatutory ตอบ null ไม่ใช่แกล้งตอบเป็นศูนย์',
    resolveStatutory('ssf', 200000) === null);

  // The override, and the way back.
  const own = resolveStatutory('spouse', 30000);
  check('พิมพ์ทับเป็น ฿30,000 (เช่น จดทะเบียนกลางปี) — ระบบเก็บตามที่พิมพ์ แต่ติดธงว่าทับค่ามาตรฐาน',
    near(own.amount, 30000) && own.overridden === true, baht(own.amount));
  check('ธงนั้นมาพร้อมบรรทัดกู้คืน "ค่ามาตรฐาน ฿60,000 · คำนวณใหม่" — คำไทยอยู่ใน taxTH ไม่ใช่ใน JSX',
    own.hint === 'ค่ามาตรฐาน ฿60,000' && own.restore === 'คำนวณใหม่'
    && statutoryHint('spouse') === 'ค่ามาตรฐาน ฿60,000' && RESTORE_LABEL === 'คำนวณใหม่',
    `${own.hint} · ${own.restore}`);
  check('… และใช้คำเดียวกับลิงก์ของแถวประกันสังคม ไม่ใช่คำใหม่ให้ต้องเรียนรู้',
    RESTORE_LABEL === 'คำนวณใหม่');

  // BACKWARD COMPATIBILITY — the case that must never regress.
  const legacySpouse = computeTax(profileOf(1000000, { spouse: 45000 }));
  check('แถวเก่าที่กรอก ฿45,000 ไว้ ยังเป็น ฿45,000 — ไม่ถูกปัดขึ้นเป็น ฿60,000 ให้เอง',
    near(legacySpouse.rows.spouse.allowed, 45000) && legacySpouse.rows.spouse.capped === false,
    baht(legacySpouse.rows.spouse.allowed));
  check('… และถูกอ่านเป็น "กรอกเอง" จึงมีลิงก์ให้กดกลับไปใช้ค่ามาตรฐานได้',
    resolveStatutory('spouse', 45000).overridden === true);
  check('แถวเก่าที่บังเอิญกรอก ฿60,000 พอดี ไม่ต้องขึ้นลิงก์ให้รกตา',
    resolveStatutory('spouse', 60000).overridden === false);
  check('กรอกเกินยอดตามกฎหมาย ยังโดนเพดานเดิมตัดเหมือนเคย',
    near(computeTax(profileOf(1000000, { spouse: 100000 })).rows.spouse.allowed, 60000));
}

section('F2 · บุตร — นับเป็นคน และกฎคนที่ 2 ที่เกิดตั้งแต่ปี 2561');
{
  check(`อัตราอยู่ในไฟล์คำนวณ: คนละ ${baht(CHILD_ALLOWANCE)} · คนที่ 2+ ที่เกิดตั้งแต่ พ.ศ. ${CHILD_SECOND_BORN_FROM_BE} = ${baht(CHILD_ALLOWANCE_SECOND)}`,
    CHILD_ALLOWANCE === 30000 && CHILD_ALLOWANCE_SECOND === 60000
    && CHILD_SECOND_BORN_FROM_BE === 2561);

  const kid = (n, q) => childrenAllowance(n, q);
  check('บุตร 1 คน = ฿30,000', near(kid(1, 0).amount, 30000), baht(kid(1, 0).amount));
  check('บุตร 2 คน ไม่มีใครเข้าเงื่อนไขปี 2561 = ฿60,000',
    near(kid(2, 0).amount, 60000), baht(kid(2, 0).amount));
  check('บุตร 2 คน คนที่ 2 เกิดตั้งแต่ปี 2561 = ฿90,000 (30,000 + 60,000)',
    near(kid(2, 1).amount, 90000), baht(kid(2, 1).amount));
  check('บุตร 3 คน ไม่เข้าเงื่อนไขเลย = ฿90,000',
    near(kid(3, 0).amount, 90000), baht(kid(3, 0).amount));
  check('บุตร 3 คน เข้าเงื่อนไข 2 คน = ฿150,000 (30,000 + 60,000 + 60,000)',
    near(kid(3, 2).amount, 150000), baht(kid(3, 2).amount));
  check('ไม่มีบุตร = ฿0 และไม่มีบรรทัดที่มาให้อ่าน',
    kid(0, 0).amount === 0 && childrenDerivation(0, 0) === null);

  // The first child NEVER qualifies, whenever he was born — so a saved pair
  // that says otherwise under-claims rather than over-claims.
  check('ลูกคนแรกไม่เข้าเงื่อนไขไม่ว่าเกิดปีไหน — กรอก (1 คน, เข้าเงื่อนไข 1) ยังได้แค่ ฿30,000',
    near(kid(1, 1).amount, 30000) && kid(1, 1).second === 0 && kid(1, 1).qualifyingClamped === true,
    baht(kid(1, 1).amount));
  check('เข้าเงื่อนไขมากกว่าที่เป็นไปได้ ถูกหั่นลงมาที่ (จำนวนบุตร − 1) เสมอ',
    kid(3, 9).second === 2 && near(kid(3, 9).amount, 150000)
    && maxQualifyingChildren(3) === 2 && maxQualifyingChildren(0) === 0);
  check('ค่าขยะ/ติดลบ/ทศนิยม ถูกอ่านเป็นจำนวนคนที่มีจริง ไม่ทำให้เงินเพี้ยน',
    kid(-2, -1).amount === 0 && near(kid(2.9, 1.7).amount, 90000)
    && kid('abc', 'abc').amount === 0, baht(kid(2.9, 1.7).amount));

  // The derivation the row prints — pinned here so the wording cannot drift.
  check('บรรทัดที่มาแจกแจงทีละคน: "2 คน = 30,000 + 60,000 = ฿90,000"',
    childrenDerivation(2, 1) === '2 คน = 30,000 + 60,000 = ฿90,000', childrenDerivation(2, 1));
  check('… 2 คนธรรมดา: "2 คน = 30,000 + 30,000 = ฿60,000"',
    childrenDerivation(2, 0) === '2 คน = 30,000 + 30,000 = ฿60,000', childrenDerivation(2, 0));
  check('… 3 คน เข้าเงื่อนไข 2: "3 คน = 30,000 + 60,000 + 60,000 = ฿150,000"',
    childrenDerivation(3, 2) === '3 คน = 30,000 + 60,000 + 60,000 = ฿150,000', childrenDerivation(3, 2));
  check('… คนเดียวไม่ต้องโชว์บวก: "1 คน = ฿30,000"',
    childrenDerivation(1, 0) === '1 คน = ฿30,000', childrenDerivation(1, 0));

  // …and the same numbers coming out of the real computation, two rows deep.
  const r = computeTax(profileOf(4000000, { children: 2, childrenExtra: 1 }));
  check('computeTax แตกเป็นสองแถวเหมือนเดิม (บุตร ฿60,000 + คนที่ 2 อีก ฿30,000) รวม = ฿90,000',
    near(r.rows.children.allowed, 60000) && near(r.rows.childrenExtra.allowed, 30000)
    && near(r.rows.children.allowed + r.rows.childrenExtra.allowed,
            childrenAllowance(2, 1).amount),
    baht(r.rows.children.allowed + r.rows.childrenExtra.allowed));
  check('… และจำนวนคนเดินทางมาถึงผลลัพธ์ด้วย เพื่อให้ UI เปิดตัวนับกลับมาได้',
    r.counts.children.count === 2 && r.counts.children.second === 1,
    `${r.counts.children.count}/${r.counts.children.second}`);
  const incoherent = computeTax(profileOf(4000000, { children: 1, childrenExtra: 1 }));
  check('แถวที่ค้างมาแบบไม่สอดคล้อง (บุตร 1 · คนที่ 2 อีก 1) หักได้แค่ ฿30,000 ไม่ใช่ ฿60,000',
    near(incoherent.rows.children.allowed, 30000)
    && near(incoherent.rows.childrenExtra.allowed, 0),
    baht(incoherent.rows.children.allowed + incoherent.rows.childrenExtra.allowed));
}

section('F3 · บิดามารดา — คนละ ฿30,000 ไม่เกิน 4 คน');
{
  check(`อัตราและเพดานอยู่ในไฟล์คำนวณ: คนละ ${baht(PARENT_ALLOWANCE)} · ไม่เกิน ${PARENT_MAX_COUNT} คน`,
    PARENT_ALLOWANCE === 30000 && PARENT_MAX_COUNT === 4
    && DEDUCTION_BY_KEY.parents.maxCount === PARENT_MAX_COUNT);

  for (const [n, amount] of [[1, 30000], [2, 60000], [3, 90000], [4, 120000]]) {
    check(`บิดามารดา ${n} คน = ${baht(amount)}`,
      near(parentsAllowance(n).amount, amount) && parentsAllowance(n).capped === false,
      baht(parentsAllowance(n).amount));
  }
  check('คนที่ 5 หักไม่ได้ — ตัวนับหยุดที่ 4 และติดธงว่าชนเพดาน',
    parentsAllowance(5).count === 4 && near(parentsAllowance(5).amount, 120000)
    && parentsAllowance(5).capped === true, baht(parentsAllowance(5).amount));
  check('เพดานของตัวนับคือ 4 — UI กดปุ่ม + ต่อไม่ได้ เพราะถามมาจากที่เดียวกับที่คำนวณ',
    countCeiling('parents') === 4 && countCeiling('parents', { parents: 9 }) === 4);
  check('ไม่มีบิดามารดาในอุปการะ = ฿0 และไม่มีบรรทัดที่มา',
    parentsAllowance(0).amount === 0 && parentsDerivation(0) === null);
  check('บรรทัดที่มา: "2 คน × 30,000 = ฿60,000"',
    parentsDerivation(2) === '2 คน × 30,000 = ฿60,000', parentsDerivation(2));
  check('… และกรอกเกิน 4 บรรทัดที่มายังพูดความจริงว่าหักได้แค่ 4 คน',
    parentsDerivation(9) === '4 คน × 30,000 = ฿120,000', parentsDerivation(9));

  // The conditions, said next to the stepper instead of left to memory.
  check('เงื่อนไขสิทธิถูกเขียนไว้ให้ UI แสดง ไม่ใช่ให้จำเอง: 60 ปี · เงินได้ไม่เกิน ฿30,000 · ลูกใช้สิทธิซ้ำไม่ได้',
    PARENT_ELIGIBILITY.length === 3
    && /60 ปีขึ้นไป/.test(PARENT_ELIGIBILITY[0])
    && /฿30,000/.test(PARENT_ELIGIBILITY[1])
    && /คนเดียว/.test(PARENT_ELIGIBILITY[2]),
    PARENT_ELIGIBILITY.join(' · '));
  check('… และผูกไว้กับแถวบิดามารดาโดยตรง',
    DEDUCTION_BY_KEY.parents.conditions === PARENT_ELIGIBILITY);

  // The pre-existing over-claim guard still holds, through the new plumbing.
  const six = computeTax(profileOf(4000000, { parents: 6 }));
  check('กรอกมาเป็น 6 (แถวเก่า) → ยังหักได้ ฿120,000 · count = 4 · ติดธงชนเพดาน',
    near(six.rows.parents.allowed, 120000) && six.rows.parents.count === 4
    && six.rows.parents.capped === true, baht(six.rows.parents.allowed));
}

section('F4 · ตัวนับที่ขึ้นกับตัวนับอื่น และการเก็บลง jsonb');
{
  check('เพดานของ "บุตรคนที่ 2 ขึ้นไป" = จำนวนบุตร − 1 เสมอ',
    countCeiling('childrenExtra', { children: 0 }) === 0
    && countCeiling('childrenExtra', { children: 1 }) === 0
    && countCeiling('childrenExtra', { children: 2 }) === 1
    && countCeiling('childrenExtra', { children: 5 }) === 4);
  check('ช่องบุตรเองไม่มีเพดานตามกฎหมาย — ระบบต้องไม่แอบตั้งเพดานเอง',
    countCeiling('children', { children: 9 }) === Infinity);
  check('ยังไม่มีบุตรถึง 2 คน → บอกเหตุผลตรง ๆ แทนที่จะปล่อยให้กดแล้วไม่ขยับ',
    countBlockedNote('childrenExtra', { children: 1 }) === CHILD_SECOND_NEEDS_TWO
    && countBlockedNote('childrenExtra', { children: 2 }) === null
    && countBlockedNote('parents', {}) === null, CHILD_SECOND_NEEDS_TWO);

  // Lowering บุตร must take the dependent count down with it, or a ghost
  // number sits in the jsonb and reappears the next time he adds a child.
  check('ลดบุตรจาก 3 เหลือ 1 → ตัวนับ "คนที่ 2 ขึ้นไป" ถูกลดเป็น 0 ในแพตช์เดียวกัน',
    JSON.stringify(countPatch('children', 1, { children: 3, childrenExtra: 2 }))
      === JSON.stringify({ children: 1, childrenExtra: 0 }),
    JSON.stringify(countPatch('children', 1, { children: 3, childrenExtra: 2 })));
  check('ลดบุตรจาก 3 เหลือ 2 → ลดเหลือ 1 พอดีเพดานใหม่ ไม่ล้างทิ้งทั้งหมด',
    JSON.stringify(countPatch('children', 2, { children: 3, childrenExtra: 2 }))
      === JSON.stringify({ children: 2, childrenExtra: 1 }));
  check('เพิ่มบุตร ไม่ไปยุ่งกับตัวนับอีกช่อง',
    JSON.stringify(countPatch('children', 5, { children: 3, childrenExtra: 2 }))
      === JSON.stringify({ children: 5 }));
  check('ช่องอื่น ๆ แพตช์คีย์เดียวเหมือนเดิม ไม่มีผลข้างเคียง',
    JSON.stringify(countPatch('ssf', 200000, { children: 3, childrenExtra: 2 }))
      === JSON.stringify({ ssf: 200000 })
    && JSON.stringify(countPatch('spouse', 60000, {})) === JSON.stringify({ spouse: 60000 }));

  check('ช่องที่นับเป็นคนมีสามช่อง และทุกช่องมีอัตราต่อคนกำกับไว้',
    COUNT_KEYS.join(',') === 'children,childrenExtra,parents'
    && COUNT_KEYS.every(k => DEDUCTION_BY_KEY[k].per > 0), COUNT_KEYS.join(','));

  // What actually lands in the jsonb: counts, in the same keys as before.
  const ded = { children: 2, childrenExtra: 1, parents: 3, spouse: SPOUSE_ALLOWANCE };
  const round = JSON.parse(JSON.stringify(ded));
  const reopened = resolveCounts(round);
  check('บันทึกลง jsonb เป็น "จำนวนคน" คีย์เดิม แล้วเปิดกลับมาได้ครบทั้งสองตัวนับ',
    reopened.children.count === 2 && reopened.children.second === 1
    && reopened.parents.count === 3 && near(reopened.children.amount, 90000)
    && near(reopened.parents.amount, 90000));
  check('… และยอดที่ภาษีใช้จริงยังคำนวณจากจำนวนคนเสมอ ไม่ใช่จากบาทที่เก็บซ้ำไว้',
    near(computeTax(profileOf(4000000, round)).rows.children.allowed
       + computeTax(profileOf(4000000, round)).rows.childrenExtra.allowed
       + computeTax(profileOf(4000000, round)).rows.parents.allowed
       + computeTax(profileOf(4000000, round)).rows.spouse.allowed, 240000),
    baht(240000));

  check('บรรทัดที่มาถูกส่งต่อไปตามชนิดของแถว ไม่ใช่เขียนซ้ำในหน้าเว็บ',
    countDerivation('children', ded) === '2 คน = 30,000 + 60,000 = ฿90,000'
    && countDerivation('childrenExtra', ded) === '1 คน × 30,000 = ฿30,000'
    && countDerivation('parents', ded) === '3 คน × 30,000 = ฿90,000'
    && countDerivation('ssf', { ssf: 200000 }) === null,
    countDerivation('childrenExtra', ded));

  const full = computeTax(profileOf(4000000, ded));
  const dv = derivations(full);
  check('แผงผลลัพธ์อ่านบรรทัดเดียวกันนี้ — ไม่มีคำไทยลอยอยู่ใน JSX ให้เทสต์เอื้อมไม่ถึง',
    dv.children === '2 คน = 30,000 + 60,000 = ฿90,000'
    && dv.parents === '3 คน × 30,000 = ฿90,000', `${dv.children} · ${dv.parents}`);
}

// ════════════════════ CASH-FLOW CHART (v4.33) ════════════════════
// The chart's window must be anchored to the CURRENT month. The old page built
// it with lastNMonths(12, yearMonth) and passed onMonthClick={setYearMonth},
// so every click rebuilt the window around the clicked month and the later
// months vanished — "พอกดแล้วเดือนก็หายไป".
{
  section('v4.33 · กราฟกระแสเงินสด · หน้าต่าง 12 เดือนตรึงกับเดือนปัจจุบัน');

  const TODAY = '2026-08';
  const win = cashflowWindow(TODAY);

  check('หน้าต่างกราฟมี 12 เดือน จบที่เดือนปัจจุบัน',
    win.length === 12 && win[11] === TODAY && win[0] === '2025-09',
    `${win[0]} → ${win[11]}`);

  check('ข้ามปีถูกต้อง — นับถอยหลังจากมกราคมไปปีก่อน',
    cashflowWindow('2026-01')[0] === '2025-02'
    && cashflowWindow('2026-01')[11] === '2026-01');

  // ── THE HEADLINE BUG ────────────────────────────────────────────────────
  // The window function does not take the selection at all; selecting is a
  // separate, pure lookup. Proven by holding one series and moving only the
  // selection across it.
  const agg = win.map((ym, i) => ({ ym, income: 100000 + i * 1000, expense: 80000 + i * 500, count: 3 }));
  const series = cashflowSeries(agg, TODAY);
  const monthsOf = (s) => s.map(d => d.ym).join(',');
  const before = monthsOf(series);
  const selA = resolveSelection(series, '2026-03');
  const selB = resolveSelection(series, '2025-11');
  check('เลือกเดือนอื่นแล้วชุดเดือนในกราฟไม่ขยับเลย (บั๊กหลัก)',
    monthsOf(cashflowSeries(agg, TODAY)) === before
    && selA === 6 && selB === 2
    && series[series.length - 1].ym === TODAY,
    `sel ${selA}/${selB} · ยังจบที่ ${series[11].ym}`);

  check('เลือกเดือนที่อยู่นอกหน้าต่าง (กดจาก MonthNav ไปไกล) → ตกกลับมาที่เดือนปัจจุบัน',
    resolveSelection(series, '2024-01') === 11
    && resolveSelection(series, '2030-06') === 11);

  check('cashflowSeries เติมเดือนที่ไม่มีข้อมูลเป็นศูนย์ และตัดเดือนนอกหน้าต่างทิ้ง',
    cashflowSeries([{ ym: '2020-01', income: 9e9, expense: 9e9 }, { ym: '2026-08', income: 5, expense: 2 }], TODAY)
      .every(d => d.ym !== '2020-01')
    && cashflowSeries([], TODAY).length === 12
    && cashflowSeries([], TODAY).every(d => d.income === 0 && d.expense === 0 && d.savingsRate === 0));

  section('v4.33 · แถบสรุปเดือนที่เลือก · เลข ▲▼ และ % ออม');

  check('อัตราการออม: รายรับเป็นศูนย์ได้ 0 ไม่ใช่ NaN/Infinity',
    savingsRate(0, 5000) === 0 && Number.isFinite(savingsRate(0, 5000))
    && savingsRate(0, 0) === 0);

  check('อัตราการออมติดลบได้เมื่อจ่ายเกินรับ',
    near(savingsRate(100000, 150000), -50) && near(savingsRate(100000, 25000), 75));

  check('เดลต้า % ขึ้น/ลง คำนวณจากเดือนก่อนหน้า',
    near(pctDelta(150, 100), 50) && near(pctDelta(80, 100), -20) && pctDelta(100, 100) === 0);

  check('เดือนก่อนหน้าเป็นศูนย์ → ไม่โชว์ % (null) ไม่ใช่ Infinity หรือ 100% มั่ว',
    pctDelta(500, 0) === null && pctDelta(0, 0) === null,
    String(pctDelta(500, 0)));

  check('ไม่มีเดือนก่อนหน้า (ช่องซ้ายสุด) → ไม่โชว์ %',
    pctDelta(500, null) === null
    && monthReadout(series, series[0].ym).expenseDelta === null
    && monthReadout(series, series[0].ym).hasPrev === false);

  const zeroIncome = cashflowSeries(
    [{ ym: '2026-07', income: 0, expense: 0 }, { ym: '2026-08', income: 0, expense: 12000 }], TODAY);
  const zr = monthReadout(zeroIncome, '2026-08');
  check('เดือนที่ไม่มีรายรับเลย: คงเหลือติดลบ, ออม 0%, เดลต้าไม่หารด้วยศูนย์',
    zr.net === -12000 && zr.savingsRate === 0 && zr.expenseDelta === null
    && Number.isFinite(zr.net) && Number.isFinite(zr.savingsRate),
    `net ${zr.net} · ออม ${zr.savingsRate}% · Δ ${zr.expenseDelta}`);

  const rd = monthReadout(series, '2026-03');
  check('แถบสรุปอ่านตัวเลขของเดือนที่เลือก พร้อมเดลต้าเทียบเดือนก่อน',
    rd.ym === '2026-03' && rd.income === 106000 && rd.expense === 83000
    && rd.net === 23000 && near(rd.expenseDelta, 100 * 500 / 82500),
    `${rd.income}/${rd.expense}`);

  // "↩ เดือนนี้" is rendered on !isCurrent — one flag, asserted at both ends.
  check('ชิป "↩ เดือนนี้" โผล่เฉพาะตอนที่เลือกไม่ใช่เดือนปัจจุบัน',
    monthReadout(series, TODAY).isCurrent === true
    && monthReadout(series, '2026-03').isCurrent === false
    && monthReadout(series, '2025-09').isCurrent === false
    // out-of-window falls back to today → chip stays hidden, no contradiction
    && monthReadout(series, '2019-01').isCurrent === true);

  check('ปุ่ม ‹ › ปิดตัวเองที่ปลายทั้งสองข้าง',
    monthReadout(series, series[0].ym).hasPrev === false
    && monthReadout(series, series[0].ym).hasNext === true
    && monthReadout(series, TODAY).hasNext === false
    && monthReadout(series, TODAY).hasPrev === true);

  section('v4.33 · เรขาคณิตของแท่งกราฟ');

  const geo = chartGeometry(series);
  check('มี 12 กลุ่มแท่ง และสเกลอิงค่าสูงสุดของทั้งรายรับและรายจ่าย',
    geo.bars.length === 12 && geo.max === 111000, String(geo.max));

  check('ทุกแท่งยืนบนเส้นฐานเดียวกัน (y + h = baseY)',
    geo.bars.every(b => near(b.income.y + b.income.h, geo.baseY, 0.02)
                     && near(b.expense.y + b.expense.h, geo.baseY, 0.02)));

  check('ช่องไฟในคู่เดือนเดียวกัน = 2px พอดี',
    geo.bars.every(b => near(b.expense.x - (b.income.x + b.income.w), 2, 0.02)),
    String(geo.bars[0].expense.x - (geo.bars[0].income.x + geo.bars[0].income.w)));

  check('แท่งสูงกว่าเมื่อเงินมากกว่า และแท่งที่สูงสุดเต็มพื้นที่กราฟ',
    geo.bars[11].income.h > geo.bars[0].income.h
    && near(geo.bars[11].income.h, geo.innerH, 0.02));

  const zeroGeo = chartGeometry(cashflowSeries([], TODAY));
  check('เดือนที่เป็นศูนย์ไม่วาดตอแท่งหลอกตา และไม่มี NaN แม้ข้อมูลว่างทั้งหน้าต่าง',
    zeroGeo.bars.every(b => b.income.h === 0 && b.expense.h === 0)
    && zeroGeo.bars.every(b => Number.isFinite(b.cx) && Number.isFinite(b.income.y))
    && zeroGeo.grid.every(t => Number.isFinite(t.y)));

  check('เส้นตาราง 3 เส้น + ป้ายแกนแบบย่อ',
    geo.grid.length === 3 && geo.grid[2].label === '111K',
    geo.grid.map(t => t.label).join(' / '));

  check('ป้ายแกนย่อแบบ 87K / 1.2M ไม่ใช่ 87.0K',
    compactBaht(87000) === '87K' && compactBaht(1200000) === '1.2M'
    && compactBaht(1000000) === '1M' && compactBaht(940) === '940' && compactBaht(0) === '0',
    [87000, 1200000, 940].map(compactBaht).join(' / '));

  // ── v4.61 · A12 Major 3 — the chart header's average, and its denominator ──
  // The readout divides by the months that HAVE a figure, not by the 12-slot
  // window (Loop's ledger starts mid-2569, so a window average would divide
  // real months by months the household never lived through). That is a
  // legitimate statistic and a misleading label, so the maths moved here and
  // the component's copy became "เฉลี่ยเดือนที่มีรายการ". These cases pin the
  // boundary behaviour the audit asked for: all-zero, single month, full window.
  {
    const win = (rows) => cashflowWindow(TODAY).map((ym, i) => ({
      ym, income: rows[i]?.income || 0, expense: rows[i]?.expense || 0,
    }));

    const allZero = averageMonthlyNet(win([]));
    check('A12·3 หน้าต่างว่างทั้ง 12 เดือน — avg/total เป็น 0 ที่นิยามไว้ชัด และนับได้ 0 เดือน (คอมโพเนนต์จึงไม่ต้องโชว์ค่าเฉลี่ย)',
      allZero.avg === 0 && allZero.total === 0
      && allZero.monthsCounted === 0 && allZero.windowMonths === 12,
      JSON.stringify(allZero));

    // ONE active month of ฿30,000 net in a 12-slot window. The window average
    // would be ฿2,500 — this function says ฿30,000 and reports monthsCounted 1,
    // so the label can name which denominator it used.
    const single = averageMonthlyNet(win(
      Object.assign([], { 11: { income: 30000, expense: 0 } })));
    check('A12·3 มีข้อมูลเดือนเดียวใน 12 ช่อง — เฉลี่ยเป็น ฿30,000 (เดือนที่มีรายการ) ไม่ใช่ ฿2,500 (หารทั้งหน้าต่าง) และบอกว่านับ 1 เดือน',
      single.avg === 30000 && single.monthsCounted === 1
      && single.total === 30000 && single.windowMonths === 12,
      `avg ${single.avg} · นับ ${single.monthsCounted}/${single.windowMonths}`);

    // Every slot active: the two denominators agree, so the number is the same
    // one a naive window average would have produced.
    const full = averageMonthlyNet(win(Array.from({ length: 12 }, () => ({ income: 10000, expense: 4000 }))));
    check('A12·3 มีข้อมูลครบทั้ง 12 เดือน — ตัวหารสองแบบตรงกัน เฉลี่ย ฿6,000',
      full.avg === 6000 && full.monthsCounted === 12 && full.total === 72000,
      `avg ${full.avg} · นับ ${full.monthsCounted}/${full.windowMonths}`);

    // A month with expense only is ACTIVE (it is data), and drags the average
    // negative — the component flips the wording to "ขาด", never hides it.
    const negative = averageMonthlyNet(win(
      Object.assign([], { 10: { income: 0, expense: 8000 }, 11: { income: 10000, expense: 2000 } })));
    check('A12·3 เดือนที่มีแต่รายจ่ายก็นับเป็นเดือนที่มีรายการ และค่าเฉลี่ยติดลบได้',
      negative.monthsCounted === 2 && negative.avg === 0 && negative.total === 0
      && averageMonthlyNet(win(Object.assign([], { 11: { income: 0, expense: 5000 } }))).avg === -5000,
      `นับ ${negative.monthsCounted} · avg ${negative.avg}`);

    check('A12·3 null-safe เหมือนฟังก์ชันอื่นในไฟล์ — ไม่มี series ก็ไม่ throw',
      averageMonthlyNet().monthsCounted === 0 && averageMonthlyNet([]).avg === 0
      && averageMonthlyNet([{ ym: '2026-08' }]).monthsCounted === 0);
  }

  const p = barPath(10, 100, 16, 50);
  check('แท่งมนหัวบน แบนที่ฐาน — เส้นเริ่มและจบที่เส้นฐาน',
    p.startsWith('M 10 150 ') && p.trim().endsWith('L 26 150 Z') && p.includes('Q'),
    p);

  check('แท่งเตี้ยมาก ๆ รัศมีถูกหนีบไม่ให้ล้นแท่ง และแท่งศูนย์ไม่วาดอะไรเลย',
    barPath(0, 198, 16, 2).includes('Q 0 198 2 198') && barPath(0, 200, 16, 0) === ''
    && barPath(0, 200, 0, 40) === '');

  section('v4.33 · การ์ดอื่นยังอ่านหน้าต่างเดือนที่กำลังดูเหมือนเดิม');

  // trend12 now spans the UNION of both windows, so the consumers that mean
  // "the browsed 12 months" (MoneyLeaks / RecurringTracker / forecast /
  // emergency fund) are re-clipped with filterToMonths — their input has to
  // stay byte-identical to what it was before the chart window was pinned.
  const rows = [
    { id: 'a', occurred_at: '2026-08-10T03:00:00Z', amount: -100 },   // in
    { id: 'b', occurred_at: '2026-05-10T03:00:00Z', amount: -100 },   // in
    { id: 'c', occurred_at: '2025-01-10T03:00:00Z', amount: -100 },   // out
    { id: 'd', occurred_at: '2026-07-31T17:30:00Z', amount: -100 },   // 1 ส.ค. เวลาไทย
  ];
  const kept = filterToMonths(rows, cashflowWindow('2026-08')).map(r => r.id).join(',');
  check('filterToMonths ตัดตามเดือนแบบเวลาไทย ไม่ใช่ UTC',
    kept === 'a,b,d', kept);

  check('… และตัดเดือนที่อยู่นอกหน้าต่างที่กำลังดูออกจริง',
    filterToMonths(rows, ['2025-01']).map(r => r.id).join(',') === 'c');
}

// ════════════════════════════════════════════════════════════════════════════
//  v4.34 · เงินรั่ว · Insights — drill-down rows + the duplicate-label defect
// ════════════════════════════════════════════════════════════════════════════
{
  const ts = (ymd, hh = '05') => `${ymd}T${hh}:00:00Z`;
  const exp = (id, ymd, amount, category, type, extra = {}) =>
    ({ id, occurred_at: ts(ymd), amount, category, type, title: id, ...extra });

  section('v4.34 · จัดกลุ่มหมวด — คีย์รวม, ป้ายที่แยกจากกันได้จริง');

  check('ช่องว่างหัวท้าย/ซ้ำ และตัวพิมพ์ใหญ่-เล็ก รวมเป็นกลุ่มเดียว',
    (() => {
      const g = groupExpensesByCategory([
        exp('a', '2026-08-01', -100, 'อาหาร', 'food'),
        exp('b', '2026-08-02', -100, '  อาหาร ', 'food'),
        exp('c', '2026-08-03', -100, 'อาหาร  ', 'food'),
        exp('d', '2026-08-04', -50, 'Grab', 'transport'),
        exp('e', '2026-08-05', -50, 'grab', 'transport'),
      ]);
      return g.length === 2 && g[0].category === 'อาหาร' && g[0].count === 3
        && g[1].category === 'Grab' && g[1].count === 2;
    })());

  check('หมวดว่าง/ไม่มี → "อื่น ๆ" กลุ่มเดียว',
    (() => {
      const g = groupExpensesByCategory([
        exp('a', '2026-08-01', -10, '', 'other'),
        exp('b', '2026-08-02', -10, null, 'other'),
        exp('c', '2026-08-03', -10, '   ', 'other'),
      ]);
      return g.length === 1 && g[0].category === OTHER_CATEGORY && g[0].count === 3;
    })(),
    normalizeCategory('  ') + ' / ' + categoryKey(' อาหาร '));

  check('รายรับและรายการโอนสกอปไม่ถูกนับเป็นรายจ่าย',
    (() => {
      const g = groupExpensesByCategory([
        exp('a', '2026-08-01', -100, 'อาหาร', 'food'),
        exp('b', '2026-08-02', 5000, 'รายรับ', 'income'),
        { id: 'c', occurred_at: ts('2026-08-03'), amount: -9999, category: 'โอนภายใน', type: 'transfer' },
      ]);
      return g.length === 1 && g[0].amount === 100;
    })());

  check('รายการในกลุ่มเรียงใหม่สุดก่อน และผลรวมของรายการ = ยอดที่โชว์',
    (() => {
      const g = groupExpensesByCategory([
        exp('old', '2026-08-01', -100, 'อาหาร', 'food'),
        exp('new', '2026-08-20', -300, 'อาหาร', 'food'),
        exp('mid', '2026-08-10', -200, 'อาหาร', 'food'),
      ])[0];
      return g.txns.map(t => t.id).join(',') === 'new,mid,old'
        && sumExpense(g.txns) === g.amount && g.txns.length === g.count;
    })());

  check('sortNewestFirst ไม่แก้อาร์เรย์ต้นฉบับ และตัดสินเสมอด้วย id',
    (() => {
      const src = [exp('b', '2026-08-01', -1, 'x', 'other'), exp('a', '2026-08-01', -1, 'x', 'other')];
      const out = sortNewestFirst(src);
      return src[0].id === 'b' && out.map(t => t.id).join(',') === 'a,b';
    })());

  section('v4.34 · บั๊ก "อาหาร — เล็กแต่ถี่" โผล่สองแถว');

  // The owner's screenshot: 27 ครั้ง เฉลี่ย ฿185 and 12 ครั้ง เฉลี่ย ฿99, both
  // titled "อาหาร". Root cause: 'กาแฟ' is written by the importers
  // (autoCategorize / kbankPdfParser) but is NOT in the category picker, so
  // the card's label lookup missed and fell back to the first category with
  // the same `type` — 'food' → 'อาหาร'. Two groups, one visible name.
  {
    const food   = Array.from({ length: 27 }, (_, i) => exp('f' + i, '2026-08-' + String((i % 28) + 1).padStart(2, '0'), -185, 'อาหาร', 'food'));
    const coffee = Array.from({ length: 12 }, (_, i) => exp('c' + i, '2026-08-' + String((i % 28) + 1).padStart(2, '0'), -99, 'กาแฟ', 'food'));
    const ins = buildLeakInsights({ txns: [...food, ...coffee], prevTxns: [], trend12: [], debts: [] });

    check('สองหมวดที่ type เดียวกันยังคงเป็นสองแถวที่ชื่อ "ต่างกัน" ไม่ใช่ "อาหาร" ซ้ำสองครั้ง',
      ins.frequent.length === 2
      && new Set(ins.frequent.map(f => f.category)).size === 2
      && ins.frequent.map(f => f.category).sort().join('|') === 'กาแฟ|อาหาร',
      ins.frequent.map(f => `${f.category}(${f.count})`).join(' + '));

    check('ตัวเลขของแต่ละแถวยังตรงกับที่ผู้ใช้เห็นในสกรีนช็อต',
      (() => {
        const byCat = Object.fromEntries(ins.frequent.map(f => [f.category, f]));
        return byCat['อาหาร'].count === 27 && Math.round(byCat['อาหาร'].avg) === 185
          && byCat['กาแฟ'].count === 12 && Math.round(byCat['กาแฟ'].avg) === 99;
      })());

    check('… และไม่มีรายการไหนหลุดข้ามหมวด — ทุกใบในแถวเป็นหมวดของแถวนั้นล้วน',
      ins.frequent.every(f => f.txns.every(t => categoryKey(t.category) === f.key)));
  }

  section('v4.34 · ทุกแถวพกรายการที่ประกอบเป็นตัวเลขของตัวเอง');

  const thisMonth = [
    ...Array.from({ length: 6 }, (_, i) => exp('food' + i, '2026-08-0' + (i + 1), -200, 'อาหาร', 'food')),
    ...Array.from({ length: 7 }, (_, i) => exp('cof' + i, '2026-08-1' + i, -100, 'กาแฟ', 'food')),
    exp('shop1', '2026-08-20', -5000, 'ช้อปปิ้ง', 'shop'),
    { id: 'inc', occurred_at: ts('2026-08-25'), amount: 50000, category: 'รายรับ', type: 'income', title: 'เงินเดือน' },
  ];
  const lastMonth = [
    exp('pshop', '2026-07-10', -1000, 'ช้อปปิ้ง', 'shop'),
    exp('pfood', '2026-07-11', -900, 'อาหาร', 'food'),
    { id: 'pinc', occurred_at: ts('2026-07-25'), amount: 50000, category: 'รายรับ', type: 'income', title: 'เงินเดือน' },
  ];
  const leaks = buildLeakInsights({ txns: thisMonth, prevTxns: lastMonth, trend12: [], debts: [] });

  check('creep · ผลรวมของรายการที่กดดู = ยอด "เดือนนี้" ที่โชว์บนแถว ทุกแถว',
    leaks.creep.length === 3
    && leaks.creep.every(c => sumExpense(c.txns) === c.amount && c.txns.length === c.count),
    leaks.creep.map(c => `${c.category}:${c.amount}/${sumExpense(c.txns)}`).join(' '));

  check('creep · เดลต้าคิดจากหมวดเดียวกันของเดือนก่อน และเรียงตัวโตสุดก่อน',
    leaks.creep[0].category === 'ช้อปปิ้ง' && leaks.creep[0].delta === 4000
    && leaks.creep[1].category === 'กาแฟ'   && leaks.creep[1].delta === 700
    && leaks.creep[2].category === 'อาหาร'  && leaks.creep[2].delta === CREEP_MIN_DELTA,
    leaks.creep.map(c => `${c.category}+${c.delta}`).join(' '));

  check('frequent · เข้าเกณฑ์เมื่อ ≥ 6 ครั้ง และผลรวมรายการ = ยอดบนแถว',
    leaks.frequent.length === 2
    && leaks.frequent.every(f => f.count >= FREQUENT_MIN_COUNT
      && sumExpense(f.txns) === f.amount
      && Math.abs(f.avg - f.amount / f.count) < 1e-9),
    leaks.frequent.map(f => `${f.category}:${f.count}`).join(' '));

  check('หมวดที่ถูกกันออกเพราะยังไม่ถึงเกณฑ์ ก็ไม่โผล่มาเป็นแถว',
    !leaks.frequent.some(f => f.category === 'ช้อปปิ้ง'));

  check('topCats (ตอนไม่มีอะไรเข้าเกณฑ์) ก็พกรายการมาด้วยเหมือนกัน',
    leaks.topCats.length === 3
    && leaks.topCats[0].category === 'ช้อปปิ้ง'
    && leaks.topCats.every(c => sumExpense(c.txns) === c.amount));

  section('v4.34 · บิล/subscription — กดดูได้ทีละรายการ');

  const months = ['2025-09', '2025-10', '2025-11', '2025-12', '2026-01', '2026-02',
    '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08'];
  const trend = [
    ...months.map((ym, i) => ({ id: 'nf' + i, occurred_at: ts(ym + '-05'), amount: -419, category: 'บันเทิง', type: 'other', title: 'Netflix' })),
    ...months.slice(6).map((ym, i) => ({ id: 'sp' + i, occurred_at: ts(ym + '-09'), amount: -199, category: 'บันเทิง', type: 'other', title: 'Spotify' })),
    { id: 'once', occurred_at: ts('2026-08-11'), amount: -1500, category: 'ช้อปปิ้ง', type: 'shop', title: 'เก้าอี้' },
  ];
  // `yearMonth` is stated out loud so these claims don't quietly decay: the
  // fixtures are August 2026, and since v4.39 the viewed month decides which
  // bills are still alive. Leaving it to the fallback would make the case
  // start failing the moment the real calendar moved past ก.ย. 69.
  const subs = buildLeakInsights({ txns: thisMonth, prevTxns: lastMonth, trend12: trend, debts: [], yearMonth: '2026-08' });

  check('เจอบิลซ้ำสองรายการ และรายการที่เกิดครั้งเดียวไม่ถูกนับเป็นบิล',
    subs.recurring.length === 2
    && subs.recurring.map(r => r.title).join(',') === 'Netflix,Spotify',
    subs.recurring.map(r => `${r.title}:${r.avgAmount}`).join(' '));

  check('subscription · ค่าเฉลี่ยของรายการที่กดดู = ตัวเลขบนแถวนั้นเป๊ะ ๆ',
    subs.recurring.every(r => r.txns.length > 0
      && Math.round(sumExpense(r.txns) / r.txns.length) === r.avgAmount),
    subs.recurring.map(r => `${r.title} ${sumExpense(r.txns)}/${r.txns.length}→${r.avgAmount}`).join(' · '));

  check('subscription · แต่ละรายการพกเฉพาะใบเรียกเก็บของตัวเอง เรียงใหม่สุดก่อน',
    (() => {
      const nf = subs.recurring.find(r => r.title === 'Netflix');
      const sp = subs.recurring.find(r => r.title === 'Spotify');
      const desc = (a) => a.every((t, i) => i === 0 || a[i - 1].occurred_at >= t.occurred_at);
      return nf.txns.length === 12 && nf.txns.every(t => t.title === 'Netflix') && desc(nf.txns)
        && sp.txns.length === 6 && sp.txns.every(t => t.title === 'Spotify') && desc(sp.txns)
        && nf.monthsCount === 12 && sp.monthsCount === 6;
    })());

  check('ยอดรวมบนแถวสรุป = ผลบวกค่าเฉลี่ยรายเดือนของทุกบิลที่แสดง',
    subs.recurringTotal === subs.recurring.reduce((s, r) => s + r.avgAmount, 0)
    && subs.recurringTotal === 419 + 199,
    String(subs.recurringTotal));

  check('แสดงบิลได้มากสุด 4 รายการ',
    (() => {
      const many = [];
      for (let n = 0; n < 7; n++) {
        for (const ym of months.slice(0, 3)) {
          many.push({ id: `m${n}-${ym}`, occurred_at: ts(ym + '-03'), amount: -(1000 - n * 100), category: 'บิล', type: 'bills', title: 'บิล ' + n });
        }
      }
      // Viewed from 2025-11 — the last month these seven bills were charged,
      // so every one of them is alive and the cap is the only thing cutting.
      const r = buildLeakInsights({ txns: thisMonth, prevTxns: [], trend12: many, debts: [], yearMonth: '2025-11' }).recurring;
      return r.length === 4 && r.every(x => x.txns.length === 3);
    })());

  section('v4.34 · แถวดอกเบี้ยหนี้ + วันที่ในรายการ');

  const debtIns = buildLeakInsights({
    txns: thisMonth, prevTxns: lastMonth, trend12: [],
    debts: [
      { id: 'd1', name: 'บ้าน',  monthly_payment: 10000, total_months: 24, months_paid: 0, interest_rate: 4.1, original_principal: 200000 },
      { id: 'd2', name: 'บัตร',  monthly_payment: 5000,  total_months: 12, months_paid: 0, interest_rate: 20,  original_principal: 55000 },
      { id: 'd3', name: 'ปิดแล้ว', monthly_payment: 9999, total_months: 12, months_paid: 0, interest_rate: 30, original_principal: 1, is_active: false },
    ],
  });

  check('ดอกเบี้ยรวมนับเฉพาะก้อนที่ยัง active และแถวย่อยเรียงก้อนดอกมากสุดก่อน',
    debtIns.remainingInterest === 45000
    && debtIns.debtRows.length === 2
    && debtIns.debtRows[0].debt.id === 'd1' && debtIns.debtRows[1].debt.id === 'd2'
    && debtIns.debtRows.reduce((s, r) => s + r.remainingInterest, 0) === debtIns.remainingInterest,
    String(debtIns.remainingInterest));

  check('"ถล่มก้อนดอกสูงสุดก่อน" ชี้ที่ดอกเบี้ยแพงสุด ไม่ใช่ยอดหนี้ใหญ่สุด',
    debtIns.worst?.id === 'd2', debtIns.worst?.name);

  check('วันที่ในรายการอ่านเป็นวันแบบเวลาไทยเสมอ ไม่ขึ้นกับ TZ ของเครื่อง',
    leakDateLabel('2026-07-31T17:30:00Z') === '1 ส.ค. 69'
    && leakDateLabel('2026-07-31T16:59:00Z') === '31 ก.ค. 69'
    && leakDateLabel(null) === '—',
    leakDateLabel('2026-07-31T17:30:00Z') + ' / ' + leakDateLabel('2026-07-31T16:59:00Z'));

  check('การ์ดว่างไม่ระเบิด — ทุกลิสต์เป็นอาร์เรย์ว่าง ตัวเลขเป็นศูนย์',
    (() => {
      const empty = buildLeakInsights({});
      return empty.creep.length === 0 && empty.frequent.length === 0
        && empty.recurring.length === 0 && empty.topCats.length === 0
        && empty.debtRows.length === 0 && empty.remainingInterest === 0
        && empty.thisSum.expense === 0 && empty.recurringTotal === 0;
    })());

  // ══════════════════════════════════════════════════════════════════════════
  //  v4.39 · การ์ดเขียน "เดือนนี้" แต่โชว์บิลที่จ่ายจบไปแล้ว
  //
  //  Owner: "ตรงฟังชั่น เงินรั่ว ด้านขวาเขียนเดือนนี้ แต่รายละเอียดคือเดือนอื่น
  //  เช็คด่วน". กรมสรรพากร ฿9,608/ด sat in the subscriptions row in ส.ค. 69
  //  with exactly two charges behind it — 8 พ.ค. and 8 มิ.ย. — a finished
  //  2-installment tax payment. The detector reads 12 months on purpose (two
  //  months is the minimum evidence of a bill), but nothing ever asked
  //  whether the bill was still being charged, so it also fed ฿9,608 into the
  //  ฿17,683/เดือน the row claimed was leaking THIS month.
  // ══════════════════════════════════════════════════════════════════════════
  section('v4.39 · บิลซ้ำต้อง "ยังเรียกเก็บอยู่" ถึงจะขึ้นการ์ดเดือนนี้');

  // The owner's own two-installment tax payment, plus a bill that is genuinely
  // still running, in one window — the card has to tell them apart.
  const bill = (title, amount, ymds) => ymds.map((ymd, i) =>
    ({ id: `${title}-${i}`, occurred_at: ts(ymd), amount: -amount, category: 'บิล', type: 'bills', title }));
  const revenue = bill('กรมสรรพากร', 9608, ['2026-05-08', '2026-06-08']);
  const netflix = bill('Netflix', 419, ['2026-05-05', '2026-06-05', '2026-07-05', '2026-08-05']);
  const lapsed  = bill('ฟิตเนส', 1200, ['2026-06-20', '2026-07-20']);   // viewed-1 = ยังนับ
  const window12 = [...revenue, ...netflix, ...lapsed];

  const aug = buildLeakInsights({ txns: thisMonth, prevTxns: [], trend12: window12, debts: [], yearMonth: '2026-08' });

  check('มองจาก ส.ค. · กรมสรรพากร (จ่ายจบตั้งแต่ มิ.ย.) หายไปจากการ์ด',
    !aug.recurring.some(r => r.title === 'กรมสรรพากร'),
    aug.recurring.map(r => r.title).join(', ') || '(ว่าง)');

  check('มองจาก ส.ค. · บิลที่เรียกเก็บเดือนนี้ (Netflix) และเดือนก่อนหน้า (ฟิตเนส) ยังอยู่ครบ',
    aug.recurring.length === 2
    && aug.recurring.some(r => r.title === 'Netflix')
    && aug.recurring.some(r => r.title === 'ฟิตเนส'),
    aug.recurring.map(r => `${r.title}@${bangkokMonth(r.lastDate)}`).join(' '));

  check('ยอดรวม/เดือน คิดจากลิสต์ที่กรองแล้วเท่านั้น — ไม่รวม ฿9,608 ที่จ่ายจบแล้ว',
    aug.recurringTotal === 419 + 1200
    && aug.recurringTotal === aug.recurring.reduce((s, r) => s + r.avgAmount, 0),
    `${aug.recurringTotal} (เดิมจะเป็น ${419 + 1200 + 9608})`);

  check('บิลที่ถูกกรองออกไม่เหลือร่องรอยในโครงสร้างที่การ์ดวาด',
    JSON.stringify(aug.recurring).indexOf('กรมสรรพากร') === -1);

  check('ขอบเขตชัด · เรียกเก็บล่าสุดเดือนที่ดู = อยู่, ก่อนหน้า 1 เดือน = อยู่, 2 เดือน = ตัดทิ้ง',
    isRecurringAlive({ lastDate: ts('2026-08-05') }, '2026-08') === true
    && isRecurringAlive({ lastDate: ts('2026-07-31') }, '2026-08') === true
    && isRecurringAlive({ lastDate: ts('2026-06-30') }, '2026-08') === false
    && isRecurringAlive({ lastDate: null }, '2026-08') === false);

  check('ข้ามปีก็ยังนับถูก — ธ.ค. คือเดือนก่อนหน้าของ ม.ค.',
    isRecurringAlive({ lastDate: ts('2025-12-28') }, '2026-01') === true
    && isRecurringAlive({ lastDate: ts('2025-11-28') }, '2026-01') === false);

  check('เส้นแบ่งเดือนคิดแบบเวลาไทย — 31 ก.ค. 23:30 UTC คือ 1 ส.ค. ของกรุงเทพ',
    isRecurringAlive({ lastDate: '2026-07-31T17:30:00Z' }, '2026-09') === true
    && isRecurringAlive({ lastDate: '2026-07-31T16:59:00Z' }, '2026-09') === false,
    bangkokMonth('2026-07-31T17:30:00Z') + ' / ' + bangkokMonth('2026-07-31T16:59:00Z'));

  // Time travel: MonthNav can walk the card back into the past, and the card
  // has to describe THAT month, not today. Viewed from มิ.ย. the tax payment
  // was a live bill and belongs on the card.
  const jun = buildLeakInsights({ txns: thisMonth, prevTxns: [], trend12: window12, debts: [], yearMonth: '2026-06' });

  check('ย้อนดู มิ.ย. · กรมสรรพากรกลับมาอยู่บนการ์ด เพราะตอนนั้นยังเรียกเก็บอยู่จริง',
    jun.recurring.some(r => r.title === 'กรมสรรพากร')
    && jun.recurringTotal === jun.recurring.reduce((s, r) => s + r.avgAmount, 0),
    jun.recurring.map(r => r.title).join(', '));

  check('ย้อนดู มี.ค. · ยังไม่มีบิลไหนเกิดขึ้นเลย การ์ดว่างและยอดเป็นศูนย์',
    (() => {
      const mar = buildLeakInsights({ txns: thisMonth, prevTxns: [], trend12: window12, debts: [], yearMonth: '2026-03' });
      return mar.recurring.length === 0 && mar.recurringTotal === 0;
    })());

  check('ไม่ส่ง yearMonth มา (หรือส่งค่าเพี้ยน) → ใช้เดือนปัจจุบันเวลาไทยแทน',
    (() => {
      const live = bill('บิลปัจจุบัน', 350,
        [`${previousMonth(currentYearMonth())}-05`, `${currentYearMonth()}-05`]);
      const dead = bill('บิลที่ตายแล้ว', 9608, ['2020-01-08', '2020-02-08']);
      const trend12x = [...live, ...dead];
      const expected = buildLeakInsights({ txns: thisMonth, trend12: trend12x, yearMonth: currentYearMonth() });
      const shapes = [undefined, '', '   ', 'ส.ค. 69', '2026-13-99'].map(ym =>
        buildLeakInsights({ txns: thisMonth, trend12: trend12x, yearMonth: ym }));
      return expected.recurring.length === 1
        && expected.recurring[0].title === 'บิลปัจจุบัน'
        && shapes.every(s => s.recurring.length === 1
          && s.recurring[0].title === 'บิลปัจจุบัน'
          && s.recurringTotal === expected.recurringTotal);
    })());

  check('ตัวกรองทำงานก่อนตัดที่ 4 แถว — บิลที่ตายแล้วไม่กินที่บิลที่ยังอยู่',
    (() => {
      // Five dead bills sorted ABOVE five live ones by amount. Filtering after
      // the slice would leave the card with nothing to show.
      const dead = Array.from({ length: 5 }, (_, n) =>
        bill(`ตาย ${n}`, 20000 - n * 100, ['2026-01-05', '2026-02-05'])).flat();
      const alive = Array.from({ length: 5 }, (_, n) =>
        bill(`อยู่ ${n}`, 900 - n * 100, ['2026-07-05', '2026-08-05'])).flat();
      const r = buildLeakInsights({ txns: thisMonth, trend12: [...dead, ...alive], yearMonth: '2026-08' });
      return r.recurring.length === MAX_RECURRING_ROWS
        && r.recurring.every(x => x.title.startsWith('อยู่'))
        && r.recurringTotal === 900 + 800 + 700 + 600;
    })());

  // ══════════════════════════════════════════════════════════════════════════
  //  v4.40 · A4 — '2026-13' ผ่านการเช็ครูปแบบ แต่ไม่ใช่เดือน
  //
  //  The shape check said 'YYYY-MM' and stopped there, so '2026-13' walked
  //  into previousMonth() and came back '2026-12': December charges could be
  //  read as "เรียกเก็บล่าสุด". A month has to be 01–12 or it is not a month.
  // ══════════════════════════════════════════════════════════════════════════
  section('v4.40 · เดือนที่ส่งเข้ามาต้องเป็นเดือนจริง 01–12');

  check('เดือนนอกช่วง 01–12 ตกไปใช้เดือนปัจจุบัน เหมือนค่าที่อ่านไม่ออก',
    resolveYearMonth('2026-13') === currentYearMonth()
    && resolveYearMonth('2026-00') === currentYearMonth()
    && resolveYearMonth('2026-99') === currentYearMonth()
    && resolveYearMonth('ส.ค. 69') === currentYearMonth()
    && resolveYearMonth('') === currentYearMonth()
    && resolveYearMonth(undefined) === currentYearMonth(),
    `2026-13 → ${resolveYearMonth('2026-13')}`);

  check('ขอบทั้งสองข้างยังใช้ได้จริง — 01 และ 12 ผ่าน และเดือนก่อนหน้าถูกต้อง',
    resolveYearMonth('2026-01') === '2026-01' && resolveYearMonth('2026-12') === '2026-12'
    && resolveYearMonth(' 2026-07 ') === '2026-07'
    && previousMonth('2026-01') === '2025-12' && previousMonth('2026-12') === '2026-11',
    `${previousMonth('2026-01')} / ${previousMonth('2026-12')}`);

  check('… และ 2026-13 ไม่ลากบิลของ ธ.ค. เข้ามา — ผลเท่ากับทางที่ตกไปใช้เดือนปัจจุบัน',
    isRecurringAlive({ lastDate: ts('2026-12-08') }, '2026-13')
      === isRecurringAlive({ lastDate: ts('2026-12-08') }, currentYearMonth())
    && isRecurringAlive({ lastDate: ts('2026-12-08') }, '2026-12') === true,
    String(isRecurringAlive({ lastDate: ts('2026-12-08') }, '2026-13')));

  check('ส่วนอื่นของการ์ดไม่ถูกแตะ — creep / frequent / หนี้ ยังให้ผลเดิมทุกประการ',
    (() => {
      const before = buildLeakInsights({ txns: thisMonth, prevTxns: lastMonth, trend12: [], debts: [], yearMonth: '2026-08' });
      return JSON.stringify(before.creep) === JSON.stringify(leaks.creep)
        && JSON.stringify(before.frequent) === JSON.stringify(leaks.frequent)
        && JSON.stringify(before.topCats) === JSON.stringify(leaks.topCats)
        && before.thisSum.expense === leaks.thisSum.expense
        && before.srDelta === leaks.srDelta;
    })());
}

// ════════════════════════════════════════════════════════════════════════════
//  G · บัตรเครดิต (v4.36) — src/lib/creditCards.js + src/lib/api/creditCards.js
//
//  The card grid shows four things that can quietly be WRONG: utilisation,
//  the annual-fee waiver counter, the next statement/due date, and the monthly
//  interest on a revolving balance. All four are pure functions here, so all
//  four are pinned here — including the two date cases that only bite on some
//  days of some months (a 31st statement day in a 30-day month, and a day that
//  has already passed this month).
// ════════════════════════════════════════════════════════════════════════════
{
  section('v4.36 · ใช้วงเงิน (utilization) — ไม่มีวงเงิน ≠ ใช้ 0%');

  check('เปอร์เซ็นต์ใช้วงเงินคิดจากยอด ÷ วงเงิน',
    Math.round(utilizationPct(6540, 300000) * 10) / 10 === 2.2,
    String(utilizationPct(6540, 300000)));

  check('ไม่มีวงเงิน / วงเงิน 0 → null ไม่ใช่ 0% (การ์ดจะได้ไม่โชว์แถบว่างแบบสบายใจ)',
    utilizationPct(50674, null) === null && utilizationPct(50674, 0) === null
    && utilizationPct(50674, undefined) === null && utilizationPct(1, 'abc') === null);

  check('ยอดติดลบถูกปัดเป็น 0 และยอดเกินวงเงินยังรายงานเกิน 100% ตามจริง',
    utilizationPct(-500, 10000) === 0 && utilizationPct(12000, 10000) === 120);

  check('เส้นสุขภาพเครดิตบูโรคือ 30% และเพดานดอกเบี้ย ธปท. คือ 16%',
    HEALTHY_UTILIZATION === 30 && DEFAULT_INTEREST_RATE === 0.16);

  section('v4.36 · ยอดของบัตร — ผูกหนี้แล้วตารางหนี้เป็นเจ้าของตัวเลข');

  const ktcDebt = { id: 'debt-ktc', name: 'KTC MC', remaining_balance: 50674 };

  check('บัตรที่ผูก debt_id อ่านยอดจากตารางหนี้ ไม่ใช่ช่องที่พิมพ์เอง',
    cardBalance({ debt_id: 'debt-ktc', manual_balance: 999 }, [ktcDebt]) === 50674);

  check('บัตรที่ไม่ผูก ใช้ยอดที่พิมพ์เอง',
    cardBalance({ debt_id: null, manual_balance: 6540 }, [ktcDebt]) === 6540);

  check('ผูกไว้แต่หาก้อนหนี้ไม่เจอ (ถูกลบไปแล้ว) → ตกกลับมาที่ยอดที่พิมพ์เอง ไม่ระเบิด',
    cardBalance({ debt_id: 'ghost', manual_balance: 1200 }, [ktcDebt]) === 1200
    && cardBalance(null, []) === 0 && cardBalance({}, []) === 0);

  section('v4.36 · ตัวนับฟรีค่าธรรมเนียม — นับครั้ง / นับบาท / ไม่มีเงื่อนไข');

  check('โหมด none = ฟรีไม่มีเงื่อนไข ถือว่าผ่านแล้วเสมอ',
    (() => {
      const w = waiverStatus({ waiver_mode: 'none' });
      return w.met === true && w.remaining === 0 && w.mode === 'none';
    })());

  check('บัตรที่ไม่ได้ตั้งโหมดไว้เลย ก็ถือเป็น none',
    waiverStatus({}).mode === 'none' && waiverStatus(null).met === true);

  check('นับครั้ง 2/12 → เหลืออีก 10 ครั้ง ยังไม่ผ่าน (KBank)',
    (() => {
      const w = waiverStatus({ waiver_mode: 'count', waiver_target: 12, waiver_progress: 2 });
      return w.remaining === 10 && w.met === false && Math.round(w.pct) === 17;
    })());

  check('นับครั้งครบ 12/12 และรูดเกิน 14/12 → ผ่าน เหลือ 0 ไม่ติดลบ',
    (() => {
      const met  = waiverStatus({ waiver_mode: 'count', waiver_target: 12, waiver_progress: 12 });
      const over = waiverStatus({ waiver_mode: 'count', waiver_target: 12, waiver_progress: 14 });
      return met.met && met.remaining === 0 && over.met && over.remaining === 0 && over.pct === 100;
    })());

  check('นับบาท 23,500/100,000 → เหลืออีก 76,500฿ (CardX)',
    (() => {
      const w = waiverStatus({ waiver_mode: 'amount', waiver_target: 100000, waiver_progress: 23500 });
      return w.mode === 'amount' && w.remaining === 76500 && w.met === false && w.pct === 23.5;
    })());

  check('มีเงื่อนไขแต่ยังไม่ได้ใส่เป้า → ยังไม่ผ่าน (ไม่แอบบอกว่าปลอดภัย)',
    (() => {
      const w = waiverStatus({ waiver_mode: 'amount', waiver_progress: 5000 });
      return w.met === false && w.target === 0 && w.pct === null;
    })());

  section('v4.36 · รอบบิลถัดไป — วันที่ 31 ในเดือน 30 วัน และวันที่เลยไปแล้ว');

  check('จำนวนวันในเดือนถูกต้อง รวมปีอธิกสุรทิน',
    daysInMonth(2026, 4) === 30 && daysInMonth(2026, 2) === 28
    && daysInMonth(2028, 2) === 29 && daysInMonth(2026, 12) === 31);

  check('วันสรุปยอด 31 ในเดือนเมษายน (30 วัน) → บีบเป็น 30 เม.ย. ไม่ใช่ข้ามเดือน',
    nextDayOfMonth(31, '2026-04-10') === '2026-04-30');

  check('วันสรุปยอด 31 ในเดือนกุมภาพันธ์ → 28 ก.พ. (และ 29 ก.พ. ในปีอธิกสุรทิน)',
    nextDayOfMonth(31, '2026-02-01') === '2026-02-28'
    && nextDayOfMonth(31, '2028-02-01') === '2028-02-29');

  check('วันนั้นผ่านไปแล้วในเดือนนี้ → เด้งไปเดือนหน้า',
    nextDayOfMonth(5, '2026-08-16') === '2026-09-05');

  check('วันนี้ตรงกับวันสรุปยอดพอดี → คือวันนี้ ไม่ใช่เดือนหน้า',
    nextDayOfMonth(20, '2026-08-20') === '2026-08-20');

  check('ข้ามปี — วันที่ 5 เมื่อวันนี้คือ 20 ธ.ค. → 5 ม.ค. ปีถัดไป',
    nextDayOfMonth(5, '2026-12-20') === '2027-01-05');

  check('เด้งไปเดือนหน้าแล้วยังบีบวันให้พอดีเดือนนั้น (31 → 30 มิ.ย.)',
    nextDayOfMonth(31, '2026-06-30') === '2026-06-30'
    && nextDayOfMonth(31, '2026-05-31') === '2026-05-31'
    && nextDayOfMonth(31, '2026-06-01') === '2026-06-30');

  check('วันที่ใช้ไม่ได้ (ว่าง / 0 / 32 / ไม่ใช่ตัวเลข) → null ไม่ใช่วันมั่ว',
    nextDayOfMonth(null, '2026-08-16') === null && nextDayOfMonth(0, '2026-08-16') === null
    && nextDayOfMonth(32, '2026-08-16') === null && nextDayOfMonth('x', '2026-08-16') === null);

  check('สรุปยอดกับครบกำหนดคิดแยกกัน — 16 ส.ค. บัตรสรุป 20 ครบกำหนด 5 → 20 ส.ค. / 5 ก.ย.',
    (() => {
      const c = nextCycleDates(20, 5, '2026-08-16');
      return c.statement === '2026-08-20' && c.due === '2026-09-05';
    })());

  check('… และวันที่ 3 ส.ค. บัตรใบเดียวกันยังเห็นงวด 5 ส.ค. ที่ยังพลาดได้อยู่',
    (() => {
      const c = nextCycleDates(20, 5, '2026-08-03');
      return c.statement === '2026-08-20' && c.due === '2026-08-05';
    })());

  check('ไม่ส่ง today มา ก็ยังได้วันที่ไม่ย้อนหลังจากวันนี้แบบเวลาไทย (ไม่ขึ้นกับ TZ เครื่อง)',
    (() => {
      const c = nextCycleDates(15, 28);
      return c.statement >= todayStr() && c.due >= todayStr();
    })(), todayStr());

  check('ป้ายวันที่เป็น พ.ศ. สองหลักแบบเดียวกับที่อื่นในแอป',
    cycleDateLabel('2026-08-25') === '25 ส.ค. 69' && cycleDateLabel(null) === '—');

  section('v4.36 · ดอกเบี้ยประมาณการเดือนนี้');

  check('50,674฿ @16%/ปี → ~676฿/เดือน (ตรงกับตัวเลขในแบบร่าง)',
    Math.round(monthlyInterestEstimate(50674)) === 676, String(monthlyInterestEstimate(50674)));

  check('ยอด 0 / ติดลบ / ดอกเบี้ย 0 → 0 ไม่ใช่ NaN',
    monthlyInterestEstimate(0) === 0 && monthlyInterestEstimate(-100) === 0
    && monthlyInterestEstimate(10000, 0) === 0 && monthlyInterestEstimate(null) === 0);

  check('ใส่อัตราเองได้ — 100,000฿ @18% = 1,500฿/เดือน',
    monthlyInterestEstimate(100000, 0.18) === 1500);

  section('v4.36 · สรุปหัวแท็บ — ใบที่ยกเลิกแล้วไม่ถูกนับในทุกช่อง');

  const gridCards = [
    { id: 'c1', name: 'KBank PLUSTINUM', status: 'active', pays_full: true, credit_limit: 300000,
      manual_balance: 6540, statement_day: 25, due_day: 10,
      waiver_mode: 'count', waiver_target: 12, waiver_progress: 2, annual_fee: 1250, sort_order: 1 },
    { id: 'c2', name: 'CardX ULTRA', status: 'active', pays_full: true, credit_limit: 45000,
      manual_balance: 4180, statement_day: 16, due_day: 1,
      waiver_mode: 'amount', waiver_target: 100000, waiver_progress: 23500, annual_fee: 5350, sort_order: 2 },
    { id: 'c3', name: 'KTC MC', status: 'active', pays_full: false, credit_limit: 65000,
      debt_id: 'debt-ktc', statement_day: 20, due_day: 5, waiver_mode: 'none', sort_order: 3 },
    { id: 'c4', name: 'ใบที่ยกเลิกแล้ว', status: 'cancelled', pays_full: false, credit_limit: 500000,
      manual_balance: 400000, statement_day: 1, due_day: 2,
      waiver_mode: 'amount', waiver_target: 999999, waiver_progress: 0, annual_fee: 9999, sort_order: 0 },
  ];
  const sum = summarizeCards({ cards: gridCards, debts: [ktcDebt], today: '2026-08-16' });

  check('วงเงินรวม/ยอดรวมนับเฉพาะใบที่ยังใช้อยู่ และใบที่ยกเลิกไม่ถูกนับ',
    sum.limit === 410000 && sum.balance === 61394,
    `${sum.balance} / ${sum.limit}`);

  check('เปอร์เซ็นต์รวมคิดจากสองยอดนั้น',
    Math.round(sum.utilization * 10) / 10 === 15, String(sum.utilization));

  check('"ยอดที่ยังกินดอก" นับเฉพาะใบ pays_full=false และดึงยอดจากตารางหนี้',
    sum.revolvingBalance === 50674 && sum.revolvingCount === 1
    && Math.round(sum.monthlyInterest) === 676);

  check('"เฝ้าระวังค่าธรรมเนียม" = ใบที่มีเงื่อนไขและยังไม่ผ่าน + รวมค่าธรรมเนียมที่เสี่ยงเสีย',
    sum.watchCards.map(c => c.id).join(',') === 'c1,c2' && sum.annualFeeAtRisk === 6600);

  // 16 ส.ค. — CardX สรุปยอดวันที่ 16 พอดี จึงเป็น "วันนี้" ไม่ใช่ KTC วันที่ 20.
  check('"บิลถัดไป" คือวันสรุปยอดที่ใกล้สุดของใบที่ยังใช้อยู่ พร้อมบอกว่าใบไหน',
    sum.nextStatement.date === '2026-08-16' && sum.nextStatement.card.id === 'c2'
    && sum.nextDue.date === '2026-09-01' && sum.nextDue.card.id === 'c2',
    sum.nextStatement.date + ' / ' + sum.nextDue.date);

  check('การ์ดว่างไม่ระเบิด — ทุกช่องเป็น 0/null/อาร์เรย์ว่าง',
    (() => {
      const s = summarizeCards({});
      return s.limit === 0 && s.balance === 0 && s.utilization === null
        && s.revolvingBalance === 0 && s.watchCards.length === 0
        && s.nextStatement === null && s.activeCount === 0;
    })());

  check('ใบที่ยกเลิกแล้วถูกดันไปท้ายกริดเสมอ ที่เหลือเรียงตาม sort_order',
    sortCards(gridCards).map(c => c.id).join(',') === 'c1,c2,c3,c4');

  section('v4.36 · โปรไฟล์ค่าธรรมเนียม + รายการผ่อน 0%');

  check('ช่องที่เว้นว่างไว้ไม่กลายเป็นแถวเปล่าในตาราง ธปท.',
    (() => {
      const rows = feeProfileRows({ fee_profile: { interest: '16% ต่อปี', fx: '   ', benefits: 'ประกันเดินทาง' } });
      return rows.length === 2 && rows[0].key === 'interest' && rows[1].key === 'benefits';
    })());

  check('ไม่มี fee_profile เลย → ไม่มีแถว ไม่ระเบิด',
    feeProfileRows({}).length === 0 && feeProfileRows(null).length === 0);

  check('รายการผ่อน 0% อ่านจาก jsonb และตัวเลขถูกแปลงเป็นตัวเลขจริง',
    (() => {
      const rows = installmentRows({ installments: [{ label: 'iPhone 17', principal: '18900', per_month: '2700', paid: 3, total: 10 }] });
      return rows.length === 1 && rows[0].principal === 18900 && rows[0].perMonth === 2700
        && rows[0].total - rows[0].paid === 7;
    })());

  check('ไม่มีผ่อน / ข้อมูลเพี้ยน → อาร์เรย์ว่าง ไม่ throw',
    installmentRows({}).length === 0 && installmentRows({ installments: 'x' }).length === 0);

  // ══════════════════════════════════════════════════════════════════════════
  //  v4.40 · A2 — ลิงก์ตาราง ธปท. เป็นข้อความที่เจ้าของพิมพ์เอง
  //
  //  fee_profile.bot_url ถูกส่งเข้า <a href> ตรง ๆ ค่าที่เป็น javascript:
  //  จึงกลายเป็นโค้ดที่รันตอนคลิกแทนที่จะเป็นลิงก์ไป ธปท. — ต้องผ่านตัวกรอง
  //  ทั้งตอนบันทึกและตอนวาด
  // ══════════════════════════════════════════════════════════════════════════
  section('v4.40 · ลิงก์ ธปท. รับเฉพาะ http/https');

  check('ลิงก์เว็บจริงผ่าน และช่องว่างหัวท้ายถูกตัดทิ้ง',
    safeHttpUrl('https://app.bot.or.th/fee') === 'https://app.bot.or.th/fee'
    && safeHttpUrl('http://bot.or.th') === 'http://bot.or.th'
    && safeHttpUrl('  https://app.bot.or.th/fee  ') === 'https://app.bot.or.th/fee');

  check('javascript: / data: / vbscript: ไม่ใช่ลิงก์ → null (การ์ดจะได้ไม่วาด <a> เลย)',
    safeHttpUrl('javascript:alert(1)') === null
    && safeHttpUrl('JavaScript:alert(1)') === null
    && safeHttpUrl('  javascript:alert(1)') === null
    && safeHttpUrl('data:text/html,<script>alert(1)</script>') === null
    && safeHttpUrl('vbscript:msgbox(1)') === null,
    String(safeHttpUrl('javascript:alert(1)')));

  check('ข้อความมั่ว / ว่าง / ไม่ใช่สตริง → null ไม่ throw',
    safeHttpUrl('ตาราง ธปท.') === null && safeHttpUrl('bot.or.th') === null
    && safeHttpUrl('') === null && safeHttpUrl('   ') === null
    && safeHttpUrl(null) === null && safeHttpUrl(undefined) === null
    && safeHttpUrl(12345) === null && safeHttpUrl({}) === null);

  // ══════════════════════════════════════════════════════════════════════════
  //  v4.41 · รูปหน้าบัตรจริง — face_url
  //
  //  ต่างจาก bot_url ตรงที่ค่าปกติของช่องนี้คือ path ในแอปเอง
  //  ('/cards/kbank-plustinum.png') ซึ่ง new URL() อ่านไม่ได้ ตัวกรองจึงต้อง
  //  ยอมรับ path แต่ต้องไม่หลงว่า '//evil.com/x.png' เป็น path เพราะนั่นคือ
  //  โฮสต์ของคนอื่นที่สวมสแลชมา
  // ══════════════════════════════════════════════════════════════════════════
  section('v4.41 · รูปหน้าบัตร รับเฉพาะ path ของแอปเอง หรือ http/https');

  check('path ในแอปผ่าน และลิงก์เว็บจริงก็ยังผ่าน (ช่องว่างหัวท้ายถูกตัด)',
    safeFaceUrl('/cards/x.png') === '/cards/x.png'
    && safeFaceUrl('  /cards/kbank-plustinum.png  ') === '/cards/kbank-plustinum.png'
    && safeFaceUrl('https://cdn.example.com/x.png') === 'https://cdn.example.com/x.png'
    && safeFaceUrl('http://cdn.example.com/x.png') === 'http://cdn.example.com/x.png',
    String(safeFaceUrl('/cards/x.png')));

  check('//evil.com/x.png คือโฮสต์อื่น ไม่ใช่ path → null (รวมถึงกลลวง backslash/ช่องว่าง)',
    safeFaceUrl('//evil.com/x.png') === null
    && safeFaceUrl('/\\evil.com/x.png') === null
    && safeFaceUrl('/cards/ a.png') === null
    && safeFaceUrl('/cards/\nx.png') === null,
    String(safeFaceUrl('//evil.com/x.png')));

  check('javascript: / data: / ข้อความมั่ว / ว่าง / ไม่ใช่สตริง → null (การ์ดกลับไปใช้ตัวย่อ)',
    safeFaceUrl('javascript:alert(1)') === null
    && safeFaceUrl('  JavaScript:alert(1)') === null
    && safeFaceUrl('data:image/png;base64,AAAA') === null
    && safeFaceUrl('cards/x.png') === null && safeFaceUrl('รูปบัตร') === null
    && safeFaceUrl('') === null && safeFaceUrl('   ') === null
    && safeFaceUrl(null) === null && safeFaceUrl(undefined) === null
    && safeFaceUrl(12345) === null && safeFaceUrl({}) === null);

  // ══════════════════════════════════════════════════════════════════════════
  //  v4.43 · วงเงินร่วม — บัตรสองใบ วงเงินก้อนเดียว
  //
  //  เจ้าของบัตรพูดเอง (16 ส.ค. 69): "จริงๆ KTC มี 2 ใบ mastercard คือบัตรหลัก
  //  Visa คือบัตรคล้ายบัตรเสริม แต่ใช้วงเงินร่วมกับบัตรเเรก สองบัตรรวมกันคือ
  //  150000" — ก่อนหน้านี้แอปคิดว่าทุกใบมีวงเงินของตัวเอง วงเงิน KTC เลยถูกนับ
  //  เป็น 300,000฿ (สองใบ) หรือ Visa ขึ้นว่า "ยังไม่ได้ใส่วงเงิน" ทั้งสองแบบ
  //  ทำให้ % ใช้วงเงินดูดีกว่าที่ธนาคาร/เครดิตบูโรเห็นจริง
  // ══════════════════════════════════════════════════════════════════════════
  section('v4.43 · วงเงินร่วม — สองใบ KTC = วงเงินเดียว 150,000฿');

  const mcDebt   = { id: 'debt-mc',   name: 'KTC Mastercard (วิศวจุฬา)', remaining_balance: 50674 };
  const visaDebt = { id: 'debt-visa', name: 'KTC VISA Platinum',        remaining_balance: 60817 };
  const ktcDebts = [mcDebt, visaDebt];

  // ทรงเดียวกับแถวจริงในฐานข้อมูล (seed_credit_cards.sql §5)
  const kbank  = { id: 'kb', name: 'KBank PLUSTINUM', status: 'active', pays_full: true,
    credit_limit: 300000, manual_balance: 6540, shared_limit_card_id: null, sort_order: 0 };
  const ktcMC  = { id: 'mc', name: 'KTC วิศวจุฬา Platinum', status: 'active', pays_full: false,
    credit_limit: 150000, debt_id: 'debt-mc', shared_limit_card_id: null, sort_order: 1 };
  const ktcVisa = { id: 'visa', name: 'KTC VISA PLATINUM', status: 'active', pays_full: false,
    credit_limit: null, debt_id: 'debt-visa', shared_limit_card_id: 'mc', sort_order: 2 };
  const lineCards = [kbank, ktcMC, ktcVisa];

  check('ใบหลักเป็นเจ้าของวงเงินตัวเอง · ใบเสริมชี้ไปที่ใบหลัก',
    lineOf(ktcMC, lineCards).id === 'mc' && lineOf(ktcVisa, lineCards).id === 'mc'
    && lineOf(kbank, lineCards).id === 'kb');

  check('ชี้ไปที่ใบที่ถูกลบไปแล้ว / ชี้ใส่ตัวเอง → ถือว่ามีวงเงินของตัวเอง ไม่ระเบิด',
    lineOf({ id: 'x', shared_limit_card_id: 'ghost' }, lineCards).id === 'x'
    && lineOf({ id: 'y', shared_limit_card_id: 'y' }, [] ).id === 'y'
    && lineOf(null, lineCards) === null);

  check('วงจร A→B→A → ต่างคนต่างถือวงเงินของตัวเอง (ไม่วนไม่ค้าง) และ A→B→C จบที่ C',
    (() => {
      const a = { id: 'a', shared_limit_card_id: 'b', credit_limit: 10000, status: 'active' };
      const b = { id: 'b', shared_limit_card_id: 'a', credit_limit: 20000, status: 'active' };
      const c = { id: 'c', shared_limit_card_id: null, credit_limit: 30000, status: 'active' };
      const b2 = { id: 'b', shared_limit_card_id: 'c', credit_limit: null, status: 'active' };
      const a2 = { id: 'a', shared_limit_card_id: 'b', credit_limit: null, status: 'active' };
      return lineOf(a, [a, b]).id === 'a' && lineOf(b, [a, b]).id === 'b'
        && lineOf(a2, [a2, b2, c]).id === 'c' && lineOf(b2, [a2, b2, c]).id === 'c';
    })());

  check('วงเงินของสายอยู่ที่ใบหลัก — ทั้งสองใบอ่านได้ 150,000฿ เท่ากัน',
    lineLimit(ktcMC, lineCards) === 150000 && lineLimit(ktcVisa, lineCards) === 150000
    && lineLimit(kbank, lineCards) === 300000
    && lineLimit({ id: 'z', credit_limit: null }, []) === null);

  check('ยอดของสาย = สองใบรวมกัน 50,674 + 60,817 = 111,491฿ และเท่ากันทั้งสองใบ',
    lineBalance(ktcMC, lineCards, ktcDebts) === 111491
    && lineBalance(ktcVisa, lineCards, ktcDebts) === 111491,
    String(lineBalance(ktcMC, lineCards, ktcDebts)));

  check('% ใช้วงเงินของสาย = 111,491 ÷ 150,000 ≈ 74.3% — การ์ดสองใบต้องโชว์เลขเดียวกัน',
    Math.round(lineUtilizationPct(ktcMC, lineCards, ktcDebts) * 10) / 10 === 74.3
    && lineUtilizationPct(ktcMC, lineCards, ktcDebts) === lineUtilizationPct(ktcVisa, lineCards, ktcDebts),
    String(lineUtilizationPct(ktcMC, lineCards, ktcDebts)));

  check('ใบที่ไม่ได้ร่วมวงเงินกับใคร ยังคิดจากวงเงินของตัวเองเหมือนเดิม',
    isSharedLine(ktcMC, lineCards) && isSharedLine(ktcVisa, lineCards)
    && !isSharedLine(kbank, lineCards)
    && Math.round(lineUtilizationPct(kbank, lineCards, ktcDebts) * 10) / 10 === 2.2);

  const lineSum = summarizeCards({ cards: lineCards, debts: ktcDebts, today: '2026-08-16' });

  check('สรุปหัวแท็บนับวงเงินของสายครั้งเดียว — KBank 300,000 + KTC 150,000 = 450,000฿ ไม่ใช่ 600,000฿',
    lineSum.limit === 450000, String(lineSum.limit));

  check('ยอดรวมยังเป็นผลรวมยอดของทุกใบที่ใช้อยู่ (6,540 + 50,674 + 60,817)',
    lineSum.balance === 118031
    && Math.round(lineSum.utilization * 10) / 10 === 26.2,
    `${lineSum.balance} → ${lineSum.utilization}`);

  check('ใบเสริมที่ยกเลิกแล้วไม่ถูกนับในยอดของสาย แต่วงเงินของสายยังเป็นก้อนเดิม',
    (() => {
      const deadVisa = { ...ktcVisa, status: 'cancelled' };
      const cards2 = [kbank, ktcMC, deadVisa];
      const s2 = summarizeCards({ cards: cards2, debts: ktcDebts, today: '2026-08-16' });
      return lineBalance(ktcMC, cards2, ktcDebts) === 50674
        && s2.limit === 450000 && s2.balance === 57214;
    })());

  // ══════════════════════════════════════════════════════════════════════════
  //  v4.45 · A6 — วงเงินร่วมที่ "รอดได้" ยังไม่พอ ต้อง "สร้างของพังไม่ได้"
  //
  //  lineOf() ทนกับกราฟที่พังอยู่แล้ว (A→B→A ไม่วนไม่ค้าง) แต่ตัวฟอร์มยังปล่อย
  //  ให้สร้างรูปทรงนั้นได้ — แก้ MC ให้ชี้ไป Visa ทั้งคู่ก็ไม่มีวงเงิน วงเงิน KTC
  //  150,000฿ หายจากโมเดลทันที. canShareInto() คือกฎเดียวที่ฟอร์มใช้ทั้งตอน
  //  สร้างตัวเลือกและตอนกันบันทึก และ lineSharersOf() คือคำถามที่ต้องถามก่อนลบ
  // ══════════════════════════════════════════════════════════════════════════
  section('v4.45 · A6 — เลือกบัตรวงเงินร่วมได้เฉพาะใบที่ถือวงเงินจริง');

  check('ใบหลักที่มีวงเงินของตัวเองและยังใช้อยู่ → เลือกได้',
    canShareInto(ktcMC, 'visa', lineCards) === true
    && canShareInto(kbank, 'visa', lineCards) === true);

  check('ใบที่ไปใช้วงเงินร่วมกับใบอื่นอยู่แล้ว → เลือกไม่ได้ (นี่คือตัวปิด A→B→A และ A→B→C)',
    canShareInto(ktcVisa, 'mc', lineCards) === false);

  check('เลือกตัวเองไม่ได้ — บัตรใบเดียวแชร์วงเงินกับตัวเองไม่ได้',
    canShareInto(ktcMC, 'mc', lineCards) === false);

  check('ใบที่ยังไม่ได้ใส่วงเงิน / วงเงิน 0 → เลือกไม่ได้ (แชร์ "ไม่มีวงเงิน" ไม่ใช่การแชร์)',
    (() => {
      const blank = { id: 'blank', name: 'ใบยังไม่ใส่วงเงิน', status: 'active', credit_limit: null };
      const zero  = { id: 'zero',  name: 'ใบวงเงิน 0',        status: 'active', credit_limit: 0 };
      const pool  = [...lineCards, blank, zero];
      return canShareInto(blank, 'visa', pool) === false
        && canShareInto(zero, 'visa', pool) === false;
    })());

  check('ใบที่ยกเลิกแล้ว / ใบนอกรายการ scope นี้ / null → เลือกไม่ได้ ไม่ throw',
    (() => {
      const dead = { id: 'dead', name: 'ใบที่ยกเลิกแล้ว', status: 'cancelled', credit_limit: 90000 };
      const alien = { id: 'alien', name: 'ใบของอีก scope', status: 'active', credit_limit: 90000 };
      return canShareInto(dead, 'visa', [...lineCards, dead]) === false
        && canShareInto(alien, 'visa', lineCards) === false
        && canShareInto(null, 'visa', lineCards) === false
        && canShareInto(undefined, null, undefined) === false;
    })());

  check('ใบที่ชี้ใส่ตัวเอง ยังนับว่าถือวงเงินของตัวเอง → เลือกได้ (ตรงกับ lineOf)',
    (() => {
      const selfie = { id: 'self', name: 'ใบชี้ตัวเอง', status: 'active',
        credit_limit: 80000, shared_limit_card_id: 'self' };
      return canShareInto(selfie, 'visa', [...lineCards, selfie]) === true;
    })());

  section('v4.45 · A6 — ลบเจ้าของวงเงินที่ยังมีใบอื่นเกาะอยู่ไม่ได้');

  check('ใบหลักที่มีใบเสริมเกาะอยู่ → lineSharersOf บอกชื่อใบที่จะเสียวงเงิน',
    (() => {
      const s = lineSharersOf('mc', lineCards);
      return s.length === 1 && s[0].id === 'visa';
    })());

  check('ใบเสริมเอง / ใบเดี่ยว / id ที่ไม่มีจริง → ไม่มีใครเกาะ ลบได้ตามปกติ',
    lineSharersOf('visa', lineCards).length === 0
    && lineSharersOf('kb', lineCards).length === 0
    && lineSharersOf('ghost', lineCards).length === 0
    && lineSharersOf(null, lineCards).length === 0
    && lineSharersOf('mc', undefined).length === 0);

  check('ใบเสริมที่ยกเลิกแล้วไม่นับเป็นคนเกาะ — ลบใบหลักได้ ไม่มีวงเงินของใครหาย',
    (() => {
      const deadVisa = { ...ktcVisa, status: 'cancelled' };
      return lineSharersOf('mc', [kbank, ktcMC, deadVisa]).length === 0;
    })());

  // ══════════════════════════════════════════════════════════════════════════
  //  v4.45 · A6 — % ใช้วงเงินรวมต้องคิดจากสายที่วัดได้เท่านั้น
  //
  //  เดิมยอดของสายที่ไม่รู้วงเงินถูกบวกเข้า "เศษ" แต่ไม่มีอะไรลงไปที่ "ส่วน"
  //  สายที่รู้วงเงิน 100,000฿ ยอด 0 + ใบไม่รู้วงเงินยอด 90,000฿ จึงขึ้น 90%
  //  ทั้งที่ความจริงคือ 0% และ "ยังไม่ทราบวงเงินอีก 90,000฿"
  // ══════════════════════════════════════════════════════════════════════════
  section('v4.45 · A6 — ยอดที่ไม่รู้วงเงินไม่ถูกนับเป็น % ใช้วงเงิน');

  check('เคสของ audit: สายวงเงิน 100,000 ยอด 0 + ใบไม่รู้วงเงินยอด 90,000 → 0% ไม่ใช่ 90%',
    (() => {
      const known   = { id: 'k', name: 'ใบมีวงเงิน', status: 'active', credit_limit: 100000, manual_balance: 0 };
      const unknown = { id: 'u', name: 'ใบไม่รู้วงเงิน', status: 'active', credit_limit: null, manual_balance: 90000 };
      const s = summarizeCards({ cards: [known, unknown], today: '2026-08-17' });
      return s.utilization === 0 && s.limit === 100000
        && s.measuredBalance === 0 && s.unmeasuredBalance === 90000
        && s.balance === 90000;
    })());

  check('เคสผสม: 20,000 บนสายที่รู้วงเงิน 100,000 + 90,000 ที่ไม่รู้ → 20% และแยกยอดที่ไม่รู้ไว้ต่างหาก',
    (() => {
      const known   = { id: 'k', status: 'active', credit_limit: 100000, manual_balance: 20000 };
      const unknown = { id: 'u', status: 'active', credit_limit: null, manual_balance: 90000 };
      const s = summarizeCards({ cards: [known, unknown], today: '2026-08-17' });
      return s.utilization === 20 && s.measuredBalance === 20000
        && s.unmeasuredBalance === 90000 && s.balance === 110000;
    })());

  check('ใบเสริมของสายที่ไม่รู้วงเงินก็ถูกแยกออกทั้งสาย ไม่ใช่เฉพาะใบหลัก',
    (() => {
      const owner  = { id: 'o', status: 'active', credit_limit: null, manual_balance: 5000 };
      const sharer = { id: 's', status: 'active', credit_limit: null, shared_limit_card_id: 'o', manual_balance: 7000 };
      const known  = { id: 'k', status: 'active', credit_limit: 50000, manual_balance: 5000 };
      const s = summarizeCards({ cards: [owner, sharer, known], today: '2026-08-17' });
      return s.limit === 50000 && s.measuredBalance === 5000
        && s.unmeasuredBalance === 12000 && s.utilization === 10;
    })());

  check('ทุกสายวัดได้ → ตัวเลขเดิมทุกช่อง (450,000฿ · 26.2%) ยอดที่ไม่รู้วงเงินเป็น 0',
    lineSum.measuredBalance === 118031 && lineSum.unmeasuredBalance === 0
    && lineSum.limit === 450000 && Math.round(lineSum.utilization * 10) / 10 === 26.2,
    `${lineSum.measuredBalance} / ${lineSum.unmeasuredBalance}`);

  check('ไม่มีบัตรใบไหนใส่วงเงินเลย → % เป็น null และยอดทั้งก้อนไปอยู่ในช่อง "ยังไม่ทราบวงเงิน"',
    (() => {
      const a = { id: 'a', status: 'active', credit_limit: null, manual_balance: 4000 };
      const s = summarizeCards({ cards: [a], today: '2026-08-17' });
      return s.utilization === null && s.limit === 0
        && s.measuredBalance === 0 && s.unmeasuredBalance === 4000;
    })());

  // ══════════════════════════════════════════════════════════════════════════
  //  v4.44 · วิธีใช้ให้คุ้ม — คำแนะนำต่อใบ
  //
  //  fee_profile.tips / fee_profile.tips_updated are curated by hand via SQL
  //  (see the KBank PLUSTINUM row seeded 17 ส.ค. 69), never through a form —
  //  cardTips() is a filter, not a parser, so a stray non-array shape or a
  //  blank string in the array must never reach the accordion.
  // ══════════════════════════════════════════════════════════════════════════
  section('v4.44 · วิธีใช้ให้คุ้ม — คำแนะนำต่อใบ (cardTips)');

  check('อาร์เรย์จริงที่มีค่าว่างปนอยู่ → เหลือเฉพาะสตริงไม่ว่าง ตัดช่องว่างหัวท้าย',
    (() => {
      const r = cardTips({ fee_profile: { tips: ['  ผูกแอปธนาคารรับแต้ม  ', '', '   ', 'จ่ายเต็มทุกเดือน'] } });
      return r.tips.length === 2 && r.tips[0] === 'ผูกแอปธนาคารรับแต้ม' && r.tips[1] === 'จ่ายเต็มทุกเดือน';
    })());

  check('ไม่ใช่อาร์เรย์ (string/object/ไม่มี key เลย) → [] เสมอ ไม่ throw',
    cardTips({ fee_profile: { tips: 'ผูกแอป' } }).tips.length === 0
    && cardTips({ fee_profile: { tips: { a: 1 } } }).tips.length === 0
    && cardTips({ fee_profile: {} }).tips.length === 0
    && cardTips({}).tips.length === 0
    && cardTips(null).tips.length === 0);

  check('รายการที่ไม่ใช่สตริง (number/null/object) ในอาร์เรย์ถูกกรองทิ้ง ไม่ทำให้ throw',
    (() => {
      const r = cardTips({ fee_profile: { tips: ['ok', 42, null, { x: 1 }, 'ok2'] } });
      return r.tips.length === 2 && r.tips[0] === 'ok' && r.tips[1] === 'ok2';
    })());

  check('tips_updated ถูกตัดช่องว่างหัวท้าย และไม่ใช่สตริง/ว่าง → null',
    cardTips({ fee_profile: { tips: ['x'], tips_updated: '  17 ส.ค. 69  ' } }).updated === '17 ส.ค. 69'
    && cardTips({ fee_profile: { tips: ['x'], tips_updated: '   ' } }).updated === null
    && cardTips({ fee_profile: { tips: ['x'], tips_updated: 42 } }).updated === null
    && cardTips({ fee_profile: { tips: ['x'] } }).updated === null);

  section('v4.36 · credit_cards API — ยังไม่ได้รัน SQL ต้องไม่พัง');

  check('42P01 / PGRST205 ถูกอ่านว่า "ยังไม่มีตาราง"',
    isCardTableMissing({ code: '42P01' }) && isCardTableMissing({ code: 'PGRST205' })
    && isCardTableMissing({ message: 'Could not find the table' })
    && !isCardTableMissing({ code: '23505' }) && !isCardTableMissing(null));

  {
    const saved = __tables.credit_cards;
    delete __tables.credit_cards;
    const res = await listCreditCards('personal');
    check('ตารางยังไม่มี → คืน { missing: true, cards: [] } แทนที่จะโยน error',
      res.missing === true && Array.isArray(res.cards) && res.cards.length === 0);

    let writeErr = null;
    try { await createCreditCard({ name: 'x' }); } catch (e) { writeErr = e; }
    check('ส่วนการเขียนยังโยน error ภาษาไทยที่บอกว่าให้ไปรันไฟล์ไหน',
      writeErr && writeErr.message === CARD_SQL_NOT_RUN, writeErr && writeErr.message);

    __tables.credit_cards = saved || [];
  }

  section('v4.36 · credit_cards API — CRUD');

  {
    __tables.credit_cards = [];
    const made = await createCreditCard({
      scope: 'personal', name: 'KBank PLUSTINUM', issuer: 'KBank',
      credit_limit: 300000, statement_day: 25, due_day: 10,
      waiver_mode: 'count', waiver_target: 12, waiver_progress: 2,
    });
    await createCreditCard({ scope: 'family', name: 'บัตรบ้าน' });

    check('สร้างบัตรแล้วผูก user_id ให้เอง',
      made.id && made.user_id === 'user-1' && made.name === 'KBank PLUSTINUM');

    const personal = await listCreditCards('personal');
    const family   = await listCreditCards('family');
    check('อ่านแยกตาม scope — ส่วนตัวไม่เห็นของครอบครัว',
      personal.cards.length === 1 && personal.cards[0].name === 'KBank PLUSTINUM'
      && family.cards.length === 1 && family.missing === false);

    const patched = await updateCreditCard(made.id, { waiver_progress: 12 });
    check('แก้ไขแล้วค่าถูกเขียนจริง และ updated_at ถูกแตะ',
      patched.waiver_progress === 12 && !!patched.updated_at
      && waiverStatus(patched).met === true);

    let noRow = null;
    try { await updateCreditCard('ghost-id', { name: 'x' }); } catch (e) { noRow = e; }
    check('แก้ไขแถวที่ไม่ใช่ของเรา/ไม่มีอยู่ → error ไม่ใช่ "บันทึกแล้ว" เงียบ ๆ',
      noRow && /ไม่พบบัตรใบนี้/.test(noRow.message));

    await deleteCreditCard(made.id);
    const after = await listCreditCards('personal');
    check('ลบแล้วหายจริง และลบซ้ำได้ error ที่บอกว่าไม่พบ',
      after.cards.length === 0);

    let gone = null;
    try { await deleteCreditCard(made.id); } catch (e) { gone = e; }
    check('… ลบซ้ำไม่เงียบ',
      gone && /ลบไม่สำเร็จ/.test(gone.message));

    __tables.credit_cards = [];
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  v4.46 · คำแนะนำเรื่องหนี้ — src/lib/debtAdvice.js
//
//  Pure maths for the Debt Advice card at the top of the หนี้ tab. Synthetic
//  fixtures only — never the owner's real balances. Proven here: the interest
//  burn math, that the burn sums only active debts, the avalanche ordering and
//  its fact-derived reason tags, the near-done rollover detector, the BoT
//  minimum-payment deadline figures (and its null case), and the data-gap list.
// ════════════════════════════════════════════════════════════════════════════
{
  section('v4.49 · monthlyInterest — เงินต้นจริง × ดอก/1200 (RAW ไม่ปัด), null-safe');

  check('60,000฿ @ 16%/ปี → 800฿/เดือน (revolving: ยอด = เงินต้น)',
    monthlyInterest({ remaining_balance: 60000, interest_rate: 16 }) === 800,
    String(monthlyInterest({ remaining_balance: 60000, interest_rate: 16 })));

  // A9 · Minor 6: monthlyInterest ให้ค่า RAW (ไม่ปัด) — ปัดเฉพาะตอนแสดงผล
  // 50,674 × 16 / 1200 = 675.6533… (เดิม A8 ปัดเป็น 676; ตอนนี้ RAW).
  check('RAW ไม่ปัด (50,674 @ 16% = 675.6533…, ปัดเฉพาะตอน render)',
    Math.abs(monthlyInterest({ remaining_balance: 50674, interest_rate: 16 }) - 675.65333333) < 1e-6,
    String(monthlyInterest({ remaining_balance: 50674, interest_rate: 16 })));

  check('ยอดหรือดอกเป็น null/0/ติดลบ → 0',
    monthlyInterest({ remaining_balance: null, interest_rate: 16 }) === 0
    && monthlyInterest({ remaining_balance: 60000, interest_rate: null }) === 0
    && monthlyInterest({ remaining_balance: 60000, interest_rate: 0 }) === 0
    && monthlyInterest({ remaining_balance: -5000, interest_rate: 16 }) === 0
    && monthlyInterest(null) === 0
    && monthlyInterest({}) === 0);

  check('สตริงตัวเลขถูก coerce เหมือนไลบรารีอื่น',
    monthlyInterest({ remaining_balance: '60000', interest_rate: '16' }) === 800);

  section('v4.46 · totalInterestBurn — รวมเฉพาะหนี้ที่ active, มี perYear');

  {
    const debts = [
      { id: 'a', remaining_balance: 60000, interest_rate: 16 },                       // 800
      { id: 'b', remaining_balance: 120000, interest_rate: 10 },                      // 1000
      { id: 'c', remaining_balance: 90000, interest_rate: 12, is_active: false },     // excluded
      { id: 'd', remaining_balance: null, interest_rate: 5 },                         // 0
    ];
    const burn = totalInterestBurn(debts);
    check('รวม active เท่านั้น (800 + 1000), ก้อนที่ปิดแล้วไม่ถูกนับ',
      burn.perMonth === 1800, String(burn.perMonth));
    check('perYear = perMonth × 12',
      burn.perYear === 21600, String(burn.perYear));
    check('annualInterestBurn ให้ตัวเลขเดียวกับ perYear',
      annualInterestBurn(debts) === 21600);
    check('อาร์เรย์ว่าง → { perMonth: 0, perYear: 0 }',
      totalInterestBurn([]).perMonth === 0 && totalInterestBurn([]).perYear === 0);
  }

  section('v4.46 · payoffPriority — avalanche + reasonTags จากข้อเท็จจริง');

  {
    const debts = [
      { id: 'card', name: 'บัตร KTC', type: 'credit_card', remaining_balance: 111491, interest_rate: 16 },
      { id: 'car',  name: 'รถ BMW',   type: 'lease',       remaining_balance: 789373, interest_rate: 9.25 },
      { id: 'home', name: 'ค่าบ้าน',   type: 'mortgage',    remaining_balance: 4020000, interest_rate: 4.8 },
      { id: 'zero', name: 'ผ่อน 0%',  type: 'installment', remaining_balance: 20000, interest_rate: 0 },   // no rate → excluded
      { id: 'off',  name: 'ปิดแล้ว',   type: 'credit_card', remaining_balance: 5000, interest_rate: 20, is_active: false }, // excluded
    ];
    const prio = payoffPriority(debts);

    check('เรียง 16% > 9.25% > 4.8% และตัดก้อนที่ไม่มีดอก/ปิดแล้วออก',
      prio.length === 3
      && prio[0].debt.id === 'card' && prio[1].debt.id === 'car' && prio[2].debt.id === 'home',
      prio.map(p => `${p.debt.id}:${p.rate}`).join(' '));

    check('rank 1 = highest-rate + credit-card-bureau (บัตร)',
      prio[0].rank === 1
      && prio[0].reasonTags.includes('highest-rate')
      && prio[0].reasonTags.includes('credit-card-bureau'));

    check('rank 2 = second-rate (รถ)',
      prio[1].rank === 2 && prio[1].reasonTags.includes('second-rate'));

    check('อัตราต่ำสุด < 6% (บ้าน 4.8%) → low-rate-no-rush',
      prio[2].reasonTags.includes('low-rate-no-rush')
      && !prio[2].reasonTags.includes('highest-rate')
      && !prio[0].reasonTags.includes('low-rate-no-rush'));

    check('แต่ละแถวพก rank + balance + monthlyInterest ให้ UI',
      prio[0].balance === 111491 && prio[0].monthlyInterest === monthlyInterest(debts[0]));

    // Tie on rate → larger balance first.
    const tie = payoffPriority([
      { id: 'small', name: 's', remaining_balance: 10000, interest_rate: 12 },
      { id: 'big',   name: 'b', remaining_balance: 90000, interest_rate: 12 },
    ]);
    check('ดอกเท่ากัน → ยอดมากกว่าอยู่บน',
      tie[0].debt.id === 'big' && tie[1].debt.id === 'small');

    check('อาร์เรย์ว่าง → []',
      payoffPriority([]).length === 0 && payoffPriority(null).length === 0);

    // A8-2: no contradictory tags. no-rush needs a STRICTLY dearer debt to exist.
    const solo = payoffPriority([
      { id: 'home', name: 'บ้าน', type: 'mortgage', remaining_balance: 4000000, interest_rate: 4.8 },
    ]);
    check('A8-2 · ก้อนเดียว 4.8% → highest-rate เท่านั้น ไม่มี no-rush (ไม่มีก้อนแพงกว่า)',
      solo.length === 1
      && solo[0].reasonTags.includes('highest-rate')
      && !solo[0].reasonTags.includes('low-rate-no-rush'),
      solo[0].reasonTags.join(','));

    const twoLow = payoffPriority([
      { id: 'a', name: 'A', type: 'mortgage', remaining_balance: 1000000, interest_rate: 5 },
      { id: 'b', name: 'B', type: 'mortgage', remaining_balance: 900000,  interest_rate: 5 },
      { id: 'c', name: 'C', type: 'credit_card', remaining_balance: 50000, interest_rate: 16 },
    ]);
    check('A8-2 · [5%,5%,16%] → ทั้งสองก้อน 5% ได้ no-rush, ก้อน 16% เป็น highest ไม่มี no-rush',
      (() => {
        const c16 = twoLow.find(p => p.debt.id === 'c');
        const fives = twoLow.filter(p => p.debt.id !== 'c');
        return c16.reasonTags.includes('highest-rate')
          && !c16.reasonTags.includes('low-rate-no-rush')
          && fives.every(p => p.reasonTags.includes('low-rate-no-rush')
            && !p.reasonTags.includes('highest-rate'));
      })());

    const allEqual = payoffPriority([
      { id: 'a', name: 'A', type: 'mortgage', remaining_balance: 100000, interest_rate: 5 },
      { id: 'b', name: 'B', type: 'mortgage', remaining_balance: 200000, interest_rate: 5 },
      { id: 'c', name: 'C', type: 'mortgage', remaining_balance: 300000, interest_rate: 5 },
    ]);
    check('A8-2 · ดอกเท่ากันทั้งพอร์ต → ไม่มี no-rush ที่ใดเลย (ไม่มีก้อนแพงกว่า)',
      allEqual.every(p => !p.reasonTags.includes('low-rate-no-rush')));

    check('A8-2 · highest-rate กับ low-rate-no-rush ไม่มีทางอยู่ก้อนเดียวกัน',
      [solo, twoLow, allEqual, prio].every(list =>
        list.every(p => !(p.reasonTags.includes('highest-rate')
          && p.reasonTags.includes('low-rate-no-rush')))));
  }

  section('v4.46 · rolloverOpportunities — เหลือ 1–3 งวด, เรียงใกล้จบก่อน');

  {
    const debts = [
      { id: 'shopee', name: 'Shopee Cash', monthly_payment: 3661, total_months: 6,  months_paid: 4 },  // 2 left ✓
      { id: 'near',   name: 'ผ่อนมือถือ',  monthly_payment: 1200, total_months: 10, months_paid: 9 },  // 1 left ✓
      { id: 'far',    name: 'รถ',          monthly_payment: 6000, total_months: 48, months_paid: 10 }, // 38 left ✗
      { id: 'nodata', name: 'ไม่รู้งวด',    monthly_payment: 900,  total_months: null, months_paid: null }, // ✗
      { id: 'done',   name: 'จบพอดี',       monthly_payment: 500,  total_months: 12, months_paid: 12 },  // 0 left ✗
    ];
    const roll = rolloverOpportunities(debts);
    check('เจอเฉพาะก้อนที่เหลือ 1–3 งวด (มือถือ 1, Shopee 2), เรียงใกล้จบก่อน',
      roll.length === 2 && roll[0].debt.id === 'near' && roll[1].debt.id === 'shopee',
      roll.map(r => `${r.debt.id}:${r.monthsLeft}`).join(' '));
    check('freesPerMonth = ค่างวดเดิม, monthsLeft ถูกต้อง',
      roll[1].freesPerMonth === 3661 && roll[1].monthsLeft === 2);
    check('งวดที่จ่ายครบ (12/12) และไม่รู้งวดไม่ถูกนับ',
      !roll.some(r => r.debt.id === 'done' || r.debt.id === 'nodata'));
    check('months_paid = 0 นับได้ (ไม่ตกเพราะ falsy)',
      rolloverOpportunities([{ id: 'x', name: 'x', monthly_payment: 100, total_months: 2, months_paid: 0 }]).length === 1);

    // A8-5: a near-done debt that frees ฿0/เดือน is not an opportunity to show.
    check('A8-5 · เหลือ 2 งวดแต่ค่างวด 0/null → ถูกตัด (ไม่โชว์ "ปลดล็อก ฿0/เดือน")',
      rolloverOpportunities([{ id: 'z', name: 'z', monthly_payment: 0, total_months: 2, months_paid: 0 }]).length === 0
      && rolloverOpportunities([{ id: 'z', name: 'z', monthly_payment: null, total_months: 3, months_paid: 1 }]).length === 0
      && rolloverOpportunities([{ id: 'z', name: 'z', monthly_payment: 900, total_months: 2, months_paid: 0 }]).length === 1);
  }

  section('v4.46/v4.47 · creditCardDeadline — floor 8% → 10% จากฐานยอดเดียวกัน (A8-1)');

  {
    // A8-1: both floors from the SAME base (balance), rounded per-card, summed.
    const cards = [
      { id: 'mc',   name: 'MC',   type: 'credit_card', remaining_balance: 60000, interest_rate: 16 },
      { id: 'visa', name: 'VISA', type: 'credit_card', remaining_balance: 50000, interest_rate: 16 },
    ];
    const dl = creditCardDeadline(cards);
    check('currentMinTotal = Σ round(ยอด × 8%) (4800 + 4000) = 8800',
      dl.currentMinTotal === 8800, String(dl.currentMinTotal));
    check('futureMinTotal = Σ round(ยอด × 10%) (6000 + 5000) = 11000',
      dl.futureMinTotal === 11000, String(dl.futureMinTotal));
    check('future > current เสมอ (10% > 8%, ยอดบวก) — "floor rises" ที่ซื่อสัตย์',
      dl.futureMinTotal > dl.currentMinTotal);
    check('effectiveLabel = ม.ค. 2570, พก fromPct/toPct ให้ UI',
      dl.effectiveLabel === 'ม.ค. 2570' && dl.fromPct === 8 && dl.toPct === 10);

    // A8-1: the person's actual payment is kept SEPARATE and never drives the
    // floors — a card paid ABOVE the future floor still reads an honest rise.
    check('actualPaymentTotal = Σ monthly_payment แยกจาก floor ที่คิดจากยอด',
      (() => {
        const d = creditCardDeadline([
          { id: 'mc', name: 'MC', type: 'credit_card', remaining_balance: 60000, interest_rate: 16, monthly_payment: 7000 },
        ]);
        // 7000 paid > 6000 future floor, yet current(4800) < future(6000): still rises.
        return d.currentMinTotal === 4800 && d.futureMinTotal === 6000
          && d.actualPaymentTotal === 7000 && d.futureMinTotal > d.currentMinTotal;
      })());

    // A8-1: eligibility = revolving card (total_months == null), NOT rate-gated.
    check('บัตร revolving ที่ยังไม่กรอกดอก (rate null/0) ยังเข้าเงื่อนไข — ไม่ผูกกับ interest_rate',
      (() => {
        const noRate = creditCardDeadline([{ id: 'c', name: 'C', type: 'credit_card', remaining_balance: 60000 }]);
        const zeroRate = creditCardDeadline([{ id: 'c', name: 'C', type: 'credit_card', remaining_balance: 60000, interest_rate: 0 }]);
        return noRate && noRate.currentMinTotal === 4800 && noRate.futureMinTotal === 6000
          && zeroRate && zeroRate.currentMinTotal === 4800;
      })());

    // A8-1: a fixed instalment card (total_months set — e.g. ค่าประกันอคิน) is NOT
    // revolving, so it's excluded even though type === 'credit_card'.
    check('บัตรที่เป็นงวดผ่อน (total_months set) ถูกตัดออก — เหลือแต่ revolving',
      (() => {
        const mixed = creditCardDeadline([
          { id: 'rev', name: 'Revolve', type: 'credit_card', remaining_balance: 60000, interest_rate: 16 },
          { id: 'inst', name: 'ค่าประกันอคิน', type: 'credit_card', remaining_balance: 50000, interest_rate: 16, total_months: 10, months_paid: 2 },
        ]);
        return mixed.currentMinTotal === 4800 && mixed.futureMinTotal === 6000;
      })()
      && creditCardDeadline([{ id: 'inst', type: 'credit_card', remaining_balance: 50000, interest_rate: 16, total_months: 10, months_paid: 2 }]) === null);

    check('ไม่มีบัตร revolving เข้าเงื่อนไข (ไม่ใช่บัตร / ไม่มียอด / เป็นงวดผ่อน / ปิดแล้ว) → null',
      creditCardDeadline([{ id: 'l', type: 'lease', remaining_balance: 100000, interest_rate: 9 }]) === null
      && creditCardDeadline([{ id: 'c', type: 'credit_card', remaining_balance: 0, interest_rate: 16 }]) === null
      && creditCardDeadline([{ id: 'c', type: 'credit_card', remaining_balance: 5000, interest_rate: 16, total_months: 12, months_paid: 0 }]) === null
      && creditCardDeadline([{ id: 'c', type: 'credit_card', remaining_balance: 5000, interest_rate: 16, is_active: false }]) === null
      && creditCardDeadline([]) === null);
  }

  section('v4.46 · dataGaps — หนี้ที่ยังไม่ได้กรอกดอก/ยอด ทำให้ burn ต่ำกว่าจริง');

  {
    const debts = [
      { id: 'full', name: 'ครบ',        remaining_balance: 60000, interest_rate: 16 },
      { id: 'norate', name: 'ไม่มีดอก',  remaining_balance: 30000, interest_rate: null },
      { id: 'nobal',  name: 'ไม่มียอด',  remaining_balance: null,  interest_rate: 9 },
      { id: 'off',    name: 'ปิดแล้ว',    remaining_balance: null,  interest_rate: null, is_active: false }, // excluded
    ];
    const gaps = dataGaps(debts);
    check('ลิสต์เฉพาะ active ที่ขาดดอกหรือยอด (ไม่มีดอก, ไม่มียอด)',
      gaps.count === 2
      && gaps.debts.includes('ไม่มีดอก') && gaps.debts.includes('ไม่มียอด')
      && !gaps.debts.includes('ครบ') && !gaps.debts.includes('ปิดแล้ว'),
      gaps.debts.join(', '));
    check('ทุกก้อนกรอกครบ → count 0, debts []',
      dataGaps([{ id: 'x', name: 'x', remaining_balance: 1000, interest_rate: 5 }]).count === 0);

    // A8-3: an explicit numeric 0 is KNOWN data, not a gap. A genuine 0% instalment
    // (rate 0) or a fully-cleared balance (0) must NOT be flagged as missing.
    check('A8-3 · ดอก 0% จริง (rate 0, มียอด) → ไม่ใช่ gap',
      dataGaps([{ id: 'zero', name: 'ผ่อน 0%', remaining_balance: 20000, interest_rate: 0 }]).count === 0);
    check('A8-3 · ยอด 0 (ปิดจบ) ที่กรอกดอกแล้ว → ไม่ใช่ gap',
      dataGaps([{ id: 'cleared', name: 'ปิดจบ', remaining_balance: 0, interest_rate: 16 }]).count === 0);
    check('A8-3 · missing จริง = null / blank / non-finite เท่านั้น',
      dataGaps([
        { id: 'n', name: 'null', remaining_balance: 1000, interest_rate: null },
        { id: 'b', name: 'blank', remaining_balance: '', interest_rate: 5 },
        { id: 'x', name: 'nan', remaining_balance: 1000, interest_rate: 'abc' },
      ]).count === 3);
    check('A8-3 · zero string "0" ถือเป็นตัวเลข 0 → ไม่ใช่ gap',
      dataGaps([{ id: 's', name: 's', remaining_balance: '0', interest_rate: '0' }]).count === 0);
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  v4.48 · Money Planner — src/lib/moneyPlanner.js
//
//  The payoff simulator (avalanche + rollover over ALL filled-in debts). All
//  fixtures are SYNTHETIC — never the owner's real balances. Pinned here:
//  planDebts filtering, a two-card payoff that clears in a sane window, the
//  extra saving both interest AND months, and — the tricky one — a mortgage
//  whose payment is below its own interest STILL clearing (rollover reaches it)
//  and surfacing in paymentBelowInterest.
// ════════════════════════════════════════════════════════════════════════════
{
  section('v4.49 · planDebts — active + ยอด>0 + rate ที่รู้จริง (รวม 0%, A9 · Major 4)');

  {
    const mixed = [
      { id: 'a', name: 'บัตร A',     remaining_balance: 50000, interest_rate: 16 },
      { id: 'z', name: 'ผ่อน 0%',    remaining_balance: 20000, interest_rate: 0 },   // rate 0 จริง → IN (Major 4)
      { id: 'b', name: 'ปิดจบ',      remaining_balance: 0,     interest_rate: 16 },  // balance 0 → out
      { id: 'i', name: 'ปิดบัญชี',   remaining_balance: 50000, interest_rate: 16, is_active: false }, // inactive → out
      { id: 'm', name: 'ไม่กรอกดอก', remaining_balance: 30000, interest_rate: null },  // rate หาย → out
      { id: 's', name: 'string coerce', remaining_balance: '60000', interest_rate: '9.25' },          // strings ok
    ];
    const kept = planDebts(mixed).map(d => d.id);
    check('รวมก้อน active ที่มียอด>0 + rate ที่รู้จริง (0% นับด้วย, string coerce)',
      kept.length === 3 && kept.includes('a') && kept.includes('z') && kept.includes('s'),
      kept.join(', '));
    check('ยอด 0 / inactive / rate ที่หายไป (null) ถูกตัด — แต่ 0% ไม่ถูกตัด',
      !kept.includes('b') && !kept.includes('i') && !kept.includes('m'));
    check('planDebts([]) = [] (ไม่พัง)', planDebts([]).length === 0);
  }

  section('v4.48 · simulatePayoff — สองบัตร avalanche ปลดในกรอบเดือนที่คาดไว้');

  {
    const twoCards = [
      { id: 'c1', name: 'KTC MC',   remaining_balance: 50000, interest_rate: 16, monthly_payment: 4000 },
      { id: 'c2', name: 'KTC VISA', remaining_balance: 60000, interest_rate: 16, monthly_payment: 4800 },
    ];
    const min = simulatePayoffMP(twoCards, 0);
    check('ปลดหนี้ทั้งหมดในกรอบ 12–16 เดือน (จ่ายขั้นต่ำรวม 8,800/เดือน)',
      min.monthsToAllClear >= 12 && min.monthsToAllClear <= 16,
      String(min.monthsToAllClear));
    check('perDebt เรียงตามเดือนที่ปลด ASC + ก้อนยอดน้อยกว่าปลดก่อน (ดอกเท่ากัน tie→ยอดน้อย)',
      min.perDebt.length === 2
      && min.perDebt[0].id === 'c1'
      && min.perDebt[0].clearedMonth <= min.perDebt[1].clearedMonth,
      min.perDebt.map(d => `${d.id}@${d.clearedMonth}`).join(', '));
    check('totalInterest เป็นจำนวนเต็มบวก (มีการคิดดอกจริง)',
      Number.isInteger(min.totalInterest) && min.totalInterest > 0,
      String(min.totalInterest));

    const plan = simulatePayoffMP(twoCards, 5000);
    check('เพิ่มเงินโปะ → ปลดเร็วขึ้นและดอกรวมน้อยลง',
      plan.monthsToAllClear < min.monthsToAllClear
      && plan.totalInterest < min.totalInterest,
      `${plan.monthsToAllClear}ด / ฿${plan.totalInterest} vs ${min.monthsToAllClear}ด / ฿${min.totalInterest}`);
  }

  section('v4.48 · comparePayoff — baseline วิธีเดียวกัน แยกผลของเงินที่โปะเพิ่ม');

  {
    const twoCards = [
      { id: 'c1', name: 'KTC MC',   remaining_balance: 50000, interest_rate: 16, monthly_payment: 4000 },
      { id: 'c2', name: 'KTC VISA', remaining_balance: 60000, interest_rate: 16, monthly_payment: 4800 },
    ];
    const cmp = comparePayoff(twoCards, 5000);
    check('interestSaved > 0 และ monthsSaved > 0 เมื่อโปะเพิ่ม',
      cmp.interestSaved > 0 && cmp.monthsSaved > 0,
      `saved ฿${cmp.interestSaved} / ${cmp.monthsSaved}ด`);
    check('baseline กับ plan ปลดได้ทั้งคู่ (ค่า monthsToAllClear เป็น finite)',
      cmp.baseline.monthsToAllClear != null && cmp.plan.monthsToAllClear != null);
    check('interestSaved = baseline.totalInterest − plan.totalInterest (ไม่ติดลบ)',
      cmp.interestSaved === Math.max(0, cmp.baseline.totalInterest - cmp.plan.totalInterest));

    const same = comparePayoff(twoCards, 0);
    check('โปะเพิ่ม 0 → ไม่มีอะไรประหยัด (saved 0/0)',
      same.interestSaved === 0 && same.monthsSaved === 0);
  }

  section('v4.48 · ค่างวดต่ำกว่าดอก — บ้านยังปลดได้ด้วย rollover + ติดธง');

  {
    // Mortgage: 4,000,000 @ 4.82% → interest ~16,067/เดือน, but payment only 15,000
    // (negative amortisation on its own). Sat next to the two cards, the whole
    // avalanche pool eventually rolls onto it and clears it — the cap never hits.
    const withMortgage = [
      { id: 'c1',   name: 'KTC MC',   remaining_balance: 50000,   interest_rate: 16,   monthly_payment: 4000 },
      { id: 'c2',   name: 'KTC VISA', remaining_balance: 60000,   interest_rate: 16,   monthly_payment: 4800 },
      { id: 'home', name: 'ค่าบ้าน',   remaining_balance: 4000000, interest_rate: 4.82, monthly_payment: 15000 },
    ];
    const run = simulatePayoffMP(withMortgage, 0);
    check('ปลดหนี้ทุกก้อนได้จริง (monthsToAllClear finite, ≤ cap) แม้ค่างวดบ้าน < ดอก',
      run.monthsToAllClear != null && run.monthsToAllClear <= MONTH_CAP,
      String(run.monthsToAllClear));
    check('บ้านเป็นก้อนที่ปลดหลังสุด (ดอกต่ำสุด → avalanche เก็บไว้ท้าย)',
      run.perDebt[run.perDebt.length - 1].id === 'home',
      run.perDebt.map(d => `${d.id}@${d.clearedMonth}`).join(', '));

    const below = paymentBelowInterest(withMortgage);
    check('paymentBelowInterest ติดธงเฉพาะบ้าน (ค่างวด 15,000 ≤ ดอก ~16,067)',
      below.length === 1 && below[0].id === 'home'
      && below[0].monthlyPayment === 15000 && below[0].monthlyInterest > below[0].monthlyPayment,
      `฿${below[0].monthlyPayment} ≤ ฿${below[0].monthlyInterest}`);
    check('บัตรที่ค่างวด > ดอก ไม่ติดธง',
      !below.some(o => o.id === 'c1' || o.id === 'c2'));

    const cmp = comparePayoff(withMortgage, 10000);
    check('comparePayoff ทั้ง baseline และ plan finite เมื่อมีบ้านรวมอยู่',
      cmp.baseline.monthsToAllClear != null && cmp.plan.monthsToAllClear != null
      && cmp.interestSaved > 0,
      `saved ฿${cmp.interestSaved} / ${cmp.monthsSaved}ด`);
  }

  section('v4.48 · simulatePayoff — สโคปที่ไม่มีก้อนให้วางแผน');

  {
    const none = simulatePayoffMP([{ id: 'x', name: 'x', remaining_balance: 0, interest_rate: 0 }], 5000);
    check('ไม่มี planDebts → monthsToAllClear 0, ดอกรวม 0, perDebt ว่าง',
      none.monthsToAllClear === 0 && none.totalInterest === 0 && none.perDebt.length === 0);
    check('paymentBelowInterest([]) = [] (null-safe)', paymentBelowInterest([]).length === 0);
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  v4.49 · A9 (DLG-FIN-001) — the unified principal + APR debt model
//
//  ROOT CAUSE (Major 1): for a debt with total_months the data model stores
//  remaining_balance = (total_months − months_paid) × monthly_payment — the SUM
//  OF REMAINING PAYMENTS, which already includes every future interest charge
//  (supabase/migration_add_debt_rpc.sql:74-80 · :132-137). Accruing APR on it
//  double-counts. principalOf() recovers the true principal via annuity PV;
//  every interest computation now runs on it. All fixtures SYNTHETIC.
// ════════════════════════════════════════════════════════════════════════════
{
  section('v4.49 · principalOf — annuity PV สำหรับหนี้ผ่อน (A9 · Major 1)');

  {
    // The audit's 60-month counterexample: 60 งวดเหลือ × ฿1,000 @ 12%.
    // remaining_balance stores the payment-sum 60,000; the TRUE principal is the
    // annuity PV ≈ 44,955 (< payment-sum). At 12% it amortizes in exactly 60
    // months with lifetime interest ≈ 15,045 — vs the OLD double-count bug that
    // reported 93 months / ฿32,087 on the payment-inclusive balance.
    const fixed = {
      id: 'ft', name: 'ผ่อน 60 งวด', remaining_balance: 60000,
      interest_rate: 12, monthly_payment: 1000, total_months: 60, months_paid: 0,
    };
    const P = principalOf(fixed);
    check('เงินต้นจริง = annuity PV ≈ 44,955 และ < ยอดค่างวดรวม 60,000',
      Math.abs(P - 44955.04) < 1 && P < 60000, String(P));

    const run = simulatePayoffMP([fixed], 0);
    check('จำลองแล้วปลดใน ~60 เดือน (ไม่ใช่ 93) — ค่างวดตัดต้นได้ตามสัญญา',
      run.monthsToAllClear != null && run.monthsToAllClear >= 59 && run.monthsToAllClear <= 61,
      String(run.monthsToAllClear));
    check('ดอกตลอดสัญญา ~15,045 << 32,087 ของบั๊กเดิม (ไม่คิดดอกซ้ำ)',
      run.totalInterest < 16000 && run.totalInterest > 14000, String(run.totalInterest));

    // A 0% fixed-term: payment-sum == principal, so fall back to remaining_balance.
    check('ผ่อน 0% (fixed-term) → เงินต้น = remaining_balance (ยอดค่างวด = เงินต้น)',
      principalOf({ remaining_balance: 12000, interest_rate: 0, monthly_payment: 1000, total_months: 12, months_paid: 0 }) === 12000);

    // Revolving (no total_months) stores true principal already.
    check('Revolving (ไม่มี total_months) → เงินต้น = remaining_balance',
      principalOf({ remaining_balance: 50000, interest_rate: 16 }) === 50000);

    // Fixed-term but payment missing → can't derive → fall back.
    check('fixed-term แต่ไม่มีค่างวด → fall back = remaining_balance',
      principalOf({ remaining_balance: 40000, interest_rate: 9, total_months: 24, months_paid: 0 }) === 40000);

    // Non-finite / null → 0 (defensive, like the other libs).
    check('ยอดที่อ่านไม่ได้ / null → 0',
      principalOf(null) === 0
      && principalOf({ remaining_balance: 'abc', interest_rate: 12, monthly_payment: 1000, total_months: 12 }) === 0);
  }

  section('v4.49 · monthlyInterest คิดบนเงินต้นจริง — บ้านผ่อนปกติไม่ติดธง (A9 · Major 1 + Minor 6)');

  {
    // A mortgage-shaped fixture: remaining_balance is the payment-sum
    // 268 × 15,000 = 4,020,000; true principal ≈ 2,463,540, whose monthly
    // interest ≈ ฿9,854 < the ฿15,000 payment — so it amortizes normally and
    // paymentBelowInterest must NOT flag it (the old artifact disappears).
    const mortgage = {
      id: 'home', name: 'บ้าน', remaining_balance: 4020000,
      interest_rate: 4.8, monthly_payment: 15000, total_months: 300, months_paid: 32,
    };
    const mi = monthlyInterest(mortgage);
    check('ดอก/เดือน คิดบนเงินต้นจริง ≈ 9,854 (< ค่างวด 15,000)',
      Math.abs(mi - 9854.16) < 5 && mi < 15000, String(mi));
    check('บ้านผ่อนปกติ (ค่างวด > ดอกบนเงินต้นจริง) ไม่ถูกติดธง paymentBelowInterest',
      paymentBelowInterest([mortgage]).length === 0);

    // A9 · Minor 6 — the payment-vs-interest compare is on the RAW value, so the
    // sub-฿1 boundary is classified honestly (no pre-rounding false positives).
    // 49,960 @ 12% → raw 499.6; a ฿500 payment is ABOVE it → not flagged
    // (the old Math.round(499.6)=500 would have wrongly flagged 500 ≤ 500).
    check('Minor 6 · ขอบ ฿1 (raw 499.6 < ค่างวด 500) → ไม่ติดธง (เดิมปัดเป็น 500 แล้วติดผิด)',
      paymentBelowInterest([{ id: 'e', name: 'edge', remaining_balance: 49960, interest_rate: 12, monthly_payment: 500 }]).length === 0);
    check('Minor 6 · raw 500.4 > ค่างวด 500 → ติดธงจริง',
      paymentBelowInterest([{ id: 'e', name: 'edge', remaining_balance: 50040, interest_rate: 12, monthly_payment: 500 }]).length === 1);
  }

  section('v4.49 · planDebts รวมหนี้ 0% + เงินงวดทบต่อหลังปลด (A9 · Major 4)');

  {
    const withZero = [
      { id: 'card',  name: 'บัตร',         remaining_balance: 20000, interest_rate: 18, monthly_payment: 2000 },
      { id: 'phone', name: 'ผ่อนมือถือ 0%', remaining_balance: 6000,  interest_rate: 0,  monthly_payment: 1000 },
    ];
    const kept = planDebts(withZero).map(d => d.id);
    check('หนี้ 0% (rate เป็นเลข 0 จริง) ถูกรวมในแผน — ต่างจาก rate ที่หายไป',
      kept.includes('card') && kept.includes('phone') && kept.length === 2, kept.join(','));
    check('rate ที่ขาด (null/blank) เท่านั้นที่ถูกตัด — 0 ไม่ถูกตัด',
      planDebts([{ id: 'm', remaining_balance: 5000, interest_rate: null, monthly_payment: 500 }]).length === 0
      && planDebts([{ id: 'b', remaining_balance: 5000, interest_rate: '', monthly_payment: 500 }]).length === 0
      && planDebts([{ id: 'z', remaining_balance: 5000, interest_rate: 0, monthly_payment: 500 }]).length === 1);

    const run = simulatePayoffMP(withZero, 0);
    const phone = run.perDebt.find(d => d.id === 'phone');
    const card  = run.perDebt.find(d => d.id === 'card');
    check('หนี้ 0% โผล่ใน perDebt/timeline และปลดจริง (~6 เดือน, ไม่มีดอก)',
      phone && phone.clearedMonth != null && phone.clearedMonth <= 6, String(phone && phone.clearedMonth));

    // The 0% debt's payment rolls over: once phone clears, its ฿1,000 joins the
    // pool → the card clears SOONER than it would on its own ฿2,000.
    const cardAlone = simulatePayoffMP([withZero[0]], 0).perDebt.find(d => d.id === 'card');
    check('เงินงวดของหนี้ 0% ทบเข้ากอง — บัตรปลดเร็วกว่าตอนอยู่ลำพัง',
      card.clearedMonth != null && cardAlone.clearedMonth != null
      && card.clearedMonth < cardAlone.clearedMonth,
      `รวม ${card.clearedMonth} < ลำพัง ${cardAlone.clearedMonth}`);
  }

  section('v4.49 · comparePayoff censored — ไม่จบใน cap = unknown ไม่ใช่เลขมั่ว (A9 · Major 3)');

  {
    // 1,000,000 @ 24% (2%/เดือน), ค่างวด 1,000: interest 20,000/เดือน >> ค่างวด →
    // baseline โตจนชน cap ไม่มีวันจบ. Extra +20,000 ทำให้ plan จบได้ แต่ baseline
    // ยัง censored → เทียบไม่ได้: interestSaved/monthsSaved = null (ไม่ใช่ 566 เดือน /
    // ฿1.4e12 ตามบั๊กเดิม).
    const heavy = [{ id: 'big', name: 'ก้อนโต', remaining_balance: 1000000, interest_rate: 24, monthly_payment: 1000 }];
    const base = simulatePayoffMP(heavy, 0);
    check('baseline ไม่จบใน cap → monthsToAllClear = null',
      base.monthsToAllClear === null, String(base.monthsToAllClear));
    check('ก้อนที่ยังไม่จบ → clearedMonth = null (ไม่ใช่ 720)',
      base.perDebt[0].clearedMonth === null, String(base.perDebt[0].clearedMonth));

    const cmp = comparePayoff(heavy, 20000);
    check('censored = true เมื่อ baseline หรือ plan ไม่จบ',
      cmp.censored === true);
    check('interestSaved / monthsSaved = null (unknown) — ไม่แทนด้วย 720 แล้วลบ',
      cmp.interestSaved === null && cmp.monthsSaved === null,
      `saved=${cmp.interestSaved}/${cmp.monthsSaved}`);
    check('plan (มี extra) จบได้จริง → monthsToAllClear finite',
      cmp.plan.monthsToAllClear != null);

    // Both runs clear → censored false, deltas are real numbers.
    const clears = comparePayoff([{ id: 'c', name: 'c', remaining_balance: 50000, interest_rate: 16, monthly_payment: 4000 }], 3000);
    check('ทั้งสอง run จบ → censored false, interestSaved/monthsSaved เป็นตัวเลขจริง',
      clears.censored === false && clears.interestSaved != null && clears.monthsSaved != null);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// v4.53 · PALETTE ACCEPTANCE (A10 · finding 4)
//
// A10 shipped two colour defects that every existing test was blind to: an
// accent used as normal-size text at 4.02:1, and a CVD claim off by 31 ΔE.
// Nothing here touches the DOM or the network — it parses src/styles.css
// literally and does the maths with audit/colorcheck.mjs, so it runs in the
// same deterministic harness as everything above.
//
// The calculator is self-tested FIRST (reference case group below). If a
// simulation matrix or a ΔE2000 term is ever broken, those fail loudly rather
// than silently blessing whatever the palette happens to be.
// ═══════════════════════════════════════════════════════════════════════════
{
  section('v4.53 · palette — colour calculator reference self-tests (A10 · Major 2)');

  for (const r of colorSelfTest()) check(`colorcheck: ${r.name}`, r.ok, r.detail);

  // ── Parse :root literally ────────────────────────────────────────────────
  const cssPath = paletteJoin(__LOOP_ROOT__, 'src', 'styles.css');
  const cssText = paletteRead(cssPath, 'utf8');
  const rootBody = (cssText.match(/:root\s*\{([\s\S]*?)\n\}/) || [])[1] || '';
  const rootNoComments = rootBody.replace(/\/\*[\s\S]*?\*\//g, '');
  const tokenNames = [...rootNoComments.matchAll(/(--[a-z0-9-]+)\s*:/gi)].map(m => m[1]);
  const T = Object.fromEntries(
    [...rootNoComments.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/gi)]
      .map(m => [m[1], m[2].trim()]),
  );

  section('v4.53 · palette — token inventory pinned (A10 · finding 4)');

  // 71 = the 64 line-start declarations the A10 auditor counted, + the 5
  // declared on a shared line (--success-soft, --danger-soft, --warning-soft,
  // --profit-bg, --loss-bg), + --accent-fill (v4.53) + --accent-fill-hover
  // (v4.54). Renaming or deleting any silently breaks inline styles in src/.
  const EXPECTED_TOKENS = [
    '--background', '--background-soft', '--surface', '--surface-muted', '--surface-warm',
    '--bg', '--bg-2', '--surface-2', '--surface-3', '--card', '--paper', '--paper-2', '--paper-ink',
    '--text-primary', '--text-secondary', '--text-muted', '--text-inverse',
    '--ink', '--ink-2', '--ink-3', '--ink-4',
    '--border', '--border-strong', '--hairline', '--line', '--line-2',
    '--accent', '--accent-fill', '--accent-fill-hover', '--accent-strong', '--accent-soft', '--accent-tint',
    '--amber', '--amber-2', '--amber-deep', '--brass',
    '--fill', '--fill-2',
    '--success', '--success-soft', '--danger', '--danger-soft', '--warning', '--warning-soft',
    '--profit', '--profit-bg', '--loss', '--loss-bg', '--profit-soft',
    '--chart-income', '--chart-expense', '--blue', '--violet', '--rose',
    '--f-display', '--f-body', '--f-mono',
    '--radius-card', '--radius-btn', '--radius-field', '--radius-control', '--radius-pill',
    '--r-sm', '--r-md', '--r-lg', '--r-xl',
    '--shadow-card', '--shadow-pop', '--shadow-soft', '--sidebar-bg', '--dim',
  ];
  check(`:root declares exactly ${EXPECTED_TOKENS.length} tokens`,
    tokenNames.length === EXPECTED_TOKENS.length, `พบ ${tokenNames.length}`);
  const missing = EXPECTED_TOKENS.filter(n => !tokenNames.includes(n));
  const added   = tokenNames.filter(n => !EXPECTED_TOKENS.includes(n));
  check('ไม่มี token ถูกลบ/rename (ชื่อ token = API ของ inline styles)',
    missing.length === 0, missing.join(',') || 'ครบ');
  check('ไม่มี token โผล่มาโดยไม่ได้ประกาศในลิสต์นี้',
    added.length === 0, added.join(',') || 'ไม่มี');
  check('--accent-fill ถูกเพิ่มจริง และ --accent / --accent-strong ยังอยู่',
    tokenNames.includes('--accent-fill') && tokenNames.includes('--accent')
    && tokenNames.includes('--accent-strong'));

  section('v4.53 · palette — WCAG contrast ตาม ROLE (A10 · Major 1)');

  const SURFACE = '#ffffff', GROUND = '#f2f2f7';
  // The composites accent text actually lands on.
  const TINT_ON_SURFACE = paletteComposite([0, 122, 255], 0.10, SURFACE);
  const TINT_ON_GROUND  = paletteComposite([0, 122, 255], 0.10, GROUND);

  const ratio = (fg, bg) => paletteContrast(fg, bg);
  const atLeast = (label, fg, bg, min) => {
    const r = ratio(fg, bg);
    check(`${label} ≥ ${min}:1`, r >= min, `${r.toFixed(2)}:1`);
  };

  // Text tokens against the surfaces they are really used on.
  atLeast('--text-primary บน --surface',   T['--text-primary'],   SURFACE, 4.5);
  atLeast('--text-primary บน --background', T['--text-primary'],  GROUND,  4.5);
  atLeast('--text-secondary บน --surface', T['--text-secondary'], SURFACE, 4.5);
  atLeast('--text-secondary บน --background', T['--text-secondary'], GROUND, 4.5);
  atLeast('--text-muted บน --surface',     T['--text-muted'],     SURFACE, 4.5);
  atLeast('--text-muted บน --background',  T['--text-muted'],     GROUND,  4.5);
  atLeast('--paper-ink บน --paper',        T['--paper-ink'],      T['--surface-warm'], 4.5);
  atLeast('--brass บน --surface',          T['--brass'],          SURFACE, 4.5);

  // The accent role split — this is the finding-1 regression guard.
  atLeast('--accent เป็น graphical บน --surface (เกณฑ์ 3:1)',    T['--accent'], SURFACE, 3);
  atLeast('--accent เป็น graphical บน --background (เกณฑ์ 3:1)', T['--accent'], GROUND,  3);
  {
    // Documents WHY --accent must never carry normal-size text.
    const r = ratio(T['--accent'], SURFACE);
    check('--accent ยัง "ตก" เกณฑ์ตัวอักษรปกติ 4.5:1 — จึงห้ามใช้กับข้อความ',
      r < 4.5, `${r.toFixed(2)}:1 บนขาว → ใช้ --accent-strong แทน`);
  }
  atLeast('--accent-fill กับตัวอักษร --text-inverse (ขาว)', T['--accent-fill'], SURFACE, 4.5);
  atLeast('--accent-strong บน --surface',      T['--accent-strong'], SURFACE, 4.5);
  atLeast('--accent-strong บน --background',   T['--accent-strong'], GROUND,  4.5);
  atLeast('--accent-strong บน --accent-soft',  T['--accent-strong'], T['--accent-soft'], 4.5);
  atLeast('--accent-strong บน --accent-tint เหนือ --surface',    T['--accent-strong'], TINT_ON_SURFACE, 4.5);
  atLeast('--accent-strong บน --accent-tint เหนือ --background', T['--accent-strong'], TINT_ON_GROUND,  4.5);

  // Categorical hues are used as small text (.tag--blue/violet/rose, importer,
  // cashbox), so they are gated at 4.5:1 on BOTH surfaces — not 3:1.
  for (const name of ['--blue', '--violet', '--rose']) {
    atLeast(`${name} เป็นข้อความบน --surface`,    T[name], SURFACE, 4.5);
    atLeast(`${name} เป็นข้อความบน --background`, T[name], GROUND,  4.5);
  }

  // Semantic money colours carry meaning in text.
  for (const [tok, soft] of [['--success', '--success-soft'], ['--danger', '--danger-soft'], ['--warning', '--warning-soft']]) {
    atLeast(`${tok} บน --surface`,    T[tok], SURFACE, 4.5);
    atLeast(`${tok} บน --background`, T[tok], GROUND,  4.5);
    atLeast(`${tok} บน ${soft}`,      T[tok], T[soft], 4.5);
  }

  // Chart marks are graphical objects → 3:1.
  atLeast('--chart-income บน --surface',    T['--chart-income'],  SURFACE, 3);
  atLeast('--chart-income บน --background', T['--chart-income'],  GROUND,  3);
  atLeast('--chart-expense บน --surface',   T['--chart-expense'], SURFACE, 3);
  atLeast('--chart-expense บน --background', T['--chart-expense'], GROUND, 3);

  section('v4.53 · palette — CVD ของคู่สีกราฟ (A10 · Major 2)');

  {
    const inc = T['--chart-income'], exp = T['--chart-expense'];
    const sep = paletteSeparation(inc, exp);
    check('คู่สีกราฟต่างกันชัดสำหรับสายตาปกติ (ΔE2000 ≥ 40)',
      sep.normal >= 40, `ΔE ${sep.normal.toFixed(2)}`);
    check('protanopia: ΔE2000 ≥ 20 (เกณฑ์บังคับ — ข้อที่ v4.52 ตกจริง)',
      sep.protan >= 20, `ΔE ${sep.protan.toFixed(2)}`);
    check('deuteranopia: ΔE2000 ≥ 20 (เกณฑ์บังคับ)',
      sep.deutan >= 20, `ΔE ${sep.deutan.toFixed(2)}`);
    check('ทั้ง protan และ deutan ผ่านพร้อมกัน',
      Math.min(sep.protan, sep.deutan) >= 20,
      `min ${Math.min(sep.protan, sep.deutan).toFixed(2)}`);

    // The specific pair that shipped in v4.52 must not come back.
    check('คู่สีเดิม #2f6b2c/#c9663a ถูกเลิกใช้แล้ว',
      !(inc.toLowerCase() === '#2f6b2c' && exp.toLowerCase() === '#c9663a'),
      `${inc}/${exp}`);
    {
      const old = paletteSeparation('#2f6b2c', '#c9663a');
      check('…และเหตุผลยังพิสูจน์ได้: คู่เดิม protan ΔE < 10 (ไม่ใช่ 37.4 ที่เคยประกาศ)',
        old.protan < 10, `protan ΔE ${old.protan.toFixed(2)}`);
    }
    // Income must stay the teal-leaning green, expense the orange — a swap
    // would keep the ΔE gates but invert the money metaphor.
    check('income ยังเป็นเขียวอมเทอร์ควอยซ์ (G และ B สูงกว่า R)',
      (() => { const [r, g, b] = paletteRgb(inc); return g > r && b > r; })(), inc);
    check('expense ยังเป็นส้ม (R สูงสุด, B ต่ำสุด)',
      (() => { const [r, g, b] = paletteRgb(exp); return r > g && g > b; })(), exp);
  }

  section('v4.54 · palette — dark block parsed + accent roles ใน dark (A10-r2 · Major 1)');

  // A10-r2: dark mode is LIVE (localStorage 'loop:theme' → data-theme on
  // <html>). The v4.53 suite only ever read :root, so a token with no dark
  // value — --accent-fill — leaked its light value into the dark theme and
  // nothing failed. Parse the dark block too and gate the same roles against
  // the surfaces that block actually defines.
  const darkBody = (cssText.match(/\[data-theme="dark"\]\s*\{([\s\S]*?)\n\}/) || [])[1] || '';
  const darkNoComments = darkBody.replace(/\/\*[\s\S]*?\*\//g, '');
  const D = Object.fromEntries(
    [...darkNoComments.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/gi)].map(m => [m[1], m[2].trim()]),
  );

  check('อ่าน [data-theme="dark"] ได้จริง (ไม่ใช่บล็อกว่าง)',
    Object.keys(D).length > 30, `${Object.keys(D).length} tokens`);
  check('dark block ประกาศ --accent-fill (ไม่ปล่อยให้ค่า light รั่วเข้ามา)',
    typeof D['--accent-fill'] === 'string' && /^#/.test(D['--accent-fill']), D['--accent-fill']);
  check('dark block ประกาศ --accent-fill-hover',
    typeof D['--accent-fill-hover'] === 'string' && /^#/.test(D['--accent-fill-hover']), D['--accent-fill-hover']);

  const DSUR = D['--surface'], DBG = D['--background'], DINV = D['--text-inverse'];
  const DTINT_SUR = paletteComposite(paletteRgb(D['--accent']), 0.14, DSUR);
  const DTINT_BG  = paletteComposite(paletteRgb(D['--accent']), 0.14, DBG);

  // The exact pairing the auditor proved broken: root #006ade × dark inverse.
  {
    const leaked = paletteContrast(T['--accent-fill'], DINV);
    check('พิสูจน์บั๊กเดิม: ค่า --accent-fill ของ :root คู่กับ --text-inverse ของ dark ตกจริง',
      leaked < 4.5, `${leaked.toFixed(2)}:1 (< 4.5) — จึงต้องมีค่า dark แยก`);
  }
  atLeast('dark --accent-fill × dark --text-inverse',        D['--accent-fill'], DINV, 4.5);
  atLeast('dark --accent-fill-hover × dark --text-inverse',  D['--accent-fill-hover'], DINV, 4.5);
  check('hover ของ dark ไม่ทำให้คอนทราสต์ลดลง (สว่างขึ้น = ห่างจาก text-inverse มากขึ้น)',
    paletteContrast(D['--accent-fill-hover'], DINV) >= paletteContrast(D['--accent-fill'], DINV),
    `${paletteContrast(D['--accent-fill-hover'], DINV).toFixed(2)} ≥ ${paletteContrast(D['--accent-fill'], DINV).toFixed(2)}`);
  atLeast('light --accent-fill-hover × ตัวอักษรขาว', T['--accent-fill-hover'], SURFACE, 4.5);
  check('hover ของ light ไม่ทำให้คอนทราสต์ลดลง (เข้มขึ้น ไม่ใช่ brightness(1.08) ที่ทำให้สว่าง)',
    paletteContrast(T['--accent-fill-hover'], SURFACE) >= paletteContrast(T['--accent-fill'], SURFACE),
    `${paletteContrast(T['--accent-fill-hover'], SURFACE).toFixed(2)} ≥ ${paletteContrast(T['--accent-fill'], SURFACE).toFixed(2)}`);

  // The other roles the v4.53 reroute introduced, now checked in dark too.
  atLeast('dark --accent เป็น graphical บน --surface',    D['--accent'], DSUR, 3);
  atLeast('dark --accent เป็น graphical บน --background', D['--accent'], DBG, 3);
  atLeast('dark --accent-strong เป็นข้อความบน --surface',      D['--accent-strong'], DSUR, 4.5);
  atLeast('dark --accent-strong เป็นข้อความบน --background',   D['--accent-strong'], DBG, 4.5);
  atLeast('dark --accent-strong บน --accent-soft',             D['--accent-strong'], D['--accent-soft'], 4.5);
  atLeast('dark --accent-strong บน accent-tint เหนือ surface', D['--accent-strong'], DTINT_SUR, 4.5);
  atLeast('dark --accent-strong บน accent-tint เหนือ ground',  D['--accent-strong'], DTINT_BG, 4.5);
  for (const name of ['--blue', '--violet', '--rose']) {
    atLeast(`dark ${name} เป็นข้อความบน --surface`,    D[name], DSUR, 4.5);
    atLeast(`dark ${name} เป็นข้อความบน --background`, D[name], DBG, 4.5);
  }
  atLeast('dark --chart-income บน --surface',  D['--chart-income'],  DSUR, 3);
  atLeast('dark --chart-expense บน --surface', D['--chart-expense'], DSUR, 3);

  section('v4.54 · palette — matrix เต็ม: ทุก option × ทุกธีม × ทุก role (A10-r2 · Major 2 + Minor)');

  {
    // Mirrors: the default option applies by CLEARING the overrides, so its
    // stored variants must equal what each stylesheet block declares. If phase
    // 5 retunes dark, this fails until accents.js is updated too.
    const d0 = ACCENT_OPTIONS[0];
    check('option แรก (light) สะท้อน :root เป๊ะ — เลือกแล้ว = คืนสิทธิ์ให้ stylesheet',
      d0.light.base === T['--accent'] && d0.light.fill === T['--accent-fill']
      && d0.light.fillHover === T['--accent-fill-hover']
      && d0.light.strong === T['--accent-strong'] && d0.light.soft === T['--accent-soft'],
      `${d0.light.base}/${d0.light.fill}/${d0.light.fillHover}/${d0.light.strong}/${d0.light.soft}`);
    check('option แรก (dark) สะท้อน [data-theme="dark"] เป๊ะ',
      d0.dark.base === D['--accent'] && d0.dark.fill === D['--accent-fill']
      && d0.dark.fillHover === D['--accent-fill-hover']
      && d0.dark.strong === D['--accent-strong'] && d0.dark.soft === D['--accent-soft'],
      `${d0.dark.base}/${d0.dark.fill}/${d0.dark.fillHover}/${d0.dark.strong}/${d0.dark.soft}`);
    check('DEFAULT_ACCENT = light base ของ option แรก', DEFAULT_ACCENT === d0.light.base);
    check('ทุก option มีครบทั้งชุด light และ dark',
      ACCENT_OPTIONS.every(o => THEMES.every(t =>
        ['base', 'fill', 'fillHover', 'strong', 'soft'].every(k => /^#[0-9a-f]{6}$/i.test(variantsFor(o, t)[k])))));

    // THE MATRIX. For every option × theme, gate each role against the surfaces
    // that theme actually paints — this is the runtime combination the v4.53
    // suite never covered, which is why 826/826 passed with two live defects.
    const THEME_SURFACES = {
      light: { ground: GROUND, surface: SURFACE, inverse: '#ffffff', tintAlpha: 0.10 },
      dark:  { ground: DBG,    surface: DSUR,    inverse: DINV,      tintAlpha: 0.14 },
    };
    for (const o of ACCENT_OPTIONS) {
      for (const theme of THEMES) {
        const v = variantsFor(o, theme);
        const S = THEME_SURFACES[theme];
        const tag = `${o.id}/${theme}`;
        // base is graphical (a tick, an icon, a rail) → 3:1 on both grounds.
        atLeast(`${tag} — base เป็น graphical บน surface`, v.base, S.surface, 3);
        atLeast(`${tag} — base เป็น graphical บน ground`,  v.base, S.ground, 3);
        // fill + its hover carry --text-inverse for that theme.
        atLeast(`${tag} — fill × text-inverse`,       v.fill, S.inverse, 4.5);
        atLeast(`${tag} — fillHover × text-inverse`,  v.fillHover, S.inverse, 4.5);
        check(`${tag} — hover ไม่ลดคอนทราสต์ (ยิ่ง hover ยิ่งอ่านชัด)`,
          paletteContrast(v.fillHover, S.inverse) >= paletteContrast(v.fill, S.inverse),
          `${paletteContrast(v.fillHover, S.inverse).toFixed(2)} ≥ ${paletteContrast(v.fill, S.inverse).toFixed(2)}`);
        check(`${tag} — hover ต่างจาก fill จริง (มองเห็นว่า hover)`, v.fillHover !== v.fill, v.fillHover);
        // strong is text: ground, surface, its own soft, AND the tint it
        // generates over both grounds (the composite Pink used to fail).
        atLeast(`${tag} — strong บน surface`, v.strong, S.surface, 4.5);
        atLeast(`${tag} — strong บน ground`,  v.strong, S.ground, 4.5);
        atLeast(`${tag} — strong บน soft`,    v.strong, v.soft, 4.5);
        atLeast(`${tag} — strong บน tint เหนือ surface`,
          v.strong, paletteComposite(paletteRgb(v.base), S.tintAlpha, S.surface), 4.5);
        atLeast(`${tag} — strong บน tint เหนือ ground`,
          v.strong, paletteComposite(paletteRgb(v.base), S.tintAlpha, S.ground), 4.5);
      }
    }

    // The override group, per theme.
    for (const theme of THEMES) {
      const vars = accentVars(ACCENT_OPTIONS[1], theme);
      const names = vars.map(([k]) => k);
      check(`accentVars(${theme}) ตั้งครบทั้งกลุ่ม accent (6 ตัว)`,
        names.length === 6 && ['--accent', '--accent-fill', '--accent-fill-hover',
          '--accent-strong', '--accent-soft', '--accent-tint'].every(n => names.includes(n)),
        names.join(' '));
      check(`accentVars(${theme}) ไม่ตั้ง --amber แยก (styles.css ให้ --amber = var(--accent))`,
        !names.some(n => n.startsWith('--amber')));
      const v = variantsFor(ACCENT_OPTIONS[1], theme);
      const alpha = theme === 'dark' ? '0.14' : '0.10';
      check(`accentVars(${theme}) สร้าง --accent-tint จาก base ของ option+ธีมนั้นจริง (ไม่ hard-code น้ำเงิน)`,
        vars.find(([k]) => k === '--accent-tint')[1] === `rgba(${rgbChannels(v.base)}, ${alpha})`,
        vars.find(([k]) => k === '--accent-tint')[1]);
      check(`accentVars(${theme}) ใช้ค่าของธีมนั้น ไม่ใช่ของอีกธีม`,
        vars.find(([k]) => k === '--accent-fill')[1] === v.fill
        && v.fill !== variantsFor(ACCENT_OPTIONS[1], theme === 'dark' ? 'light' : 'dark').fill);
    }
    check('ACCENT_VAR_NAMES ครอบคลุมทุก property ที่ accentVars ตั้ง (ใช้ล้างค่าได้ครบ)',
      accentVars(ACCENT_OPTIONS[0], 'light').every(([n]) => ACCENT_VAR_NAMES.includes(n))
      && ACCENT_VAR_NAMES.length === 6);

    // Migration: legacy warm values must not survive.
    const LEGACY_WARM = ['#d4a574', '#6cbf83', '#7ba7d4', '#a78fcc', '#d49aa5', '#e07a6e', '#b27a42'];
    check('ไม่มีสีชุดเดิม (warm) หลงเหลือใน ACCENT_OPTIONS',
      LEGACY_WARM.every(h => !isKnownAccent(h)));
    check('ค่าที่เซฟไว้เป็นสีชุดเดิม → ถือว่าไม่รู้จัก (จะถูกรีเซ็ตเป็นน้ำเงิน)',
      LEGACY_WARM.every(h => accentOption(h) === null));
    check('ค่าที่เซฟไว้เป็นสีในชุดใหม่ → ใช้ได้',
      ACCENT_OPTIONS.every(o => isKnownAccent(o.light.base)));
    check('ค่าว่าง / null → ไม่รู้จัก (ใช้ default)',
      accentOption(null) === null && accentOption('') === null);
    check('สีที่ถูก retune (teal/green base เดิม) ไม่ถูกจดจำเป็น option อีก',
      accentOption('#00a2b3') === null && accentOption('#34c759') === null);
  }

  section('v4.53 · palette — warm-hex sweep (A10.2 ไม่ถอยหลัง)');

  {
    // The retired ivory/clay literals. Each is asserted absent from ALL of
    // src/ — including the dark block, which never used these values.
    const RETIRED_WARM = [
      '#f5f0e7', '#fffaf0', '#fbf8f1', '#f0eadf',
      '#e3d8c8', '#d07040', '#c99a42', '#b98545',
    ];
    const files = paletteSrcFiles(paletteJoin(__LOOP_ROOT__, 'src'));
    check(`สแกนไฟล์ใน src/ ได้จริง (${files.length} ไฟล์)`, files.length > 40, `${files.length} ไฟล์`);

    const contents = files.map(f => [f, paletteRead(f, 'utf8')]);
    for (const hex of RETIRED_WARM) {
      const hits = contents.filter(([, t]) => t.toLowerCase().includes(hex)).map(([f]) => paletteBase(f));
      check(`warm hex ${hex} ไม่เหลือใน src/`, hits.length === 0, hits.join(',') || 'สะอาด');
    }
    {
      const hits = contents.filter(([, t]) => /rgba\(\s*74\s*,\s*61\s*,\s*43/i.test(t)).map(([f]) => paletteBase(f));
      check('เงาสีอุ่น rgba(74, 61, 43, …) ไม่เหลือใน src/', hits.length === 0, hits.join(',') || 'สะอาด');
    }

    // Values that are ALLOWED, but only where the audit accepted them. This is
    // the half that keeps the sweep honest: they may exist, but they may not
    // spread to new files.
    const bounded = [
      ['#a8752f', ['VersionHistory.jsx'],            'ข้อความ changelog ย้อนหลัง'],
      ['#b27a42', ['App.jsx'],                       'sentinel ค่า accent เดิม'],
      ['#d4a574', ['Family.jsx', 'styles.css'],      'สี avatar ที่ผู้ใช้เลือก + legacy chip ที่ตายแล้ว'],
    ];
    for (const [hex, allowed, why] of bounded) {
      const hits = contents.filter(([, t]) => t.toLowerCase().includes(hex)).map(([f]) => paletteBase(f));
      const stray = hits.filter(f => !allowed.includes(f));
      check(`${hex} ปรากฏเฉพาะที่ audit ยอมรับ (${why})`,
        stray.length === 0, stray.length ? `หลุดไปที่ ${stray.join(',')}` : hits.join(',') || 'ไม่มี');
    }
  }
}

// ════════════════════════════════════════════════════════════════════════════
// v4.57 · TYPOGRAPHY + ICON ACCEPTANCE (A11 · Major 2, Minor 3, Minor 4)
//
// A10 shipped the *claim* that the app is sentence-case with mono only on
// digits; A11 found the claim was half-true because nothing enforced it. These
// cases are the enforcement. They read src/ literally — no DOM, no network —
// and they FAIL if a future change reintroduces the warm-era patterns.
//
// THE DECLARED RULE, stated once so the allowlists below are auditable:
//   --f-mono (and tabular figures) belong to content that is NUMERIC or
//   CODE-LIKE: amounts, percentages, dates and times rendered as digits,
//   counters and ratios, and identifiers the user reads as a token (trade
//   symbols like XAUUSD, employee codes, order ids, tag names, version
//   strings, file names, chart axis ticks). Everything a reader reads as
//   WORDS — Thai or English — is the body face at the 13/500 caption scale.
// ════════════════════════════════════════════════════════════════════════════
{
  const SRC_ROOT = paletteJoin(__LOOP_ROOT__, 'src');
  const typoFiles = paletteSrcFiles(paletteJoin(__LOOP_ROOT__, 'src'));
  const typo = typoFiles.map(f => [paletteRel(f), paletteRead(f, 'utf8')]);
  const isChangelog = (rel) => rel.endsWith('VersionHistory.jsx');
  // A comment may quote the old pattern to explain why it is gone.
  const stripComments = (t) => t
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n').filter(l => !/^\s*(\/\/|\*)/.test(l)).join('\n');

  section('v4.57 · A11 Major 2 — ป้ายเป็น sentence case ทั้งแอป (สแกน src/ จริง)');
  {
    const upper = typo.filter(([, t]) =>
      /textTransform:\s*['"]uppercase['"]/.test(stripComments(t)) ||
      /text-transform:\s*uppercase/.test(stripComments(t)));
    check('ไม่มี textTransform / text-transform: uppercase เหลือใน src/',
      upper.length === 0, upper.map(([f]) => f).join(', ') || 'สะอาด');

    // Negative tracking is the iOS display idiom and stays; positive tracking
    // is the stencil look this redesign removed.
    const tracked = [];
    for (const [rel, t] of typo) {
      const body = stripComments(t);
      const hits = [
        ...body.matchAll(/letterSpacing:\s*['"](\.\d+|0?\.\d+|[1-9][\d.]*)em['"]/g),
        ...body.matchAll(/letter-spacing:\s*(\.\d+|0?\.\d+|[1-9][\d.]*)em/g),
      ].filter(m => parseFloat(m[1]) > 0);
      if (hits.length) tracked.push(`${rel}×${hits.length}`);
    }
    check('ไม่มี letter-spacing เป็นบวกเหลือใน src/ (ของติดลบคือ iOS display จึงอยู่ได้)',
      tracked.length === 0, tracked.join(', ') || 'สะอาด');
  }

  section('v4.58 · A11 r2 Major — --f-mono อยู่เฉพาะตัวเลข/รหัส (ตรวจด้วย AST)');
  {
    // file → [ceiling, why it is legitimately monospaced]. The ceiling is the
    // teeth: mono may stay where the audit accepted it, but it may not grow,
    // and it may not appear in a file that is not on this list at all.
    const MONO_ALLOW = new Map([
      ['components/AsanaHours.jsx',                [3,  'ชั่วโมงงาน + ช่อง PAT token']],
      ['components/CSVImporter.jsx',               [7,  'ยอด/วันที่ในตารางพรีวิว · ชื่อไฟล์ · รหัส PDF']],
      ['components/DayCountdown.jsx',              [2,  'นาฬิกานับถอยหลังในวงแหวน']],
      ['components/MobileNav.jsx',                 [1,  'เลขเวอร์ชัน']],
      ['components/SheetTimeline.jsx',             [2,  'ตัวเลขในไทล์ + ช่อง URL ชีท']],
      ['components/Sidebar.jsx',                   [1,  'เลขเวอร์ชัน']],
      ['components/TradeForm.jsx',                 [1,  'ช่องกรอกค่า R']],
      ['components/VersionHistory.jsx',            [1,  'เลขเวอร์ชันในหัวรายการ']],
      ['components/dashboard/CashFlowChart.jsx',   [1,  'แกนตัวเลขของกราฟ']],
      ['components/dashboard/Charts.jsx',          [3,  'ลำดับ · วันที่ · ตัวเลขในกราฟ']],
      ['components/dashboard/CreditCards.jsx',     [8,  'ยอด/วงเงิน/ดอกเบี้ย + ช่องกรอกตัวเลข']],
      ['components/dashboard/DebtAdvice.jsx',      [1,  'ลำดับการปลดหนี้']],
      ['components/dashboard/DebtTracker.jsx',     [10, 'ยอดหนี้ + ช่องกรอกตัวเลข/วันที่']],
      ['components/dashboard/FinanceWidgets.jsx',  [4,  'ยอดรายเดือน + ช่องกรอกตัวเลข']],
      ['components/dashboard/KPICard.jsx',         [1,  'ลูกศร + เดลตาเป็นตัวเลข']],
      ['components/dashboard/LifeOSWidgets.jsx',   [8,  'ตัวเลขเป้าหมาย + ช่องกรอกตัวเลข/วันที่']],
      ['components/dashboard/MoneyLeaks.jsx',      [4,  'ยอด · วันที่ · อัตราการออม']],
      ['components/dashboard/MonthNav.jsx',        [1,  'ปี พ.ศ.']],
      ['components/dashboard/ScopeTransferModal.jsx', [2, 'ช่องกรอกจำนวนเงินและวันที่']],
      ['components/family/MemberDetail.jsx',       [17, 'ส่วนสูง/น้ำหนัก/วันที่ + แกนกราฟการเติบโต']],
      ['components/learning/StudyDrawer.jsx',      [12, 'นาฬิกาจับเวลา · คะแนน · ช่องกรอกตัวเลข']],
      ['components/trading/PlaybookA3Doc.jsx',     [10, 'ตัวเลข R และป้ายในไดอะแกรม (EMA 200 · ATR)']],
      ['components/trading/PnLCalendar.jsx',       [5,  'กำไร/ขาดทุนรายวันในปฏิทิน']],
      ['components/trading/TradingPlaybook.jsx',   [2,  'ช่วงเวลาเทรด + ลำดับข้อ']],
      ['pages/Dashboard.jsx',                      [2,  'ตัวเลขสรุป + เวลานัด']],
      ['pages/Family.jsx',                         [2,  'เปอร์เซ็นต์อัปโหลด + ลำดับรูป']],
      ['pages/Finance.jsx',                        [1,  'วันครบกำหนดเป้าหมาย']],
      ['pages/Journal.jsx',                        [2,  'เลขออเดอร์ + ช่องวางตารางดิบ']],
      ['pages/Learning.jsx',                       [3,  'วันที่ + เปอร์เซ็นต์ความคืบหน้า']],
      ['pages/PettyCash.jsx',                      [10, 'ยอดเบิก/ยอดโอนในตารางกระทบยอด']],
      ['pages/SecondBrain.jsx',                    [5,  'ชื่อแท็ก · เวลาที่แก้ล่าสุด']],
      ['pages/TaxPlanner.jsx',                     [1,  'สไตล์ตัวเลขกลางของหน้าภาษี']],
      ['pages/Team.jsx',                           [3,  'รหัสพนักงาน + ยอดเบิก']],
      ['pages/Trading.jsx',                        [14, 'สัญลักษณ์คู่เงิน (XAUUSD) · R · P&L · ยอดพอร์ต']],
      ['styles.css',                               [11, 'นิยามโทเคน + คลาสตัวเลข (.mono · .stat__value--mono · .txn-row__amount · .trade-symbol)']],
    ]);
    const monoCount = new Map();
    for (const [rel, t] of typo) {
      const n = (t.match(/--f-mono/g) || []).length;
      if (n) monoCount.set(rel, n);
    }
    const strays = [...monoCount.keys()].filter(f => !MONO_ALLOW.has(f));
    check('--f-mono ไม่โผล่ในไฟล์นอก allowlist',
      strays.length === 0, strays.join(', ') || `อยู่ใน ${monoCount.size} ไฟล์ตามที่ประกาศ`);

    const grown = [];
    for (const [rel, [ceiling]] of MONO_ALLOW) {
      const n = monoCount.get(rel) || 0;
      if (n > ceiling) grown.push(`${rel} ${n}>${ceiling}`);
    }
    check('จำนวน --f-mono ในแต่ละไฟล์ไม่เกินเพดานที่ audit ยอมรับ',
      grown.length === 0, grown.join(', ') || 'ทุกไฟล์อยู่ในเพดาน');

    const total = [...monoCount.values()].reduce((a, b) => a + b, 0);
    check('--f-mono ทั้ง src/ ไม่เกิน 161 จุด (A11 นับได้ 346 · r1 เหลือ 168)',
      total <= 161, `${total} จุด`);

    // THE POINT OF THE SWEEP — and the check r1 got wrong.
    // v4.57 read the first literal text node after each `var(--f-mono)`. That
    // is proximity, not rendering, so it could not see text arriving from a
    // JSX expression, a constant, an SVG template string or a style reached
    // through a variable — and it passed while four real violations sat in
    // HEAD. audit/style-scan.mjs parses the file and answers the real
    // question: what text does this style actually paint?
    //
    // v4.60 widened "paints" twice more, and both had live examples in HEAD:
    // a visible text ATTRIBUTE (a mono <input>'s Thai placeholder) and a face
    // that arrives from a CLASS in styles.css rather than an inline style.
    const TOKEN_OK = [
      'hr', 'min',            // unit suffixes glued to a figure — fmtHr()
      'csv', 'UTF',           // a file-format stamp: ".csv · UTF-8"
      'personal', 'family',   // the scope KEY, printed as an identifier
      'MACD', 'EMA', 'Signal', // indicator names on the playbook diagram
    ];
    const FACTS = styleFacts(SRC_ROOT);
    const wordy = wordsAmong(monoSites(SRC_ROOT, FACTS), TOKEN_OK);
    check('ไม่มีคำ (ไทย/อังกฤษ) ถูกเรนเดอร์ด้วยฟอนต์ mono — ตรวจด้วย AST ไม่ใช่ regex',
      wordy.length === 0,
      wordy.map(w => `${w.file}:${w.line} ${w.via} ${JSON.stringify(w.text.slice(0, 40))}`).join(' · ') || 'สะอาด');
    check('AST inventory เห็น mono site ครบทั้ง src/ (ไม่ใช่ scan ที่ตาบอด)',
      monoSites(SRC_ROOT, FACTS).length >= 150, `${monoSites(SRC_ROOT, FACTS).length} sites`);

    // The scan now DEPENDS on the stylesheet, so the stylesheet is asserted.
    // Deleting either rule silently re-blinds the scanner, which is exactly the
    // failure mode r1 and r2 shipped — so neither may vanish quietly.
    check('scanner อ่าน styles.css เจอคลาสที่เป็น mono (class-based paint path)',
      FACTS.monoClasses.has('mono') && FACTS.monoClasses.size >= 5,
      [...FACTS.monoClasses].join(', '));
    check('placeholder ของ input/textarea ถูกกำหนดเป็น body face ใน styles.css',
      FACTS.placeholderBodyFace.has('input') && FACTS.placeholderBodyFace.has('textarea'),
      [...FACTS.placeholderBodyFace].join(', ') || 'ไม่มีกฎ — placeholder ไทยจะถูกวาดด้วย mono');

    // Class-based mono is a REAL path, not a hypothetical: assert the audit of
    // it, so the day someone writes className="mono" on Thai prose it fails.
    const key = s => `${s.file}:${s.line}:${s.via}`;
    const withoutClasses = new Set(
      monoSites(SRC_ROOT, { ...FACTS, monoClasses: new Set() }).map(key));
    const classOnly = monoSites(SRC_ROOT, FACTS).filter(s => !withoutClasses.has(key(s)));
    check('ไม่มี element ไหนรับ mono มาจาก className แล้วพ่นคำออกมา',
      wordsAmong(classOnly, TOKEN_OK).length === 0,
      `${classOnly.length} class-mono sites · ${wordsAmong(classOnly, TOKEN_OK).length} เป็นคำ`);
  }

  section('v4.58 · A11 r2 Minor — emoji ผูกกับตัวแปรที่ประกาศ ไม่ใช่ทั้งไฟล์');
  {
    // Emoji that are DATA the owner picks, parses or has already saved. Each
    // entry is a promise: the sweep will not convert these, and nothing else
    // may hide behind the exemption.
    //
    // v4.57 exempted the whole FILE, so a new UI emoji could hide anywhere
    // inside a file that legitimately stores data emoji — which is the
    // opposite of what its own comment promised. The unit is now the exact
    // declaration that holds it: `file::BINDING`.
    const EMOJI_DATA = new Map([
      ['components/VersionHistory.jsx::CHANGELOG',        'ข้อความ changelog ย้อนหลัง'],
      ['components/VersionHistory.jsx::VersionHistory',   'ไอคอนในหัวรายการ changelog'],
      ['components/CSVImporter.jsx::TYPE_ICONS',          'คำศัพท์หมวดเดียวกับที่ผู้ใช้เลือกเอง'],
      ['components/AsanaHours.jsx::NEGATIVE_PREFIX',      'regex อ่าน emoji ที่มาจาก Asana จริง'],
      ['components/dashboard/Charts.jsx::CATEGORY_ICONS', 'ไอคอนหมวดค่าใช้จ่าย'],
      ['components/dashboard/DebtTracker.jsx::TYPE_META', 'ไอคอนชนิดหนี้'],
      ['components/dashboard/LifeOSWidgets.jsx::CATEGORY_META', 'ไอคอนโมดูล'],
      ['components/dashboard/LifeOSWidgets.jsx::tiles',   'ไอคอนโมดูลบนแถบ Life Pulse'],
      ['components/dashboard/MoneyLeaks.jsx::iconOf',     'ไอคอนหมวด (fallback)'],
      ['components/dashboard/ScopeTransferModal.jsx::SCOPE_META', 'ไอคอน scope'],
      ['components/family/MemberDetail.jsx::MILESTONE_CAT', 'ไอคอนชนิด milestone'],
      ['components/learning/StudyDrawer.jsx::KINDS',      'ไอคอนชนิด insight'],
      ['components/learning/StudyDrawer.jsx::SessionList','เครื่องหมายดาวคะแนนความเข้าใจ'],
      ['pages/Dashboard.jsx::MOOD_EMOJI',                 'อารมณ์ที่ผู้ใช้บันทึกไว้'],
      ['pages/Journal.jsx::MOODS',                        'ตัวเลือกอารมณ์ที่บันทึกลงฐานข้อมูล'],
      ['pages/Journal.jsx::BULLET_TYPES',                 'สัญลักษณ์ bullet ที่ผู้ใช้เลือก'],
      ['pages/Finance.jsx::DEFAULT_CATEGORIES',           'หมวดตั้งต้นที่ผู้ใช้แก้ emoji เองได้'],
      ['pages/Finance.jsx::catIconOf',                    'fallback ของ emoji หมวดที่ผู้ใช้เลือก'],
      ['pages/Finance.jsx::icon',                         'prompt ให้ผู้ใช้พิมพ์ emoji ของหมวดเอง'],
      ['pages/Learning.jsx::SOURCE_TYPES',                'ไอคอนชนิดแหล่งเรียนรู้'],
      ['pages/LifeCalendar.jsx::MILESTONE_EMOJIS',        'ตัวเลือกที่ผู้ใช้บันทึกไว้'],
      ['pages/LifeCalendar.jsx::MilestoneForm',           'ค่าเริ่มต้นของ emoji picker'],
      ['pages/PettyCash.jsx::readMarks',                  "prefix '🟢' ของชื่อแท็บใน Google Sheet จริง"],
      ['pages/PettyCash.jsx::readSavedSlides',            "prefix '🟢' ของชื่อแท็บใน Google Sheet จริง"],
      ['lib/noteTemplates.js::NOTE_TEMPLATES',            'emoji ประจำเทมเพลตที่ติดไปกับโน้ตของผู้ใช้'],
      ['lib/api/learning.js::getStudyHints',              'ไอคอนของ hint ที่ lib ส่งกลับมา'],
    ]);
    const strayEmoji = emojiSites(SRC_ROOT)
      .filter(e => !EMOJI_DATA.has(`${e.file}::${e.binding}`))
      .map(e => `${e.file}::${e.binding}:${e.line} ${e.text.slice(0, 16)}`);
    check('emoji เหลือเฉพาะ "ตัวแปรที่ประกาศว่าเป็นข้อมูล" (ไม่ใช่ยกเว้นทั้งไฟล์)',
      strayEmoji.length === 0,
      [...new Set(strayEmoji)].slice(0, 6).join(' · ') || `${EMOJI_DATA.size} binding ตามที่ประกาศ`);

    // ✓ / ✗ are not in the pictographic ranges above, so they get their own
    // scan — this is exactly the gap A11 Minor 3 found.
    const checkGlyph = [];
    for (const [rel, t] of typo) {
      if (isChangelog(rel)) continue;
      if (/[✓✔✗✕]/.test(stripComments(t))) checkGlyph.push(rel);
    }
    check('ไม่มีเครื่องหมาย ✓/✗ เป็น glyph ใน UI (ใช้ <Icon name="check"/> แทน)',
      checkGlyph.length === 0, checkGlyph.join(', ') || 'สะอาด');
  }

  section('v4.58 · A11 r2 Minor — ปุ่มไอคอนต้องมีชื่อ (AST · ครอบ custom component)');
  {
    const iconSrc = typo.find(([rel]) => rel.endsWith('components/Icon.jsx'))[1];
    check('Icon เป็น decorative โดยปริยาย (aria-hidden + focusable="false")',
      /'aria-hidden':\s*'true'/.test(iconSrc) && /focusable:\s*'false'/.test(iconSrc));
    check('Icon มี prop label ที่สลับไปเป็น role="img" + aria-label',
      /role:\s*'img'/.test(iconSrc) && /'aria-label':\s*label/.test(iconSrc));

    // v4.57 string-matched lowercase `<button>` and cut at the first
    // `</button>`, so a shared <Button> wrapper, an <a>, or any nesting was
    // invisible to it. This walks the AST, and treats as interactive every
    // component in src/ whose own markup ROOTS at a <button> or an <a>.
    //
    // v4.60: "its own markup" now means what it says. v4.58 walked the whole
    // subtree, so any `return <button>` inside a CALLBACK counted and page
    // components (CSVImporter, Journal, Learning, PettyCash, TaxPlanner…) were
    // classified as button wrappers — 50 names, most of them wrong. Counting
    // only the component's own returns gives a list that is actually true.
    const custom = [...interactiveComponents(SRC_ROOT)];
    check(`guard รู้จัก component ที่เป็นปุ่มเอง ไม่ใช่แค่ <button> ตัวเล็ก (${custom.length} ตัว)`,
      custom.includes('Button') && custom.includes('IconButton'), custom.sort().join(', '));
    // and it must NOT over-classify: a page is not a button because it holds one
    const notButtons = ['CSVImporter', 'Journal', 'Learning', 'PettyCash', 'TaxPlanner', 'App'];
    const overClassified = notButtons.filter(n => custom.includes(n));
    check('หน้าเพจที่แค่ "มีปุ่มอยู่ข้างใน" ต้องไม่ถูกนับเป็น component ปุ่ม',
      overClassified.length === 0 && custom.length < 20,
      overClassified.join(', ') || `${custom.length} ตัว — ไม่มีเพจปนมา`);
    const unnamed = unnamedIconControls(SRC_ROOT);
    check('ทุก control ที่มีแต่ไอคอนมี aria-label (หรือ Icon ที่มี label) — ตรวจด้วย AST',
      unnamed.length === 0,
      unnamed.map(u => `${u.file}:${u.line} <${u.tag}>`).join(', ') || 'ตั้งชื่อครบ');
  }
}

// ════════════════════════════════════════════════════════════════════════════
// v4.58 · A11 r2 — THE GUARDS MUST CATCH THE COUNTEREXAMPLES
//
// A guard that only ever says PASS is indistinguishable from no guard. r1's
// mono scan passed on a HEAD that contained four real violations, so this
// section feeds each shape to the scanner IN MEMORY (never written to src/)
// and asserts it is caught. If someone simplifies style-scan.mjs back into a
// proximity regex, these go red immediately.
// ════════════════════════════════════════════════════════════════════════════
section('v4.58 · A11 r2 — negative cases: scanner จับ 4 รูปแบบที่ regex มองไม่เห็น');
{
  const caught = (code, tokens = []) => wordsAmong(monoSitesIn('synthetic.jsx', code), tokens).length > 0;

  // (a) text arriving as a JSX expression child, beside a literal word
  check('(a) JSX expression child — <div style={mono}>{n} trade</div>',
    caught(`const mono = { fontFamily: 'var(--f-mono)' };
      export const A = ({ n }) => <div style={mono}>{n} trade</div>;`));

  // (b) text arriving from a constant, and from a function that reads one
  check('(b) ข้อความจาก constant — WEEKDAYS = [ไทย] แล้ว render {w}',
    caught(`const WEEKDAYS = ['จ', 'อ', 'พ'];
      export const B = () => WEEKDAYS.map(w =>
        <div style={{ fontFamily: 'var(--f-mono)' }}>{w}</div>);`));
  check('(b) ข้อความผ่านฟังก์ชัน — fmtYM() คืนชื่อเดือนไทยจาก constant',
    caught(`const MONTHS = ['ม.ค.', 'ก.พ.'];
      function fmtYM(ym) { return MONTHS[Number(ym) - 1] || ''; }
      export const B2 = ({ ym }) =>
        <text fontFamily="var(--f-mono)">{fmtYM(ym)}</text>;`));

  // (c) SVG written as a template string — never reaches the JSX AST at all
  check('(c) SVG ใน template string — <text font-family="var(--f-mono)">ไทย</text>',
    caught('const svg = `<svg><text font-family="var(--f-mono)">แท่งสัญญาณปิด</text></svg>`;\nexport const C = () => <div dangerouslySetInnerHTML={{ __html: svg }} />;'));

  // (d) the style reached through a variable, including a spread
  check('(d) style ผ่านตัวแปร — style={MONO_LABEL} และ {{ ...mono10 }}',
    caught(`const MONO_LABEL = { fontFamily: 'var(--f-mono)', fontSize: 10 };
      const mono10 = MONO_LABEL;
      export const D = () => <>
        <div style={MONO_LABEL}>ยอดคงเหลือรวม</div>
        <span style={{ ...mono10, color: 'red' }}>ครบกำหนด</span>
      </>;`));

  // and the other direction: a real figure must NOT trip the guard
  check('ตัวเลขล้วนไม่ถูกจับผิด — mono กับ {baht(x)} ต้องผ่าน',
    !caught(`const mono = { fontFamily: 'var(--f-mono)' };
      export const E = ({ x }) => <div style={mono}>{baht(x)}</div>;`));
  check('โทเคนที่ประกาศไว้ไม่ถูกจับผิด — "XAUUSD" อยู่ได้',
    !caught(`export const F = ({ t }) => <span style={{ fontFamily: 'var(--f-mono)' }}>XAUUSD</span>;`,
      ['XAUUSD']));
}

// ════════════════════════════════════════════════════════════════════════════
// v4.60 · A11 r3 — the two paint paths r2 still could not see
//
// r2 asked "what text does this element render?" and answered it by reading
// CHILDREN, from a file with a .jsx extension. Both halves were too narrow:
//
//   (e) a control paints its own ATTRIBUTES too. `<input placeholder="ส่วนสูง
//       cm" style={mono}/>` renders no children at all, so it returned text:""
//       and passed — while the user reads Thai words on the monospace face.
//   (f) the face need not be in the component. `.mono` lives in styles.css,
//       which srcFiles() never opened, so className="mono" was invisible.
//
// Both are resolved FROM THE STYLESHEET, so each case is asserted in both
// directions: the violation is caught when the CSS does not excuse it, and NOT
// caught when the CSS genuinely does.
// ════════════════════════════════════════════════════════════════════════════
section('v4.60 · A11 r3 — negative cases: placeholder และ mono ที่มาจาก class');
{
  const MONO_INPUT = `export const A = () =>
    <input placeholder="ส่วนสูง cm" style={{ fontFamily: 'var(--f-mono)' }} />;`;

  // (e) with NO ::placeholder rule the hint really is painted mono → catch it
  check('(e) placeholder ไทยบน input ที่เป็น mono → ถูกจับ (ไม่มีกฎ ::placeholder)',
    wordsAmong(monoSitesIn('synthetic.jsx', MONO_INPUT, {})).length === 1);
  // …and the stylesheet is allowed to settle it, but only by actually saying so
  const BODY_FACE = cssStyleFacts('input::placeholder { font-family: var(--f-body); }');
  check('(e) ถ้า styles.css ให้ placeholder เป็น body face → ไม่ถูกจับผิด',
    wordsAmong(monoSitesIn('synthetic.jsx', MONO_INPUT, BODY_FACE)).length === 0,
    [...BODY_FACE.placeholderBodyFace].join(', '));
  // a mono ::placeholder rule is NOT an excuse — it confirms the violation
  const MONO_PH = cssStyleFacts('input::placeholder { font-family: var(--f-mono); }');
  check('(e) กฎ ::placeholder ที่ยังเป็น mono ไม่ใช่ข้อยกเว้น → ยังถูกจับ',
    wordsAmong(monoSitesIn('synthetic.jsx', MONO_INPUT, MONO_PH)).length === 1);
  // the value attribute paints too, when it resolves to literal words
  check('(e) value ที่เป็นคำไทยบน control mono → ถูกจับ',
    wordsAmong(monoSitesIn('synthetic.jsx',
      `export const V = () => <input readOnly value="ยังไม่ได้บันทึก" style={{ fontFamily: 'var(--f-mono)' }} />;`, {})).length === 1);
  // …but a title is drawn by the BROWSER in the OS font, not this face
  check('(e) title ไม่ถูกนับ — เบราว์เซอร์วาด tooltip ด้วยฟอนต์ระบบ ไม่ใช่ฟอนต์ของ element',
    wordsAmong(monoSitesIn('synthetic.jsx',
      `export const T = () => <span title="คำอธิบายยาว ๆ" style={{ fontFamily: 'var(--f-mono)' }}>12.5</span>;`, {})).length === 0);

  // (f) the face arrives from styles.css, not from the component
  const CSS = cssStyleFacts('.mono { font-family: var(--f-mono); } .num { font-family: monospace; }');
  check('(f) styles.css ถูก parse เจอคลาสที่เป็น mono',
    CSS.monoClasses.has('mono') && CSS.monoClasses.has('num'),
    [...CSS.monoClasses].join(', '));
  const CLASS_USE = `export const B = () => <div className="mono">ยอดคงเหลือรวม</div>;`;
  check('(f) className="mono" กับข้อความไทย → ถูกจับ',
    wordsAmong(monoSitesIn('synthetic.jsx', CLASS_USE, CSS)).length === 1);
  check('(f) นี่คือจุดบอดของ r2 จริง — ถ้าไม่อ่าน CSS จะไม่เห็นเลย',
    monoSitesIn('synthetic.jsx', CLASS_USE, {}).length === 0);
  check('(f) className ที่ไม่ได้เป็น mono ไม่ถูกจับผิด',
    monoSitesIn('synthetic.jsx',
      `export const C = () => <div className="card muted">ยอดคงเหลือรวม</div>;`, CSS).length === 0);
  check('(f) className="mono" กับตัวเลขล้วน ไม่ถูกจับผิด',
    wordsAmong(monoSitesIn('synthetic.jsx',
      `export const D = ({ x }) => <div className="mono">{baht(x)}</div>;`, CSS)).length === 0);
}

section('v4.60 · A11 r3 — negative case: หน้าเพจที่มีปุ่มข้างใน ไม่ใช่ "component ปุ่ม"');
{
  // r2 walked the whole subtree, so a `return <button>` inside a CALLBACK made
  // the enclosing page look like a button wrapper. That inflated the list to 50
  // and would have handed the icon-name guard false positives to cry wolf with.
  const PAGE = `
    export function ImporterPage({ rows }) {
      const renderRow = (r) => { return <button onClick={r.go}>{r.label}</button>; };
      return <div className="page">{rows.map(renderRow)}</div>;
    }
    export function Toolbar() {
      return <div>{['a','b'].map(k => <button key={k}>{k}</button>)}</div>;
    }
    export function RealButton({ children, onClick }) {
      return <button onClick={onClick} className="focus-ring">{children}</button>;
    }
    export const LinkBtn = ({ href, children }) => <a href={href}>{children}</a>;`;
  const found = [...interactiveComponentsIn(PAGE)].sort();
  check('เพจที่คืน <div> แต่มีปุ่มใน callback → ต้องไม่ถูกจัดเป็น component ปุ่ม',
    !found.includes('ImporterPage') && !found.includes('Toolbar'), found.join(', '));
  check('component ที่ root เป็น <button>/<a> จริง → ยังถูกจับได้',
    found.includes('RealButton') && found.includes('LinkBtn'), found.join(', '));
  check('นับได้เฉพาะสองตัวที่เป็นปุ่มจริง ไม่มีเพจปนมา',
    found.length === 2, `${found.length} ตัว — ${found.join(', ')}`);
}

section('v4.58 · A11 r2 — negative cases: emoji ระดับตัวแปร และปุ่ม custom');
{
  // The r1 emoji guard exempted a whole file, so a UI emoji dropped into a
  // file that legitimately stores data emoji sailed through. Same file, new
  // binding — the scan must see two DIFFERENT bindings and flag only the new one.
  const mixed = `export const MOODS = [{ value: 1, emoji: '😞' }];
    export function Toolbar() { return <button>💾 บันทึก</button>; }`;
  const sites = emojiSitesIn('pages/Journal.jsx', mixed);
  const bindingsSeen = [...new Set(sites.map(e => e.binding))].sort();
  check('emoji scan แยกตาม binding ไม่ใช่ทั้งไฟล์ (MOODS + Toolbar)',
    bindingsSeen.length === 2 && bindingsSeen.includes('MOODS') && bindingsSeen.includes('Toolbar'),
    bindingsSeen.join(', '));
  const ALLOW = new Set(['pages/Journal.jsx::MOODS']);
  const stray = sites.filter(e => !ALLOW.has(`${e.file}::${e.binding}`));
  check('เติม UI emoji ลงไฟล์ที่มี data emoji อยู่แล้ว → ต้องถูกจับ',
    stray.length === 1 && stray[0].binding === 'Toolbar',
    stray.map(s => s.binding).join(', ') || 'ไม่ถูกจับ (ช่องโหว่)');

  // r1 matched the literal string "<button", so a shared wrapper was invisible.
  check('ปุ่ม native ที่มีแต่ไอคอนและไม่มีชื่อ → ถูกจับ',
    unnamedIconControlsIn('t.jsx', `export const A = () => <button onClick={f}><Icon name="x" /></button>;`).length === 1);
  check('custom <Button> ที่มีแต่ไอคอนและไม่มีชื่อ → ถูกจับด้วย',
    unnamedIconControlsIn('t.jsx', `export const B = () => <Button onClick={f}><Icon name="x" /></Button>;`,
      new Set(['Button'])).length === 1);
  check('<a> ที่มีแต่ไอคอนและไม่มีชื่อ → ถูกจับด้วย',
    unnamedIconControlsIn('t.jsx', `export const C = () => <a href="/x"><Icon name="link" /></a>;`).length === 1);
  check('ปุ่มที่มี aria-label แล้ว ไม่ถูกจับผิด',
    unnamedIconControlsIn('t.jsx', `export const D = () => <button aria-label="ปิด"><Icon name="x" /></button>;`).length === 0);
  check('ปุ่มที่มีข้อความอยู่ใน element ซ้อน ไม่ถูกจับผิด',
    unnamedIconControlsIn('t.jsx', `export const E = () => <button><Icon name="x" /><span>บันทึก</span></button>;`).length === 0);
}

console.log(`\n──── RESULT: ${pass} passed, ${fail} failed ────`);
process.exit(fail ? 1 : 0);
