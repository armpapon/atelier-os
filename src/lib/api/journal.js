import { supabase } from '../supabase.js';

// Linked partner's user id (for "ด้วยกัน" shared appointments), or null if the
// accounts aren't linked yet / the partners table doesn't exist.
export async function getPartnerId() {
  if (!supabase) return null;
  const { data, error } = await supabase.from('partners').select('partner_id').maybeSingle();
  if (error) return null;
  return data?.partner_id || null;
}

// ── Journal Entries (Bullet Journal) ─────────────────────────────────────────
export async function listEntries({ date, limit = 200 } = {}) {
  if (!supabase) return [];
  let q = supabase
    .from('journal_entries')
    .select('*')
    .order('created_at', { ascending: true })
    .limit(limit);
  if (date) q = q.eq('entry_date', date);
  const { data, error } = await q;
  if (error) throw error;
  return data;
}

export async function listRecentDates(limit = 14) {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('journal_entries')
    .select('entry_date')
    .order('entry_date', { ascending: false })
    .limit(300);
  if (error) throw error;
  // deduplicate
  const seen = new Set();
  const dates = [];
  for (const row of data) {
    if (!seen.has(row.entry_date)) {
      seen.add(row.entry_date);
      dates.push(row.entry_date);
      if (dates.length >= limit) break;
    }
  }
  return dates;
}

export async function listUpcomingEvents({ days = 14, limit = 10 } = {}) {
  if (!supabase) return [];
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  const end = new Date(today);
  end.setDate(end.getDate() + days);
  const endStr = end.toISOString().split('T')[0];
  const { data, error } = await supabase
    .from('journal_entries')
    .select('*')
    .eq('bullet_type', 'event')
    .not('event_time', 'is', null)
    .gte('entry_date', todayStr)
    .lte('entry_date', endStr)
    .order('entry_date', { ascending: true })
    .order('event_time', { ascending: true })
    .limit(limit);
  if (error) throw error;
  return data || [];
}

// Lightweight per-day activity for a date range — feeds the mini calendar.
export async function listEntriesInRange({ start, end }) {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('journal_entries')
    .select('entry_date, bullet_type, event_time')
    .gte('entry_date', start)
    .lte('entry_date', end);
  if (error) throw error;
  return data || [];
}

export async function createEntry(input) {
  if (!supabase) throw new Error('Supabase not configured');
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not logged in');
  const { data, error } = await supabase
    .from('journal_entries')
    .insert({ ...input, user_id: user.id })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function bulkCreateEntries(rows) {
  if (!supabase) throw new Error('Supabase not configured');
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not logged in');
  const withUser = rows.map(r => ({ ...r, user_id: user.id }));
  const { data, error } = await supabase
    .from('journal_entries')
    .insert(withUser)
    .select();
  if (error) throw error;
  return data || [];
}

export async function toggleEntry(id, done) {
  if (!supabase) throw new Error('Supabase not configured');
  const { data, error } = await supabase
    .from('journal_entries')
    .update({ done })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateEntry(id, patch) {
  if (!supabase) throw new Error('Supabase not configured');
  const { data, error } = await supabase
    .from('journal_entries')
    .update(patch)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteEntry(id) {
  if (!supabase) throw new Error('Supabase not configured');
  const { error } = await supabase.from('journal_entries').delete().eq('id', id);
  if (error) throw error;
}

// ── Moods ─────────────────────────────────────────────────────────────────────
export async function getMoodForDate(date) {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('moods')
    .select('*')
    .eq('mood_date', date)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function upsertMood({ mood_date, value, note }) {
  if (!supabase) throw new Error('Supabase not configured');
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not logged in');
  const { data, error } = await supabase
    .from('moods')
    .upsert(
      { user_id: user.id, mood_date, value, note },
      { onConflict: 'user_id,mood_date' }
    )
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ── Habits ───────────────────────────────────────────────────────────────────
export async function listHabits() {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('habits')
    .select('*')
    .eq('active', true)
    .order('created_at');
  if (error) throw error;
  return data;
}

export async function createHabit(input) {
  if (!supabase) throw new Error('Supabase not configured');
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not logged in');
  const { data, error } = await supabase
    .from('habits')
    .insert({ ...input, user_id: user.id })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteHabit(id) {
  if (!supabase) throw new Error('Supabase not configured');
  const { error } = await supabase.from('habits').delete().eq('id', id);
  if (error) throw error;
}

// ── Habit Logs ───────────────────────────────────────────────────────────────
export async function getHabitLogsForDate(date) {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('habit_logs')
    .select('*')
    .eq('log_date', date);
  if (error) throw error;
  return data;
}

export async function getHabitLogsForWeek(startDate, endDate) {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('habit_logs')
    .select('*')
    .gte('log_date', startDate)
    .lte('log_date', endDate);
  if (error) throw error;
  return data;
}

export async function toggleHabitLog(habitId, date, completed) {
  if (!supabase) throw new Error('Supabase not configured');
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not logged in');
  if (completed) {
    const { data, error } = await supabase
      .from('habit_logs')
      .upsert(
        { habit_id: habitId, user_id: user.id, log_date: date, completed: true },
        { onConflict: 'habit_id,log_date' }
      )
      .select()
      .single();
    if (error) throw error;
    return data;
  } else {
    const { error } = await supabase
      .from('habit_logs')
      .delete()
      .eq('habit_id', habitId)
      .eq('log_date', date);
    if (error) throw error;
    return null;
  }
}
