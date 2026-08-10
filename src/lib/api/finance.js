import { supabase } from '../supabase.js';

// ── Helpers ───────────────────────────────────────────────────────────────────
export function currentYearMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export function getMonthBounds(yearMonth) {
  const [y, m] = yearMonth.split('-').map(Number);
  const start = `${y}-${String(m).padStart(2, '0')}-01`;
  const nextY = m === 12 ? y + 1 : y;
  const nextM = m === 12 ? 1 : m + 1;
  const end = `${nextY}-${String(nextM).padStart(2, '0')}-01`;
  // `occurred_at` is timestamptz. A bare 'YYYY-MM-01' is read as UTC midnight
  // = 07:00 Bangkok, which drops the first 7 hours of the month and steals the
  // last 7 hours of the previous one. startTs/endTs pin the real local bounds.
  // start/end stay bare for plain DATE columns (e.g. debt_payments.pay_month).
  return {
    start, end,
    startTs: `${start}T00:00:00+07:00`,
    endTs:   `${end}T00:00:00+07:00`,
  };
}

const BANGKOK = 'Asia/Bangkok';

/** A timestamp → its Bangkok calendar date, `YYYY-MM-DD`. */
export function bangkokDate(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  if (isNaN(d)) return String(ts).substring(0, 10);
  return d.toLocaleDateString('sv-SE', { timeZone: BANGKOK });
}

/** A timestamp → its Bangkok calendar month, `YYYY-MM`. */
export function bangkokMonth(ts) {
  return bangkokDate(ts).substring(0, 7);
}

/** A timestamp → its Bangkok wall-clock time, `HH:mm:ss` (empty if unreadable). */
export function bangkokTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  if (isNaN(d)) return '';
  return d.toLocaleTimeString('en-GB', { timeZone: BANGKOK, hour12: false });
}

// ── RPC / schema fallbacks ───────────────────────────────────────────────────
// SQL migrations are run by hand in the Supabase SQL Editor, so the deployed
// app can never assume a function or column exists yet. Every RPC call site
// checks these and falls back to the legacy client-side path.

/** Postgres 42883 / PostgREST PGRST202 = function does not exist (yet). */
export function isRpcMissing(err) {
  if (!err) return false;
  const code = err.code || '';
  const msg  = String(err.message || '');
  return code === '42883' || code === 'PGRST202'
    || /could not find the function|function .* does not exist/i.test(msg);
}

/** Postgres 42703 / PostgREST PGRST204 = column does not exist (yet). */
export function isColumnMissing(err) {
  if (!err) return false;
  const code = err.code || '';
  const msg  = String(err.message || '');
  return code === '42703' || code === 'PGRST204'
    || /could not find the .* column|column .* does not exist/i.test(msg);
}

// ── Pagination ───────────────────────────────────────────────────────────────
// PostgREST silently caps a response at max-rows (default 1000) even when
// .limit() asks for more — a >1000-row month under-counted every total.
// Fetch in pages until a short page (or the caller's cap) instead.
const PAGE_SIZE = 1000;

async function fetchAllPages(buildQuery, limit = Infinity) {
  const all = [];
  for (let from = 0; all.length < limit; from += PAGE_SIZE) {
    const to = Math.min(from + PAGE_SIZE, limit) - 1;
    const { data, error } = await buildQuery().range(from, to);
    if (error) throw error;
    if (!data?.length) break;
    all.push(...data);
    if (data.length < (to - from + 1)) break;   // short page = no more rows
  }
  return all;
}

// ── CSV Parser (KBank Make + generic Thai bank CSV) ──────────────────────────

/** Pockets that belong to family scope */
const FAMILY_POCKETS = ['กองทุนครอบครัว', 'เงินเพื่อน้องอคิน'];

/** "กล่องกลาง" — เงินเข้ามาที่นี่ก่อนเสมอ (Make app constraint) */
const CASHBOX_POCKET = 'Cashbox';

/** Pockets ที่เป็น auto-saving feature ของ Make — skip ทั้งหมด */
const AUTO_SAVE_POCKETS = ['แอบออมอัตโนมัติ'];

/** Map Make CSV categories → internal { category, type } */
const MAKE_CATEGORY_MAP = {
  'อาหาร':                 { category: 'อาหาร',              type: 'food'      },
  'ชา กาแฟ':               { category: 'กาแฟ',               type: 'food'      },
  'เดินทาง รถ':            { category: 'เดินทาง',            type: 'transport' },
  'จ่ายบิล':               { category: 'ค่าสาธารณูปโภค',    type: 'bills'     },
  'ค่าน้ำ ไฟ โทรศัพท์':   { category: 'ค่าสาธารณูปโภค',    type: 'bills'     },
  'ค่าน้ำ ไฟ โทรศัพท์ ':  { category: 'ค่าสาธารณูปโภค',    type: 'bills'     },
  'จ่ายหนี้':              { category: 'จ่ายหนี้',           type: 'bills'     },
  'ช้อปปิ้ง':              { category: 'ช้อปปิ้ง',           type: 'shop'      },
  'เหล้า เบียร์ party':   { category: 'บันเทิง',            type: 'other'     },
  'อื่นๆ':                 { category: 'อื่น ๆ',             type: 'other'     },
};

/**
 * Parse a CSV string into { headers, rows }.
 * Handles quoted fields, Thai encoding, BOM.
 */
export function parseCSV(text) {
  // Strip BOM and normalize line endings
  const lines = text.replace(/^﻿/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');

  let headerIdx = 0;
  while (headerIdx < lines.length && !lines[headerIdx].trim()) headerIdx++;
  if (headerIdx >= lines.length) return [];

  const parseRow = (line) => {
    const fields = [];
    let cur = '';
    let inQuote = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuote && line[i + 1] === '"') { cur += '"'; i++; }
        else inQuote = !inQuote;
      } else if (ch === ',' && !inQuote) {
        fields.push(cur.trim());
        cur = '';
      } else {
        cur += ch;
      }
    }
    fields.push(cur.trim());
    return fields;
  };

  const headers = parseRow(lines[headerIdx]);
  const rows = [];
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const values = parseRow(line);
    if (values.every(v => !v)) continue;
    const row = {};
    headers.forEach((h, idx) => { row[h] = values[idx] ?? ''; });
    rows.push(row);
  }
  return { headers, rows };
}

/**
 * Detect Make by KBank Cloud Pocket CSV columns + generic bank CSV columns.
 */
export function detectKBankColumns(headers) {
  // Strip BOM from first header just in case
  const lower = headers.map(h => h.toLowerCase().trim().replace(/^﻿/, ''));
  const find = (...terms) => {
    const idx = lower.findIndex(h => terms.some(t => h.includes(t)));
    return idx >= 0 ? headers[idx] : null;
  };

  return {
    // ── Make Cloud Pocket format ──
    pocketCol:   find('cloud pocket', 'pocket name', 'pocket'),
    txTypeCol:   find('type'),
    txnCol:      find('txn'),       // signed amount
    cpBalCol:    find('cp bal'),    // pocket balance AFTER this txn
    categoryCol: find('category'),
    memoCol:     find('memo'),
    timeCol:     find('time'),
    noteCol:     find('note'),      // merchant / payee name
    // ── Generic bank CSV format ──
    dateCol:     find('date', 'วันที่', 'transaction date', 'txn date'),
    descCol:     find('รายการ', 'description', 'desc', 'details', 'detail', 'payee', 'merchant'),
    amountCol:   find('amount', 'จำนวนเงิน', 'net amount'),
    debitCol:    find('เดบิต', 'ถอน', 'debit', 'withdrawal', 'จำนวนเงินถอน'),
    creditCol:   find('เครดิต', 'ฝาก', 'credit', 'deposit', 'จำนวนเงินฝาก'),
    balanceCol:  find('account bal', 'ยอดคงเหลือ', 'balance', 'คงเหลือ'),
  };
}

/** Detect if column map is Make Cloud Pocket format */
export function isMakeFormat(colMap) {
  return !!(colMap.pocketCol && colMap.txnCol);
}

/**
 * Parse Thai date string (d/m/yyyy, dd/mm/yyyy, BE or CE).
 */
export function parseThaiDate(str) {
  if (!str) return null;
  const datePart = String(str).split(' ')[0].split('T')[0].trim();
  // ISO first: the d/m/y regex below matches MID-string, so '2026-07-15' would
  // be read as 15/07/26 → '2015-07-26'.
  const iso = datePart.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) {
    let iy = parseInt(iso[1], 10);
    if (iy > 2400) iy -= 543;   // Buddhist Era → CE
    return `${iy}-${iso[2]}-${iso[3]}`;
  }
  const match = datePart.match(/(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})/);
  if (!match) return datePart;
  let [, d, mo, y] = match;
  y = parseInt(y);
  if (y > 2400) y -= 543;  // Buddhist Era → CE
  if (y < 100)  y += 2000;
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/**
 * Parse amount string → number (handles commas, parentheses for negative).
 */
export function parseAmount(str) {
  if (str == null || str === '') return null;
  let s = String(str)
    .replace(/THB/gi, '')
    .replace(/[฿,]/g, '')
    .replace(/[\s\u00a0]/g, '');
  if (!s || s === '-') return null;

  let neg = false;
  if (s.startsWith('(') && s.endsWith(')')) { neg = true; s = s.slice(1, -1); }
  if (s.endsWith('-'))   { neg = true; s = s.slice(0, -1); }   // '1,234.50-' = negative
  if (s.startsWith('-')) { neg = true; s = s.slice(1); }
  if (s.startsWith('+')) { s = s.slice(1); }

  if (!/^\d+(\.\d+)?$|^\.\d+$/.test(s)) return null;        // reject garbage
  const n = parseFloat(s);
  if (!Number.isFinite(n)) return null;
  return neg ? -n : n;
}

/**
 * Auto-categorize transaction based on description keywords (generic fallback).
 */
