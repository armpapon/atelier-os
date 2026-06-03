// ════════════════════════════════════════════════════════════════════════════
//  Daily Trading Plans API
// ════════════════════════════════════════════════════════════════════════════
import { supabase } from '../supabase.js';

async function getUser() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not logged in');
  return user;
}

/** Get plan for a specific date (or null if not exists) */
export async function getPlan(date) {
  if (!supabase || !date) return null;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data, error } = await supabase
    .from('daily_trading_plans')
    .select('*')
    .eq('user_id', user.id)
    .eq('plan_date', date)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** List recent plans (last 30 days by default) */
export async function listRecentPlans({ limit = 30 } = {}) {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('daily_trading_plans')
    .select('*')
    .order('plan_date', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];}

/** Upsert plan — keyed by (user_id, plan_date) */
export async function upsertPlan(input) {
  if (!supabase) throw new Error('Supabase not configured');
  const user = await getUser();
  const { data, error } = await supabase
    .from('daily_trading_plans')
    .upsert(
      { ...input, user_id: user.id, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,plan_date' }
    )
    .select().single();
  if (error) throw error;
  return data;
}

export async function deletePlan(id) {
  if (!supabase) throw new Error('Supabase not configured');
  const { error } = await supabase.from('daily_trading_plans').delete().eq('id', id);
  if (error) throw error;
}

// ── Image upload (reuse 'avatars' bucket) ────────────────────────────────
async function resizeImage(file, maxEdge = 1200, quality = 0.85) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();
    reader.onload = (e) => { img.src = e.target.result; };
    reader.onerror = reject;
    img.onload = () => {
      const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
      const w = Math.round(img.width  * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      canvas.toBlob(
        blob => blob ? resolve(blob) : reject(new Error('canvas.toBlob returned null')),
        'image/jpeg', quality
      );
    };
    img.onerror = () => reject(new Error('โหลดรูปไม่สำเร็จ'));
    reader.readAsDataURL(file);
  });
}

/** Upload a chart image for a plan. Returns public URL. */
export async function uploadChartImage(file, planId, idx) {
  if (!supabase) throw new Error('Supabase not configured');
  if (!file)    throw new Error('No file provided');
  if (!file.type?.startsWith('image/')) throw new Error('ต้องเป็นไฟล์รูปภาพ');

  const user = await getUser();
  const blob = await resizeImage(file);
  const ts   = Date.now();
  const path = `${user.id}/trading_${planId}_${idx}_${ts}.jpg`;

  const { error: upErr } = await supabase.storage
    .from('avatars')
    .upload(path, blob, { upsert: true, cacheControl: '3600', contentType: 'image/jpeg' });
  if (upErr) throw upErr;

  const { data } = supabase.storage.from('avatars').getPublicUrl(path);
  return `${data.publicUrl}?v=${ts}`;
}

/** Append URL to plan's chart_images array. */
export async function addChartImageUrl(planId, url) {
  if (!supabase) throw new Error('Supabase not configured');
  const { data: row } = await supabase.from('daily_trading_plans')
    .select('chart_images').eq('id', planId).single();
  const next = [...(row?.chart_images || []), url];
  const { data, error } = await supabase
    .from('daily_trading_plans').update({ chart_images: next, updated_at: new Date().toISOString() })
    .eq('id', planId).select().single();
  if (error) throw error;
  return data;
}

/** Remove URL from plan's chart_images array. Also tries to delete from storage. */
export async function removeChartImageUrl(planId, url) {
  if (!supabase) throw new Error('Supabase not configured');
  const { data: row } = await supabase.from('daily_trading_plans')
    .select('chart_images').eq('id', planId).single();
  const next = (row?.chart_images || []).filter(u => u !== url);
  await supabase.from('daily_trading_plans').update({ chart_images: next }).eq('id', planId);

  // Best-effort: extract path from URL and delete from storage
  try {
    const u = new URL(url);
    const parts = u.pathname.split('/avatars/');
    if (parts[1]) {
      const cleanPath = parts[1].split('?')[0];
      await supabase.storage.from('avatars').remove([cleanPath]);
    }
  } catch { /* ignore */ }
}

// ── Helpers ──────────────────────────────────────────────────────────────
/** Get Monday of the week for a given date */
export function getWeekStart(dateStr) {
  const d = new Date(dateStr || new Date().toISOString().split('T')[0]);
  const dow = d.getDay();
  const diff = dow === 0 ? -6 : 1 - dow; // Sunday = 0 → go back 6, else go back to Monday
  d.setDate(d.getDate() + diff);
  return d.toISOString().split('T')[0];
}

/** Format date as "วันจันทร์ 3 มิ.ย. 2569" */
export function formatThaiDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('th-TH', {
    weekday: 'long', day: 'numeric', month: 'short', year: 'numeric',
  });
}
