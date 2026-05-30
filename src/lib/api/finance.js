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
  return { start, end };
}

// ── CSV Parser (KBank Make + generic Thai bank CSV) ──────────────────────────

/** Pockets that belong to family scope */
const FAMILY_POCKETS = ['กองทุนครอบครัว', 'เงินเพื่อน้องอคิน'];

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
  const datePart = str.split(' ')[0].split('T')[0];
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
  if (!str && str !== 0) return null;
  const s = String(str).replace(/,/g, '').trim();
  if (!s || s === '-') return null;
  if (s.startsWith('(') && s.endsWith(')')) return -Math.abs(parseFloat(s.slice(1, -1)));
  return parseFloat(s) || null;
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

  return rows.flatMap((row, i) => {

    // ── Make Cloud Pocket format ─────────────────────────────────────────────
    if (makeFmt) {
      const pocket = (row[pocketCol] || '').trim();
      const txType = (row[txTypeCol] || '').trim();

      // Skip internal pocket transfers — only real transactions matter
      if (txType === 'Move Money') return [];

      const amount = parseAmount(row[txnCol]);
      if (amount === null || amount === 0) return [];

      // Auto-detect scope from pocket name
      const scope = FAMILY_POCKETS.includes(pocket) ? 'family' : 'personal';

      const dateStr  = parseThaiDate(row[dateCol] || '');
      const timePart = timeCol && row[timeCol] ? row[timeCol].substring(0, 5) : '00:00';
      const occurred_at = dateStr
        ? `${dateStr}T${timePart}:00+07:00`
        : new Date().toISOString();

      // Title: Note (merchant) > Memo (user note) > pocket name
      const merchant = (noteCol ? row[noteCol] : '').trim();
      const memo     = (memoCol ? row[memoCol]  : '').trim();
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

    const { category, type } = autoCategory(desc);
    return [{
      _rowIdx:    i,
      _pocket:    null,
      _txtype:    null,
      title:      desc || '(ไม่มีชื่อ)',
      occurred_at: dateStr ? `${dateStr}T12:00:00+07:00` : new Date().toISOString(),
      amount:     amount ?? 0,
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
  let q = supabase
    .from('transactions')
    .select('*')
    .order('occurred_at', { ascending: false })
    .limit(limit);
  if (yearMonth) {
    const { start, end } = getMonthBounds(yearMonth);
    q = q.gte('occurred_at', start).lt('occurred_at', end);
  }
  if (scope) q = q.eq('scope', scope);
  const { data, error } = await q;
  if (error) throw error;
  return data;
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

export async function deleteTransaction(id) {
  if (!supabase) throw new Error('Supabase not configured');
  const { error } = await supabase.from('transactions').delete().eq('id', id);
  if (error) throw error;
}

/** List transactions in an arbitrary date range — used by analytics */
export async function listTransactionsRange({ startDate, endDate, scope, limit = 5000 } = {}) {
  if (!supabase) return [];
  let q = supabase
    .from('transactions')
    .select('*')
    .gte('occurred_at', startDate)
    .lt('occurred_at', endDate)
    .order('occurred_at', { ascending: false })
    .limit(limit);
  if (scope) q = q.eq('scope', scope);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

// ── Analytics aggregators (pure client-side) ─────────────────────────────────
/** Sum income/expense for a list of transactions */
export function summarize(txns) {
  let income = 0, expense = 0;
  for (const t of txns) {
    if (t.amount > 0) income += t.amount;
    else expense += Math.abs(t.amount);
  }
  const net = income - expense;
  const savingsRate = income > 0 ? (net / income) * 100 : 0;
  return { income, expense, net, savingsRate, count: txns.length };
}

/** Group by yearMonth → { ym: { income, expense, ... } } */
export function aggregateByMonth(txns) {
  const m = {};
  for (const t of txns) {
    const ym = (t.occurred_at || '').substring(0, 7);
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
    if (t.amount >= 0) continue;
    const date = (t.occurred_at || '').substring(0, 10);
    if (!date.startsWith(yearMonth)) continue;
    const day = date.substring(8, 10);
    m[day] = (m[day] || 0) + Math.abs(t.amount);
  }
  return m;
}

/** Top N largest expenses */
export function topExpenses(txns, n = 10) {
  return txns
    .filter(t => t.amount < 0)
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
  const { data, error } = await supabase
    .from('accounts')
    .insert({ ...input, user_id: user.id })
    .select()
    .single();
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
 * Upsert accounts based on { pocket, scope, latestBalance } records.
 * Dedup key: (user_id, name, scope) — case-insensitive match on name.
 * Returns: Map<pocketName, accountId>
 */
export async function bulkUpsertAccountsByPocket(pockets) {
  if (!supabase) return new Map();
  if (!pockets?.length) return new Map();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not logged in');

  // Fetch existing accounts for this user
  const { data: existing, error: fetchErr } = await supabase
    .from('accounts').select('id, name, scope, balance')
    .eq('user_id', user.id);
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
      // Update balance if we have a newer one
      if (p.latestBalance != null) {
        toUpdate.push({ id: found.id, balance: p.latestBalance });
      }
    } else {
      toInsert.push({
        user_id: user.id,
        name: p.pocket,
        type: 'savings',  // Make pockets are essentially savings sub-accounts
        balance: p.latestBalance ?? 0,
        tone: pickTone(p.pocket),
        scope: p.scope,
        is_active: true,
      });
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
    await Promise.all(toUpdate.map(u =>
      supabase.from('accounts').update({ balance: u.balance }).eq('id', u.id)
    ));
  }

  return idMap;
}

// ── Dedup ────────────────────────────────────────────────────────────────────

/**
 * Build a Set of natural keys (date+amount+title) from existing transactions
 * so the importer can skip duplicates.
 */
function txnKey(t) {
  const date = (t.occurred_at || '').substring(0, 16);   // include HH:mm
  const amt  = Math.round(Number(t.amount) * 100);
  const title = (t.title || '').trim().substring(0, 40);
  return `${date}|${amt}|${title}`;
}

/** Get keys of existing transactions in a date range for dedup. */
export async function getExistingTxnKeys({ startDate, endDate, scope } = {}) {
  if (!supabase) return new Set();
  let q = supabase.from('transactions')
    .select('occurred_at, amount, title, scope')
    .gte('occurred_at', startDate)
    .lt('occurred_at', endDate);
  if (scope) q = q.eq('scope', scope);
  const { data, error } = await q;
  if (error) throw error;
  return new Set((data || []).map(txnKey));
}

export { txnKey };

/** Delete all transactions in a month (used for clean re-import). */
export async function deleteTransactionsInMonth(yearMonth, scope) {
  if (!supabase) throw new Error('Supabase not configured');
  const { start, end } = getMonthBounds(yearMonth);
  let q = supabase.from('transactions').delete().gte('occurred_at', start).lt('occurred_at', end);
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
  const { data, error } = await supabase
    .from('budgets')
    .upsert(
      { user_id: user.id, category, monthly_limit, month: `${yearMonth}-01`, scope },
      { onConflict: 'user_id,category,month' }
    )
    .select().single();
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