export function autoCategory(desc = '') {
  const d = desc.toLowerCase();
  if (/อาหาร|ร้านอาหาร|food|restaurant|coffee|cafe|กาแฟ|สตาร์บัค|7-eleven|เซเว่น|ข้าว|หมู|ไก่/.test(d)) return { category: 'อาหาร', type: 'food' };
  if (/บีทีเอส|mrt|grab|taxi|แท็กซี่|น้ำมัน|ปตท|บางจาก|shell|esso|parking|จอดรถ|ค่าทาง|expressway/.test(d)) return { category: 'เดินทาง', type: 'transport' };
  if (/ไฟฟ้า|ประปา|internet|ค่าน้ำ|ค่าไฟ|true|ais|dtac|phone|โทรศัพท์|netflix|spotify/.test(d)) return { category: 'ค่าสาธารณูปโภค', type: 'bills' };
  if (/เงินเดือน|salary|โอนเข้า|รับเงิน|income|ดอกเบี้ย|interest|dividend|เงินปันผล/.test(d)) return { category: 'รายรับ', type: 'income' };
  if (/lazada|shopee|amazon|ช้อปปี้|ลาซาด้า|central|mall|lotus|big c|makro/.test(d)) return { category: 'ช้อปปิ้ง', type: 'shop' };
  if (/โรงพยาบาล|hospital|หมอ|doctor|pharmacy|ยา|dentist|ฟัน/.test(d)) return { category: 'สุขภาพ', type: 'other' };
  if (/โรงเรียน|school|university|หนังสือ|course|เรียน|tuition/.test(d)) return { category: 'การศึกษา', type: 'other' };
  return { category: 'อื่น ๆ', type: 'other' };
}

/**
 * Convert parsed CSV rows → transaction-ready objects.
 *
 * Make format: scope is auto-detected from Cloud Pocket Name
 *   - กองทุนครอบครัว / เงินเพื่อน้องอคิน → 'family'
 *   - everything else → 'personal'
 *   - Move Money rows are skipped (internal pocket transfers)
 *
 * Generic format: all rows use defaultScope.
 */
export function mapRowsToTransactions(rows, colMap, defaultScope = 'personal') {
  const {
    pocketCol, txTypeCol, txnCol, cpBalCol, categoryCol, memoCol, timeCol, noteCol,
    dateCol, descCol, amountCol, debitCol, creditCol,
  } = colMap;

  const makeFmt = isMakeFormat(colMap);

  // Synthetic-seconds clock (audit round 3): the dedup key is now
  // second-precision, but this source only carries dates (or minutes). Rows
  // sharing the same day/minute get INCREMENTING seconds in file order —
  // deterministic, so re-importing the same file reproduces identical
  // timestamps (dedup still catches true duplicates), while two DISTINCT
  // same-day rows get different seconds and never collapse.
  // Known residual limit: across DIFFERENT export files of the same data the
  // per-day row order must match for perfect dedup; the multiset floor in
  // the importer is the backstop.
  const clockCounters = {};
  const nextClock = (key, baseHM) => {
    const n = clockCounters[key] = (clockCounters[key] ?? -1) + 1;
    const [h, m] = baseHM.split(':').map(Number);
    const total = m * 60 + n;
    const hh = String((h + Math.floor(total / 3600)) % 24).padStart(2, '0');
    const mm = String(Math.floor(total / 60) % 60).padStart(2, '0');
    const ss = String(total % 60).padStart(2, '0');
    return `${hh}:${mm}:${ss}`;
  };

  return rows.flatMap((row, i) => {

    // ── Make Cloud Pocket format ─────────────────────────────────────────────
    if (makeFmt) {
      const pocket = (row[pocketCol] || '').trim();
      const txType = (row[txTypeCol] || '').trim();
      const memo   = (memoCol ? row[memoCol] : '').trim();
      const amount = parseAmount(row[txnCol]);
      if (amount === null || amount === 0) return [];

      const dateStr  = parseThaiDate(row[dateCol] || '');
      // A single "DateTime" header matches BOTH find('time') and find('date'),
      // so timeCol would point at the date column and slice '2026-' as a clock.
      const timeKey  = (timeCol && timeCol !== dateCol) ? timeCol : null;
      const timeHit  = timeKey ? String(row[timeKey] || '').match(/(\d{1,2}):(\d{2})/) : null;
      // Midday fallback so a missing clock can never straddle a day boundary.
      // Seconds are synthetic either way (the source is minute-precision at
      // best) → incrementing per day/minute so distinct rows never share a
      // second-precision dedup key.
      const timePart = timeHit ? `${timeHit[1].padStart(2, '0')}:${timeHit[2]}` : '12:00';
      const clockKey = timeHit ? `${dateStr}T${timePart}` : dateStr;
      const occurred_at = dateStr
        ? `${dateStr}T${nextClock(clockKey, timePart)}+07:00`
        : new Date().toISOString();

      // Skip ALL Move Money rows — internal pocket transfers
      // (user will handle allocation tracking manually)
      if (txType === 'Move Money') return [];

      // ── Regular transactions (Payment, Deposit, Transfer Withdraw, etc.) ─
      const scope = FAMILY_POCKETS.includes(pocket) ? 'family' : 'personal';

      // Title: Note (merchant) > Memo (user note) > pocket name
      const merchant = (noteCol ? row[noteCol] : '').trim();
      const title    = merchant || memo || pocket || '(ไม่มีชื่อ)';

      // Category: from CSV first, then fallback
      const csvCat = (categoryCol ? row[categoryCol] : '').trim();
      let { category, type } = MAKE_CATEGORY_MAP[csvCat] || autoCategory(title);

      // Override for income
      if (amount > 0) { category = 'รายรับ'; type = 'income'; }

      return [{
        _rowIdx:  i,
        _pocket:  pocket,
        _txtype:  txType,
        _cp_bal:  cpBalCol ? parseAmount(row[cpBalCol]) : null,
        // Statement rows carry SYNTHETIC seconds — flag them so the two-tier
        // import classifier can match them against legacy :00-stored rows.
        _synthetic: true,
        title,
        occurred_at,
        amount,
        category,
        type,
        scope,
        note:       memo || null,
        account_id: null,
      }];
    }

    // ── Generic bank CSV format ──────────────────────────────────────────────
    const desc    = row[descCol] || '';
    const dateStr = parseThaiDate(row[dateCol] || '');

    let amount = null;
    if (amountCol && row[amountCol]) {
      amount = parseAmount(row[amountCol]);
    } else if (debitCol || creditCol) {
      const debit  = parseAmount(row[debitCol]  || '0');
      const credit = parseAmount(row[creditCol] || '0');
      if (credit && credit > 0) amount = credit;
      else if (debit && debit > 0) amount = -Math.abs(debit);
    }
    // Reject unreadable amounts. These used to fall through as ฿0 and land in
    // the ledger silently.
    if (amount === null || !Number.isFinite(amount)) return [];

    const { category, type } = autoCategory(desc);
    return [{
      _rowIdx:    i,
      _pocket:    null,
      _txtype:    null,
      _synthetic: true,   // date-only source — whole clock is synthetic
      title:      desc || '(ไม่มีชื่อ)',
      // Synthetic incrementing seconds (see clock comment above) — generic
      // bank CSVs are date-only, so noon + per-day row counter.
      occurred_at: dateStr ? `${dateStr}T${nextClock(`g|${dateStr}`, '12:00')}+07:00` : new Date().toISOString(),
      amount,
      category,
      type,
      scope:      defaultScope,
      note:       null,
      account_id: null,
    }];
  }).filter(r => r.title !== '(ไม่มีชื่อ)' || r.amount !== 0);
}

// ── Transactions ─────────────────────────────────────────────────────────────
export async function listTransactions({ limit = 200, yearMonth, scope } = {}) {
  if (!supabase) return [];
  const buildQuery = () => {
    let q = supabase
      .from('transactions')
      .select('*')
      .order('occurred_at', { ascending: false });
    if (yearMonth) {
      const { startTs, endTs } = getMonthBounds(yearMonth);
      q = q.gte('occurred_at', startTs).lt('occurred_at', endTs);
    }
    if (scope) q = q.eq('scope', scope);
    return q;
  };
  return fetchAllPages(buildQuery, limit);
}

export async function createTransaction(input) {
  if (!supabase) throw new Error('Supabase not configured');
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not logged in');
  const { data, error } = await supabase
    .from('transactions')
    .insert({ ...input, user_id: user.id })
    .select()
    .single();
  if (error) throw error;
  return data;
}

/** Bulk insert — used by CSV importer */
export async function bulkCreateTransactions(rows) {
  if (!supabase) throw new Error('Supabase not configured');
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not logged in');
  const withUser = rows.map(r => ({ ...r, user_id: user.id }));
  const { data, error } = await supabase
    .from('transactions')
    .insert(withUser)
    .select();
  if (error) throw error;
  return data;
}

