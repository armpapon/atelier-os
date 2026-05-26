import { supabase } from '../supabase.js';

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
  if (upcoming) q = q.gte('event_date', new Date().toISOString().split('T')[0]);
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

export async function deleteEvent(id) {
  if (!supabase) throw new Error('Supabase not configured');
  const { error } = await supabase.from('family_events').delete().eq('id', id);
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
