import { useState, useEffect, useCallback, useRef } from 'react';
import { Icon } from '../components/Icon.jsx';
import { PageHeader } from '../components/PageHeader.jsx';
import {
  listMembers, createMember, updateMember, deleteMember,
  listEvents, createEvent, updateEvent, deleteEvent,
  listFamilyNotes, createFamilyNote, deleteFamilyNote,
  listOnThisDay, listQuotes, createQuote, deleteQuote,
} from '../lib/api/family.js';
import { uploadFamilyAvatar, removeFamilyAvatar, uploadFamilyEventPhoto, deleteEventPhotoByUrl } from '../lib/storage.js';
import { MemberDetail } from '../components/family/MemberDetail.jsx';
import { todayStr } from '../lib/dates.js';

// ── Helpers ───────────────────────────────────────────────────────────────────
// Colour DATA the user picks a member's avatar fallback from — not a token, keep literal.
const AVATAR_COLORS = ['#d4a574', '#7ba7d4', '#a78fcc', '#d49aa5', '#6cbf83', '#e8b84b', '#e07a6e'];

function daysUntil(dateStr) {
  const target = new Date(dateStr + 'T00:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((target - today) / 86400000);
  return diff;
}

function formatEventDate(dateStr) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('th-TH', { weekday: 'short', month: 'short', day: 'numeric' });
}

function getInitial(name) {
  return (name || '?').charAt(0).toUpperCase();
}

// Event photos: prefer the `photos` array, fall back to legacy single photo_url.
function eventPhotos(ev) {
  if (Array.isArray(ev?.photos) && ev.photos.length) return ev.photos;
  return ev?.photo_url ? [ev.photo_url] : [];
}

function eventVideos(ev) {
  return Array.isArray(ev?.videos) ? ev.videos : [];
}

// Turn a video URL into an embeddable form (YouTube / Google Drive / file / link).
function videoEmbed(url) {
  const u = (url || '').trim();
  if (!u) return null;
  let m = u.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([\w-]{11})/);
  if (m) return { type: 'iframe', src: `https://www.youtube.com/embed/${m[1]}` };
  m = u.match(/drive\.google\.com\/file\/d\/([\w-]+)/);
  if (m) return { type: 'iframe', src: `https://drive.google.com/file/d/${m[1]}/preview` };
  if (/\.(mp4|webm|ogg|mov)(\?|$)/i.test(u)) return { type: 'video', src: u };
  return { type: 'link', src: u };
}

// Avatar — shows photo if avatar_url, else colored circle with initial
function Avatar({ member, size = 44, borderColor }) {
  const initial = member?.initial || getInitial(member?.name);
  // Fallback mirrors AVATAR_COLORS[0] — decorative data default, not a token.
  const bg = member?.color || '#d4a574';
  const baseStyle = {
    width: size, height: size, borderRadius: '50%',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    flexShrink: 0, overflow: 'hidden',
    border: borderColor ? `3px solid ${borderColor}` : 'none',
    boxShadow: 'var(--shadow-card)',
  };
  if (member?.avatar_url) {
    return (
      <div style={baseStyle}>
        <img src={member.avatar_url} alt={member.name || ''}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          onError={(e) => { e.target.style.display = 'none'; e.target.parentElement.textContent = initial; }} />
      </div>
    );
  }
  return (
    <div style={{
      ...baseStyle, background: bg, color: 'var(--text-inverse)',
      fontFamily: 'var(--f-display)', fontSize: size * 0.42, fontWeight: 500,
    }}>{initial}</div>
  );
}

