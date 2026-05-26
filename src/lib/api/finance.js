import { supabase } from '../supabase.js';

// ── Helpers ──────────────────────────────────────────────────────────────────
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

// ── Transactions ─────────────────────────────────────────────────────────────
export async function listTransactions({ limit = 200, yearMonth } = {}) {
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

export async function deleteTransaction(id) {
  if (!supabase) throw new Error('Supabase not configured');
  const { error } = await supabase.from('transactions').delete().eq('id', id);
  if (error) throw error;
}

// ── Accounts ─────────────────────────────────────────────────────────────────
export async function listAccounts() {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('accounts')
    .select('*')
    .eq('is_active', true)
    .order('created_at');
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
    .from('accounts')
    .update(patch)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteAccount(id) {
  if (!supabase) throw new Error('Supabase not configured');
  const { error } = await supabase.from('accounts').delete().eq('id', id);
  if (error) throw error;
}

// ── Budgets ──────────────────────────────────────────────────────────────────
export async function listBudgets(yearMonth) {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('budgets')
    .select('*')
    .eq('month', `${yearMonth}-01`)
    .order('category');
  if (error) throw error;
  return data;
}

export async function upsertBudget({ category, monthly_limit, yearMonth }) {
  if (!supabase) throw new Error('Supabase not configured');
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not logged in');
  const { data, error } = await supabase
    .from('budgets')
    .upsert(
      { user_id: user.id, category, monthly_limit, month: `${yearMonth}-01` },
      { onConflict: 'user_id,category,month' }
    )
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteBudget(id) {
  if (!supabase) throw new Error('Supabase not configured');
  const { error } = await supabase.from('budgets').delete().eq('id', id);
  if (error) throw error;
}

// ── Financial Goals ───────────────────────────────────────────────────────────
export async function listGoals() {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('financial_goals')
    .select('*')
    .order('deadline', { nullsFirst: false });
  if (error) throw error;
  return data;
}

export async function createGoal(input) {
  if (!supabase) throw new Error('Supabase not configured');
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not logged in');
  const { data, error } = await supabase
    .from('financial_goals')
    .insert({ ...input, user_id: user.id })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateGoal(id, patch) {
  if (!supabase) throw new Error('Supabase not configured');
  const { data, error } = await supabase
    .from('financial_goals')
    .update(patch)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteGoal(id) {
  if (!supabase) throw new Error('Supabase not configured');
  const { error } = await supabase.from('financial_goals').delete().eq('id', id);
  if (error) throw error;
}
