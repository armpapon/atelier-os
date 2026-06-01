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

// ════════════════════════════════════════════════════════════════════════════
//  Learning Sessions — บันทึก session การเรียนแต่ละครั้ง
// ════════════════════════════════════════════════════════════════════════════

export async function listSessions(sourceId) {
  if (!supabase || !sourceId) return [];
  const { data, error } = await supabase
    .from('learning_sessions').select('*').eq('source_id', sourceId)
    .order('session_date', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function createSession(input) {
  if (!supabase) throw new Error('Supabase not configured');
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not logged in');

  const payload = { ...input, user_id: user.id };
  // Auto-compute pages_read if from/to provided
  if (payload.from_page != null && payload.to_page != null && payload.pages_read == null) {
    payload.pages_read = Math.max(0, payload.to_page - payload.from_page);
  }

  const { data, error } = await supabase
    .from('learning_sessions').insert(payload).select().single();
  if (error) throw error;

  // Auto-update source's current_page / progress / video_position
  if (input.source_id) {
    const patch = {};
    if (payload.to_page != null) patch.current_page = payload.to_page;
    if (payload.video_to_sec != null) patch.video_position_sec = payload.video_to_sec;

    // Recompute progress %
    const { data: src } = await supabase
      .from('learning_sources').select('total_pages, duration_min').eq('id', input.source_id).single();
    if (src) {
      if (src.total_pages && payload.to_page != null) {
        patch.progress = Math.min(100, Math.round((payload.to_page / src.total_pages) * 100));
      } else if (src.duration_min && payload.video_to_sec != null) {
        patch.progress = Math.min(100, Math.round((payload.video_to_sec / (src.duration_min * 60)) * 100));
      }
    }
    if (Object.keys(patch).length > 0) {
      await supabase.from('learning_sources').update(patch).eq('id', input.source_id);
    }
  }

  return data;
}

export async function deleteSession(id) {
  if (!supabase) throw new Error('Supabase not configured');
  const { error } = await supabase.from('learning_sessions').delete().eq('id', id);
  if (error) throw error;
}

/** Mark book as "read 1 more time" — increments reading_count + resets current_page */
export async function completeBookPass(sourceId) {
  if (!supabase) throw new Error('Supabase not configured');
  const { data: src } = await supabase
    .from('learning_sources').select('reading_count').eq('id', sourceId).single();
  const next = (src?.reading_count || 0) + 1;
  await supabase.from('learning_sources').update({
    reading_count: next, current_page: 0, progress: 0,
  }).eq('id', sourceId);
  return next;
}

// ════════════════════════════════════════════════════════════════════════════
//  Smart Suggestions — rule-based hints จาก session data
// ════════════════════════════════════════════════════════════════════════════
/**
 * Returns an array of { tone, icon, text } hint suggestions based on
 * the user's recent sessions for this source.
 */
export function getStudyHints(source, sessions) {
  const hints = [];
  if (!sessions?.length) {
    hints.push({ tone: 'accent', icon: '🎯', text: 'เริ่ม session แรก — ตั้ง timer + วาง phone ห่างมือ' });
    return hints;
  }

  const recent = sessions.slice(0, 5);
  const lastScore = recent[0]?.understanding_score;
  const avgScore = recent.filter(s => s.understanding_score).reduce((s, x) => s + x.understanding_score, 0)
                 / Math.max(1, recent.filter(s => s.understanding_score).length);

  // Low understanding — review
  if (lastScore != null && lastScore <= 2) {
    hints.push({
      tone: 'warning', icon: '🔁',
      text: `เข้าใจ ${lastScore}/5 — ลองดู/อ่านส่วนนี้ซ้ำอีกครั้ง หรือพักก่อนค่อยกลับมา`,
    });
  }

  // Repeated pages — should summarize
  if (source.type === 'book' && recent.length >= 3) {
    const samePageRange = recent.slice(0, 3).every(s =>
      s.from_page === recent[0].from_page && s.to_page === recent[0].to_page
    );
    if (samePageRange) {
      hints.push({
        tone: 'accent', icon: '✍️',
        text: 'อ่านหน้าเดิม 3 ครั้งแล้ว — ลองสรุปด้วยคำพูดของตัวเองในช่อง summary',
      });
    }
  }

  // Long session — eye break
  const lastDuration = recent[0]?.duration_min || 0;
  if (lastDuration >= 60) {
    hints.push({
      tone: 'neutral', icon: '👁',
      text: `${lastDuration} นาทีต่อเนื่อง — พักสายตา 5 นาที (20-20-20 rule)`,
    });
  }

  // High mastery
  if (avgScore >= 4.5 && recent.length >= 3) {
    hints.push({
      tone: 'success', icon: '🏆',
      text: 'เข้าใจสูงต่อเนื่อง — พิจารณา teach back / สอนคนอื่น เพื่อ lock ความเข้าใจ',
    });
  }

  // Book: nearing end
  if (source.type === 'book' && source.total_pages && source.current_page) {
    const left = source.total_pages - source.current_page;
    if (left > 0 && left <= 20) {
      hints.push({
        tone: 'success', icon: '🎁',
        text: `เหลืออีก ${left} หน้าจบ — เตรียมเขียน "สรุป 1 หน้า" หลังอ่านจบเป็นรอบทบทวน`,
      });
    }
  }

  return hints;
}

export function computeReadingStats(source, sessions) {
  const totalMin    = sessions.reduce((s, x) => s + (x.duration_min || 0), 0);
  const totalPages  = sessions.reduce((s, x) => s + (x.pages_read   || 0), 0);
  const avgScore    = sessions.filter(x => x.understanding_score).reduce((s, x) => s + x.understanding_score, 0)
                    / Math.max(1, sessions.filter(x => x.understanding_score).length) || 0;
  const pagesPerHour = totalMin > 0 ? (totalPages / totalMin) * 60 : 0;
  return {
    sessionsCount: sessions.length,
    totalMin, totalPages, avgScore, pagesPerHour,
    readingCount: source?.reading_count || 0,
  };
}