// ── Member Modal (add or edit, with photo upload) ─────────────────────────────
function MemberModal({ initial, onSave, onClose }) {
  const isEdit = !!initial;
  const [form, setForm] = useState({
    name:       initial?.name       || '',
    role:       initial?.role       || '',
    color:      initial?.color      || AVATAR_COLORS[0],
    birth_date: initial?.birth_date || '',
    note:       initial?.note       || '',
  });
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(initial?.avatar_url || null);
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState('');
  const fileRef = useRef();

  const handlePhotoPick = (file) => {
    if (!file) return;
    if (!file.type?.startsWith('image/')) { alert('กรุณาเลือกไฟล์รูปภาพ'); return; }
    if (file.size > 10 * 1024 * 1024) { alert('ไฟล์ใหญ่เกินไป (สูงสุด 10MB)'); return; }
    setPhotoFile(file);
    const reader = new FileReader();
    reader.onload = e => setPhotoPreview(e.target.result);
    reader.readAsDataURL(file);
  };

  const handleRemovePhoto = async () => {
    if (!confirm('ลบรูปภาพ?')) return;
    if (isEdit && initial.avatar_url) {
      try { await removeFamilyAvatar(initial.id); } catch (e) { alert(e.message); return; }
    }
    setPhotoFile(null);
    setPhotoPreview(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    setProgress('กำลังบันทึก...');
    try {
      const payload = {
        name: form.name.trim(),
        role: form.role.trim() || null,
        color: form.color,
        initial: getInitial(form.name),
        birth_date: form.birth_date || null,
        note: form.note.trim() || null,
      };
      const saved = isEdit
        ? await updateMember(initial.id, payload)
        : await createMember(payload);

      if (photoFile && saved?.id) {
        setProgress('กำลังอัปโหลดรูป...');
        await uploadFamilyAvatar(photoFile, saved.id);
      }
      onSave(); onClose();
    } catch (err) {
      alert('บันทึกไม่สำเร็จ: ' + err.message);
    } finally { setSaving(false); setProgress(''); }
  };

  // Preview member object for Avatar
  const previewMember = {
    name: form.name, initial: getInitial(form.name),
    color: form.color, avatar_url: photoPreview,
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'var(--dim)' }} />
      <form onSubmit={handleSubmit} style={{
        position: 'relative', background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius-card)', padding: 28, width: 420,
        boxShadow: 'var(--shadow-pop)',
        display: 'flex', flexDirection: 'column', gap: 14, maxHeight: '90vh', overflow: 'auto',
      }}>
        <div style={{ fontFamily: 'var(--f-display)', fontSize: 20, fontWeight: 500, color: 'var(--text-primary)' }}>
          {isEdit ? 'แก้ไขสมาชิก' : 'เพิ่มสมาชิก'}
        </div>

        {/* Photo upload zone */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 14, alignItems: 'center' }}>
          <div onClick={() => fileRef.current?.click()}
            style={{ cursor: 'pointer', position: 'relative' }}>
            <Avatar member={previewMember} size={88} />
            <div style={{
              position: 'absolute', inset: 0, borderRadius: '50%',
              background: 'var(--dim)',
              // Fixed white: sits on the always-dark scrim above, independent of theme
              // (var(--text-inverse) assumes an accent-coloured surface, not this scrim).
              color: '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              opacity: 0, transition: 'opacity 130ms', fontSize: 11,
              fontFamily: 'var(--f-mono)', letterSpacing: '0.1em',
            }}
            onMouseEnter={e => e.currentTarget.style.opacity = 1}
            onMouseLeave={e => e.currentTarget.style.opacity = 0}>
              เปลี่ยนรูป
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <button type="button" onClick={() => fileRef.current?.click()}
              style={{
                padding: '7px 14px', background: 'var(--accent-soft)', color: 'var(--accent-strong)',
                border: 0, borderRadius: 'var(--radius-pill)', fontSize: 12,
                fontFamily: 'var(--f-body)', cursor: 'pointer',
              }}>
              📸 {photoPreview ? 'เปลี่ยนรูป' : 'เพิ่มรูปภาพ'}
            </button>
            {photoPreview && (
              <button type="button" onClick={handleRemovePhoto}
                style={{
                  padding: '5px 12px', background: 'transparent', color: 'var(--text-muted)',
                  border: 0, fontSize: 11, fontFamily: 'var(--f-body)', cursor: 'pointer',
                }}>
                × ลบรูป
              </button>
            )}
          </div>
          <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }}
            onChange={e => handlePhotoPick(e.target.files?.[0])} />
        </div>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <span style={{ fontFamily: 'var(--f-mono)', fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>ชื่อ *</span>
          <input className="input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="ชื่อสมาชิก" autoFocus required />
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <span style={{ fontFamily: 'var(--f-mono)', fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>ความสัมพันธ์</span>
          <input className="input" value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))} placeholder="แม่, ภรรยา, ลูกสาว, ลูกชาย" />
        </label>

        {/* Color picker — used as fallback when no photo */}
        <div>
          <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 6 }}>
            สี Avatar <span style={{ color: 'var(--text-muted)' }}>· ใช้เมื่อไม่มีรูป</span>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {AVATAR_COLORS.map(c => (
              <button key={c} type="button" onClick={() => setForm(f => ({ ...f, color: c }))}
                style={{
                  width: 28, height: 28, borderRadius: '50%', background: c,
                  border: `3px solid ${form.color === c ? 'var(--text-primary)' : 'transparent'}`,
                  cursor: 'pointer',
                }} />
            ))}
          </div>
        </div>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <span style={{ fontFamily: 'var(--f-mono)', fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>วันเกิด</span>
          <input className="input" type="date" value={form.birth_date} onChange={e => setForm(f => ({ ...f, birth_date: e.target.value }))} />
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <span style={{ fontFamily: 'var(--f-mono)', fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>โน้ต (ไม่บังคับ)</span>
          <input className="input" value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} placeholder="ข้อมูลเพิ่มเติม" />
        </label>

        {progress && (
          <div style={{
            padding: '8px 12px', background: 'var(--accent-soft)', color: 'var(--accent-strong)',
            borderRadius: 'var(--radius-control)', fontSize: 12, fontFamily: 'var(--f-mono)', textAlign: 'center',
          }}>{progress}</div>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          <button type="button" className="btn btn--ghost" onClick={onClose} style={{ flex: 1 }}>ยกเลิก</button>
          <button type="submit" disabled={saving} className="btn btn--primary" style={{ flex: 2 }}>
            {saving ? '...' : (isEdit ? '💾 บันทึก' : '+ เพิ่มสมาชิก')}
          </button>
        </div>
      </form>
    </div>
  );
}

// ── Add Event Modal ───────────────────────────────────────────────────────────
function AddEventModal({ members, onSave, onClose }) {
  const [form, setForm] = useState({ title: '', event_date: '', member_id: '', note: '' });
  const [photos, setPhotos] = useState([]); // [{ file, preview }]
  const [saving, setSaving] = useState(false);
  const fileRef = useRef(null);

  const handlePhotoPick = (files) => {
    const picked = Array.from(files || []).filter(f => f.type?.startsWith('image/'));
    if (!picked.length) return;
    setPhotos(prev => [...prev, ...picked.map(file => ({ file, preview: URL.createObjectURL(file) }))]);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.title.trim() || !form.event_date) return;
    setSaving(true);
    try {
      const saved = await createEvent({
        title: form.title.trim(),
        event_date: form.event_date,
        member_id: form.member_id || null,
        note: form.note.trim() || null,
      });
      if (photos.length && saved?.id) {
        try {
          const urls = [];
          for (const p of photos) urls.push(await uploadFamilyEventPhoto(p.file, saved.id));
          await updateEvent(saved.id, { photos: urls });
        } catch (err) { alert('บันทึกเหตุการณ์แล้ว แต่อัปโหลดรูปบางส่วนไม่สำเร็จ: ' + err.message); }
      }
      onSave(); onClose();
    } catch (err) { alert(err.message); } finally { setSaving(false); }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'var(--dim)' }} />
      <form onSubmit={handleSubmit} style={{
        position: 'relative', background: 'var(--surface)', border: '1px solid var(--line)',
        borderRadius: 'var(--r-xl)', padding: 32, width: 360, display: 'flex', flexDirection: 'column', gap: 16,
      }}>
        <div style={{ fontFamily: 'var(--f-display)', fontSize: 20 }}>เพิ่มเหตุการณ์</div>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontFamily: 'var(--f-mono)', fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--ink-3)' }}>ชื่อเหตุการณ์ *</span>
          <input className="input" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="เช่น วันเกิด, นัดหมอ, ท่องเที่ยว" autoFocus required />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontFamily: 'var(--f-mono)', fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--ink-3)' }}>วันที่ *</span>
          <input className="input" type="date" value={form.event_date} onChange={e => setForm(f => ({ ...f, event_date: e.target.value }))} required />
        </label>
        {members.length > 0 && (
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontFamily: 'var(--f-mono)', fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--ink-3)' }}>เกี่ยวกับใคร</span>
            <select className="input" value={form.member_id} onChange={e => setForm(f => ({ ...f, member_id: e.target.value }))}>
              <option value="">ทุกคน</option>
              {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </label>
        )}
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontFamily: 'var(--f-mono)', fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--ink-3)' }}>โน้ต</span>
          <input className="input" value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} placeholder="รายละเอียดเพิ่มเติม" />
        </label>

        {/* Memory photos (optional, multiple) */}
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontFamily: 'var(--f-mono)', fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--ink-3)' }}>รูปภาพ (ใส่ได้หลายรูป)</span>
          {photos.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(72px, 1fr))', gap: 8 }}>
              {photos.map((p, i) => (
                <div key={i} style={{ position: 'relative', aspectRatio: '1' }}>
                  <img src={p.preview} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'var(--r-sm)', border: '1px solid var(--line)' }} />
                  {/* Fixed dark scrim + white glyph: sits on top of arbitrary photo content,
                      independent of page theme (same reasoning as the Lightbox controls below). */}
                  <button type="button" onClick={() => setPhotos(prev => prev.filter((_, j) => j !== i))}
                    style={{ position: 'absolute', top: 3, right: 3, background: 'var(--dim)', color: '#fff', border: 0, borderRadius: '50%', width: 20, height: 20, cursor: 'pointer', fontSize: 12, lineHeight: 1 }}>×</button>
                </div>
              ))}
            </div>
          )}
          <button type="button" onClick={() => fileRef.current?.click()}
            style={{ padding: '9px 14px', background: 'var(--accent-soft)', color: 'var(--accent-strong)', border: 0, borderRadius: 'var(--r-md)', fontSize: 12.5, cursor: 'pointer', fontFamily: 'var(--f-body)' }}>
            📸 {photos.length ? 'เพิ่มรูปอีก' : 'เพิ่มรูปภาพความทรงจำ'}
          </button>
          <input ref={fileRef} type="file" accept="image/*" multiple style={{ display: 'none' }}
            onChange={e => handlePhotoPick(e.target.files)} />
        </label>

        <div style={{ display: 'flex', gap: 10 }}>
          <button type="button" className="btn btn--ghost" onClick={onClose} style={{ flex: 1 }}>ยกเลิก</button>
          <button type="submit" disabled={saving} className="btn btn--primary" style={{ flex: 2 }}>{saving ? '...' : '+ เพิ่ม'}</button>
        </div>
      </form>
    </div>
  );
}

