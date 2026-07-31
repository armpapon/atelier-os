// ════════════════════════════════════════════════════════════════════════════
//  Life OS API — Manifest, Themes, Goals, Today's Focus, Roadmap
// ════════════════════════════════════════════════════════════════════════════
import { supabase } from '../supabase.js';
import { todayStr, toLocalYMD } from '../dates.js';

async function getUser() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not logged in');
  return user;
}

// ── MANIFEST ─────────────────────────────────────────────────────────────────
export async function getManifest() {
  if (!supabase) return null;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data, error } = await supabase
    .from('manifest').select('*').eq('user_id', user.id).maybeSingle();
  if (error) throw error;
  return data || { statement: '', values: [] };
}

export async function upsertManifest({ statement, values }) {
  if (!supabase) throw new Error('Supabase not configured');
  const user = await getUser();
  const { data, error } = await supabase
    .from('manifest')
    .upsert({ user_id: user.id, statement, values, updated_at: new Date().toISOString() })
    .select().single();
  if (error) throw error;
  return data;
}

// ── THEMES ───────────────────────────────────────────────────────────────────
export async function getThemes() {
  if (!supabase) return null;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data, error } = await supabase
    .from('themes').select('*').eq('user_id', user.id).maybeSingle();
  if (error) throw error;
  return data || {
    year_theme: '', quarter_theme: '', week_theme: '',
    year_label: '', quarter_label: '', week_label: '',
  };
}

export async function upsertThemes(patch) {
  if (!supabase) throw new Error('Supabase not configured');
  const user = await getUser();
  const { data, error } = await supabase
    .from('themes')
    .upsert({ user_id: user.id, ...patch, updated_at: new Date().toISOString() })
    .select().single();
  if (error) throw error;
  return data;
}

// ── GOALS ────────────────────────────────────────────────────────────────────
export async function listGoals({ status = 'active', limit = 50 } = {}) {
  if (!supabase) return [];
  let q = supabase.from('goals').select('*').order('priority').order('created_at').limit(limit);
  if (status) q = q.eq('status', status);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

export async function createGoal(input) {
  if (!supabase) throw new Error('Supabase not configured');
  const user = await getUser();
  const { data, error } = await supabase
    .from('goals').insert({ ...input, user_id: user.id }).select().single();
  if (error) throw error;
  return data;
}

export async function updateGoal(id, patch) {
  if (!supabase) throw new Error('Supabase not configured');
  const { data, error } = await supabase
    .from('goals').update(patch).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

export async function deleteGoal(id) {
  if (!supabase) throw new Error('Supabase not configured');
  const { error } = await supabase.from('goals').delete().eq('id', id);
  if (error) throw error;
}

// ── FOCUS_TODAY ──────────────────────────────────────────────────────────────
function todayDate() {
  return todayStr();
}

export async function listFocusToday(date) {
  if (!supabase) return [];
  const d = date || todayDate();
  const { data, error } = await supabase
    .from('focus_today').select('*')
    .eq('focus_date', d)
    .order('ord').order('created_at');
  if (error) throw error;
  return data || [];
}

export async function addFocus({ title, focus_date, ord }) {
  if (!supabase) throw new Error('Supabase not configured');
  const user = await getUser();
  const { data, error } = await supabase
    .from('focus_today')
    .insert({ user_id: user.id, title, focus_date: focus_date || todayDate(), ord: ord ?? 0 })
    .select().single();
  if (error) throw error;
  return data;
}

export async function toggleFocus(id, done) {
  if (!supabase) throw new Error('Supabase not configured');
  const { data, error } = await supabase
    .from('focus_today').update({ done }).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

export async function deleteFocus(id) {
  if (!supabase) throw new Error('Supabase not configured');
  const { error } = await supabase.from('focus_today').delete().eq('id', id);
  if (error) throw error;
}

// ── ROADMAP MILESTONES ───────────────────────────────────────────────────────
export async function listRoadmap({ monthsAhead = 6 } = {}) {
  if (!supabase) return [];
  const now = new Date();
  const start = toLocalYMD(now);
  const end = toLocalYMD(new Date(now.getFullYear(), now.getMonth() + monthsAhead + 1, 0));
  const { data, error } = await supabase
    .from('roadmap_milestones').select('*')
    .gte('target_date', start)
    .lte('target_date', end)
    .order('target_date');
  if (error) throw error;
  return data || [];
}

export async function createMilestone(input) {
  if (!supabase) throw new Error('Supabase not configured');
  const user = await getUser();
  const { data, error } = await supabase
    .from('roadmap_milestones').insert({ ...input, user_id: user.id }).select().single();
  if (error) throw error;
  return data;
}

export async function updateMilestone(id, patch) {
  if (!supabase) throw new Error('Supabase not configured');
  const { data, error } = await supabase
    .from('roadmap_milestones').update(patch).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

export async function deleteMilestone(id) {
  if (!supabase) throw new Error('Supabase not configured');
  const { error } = await supabase.from('roadmap_milestones').delete().eq('id', id);
  if (error) throw error;
}

// ── LIFE PULSE (cross-module quick stats) ────────────────────────────────────
/** Get current month finance summary across both scopes */
export async function getFinancePulse() {
  if (!supabase) return { income: 0, expense: 0, net: 0, savingsRate: 0 };
  const now = new Date();
  const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const start = `${ym}-01`;
  const nextM = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const end = nextM.toISOString().split('T')[0];

  const { data, error } = await supabase
    .from('transactions').select('amount, scope')
    .gte('occurred_at', start).lt('occurred_at', end);
  if (error) throw error;

  let income = 0, expense = 0;
  for (const t of (data || [])) {
    const amt = Number(t.amount) || 0;
    if (amt > 0) income += amt;
    else expense += Math.abs(amt);
  }
  const net = income - expense;
  const savingsRate = income > 0 ? (net / income) * 100 : 0;
  return { income, expense, net, savingsRate };
}

/** Count active items across modules */
export async function getModulePulse() {
  if (!supabase) return { learning: 0, family: 0, trading: 0 };
  const results = await Promise.allSettled([
    supabase.from('learning_sources').select('id', { count: 'exact', head: true }),
    supabase.from('family_events').select('id', { count: 'exact', head: true })
      .gte('event_date', todayStr()),
    // Statuses are stored upper-case ('OPEN') — 'open' matched nothing, so the
    // dashboard trading pulse always read 0.
    supabase.from('trades').select('id', { count: 'exact', head: true }).eq('status', 'OPEN'),
  ]);
  return {
    learning: results[0].status === 'fulfilled' ? (results[0].value.count || 0) : 0,
    family:   results[1].status === 'fulfilled' ? (results[1].value.count || 0) : 0,
    trading:  results[2].status === 'fulfilled' ? (results[2].value.count || 0) : 0,
  };
}
