import { supabase } from '../supabase.js';

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
    return { count: 0, wins: 0, losses: 0, winRate: 0, totalPnl: 0, avgRR: 0, profitFactor: 0, maxDrawdown: 0 };
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
  const avgRR = rrs.length ? (rrs.reduce((a, b) => a + b, 0) / rrs.length).toFixed(1) : '—';

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