// ── Add Note Drawer ───────────────────────────────────────────────────────────
function AddNoteDrawer({ onSave, onClose }) {
  const [form, setForm] = useState({ author: '', title: '', body: '' });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.body.trim()) return;
    setSaving(true);
    try {
      await createFamilyNote({ author: form.author.trim() || null, title: form.title.trim() || null, body: form.body.trim() });
      onSave(); onClose();
    } catch (err) { alert(err.message); } finally { setSaving(false); }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 400, display: 'flex', justifyContent: 'flex-end' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'var(--dim)' }} />
      <form onSubmit={handleSubmit} style={{
        position: 'relative', width: 420, height: '100%', background: 'var(--surface)',
        borderLeft: '1px solid var(--line)', padding: 32, overflow: 'auto',
        display: 'flex', flexDirection: 'column', gap: 18,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontFamily: 'var(--f-display)', fontSize: 20 }}>โน้ตครอบครัว</div>
          <button type="button" onClick={onClose} style={{ color: 'var(--ink-3)', fontSize: 18 }}>×</button>
        </div>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontFamily: 'var(--f-mono)', fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--ink-3)' }}>เขียนโดย</span>
          <input className="input" value={form.author} onChange={e => setForm(f => ({ ...f, author: e.target.value }))} placeholder="ชื่อคุณ" />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontFamily: 'var(--f-mono)', fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--ink-3)' }}>หัวข้อ (ไม่บังคับ)</span>
          <input className="input" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="เช่น เรื่องที่อยากบอก" />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontFamily: 'var(--f-mono)', fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--ink-3)' }}>เนื้อหา *</span>
          <textarea className="input" rows={8} value={form.body} onChange={e => setForm(f => ({ ...f, body: e.target.value }))} placeholder="เขียนอะไรก็ได้ให้กับคนที่รัก..." required style={{ resize: 'vertical' }} />
        </label>
        <div style={{ display: 'flex', gap: 10, marginTop: 'auto' }}>
          <button type="button" className="btn btn--ghost" onClick={onClose} style={{ flex: 1 }}>ยกเลิก</button>
          <button type="submit" disabled={saving} className="btn btn--primary" style={{ flex: 2 }}>{saving ? '...' : '💌 บันทึกโน้ต'}</button>
        </div>
      </form>
    </div>
  );
}

