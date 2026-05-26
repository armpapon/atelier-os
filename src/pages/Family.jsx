import { useState, useEffect, useCallback } from 'react';
import { Icon } from '../components/Icon.jsx';
import { PageHeader } from '../components/PageHeader.jsx';
import {
  listMembers, createMember, deleteMember,
  listEvents, createEvent, deleteEvent,
  listFamilyNotes, createFamilyNote, deleteFamilyNote,
} from '../lib/api/family.js';

// ── Helpers ───────────────────────────────────────────────────────────────────
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

// ── Add Member Modal ──────────────────────────────────────────────────────────
function AddMemberModal({ onSave, onClose }) {
  const [form, setForm] = useState({ name: '', role: '', color: AVATAR_COLORS[0], birth_date: '', note: '' });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      await createMember({
        name: form.name.trim(),
        role: form.role.trim() || null,
        color: form.color,
        initial: getInitial(form.name),
        birth_date: form.birth_date || null,
        note: form.note.trim() || null,
      });
      onSave(); onClose();
    } catch (err) { alert(err.message); } finally { setSaving(false); }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)' }} />
      <form onSubmit={handleSubmit} style={{
        position: 'relative', background: 'var(--surface)', border: '1px solid var(--line)',
        borderRadius: 'var(--r-xl)', padding: 32, width: 380, display: 'flex', flexDirection: 'column', gap: 16,
      }}>
        <div style={{ fontFamily: 'var(--f-display)', fontSize: 20 }}>เพิ่มสมาชิก</div>

        {/* Preview avatar */}
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <div className="family-avatar" style={{ background: form.color, width: 64, height: 64, fontSize: 30 }}>
            {getInitial(form.name || '?')}
          </div>
        </div>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontFamily: 'var(--f-mono)', fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--ink-3)' }}>ชื่อ *</span>
          <input className="input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="ชื่อสมาชิก" autoFocus required />
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontFamily: 'var(--f-mono)', fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--ink-3)' }}>ความสัมพันธ์</span>
          <input className="input" value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))} placeholder="แม่, ภรรยา, ลูกสาว, ลูกชาย" />
        </label>

        {/* Color picker */}
        <div>
          <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--ink-3)', marginBottom: 8 }}>สี Avatar</div>
          <div style={{ display: 'flex', gap: 8 }}>
            {AVATAR_COLORS.map(c => (
              <button key={c} type="button" onClick={() => setForm(f => ({ ...f, color: c }))}
                style={{
                  width: 28, height: 28, borderRadius: '50%', background: c,
                  border: `3px solid ${form.color === c ? 'var(--ink)' : 'transparent'}`,
                  cursor: 'pointer',
                }} />
            ))}
          </div>
        </div>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontFamily: 'var(--f-mono)', fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--ink-3)' }}>วันเกิด</span>
          <input className="input" type="date" value={form.birth_date} onChange={e => setForm(f => ({ ...f, birth_date: e.target.value }))} />
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontFamily: 'var(--f-mono)', fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--ink-3)' }}>โน้ต (ไม่บังคับ)</span>
          <input className="input" value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} placeholder="ข้อมูลเพิ่มเติม" />
        </label>

        <div style={{ display: 'flex', gap: 10 }}>
          <button type="button" className="btn btn--ghost" onClick={onClose} style={{ flex: 1 }}>ยกเลิก</button>
          <button type="submit" disabled={saving} className="btn btn--primary" style={{ flex: 2 }}>{saving ? '...' : '+ เพิ่มสมาชิก'}</button>
        </div>
      </form>
    </div>
  );
}

// ── Add Event Modal ───────────────────────────────────────────────────────────
function AddEventModal({ members, onSave, onClose }) {
  const [form, setForm] = useState({ title: '', event_date: '', member_id: '', note: '' });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.title.trim() || !form.event_date) return;
    setSaving(true);
    try {
      await createEvent({
        title: form.title.trim(),
        event_date: form.event_date,
        member_id: form.member_id || null,
        note: form.note.trim() || null,
      });
      onSave(); onClose();
    } catch (err) { alert(err.message); } finally { setSaving(false); }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)' }} />
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
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)' }} />
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

