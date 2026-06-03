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
      const memo   = (memoCol ? row[memoCol] : '').trim();
      const amount = parseAmount(row[txnCol]);
      if (amount === null || amount === 0) return [];

      const dateStr  = parseThaiDate(row[dateCol] || '');
      const timePart = timeCol && row[timeCol] ? row[timeCol].substring(0, 5) : '00:00';
      const occurred_at = dateStr
        ? `${dateStr}T${timePart}:00+07:00`
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
      category: 'โอนระหว่าง scope',
      type:     'other',
      scope:    from_scope,
      occurred_at,
      note: note || null,
    },
    {
      user_id: user.id,
      title:    inTitle,
      amount:   amt,
      category: 'รายรับ',
      type:     'income',
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

  // Upsert (debt_id, pay_month) is unique — re-marking same month updates
  const { data, error } = await supabase
    .from('debt_payments')
    .upsert({
      user_id: user.id, debt_id, pay_month,
      amount_paid, transaction_id: transaction_id || null, notes: notes || null,
    }, { onConflict: 'debt_id,pay_month' })
    .select().single();
  if (error) throw error;

  // Recalculate months_paid + remaining_balance for this debt
  const { data: payments } = await supabase
    .from('debt_payments').select('amount_paid').eq('debt_id', debt_id);
  const monthsPaid = (payments || []).length;
  const totalPaid  = (payments || []).reduce((s, p) => s + Number(p.amount_paid || 0), 0);

  const { data: debtRow } = await supabase
    .from('debts').select('total_months, monthly_payment').eq('id', debt_id).single();
  const totalDue = debtRow ? Number(debtRow.monthly_payment) * Number(debtRow.total_months || 0) : null;
  const remaining = totalDue ? Math.max(0, totalDue - totalPaid) : null;

  await supabase.from('debts').update({
    months_paid: monthsPaid,
    remaining_balance: remaining,
    updated_at: new Date().toISOString(),
  }).eq('id', debt_id);

  return data;
}

export async function deleteDebtPayment(id) {
  if (!supabase) throw new Error('Supabase not configured');
  // get debt_id first so we can recalc
  const { data: row } = await supabase.from('debt_payments').select('debt_id').eq('id', id).single();
  const debtId = row?.debt_id;
  const { error } = await supabase.from('debt_payments').delete().eq('id', id);
  if (error) throw error;
  // Recompute months_paid
  if (debtId) {
    const { data: payments } = await supabase
      .from('debt_payments').select('amount_paid').eq('debt_id', debtId);
    await supabase.from('debts').update({
      months_paid: (payments || []).length,
      updated_at: new Date().toISOString(),
    }).eq('id', debtId);
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
    const ym = (txn.occurred_at || '').substring(0, 7);
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

      let confidence = 50;
      if (creditor.length >= 4 && title.includes(creditor.substring(0, Math.min(8, creditor.length)))) confidence += 35;
      if (name.length >= 3     && title.includes(name.substring(0, Math.min(6, name.length))))         confidence += 20;
      if (amtDiff < 1)                                                                                  confidence += 10;

      if (confidence >= 60) {
        all.push({ txn, debt, ym, amount: absAmt, confidence });
      }
    }
  }

  // Dedup: keep best suggestion per (txn, ym) pair
  const best = {};
  for (const s of all) {
    const key = `${s.txn._rowIdx ?? s.txn.id ?? s.txn.title}|${s.ym}`;
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

  const totalMonthsBaseline = Math.max(...enriched.map(d => d._baselineMonthsLeft));

  // Simulate
  const sim = enriched.map(d => ({ ...d, _simBalance: d._balance, _simMonths: d._baselineMonthsLeft }));
  const sortFn = strategy === 'avalanche'
    ? (a, b) => b._interest - a._interest || a._balance - b._balance
    : (a, b) => a._simBalance - b._simBalance;

  let active = [...sim];
  const order = [];
  let month = 0;
  const MAX = 600;

  while (active.length && month < MAX) {
    month++;
    active.sort(sortFn);
    for (const d of active) d._simBalance = Math.max(0, d._simBalance - d._P);
    if (extraPerMonth > 0 && active[0]) {
      const apply = Math.min(extraPerMonth, active[0]._simBalance);
      active[0]._simBalance -= apply;
    }
    const stillActive = [];
    for (const d of active) {
      if (d._simBalance <= 0.01) { d._simMonths = month; order.push(d); }
      else stillActive.push(d);
    }
    active = stillActive;
  }

  const totalMonthsWithExtra = month;
  const monthsSaved = Math.max(0, totalMonthsBaseline - totalMonthsWithExtra);

  // Cash saved: baseline vs sim total outflow
  const baselineCash = sim.reduce((s, d) => s + d._P * d._baselineMonthsLeft, 0);
  const simCash      = sim.reduce((s, d) => s + d._P * d._simMonths, 0)
                       + (extraPerMonth * totalMonthsWithExtra);
  const cashSaved = Math.max(0, baselineCash - simCash);

  return {
    debts: sim.map(d => ({
      id: d.id, name: d.name,
      monthly: d._P,
      interest_rate: d._interest,
      balance: d._balance,
      baselineMonthsLeft: d._baselineMonthsLeft,
      simMonths: d._simMonths,
      monthsSaved: Math.max(0, d._baselineMonthsLeft - d._simMonths),
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
    if (t.category === 'แบ่งงบ') continue;
    const key = normalizeTitle(t.title) + '|' + Math.round(Math.abs(amt) / 100) * 100;
    if (!groups[key]) groups[key] = { title: t.title, txns: [] };
    groups[key].txns.push(t);
  }
  const recurring = [];
  for (const k in groups) {
    const g = groups[k];
    const months = new Set(g.txns.map(t => (t.occurred_at || '').substring(0, 7)));
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
  const tolerance = Math.max(50, Number(recurring.amount) * 0.10);
  const vendor = (recurring.vendor || recurring.name || '').toLowerCase();
  const vendorKey = vendor.substring(0, Math.min(8, vendor.length));

  const match = (transactions || []).find(t => {
    if ((t.occurred_at || '').substring(0, 7) !== ym) return false;
    if (Number(t.amount) >= 0) return false;
    if (Math.abs(Math.abs(Number(t.amount)) - Number(recurring.amount)) > tolerance) return false;
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
export function forecastCashFlow({ monthlyIncome = 0, recurring = [], debts = [], avgVariableExpense = 0, monthsAhead = 3 }) {
  const monthlyize = (r) => {
    const a = Number(r.amount || 0);
    if (r.frequency === 'yearly')    return a / 12;
    if (r.frequency === 'quarterly') return a / 3;
    if (r.frequency === 'weekly')    return a * 4.33;
    return a; // monthly or unknown
  };
  const fixedExpense = recurring.reduce((s, r) => s + monthlyize(r), 0);

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