export async function updateTransaction(id, patch) {
  if (!supabase) throw new Error('Supabase not configured');
  const { data, error } = await supabase
    .from('transactions').update(patch).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

/**
 * Create a pair of transactions representing money moving between scopes.
 * E.g. transfer ฿80,000 from personal Cashbox to family fund:
 *   personal: -80,000 (out)  ·  family: +80,000 (in)
 *
 * Both rows inserted atomically. Title is shared (with directional suffix
 * if not customized). Useful for monthly allocation between scopes.
 */
export async function createScopeTransfer({ from_scope, to_scope, amount, occurred_at, title, note }) {
  if (!supabase) throw new Error('Supabase not configured');
  if (from_scope === to_scope) throw new Error('From และ To scope ห้ามเหมือนกัน');
  if (!amount || Number(amount) <= 0)  throw new Error('จำนวนต้องมากกว่า 0');

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not logged in');

  const baseTitle = (title || '').trim();
  const fromLabel = from_scope === 'family' ? 'ครอบครัว' : 'ส่วนตัว';
  const toLabel   = to_scope   === 'family' ? 'ครอบครัว' : 'ส่วนตัว';
  const outTitle  = baseTitle || `โอนไป${toLabel}`;
  const inTitle   = baseTitle || `รับจาก${fromLabel}`;

  const amt = Math.abs(Number(amount));
  const rows = [
    {
      user_id: user.id,
      title:    outTitle,
      amount:   -amt,
      category: 'โอนภายใน',
      type:     TRANSFER_TYPE,
      scope:    from_scope,
      occurred_at,
      note: note || null,
    },
    {
      user_id: user.id,
      title:    inTitle,
      amount:   amt,
      category: 'โอนภายใน',
      type:     TRANSFER_TYPE,
      scope:    to_scope,
      occurred_at,
      note: note || null,
    },
  ];

  const { data, error } = await supabase
    .from('transactions').insert(rows).select();
  if (error) throw error;
  return data;
}

export async function deleteTransaction(id) {
  if (!supabase) throw new Error('Supabase not configured');
  const { error } = await supabase.from('transactions').delete().eq('id', id);
  if (error) throw error;
}

/** List transactions in an arbitrary date range — used by analytics */
export async function listTransactionsRange({ startDate, endDate, scope, limit = 50000 } = {}) {
  if (!supabase) return [];
  const buildQuery = () => {
    let q = supabase
      .from('transactions')
      .select('*')
      .gte('occurred_at', startDate)
      .lt('occurred_at', endDate)
      .order('occurred_at', { ascending: false });
    if (scope) q = q.eq('scope', scope);
    return q;
  };
  return fetchAllPages(buildQuery, limit);
}

/**
 * Server-side month totals (income/expense per Bangkok month, transfers
 * excluded) via the finance_month_summary RPC. Immune to the PostgREST
 * max-rows cap. Returns null when the RPC is not installed yet — callers
 * must fall back to paginated client aggregation.
 */
export async function financeMonthSummary({ scope = null, fromYm, toYm } = {}) {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc('finance_month_summary', {
    p_scope: scope, p_from: fromYm, p_to: toYm,
  });
  if (error) {
    if (isRpcMissing(error)) return null;
    throw error;
  }
  return (data || []).map(r => {
    const income  = Number(r.income)  || 0;
    const expense = Number(r.expense) || 0;
    return {
      ym: r.ym, income, expense,
      net: income - expense,
      savingsRate: income > 0 ? ((income - expense) / income) * 100 : 0,
      count: Number(r.count) || 0,
    };
  });
}

// ── Analytics aggregators (pure client-side) ─────────────────────────────────

/**
 * Moving money between your own scopes is not income and not spending. Both
 * legs used to land in P&L — the destination leg was even booked as INCOME,
 * so a ฿80,000 personal→family move invented ฿80,000 of earnings.
 * The rows stay visible in the transaction list; they just never count.
 */
export const TRANSFER_TYPE = 'transfer';
export const isTransfer = (t) => t?.type === TRANSFER_TYPE;

/** Sum income/expense for a list of transactions */
export function summarize(txns) {
  let income = 0, expense = 0;
  for (const t of txns) {
    if (isTransfer(t)) continue;
    if (t.amount > 0) income += t.amount;
    else expense += Math.abs(t.amount);
  }
  const net = income - expense;
  const savingsRate = income > 0 ? (net / income) * 100 : 0;
  return { income, expense, net, savingsRate, count: txns.filter(t => !isTransfer(t)).length };
}

/** Group by yearMonth → { ym: { income, expense, ... } } */
export function aggregateByMonth(txns) {
  const m = {};
  for (const t of txns) {
    if (isTransfer(t)) continue;
    const ym = bangkokMonth(t.occurred_at);
    if (!ym) continue;
    if (!m[ym]) m[ym] = { ym, income: 0, expense: 0, count: 0 };
    if (t.amount > 0) m[ym].income += t.amount;
    else m[ym].expense += Math.abs(t.amount);
    m[ym].count++;
  }
  return Object.values(m)
    .map(r => ({ ...r, net: r.income - r.expense, savingsRate: r.income > 0 ? ((r.income - r.expense) / r.income) * 100 : 0 }))
    .sort((a, b) => a.ym.localeCompare(b.ym));
}

/** Group expenses by category → sorted descending */
export function aggregateByCategory(txns) {
  const m = {};
  for (const t of txns) {
    if (isTransfer(t)) continue;
    if (t.amount >= 0) continue;
    const c = t.category || 'อื่น ๆ';
    if (!m[c]) m[c] = { category: c, type: t.type, amount: 0, count: 0 };
    m[c].amount += Math.abs(t.amount);
    m[c].count++;
  }
  return Object.values(m).sort((a, b) => b.amount - a.amount);
}

/** Group by day of month → { '01': totalExpense, '02': ... } */
export function aggregateByDay(txns, yearMonth) {
  const m = {};
  for (const t of txns) {
    if (isTransfer(t)) continue;
    if (t.amount >= 0) continue;
    const date = bangkokDate(t.occurred_at);
    if (!date.startsWith(yearMonth)) continue;
    const day = date.substring(8, 10);
    m[day] = (m[day] || 0) + Math.abs(t.amount);
  }
  return m;
}

/** Top N largest expenses */
export function topExpenses(txns, n = 10) {
  return txns
    .filter(t => t.amount < 0 && !isTransfer(t))
    .sort((a, b) => a.amount - b.amount)
    .slice(0, n);
}

/** Get the previous yearMonth string (yyyy-mm) */
export function previousMonth(yearMonth) {
  const [y, m] = yearMonth.split('-').map(Number);
  const py = m === 1 ? y - 1 : y;
  const pm = m === 1 ? 12 : m - 1;
  return `${py}-${String(pm).padStart(2, '0')}`;
}

/** Get the next yearMonth string (yyyy-mm) */
export function nextMonth(yearMonth) {
  const [y, m] = yearMonth.split('-').map(Number);
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  return `${ny}-${String(nm).padStart(2, '0')}`;
}

/** Get N months back including current (e.g. last 12) as yyyy-mm[] */
export function lastNMonths(n, fromYearMonth) {
  const result = [];
  let cur = fromYearMonth || currentYearMonth();
  for (let i = 0; i < n; i++) {
    result.unshift(cur);
    cur = previousMonth(cur);
  }
  return result;
}

// ── Accounts ─────────────────────────────────────────────────────────────────
export async function listAccounts({ scope } = {}) {
  if (!supabase) return [];
  let q = supabase.from('accounts').select('*').eq('is_active', true).order('created_at');
  if (scope) q = q.eq('scope', scope);
  const { data, error } = await q;
  if (error) throw error;
  return data;
}

export async function createAccount(input) {
  if (!supabase) throw new Error('Supabase not configured');
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not logged in');
  // INVARIANT (audit round 2): every write of `balance` stamps
  // balance_anchor_at — the balance is a statement of truth "as of now".
  // Round 4 adds PROVENANCE (balance_anchor_source) so an audit can tell a
  // human-attested anchor from a mechanical one.
  // Fallback chain while migrations are unrun: with source → without source
  // → without anchor at all.
  const row = {
    ...input, user_id: user.id,
    balance_anchor_at: new Date().toISOString(),
    balance_anchor_source: 'user',
  };
  let { data, error } = await supabase
    .from('accounts').insert(row).select().single();
  if (error && isColumnMissing(error)) {
    delete row.balance_anchor_source;
    ({ data, error } = await supabase.from('accounts').insert(row).select().single());
  }
  if (error && isColumnMissing(error)) {
    delete row.balance_anchor_at;
    ({ data, error } = await supabase.from('accounts').insert(row).select().single());
  }
  if (error) throw error;
  return data;
}

export async function updateAccount(id, patch) {
  if (!supabase) throw new Error('Supabase not configured');
  const { data, error } = await supabase
    .from('accounts').update(patch).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

export async function deleteAccount(id) {
  if (!supabase) throw new Error('Supabase not configured');
  const { error } = await supabase.from('accounts').delete().eq('id', id);
  if (error) throw error;
}

// ── Account lifecycle (archive · reassign · balance anchor) ──────────────────
// Hard-deleting an account orphaned its transaction history (account_id →
// NULL via FK) and destroyed the balance. Archive = is_active:false — every
// reader already filters on is_active, so the account disappears from
// pickers while its ledger rows keep their account_id.

/** Hide an account without destroying history. */
export async function archiveAccount(id) {
  return updateAccount(id, { is_active: false });
}

/** Move ALL transactions from one account to another (before archiving). */
export async function reassignTransactionsAccount(fromAccountId, toAccountId) {
  if (!supabase) throw new Error('Supabase not configured');
  const { error } = await supabase
    .from('transactions')
    .update({ account_id: toAccountId })
    .eq('account_id', fromAccountId);
  if (error) throw error;
}

/**
 * Set an account's balance as an ANCHOR: stores the balance + the moment it
 * was true (balance_anchor_at). Displayed balance is then
 *   anchor + SUM(ledger transactions after the anchor)
 * If migration_add_account_archive.sql has not been run, falls back to a
 * plain balance update (old snapshot behaviour).
 */
export async function setAccountBalanceAnchor(id, balance) {
  if (!supabase) throw new Error('Supabase not configured');
  const anchorAt = new Date().toISOString();
  // source='user': the human read this number off the real bank app — the
  // highest-trust provenance (see audit_account_balances.sql).
  let { data, error } = await supabase
    .from('accounts')
    .update({ balance, balance_anchor_at: anchorAt, balance_anchor_source: 'user' })
    .eq('id', id).select().single();
  if (!error) return data;
  if (!isColumnMissing(error)) throw error;
  ({ data, error } = await supabase
    .from('accounts')
    .update({ balance, balance_anchor_at: anchorAt })
    .eq('id', id).select().single());
  if (!error) return data;
  if (!isColumnMissing(error)) throw error;
  return updateAccount(id, { balance });
}

/**
 * Overlay effective balances onto a list of accounts:
 *   effective = stored balance + SUM(transactions after balance_anchor_at)
 * Accounts without an anchor (or before the migration) are returned as-is.
 * `_stored_balance` keeps the raw anchor value for the edit form.
 *
 * ANCHOR SEMANTICS (deliberate — audit round 2, partial rebuttal accepted):
 * the anchor states "the REAL balance was X at time T" (read off the bank
 * app / CP Bal). A backdated transaction entered later but dated BEFORE T
 * must NOT move the displayed balance — that money was already reflected in
 * the real balance the user observed at T. Only rows dated AFTER the anchor
 * adjust the display. The UI exposes this as
 * "ยอด ณ <anchor date> + รายการหลังจากนั้น".
 */
export async function applyEffectiveBalances(accounts) {
  const list = accounts || [];
  if (!supabase) return list;
  const anchored = list.filter(a => a.balance_anchor_at);
  if (!anchored.length) return list;

  const minAnchor = anchored.map(a => a.balance_anchor_at).sort()[0];
  const ids = anchored.map(a => a.id);
  const rows = await fetchAllPages(() => supabase
    .from('transactions')
    .select('account_id, amount, occurred_at')
    .in('account_id', ids)
    .gt('occurred_at', minAnchor)
    .order('occurred_at', { ascending: false }));

  const anchorById = new Map(anchored.map(a => [a.id, a.balance_anchor_at]));
  const deltaById = new Map();
  for (const t of rows) {
    const anchor = anchorById.get(t.account_id);
    if (!anchor || !(new Date(t.occurred_at) > new Date(anchor))) continue;
    deltaById.set(t.account_id, (deltaById.get(t.account_id) || 0) + Number(t.amount || 0));
  }

  return list.map(a => a.balance_anchor_at
    ? { ...a, _stored_balance: Number(a.balance || 0), balance: Number(a.balance || 0) + (deltaById.get(a.id) || 0) }
    : a);
}

// ── Account auto-create from Make pocket import ──────────────────────────────

/**
 * From mapped Make transactions, group by pocket → return latest CP Bal + scope.
 * Latest = transaction with most recent occurred_at per pocket.
 *
 * Returns: [{ pocket, scope, latestBalance, latestDate, txCount }]
 */
export function extractAccountsFromMapped(mappedRows) {
  const byPocket = {};
  for (const r of mappedRows) {
    if (!r._pocket) continue;
    const cur = byPocket[r._pocket];
    if (!cur || r.occurred_at > cur.latestDate) {
      byPocket[r._pocket] = {
        pocket: r._pocket,
        scope: r.scope,
        latestBalance: r._cp_bal != null ? r._cp_bal : (cur?.latestBalance ?? 0),
        latestDate: r.occurred_at,
        txCount: (cur?.txCount || 0) + 1,
      };
    } else {
      byPocket[r._pocket].txCount++;
      // Keep balance if newer txn didn't have it
      if (cur.latestBalance == null && r._cp_bal != null) cur.latestBalance = r._cp_bal;
    }
  }
  return Object.values(byPocket).sort((a, b) => b.txCount - a.txCount);
}

const POCKET_TONE_PALETTE = ['amber', 'profit', 'blue', 'violet', 'rose', 'brass'];
function pickTone(name = '') {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return POCKET_TONE_PALETTE[h % POCKET_TONE_PALETTE.length];
}

/**
 * Decide whether an imported CP Bal may replace the account's current
 * balance anchor. Pure — unit-tested in audit/evidence.
 *
 * Rule (audit round 2): a CSV import must NEVER move a balance BACKWARD in
 * time. The imported CP Bal was true at `importedAt` (the file's latest
 * transaction). Apply it only when that moment's Bangkok month is >= the
 * month of the account's current anchor; an older statement file leaves
 * balance AND anchor untouched.
 */
export function shouldApplyImportedBalance(existingAnchorAt, importedAt) {
  if (!importedAt) return false;
  if (!existingAnchorAt) return true;                     // never anchored → take it
  return bangkokMonth(importedAt) >= bangkokMonth(existingAnchorAt);
}

/**
 * Upsert accounts based on { pocket, scope, latestBalance, latestDate }.
 * Dedup key: (user_id, name, scope) — case-insensitive match on name.
 * Returns: Map<pocketName, accountId>
 *
 * Balance writes stamp balance_anchor_at = latestDate (the moment the CP Bal
 * was true), and are skipped entirely when the file is OLDER than the
 * current anchor (see shouldApplyImportedBalance). While the anchor column
 * migration is unrun, falls back to the legacy overwrite behaviour.
 */
export async function bulkUpsertAccountsByPocket(pockets) {
  if (!supabase) return new Map();
  if (!pockets?.length) return new Map();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not logged in');

  // Fetch existing accounts — full meta first, then anchor-only, then legacy.
  let anchorSupported = true;
  let sourceSupported = true;
  let { data: existing, error: fetchErr } = await supabase
    .from('accounts').select('id, name, scope, balance, balance_anchor_at, balance_anchor_source')
    .eq('user_id', user.id);
  if (fetchErr && isColumnMissing(fetchErr)) {
    sourceSupported = false;
    ({ data: existing, error: fetchErr } = await supabase
      .from('accounts').select('id, name, scope, balance, balance_anchor_at')
      .eq('user_id', user.id));
  }
  if (fetchErr && isColumnMissing(fetchErr)) {
    anchorSupported = false;
    ({ data: existing, error: fetchErr } = await supabase
      .from('accounts').select('id, name, scope, balance')
      .eq('user_id', user.id));
  }
  if (fetchErr) throw fetchErr;

  const exMap = new Map();
  for (const a of (existing || [])) {
    exMap.set(`${(a.name || '').trim().toLowerCase()}|${a.scope || 'personal'}`, a);
  }

  const idMap = new Map();
  const toInsert = [];
  const toUpdate = [];

  for (const p of pockets) {
    const key = `${p.pocket.trim().toLowerCase()}|${p.scope}`;
    const found = exMap.get(key);
    if (found) {
      idMap.set(p.pocket, found.id);
      if (p.latestBalance != null) {
        if (!anchorSupported) {
          // Legacy behaviour while the migration is unrun.
          toUpdate.push({ id: found.id, patch: { balance: p.latestBalance } });
        } else if (shouldApplyImportedBalance(found.balance_anchor_at, p.latestDate)) {
          const patch = {
            balance: p.latestBalance,
            balance_anchor_at: p.latestDate,   // CP Bal was true at the file's last txn
          };
          if (sourceSupported) patch.balance_anchor_source = 'import';
          toUpdate.push({ id: found.id, patch });
        }
        // else: older statement file — balance and anchor stay untouched.
      }
    } else {
      const row = {
        user_id: user.id,
        name: p.pocket,
        type: 'savings',  // Make pockets are essentially savings sub-accounts
        balance: p.latestBalance ?? 0,
        tone: pickTone(p.pocket),
        scope: p.scope,
        is_active: true,
      };
      if (anchorSupported) row.balance_anchor_at = p.latestDate || new Date().toISOString();
      if (anchorSupported && sourceSupported) row.balance_anchor_source = 'import';
      toInsert.push(row);
    }
  }

  // Insert new accounts
  if (toInsert.length) {
    const { data: inserted, error } = await supabase
      .from('accounts').insert(toInsert).select('id, name, scope');
    if (error) throw error;
    for (const a of (inserted || [])) {
      idMap.set(a.name, a.id);
    }
  }

  // Update existing balances (parallel)
  if (toUpdate.length) {
    const results = await Promise.all(toUpdate.map(u =>
      supabase.from('accounts').update(u.patch).eq('id', u.id)
    ));
    const failed = results.find(r => r.error);
    if (failed) throw failed.error;
  }

  return idMap;
}

// ── Dedup ────────────────────────────────────────────────────────────────────

/**
 * Build a Set of natural keys (date+amount+title) from existing transactions
 * so the importer can skip duplicates.
 */
function txnKey(t) {
  // Normalise to UTC before slicing: rows we build for insert carry a
  // '+07:00' offset while Supabase hands them back as UTC, so the raw strings
  // never matched and dedup let every re-import through.
  //
  // v3 (audit round 3) — near-collision-proof key, mirrored EXACTLY by
  // import_transactions v3 in SQL:
  //   second-precision timestamp | round(amount*100) | title-80 | note
  // (was: minute | amount | title-40 — two genuinely distinct txns sharing
  // a minute+amount+title collided across separate export files).
  const raw = t.occurred_at || '';
  const d = new Date(raw);
  const ts = isNaN(d) ? raw.substring(0, 19) : d.toISOString().substring(0, 19);
  const amt  = Math.round(Number(t.amount) * 100);
  const title = (t.title || '').trim().substring(0, 80);
  const note  = String(t.note ?? '').trim();
  return `${ts}|${amt}|${title}|${note}`;
}

/** Get keys of existing transactions in a date range for dedup. */
export async function getExistingTxnKeys({ startDate, endDate, scope } = {}) {
  if (!supabase) return new Set();
  const buildQuery = () => {
    let q = supabase.from('transactions')
      .select('occurred_at, amount, title, note, scope')
      .gte('occurred_at', startDate)
      .lt('occurred_at', endDate)
      .order('occurred_at', { ascending: false });
    if (scope) q = q.eq('scope', scope);
    return q;
  };
  const data = await fetchAllPages(buildQuery);
  return new Set(data.map(txnKey));
}

export { txnKey };

/**
 * Multiset counts of natural keys in a range — Map<txnKey, count>.
 * (A Set collapses two legitimate identical transactions; the counts let the
 * importer keep them — same MULTISET semantics as the import RPC.)
 */
export async function getExistingTxnKeyCounts({ startDate, endDate, scope } = {}) {
  if (!supabase) return new Map();
  const buildQuery = () => {
    let q = supabase.from('transactions')
      .select('occurred_at, amount, title, note, scope')
      .gte('occurred_at', startDate)
      .lt('occurred_at', endDate)
      .order('occurred_at', { ascending: false });
    if (scope) q = q.eq('scope', scope);
    return q;
  };
  const data = await fetchAllPages(buildQuery);
  const counts = new Map();
  for (const t of data) {
    const k = txnKey(t);
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  return counts;
}

/**
 * MULTISET dedup plan (pure — mirrors import_transactions v2 exactly):
 * for each natural key keep max(0, count_in_batch − count_existing) rows.
 * Two legitimate identical rows both import when the ledger has none; a
 * re-import of the same file imports nothing.
 * `keyFn(row)` defaults to txnKey; existingCounts is Map<key, count>.
 */
export function multisetDedupRows(rows, existingCounts, keyFn = txnKey) {
  const used = new Map();   // key → how many batch copies we've seen so far
  const keep = [];
  for (const r of rows || []) {
    const k = keyFn(r);
    const seen = (used.get(k) || 0) + 1;
    used.set(k, seen);
    const already = existingCounts.get(k) || 0;
    if (seen > already) keep.push(r);   // this copy is missing from the ledger
  }
  return keep;
}

// ── Two-tier import identity (audit rounds 4–5) ──────────────────────────────
// Rows from CSV/PDF statements carry SYNTHETIC seconds (the sources are
// date- or minute-precision). Pre-v4.16 the app stored ALL such rows at
// :00 seconds; v4.16+ stores :00/:01/:02… by row order. Exact second-key
// dedup alone would therefore re-import every non-first row of an OLD file
// (duplicates), and a minute-only fallback alone silently DROPS genuinely
// distinct rows. The two-tier classifier keeps both honest:
//   tier-1  exact second-key multiset. Round 5: an exact match is only an
//           automatic DUPLICATE when the identity is trustworthy — i.e. NOT
//           (incoming is synthetic AND the matched ledger row carries the
//           :00 legacy signature). Both clocks made-up ⇒ identity is
//           unknowable ⇒ AMBIGUOUS, the user decides.
//   tier-2  only for still-unmatched SYNTHETIC rows: minute-key multiset
//           against remaining existing rows with the legacy :00 signature
//           → AMBIGUOUS: never decided silently — surfaced to the user
//           (default: skip), or force-imported when the user opts in.
// Real-timestamp rows (no _synthetic flag) keep automatic exact-dup and
// never enter tier-2. Every match CONSUMES its ledger row from BOTH pools.

/**
 * Assign a unique immutable per-row identity to parsed statement rows —
 * the ONE place every source (Make CSV, generic CSV, KBank PDF) gets its
 * `_rid`. All selection/ambiguity/force bookkeeping keys on `_rid`
 * (round 5: PDF rows had no `_rowIdx`, so Set keys collapsed to undefined
 * and one decision applied to every PDF row at once).
 */
export function assignRowIds(rows) {
  return (rows || []).map((r, i) => ({ ...r, _rid: i }));
}

/** Minute-truncated variant of txnKey — tier-2 legacy matching. */
export function txnMinuteKey(t) {
  const raw = t.occurred_at || '';
  const d = new Date(raw);
  const ts = isNaN(d) ? raw.substring(0, 16) : d.toISOString().substring(0, 16);
  const amt  = Math.round(Number(t.amount) * 100);
  const title = (t.title || '').trim().substring(0, 80);
  const note  = String(t.note ?? '').trim();
  return `${ts}|${amt}|${title}|${note}`;
}

/** UTC second-of-minute of a row's timestamp (0 = legacy signature). */
export function txnSecond(t) {
  const d = new Date(t.occurred_at || '');
  return isNaN(d) ? null : d.getUTCSeconds();
}

/**
 * Fetch the existing rows an import batch must be classified against.
 * Returns raw rows (paginated past the PostgREST cap) — the classifier
 * builds its own maps.
 */
export async function getExistingRowsForDedup({ startDate, endDate, scope } = {}) {
  if (!supabase) return [];
  const buildQuery = () => {
    let q = supabase.from('transactions')
      .select('id, occurred_at, amount, title, note, scope')
      .gte('occurred_at', startDate)
      .lt('occurred_at', endDate)
      .order('occurred_at', { ascending: false });
    if (scope) q = q.eq('scope', scope);
    return q;
  };
  return fetchAllPages(buildQuery);
}

/**
 * Two-tier classification (pure; mirrored by import_transactions v5 SQL).
 *   rows: batch rows ({_synthetic, _force} respected)
 *   existingRows: ledger rows in the same scope+range
 * Returns { toImport, duplicates, ambiguous } where ambiguous entries are
 * { row, existing } pairs (existing = the ledger row it may duplicate).
 * Multiset semantics throughout: every match consumes its ledger row from
 * BOTH pools (exact + legacy), so nothing is double-spent.
 *
 * Round 5 (bug 3): synthetic-vs-:00 exact matches are AMBIGUOUS, not
 * automatic duplicates — a skipped-count is not explicit confirmation.
 * Only real-source timestamps keep the automatic exact-dup.
 */
export function classifyImportRows(rows, existingRows) {
  const exactPool = new Map();      // exactKey → ledger rows[]
  const legacyPool = new Map();     // minuteKey → ledger rows[] (seconds==0)
  for (const e of existingRows || []) {
    const k = txnKey(e);
    if (!exactPool.has(k)) exactPool.set(k, []);
    exactPool.get(k).push(e);
    if (txnSecond(e) === 0) {
      const mk = txnMinuteKey(e);
      if (!legacyPool.has(mk)) legacyPool.set(mk, []);
      legacyPool.get(mk).push(e);
    }
  }
  const take = (pool, key) => {
    const list = pool.get(key);
    return list?.length ? list.pop() : null;
  };
  const removeRef = (pool, key, ref) => {
    const list = pool.get(key);
    if (!list) return;
    const i = list.indexOf(ref);
    if (i >= 0) list.splice(i, 1);
  };

  const out = { toImport: [], duplicates: [], ambiguous: [] };
  for (const r of rows || []) {
    if (r._force) { out.toImport.push(r); continue; }

    // tier-1: exact second-key multiset
    const k = txnKey(r);
    const ex = take(exactPool, k);
    if (ex) {
      if (txnSecond(ex) === 0) removeRef(legacyPool, txnMinuteKey(ex), ex);
      if (r._synthetic && txnSecond(ex) === 0) {
        // Both clocks are made up — identity unknowable, user decides.
        out.ambiguous.push({ row: r, existing: ex });
      } else {
        out.duplicates.push(r);
      }
      continue;
    }

    // tier-2: synthetic rows only, against remaining legacy :00 rows
    if (r._synthetic) {
      const lg = take(legacyPool, txnMinuteKey(r));
      if (lg) {
        removeRef(exactPool, txnKey(lg), lg);
        out.ambiguous.push({ row: r, existing: lg });
        continue;
      }
    }

    out.toImport.push(r);
  }
  return out;
}

/**
 * Atomic wipe+insert of one scope+month batch via the import_transactions
 * RPC (single transaction + per-user/month advisory lock + server-side
 * dedup under the lock).
 * v5: rows carry `synthetic` (statement rows with made-up seconds) and
 * `force` (user resolved an ambiguity as "import"); the RPC runs the same
 * two-tier classifier as classifyImportRows under its advisory lock and —
 * because it is AUTHORITATIVE and may discover ambiguities the client
 * preview could not (concurrent writes) — returns the ambiguous rows
 * themselves, not just a count:
 *   { inserted, dup_skipped,
 *     ambiguous: [{ ord, incoming: {...}, existing: {...} }] }
 * `ord` is the 1-based position in the p_rows array — the caller maps it
 * back to its own row identity (`rows[ord-1]._rid`).
 * Older deployments are normalised: v4 returns ambiguous_skipped (count
 * only → surfaced as ambiguousSkipped), v3 returns a bare int.
 * Throws the raw error when the RPC is missing — the importer catches it
 * with isRpcMissing() and falls back to the legacy multi-call path.
 */
export async function importTransactionsBatch({ scope, month, wipe, dedup, rows }) {
  if (!supabase) throw new Error('Supabase not configured');
  const payload = rows.map(r => ({
    title:       r.title,
    occurred_at: r.occurred_at,
    amount:      r.amount,
    category:    r.category ?? null,
    type:        r.type ?? null,
    note:        r.note ?? null,
    account_id:  r.account_id ?? null,
    synthetic:   !!r._synthetic,
    force:       !!r._force,
  }));
  const { data, error } = await supabase.rpc('import_transactions', {
    p_scope: scope, p_month: month, p_wipe: !!wipe, p_rows: payload, p_dedup: !!dedup,
  });
  if (error) throw error;
  if (data && typeof data === 'object') {
    const ambiguous = Array.isArray(data.ambiguous)
      ? data.ambiguous.map(a => ({
          ord: Number(a.ord),
          row: rows[Number(a.ord) - 1] || null,   // caller identity (_rid intact)
          incoming: a.incoming || null,
          existing: a.existing || null,
        }))
      : [];
    return {
      inserted:         Number(data.inserted) || 0,
      dupSkipped:       Number(data.dup_skipped) || 0,
      ambiguous,
      ambiguousSkipped: ambiguous.length || Number(data.ambiguous_skipped) || 0,
    };
  }
  return { inserted: Number(data) || 0, dupSkipped: 0, ambiguous: [], ambiguousSkipped: 0 };
}

/** Delete all transactions in a month (used for clean re-import). */
export async function deleteTransactionsInMonth(yearMonth, scope) {
  if (!supabase) throw new Error('Supabase not configured');
  const { startTs, endTs } = getMonthBounds(yearMonth);
  let q = supabase.from('transactions').delete().gte('occurred_at', startTs).lt('occurred_at', endTs);
  if (scope) q = q.eq('scope', scope);
  const { error } = await q;
  if (error) throw error;
}

// ── Budgets ──────────────────────────────────────────────────────────────────
export async function listBudgets(yearMonth, scope) {
  if (!supabase) return [];
  let q = supabase.from('budgets').select('*').eq('month', `${yearMonth}-01`).order('category');
  if (scope) q = q.eq('scope', scope);
  const { data, error } = await q;
  if (error) throw error;
  return data;
}

export async function upsertBudget({ category, monthly_limit, yearMonth, scope = 'personal' }) {
  if (!supabase) throw new Error('Supabase not configured');
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not logged in');
  const row = { user_id: user.id, category, monthly_limit, month: `${yearMonth}-01`, scope };
  // Key includes scope (migration_fix_budget_scope_key.sql) so a family budget
  // can no longer overwrite the personal one for the same category+month.
  let { data, error } = await supabase
    .from('budgets')
    .upsert(row, { onConflict: 'user_id,scope,category,month' })
    .select().single();
  if (error && (error.code === '42P10' || /no unique|exclusion constraint/i.test(error.message || ''))) {
    // Migration not run yet. The old key has no scope, so a blind upsert
    // would OVERWRITE the other scope's budget for the same category+month.
    // Guard: refuse cross-scope writes until the migration is run.
    const { data: clash, error: clashErr } = await supabase
      .from('budgets')
      .select('id, scope')
      .eq('user_id', user.id).eq('category', category).eq('month', `${yearMonth}-01`)
      .maybeSingle();
    if (clashErr) throw clashErr;
    if (clash && (clash.scope || 'personal') !== scope) {
      throw new Error('ต้องรันไฟล์ SQL migration_fix_budget_scope_key.sql ก่อน จึงจะตั้งงบแยก scope ได้ (มีงบของอีก scope อยู่ในหมวด/เดือนเดียวกัน)');
    }
    ({ data, error } = await supabase
      .from('budgets')
      .upsert(row, { onConflict: 'user_id,category,month' })
      .select().single());
  }
  if (error) throw error;
  return data;
}

export async function deleteBudget(id) {
  if (!supabase) throw new Error('Supabase not configured');
  const { error } = await supabase.from('budgets').delete().eq('id', id);
  if (error) throw error;
}

// ── Financial Goals ───────────────────────────────────────────────────────────
export async function listGoals(scope) {
  if (!supabase) return [];
  let q = supabase.from('financial_goals').select('*').order('deadline', { nullsFirst: false });
  if (scope) q = q.eq('scope', scope);
  const { data, error } = await q;
  if (error) throw error;
  return data;
}

export async function createGoal(input) {
  if (!supabase) throw new Error('Supabase not configured');
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not logged in');
  const { data, error } = await supabase
    .from('financial_goals').insert({ ...input, user_id: user.id }).select().single();
  if (error) throw error;
  return data;
}

export async function updateGoal(id, patch) {
  if (!supabase) throw new Error('Supabase not configured');
  const { data, error } = await supabase
    .from('financial_goals').update(patch).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

export async function deleteGoal(id) {
  if (!supabase) throw new Error('Supabase not configured');
  const { error } = await supabase.from('financial_goals').delete().eq('id', id);
  if (error) throw error;
}

// ════════════════════════════════════════════════════════════════════════════
//  DEBT TRACKER — list debts + per-month payment status + forecast
// ════════════════════════════════════════════════════════════════════════════

export async function listDebts({ scope, activeOnly = true } = {}) {
  if (!supabase) return [];
  let q = supabase.from('debts').select('*').order('monthly_payment', { ascending: false });
  if (scope)      q = q.eq('scope', scope);
  if (activeOnly) q = q.eq('is_active', true);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

export async function createDebt(input) {
  if (!supabase) throw new Error('Supabase not configured');
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not logged in');
  const { data, error } = await supabase
    .from('debts').insert({ ...input, user_id: user.id }).select().single();
  if (error) throw error;
  return data;
}

export async function updateDebt(id, patch) {
  if (!supabase) throw new Error('Supabase not configured');
  const { data, error } = await supabase
    .from('debts').update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id).select().single();
  if (error) throw error;
  return data;
}

export async function deleteDebt(id) {
  if (!supabase) throw new Error('Supabase not configured');
  const { error } = await supabase.from('debts').delete().eq('id', id);
  if (error) throw error;
}

/** List debt payments for a date range, optionally per debt or scope */
export async function listDebtPayments({ debtId, startMonth, endMonth } = {}) {
  if (!supabase) return [];
  let q = supabase.from('debt_payments').select('*').order('pay_month', { ascending: false });
  if (debtId)     q = q.eq('debt_id', debtId);
  if (startMonth) q = q.gte('pay_month', startMonth);
  if (endMonth)   q = q.lte('pay_month', endMonth);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

/**
 * Record a payment for a debt + auto-update months_paid + remaining_balance.
 * If transactionId provided, link it; otherwise just a manual mark.
 */
export async function recordDebtPayment({ debt_id, pay_month, amount_paid, transaction_id, notes }) {
  if (!supabase) throw new Error('Supabase not configured');
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not logged in');

  // Preferred path: one transaction on the server (migration_add_debt_rpc.sql)
  // — payment row + months_paid counter can never desync. Falls back to the
  // legacy guarded multi-call path while the RPC is not installed.
  const { data: rpcData, error: rpcErr } = await supabase.rpc('debt_mark_paid', {
    p_debt_id: debt_id,
    p_pay_month: pay_month,
    p_amount: amount_paid ?? null,
    p_transaction_id: transaction_id || null,
    p_notes: notes || null,
  });
  if (!rpcErr) return { debt_id, pay_month, months_paid: Number(rpcData) };
  if (!isRpcMissing(rpcErr)) throw rpcErr;

  // ── FALLBACK (best-effort; the RPC above is the real closure) ──────────
  // v2 (audit round 2): write the payment row FIRST with ON CONFLICT DO
  // NOTHING (ignoreDuplicates) and increment months_paid ONLY when that
  // insert actually inserted a row. This removes the old check-then-act
  // window where two concurrent marks both read "no payment yet". It is
  // still two statements, not one transaction — the disabled-button guard
  // in DebtTracker plus this insert-first shape make it best-effort safe;
  // full atomicity requires migration_add_debt_rpc.sql.
  // ────────────────────────────────────────────────────────────────────────
  const paymentRow = {
    user_id: user.id, debt_id, pay_month,
    amount_paid, transaction_id: transaction_id || null, notes: notes || null,
  };
  const { data: insertedRows, error: insErr } = await supabase
    .from('debt_payments')
    .upsert(paymentRow, { onConflict: 'debt_id,pay_month', ignoreDuplicates: true })
    .select();
  if (insErr) throw insErr;
  const isNewMonth = (insertedRows || []).length > 0;
  let data = insertedRows?.[0] || null;

  if (!isNewMonth) {
    // Row already existed (this month is already marked) — refresh the
    // amount/link fields without touching the counter.
    const { data: updated, error: updErr } = await supabase
      .from('debt_payments')
      .update({ amount_paid, transaction_id: transaction_id || null, notes: notes || null })
      .eq('debt_id', debt_id).eq('pay_month', pay_month)
      .select().maybeSingle();
    if (updErr) throw updErr;
    data = updated || data;
  }

  // Only increment debt counters when OUR insert created the month's row
  if (isNewMonth) {
    const { data: debtRow, error: readErr } = await supabase
      .from('debts').select('months_paid, total_months, monthly_payment').eq('id', debt_id).single();
    if (readErr) throw readErr;
    let newMonthsPaid = (Number(debtRow?.months_paid) || 0) + 1;
    // Never claim more instalments paid than the loan has.
    if (debtRow?.total_months) newMonthsPaid = Math.min(newMonthsPaid, Number(debtRow.total_months));
    const remaining = debtRow?.total_months
      ? Math.max(0, (Number(debtRow.total_months) - newMonthsPaid) * Number(debtRow.monthly_payment))
      : null;
    const { error: writeErr } = await supabase.from('debts').update({
      months_paid: newMonthsPaid,
      remaining_balance: remaining,
      updated_at: new Date().toISOString(),
    }).eq('id', debt_id);
    if (writeErr) throw writeErr;
  }

  return data;
}

export async function deleteDebtPayment(id) {
  if (!supabase) throw new Error('Supabase not configured');

  // Preferred path: transactional decrement via RPC (see recordDebtPayment).
  const { error: rpcErr } = await supabase.rpc('debt_unmark_paid', { p_payment_id: id });
  if (!rpcErr) return;
  if (!isRpcMissing(rpcErr)) throw rpcErr;

  const { data: row } = await supabase.from('debt_payments').select('debt_id').eq('id', id).single();
  const debtId = row?.debt_id;
  const { error } = await supabase.from('debt_payments').delete().eq('id', id);
  if (error) throw error;

  // Decrement (clamp at 0) — opposite of recordDebtPayment increment
  if (debtId) {
    const { data: debtRow, error: readErr } = await supabase
      .from('debts').select('months_paid, total_months, monthly_payment').eq('id', debtId).single();
    if (readErr) throw readErr;
    const newMonthsPaid = Math.max(0, (Number(debtRow?.months_paid) || 0) - 1);
    const remaining = debtRow?.total_months
      ? Math.max(0, (Number(debtRow.total_months) - newMonthsPaid) * Number(debtRow.monthly_payment))
      : null;
    const { error: writeErr } = await supabase.from('debts').update({
      months_paid: newMonthsPaid,
      remaining_balance: remaining,
      updated_at: new Date().toISOString(),
    }).eq('id', debtId);
    if (writeErr) throw writeErr;
  }
}

// ── Forecast / Status helpers (pure, client-side) ───────────────────────────

/** For one debt + payment list, return status this month */
export function getDebtStatus(debt, payments, yearMonth) {
  const monthKey = yearMonth + '-01';
  const paid = (payments || []).find(p => (p.pay_month || '').startsWith(yearMonth));

  if (paid) return {
    status: 'paid',
    paid_at: paid.paid_at,
    amount_paid: Number(paid.amount_paid),
    payment_id: paid.id,
  };

  // Not paid yet — check if overdue
  const [y, m] = yearMonth.split('-').map(Number);
  const today = new Date();
  const isCurrentMonth = today.getFullYear() === y && today.getMonth() + 1 === m;
  const dueDay = debt.due_day || 5;

  if (isCurrentMonth) {
    if (today.getDate() > dueDay) return { status: 'overdue', dueDay };
    return { status: 'pending', dueDay };
  }

  // Past month and not paid → overdue
  const monthDate = new Date(y, m - 1, dueDay);
  if (monthDate < today) return { status: 'overdue', dueDay };

  // Future month
  return { status: 'upcoming', dueDay };
}

/** Aggregate forecast summary across all debts */
export function summarizeDebts(debts, payments, yearMonth) {
  const ym = yearMonth || currentYearMonth();
  const monthlyBurden = debts.reduce((s, d) => s + Number(d.monthly_payment || 0), 0);
  let paidThisMonth = 0, pending = 0, overdue = 0;
  const statuses = debts.map(d => {
    const st = getDebtStatus(d, payments.filter(p => p.debt_id === d.id), ym);
    if (st.status === 'paid')    paidThisMonth += st.amount_paid;
    if (st.status === 'pending') pending       += Number(d.monthly_payment);
    if (st.status === 'overdue') overdue       += Number(d.monthly_payment);
    return { debt: d, status: st };
  });

  // Remaining balance estimate
  const totalRemaining = debts.reduce((s, d) => {
    if (d.remaining_balance != null) return s + Number(d.remaining_balance);
    if (d.total_months) {
      const remainingMonths = Math.max(0, Number(d.total_months) - Number(d.months_paid || 0));
      return s + remainingMonths * Number(d.monthly_payment);
    }
    return s;
  }, 0);

  // Months until everything is paid off (max of all individual debt remaining months)
  const maxMonthsRemaining = debts.reduce((m, d) => {
    if (!d.total_months) return m;
    const rem = Math.max(0, Number(d.total_months) - Number(d.months_paid || 0));
    return Math.max(m, rem);
  }, 0);

  return {
    monthlyBurden, paidThisMonth, pending, overdue,
    paidCount:    statuses.filter(s => s.status.status === 'paid').length,
    pendingCount: statuses.filter(s => s.status.status === 'pending').length,
    overdueCount: statuses.filter(s => s.status.status === 'overdue').length,
    totalRemaining,
    maxMonthsRemaining,
    statuses,
  };
}

/**
 * Calculate interest math for a single debt.
 * If `original_principal` is set, uses it directly.
 * Else if `interest_rate` is set, back-calculates principal from PV annuity formula.
 * Returns { principal, totalPaid, paidSoFar, remainingPaid, totalInterest,
 *           paidInterest, remainingInterest, monthsRemaining, effectiveAPR }
 */
export function calculateDebtMath(debt) {
  const P    = Number(debt.monthly_payment || 0);
  const N    = Number(debt.total_months || 0);
  const paid = Number(debt.months_paid || 0);
  const aprPct = Number(debt.interest_rate || 0);   // annual %
  const r    = aprPct / 100 / 12;                   // monthly rate

  const totalPaid     = P * N;
  const paidSoFar     = P * paid;
  const remainingPaid = P * Math.max(0, N - paid);
  const monthsRemaining = Math.max(0, N - paid);

  let principal = debt.original_principal != null ? Number(debt.original_principal) : null;
  if (!principal && r > 0 && N > 0) {
    // PV of annuity: PV = P × (1 − (1+r)^−N) / r
    principal = P * (1 - Math.pow(1 + r, -N)) / r;
  }

  const totalInterest = principal != null ? Math.max(0, totalPaid - principal) : 0;
  const interestRatio = totalPaid > 0 ? totalInterest / totalPaid : 0;
  const paidInterest      = paidSoFar     * interestRatio;
  const remainingInterest = remainingPaid * interestRatio;

  return {
    principal, totalPaid, paidSoFar, remainingPaid,
    totalInterest, paidInterest, remainingInterest,
    monthsRemaining,
    hasInterestData: principal != null && totalInterest > 0,
  };
}

/**
 * Match imported transactions to existing debts.
 * A match requires:
 *  - amount within 5% of debt.monthly_payment (or ฿50 absolute, whichever is larger)
 *  - title contains debt.creditor (first 8 chars) OR debt.name (first 6 chars)
 *  - debt doesn't already have a payment recorded for that month
 *
 * Returns: [{ txn, debt, ym, amount, confidence }]
 *  confidence 60-100. ≥80 = strong, 60-79 = possible.
 */
export function suggestDebtPaymentLinks(transactions, debts, existingPayments = []) {
  if (!debts?.length || !transactions?.length) return [];

  const blocked = new Set(
    (existingPayments || []).map(p => `${p.debt_id}|${(p.pay_month || '').substring(0, 7)}`)
  );

  const all = [];
  for (const txn of transactions) {
    const amt = Number(txn.amount);
    if (amt >= 0) continue;                                    // expenses only
    const absAmt = Math.abs(amt);
    const ym = bangkokMonth(txn.occurred_at);
    if (!ym) continue;

    for (const debt of debts) {
      if (blocked.has(`${debt.id}|${ym}`)) continue;
      const mp = Number(debt.monthly_payment);
      if (!mp) continue;

      const tolerance = Math.max(mp * 0.05, 50);
      const amtDiff   = Math.abs(absAmt - mp);
      if (amtDiff > tolerance) continue;

      const title    = (txn.title || '').toLowerCase().trim();
      const creditor = (debt.creditor || '').toLowerCase().trim();
      const name     = (debt.name || '').toLowerCase().trim();

      // Scoring (audit round 2): an amount match ALONE must never cross the
      // inclusion threshold (60) — base 40 + exact-amount 10 tops out at 50.
      // Crossing requires creditor/name evidence in the transaction title.
      let confidence = 40;
      if (creditor.length >= 4 && title.includes(creditor.substring(0, Math.min(8, creditor.length)))) confidence += 35;
      if (name.length >= 3     && title.includes(name.substring(0, Math.min(6, name.length))))         confidence += 20;
      if (amtDiff < 1)                                                                                  confidence += 10;
      confidence = Math.min(confidence, 100);

      if (confidence >= 60) {
        all.push({ txn, debt, ym, amount: absAmt, confidence });
      }
    }
  }

  // Dedup: keep best suggestion per (txn, ym) pair
  const best = {};
  for (const s of all) {
    const key = `${s.txn._rid ?? s.txn._rowIdx ?? s.txn.id ?? s.txn.title}|${s.ym}`;
    if (!best[key] || s.confidence > best[key].confidence) best[key] = s;
  }
  return Object.values(best).sort((a, b) => b.confidence - a.confidence);
}

/**
 * Simulate debt payoff under a strategy with an optional extra monthly payment.
 *
 * Strategies:
 *  - 'snowball'  — pay off smallest balance first (psychological wins)
 *  - 'avalanche' — pay off highest interest rate first (saves most money)
 *
 * Returns: {
 *   debts: enriched list with payoff order + simMonths + monthsSaved,
 *   totalMonthsBaseline, totalMonthsWithExtra, monthsSaved,
 *   cashSaved (estimate based on remaining payments × interest portion)
 * }
 */
/** One payoff run. Returns the simulated debts, payoff order, months and cash. */
function runPayoffSim(enriched, strategy, extraPerMonth) {
  const sim = enriched.map(d => ({ ...d, _simBalance: d._balance, _simMonths: d._baselineMonthsLeft }));
  const sortFn = strategy === 'avalanche'
    ? (a, b) => b._interest - a._interest || a._balance - b._balance
    : (a, b) => a._simBalance - b._simBalance;

  let active = [...sim];
  const order = [];
  let month = 0;
  let cash = 0;
  const MAX = 600;

  while (active.length && month < MAX) {
    month++;
    active.sort(sortFn);
    for (const d of active) {
      const pay = Math.min(d._P, d._simBalance);
      d._simBalance = Math.max(0, d._simBalance - pay);
      cash += pay;
    }
    if (extraPerMonth > 0 && active[0] && active[0]._simBalance > 0) {
      const apply = Math.min(extraPerMonth, active[0]._simBalance);
      active[0]._simBalance -= apply;
      cash += apply;
    }
    const stillActive = [];
    for (const d of active) {
      if (d._simBalance <= 0.01) { d._simMonths = month; order.push(d); }
      else stillActive.push(d);
    }
    active = stillActive;
  }

  return { sim, order, months: month, cash };
}

export function simulatePayoff(debts, strategy = 'snowball', extraPerMonth = 0) {
  const enriched = (debts || [])
    .filter(d => d.total_months && Number(d.months_paid || 0) < Number(d.total_months))
    .map(d => {
      const P = Number(d.monthly_payment);
      const N = Number(d.total_months);
      const paid = Number(d.months_paid || 0);
      const remaining = N - paid;
      // Estimate current balance from total payments left (approximation when no principal)
      const balance = d.original_principal != null
        ? Math.max(0, Number(d.original_principal) - (P * paid))
        : P * remaining;
      return {
        id: d.id, name: d.name, _P: P, _N: N, _paid: paid,
        _interest: Number(d.interest_rate || 0),
        _balance: balance,
        _baselineMonthsLeft: remaining,
      };
    });

  if (!enriched.length) {
    return { debts: [], totalMonthsBaseline: 0, totalMonthsWithExtra: 0, monthsSaved: 0, cashSaved: 0 };
  }

  // The baseline is the SAME simulation with no extra payment. Deriving it from
  // (total_months − months_paid) instead compared two different models, which
  // produced "ประหยัด" figures that went DOWN as the extra payment went UP.
  const baseline = runPayoffSim(enriched, strategy, 0);
  const withExtra = extraPerMonth > 0
    ? runPayoffSim(enriched, strategy, extraPerMonth)
    : baseline;

  const sim   = withExtra.sim;
  const order = withExtra.order;
  const totalMonthsBaseline  = baseline.months;
  const totalMonthsWithExtra = withExtra.months;
  const monthsSaved = Math.max(0, totalMonthsBaseline - totalMonthsWithExtra);

  // Cash actually paid out in each run, measured the same way on both sides.
  const cashSaved = Math.max(0, baseline.cash - withExtra.cash);

  // Per-debt baseline months come from the baseline RUN, not from the raw
  // instalment count, so "เร็วขึ้น N เดือน" compares like with like.
  const baseMonthsById = new Map(baseline.sim.map(d => [d.id, d._simMonths]));

  return {
    debts: sim.map(d => ({
      id: d.id, name: d.name,
      monthly: d._P,
      interest_rate: d._interest,
      balance: d._balance,
      baselineMonthsLeft: baseMonthsById.get(d.id) ?? d._baselineMonthsLeft,
      simMonths: d._simMonths,
      monthsSaved: Math.max(0, (baseMonthsById.get(d.id) ?? d._baselineMonthsLeft) - d._simMonths),
      payoffOrder: order.findIndex(o => o.id === d.id) + 1 || enriched.length,
    })).sort((a, b) => a.payoffOrder - b.payoffOrder),
    totalMonthsBaseline,
    totalMonthsWithExtra,
    monthsSaved,
    cashSaved,
  };
}

/** Forecast: month-by-month total outflow + balance projection (next N months) */
export function forecastDebts(debts, monthsAhead = 12) {
  const result = [];
  let cur = currentYearMonth();
  for (let i = 0; i < monthsAhead; i++) {
    let totalOutflow = 0;
    let activeCount = 0;
    for (const d of debts) {
      const monthsPaidAtThisPoint = Number(d.months_paid || 0) + i;
      if (!d.total_months || monthsPaidAtThisPoint < Number(d.total_months)) {
        totalOutflow += Number(d.monthly_payment);
        activeCount++;
      }
    }
    result.push({ ym: cur, outflow: totalOutflow, activeCount });
    cur = nextMonth(cur);
  }
  return result;
}

// ════════════════════════════════════════════════════════════════════════════
//  RECURRING EXPENSES (subscriptions, bills)
// ════════════════════════════════════════════════════════════════════════════

export async function listRecurring({ scope, activeOnly = true } = {}) {
  if (!supabase) return [];
  let q = supabase.from('recurring_expenses').select('*').order('amount', { ascending: false });
  if (scope)      q = q.eq('scope', scope);
  if (activeOnly) q = q.eq('is_active', true);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

export async function createRecurring(input) {
  if (!supabase) throw new Error('Supabase not configured');
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not logged in');
  const { data, error } = await supabase
    .from('recurring_expenses').insert({ ...input, user_id: user.id }).select().single();
  if (error) throw error;
  return data;
}

export async function updateRecurring(id, patch) {
  if (!supabase) throw new Error('Supabase not configured');
  const { data, error } = await supabase
    .from('recurring_expenses').update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id).select().single();
  if (error) throw error;
  return data;
}

export async function deleteRecurring(id) {
  if (!supabase) throw new Error('Supabase not configured');
  const { error } = await supabase.from('recurring_expenses').delete().eq('id', id);
  if (error) throw error;
}

/** Auto-detect recurring from transactions. Returns suggestions with confidence. */
export function detectRecurringFromTransactions(transactions) {
  if (!transactions?.length) return [];
  const groups = {};
  for (const t of transactions) {
    const amt = Number(t.amount);
    if (amt >= 0) continue;
    if (isTransfer(t)) continue;          // scope transfers are not bills
    if (t.category === 'แบ่งงบ') continue;
    const key = normalizeTitle(t.title) + '|' + Math.round(Math.abs(amt) / 100) * 100;
    if (!groups[key]) groups[key] = { title: t.title, txns: [] };
    groups[key].txns.push(t);
  }
  const recurring = [];
  for (const k in groups) {
    const g = groups[k];
    const months = new Set(g.txns.map(t => bangkokMonth(t.occurred_at)));
    if (months.size < 2) continue;
    const amounts = g.txns.map(t => Math.abs(Number(t.amount)));
    const avg = amounts.reduce((a, b) => a + b, 0) / amounts.length;
    const stdDev = Math.sqrt(amounts.reduce((s, x) => s + (x - avg) ** 2, 0) / amounts.length);
    const variance = avg > 0 ? stdDev / avg : 1;
    if (variance > 0.20) continue;
    const lastTxn = [...g.txns].sort((a, b) => (b.occurred_at || '').localeCompare(a.occurred_at || ''))[0];
    recurring.push({
      title:      g.title,
      vendor:     g.title,
      avgAmount:  Math.round(avg),
      monthsCount: months.size,
      lastDate:   lastTxn.occurred_at,
      variance,
      scope:      lastTxn.scope || 'personal',
      sampleTxn:  lastTxn,
    });
  }
  return recurring.sort((a, b) => b.avgAmount - a.avgAmount);
}

function normalizeTitle(t) {
  return (t || '').toLowerCase().trim().replace(/\s+/g, ' ').substring(0, 40);
}

/** Check whether a recurring expense has been paid for a given month. */
export function checkRecurringStatus(recurring, transactions, yearMonth) {
  const ym = yearMonth || currentYearMonth();
  // Transfers can never mark a bill paid — a scope-transfer leg that happens
  // to contain the vendor text (or match the amount) is not a payment.
  const inMonth = (t) => !isTransfer(t) && bangkokMonth(t.occurred_at) === ym && Number(t.amount) < 0;

  // 1) Explicit link wins — a transaction tagged with this bill's id.
  const linked = (transactions || []).find(t => t.recurring_id === recurring.id && inMonth(t));
  if (linked) return { status: 'paid', txn: linked };

  // 2) Fuzzy match by title. Amount is only checked when the bill has a fixed
  //    amount — variable bills (no amount set) match on title alone.
  const hasAmount = Number(recurring.amount) > 0;
  const tolerance = Math.max(50, Number(recurring.amount) * 0.10);
  const vendor = (recurring.vendor || recurring.name || '').toLowerCase();
  const vendorKey = vendor.substring(0, Math.min(8, vendor.length));

  const match = (transactions || []).find(t => {
    if (!inMonth(t)) return false;
    if (hasAmount && Math.abs(Math.abs(Number(t.amount)) - Number(recurring.amount)) > tolerance) return false;
    const title = (t.title || '').toLowerCase();
    return vendorKey.length >= 4 && title.includes(vendorKey);
  });
  if (match) return { status: 'paid', txn: match };

  const [y, m] = ym.split('-').map(Number);
  const today = new Date();
  const isCurrentMonth = today.getFullYear() === y && today.getMonth() + 1 === m;
  const dueDay = recurring.due_day || 5;
  if (isCurrentMonth) {
    if (today.getDate() > dueDay) return { status: 'overdue', dueDay };
    return { status: 'pending', dueDay };
  }
  const isPastMonth = (y < today.getFullYear()) || (y === today.getFullYear() && m < today.getMonth() + 1);
  return { status: isPastMonth ? 'overdue' : 'upcoming', dueDay };
}

// ════════════════════════════════════════════════════════════════════════════
//  CASH FLOW FORECAST + EMERGENCY FUND
// ════════════════════════════════════════════════════════════════════════════

/** Forecast cash flow for next N months. Pure calculation. */
/**
 * A recurring bill's amount is stated per its own frequency. Anything reading
 * `r.amount` at face value silently mixes yearly and monthly money — the
 * variable-spend derivation on the Finance page did exactly that while the
 * forecast monthlyized, so the two disagreed. Single source of truth.
 */
export function monthlyizeRecurring(r) {
  const a = Number(r?.amount || 0);
  if (r?.frequency === 'yearly')    return a / 12;
  if (r?.frequency === 'quarterly') return a / 3;
  if (r?.frequency === 'weekly')    return a * 4.33;
  return a; // monthly or unknown
}

/** Total monthly cost of a list of recurring bills. */
export function monthlyRecurringTotal(recurring = []) {
  return recurring.reduce((s, r) => s + monthlyizeRecurring(r), 0);
}

export function forecastCashFlow({ monthlyIncome = 0, recurring = [], debts = [], avgVariableExpense = 0, monthsAhead = 3 }) {
  const fixedExpense = monthlyRecurringTotal(recurring);

  const projection = [];
  let cumulative = 0;
  let curYM = currentYearMonth();
  for (let i = 0; i < monthsAhead; i++) {
    curYM = nextMonth(curYM);
    const activeDebts = debts.filter(d => {
      const paid = Number(d.months_paid || 0) + i + 1;
      return !d.total_months || paid <= Number(d.total_months);
    });
    const debtPayment = activeDebts.reduce((s, d) => s + Number(d.monthly_payment || 0), 0);
    const totalOut = fixedExpense + debtPayment + avgVariableExpense;
    const net = monthlyIncome - totalOut;
    cumulative += net;
    projection.push({
      ym: curYM, income: monthlyIncome,
      fixed: fixedExpense, debt: debtPayment, variable: avgVariableExpense,
      totalOut, net, cumulative,
      activeDebtsCount: activeDebts.length,
    });
  }
  const debtNow = debts.reduce((s, d) => s + Number(d.monthly_payment || 0), 0);
  return {
    monthlyIncome, fixedExpense, avgVariableExpense,
    debtPaymentNow: debtNow,
    monthlyNetNow: monthlyIncome - fixedExpense - debtNow - avgVariableExpense,
    projection,
  };
}

/** Compute emergency fund months-of-coverage. */
export function computeEmergencyFundCoverage(accounts, avgMonthlyExpense) {
  const emergencyAccounts = (accounts || []).filter(a => a.is_emergency_fund);
  const total = emergencyAccounts.reduce((s, a) => s + Number(a.balance || 0), 0);
  const months = avgMonthlyExpense > 0 ? total / avgMonthlyExpense : 0;
  let status = 'critical', message = '';
  if (months >= 6)      { status = 'safe';     message = 'ปลอดภัย — เพียงพอ 6+ เดือน'; }
  else if (months >= 3) { status = 'warning';  message = 'พอใช้ได้ — ควรขยายให้ถึง 6 เดือน'; }
  else if (months >= 1) { status = 'critical'; message = 'น้อย — ควรขยายให้ถึงอย่างน้อย 3 เดือน'; }
  else                  { status = 'critical'; message = avgMonthlyExpense > 0 ? 'ยังไม่มีกองทุนฉุกเฉิน — เริ่มเก็บทันที' : 'ตั้งบัญชี emergency fund (toggle ในการ์ดบัญชี)'; }
  return {
    total, months, status, message,
    accountsCount: emergencyAccounts.length,
    accounts: emergencyAccounts,
    target3: avgMonthlyExpense * 3,
    target6: avgMonthlyExpense * 6,
    targetGap6: Math.max(0, avgMonthlyExpense * 6 - total),
  };
}
