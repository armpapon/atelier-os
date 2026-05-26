import { supabase } from '../supabase.js';

// ── YouTube Helpers ───────────────────────────────────────────────────────────
export function extractVideoId(url) {
  if (!url) return null;
  const patterns = [
    /youtu\.be\/([\w-]{11})/,
    /youtube\.com\/watch\?v=([\w-]{11})/,
    /youtube\.com\/embed\/([\w-]{11})/,
    /youtube\.com\/shorts\/([\w-]{11})/,
  ];
  for (const re of patterns) {
    const m = url.match(re);
    if (m) return m[1];
  }
  return null;
}

export function getYouTubeThumbnail(videoId) {
  return `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`;
}

export function getYouTubeEmbedUrl(videoId, { autoplay = 0, ccLang = 'th', startSec = 0 } = {}) {
  const params = new URLSearchParams({
    autoplay: String(autoplay),
    cc_load_policy: '1',
    cc_lang_pref: ccLang,
    hl: 'th',
    rel: '0',
    modestbranding: '1',
    ...(startSec > 0 ? { start: String(startSec) } : {}),
  });
  return `https://www.youtube.com/embed/${videoId}?${params}`;
}

// ── Translation (unofficial Google Translate API — no key needed) ─────────────
export async function translateText(text, { targetLang = 'th', sourceLang = 'auto' } = {}) {
  if (!text?.trim()) return '';
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sourceLang}&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`แปลไม่ได้: HTTP ${res.status}`);
  const json = await res.json();
  // json[0] = array of [translated, original, ...] chunks
  return json[0].map(s => s[0]).join('');
}

// ── Learning Sources ──────────────────────────────────────────────────────────
export async function listSources({ limit = 200, type } = {}) {
  if (!supabase) return [];
  let q = supabase
    .from('learning_sources')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (type) q = q.eq('type', type);
  const { data, error } = await q;
  if (error) throw error;
  return data;
}

export async function createSource(input) {
  if (!supabase) throw new Error('Supabase not configured');
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not logged in');
  const { data, error } = await supabase
    .from('learning_sources')
    .insert({ ...input, user_id: user.id })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateSource(id, patch) {
  if (!supabase) throw new Error('Supabase not configured');
  const { data, error } = await supabase
    .from('learning_sources')
    .update(patch)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteSource(id) {
  if (!supabase) throw new Error('Supabase not configured');
  const { error } = await supabase.from('learning_sources').delete().eq('id', id);
  if (error) throw error;
}

// ── Learning Notes ────────────────────────────────────────────────────────────
export async function listNotes({ sourceId, limit = 100 } = {}) {
  if (!supabase) return [];
  let q = supabase
    .from('learning_notes')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (sourceId) q = q.eq('source_id', sourceId);
  const { data, error } = await q;
  if (error) throw error;
  return data;
}

export async function createNote(input) {
  if (!supabase) throw new Error('Supabase not configured');
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not logged in');
  const { data, error } = await supabase
    .from('learning_notes')
    .insert({ ...input, user_id: user.id })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteNote(id) {
  if (!supabase) throw new Error('Supabase not configured');
  const { error } = await supabase.from('learning_notes').delete().eq('id', id);
  if (error) throw error;
}
