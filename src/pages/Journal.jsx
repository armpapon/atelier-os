import { useState, useEffect, useCallback } from 'react';
import { Icon } from '../components/Icon.jsx';
import { PageHeader } from '../components/PageHeader.jsx';
import { DayCountdown } from '../components/DayCountdown.jsx';
import {
  listEntries, listRecentDates, listUpcomingEvents, listEntriesInRange,
  createEntry, bulkCreateEntries, toggleEntry, updateEntry, deleteEntry,
  getMoodForDate, upsertMood,
  listHabits, createHabit, deleteHabit,
  getHabitLogsForDate, toggleHabitLog,
} from '../lib/api/journal.js';

// ── Helpers ───────────────────────────────────────────────────────────────────
function todayStr() {
  return new Date().toISOString().split('T')[0];
}

function formatDateThai(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('th-TH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}

function formatDateShort(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('th-TH', { month: 'short', day: 'numeric' });
}

function weekday(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('th-TH', { weekday: 'short' });
}

function relativeDayLabel(dateStr) {
  const diffDays = Math.round(
    (new Date(dateStr + 'T00:00:00') - new Date(todayStr() + 'T00:00:00')) / 86400000
  );
  if (diffDays === 0) return 'วันนี้';
  if (diffDays === 1) return 'พรุ่งนี้';
  return `${formatDateShort(dateStr)} · ${weekday(dateStr)}`;
}

function pad2cal(n) { return String(n).padStart(2, '0'); }
function ymd(y, m, d) { return `${y}-${pad2cal(m + 1)}-${pad2cal(d)}`; }

const CAL_WEEKDAYS = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];

// ── Mini month calendar ─────────────────────────────────────────────────────
function MiniCalendar({ monthDate, selected, activity, onPick, onPrev, onNext }) {
  const y = monthDate.getFullYear();
  const m = monthDate.getMonth();
  const today = todayStr();
  const firstWeekday = new Date(y, m, 1).getDay();
  const daysInMonth = new Date(y, m + 1, 0).getDate();

  const cells = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const monthLabel = monthDate.toLocaleDateString('th-TH', { month: 'long', year: 'numeric' });

  return (
    <div className="card">
      <div className="card__head" style={{ marginBottom: 10 }}>
        <button onClick={onPrev} aria-label="เดือนก่อน"
          style={{ color: 'var(--ink-3)', fontSize: 16, padding: '2px 8px', cursor: 'pointer' }}>‹</button>
        <div className="card__title" style={{ fontSize: 14 }}>{monthLabel}</div>
        <button onClick={onNext} aria-label="เดือนถัดไป"
          style={{ color: 'var(--ink-3)', fontSize: 16, padding: '2px 8px', cursor: 'pointer' }}>›</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, marginBottom: 4 }}>
        {CAL_WEEKDAYS.map((w, i) => (
          <div key={i} style={{ textAlign: 'center', fontFamily: 'var(--f-mono)', fontSize: 9, color: 'var(--ink-4)', padding: '2px 0' }}>{w}</div>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
        {cells.map((d, i) => {
          if (d == null) return <div key={i} />;
          const ds = ymd(y, m, d);
          const act = activity.get(ds);
          const isSel = ds === selected;
          const isToday = ds === today;
          return (
            <button key={i} onClick={() => onPick(ds)}
              style={{
                position: 'relative', aspectRatio: '1', borderRadius: 'var(--r-sm)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: 'var(--f-mono)', fontSize: 11.5, cursor: 'pointer',
                background: isSel ? 'var(--amber)' : 'transparent',
                color: isSel ? '#1a1410' : (isToday ? 'var(--amber-deep)' : 'var(--ink-2)'),
                fontWeight: isToday || isSel ? 600 : 400,
                border: isToday && !isSel ? '1px solid var(--amber)' : '1px solid transparent',
              }}>
              {d}
              {act && (
                <span style={{
                  position: 'absolute', bottom: 3, left: '50%', transform: 'translateX(-50%)',
                  width: 4, height: 4, borderRadius: '50%',
                  background: isSel ? '#1a1410' : (act.hasEvent ? 'var(--amber-deep)' : 'var(--ink-4)'),
                }} />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function pad2(n) { return String(n).padStart(2, '0'); }

// Build a "https://calendar.google.com/.../render?action=TEMPLATE" link — opens
// Google Calendar's add-event dialog pre-filled, no OAuth needed.
function buildGCalUrl({ text, note, location, event_time, event_end_time }, date) {
  const ymd = date.replace(/-/g, '');
  let dates;
  if (event_time) {
    const start = event_time.slice(0, 5).replace(':', '');
    let end = event_end_time ? event_end_time.slice(0, 5).replace(':', '') : null;
    if (!end) {
      const [h, m] = event_time.slice(0, 5).split(':').map(Number);
      end = `${pad2((h + 1) % 24)}${pad2(m)}`;
    }
    dates = `${ymd}T${start}00/${ymd}T${end}00`;
  } else {
    const d = new Date(date + 'T00:00:00');
    const next = new Date(d);
    next.setDate(next.getDate() + 1);
    const nextYmd = `${next.getFullYear()}${pad2(next.getMonth() + 1)}${pad2(next.getDate())}`;
    dates = `${ymd}/${nextYmd}`;
  }
  const params = new URLSearchParams({
    action: 'TEMPLATE', text: text || '', dates,
    details: note || '', location: location || '', ctz: 'Asia/Bangkok',
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

// Parse pasted calendar/notes text into journal entries.
// Lines starting with a time (09:30 / 9.30 / 13:30 - 14:00) become timed events;
// the rest become tasks. Leading bullet/checkbox markers are stripped.
function parseScheduleText(text, date) {
  const out = [];
  for (const raw of (text || '').split('\n')) {
    // Strip leading noise (emoji, checkmarks, bullets, dashes, spaces) but keep
    // digits, letters (incl. Thai) and "[" so "[MKT] ..." survives.
    let s = raw.replace(/^[^\p{L}\p{N}[]+/u, '').trim();
    if (!s) continue;
    const m = s.match(/^(\d{1,2})[:.](\d{2})(?:\s*[-–—]\s*\d{1,2}[:.]\d{2})?\s*[:.-]?\s*(.*)$/);
    if (m && Number(m[1]) <= 23) {
      const hh = String(Number(m[1])).padStart(2, '0');
      out.push({ entry_date: date, bullet_type: 'event', text: (m[3].trim() || 'ประชุม'), tag: null, event_time: `${hh}:${m[2]}:00`, done: false });
    } else {
      out.push({ entry_date: date, bullet_type: 'task', text: s, tag: null, done: false });
    }
  }
  out.sort((a, b) => (a.event_time || '99').localeCompare(b.event_time || '99'));
  return out;
}

// ── Paste schedule modal ────────────────────────────────────────────────────
function PasteScheduleModal({ date, onSave, onClose }) {
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const parsed = parseScheduleText(text, date);
  const eventCount = parsed.filter(p => p.bullet_type === 'event').length;

  const submit = async () => {
    if (!parsed.length) return;
    setSaving(true);
    try { await bulkCreateEntries(parsed); onSave(); onClose(); }
    catch (err) { alert(err.message); } finally { setSaving(false); }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.55)' }} />
      <div style={{ position: 'relative', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--r-xl)', padding: 26, width: 520, maxWidth: '100%', maxHeight: '85vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <div style={{ fontFamily: 'var(--f-display)', fontSize: 20, fontWeight: 500 }}>วางตารางจาก Calendar</div>
          <div style={{ fontSize: 12.5, color: 'var(--ink-3)', marginTop: 4 }}>
            ก๊อปตารางประชุมทั้งวันจาก Google Calendar มาวาง — ระบบจะแยกเวลา เรียงลำดับ และทำเป็นรายการติ๊กได้ให้
          </div>
        </div>
        <textarea value={text} onChange={e => setText(e.target.value)} autoFocus rows={9}
          placeholder={'09:30 [MKT] รวม Report\n13:30 โปรที่ชอบ Update\n17:00 Meeting AE'}
          className="input" style={{ resize: 'vertical', fontFamily: 'var(--f-mono)', fontSize: 12.5, lineHeight: 1.6 }} />
        {parsed.length > 0 && (
          <div style={{ fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--ink-3)' }}>
            จะเพิ่ม {parsed.length} รายการ · มีเวลา {eventCount} · งาน {parsed.length - eventCount}
          </div>
        )}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button className="btn btn--ghost" onClick={onClose}>ยกเลิก</button>
          <button className="btn btn--primary" onClick={submit} disabled={saving || !parsed.length}>
            {saving ? '...' : `+ เพิ่ม ${parsed.length} รายการ`}
          </button>
        </div>
      </div>
    </div>
  );
}

const BULLET_TYPES = [
  { id: 'task',    label: 'งาน',     symbol: '·' },
  { id: 'event',   label: 'เหตุการณ์', symbol: '○' },
  { id: 'note',    label: 'โน้ต',    symbol: '—' },
  { id: 'star',    label: 'สำคัญ',   symbol: '★' },
  { id: 'migrate', label: 'โยก',     symbol: '›' },
];

const MOODS = [
  { value: 1, label: 'แย่มาก',  emoji: '😞', color: '#4a3a2e' },
  { value: 2, label: 'แย่',     emoji: '😕', color: '#6b5036' },
  { value: 3, label: 'เฉย ๆ',   emoji: '😐', color: '#9a7344' },
  { value: 4, label: 'ดี',      emoji: '😊', color: 'var(--amber)' },
  { value: 5, label: 'ดีมาก',  emoji: '😄', color: '#e8c08a' },
];

const TAGS = ['TRADE', 'LEARN', 'FAMILY', 'HEALTH', 'WORK', 'FINANCE'];

// ── Add Entry Form ────────────────────────────────────────────────────────────
function AddEntryForm({ date, onSave, onClose }) {
  const [type, setType] = useState('task');
  const [text, setText] = useState('');
  const [tag, setTag] = useState('');
  const [time, setTime] = useState('');
  const [location, setLocation] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    setSaving(true);
    try {
      await createEntry({
        entry_date: date, bullet_type: type, text: text.trim(), tag: tag || null, done: false,
        event_time: type === 'event' && time ? time : null,
        location: type === 'event' && location.trim() ? location.trim() : null,
      });
      onSave();
      setText(''); setTime(''); setLocation('');
    } catch (err) { alert(err.message); } finally { setSaving(false); }
  };

  return (
    <form onSubmit={handleSubmit} style={{
      background: 'rgba(138,100,56,0.08)', border: '1px solid rgba(138,100,56,0.25)',
      borderRadius: 'var(--r-md)', padding: '14px 18px',
      display: 'flex', flexDirection: 'column', gap: 10, marginTop: 16,
    }}>
      {/* Bullet type */}
      <div style={{ display: 'flex', gap: 6 }}>
        {BULLET_TYPES.map(b => (
          <button key={b.id} type="button" onClick={() => setType(b.id)}
            style={{
              padding: '3px 10px', borderRadius: 'var(--r-sm)', fontSize: 11,
              background: type === b.id ? 'var(--amber)' : 'transparent',
              color: type === b.id ? '#1a1410' : 'var(--paper-ink)',
              border: `1px solid ${type === b.id ? 'var(--amber)' : 'rgba(90,70,50,0.3)'}`,
              fontFamily: 'var(--f-mono)',
            }}>
            {b.symbol} {b.label}
          </button>
        ))}
      </div>

      {/* Event time + location */}
      {type === 'event' && (
        <div style={{ display: 'flex', gap: 10 }}>
          <input
            type="time" value={time} onChange={e => setTime(e.target.value)}
            style={{
              background: 'transparent', border: '1px solid rgba(90,70,50,0.3)', borderRadius: 'var(--r-sm)',
              padding: '4px 8px', fontSize: 12, fontFamily: 'var(--f-mono)', color: 'var(--paper-ink)',
            }}
          />
          <input
            type="text" value={location} onChange={e => setLocation(e.target.value)}
            placeholder="สถานที่ (ถ้ามี)"
            style={{
              flex: 1, background: 'transparent', border: '1px solid rgba(90,70,50,0.3)', borderRadius: 'var(--r-sm)',
              padding: '4px 8px', fontSize: 12, fontFamily: 'var(--f-display)', color: 'var(--paper-ink)',
            }}
          />
        </div>
      )}

      {/* Text */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
        <input
          autoFocus value={text} onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(e); } }}
          placeholder="บันทึกอะไรก็ได้..."
          style={{
            flex: 1, background: 'transparent', border: 'none',
            borderBottom: '1px solid rgba(90,70,50,0.4)',
            padding: '4px 0', fontSize: 14, fontFamily: 'var(--f-display)',
            color: 'var(--paper-ink)', outline: 'none',
          }}
        />
        <select value={tag} onChange={e => setTag(e.target.value)}
          style={{ background: 'transparent', border: '1px solid rgba(90,70,50,0.3)', borderRadius: 'var(--r-sm)', padding: '3px 6px', fontSize: 11, color: 'var(--paper-ink)', fontFamily: 'var(--f-mono)' }}>
          <option value="">แท็ก</option>
          {TAGS.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        {onClose && <button type="button" onClick={onClose}
          style={{ fontSize: 12, color: '#8a6438', padding: '3px 8px' }}>ยกเลิก</button>}
        <button type="submit" disabled={saving || !text.trim()}
          style={{ background: 'var(--amber-deep)', color: 'var(--paper)', border: 'none', borderRadius: 'var(--r-sm)', padding: '5px 14px', fontSize: 12, fontWeight: 500 }}>
          {saving ? '...' : '+ เพิ่ม'}
        </button>
      </div>
    </form>
  );
}

// ── Add Habit Modal ───────────────────────────────────────────────────────────
function HabitModal({ onSave, onClose }) {
  const [name, setName] = useState('');
  const [target, setTarget] = useState('7');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      await createHabit({ name: name.trim(), target_per_week: Number(target) || 7 });
      onSave(); onClose();
    } catch (err) { alert(err.message); } finally { setSaving(false); }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)' }} />
      <form onSubmit={handleSubmit} style={{
        position: 'relative', background: 'var(--surface)', border: '1px solid var(--line)',
        borderRadius: 'var(--r-xl)', padding: 32, width: 340, display: 'flex', flexDirection: 'column', gap: 16,
      }}>
        <div style={{ fontFamily: 'var(--f-display)', fontSize: 20 }}>เพิ่ม Habit</div>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontFamily: 'var(--f-mono)', fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--ink-3)' }}>ชื่อ Habit</span>
          <input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="เช่น ออกกำลังกาย, อ่านหนังสือ" autoFocus required />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontFamily: 'var(--f-mono)', fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--ink-3)' }}>เป้าหมาย/สัปดาห์</span>
          <select className="input" value={target} onChange={e => setTarget(e.target.value)}>
            {[1,2,3,4,5,6,7].map(n => <option key={n} value={n}>{n} ครั้ง/สัปดาห์</option>)}
          </select>
        </label>
        <div style={{ display: 'flex', gap: 10 }}>
          <button type="button" className="btn btn--ghost" onClick={onClose} style={{ flex: 1 }}>ยกเลิก</button>
          <button type="submit" disabled={saving} className="btn btn--primary" style={{ flex: 2 }}>{saving ? '...' : 'เพิ่ม'}</button>
        </div>
      </form>
    </div>
  );
}

// ── Entry Details (note + event time/location + Google Calendar) ───────────────
function EntryDetails({ entry, date, onUpdate }) {
  const [note, setNote] = useState(entry.note || '');
  const [time, setTime] = useState(entry.event_time ? entry.event_time.slice(0, 5) : '');
  const [endTime, setEndTime] = useState(entry.event_end_time ? entry.event_end_time.slice(0, 5) : '');
  const [location, setLocation] = useState(entry.location || '');

  useEffect(() => {
    setNote(entry.note || '');
    setTime(entry.event_time ? entry.event_time.slice(0, 5) : '');
    setEndTime(entry.event_end_time ? entry.event_end_time.slice(0, 5) : '');
    setLocation(entry.location || '');
  }, [entry.id, entry.note, entry.event_time, entry.event_end_time, entry.location]);

  const isEvent = entry.bullet_type === 'event';
  const fieldStyle = {
    fontFamily: 'var(--f-mono)', fontSize: 12, padding: '4px 8px',
    border: '1px solid rgba(90,70,50,0.3)', borderRadius: 'var(--r-sm)',
    background: 'rgba(255,255,255,0.4)', color: 'var(--paper-ink)', outline: 'none',
  };
  const labelStyle = {
    display: 'flex', flexDirection: 'column', gap: 3, fontSize: 10,
    letterSpacing: '0.1em', textTransform: 'uppercase', color: '#8a7060', fontFamily: 'var(--f-mono)',
  };

  return (
    <div style={{ padding: '8px 0 14px 32px', display: 'flex', flexDirection: 'column', gap: 8 }}>
      {isEvent && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <label style={labelStyle}>
            <span>เวลาเริ่ม</span>
            <input type="time" value={time} style={fieldStyle}
              onChange={e => setTime(e.target.value)}
              onBlur={() => onUpdate(entry.id, { event_time: time || null })} />
          </label>
          <label style={labelStyle}>
            <span>เวลาจบ</span>
            <input type="time" value={endTime} style={fieldStyle}
              onChange={e => setEndTime(e.target.value)}
              onBlur={() => onUpdate(entry.id, { event_end_time: endTime || null })} />
          </label>
          <label style={{ ...labelStyle, flex: 1, minWidth: 160 }}>
            <span>สถานที่</span>
            <input type="text" value={location} placeholder="ที่ไหน?" style={fieldStyle}
              onChange={e => setLocation(e.target.value)}
              onBlur={() => onUpdate(entry.id, { location: location.trim() || null })} />
          </label>
        </div>
      )}
      <textarea
        value={note} rows={3} placeholder="รายละเอียดเพิ่มเติม..."
        onChange={e => setNote(e.target.value)}
        onBlur={() => onUpdate(entry.id, { note: note.trim() || null })}
        style={{
          fontFamily: 'var(--f-body)', fontSize: 13, padding: '8px 10px', resize: 'vertical',
          border: '1px solid rgba(90,70,50,0.25)', borderRadius: 'var(--r-sm)',
          background: 'rgba(255,255,255,0.35)', color: 'var(--paper-ink)', outline: 'none',
        }}
      />
      {isEvent && (
        <a href={buildGCalUrl({ text: entry.text, note, location, event_time: time, event_end_time: endTime }, date)}
          target="_blank" rel="noopener noreferrer"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, alignSelf: 'flex-start',
            fontFamily: 'var(--f-mono)', fontSize: 11, letterSpacing: '0.06em',
            color: 'var(--amber-deep)', textDecoration: 'none',
            border: '1px solid rgba(138,100,56,0.35)', borderRadius: 'var(--r-sm)',
            padding: '5px 10px', background: 'rgba(138,100,56,0.08)',
          }}>
          <Icon name="calendar" size={13} /> เพิ่มลง Google Calendar
        </a>
      )}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export function Journal() {
  const [date, setDate] = useState(todayStr());
  const [entries, setEntries] = useState([]);
  const [recentDates, setRecentDates] = useState([]);
  const [mood, setMood] = useState(null);
  const [habits, setHabits] = useState([]);
  const [habitLogs, setHabitLogs] = useState([]);
  const [upcoming, setUpcoming] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddEntry, setShowAddEntry] = useState(false);
  const [showHabitModal, setShowHabitModal] = useState(false);
  const [showPaste, setShowPaste] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const [calMonth, setCalMonth] = useState(() => { const d = new Date(todayStr() + 'T00:00:00'); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [monthActivity, setMonthActivity] = useState(new Map());

  const refresh = useCallback(async () => {
    try {
      const [e, rd, m, h, hl, up] = await Promise.all([
        listEntries({ date }),
        listRecentDates(14),
        getMoodForDate(date),
        listHabits(),
        getHabitLogsForDate(date),
        listUpcomingEvents(),
      ]);
      setEntries(e); setRecentDates(rd); setMood(m); setHabits(h); setHabitLogs(hl); setUpcoming(up);
    } catch (err) { console.error(err); } finally { setLoading(false); }
  }, [date]);

  useEffect(() => { refresh(); }, [refresh]);

  // Load per-day activity for the visible calendar month (refetch when month
  // changes, or after the selected date changes so new entries show as dots).
  const loadMonth = useCallback(async () => {
    try {
      const y = calMonth.getFullYear(), mo = calMonth.getMonth();
      const start = ymd(y, mo, 1);
      const end = ymd(y, mo, new Date(y, mo + 1, 0).getDate());
      const rows = await listEntriesInRange({ start, end });
      const map = new Map();
      for (const r of rows) {
        const cur = map.get(r.entry_date) || { count: 0, hasEvent: false };
        cur.count += 1;
        if (r.bullet_type === 'event' && r.event_time) cur.hasEvent = true;
        map.set(r.entry_date, cur);
      }
      setMonthActivity(map);
    } catch (err) { console.error(err); }
  }, [calMonth, date]);

  useEffect(() => { loadMonth(); }, [loadMonth]);

  // Keep the calendar on the selected date's month when the date jumps months.
  useEffect(() => {
    const d = new Date(date + 'T00:00:00');
    if (d.getFullYear() !== calMonth.getFullYear() || d.getMonth() !== calMonth.getMonth()) {
      setCalMonth(new Date(d.getFullYear(), d.getMonth(), 1));
    }
  }, [date]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleToggle = async (id, done) => {
    await toggleEntry(id, !done);
    setEntries(prev => prev.map(e => e.id === id ? { ...e, done: !done } : e));
  };

  const handleDelete = async (id) => {
    if (!confirm('ลบรายการนี้?')) return;
    await deleteEntry(id);
    setEntries(prev => prev.filter(e => e.id !== id));
  };

  const handleEntryUpdate = async (id, patch) => {
    const updated = await updateEntry(id, patch);
    setEntries(prev => prev.map(e => e.id === id ? updated : e));
  };

  const handleMood = async (value) => {
    const updated = await upsertMood({ mood_date: date, value, note: null });
    setMood(updated);
  };

  const handleHabitToggle = async (habitId) => {
    const isLogged = habitLogs.some(l => l.habit_id === habitId && l.completed);
    await toggleHabitLog(habitId, date, !isLogged);
    const updated = await getHabitLogsForDate(date);
    setHabitLogs(updated);
  };

  const dateLabel = formatDateThai(date);
  const today = todayStr();
  const isToday = date === today;

  // Merge today into recentDates if not already
  const allDates = recentDates.includes(today) ? recentDates : [today, ...recentDates];

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300, color: 'var(--ink-3)' }}>
      กำลังโหลด...
    </div>
  );

  return (
    <>
      <PageHeader
        eyebrow="Bullet Journal · บันทึกชีวิตรายวัน"
        title="Daily" em="Journal"
        sub="rapid logging — บุลเล็ตเดียวเล่าเรื่องหนึ่งได้ · กด + เพื่อเพิ่มรายการใหม่"
        meta={<>
          <div>วันนี้</div>
          <div className="page-header__meta-big">
            {new Date().toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })}
          </div>
        </>}
        actions={<>
          <button className="btn btn--ghost" onClick={() => setShowHabitModal(true)}>+ Habit</button>
          <button className="btn btn--ghost" onClick={() => setShowPaste(true)}>📋 วางตาราง</button>
          <button className="btn btn--primary" onClick={() => setShowAddEntry(v => !v)}>
            <Icon name="plus" size={14}/> รายการใหม่
          </button>
        </>}
      />

      <div className="page-body">
        {/* Daily time countdown — feel the value of each day */}
        {isToday && <DayCountdown />}

        {/* Date navigator */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 22, overflowX: 'auto', paddingBottom: 4 }}>
          {allDates.slice(0, 14).map(d => (
            <button key={d} onClick={() => setDate(d)}
              style={{
                flexShrink: 0, padding: '6px 12px', borderRadius: 'var(--r-md)',
                background: d === date ? 'var(--amber)' : 'var(--surface)',
                color: d === date ? '#1a1410' : 'var(--ink-2)',
                border: `1px solid ${d === date ? 'var(--amber)' : 'var(--line)'}`,
                fontFamily: 'var(--f-mono)', fontSize: 11, whiteSpace: 'nowrap',
              }}>
              {d === today ? 'วันนี้' : formatDateShort(d)}
            </button>
          ))}
          {/* Jump to date */}
          <input type="date" value={date} onChange={e => setDate(e.target.value)}
            style={{
              padding: '6px 10px', borderRadius: 'var(--r-md)', background: 'var(--surface)',
              border: '1px solid var(--line)', color: 'var(--ink-2)', fontFamily: 'var(--f-mono)', fontSize: 11,
            }} />
        </div>

        <div className="bujo-grid">
          {/* Left: Bullet journal page */}
          <div className="bujo-page">
            <div className="bujo-page__date">
              <div>
                <div className="bujo-page__day">{dateLabel.split(' ')[0]} {new Date(date + 'T00:00:00').getDate()} {dateLabel.split(' ').slice(2).join(' ')}</div>
                <div style={{ fontFamily: 'var(--f-display)', fontStyle: 'italic', fontSize: 16, color: '#5a4632', marginTop: 2 }}>
                  {dateLabel}
                </div>
              </div>
              <div className="bujo-page__day-of-week">{weekday(date)}</div>
            </div>

            {/* Add entry form */}
            {showAddEntry && (
              <AddEntryForm
                date={date}
                onSave={() => { refresh(); }}
                onClose={() => setShowAddEntry(false)}
              />
            )}

            {/* Entries */}
            {entries.length === 0 && !showAddEntry ? (
              <div style={{ textAlign: 'center', color: '#8a7060', padding: '32px 0', fontFamily: 'var(--f-display)', fontStyle: 'italic', fontSize: 15 }}>
                {isToday ? 'วันนี้ยังว่างอยู่ — เริ่มบันทึกได้เลย' : 'ไม่มีรายการในวันนี้'}
                <br />
                <button onClick={() => setShowAddEntry(true)}
                  style={{ marginTop: 12, background: 'rgba(138,100,56,0.15)', border: '1px solid rgba(138,100,56,0.3)', borderRadius: 'var(--r-md)', padding: '7px 16px', color: 'var(--amber-deep)', cursor: 'pointer', fontSize: 13 }}>
                  + เพิ่มรายการ
                </button>
              </div>
            ) : (
              <div style={{ marginTop: showAddEntry ? 8 : 0 }}>
                {entries.map(entry => {
                  const isExpanded = expandedId === entry.id;
                  const hasDetails = !!(entry.note || entry.location || entry.event_time);
                  return (
                    <div key={entry.id}>
                      <div className={`bujo-line ${entry.done ? 'bujo-line--done' : ''}`}
                        style={{ cursor: 'pointer' }}
                        onDoubleClick={() => entry.bullet_type === 'task' && handleToggle(entry.id, entry.done)}>
                        <span className={`bujo-line__bullet bujo-line__bullet--${entry.done ? 'done' : entry.bullet_type}`} />
                        <span className="bujo-line__text">{entry.text}</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          {entry.event_time && <span className="bujo-line__tag">{entry.event_time.slice(0, 5)}</span>}
                          {entry.tag && <span className="bujo-line__tag">{entry.tag}</span>}
                          {entry.bullet_type === 'task' && (
                            <button onClick={() => handleToggle(entry.id, entry.done)}
                              title={entry.done ? 'ยกเลิก' : 'เสร็จแล้ว'}
                              style={{ opacity: 0.5, fontSize: 12, padding: '0 4px', color: '#5a4632', background: 'none', border: 'none', cursor: 'pointer' }}>
                              {entry.done ? '↩' : '✓'}
                            </button>
                          )}
                          <button onClick={() => setExpandedId(isExpanded ? null : entry.id)}
                            title="รายละเอียด"
                            style={{ opacity: hasDetails ? 0.8 : 0.35, padding: '0 4px', color: '#5a4632', background: 'none', border: 'none', cursor: 'pointer', display: 'inline-flex' }}>
                            <span style={{ display: 'inline-flex', transform: isExpanded ? 'rotate(90deg)' : 'none', transition: 'transform 150ms' }}>
                              <Icon name="chevron" size={12} />
                            </span>
                          </button>
                          <button onClick={() => handleDelete(entry.id)}
                            style={{ opacity: 0.4, fontSize: 14, padding: '0 4px', color: '#5a4632', background: 'none', border: 'none', cursor: 'pointer' }}>×</button>
                        </div>
                      </div>
                      {isExpanded && <EntryDetails entry={entry} date={date} onUpdate={handleEntryUpdate} />}
                    </div>
                  );
                })}

                {!showAddEntry && (
                  <button onClick={() => setShowAddEntry(true)}
                    style={{ marginTop: 12, background: 'transparent', border: '1px dashed rgba(90,70,50,0.35)', borderRadius: 'var(--r-sm)', padding: '6px 14px', color: '#8a6438', cursor: 'pointer', fontSize: 12, width: '100%', fontFamily: 'var(--f-display)', fontStyle: 'italic' }}>
                    + เพิ่มรายการ
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Right: side panels */}
          <div className="bujo-side">
            {/* Mini calendar */}
            <MiniCalendar
              monthDate={calMonth}
              selected={date}
              activity={monthActivity}
              onPick={setDate}
              onPrev={() => setCalMonth(c => new Date(c.getFullYear(), c.getMonth() - 1, 1))}
              onNext={() => setCalMonth(c => new Date(c.getFullYear(), c.getMonth() + 1, 1))}
            />

            {/* Upcoming events */}
            <div className="card">
              <div className="card__head">
                <div className="card__title">นัดที่จะถึง</div>
              </div>
              {upcoming.length === 0 ? (
                <div style={{ textAlign: 'center', color: 'var(--ink-3)', padding: '16px 0', fontSize: 12 }}>
                  ไม่มีนัดใน 14 วันข้างหน้า
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {upcoming.map(ev => (
                    <button key={ev.id} onClick={() => setDate(ev.entry_date)}
                      style={{
                        display: 'flex', flexDirection: 'column', gap: 2, textAlign: 'left',
                        padding: '8px 10px', borderRadius: 'var(--r-sm)', cursor: 'pointer',
                        border: `1px solid ${ev.entry_date === date ? 'var(--amber)' : 'var(--line)'}`,
                        background: 'var(--surface-2)',
                      }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--ink-3)' }}>
                        <span>{relativeDayLabel(ev.entry_date)}</span>
                        <span>{ev.event_time.slice(0, 5)}</span>
                      </div>
                      <div style={{ fontSize: 13, color: 'var(--ink)' }}>{ev.text}</div>
                      {ev.location && (
                        <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>📍 {ev.location}</div>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Mood */}
            <div className="card">
              <div className="card__head">
                <div className="card__title">อารมณ์วันนี้</div>
                {mood && <span style={{ fontSize: 20 }}>{MOODS.find(m => m.value === mood.value)?.emoji}</span>}
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between' }}>
                {MOODS.map(m => (
                  <button key={m.value} onClick={() => handleMood(m.value)}
                    style={{
                      flex: 1, aspectRatio: '1', borderRadius: 'var(--r-md)', fontSize: 22,
                      background: mood?.value === m.value ? m.color : 'var(--surface-2)',
                      border: `2px solid ${mood?.value === m.value ? m.color : 'var(--line)'}`,
                      transition: 'all 150ms', cursor: 'pointer',
                    }} title={m.label}>
                    {m.emoji}
                  </button>
                ))}
              </div>
              {mood && <div style={{ marginTop: 10, fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--ink-3)', textAlign: 'center' }}>
                {MOODS.find(m => m.value === mood.value)?.label}
              </div>}
            </div>

            {/* Habits */}
            <div className="card">
              <div className="card__head">
                <div className="card__title">Habits</div>
                <button className="btn btn--ghost btn--sm" onClick={() => setShowHabitModal(true)}>+ เพิ่ม</button>
              </div>
              {habits.length === 0 ? (
                <div style={{ textAlign: 'center', color: 'var(--ink-3)', padding: '16px 0', fontSize: 12 }}>
                  ยังไม่มี Habit — กด "+ เพิ่ม" เพื่อตั้งค่า
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {habits.map(h => {
                    const done = habitLogs.some(l => l.habit_id === h.id && l.completed);
                    return (
                      <div key={h.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--line)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <button onClick={() => handleHabitToggle(h.id)}
                            style={{
                              width: 22, height: 22, borderRadius: 4,
                              background: done ? 'var(--amber)' : 'var(--surface-2)',
                              border: `1.5px solid ${done ? 'var(--amber)' : 'var(--line)'}`,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontSize: 12, cursor: 'pointer',
                            }}>
                            {done ? '✓' : ''}
                          </button>
                          <span style={{ fontSize: 13, color: done ? 'var(--ink-3)' : 'var(--ink)', textDecoration: done ? 'line-through' : 'none' }}>
                            {h.name}
                          </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--ink-4)' }}>{h.target_per_week}×/wk</span>
                          <button onClick={() => { if (confirm('ลบ Habit นี้?')) { deleteHabit(h.id).then(refresh); } }}
                            style={{ color: 'var(--ink-4)', fontSize: 12, padding: '2px 4px' }}>×</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Stats for today */}
            <div className="card">
              <div className="card__head">
                <div className="card__title">สรุปวัน</div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="stat">
                  <div className="stat__label">รายการทั้งหมด</div>
                  <div className="stat__value" style={{ fontSize: 22 }}>{entries.length}</div>
                </div>
                <div className="stat">
                  <div className="stat__label">งานเสร็จ</div>
                  <div className="stat__value" style={{ fontSize: 22, color: 'var(--profit)' }}>
                    {entries.filter(e => e.done).length}
                  </div>
                </div>
                <div className="stat">
                  <div className="stat__label">Habits ทำ</div>
                  <div className="stat__value" style={{ fontSize: 22 }}>
                    {habitLogs.filter(l => l.completed).length}/{habits.length}
                  </div>
                </div>
                <div className="stat">
                  <div className="stat__label">Mood</div>
                  <div className="stat__value" style={{ fontSize: 22 }}>
                    {mood ? MOODS.find(m => m.value === mood.value)?.emoji : '—'}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {showHabitModal && <HabitModal onSave={refresh} onClose={() => setShowHabitModal(false)} />}
      {showPaste && <PasteScheduleModal date={date} onSave={refresh} onClose={() => setShowPaste(false)} />}
    </>
  );
}
