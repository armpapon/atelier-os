import { supabase } from '../supabase.js';
import { todayStr } from '../dates.js';

// ── Family Members ────────────────────────────────────────────────────────────
export async function listMembers() {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('family_members')
    .select('*')
    .order('created_at');
  if (error) throw error;
  return data;
}

export async function createMember(input) {
  if (!supabase) throw new Error('Supabase not configured');
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not logged in');
  const { data, error } = await supabase
    .from('family_members')
    .insert({ ...input, user_id: user.id })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateMember(id, patch) {
  if (!supabase) throw new Error('Supabase not configured');
  const { data, error } = await supabase
    .from('family_members')
    .update(patch)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteMember(id) {
  if (!supabase) throw new Error('Supabase not configured');
  const { error } = await supabase.from('family_members').delete().eq('id', id);
  if (error) throw error;
}

// ── Family Events ─────────────────────────────────────────────────────────────
export async function listEvents({ limit = 50, upcoming = false } = {}) {
  if (!supabase) return [];
  let q = supabase
    .from('family_events')
    .select('*, member:family_members(name, color, initial)')
    .order('event_date', { ascending: true })
    .limit(limit);
  if (upcoming) q = q.gte('event_date', todayStr());
  const { data, error } = await q;
  if (error) throw error;
  return data;
}

export async function createEvent(input) {
  if (!supabase) throw new Error('Supabase not configured');
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not logged in');
  const { data, error } = await supabase
    .from('family_events')
    .insert({ ...input, user_id: user.id })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateEvent(id, patch) {
  if (!supabase) throw new Error('Supabase not configured');
  const { data, error } = await supabase
    .from('family_events')
    .update(patch)
    .eq('id', id)
    .select('*, member:family_members(name, color, initial)')
    .single();
  if (error) throw error;
  return data;
}

export async function deleteEvent(id) {
  if (!supabase) throw new Error('Supabase not configured');
  const { error } = await supabase.from('family_events').delete().eq('id', id);
  if (error) throw error;
}

// ── On This Day — past-year events sharing today's month/day ──────────────────
export async function listOnThisDay() {
  if (!supabase) return [];
  const now = new Date();
  const mmdd = `${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const { data, error } = await supabase
    .from('family_events')
    .select('*, member:family_members(name, color, initial)')
    .lt('event_date', `${now.getFullYear()}-01-01`);
  if (error) throw error;
  return (data || [])
    .filter(e => (e.event_date || '').slice(5) === mmdd)
    .sort((a, b) => b.event_date.localeCompare(a.event_date));
}

// ── Kid Quotes ────────────────────────────────────────────────────────────────
export async function listQuotes({ limit = 100 } = {}) {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('family_quotes')
    .select('*, member:family_members(name, color, initial)')
    .order('said_on', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
}

export async function createQuote(input) {
  if (!supabase) throw new Error('Supabase not configured');
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not logged in');
  const { data, error } = await supabase
    .from('family_quotes').insert({ ...input, user_id: user.id }).select().single();
  if (error) throw error;
  return data;
}

export async function deleteQuote(id) {
  if (!supabase) throw new Error('Supabase not configured');
  const { error } = await supabase.from('family_quotes').delete().eq('id', id);
  if (error) throw error;
}

// ── Family Notes ──────────────────────────────────────────────────────────────
export async function listFamilyNotes({ limit = 30 } = {}) {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('family_notes')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data;
}

export async function createFamilyNote(input) {
  if (!supabase) throw new Error('Supabase not configured');
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not logged in');
  const { data, error } = await supabase
    .from('family_notes')
    .insert({ ...input, user_id: user.id })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteFamilyNote(id) {
  if (!supabase) throw new Error('Supabase not configured');
  const { error } = await supabase.from('family_notes').delete().eq('id', id);
  if (error) throw error;
}

// ── Vaccinations ─────────────────────────────────────────────────────────────
export async function listVaccinations(memberId) {
  if (!supabase || !memberId) return [];
  const { data, error } = await supabase
    .from('vaccinations').select('*').eq('member_id', memberId)
    .order('date_given', { ascending: false, nullsFirst: false });
  if (error) throw error;
  return data || [];
}

export async function createVaccination(input) {
  if (!supabase) throw new Error('Supabase not configured');
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not logged in');
  const { data, error } = await supabase
    .from('vaccinations').insert({ ...input, user_id: user.id }).select().single();
  if (error) throw error;
  return data;
}

export async function deleteVaccination(id) {
  if (!supabase) throw new Error('Supabase not configured');
  const { error } = await supabase.from('vaccinations').delete().eq('id', id);
  if (error) throw error;
}

// ── Growth Records ───────────────────────────────────────────────────────────
export async function listGrowthRecords(memberId) {
  if (!supabase || !memberId) return [];
  const { data, error } = await supabase
    .from('growth_records').select('*').eq('member_id', memberId)
    .order('recorded_at', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function createGrowthRecord(input) {
  if (!supabase) throw new Error('Supabase not configured');
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not logged in');
  const { data, error } = await supabase
    .from('growth_records').insert({ ...input, user_id: user.id }).select().single();
  if (error) throw error;
  return data;
}

export async function deleteGrowthRecord(id) {
  if (!supabase) throw new Error('Supabase not configured');
  const { error } = await supabase.from('growth_records').delete().eq('id', id);
  if (error) throw error;
}

// ── Milestones ───────────────────────────────────────────────────────────────
export async function listMilestones(memberId) {
  if (!supabase || !memberId) return [];
  const { data, error } = await supabase
    .from('milestones').select('*').eq('member_id', memberId)
    .order('milestone_date', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function createMilestone(input) {
  if (!supabase) throw new Error('Supabase not configured');
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not logged in');
  const { data, error } = await supabase
    .from('milestones').insert({ ...input, user_id: user.id }).select().single();
  if (error) throw error;
  return data;
}

export async function deleteMilestone(id) {
  if (!supabase) throw new Error('Supabase not configured');
  const { error } = await supabase.from('milestones').delete().eq('id', id);
  if (error) throw error;
}
