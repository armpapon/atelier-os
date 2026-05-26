import { useState, useEffect, useCallback } from 'react';
import { Icon } from '../components/Icon.jsx';
import { PageHeader } from '../components/PageHeader.jsx';
import {
  listEntries, listRecentDates, createEntry, toggleEntry, deleteEntry,
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
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    setSaving(true);
    try {
      await createEntry({ entry_date: date, bullet_type: type, text: text.trim(), tag: tag || null, done: false });
      onSave();
      setText('');
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

// ── Main Component ────────────────────────────────────────────────────────────
export function Journal() {
  const [date, setDate] = useState(todayStr());
  const [entries, setEntries] = useState([]);
  const [recentDates, setRecentDates] = useState([]);
  const [mood, setMood] = useState(null);
  const [habits, setHabits] = useState([]);
  const [habitLogs, setHabitLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddEntry, setShowAddEntry] = useState(false);
  const [showHabitModal, setShowHabitModal] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [e, rd, m, h, hl] = await Promise.all([
        listEntries({ date }),
        listRecentDates(14),
        getMoodForDate(date),
        listHabits(),
        getHabitLogsForDate(date),
      ]);
      setEntries(e); setRecentDates(rd); setMood(m); setHabits(h); setHabitLogs(hl);
    } catch (err) { console.error(err); } finally { setLoading(false); }
  }, [date]);

  useEffect(() => { refresh(); }, [refresh]);

  const handleToggle = async (id, done) => {
    await toggleEntry(id, !done);
    setEntries(prev => prev.map(e => e.id === id ? { ...e, done: !done } : e));
  };

  const handleDelete = async (id) => {
    if (!confirm('ลบรายการนี้?')) return;
    await deleteEntry(id);
    setEntries(prev => prev.filter(e => e.id !== id));
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
          <button className="btn btn--primary" onClick={() => setShowAddEntry(v => !v)}>
            <Icon name="plus" size={14}/> รายการใหม่
          </button>
        </>}
      />

      <div className="page-body">
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
                {entries.map(entry => (
                  <div key={entry.id} className={`bujo-line ${entry.done ? 'bujo-line--done' : ''}`}
                    style={{ cursor: 'pointer' }}
                    onDoubleClick={() => entry.bullet_type === 'task' && handleToggle(entry.id, entry.done)}>
                    <span className={`bujo-line__bullet bujo-line__bullet--${entry.done ? 'done' : entry.bullet_type}`} />
                    <span className="bujo-line__text">{entry.text}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      {entry.tag && <span className="bujo-line__tag">{entry.tag}</span>}
                      {entry.bullet_type === 'task' && (
                        <button onClick={() => handleToggle(entry.id, entry.done)}
                          title={entry.done ? 'ยกเลิก' : 'เสร็จแล้ว'}
                          style={{ opacity: 0.5, fontSize: 12, padding: '0 4px', color: '#5a4632', background: 'none', border: 'none', cursor: 'pointer' }}>
                          {entry.done ? '↩' : '✓'}
                        </button>
                      )}
                      <button onClick={() => handleDelete(entry.id)}
                        style={{ opacity: 0.4, fontSize: 14, padding: '0 4px', color: '#5a4632', background: 'none', border: 'none', cursor: 'pointer' }}>×</button>
                    </div>
                  </div>
                ))}

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
    </>
  );
}