// ── Lightbox ──────────────────────────────────────────────────────────────────
function Lightbox({ photos, index, onIndex, onClose }) {
  const go = (d) => onIndex((index + d + photos.length) % photos.length);
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight') go(1);
      else if (e.key === 'ArrowLeft') go(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  return (
    // Immersive full-screen photo viewer — deliberately kept near-opaque black
    // (not var(--dim), which is a much lighter ambient scrim meant for card
    // modals) so arbitrary photo content always sits on a true-black backdrop,
    // and the white icon/counter controls stay legible regardless of app theme.
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 700, background: 'rgba(0,0,0,0.92)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <img src={photos[index]} alt="" onClick={e => e.stopPropagation()}
        style={{ maxWidth: '92vw', maxHeight: '88vh', objectFit: 'contain', borderRadius: 6 }} />
      <button onClick={onClose} style={{ position: 'absolute', top: 18, right: 22, color: '#fff', fontSize: 30, background: 'none', border: 0, cursor: 'pointer', lineHeight: 1 }}>×</button>
      {photos.length > 1 && (
        <>
          <button onClick={e => { e.stopPropagation(); go(-1); }} style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', color: '#fff', fontSize: 34, background: 'none', border: 0, cursor: 'pointer' }}>‹</button>
          <button onClick={e => { e.stopPropagation(); go(1); }} style={{ position: 'absolute', right: 16, top: '50%', transform: 'translateY(-50%)', color: '#fff', fontSize: 34, background: 'none', border: 0, cursor: 'pointer' }}>›</button>
          <div style={{ position: 'absolute', bottom: 20, left: '50%', transform: 'translateX(-50%)', color: 'rgba(255,255,255,0.8)', fontFamily: 'var(--f-mono)', fontSize: 12 }}>
            {index + 1} / {photos.length}
          </div>
        </>
      )}
    </div>
  );
}

// ── Event Detail (memory view) ─────────────────────────────────────────────────
function EventDetail({ event, members, onChange, onClose }) {
  const [ev, setEv] = useState(event);
  const [title, setTitle] = useState(event.title);
  const [note, setNote] = useState(event.note || '');
  const [uploading, setUploading] = useState(false);
  const [lightbox, setLightbox] = useState(null);
  const [videoUrl, setVideoUrl] = useState('');
  const fileRef = useRef(null);

  const photos = eventPhotos(ev);
  const videos = eventVideos(ev);
  const member = ev.member || members.find(m => m.id === ev.member_id) || null;

  const persist = async (patch) => {
    const updated = await updateEvent(ev.id, patch);
    setEv(updated);
    onChange();
    return updated;
  };

  const saveTitle = () => { const t = title.trim(); if (t && t !== ev.title) persist({ title: t }); };
  const saveNote  = () => { if (note.trim() !== (ev.note || '')) persist({ note: note.trim() || null }); };

  const addVideo = async () => {
    const u = videoUrl.trim();
    if (!u) return;
    await persist({ videos: [...videos, u] });
    setVideoUrl('');
  };
  const removeVideo = async (u) => {
    if (!confirm('ลบวิดีโอนี้?')) return;
    await persist({ videos: videos.filter(v => v !== u) });
  };

  const addPhotos = async (files) => {
    const picked = Array.from(files || []).filter(f => f.type?.startsWith('image/'));
    if (!picked.length) return;
    setUploading(true);
    try {
      const urls = [];
      for (const f of picked) urls.push(await uploadFamilyEventPhoto(f, ev.id));
      await persist({ photos: [...photos, ...urls] });
    } catch (err) { alert(err.message); } finally { setUploading(false); }
  };

  const removePhoto = async (url) => {
    if (!confirm('ลบรูปนี้?')) return;
    await persist({ photos: photos.filter(p => p !== url) });
    deleteEventPhotoByUrl(url);
  };

  const removeEvent = async () => {
    if (!confirm('ลบเหตุการณ์นี้ทั้งหมด (รวมรูป)?')) return;
    photos.forEach(deleteEventPhotoByUrl);
    await deleteEvent(ev.id);
    onChange(); onClose();
  };

  const labelStyle = { fontFamily: 'var(--f-mono)', fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--ink-3)' };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 550, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'var(--dim)' }} />
      <div style={{
        position: 'relative', background: 'var(--surface)', border: '1px solid var(--line)',
        borderRadius: 'var(--r-xl)', padding: 28, width: 640, maxWidth: '100%', maxHeight: '90vh',
        overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16, boxShadow: 'var(--shadow-pop)',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <input value={title} onChange={e => setTitle(e.target.value)} onBlur={saveTitle}
              onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
              style={{ width: '100%', background: 'transparent', border: 'none', outline: 'none',
                fontFamily: 'var(--f-display)', fontSize: 22, fontWeight: 500, color: 'var(--ink)' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--ink-3)' }}>
              <span>{formatEventDate(ev.event_date)} · {new Date(ev.event_date + 'T00:00:00').getFullYear() + 543}</span>
              {member?.name && <span>· {member.name}</span>}
            </div>
          </div>
          <button onClick={onClose} style={{ fontSize: 22, color: 'var(--ink-4)', cursor: 'pointer', padding: 2 }}>×</button>
        </div>

        {/* Note */}
        <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <span style={labelStyle}>บันทึก</span>
          <textarea value={note} rows={2} onChange={e => setNote(e.target.value)} onBlur={saveNote}
            placeholder="วันนั้นเป็นยังไงบ้าง..."
            style={{ background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 'var(--r-md)',
              padding: '10px 12px', fontFamily: 'var(--f-body)', fontSize: 14, lineHeight: 1.6, color: 'var(--ink)', outline: 'none', resize: 'vertical' }} />
        </label>

        {/* Videos (links) — kept above Photos so the add-video field stays reachable
            on mobile; a tall photo grid would otherwise push it off screen. */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span style={labelStyle}>วิดีโอ {videos.length > 0 && `(${videos.length})`}</span>
          {videos.map(url => {
            const emb = videoEmbed(url);
            return (
              <div key={url} style={{ position: 'relative' }}>
                {emb?.type === 'iframe' && (
                  <div style={{ position: 'relative', paddingTop: '56.25%', borderRadius: 'var(--r-md)', overflow: 'hidden', border: '1px solid var(--line)' }}>
                    <iframe src={emb.src} title="video" allow="autoplay; encrypted-media" allowFullScreen
                      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0 }} />
                  </div>
                )}
                {emb?.type === 'video' && (
                  <video src={emb.src} controls style={{ width: '100%', borderRadius: 'var(--r-md)', border: '1px solid var(--line)', display: 'block' }} />
                )}
                {emb?.type === 'link' && (
                  <a href={emb.src} target="_blank" rel="noopener noreferrer"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--accent-strong)', textDecoration: 'none',
                      border: '1px solid var(--border-strong)', borderRadius: 'var(--r-sm)', padding: '8px 12px' }}>
                    ▶ เปิดวิดีโอ
                  </a>
                )}
                {/* Fixed dark scrim + white glyph — overlays arbitrary video/photo content, independent of theme */}
                <button onClick={() => removeVideo(url)} title="ลบวิดีโอ"
                  style={{ position: 'absolute', top: 6, right: 6, background: 'var(--dim)', color: '#fff', border: 0, borderRadius: '50%', width: 24, height: 24, cursor: 'pointer', fontSize: 14, lineHeight: 1 }}>×</button>
              </div>
            );
          })}
          <div style={{ display: 'flex', gap: 8 }}>
            <input className="input" value={videoUrl} onChange={e => setVideoUrl(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addVideo(); } }}
              placeholder="วางลิงก์ YouTube / Google Drive" style={{ flex: 1 }} />
            <button onClick={addVideo} className="btn btn--ghost btn--sm" style={{ flexShrink: 0 }}>+ เพิ่ม</button>
          </div>
        </div>

        {/* Photos */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={labelStyle}>รูปภาพ {photos.length > 0 && `(${photos.length})`}</span>
            <button onClick={() => fileRef.current?.click()} disabled={uploading}
              style={{ fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--accent-strong)', cursor: 'pointer',
                border: '1px solid var(--border-strong)', borderRadius: 'var(--r-sm)', padding: '4px 10px' }}>
              {uploading ? 'กำลังอัปโหลด...' : '📸 เพิ่มรูป'}
            </button>
            <input ref={fileRef} type="file" accept="image/*" multiple style={{ display: 'none' }}
              onChange={e => addPhotos(e.target.files)} />
          </div>
          {photos.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--ink-4)', padding: '24px 0', fontSize: 13, fontStyle: 'italic', fontFamily: 'var(--f-display)' }}>
              ยังไม่มีรูป — เพิ่มภาพความทรงจำของวันนี้
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 8 }}>
              {photos.map((url, i) => (
                <div key={url} style={{ position: 'relative', aspectRatio: '1' }}>
                  <img src={url} alt="" loading="lazy" onClick={() => setLightbox(i)}
                    style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'var(--r-md)', border: '1px solid var(--line)', cursor: 'pointer' }} />
                  {/* Fixed dark scrim + white glyph — overlays arbitrary photo content, independent of theme */}
                  <button onClick={() => removePhoto(url)}
                    style={{ position: 'absolute', top: 4, right: 4, background: 'var(--dim)', color: '#fff', border: 0, borderRadius: '50%', width: 22, height: 22, cursor: 'pointer', fontSize: 13, lineHeight: 1 }}>×</button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--hairline)', paddingTop: 14 }}>
          <button onClick={removeEvent} style={{ fontSize: 12.5, color: 'var(--danger)', cursor: 'pointer' }}>ลบเหตุการณ์</button>
          <button className="btn btn--ghost" onClick={onClose}>ปิด</button>
        </div>
      </div>

      {lightbox != null && <Lightbox photos={photos} index={lightbox} onIndex={setLightbox} onClose={() => setLightbox(null)} />}
    </div>
  );
}

