import { supabase } from '../supabase.js';
import { toLocalYMD } from '../dates.js';

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
  const startStr = toLocalYMD(today);
  const end = new Date(today);
  end.setDate(end.getDate() + days);
  const endStr = toLocalYMD(end);
  const { data, error } = await supabase
    .from('journal_entries')
    .select('*')
    .eq('bullet_type', 'event')
    .not('event_time', 'is', null)
    .gte('entry_date', startStr)
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

/**
 * Mobile keyboards (Thai IME + autocorrect) sometimes commit the same phrase
 * twice back-to-back — "ประชุมทีมประชุมทีม". Collapse an exact AABB doubling.
 * Minimum 6 chars so genuine short repeats ("ๆ ๆ", "5 5") survive.
 */
function undouble(text) {
  if (typeof text !== 'string') return text;
  return text.replace(/^(.{6,}?)\1(?=\S|$)/u, '$1');
}

export async function createEntry(input) {
  if (!supabase) throw new Error('Supabase not configured');
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not logged in');
  const { data, error } = await supabase
    .from('journal_entries')
    .insert({ ...input, text: undouble(input?.text), user_id: user.id })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function bulkCreateEntries(rows) {
  if (!supabase) throw new Error('Supabase not configured');
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not logged in');
  const withUser = rows.map(r => ({ ...r, text: undouble(r.text), user_id: user.id }));
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

/**
 * Look up entries by Google Calendar event id ACROSS ALL DATES.
 * The day-scoped reconcile could not see a meeting that had been moved to a
 * different date, so it inserted a second copy instead of re-dating the first.
 */
export async function listEntriesByGcalIds(ids) {
  if (!supabase || !ids?.length) return [];
  const { data, error } = await supabase
    .from('journal_entries')
    .select('*')
    .in('gcal_event_id', [...new Set(ids)]);
  if (error) throw error;
  return data || [];
}

/** Delete several entries at once. Returns how many rows actually went away. */
export async function deleteEntriesByIds(ids) {
  if (!supabase || !ids?.length) return 0;
  const { data, error } = await supabase
    .from('journal_entries').delete().in('id', ids).select('id');
  if (error) throw error;
  return (data || []).length;
}

export async function deleteEntry(id) {
  if (!supabase) throw new Error('Supabase not configured');
  // `.select()` so we can tell "deleted" from "RLS matched nothing". A row a
  // partner shared to me is visible but not deletable — that used to be a
  // silent no-op click.
  const { data, error } = await supabase
    .from('journal_entries').delete().eq('id', id).select('id');
  if (error) throw error;
  if (!data || data.length === 0) throw new Error('ลบไม่ได้ — รายการนี้ไม่ใช่ของคุณ');
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