// ── Main Component ────────────────────────────────────────────────────────────
export function Family() {
  const [members, setMembers] = useState([]);
  const [events, setEvents] = useState([]);
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);

  const [showMemberModal, setShowMemberModal] = useState(false);
  const [showEventModal, setShowEventModal] = useState(false);
  const [showNoteDrawer, setShowNoteDrawer] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [m, e, n] = await Promise.all([
        listMembers(),
        listEvents({ limit: 30, upcoming: false }),
        listFamilyNotes({ limit: 20 }),
      ]);
      setMembers(m);
      setEvents(e);
      setNotes(n);
    } catch (err) { console.error(err); } finally { setLoading(false); }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  // Separate upcoming and past events
  const today = new Date().toISOString().split('T')[0];
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
              <div className="card__label" style={{ color: '#8a6438', marginBottom: 10 }}>แรงบันดาลใจ</div>
              <div style={{ fontFamily: 'var(--f-display)', fontStyle: 'italic', fontSize: 28, lineHeight: 1.4, color: 'var(--paper-ink)' }}>
                เงินที่หามาได้, การเรียนรู้, และ trade ที่ชนะ — ทั้งหมดมีค่าเพราะมีคนข้างหลังที่เรารัก
              </div>
            </div>
            <div style={{ display: 'flex', flexShrink: 0 }}>
              {members.slice(0, 5).map((m, i) => (
                <div key={m.id} className="family-avatar" style={{
                  background: m.color || AVATAR_COLORS[i % AVATAR_COLORS.length],
                  marginLeft: i === 0 ? 0 : -12,
                  border: '3px solid var(--paper)',
                  position: 'relative', zIndex: 5 - i,
                  width: 52, height: 52, fontSize: 22,
                }}>{m.initial || getInitial(m.name)}</div>
              ))}
            </div>
          </div>

          {/* Birthday reminder */}
          {birthdayMembers.length > 0 && (
            <div style={{ marginTop: 20, padding: '10px 14px', background: 'rgba(212,165,116,0.15)', border: '1px solid rgba(212,165,116,0.3)', borderRadius: 'var(--r-md)' }}>
              <span style={{ color: '#8a6438', fontSize: 13 }}>🎂 วันเกิดเดือนนี้: </span>
              <span style={{ color: 'var(--paper-ink)', fontSize: 13, fontFamily: 'var(--f-display)' }}>
                {birthdayMembers.map(m => `${m.name} (${new Date(m.birth_date + 'T00:00:00').toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })})`).join(', ')}
              </span>
            </div>
          )}
        </div>

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
                  <div key={m.id} className="family-member">
                    <div className="family-avatar" style={{ background: m.color || 'var(--amber)', width: 44, height: 44, fontSize: 20 }}>
                      {m.initial || getInitial(m.name)}
                    </div>
                    <div>
                      <div style={{ fontFamily: 'var(--f-display)', fontSize: 16 }}>
                        {m.name} {isBirthdayMonth && '🎂'}
                      </div>
                      <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10.5, color: 'var(--ink-3)', marginTop: 2 }}>
                        {m.role}{age != null ? ` · ${age} ปี` : ''}{m.note ? ` · ${m.note}` : ''}
                      </div>
                    </div>
                    <button onClick={() => { if (confirm(`ลบ ${m.name} ออกจากครอบครัว?`)) { deleteMember(m.id).then(refresh); } }}
                      style={{ color: 'var(--ink-4)', fontSize: 13, padding: '4px 6px' }}>×</button>
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
                  return (
                    <div key={ev.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--line)' }}>
                      {/* Day countdown badge */}
                      <div style={{
                        minWidth: 44, height: 44, borderRadius: 'var(--r-md)',
                        background: days === 0 ? 'var(--amber)' : days <= 3 ? '#2a1f15' : 'var(--surface-2)',
                        border: `1px solid ${days === 0 ? 'var(--amber)' : 'var(--line)'}`,
                        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                        fontFamily: 'var(--f-mono)',
                      }}>
                        <div style={{ fontSize: 9, color: days === 0 ? '#1a1410' : 'var(--ink-3)', letterSpacing: '0.1em' }}>
                          {days === 0 ? 'วันนี้' : days === 1 ? 'พรุ่งนี้' : 'อีก'}
                        </div>
                        {days > 1 && <div style={{ fontSize: 16, fontWeight: 600, color: days <= 7 ? 'var(--amber)' : 'var(--ink)', lineHeight: 1 }}>{days}</div>}
                        {days > 1 && <div style={{ fontSize: 8, color: 'var(--ink-3)' }}>วัน</div>}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13.5, color: 'var(--ink)', fontWeight: 500 }}>{ev.title}</div>
                        <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--ink-3)', marginTop: 2 }}>
                          {formatEventDate(ev.event_date)}
                          {member?.name ? ` · ${member.name}` : ''}
                          {ev.note ? ` · ${ev.note}` : ''}
                        </div>
                      </div>
                      <button onClick={() => { if (confirm('ลบเหตุการณ์นี้?')) { deleteEvent(ev.id).then(refresh); } }}
                        style={{ color: 'var(--ink-4)', fontSize: 13, padding: '4px 6px', flexShrink: 0 }}>×</button>
                    </div>
                  );
                })}

                {pastEvents.length > 0 && (
                  <details style={{ marginTop: 12 }}>
                    <summary style={{ fontSize: 12, color: 'var(--ink-4)', cursor: 'pointer', fontFamily: 'var(--f-mono)' }}>
                      เหตุการณ์ที่ผ่านมา ({pastEvents.length})
                    </summary>
                    {pastEvents.slice(0, 5).map(ev => (
                      <div key={ev.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', opacity: 0.6, borderBottom: '1px solid var(--line)' }}>
                        <div>
                          <div style={{ fontSize: 12.5 }}>{ev.title}</div>
                          <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--ink-3)' }}>{formatEventDate(ev.event_date)}</div>
                        </div>
                        <button onClick={() => { if (confirm('ลบ?')) { deleteEvent(ev.id).then(refresh); } }}
                          style={{ color: 'var(--ink-4)', fontSize: 13, padding: '2px 6px' }}>×</button>
                      </div>
                    ))}
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
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--line)' }}>
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
      </div>

      {showMemberModal && <AddMemberModal onSave={refresh} onClose={() => setShowMemberModal(false)} />}
      {showEventModal && <AddEventModal members={members} onSave={refresh} onClose={() => setShowEventModal(false)} />}
      {showNoteDrawer && <AddNoteDrawer onSave={refresh} onClose={() => setShowNoteDrawer(false)} />}
    </>
  );
}
