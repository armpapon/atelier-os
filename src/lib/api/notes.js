// ════════════════════════════════════════════════════════════════════════════
//  Second Brain — Notes API
//  CRUD + substring search + [[wiki link]] backlinks.
// ════════════════════════════════════════════════════════════════════════════
import { supabase } from '../supabase.js';

async function getUser() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not logged in');
  return user;
}

// Escape a value for use inside a PostgREST ilike pattern.
function escapeLike(s) {
  return s.replace(/[%_,]/g, ch => '\\' + ch);
}

// Pull every [[target]] reference out of a note body.
export function parseWikiLinks(body) {
  if (!body) return [];
  const out = [];
  const seen = new Set();
  const re = /\[\[([^\[\]]+)\]\]/g;
  let m;
  while ((m = re.exec(body)) !== null) {
    const title = m[1].trim();
    const key = title.toLowerCase();
    if (title && !seen.has(key)) { seen.add(key); out.push(title); }
  }
  return out;
}

export async function listNotes({ search = '', tag = '' } = {}) {
  if (!supabase) return [];
  let q = supabase
    .from('notes')
    .select('*')
    .order('pinned', { ascending: false })
    .order('updated_at', { ascending: false });
  if (search.trim()) {
    const term = `%${escapeLike(search.trim())}%`;
    q = q.or(`title.ilike.${term},body.ilike.${term}`);
  }
  if (tag) q = q.contains('tags', [tag]);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

// All distinct tags across the user's notes (for the filter rail).
export async function listAllTags() {
  if (!supabase) return [];
  const { data, error } = await supabase.from('notes').select('tags');
  if (error) throw error;
  const counts = new Map();
  for (const row of data || []) {
    for (const t of row.tags || []) counts.set(t, (counts.get(t) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([tag, count]) => ({ tag, count }));
}

export async function getNoteByTitle(title) {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('notes')
    .select('*')
    .ilike('title', escapeLike(title))
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// Notes whose body mentions [[title]] — the backlinks for a given note.
export async function listBacklinks(title) {
  if (!supabase || !title) return [];
  const pattern = `%[[${escapeLike(title)}]]%`;
  const { data, error } = await supabase
    .from('notes')
    .select('id, title, body, updated_at')
    .ilike('body', pattern)
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function createNote({ title = 'ไม่มีชื่อ', body = '', tags = [] } = {}) {
  if (!supabase) throw new Error('Supabase not configured');
  const user = await getUser();
  const { data, error } = await supabase
    .from('notes')
    .insert({ user_id: user.id, title, body, tags })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateNote(id, patch) {
  if (!supabase) throw new Error('Supabase not configured');
  const { data, error } = await supabase
    .from('notes')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteNote(id) {
  if (!supabase) throw new Error('Supabase not configured');
  const { error } = await supabase.from('notes').delete().eq('id', id);
  if (error) throw error;
}
