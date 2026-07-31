import { supabase } from '../supabase.js';
import { toLocalYMD } from '../dates.js';

/**
 * Trades API — wrapper รอบ supabase.from('trades')
 * - RLS รับประกันแล้วว่า user เห็นแค่ trades ของตัวเอง
 * - ทุก mutation ผ่านที่นี่จะ auto-attach user_id
 */

export async function listTrades({ limit = 100 } = {}) {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('trades')
    .select('*')
    .order('trade_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data;
}

export async function createTrade(input) {
  if (!supabase) throw new Error('Supabase not configured');
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not logged in');
  const row = { ...input, user_id: user.id };
  const { data, error } = await supabase.from('trades').insert(row).select().single();
  if (error) throw error;
  return data;
}

export async function updateTrade(id, patch) {
  if (!supabase) throw new Error('Supabase not configured');
  const { data, error } = await supabase
    .from('trades').update(patch).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

export async function deleteTrade(id) {
  if (!supabase) throw new Error('Supabase not configured');
  const { error } = await supabase.from('trades').delete().eq('id', id);
  if (error) throw error;
}

/** Bulk insert — used by Excel/CSV importer. Returns inserted rows. */
export async function bulkCreateTrades(rows) {
  if (!supabase) throw new Error('Supabase not configured');
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not logged in');
  const withUser = rows.map(r => ({ ...r, user_id: user.id }));
  const { data, error } = await supabase.from('trades').insert(withUser).select();
  if (error) throw error;
  return data || [];
}

/** Get existing (trade_date, symbol, entry_price) keys for dedup */
export async function getExistingTradeKeys() {
  if (!supabase) return new Set();
  const { data, error } = await supabase
    .from('trades').select('id, trade_date, symbol, entry_price, pnl');
  if (error) throw error;
  return new Set((data || []).map(t => tradeKey(t)));
}

export function tradeKey(t, rowIdx) {
  const date   = (t.trade_date || '').substring(0, 10);
  const symbol = (t.symbol || '').toUpperCase();
  const entry  = t.entry_price;
  const pnl    = t.pnl;
  // Without a price AND a P&L there is nothing distinguishing about the row —
  // Number(null) collapsed every such trade onto '…|0|0' and the importer threw
  // away genuinely different trades. Fall back to the row position instead.
  if ((entry == null || entry === '') && (pnl == null || pnl === '')) {
    return `${date}|${symbol}|row:${rowIdx != null ? `i${rowIdx}` : `db${t.id ?? ''}`}`;
  }
  const n = (v) => (v == null || v === '' ? 'x' : Math.round(Number(v) * 100));
  return `${date}|${symbol}|${n(entry)}|${n(pnl)}`;
}

// ── Excel Trade Log parser ──────────────────────────────────────────────────
/**
 * Parse Trading-Journal-2026.xlsx → array of trade rows ready for bulkCreate.
 * Reads 'Trade Log' sheet (default), uses row 2 as header.
 *
 * Column mapping (Thai/English):
 *   # · วันที่เปิด · วันที่ปิด · Symbol · Direction · Entry · SL · TP · Lot
 *   RR · P&L (USD) · P&L (%) · Session · Setup · ผลลัพธ์ · Setup Detail
 *   Emotion · Lesson Learned · Balance After
 */
export async function parseTradeExcel(arrayBuffer, sheetName) {
  const XLSX = await import('xlsx');
  // cellDates:false on purpose. With cellDates:true SheetJS hands back Date
  // objects built in local time; `.toISOString()` then rolls every Bangkok date
  // back one day (serial 46218 = 2026-07-15 came out as 2026-07-14).
  const wb = XLSX.read(arrayBuffer, { type: 'array', cellDates: false });
  const sn = sheetName || wb.SheetNames.find(n => /trade.?log/i.test(n)) || wb.SheetNames[0];
  const ws = wb.Sheets[sn];
  if (!ws) throw new Error(`ไม่พบ sheet ชื่อ "${sn}"`);

  // Detect header row by looking for '#' or 'วันที่เปิด' marker
  const json = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
  let headerIdx = 0;
  for (let i = 0; i < Math.min(8, json.length); i++) {
    const row = json[i].map(c => String(c || '').toLowerCase());
    if (row.some(c => c === '#' || c.includes('วันที่เปิด') || c === 'symbol')) {
      headerIdx = i; break;
    }
  }
  const headers = json[headerIdx].map(h => String(h || '').trim());
  const dataRows = json.slice(headerIdx + 1).filter(r => r.some(c => c != null && c !== ''));

  // Map by column name (case + space insensitive)
  const norm = s => String(s || '').toLowerCase().replace(/[\s_.()&]/g, '');
  const col = (name) => {
    const target = norm(name);
    return headers.findIndex(h => norm(h) === target);
  };

  const idx = {
    num:       col('#'),
    dateOpen:  col('วันที่เปิด'),
    dateClose: col('วันที่ปิด'),
    symbol:    col('Symbol'),
    dir:       col('Direction'),
    entry:     col('Entry'),
    sl:        col('SL'),
    tp:        col('TP'),
    lot:       col('Lot'),
    rr:        col('RR'),
    pnl:       col('P&L (USD)'),
    pnlPct:    col('P&L (%)'),
    session:   col('Session'),
    setup:     col('Setup'),
    result:    col('ผลลัพธ์'),
    detail:    col('Setup Detail'),
    emotion:   col('Emotion'),
    lesson:    col('Lesson Learned'),
    balAfter:  col('Balance After'),
  };

  const RESULT_MAP = { 'Win': 'WIN', 'Loss': 'LOSS', 'BE': 'BREAKEVEN', 'Breakeven': 'BREAKEVEN', 'Partial': 'WIN', 'Open': 'OPEN' };
  const DIR_MAP    = { 'Long': 'long', 'Short': 'short', 'Buy': 'long', 'Sell': 'short' };

  /** Excel serial → 'YYYY-MM-DD' (epoch 1899-12-30, computed in UTC). */
  const serialToYMD = (n) => {
    if (!Number.isFinite(n) || n <= 0) return null;
    const d = new Date(Date.UTC(1899, 11, 30) + Math.round(n) * 864e5);
    return isNaN(d) ? null : d.toISOString().slice(0, 10);
  };

  const toDate = (v) => {
    if (v == null || v === '') return null;
    if (typeof v === 'number') return serialToYMD(v);
    if (v instanceof Date) return toLocalYMD(v);
    const s = String(v).trim();
    // A numeric string is still a serial.
    if (/^\d+(\.\d+)?$/.test(s)) return serialToYMD(Number(s));
    // ISO already
    const isoM = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (isoM) {
      let iy = Number(isoM[1]);
      if (iy > 2400) iy -= 543;
      return `${iy}-${isoM[2]}-${isoM[3]}`;
    }
    // DD/MM/YYYY
    const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
    if (m) {
      let [, d, mo, y] = m; y = Number(y);
      if (y < 100) y += 2000;
      if (y > 2400) y -= 543;
      return `${y}-${String(mo).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    }
    const dt = new Date(s);
    return isNaN(dt) ? null : toLocalYMD(dt);
  };

  const num = (v) => {
    if (v == null || v === '') return null;
    const n = Number(String(v).replace(/,/g, ''));
    return isNaN(n) ? null : n;
  };

  const trades = [];
  for (const row of dataRows) {
    const tradeDate = toDate(row[idx.dateClose] ?? row[idx.dateOpen]);
    if (!tradeDate) continue;

    const dir = DIR_MAP[String(row[idx.dir] || '').trim()] || 'long';
    const result = RESULT_MAP[String(row[idx.result] || '').trim()] || 'OPEN';

    trades.push({
      trade_date:     tradeDate,
      symbol:         (row[idx.symbol] || 'XAUUSD').toString().toUpperCase(),
      side:           dir,
      setup:          row[idx.setup]   || null,
      entry_price:    num(row[idx.entry]),
      exit_price:     null,
      stop_loss:      num(row[idx.sl]),
      take_profit:    num(row[idx.tp]),
      position_size:  num(row[idx.lot]),
      rr:             row[idx.rr] ? String(row[idx.rr]).trim() : null,
      pnl:            num(row[idx.pnl]),
      pnl_pct:        num(row[idx.pnlPct]),
      balance_after:  num(row[idx.balAfter]),
      status:         result,
      session:        row[idx.session] || null,
      setup_detail:   row[idx.detail]  || null,
      emotion:        row[idx.emotion] || null,
      lesson_learned: row[idx.lesson]  || null,
    });
  }

  return trades;
}

/**
 * subscribe to realtime changes on trades for current user.
 * Returns an unsubscribe function.
 */
export function subscribeTrades(userId, onChange) {
  if (!supabase || !userId) return () => {};
  const channel = supabase
    .channel(`trades:${userId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'trades', filter: `user_id=eq.${userId}` },
      onChange
    )
    .subscribe();
  return () => { supabase.removeChannel(channel); };
}

/**
 * คำนวณ stats จาก trades — ใช้ใน UI
 */
export function computeStats(trades) {
  if (!trades?.length) {
    return { count: 0, wins: 0, losses: 0, winRate: 0, totalPnl: 0, avgRR: null, profitFactor: 0, maxDrawdown: 0 };
  }
  const wins = trades.filter(t => t.status === 'WIN');
  const losses = trades.filter(t => t.status === 'LOSS');
  const totalPnl = trades.reduce((s, t) => s + (Number(t.pnl) || 0), 0);
  const winRate = trades.length > 0 ? Math.round((wins.length / (wins.length + losses.length || 1)) * 100) : 0;

  // Parse "1:3.2" -> 3.2  / "-1" -> 0
  const parseRR = (rr) => {
    if (!rr) return null;
    const s = String(rr);
    if (s.includes(':')) return Number(s.split(':')[1]);
    return null;
  };
  const rrs = trades.map(t => parseRR(t.rr)).filter(v => v != null);
  // Number, not a pre-formatted string — the call site decides how to print it.
  const avgRR = rrs.length ? rrs.reduce((a, b) => a + b, 0) / rrs.length : null;

  // Profit factor = sum wins / abs(sum losses)
  const winSum = wins.reduce((s, t) => s + (Number(t.pnl) || 0), 0);
  const lossSum = Math.abs(losses.reduce((s, t) => s + (Number(t.pnl) || 0), 0));
  const profitFactor = lossSum > 0 ? (winSum / lossSum).toFixed(2) : '∞';

  // Max drawdown — running cumulative
  let peak = 0, cum = 0, maxDD = 0;
  // Iterate from oldest to newest
  const sorted = [...trades].sort((a, b) => new Date(a.trade_date) - new Date(b.trade_date));
  for (const t of sorted) {
    cum += Number(t.pnl) || 0;
    peak = Math.max(peak, cum);
    maxDD = Math.min(maxDD, cum - peak);
  }

  return {
    count: trades.length,
    wins: wins.length,
    losses: losses.length,
    winRate,
    totalPnl,
    avgRR,
    profitFactor,
    maxDrawdown: maxDD,
  };
}
