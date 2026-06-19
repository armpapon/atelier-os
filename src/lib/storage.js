// Loop — Supabase Storage helpers
import { supabase } from './supabase.js';

const BUCKET = 'avatars';

async function getUser() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not logged in');
  return user;
}

/**
 * Resize image client-side via canvas (square crop, max edge).
 * Keeps file < ~300KB while preserving quality.
 */
async function resizeImage(file, maxEdge = 480, quality = 0.85) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();
    reader.onload = (e) => { img.src = e.target.result; };
    reader.onerror = reject;
    img.onload = () => {
      // Square crop from center
      const side = Math.min(img.width, img.height);
      const sx = (img.width  - side) / 2;
      const sy = (img.height - side) / 2;
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = Math.min(maxEdge, side);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, sx, sy, side, side, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(
        blob => blob ? resolve(blob) : reject(new Error('canvas.toBlob returned null')),
        'image/jpeg', quality
      );
    };
    img.onerror = () => reject(new Error('โหลดรูปไม่สำเร็จ'));
    reader.readAsDataURL(file);
  });
}

/**
 * Upload an avatar for a family member.
 * Stored at: avatars/{user_id}/family_{memberId}.jpg (overwrites existing)
 * Returns the public URL (with cache-buster).
 */
export async function uploadFamilyAvatar(file, memberId) {
  if (!supabase) throw new Error('Supabase not configured');
  if (!file)    throw new Error('No file provided');
  if (!file.type?.startsWith('image/')) throw new Error('ต้องเป็นไฟล์รูปภาพเท่านั้น');

  const user = await getUser();
  const blob = await resizeImage(file);
  const path = `${user.id}/family_${memberId}.jpg`;

  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(path, blob, {
      upsert: true, cacheControl: '3600', contentType: 'image/jpeg',
    });
  if (upErr) throw upErr;

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  // Cache-buster so updated avatars show immediately
  const url = `${data.publicUrl}?v=${Date.now()}`;

  // Save to DB
  const { error: dbErr } = await supabase
    .from('family_members').update({ avatar_url: url }).eq('id', memberId);
  if (dbErr) throw dbErr;

  return url;
}

/**
 * Resize keeping aspect ratio (max edge), for content photos like memories.
 */
async function resizeContain(file, maxEdge = 1000, quality = 0.85) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();
    reader.onload = (e) => { img.src = e.target.result; };
    reader.onerror = reject;
    img.onload = () => {
      const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(
        blob => blob ? resolve(blob) : reject(new Error('canvas.toBlob returned null')),
        'image/jpeg', quality
      );
    };
    img.onerror = () => reject(new Error('โหลดรูปไม่สำเร็จ'));
    reader.readAsDataURL(file);
  });
}

/**
 * Upload one memory photo for a family event to a unique path.
 * Stored at: avatars/{user_id}/event_{eventId}_{ts}.jpg
 * Returns the public URL — the caller appends it to the event's `photos` array.
 */
export async function uploadFamilyEventPhoto(file, eventId) {
  if (!supabase) throw new Error('Supabase not configured');
  if (!file)    throw new Error('No file provided');
  if (!file.type?.startsWith('image/')) throw new Error('ต้องเป็นไฟล์รูปภาพเท่านั้น');

  const user = await getUser();
  const blob = await resizeContain(file);
  const stamp = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const path = `${user.id}/event_${eventId}_${stamp}.jpg`;

  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(path, blob, { upsert: true, cacheControl: '3600', contentType: 'image/jpeg' });
  if (upErr) throw upErr;

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return `${data.publicUrl}?v=${Date.now()}`;
}

/** Remove a single event photo from storage, given its public URL. */
export async function deleteEventPhotoByUrl(url) {
  if (!supabase || !url) return;
  try {
    const u = new URL(url);
    const parts = u.pathname.split(`/${BUCKET}/`);
    if (parts[1]) await supabase.storage.from(BUCKET).remove([decodeURIComponent(parts[1])]).catch(() => {});
  } catch { /* ignore malformed url */ }
}

/** Remove avatar from storage + clear avatar_url on member */
export async function removeFamilyAvatar(memberId) {
  if (!supabase) throw new Error('Supabase not configured');
  const user = await getUser();
  const path = `${user.id}/family_${memberId}.jpg`;

  // Remove from storage (ignore errors if file missing)
  await supabase.storage.from(BUCKET).remove([path]).catch(() => {});

  // Clear avatar_url
  const { error } = await supabase
    .from('family_members').update({ avatar_url: null }).eq('id', memberId);
  if (error) throw error;
}