// ── On This Day ────────────────────────────────────────────────────────────────
function OnThisDayCard({ events, onOpen }) {
  if (!events.length) return null;
  const thisYear = new Date().getFullYear();
  return (
    <div className="card" style={{ marginBottom: 18, background: 'var(--accent-soft)', border: '1px solid var(--accent)' }}>
      <div className="card__head">
        <div className="card__title">⭐ วันนี้เมื่อก่อน</div>
        <span className="card__label" style={{ color: 'var(--accent-strong)' }}>ความทรงจำวันนี้</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {events.map(ev => {
          const yearsAgo = thisYear - new Date(ev.event_date + 'T00:00:00').getFullYear();
          const pics = eventPhotos(ev);
          return (
            <button key={ev.id} onClick={() => onOpen(ev)}
              style={{ display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left', width: '100%',
                padding: '10px 12px', borderRadius: 'var(--r-md)', cursor: 'pointer',
                background: 'var(--surface)', border: '1px solid var(--line)' }}>
              {pics.length > 0
                ? <img src={pics[0]} alt="" loading="lazy" style={{ width: 44, height: 44, borderRadius: 'var(--r-sm)', objectFit: 'cover', flexShrink: 0, border: '1px solid var(--line)' }} />
                : <span style={{ fontSize: 24, flexShrink: 0, width: 44, textAlign: 'center' }}>🗓️</span>}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: 'var(--f-display)', fontStyle: 'italic', fontSize: 14, color: 'var(--accent-strong)' }}>
                  {yearsAgo === 1 ? 'ปีที่แล้ววันนี้' : `${yearsAgo} ปีที่แล้ววันนี้`}
                </div>
                <div style={{ fontSize: 14, color: 'var(--ink)', fontWeight: 500 }}>{ev.title}</div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Kid Quotes ─────────────────────────────────────────────────────────────────
function KidQuotesCard({ quotes, members, onChange }) {
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ quote: '', member_id: '', said_on: todayStr() });
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!form.quote.trim()) return;
    setSaving(true);
    try {
      await createQuote({ quote: form.quote.trim(), member_id: form.member_id || null, said_on: form.said_on });
      setForm({ quote: '', member_id: '', said_on: todayStr() });
      setAdding(false); onChange();
    } catch (err) { alert(err.message); } finally { setSaving(false); }
  };

  return (
    <div className="card">
      <div className="card__head">
        <div className="card__title">💬 คำพูดของลูก</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span className="card__label">{quotes.length} คำ</span>
          <button className="btn btn--ghost btn--sm" onClick={() => setAdding(a => !a)}>{adding ? 'ยกเลิก' : '+ เพิ่มคำพูด'}</button>
        </div>
      </div>

      {adding && (
        <form onSubmit={submit} className="card" style={{ background: 'var(--surface-2)', display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14 }}>
          <textarea className="input" value={form.quote} onChange={e => setForm(f => ({ ...f, quote: e.target.value }))}
            placeholder='เช่น "ป๊า...ทำไมพระอาทิตย์ไปนอนล่ะ?"' rows={2} autoFocus required style={{ resize: 'vertical' }} />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <select className="input" value={form.member_id} onChange={e => setForm(f => ({ ...f, member_id: e.target.value }))} style={{ flex: 1, minWidth: 120 }}>
              <option value="">ใครพูด</option>
              {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
            <input type="date" className="input" value={form.said_on} max={todayStr()}
              onChange={e => setForm(f => ({ ...f, said_on: e.target.value }))} style={{ flex: 1, minWidth: 140 }} />
            <button type="submit" disabled={saving} className="btn btn--primary" style={{ flexShrink: 0 }}>{saving ? '...' : 'บันทึก'}</button>
          </div>
        </form>
      )}

      {quotes.length === 0 && !adding ? (
        <div style={{ textAlign: 'center', color: 'var(--ink-3)', padding: '28px 0', fontSize: 13 }}>
          <div style={{ fontSize: 24, marginBottom: 8 }}>💬</div>
          จดคำน่ารักที่ลูกพูด — ของแบบนี้หายแล้วย้อนกลับไม่ได้
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
          {quotes.map(q => (
            <div key={q.id} style={{ background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 'var(--r-lg)', padding: '16px 18px', position: 'relative' }}>
              <div style={{ fontFamily: 'var(--f-display)', fontStyle: 'italic', fontSize: 15.5, lineHeight: 1.5, color: 'var(--ink)' }}>
                “{q.quote}”
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--hairline)' }}>
                <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--ink-3)' }}>
                  {q.member?.name ? `— ${q.member.name} · ` : ''}{new Date(q.said_on + 'T00:00:00').toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })}
                </div>
                <button onClick={() => { if (confirm('ลบคำพูดนี้?')) deleteQuote(q.id).then(onChange); }}
                  style={{ color: 'var(--ink-4)', fontSize: 13, padding: '2px 6px' }}>×</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export function Family() {
  const [members, setMembers] = useState([]);
  const [events, setEvents] = useState([]);
  const [notes, setNotes] = useState([]);
  const [onThisDay, setOnThisDay] = useState([]);
  const [quotes, setQuotes] = useState([]);
  const [loading, setLoading] = useState(true);

  const [showMemberModal, setShowMemberModal] = useState(false);
  const [editingMember, setEditingMember]     = useState(null);
  const [viewingMember, setViewingMember]     = useState(null);
  const [showEventModal, setShowEventModal]   = useState(false);
  const [viewingEvent, setViewingEvent]       = useState(null);
  const [showNoteDrawer, setShowNoteDrawer]   = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [m, e, n, otd, q] = await Promise.all([
        listMembers(),
        listEvents({ limit: 30, upcoming: false }),
        listFamilyNotes({ limit: 20 }),
        listOnThisDay().catch(() => []),
        listQuotes({ limit: 100 }).catch(() => []),
      ]);
      setMembers(m);
      setEvents(e);
      setNotes(n);
      setOnThisDay(otd);
      setQuotes(q);
    } catch (err) { console.error(err); } finally { setLoading(false); }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  // Separate upcoming and past events
  const today = todayStr();
  const upcomingEvents = events.filter(e => e.event_date >= today).sort((a, b) => a.event_date.localeCompare(b.event_date));
  const pastEvents = events.filter(e => e.event_date < today).sort((a, b) => b.event_date.localeCompare(a.event_date));

  // Birthdays this month
  const thisMonth = today.slice(5, 7);
  const birthdayMembers = members.filter(m => m.birth_date?.slice(5, 7) === thisMonth);

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300, color: 'var(--ink-3)' }}>
      กำลังโหลด...
    </div>
  );

  return (
    <>
      <PageHeader
        eyebrow={`ครอบครัว · ${members.length} คน`}
        title="ครอบครัว" em="ของเรา"
        sub="วันสำคัญ, การดูแล, และโน้ตเล็ก ๆ น้อย ๆ ของคนที่รัก — บันทึกทุกอย่างที่สำคัญ"
        meta={<><div>เหตุการณ์ที่กำลังมา</div><div className="page-header__meta-big">{upcomingEvents.length} อัน</div></>}
        actions={<>
          <button className="btn btn--ghost" onClick={() => setShowEventModal(true)}>
            <Icon name="calendar" size={14}/> เพิ่มเหตุการณ์
          </button>
          <button className="btn btn--primary" onClick={() => setShowMemberModal(true)}>
            <Icon name="plus" size={14}/> เพิ่มสมาชิก
          </button>
        </>}
      />

      <div className="page-body">
        {/* Quote hero */}
        <div className="card card--paper" style={{ marginBottom: 22, padding: 36 }}>
          <div className="row row--between" style={{ alignItems: 'flex-start' }}>
            <div style={{ maxWidth: 600 }}>
              <div className="card__label" style={{ color: 'var(--accent-strong)', marginBottom: 10 }}>แรงบันดาลใจ</div>
              <div style={{ fontFamily: 'var(--f-display)', fontStyle: 'italic', fontSize: 28, lineHeight: 1.4, color: 'var(--paper-ink)' }}>
                เงินที่หามาได้, การเรียนรู้, และ trade ที่ชนะ — ทั้งหมดมีค่าเพราะมีคนข้างหลังที่เรารัก
              </div>
            </div>
            <div style={{ display: 'flex', flexShrink: 0 }}>
              {members.slice(0, 5).map((m, i) => (
                <div key={m.id} style={{
                  marginLeft: i === 0 ? 0 : -14,
                  position: 'relative', zIndex: 5 - i,
                }}>
                  <Avatar member={m} size={56} borderColor="var(--paper)" />
                </div>
              ))}
            </div>
          </div>

          {/* Birthday reminder */}
          {birthdayMembers.length > 0 && (
            <div style={{ marginTop: 20, padding: '10px 14px', background: 'var(--accent-tint)', border: '1px solid var(--accent-soft)', borderRadius: 'var(--r-md)' }}>
              <span style={{ color: 'var(--accent-strong)', fontSize: 13 }}>🎂 วันเกิดเดือนนี้: </span>
              <span style={{ color: 'var(--paper-ink)', fontSize: 13, fontFamily: 'var(--f-display)' }}>
                {birthdayMembers.map(m => `${m.name} (${new Date(m.birth_date + 'T00:00:00').toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })})`).join(', ')}
              </span>
            </div>
          )}
        </div>

        {/* On This Day — memories from past years */}
        <OnThisDayCard events={onThisDay} onOpen={setViewingEvent} />

        <div className="grid-2" style={{ marginBottom: 22 }}>
          {/* Members */}
          <div className="card">
            <div className="card__head">
              <div className="card__title">สมาชิก</div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span className="card__label">{members.length} คน</span>
                <button className="btn btn--ghost btn--sm" onClick={() => setShowMemberModal(true)}>+ เพิ่ม</button>
              </div>
            </div>

            {members.length === 0 ? (
              <div style={{ textAlign: 'center', color: 'var(--ink-3)', padding: '24px 0', fontSize: 13 }}>
                ยังไม่มีสมาชิก — กด "+ เพิ่มสมาชิก" เพื่อเริ่ม
              </div>
            ) : (
              members.map(m => {
                const age = m.birth_date
                  ? Math.floor((Date.now() - new Date(m.birth_date)) / (365.25 * 86400000))
                  : null;
                const isBirthdayMonth = m.birth_date?.slice(5, 7) === thisMonth;
                return (
                  <div key={m.id} className="family-member"
                    onClick={() => setViewingMember(m)}
                    style={{ alignItems: 'center', cursor: 'pointer', transition: 'background 130ms', borderRadius: 'var(--radius-control)' }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface-muted)'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>
                    <Avatar member={m} size={48} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontFamily: 'var(--f-display)', fontSize: 16, color: 'var(--text-primary)' }}>
                        {m.name} {isBirthdayMonth && '🎂'}
                      </div>
                      <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10.5, color: 'var(--text-muted)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {m.role}{age != null ? ` · ${age} ปี` : ''}{m.note ? ` · ${m.note}` : ''}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 4 }} onClick={(e) => e.stopPropagation()}>
                      <button onClick={() => setEditingMember(m)} title="แก้ไข" aria-label="แก้ไข"
                        style={{ background: 'transparent', border: 0, color: 'var(--text-muted)', fontSize: 14, padding: '4px 6px', cursor: 'pointer', borderRadius: 6 }}
                        onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface-muted)'; e.currentTarget.style.color = 'var(--accent-strong)'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-muted)'; }}>
                        ✎
                      </button>
                      <button onClick={() => { if (confirm(`ลบ ${m.name} ออกจากครอบครัว?`)) { deleteMember(m.id).then(refresh); } }}
                        title="ลบ" aria-label="ลบ"
                        style={{ background: 'transparent', border: 0, color: 'var(--text-muted)', fontSize: 14, padding: '4px 6px', cursor: 'pointer', borderRadius: 6 }}
                        onMouseEnter={e => { e.currentTarget.style.background = 'var(--danger-soft)'; e.currentTarget.style.color = 'var(--danger)'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-muted)'; }}>
                        ×
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Upcoming events */}
          <div className="card">
            <div className="card__head">
              <div className="card__title">เหตุการณ์สำคัญ</div>
              <button className="btn btn--ghost btn--sm" onClick={() => setShowEventModal(true)}>+ เพิ่ม</button>
            </div>

            {upcomingEvents.length === 0 && pastEvents.length === 0 ? (
              <div style={{ textAlign: 'center', color: 'var(--ink-3)', padding: '24px 0', fontSize: 13 }}>
                ยังไม่มีเหตุการณ์ — เพิ่มวันเกิด, นัดสำคัญ, ทริปครอบครัว
              </div>
            ) : (
              <>
                {upcomingEvents.slice(0, 6).map(ev => {
                  const days = daysUntil(ev.event_date);
                  const member = ev.member || null;
                  const pics = eventPhotos(ev);
                  return (
                    <div key={ev.id} onClick={() => setViewingEvent(ev)}
                      style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--hairline)', cursor: 'pointer' }}>
                      {/* Day countdown badge */}
                      <div style={{
                        minWidth: 44, height: 44, borderRadius: 'var(--r-md)',
                        background: days === 0 ? 'var(--amber)' : days <= 3 ? 'var(--warning-soft)' : 'var(--surface-2)',
                        border: `1px solid ${days === 0 ? 'var(--amber)' : 'var(--line)'}`,
                        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                        fontFamily: 'var(--f-mono)',
                      }}>
                        {/* text-inverse flips correctly here since the badge bg is the accent/amber surface */}
                        <div style={{ fontSize: 9, color: days === 0 ? 'var(--text-inverse)' : 'var(--ink-3)', letterSpacing: '0.1em' }}>
                          {days === 0 ? 'วันนี้' : days === 1 ? 'พรุ่งนี้' : 'อีก'}
                        </div>
                        {days > 1 && <div style={{ fontSize: 16, fontWeight: 600, color: days <= 7 ? 'var(--amber)' : 'var(--ink)', lineHeight: 1 }}>{days}</div>}
                        {days > 1 && <div style={{ fontSize: 8, color: 'var(--ink-3)' }}>วัน</div>}
                      </div>
                      {pics.length > 0 && (
                        <div style={{ position: 'relative', flexShrink: 0 }}>
                          <img src={pics[0]} alt="" loading="lazy"
                            style={{ width: 44, height: 44, borderRadius: 'var(--r-md)', objectFit: 'cover', border: '1px solid var(--line)', display: 'block' }} />
                          {pics.length > 1 && (
                            <span style={{ position: 'absolute', bottom: -3, right: -3, background: 'var(--accent-strong)', color: 'var(--text-inverse)', borderRadius: 'var(--radius-pill)', fontFamily: 'var(--f-mono)', fontSize: 8.5, padding: '1px 5px' }}>📷{pics.length}</span>
                          )}
                        </div>
                      )}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13.5, color: 'var(--ink)', fontWeight: 500 }}>{ev.title}</div>
                        <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--ink-3)', marginTop: 2 }}>
                          {formatEventDate(ev.event_date)}
                          {member?.name ? ` · ${member.name}` : ''}
                          {ev.note ? ` · ${ev.note}` : ''}
                        </div>
                      </div>
                      <button onClick={(e) => { e.stopPropagation(); if (confirm('ลบเหตุการณ์นี้?')) { eventPhotos(ev).forEach(deleteEventPhotoByUrl); deleteEvent(ev.id).then(refresh); } }}
                        style={{ color: 'var(--ink-4)', fontSize: 13, padding: '4px 6px', flexShrink: 0 }}>×</button>
                    </div>
                  );
                })}

                {pastEvents.length > 0 && (
                  <details style={{ marginTop: 12 }}>
                    <summary style={{ fontSize: 12, color: 'var(--ink-4)', cursor: 'pointer', fontFamily: 'var(--f-mono)' }}>
                      เหตุการณ์ที่ผ่านมา ({pastEvents.length})
                    </summary>
                    {pastEvents.slice(0, 8).map(ev => {
                      const pics = eventPhotos(ev);
                      return (
                        <div key={ev.id} onClick={() => setViewingEvent(ev)}
                          style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'space-between', padding: '8px 0', opacity: 0.7, borderBottom: '1px solid var(--hairline)', cursor: 'pointer' }}>
                          {pics.length > 0 && (
                            <img src={pics[0]} alt="" loading="lazy"
                              style={{ width: 32, height: 32, borderRadius: 'var(--r-sm)', objectFit: 'cover', flexShrink: 0, border: '1px solid var(--line)' }} />
                          )}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 12.5 }}>{ev.title}{pics.length > 1 ? ` · 📷${pics.length}` : ''}</div>
                            <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--ink-3)' }}>{formatEventDate(ev.event_date)}</div>
                          </div>
                          <button onClick={(e) => { e.stopPropagation(); if (confirm('ลบ?')) { eventPhotos(ev).forEach(deleteEventPhotoByUrl); deleteEvent(ev.id).then(refresh); } }}
                            style={{ color: 'var(--ink-4)', fontSize: 13, padding: '2px 6px' }}>×</button>
                        </div>
                      );
                    })}
                  </details>
                )}
              </>
            )}
          </div>
        </div>

        {/* Family Notes board */}
        <div className="card">
          <div className="card__head">
            <div className="card__title">โน้ตครอบครัว</div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span className="card__label">{notes.length} โน้ต</span>
              <button className="btn btn--ghost btn--sm" onClick={() => setShowNoteDrawer(true)}>+ เขียนโน้ต</button>
            </div>
          </div>

          {notes.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--ink-3)', padding: '32px 0', fontSize: 13 }}>
              <div style={{ fontSize: 24, marginBottom: 10 }}>💌</div>
              ยังไม่มีโน้ต — เขียนอะไรบางอย่างให้คนที่รักอ่าน
              <br />
              <button className="btn btn--ghost" style={{ marginTop: 12 }} onClick={() => setShowNoteDrawer(true)}>+ เขียนโน้ตแรก</button>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>
              {notes.map(note => (
                <div key={note.id} style={{
                  background: 'var(--surface-2)', border: '1px solid var(--line)',
                  borderRadius: 'var(--r-lg)', padding: '18px 20px',
                  position: 'relative',
                }}>
                  {note.title && (
                    <div style={{ fontFamily: 'var(--f-display)', fontStyle: 'italic', fontSize: 15, color: 'var(--amber)', marginBottom: 8 }}>
                      {note.title}
                    </div>
                  )}
                  <div style={{ fontSize: 13.5, lineHeight: 1.65, color: 'var(--ink)', whiteSpace: 'pre-wrap' }}>
                    {note.body}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--hairline)' }}>
                    <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--ink-3)' }}>
                      {note.author ? `✍ ${note.author} · ` : ''}{new Date(note.created_at).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </div>
                    <button onClick={() => { if (confirm('ลบโน้ตนี้?')) { deleteFamilyNote(note.id).then(refresh); } }}
                      style={{ color: 'var(--ink-4)', fontSize: 13, padding: '2px 6px' }}>×</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Kid Quotes */}
        <div style={{ marginTop: 22 }}>
          <KidQuotesCard quotes={quotes} members={members} onChange={refresh} />
        </div>
      </div>

      {(showMemberModal || editingMember) && (
        <MemberModal
          initial={editingMember}
          onSave={refresh}
          onClose={() => { setShowMemberModal(false); setEditingMember(null); }}
        />
      )}
      {viewingMember && (
        <MemberDetail
          member={members.find(m => m.id === viewingMember.id) || viewingMember}
          onClose={() => setViewingMember(null)}
          onChange={refresh}
        />
      )}
      {showEventModal && <AddEventModal members={members} onSave={refresh} onClose={() => setShowEventModal(false)} />}
      {viewingEvent && <EventDetail event={viewingEvent} members={members} onChange={refresh} onClose={() => setViewingEvent(null)} />}
      {showNoteDrawer && <AddNoteDrawer onSave={refresh} onClose={() => setShowNoteDrawer(false)} />}
    </>
  );
}
