import { useState } from 'react';

const CATEGORY_META = {
  finance:  { color: '#5fb878', icon: '💰', label: 'การเงิน'  },
  health:   { color: '#e0708f', icon: '💪', label: 'สุขภาพ'   },
  learning: { color: '#7aa4f0', icon: '📚', label: 'การเรียน' },
  family:   { color: '#c084f5', icon: '❤️', label: 'ครอบครัว' },
  trading:  { color: '#d9a14f', icon: '📈', label: 'Trading'  },
  general:  { color: '#d4a574', icon: '◎',  label: 'ทั่วไป'   },
};

// ════════════════════════════════════════════════════════════════════════════
//  1. MANIFEST CARD
// ════════════════════════════════════════════════════════════════════════════
export function ManifestCard({ manifest, onSave }) {
  const [editing, setEditing] = useState(false);
  const [statement, setStatement] = useState(manifest?.statement || '');
  const [valuesText, setValuesText] = useState((manifest?.values || []).join(' · '));

  const save = async () => {
    const values = valuesText.split(/[·,|;]/).map(s => s.trim()).filter(Boolean);
    await onSave({ statement: statement.trim(), values });
    setEditing(false);
  };

  const cancel = () => {
    setStatement(manifest?.statement || '');
    setValuesText((manifest?.values || []).join(' · '));
    setEditing(false);
  };

  const isEmpty = !manifest?.statement && !(manifest?.values || []).length;

  return (
    <div style={{
      background: 'var(--paper)',
      border: '1px solid var(--paper-2)', borderRadius: 'var(--r-lg)',
      padding: '24px 28px', position: 'relative',
      color: 'var(--paper-ink)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
        <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--amber-deep)', letterSpacing: '0.22em' }}>
          ⌘ MANIFEST · NORTH STAR
        </div>
        {!editing && (
          <button onClick={() => setEditing(true)}
            style={{ background: 'transparent', border: 0, color: 'var(--ink-3)', cursor: 'pointer', fontSize: 12 }}>
            ✎ แก้ไข
          </button>
        )}
      </div>

      {editing ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <textarea value={statement} onChange={e => setStatement(e.target.value)}
            rows={2} placeholder='เช่น "ค่อย ๆ ทำทีละอย่าง · สมาธิคือทรัพย์สิน · ครอบครัวก่อนเสมอ"'
            style={{
              background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 'var(--r-sm)',
              padding: '12px 14px', color: 'var(--ink)', fontFamily: 'var(--f-display)',
              fontStyle: 'italic', fontSize: 18, lineHeight: 1.5, resize: 'vertical',
            }} />
          <input type="text" value={valuesText} onChange={e => setValuesText(e.target.value)}
            placeholder="ค่านิยม (คั่นด้วย · เช่น focus · family · patience)"
            style={{
              background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 'var(--r-sm)',
              padding: '10px 14px', color: 'var(--ink-2)', fontFamily: 'var(--f-mono)', fontSize: 12,
            }} />
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button onClick={cancel} className="btn btn--ghost btn--sm">ยกเลิก</button>
            <button onClick={save} className="btn btn--primary btn--sm">💾 บันทึก</button>
          </div>
        </div>
      ) : isEmpty ? (
        <div style={{ color: 'var(--ink-3)', fontSize: 13, fontStyle: 'italic', padding: '12px 0' }}>
          ยังไม่ได้เขียน manifest — กด <strong style={{ color: 'var(--amber)' }}>✎ แก้ไข</strong> เพื่อเริ่มเขียน north star ของคุณ
        </div>
      ) : (
        <>
          {manifest?.statement && (
            <div style={{
              fontFamily: 'var(--f-display)', fontStyle: 'italic',
              fontSize: 22, color: 'var(--ink)', lineHeight: 1.45,
              letterSpacing: '0.005em',
            }}>
              "{manifest.statement}"
            </div>
          )}
          {(manifest?.values || []).length > 0 && (
            <div style={{ marginTop: 16, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {manifest.values.map(v => (
                <span key={v} style={{
                  padding: '4px 11px', borderRadius: 99,
                  background: 'rgba(212, 165, 116, 0.1)', border: '1px solid rgba(212, 165, 116, 0.3)',
                  color: 'var(--amber)', fontFamily: 'var(--f-mono)', fontSize: 10.5, letterSpacing: '0.08em',
                }}>{v}</span>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
//  2. THEMES CARD (Year · Quarter · Week)
// ════════════════════════════════════════════════════════════════════════════
function getCurrentLabels() {
  const now = new Date();
  const y = now.getFullYear() + 543;
  const q = Math.floor(now.getMonth() / 3) + 1;
  const oneJan = new Date(now.getFullYear(), 0, 1);
  const week = Math.ceil((((now - oneJan) / 86400000) + oneJan.getDay() + 1) / 7);
  return {
    year_label: String(y),
    quarter_label: `Q${q} ${y}`,
    week_label: `WK${week}`,
  };
}

export function ThemesCard({ themes, onSave }) {
  const [editing, setEditing] = useState(false);
  const labels = getCurrentLabels();
  const [form, setForm] = useState({
    year_theme:    themes?.year_theme    || '',
    quarter_theme: themes?.quarter_theme || '',
    week_theme:    themes?.week_theme    || '',
  });

  const save = async () => {
    await onSave({ ...form, ...labels });
    setEditing(false);
  };

  const rows = [
    { key: 'year_theme',    label: 'ปี ' + labels.year_label,        value: themes?.year_theme,    placeholder: 'เช่น "ปีแห่งการสร้างระบบ"' },
    { key: 'quarter_theme', label: labels.quarter_label,              value: themes?.quarter_theme, placeholder: 'เช่น "Optimize before scale"' },
    { key: 'week_theme',    label: 'สัปดาห์ ' + labels.week_label,    value: themes?.week_theme,    placeholder: 'เช่น "เปิด Atelier OS ให้ใช้งานจริง"' },
  ];

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--r-lg)', padding: '20px 22px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 14 }}>
        <div>
          <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--ink-3)', letterSpacing: '0.18em' }}>
            ☉ COMPASS · THEMES
          </div>
          <div style={{ fontFamily: 'var(--f-display)', fontSize: 15, color: 'var(--ink)', marginTop: 3 }}>
            ทิศทางของช่วงเวลานี้
          </div>
        </div>
        {!editing && (
          <button onClick={() => setEditing(true)} style={{ background: 'transparent', border: 0, color: 'var(--ink-3)', cursor: 'pointer', fontSize: 12 }}>
            ✎ แก้ไข
          </button>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {rows.map(r => (
          <div key={r.key} style={{
            display: 'grid', gridTemplateColumns: '120px 1fr', gap: 12,
            padding: '10px 0', borderBottom: '1px solid var(--line)', alignItems: 'center',
          }}>
            <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--ink-3)', letterSpacing: '0.12em' }}>
              {r.label}
            </div>
            {editing ? (
              <input type="text" value={form[r.key]} onChange={e => setForm({ ...form, [r.key]: e.target.value })}
                placeholder={r.placeholder}
                style={{
                  background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 4,
                  padding: '6px 10px', color: 'var(--ink)', fontFamily: 'var(--f-display)', fontStyle: 'italic', fontSize: 14,
                }} />
            ) : r.value ? (
              <div style={{ fontFamily: 'var(--f-display)', fontStyle: 'italic', fontSize: 15, color: 'var(--ink)' }}>
                "{r.value}"
              </div>
            ) : (
              <div style={{ color: 'var(--ink-4)', fontSize: 12, fontStyle: 'italic' }}>
                — ยังไม่ตั้งธีม —
              </div>
            )}
          </div>
        ))}
      </div>

      {editing && (
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
          <button onClick={() => setEditing(false)} className="btn btn--ghost btn--sm">ยกเลิก</button>
          <button onClick={save} className="btn btn--primary btn--sm">💾 บันทึก</button>
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
//  3. GOALS LIST
// ════════════════════════════════════════════════════════════════════════════
export function GoalsList({ goals, onAdd, onUpdate, onDelete }) {
  const [adding, setAdding] = useState(false);

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--r-lg)', padding: '20px 22px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 14 }}>
        <div>
          <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--ink-3)', letterSpacing: '0.18em' }}>
            ◎ ACTIVE GOALS · TOP {goals.length}
          </div>
          <div style={{ fontFamily: 'var(--f-display)', fontSize: 15, color: 'var(--ink)', marginTop: 3 }}>
            เป้าหมายที่กำลังทำ
          </div>
        </div>
        <button onClick={() => setAdding(true)} className="btn btn--ghost btn--sm">+ เพิ่ม</button>
      </div>

      {adding && <GoalForm onSubmit={async (g) => { await onAdd(g); setAdding(false); }} onCancel={() => setAdding(false)} />}

      {goals.length === 0 && !adding ? (
        <div style={{ color: 'var(--ink-3)', fontSize: 12, padding: '20px 0', textAlign: 'center', fontFamily: 'var(--f-mono)' }}>
          ยังไม่มีเป้าหมาย — กด <strong style={{ color: 'var(--amber)' }}>+ เพิ่ม</strong> เพื่อเริ่ม
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: adding ? 14 : 0 }}>
          {goals.map(g => <GoalRow key={g.id} goal={g} onUpdate={onUpdate} onDelete={onDelete} />)}
        </div>
      )}
    </div>
  );
}

function GoalRow({ goal, onUpdate, onDelete }) {
  const [editing, setEditing] = useState(false);
  const cat = CATEGORY_META[goal.category] || CATEGORY_META.general;
  const pct = goal.target_value > 0
    ? Math.min(100, (Number(goal.current_value) / Number(goal.target_value)) * 100)
    : 0;
  const isComplete = pct >= 100;

  if (editing) {
    return <GoalForm initial={goal} onSubmit={async (g) => { await onUpdate(goal.id, g); setEditing(false); }} onCancel={() => setEditing(false)} />;
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', minWidth: 0, flex: 1 }}>
          <span style={{ fontSize: 14 }}>{cat.icon}</span>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 13, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {goal.title}
            </div>
            {goal.deadline && (
              <div style={{ fontFamily: 'var(--f-mono)', fontSize: 9.5, color: 'var(--ink-4)', marginTop: 1 }}>
                ⌛ {new Date(goal.deadline).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })}
              </div>
            )}
          </div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--ink-2)' }}>
            {Number(goal.current_value).toLocaleString('th')}{goal.unit && ` ${goal.unit}`}
            <span style={{ color: 'var(--ink-4)', margin: '0 4px' }}>/</span>
            {Number(goal.target_value).toLocaleString('th')}
          </div>
          <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10.5, color: isComplete ? 'var(--profit)' : 'var(--amber)' }}>
            {pct.toFixed(0)}%
          </div>
        </div>
      </div>
      <div style={{ height: 6, background: 'var(--surface-2)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: isComplete ? 'var(--profit)' : cat.color, transition: 'width 300ms' }} />
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
        <button onClick={() => setEditing(true)} style={{ background: 'none', border: 0, color: 'var(--ink-4)', fontSize: 10, cursor: 'pointer', padding: 0 }}>แก้ไข</button>
        <button onClick={() => confirm('ลบเป้าหมาย?') && onDelete(goal.id)} style={{ background: 'none', border: 0, color: 'var(--ink-4)', fontSize: 10, cursor: 'pointer', padding: 0 }}>ลบ</button>
      </div>
    </div>
  );
}

function GoalForm({ initial, onSubmit, onCancel }) {
  const [form, setForm] = useState({
    title:         initial?.title         || '',
    current_value: initial?.current_value || 0,
    target_value:  initial?.target_value  || '',
    unit:          initial?.unit          || '',
    deadline:      initial?.deadline      || '',
    category:      initial?.category      || 'general',
  });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const submit = (e) => {
    e?.preventDefault();
    if (!form.title.trim() || !form.target_value) return;
    onSubmit({
      ...form,
      current_value: Number(form.current_value) || 0,
      target_value:  Number(form.target_value),
      deadline: form.deadline || null,
    });
  };

  return (
    <form onSubmit={submit} style={{
      background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 'var(--r-md)',
      padding: 14, display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 8,
    }}>
      <input type="text" value={form.title} onChange={e => set('title', e.target.value)}
        placeholder="ชื่อเป้าหมาย" required
        style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 4, padding: '8px 10px', color: 'var(--ink)', fontSize: 13 }} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 100px 1fr', gap: 6 }}>
        <input type="number" value={form.current_value} onChange={e => set('current_value', e.target.value)} placeholder="มีอยู่" min="0" step="any"
          style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 4, padding: '6px 8px', color: 'var(--ink)', fontFamily: 'var(--f-mono)', fontSize: 11 }} />
        <input type="number" value={form.target_value} onChange={e => set('target_value', e.target.value)} placeholder="เป้า" min="0" step="any" required
          style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 4, padding: '6px 8px', color: 'var(--ink)', fontFamily: 'var(--f-mono)', fontSize: 11 }} />
        <input type="text" value={form.unit} onChange={e => set('unit', e.target.value)} placeholder="หน่วย"
          style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 4, padding: '6px 8px', color: 'var(--ink)', fontFamily: 'var(--f-mono)', fontSize: 11 }} />
        <input type="date" value={form.deadline} onChange={e => set('deadline', e.target.value)}
          style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 4, padding: '6px 8px', color: 'var(--ink-2)', fontFamily: 'var(--f-mono)', fontSize: 11 }} />
      </div>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {Object.entries(CATEGORY_META).map(([k, m]) => (
          <button key={k} type="button" onClick={() => set('category', k)} style={{
            padding: '3px 9px', borderRadius: 99, fontSize: 10.5, cursor: 'pointer',
            background: form.category === k ? m.color : 'var(--surface)',
            color: form.category === k ? '#1a1410' : 'var(--ink-3)',
            border: `1px solid ${form.category === k ? m.color : 'var(--line)'}`,
            fontFamily: 'var(--f-mono)',
          }}>{m.icon} {m.label}</button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
        <button type="button" onClick={onCancel} className="btn btn--ghost btn--sm">ยกเลิก</button>
        <button type="submit" className="btn btn--primary btn--sm">บันทึก</button>
      </div>
    </form>
  );
}

// ════════════════════════════════════════════════════════════════════════════
//  4. TODAY'S FOCUS (max 3 items)
// ════════════════════════════════════════════════════════════════════════════
export function TodayFocus({ items, onAdd, onToggle, onDelete }) {
  const [newTitle, setNewTitle] = useState('');
  const canAdd = items.length < 3;

  const submit = async (e) => {
    e.preventDefault();
    if (!newTitle.trim() || !canAdd) return;
    await onAdd({ title: newTitle.trim(), ord: items.length });
    setNewTitle('');
  };

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--r-lg)', padding: '20px 22px' }}>
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--ink-3)', letterSpacing: '0.18em' }}>
          ☼ TODAY'S FOCUS · {items.length}/3
        </div>
        <div style={{ fontFamily: 'var(--f-display)', fontSize: 15, color: 'var(--ink)', marginTop: 3 }}>
          วันนี้ — 3 สิ่งที่สำคัญที่สุด
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {items.map((it, i) => (
          <label key={it.id} style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '10px 12px', background: it.done ? 'transparent' : 'var(--surface-2)',
            border: '1px solid var(--line)', borderRadius: 'var(--r-sm)', cursor: 'pointer',
            opacity: it.done ? 0.55 : 1, transition: 'opacity 150ms',
          }}>
            <input type="checkbox" checked={it.done} onChange={(e) => onToggle(it.id, e.target.checked)}
              style={{ width: 18, height: 18, accentColor: 'var(--amber)', cursor: 'pointer', flexShrink: 0 }} />
            <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--ink-4)' }}>0{i + 1}</div>
            <div style={{
              flex: 1, color: 'var(--ink)', fontSize: 13,
              textDecoration: it.done ? 'line-through' : 'none',
            }}>{it.title}</div>
            <button onClick={(e) => { e.preventDefault(); confirm('ลบ?') && onDelete(it.id); }}
              style={{ background: 'none', border: 0, color: 'var(--ink-4)', fontSize: 14, cursor: 'pointer', padding: 4 }}>×</button>
          </label>
        ))}

        {canAdd && (
          <form onSubmit={submit} style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            <input type="text" value={newTitle} onChange={e => setNewTitle(e.target.value)}
              placeholder={items.length === 0 ? "สิ่งที่ต้องโฟกัสที่สุดวันนี้..." : "+ เพิ่ม focus ที่ " + (items.length + 1)}
              style={{
                flex: 1, background: 'var(--bg-2)', border: '1px solid var(--line)',
                borderRadius: 'var(--r-sm)', padding: '10px 14px', color: 'var(--ink)', fontSize: 13,
              }} />
            <button type="submit" disabled={!newTitle.trim()} className="btn btn--primary btn--sm">+</button>
          </form>
        )}

        {items.length === 3 && (
          <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--ink-4)', textAlign: 'center', marginTop: 4, letterSpacing: '0.1em' }}>
            ครบ 3 แล้ว — โฟกัสที่นี่ก่อน
          </div>
        )}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
//  5. ROADMAP TIMELINE (6 months horizontal)
// ════════════════════════════════════════════════════════════════════════════
const THAI_MONTHS = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];

export function RoadmapTimeline({ milestones, monthsAhead = 6, onAdd, onUpdate, onDelete }) {
  const [adding, setAdding] = useState(false);

  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + monthsAhead, 0);
  const totalDays = (end - start) / 86400000;

  const positionPct = (dateStr) => {
    const d = new Date(dateStr);
    const days = (d - start) / 86400000;
    return Math.max(0, Math.min(100, (days / totalDays) * 100));
  };

  const today = new Date();
  const todayPct = positionPct(today.toISOString().split('T')[0]);

  // Month tick marks
  const ticks = [];
  for (let i = 0; i <= monthsAhead; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    ticks.push({ pct: positionPct(d.toISOString().split('T')[0]), label: THAI_MONTHS[d.getMonth()] });
  }

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--r-lg)', padding: '20px 22px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 16 }}>
        <div>
          <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--ink-3)', letterSpacing: '0.18em' }}>
            ➔ ROADMAP · {monthsAhead} เดือนข้างหน้า
          </div>
          <div style={{ fontFamily: 'var(--f-display)', fontSize: 15, color: 'var(--ink)', marginTop: 3 }}>
            milestones สำคัญ
          </div>
        </div>
        <button onClick={() => setAdding(true)} className="btn btn--ghost btn--sm">+ เพิ่ม</button>
      </div>

      {adding && <MilestoneForm onSubmit={async (m) => { await onAdd(m); setAdding(false); }} onCancel={() => setAdding(false)} />}

      {/* Timeline */}
      <div style={{ position: 'relative', height: 100, marginTop: 18, marginBottom: 8 }}>
        {/* Track */}
        <div style={{
          position: 'absolute', top: 38, left: 0, right: 0, height: 2,
          background: 'var(--line)', borderRadius: 1,
        }} />

        {/* Month ticks */}
        {ticks.map((t, i) => (
          <div key={i} style={{ position: 'absolute', top: 30, left: `${t.pct}%`, transform: 'translateX(-50%)' }}>
            <div style={{ width: 1, height: 8, background: 'var(--ink-4)', margin: '0 auto' }} />
            <div style={{ fontFamily: 'var(--f-mono)', fontSize: 9.5, color: 'var(--ink-4)', marginTop: 4, textAlign: 'center' }}>
              {t.label}
            </div>
          </div>
        ))}

        {/* Today marker */}
        <div style={{ position: 'absolute', top: 14, left: `${todayPct}%`, transform: 'translateX(-50%)' }}>
          <div style={{
            fontFamily: 'var(--f-mono)', fontSize: 9, color: 'var(--amber)',
            letterSpacing: '0.1em', textAlign: 'center', marginBottom: 2,
          }}>NOW</div>
          <div style={{ width: 1.5, height: 30, background: 'var(--amber)', margin: '0 auto' }} />
        </div>

        {/* Milestones */}
        {milestones.map((m, idx) => {
          const cat = CATEGORY_META[m.category] || CATEGORY_META.general;
          const pct = positionPct(m.target_date);
          const isDone = m.status === 'done';
          // Alternate above/below
          const above = idx % 2 === 0;
          return (
            <div key={m.id} style={{
              position: 'absolute', top: above ? 0 : 60, left: `${pct}%`,
              transform: 'translateX(-50%)', cursor: 'pointer',
            }} title={`${m.title} · ${new Date(m.target_date).toLocaleDateString('th-TH')}`}
            onClick={() => confirm(`ลบ "${m.title}"?`) && onDelete(m.id)}>
              {above && (
                <div style={{
                  fontSize: 10.5, color: 'var(--ink-2)', fontFamily: 'var(--f-body)',
                  maxWidth: 100, textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap', marginBottom: 6,
                }}>{m.title}</div>
              )}
              <div style={{
                width: 14, height: 14, borderRadius: '50%',
                background: isDone ? 'var(--profit)' : cat.color,
                border: '2px solid var(--surface)', boxShadow: `0 0 0 1.5px ${isDone ? 'var(--profit)' : cat.color}`,
                margin: '0 auto', position: 'relative', top: above ? 30 : -6,
              }} />
              {!above && (
                <div style={{
                  fontSize: 10.5, color: 'var(--ink-2)', fontFamily: 'var(--f-body)',
                  maxWidth: 100, textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap', marginTop: 6,
                }}>{m.title}</div>
              )}
            </div>
          );
        })}
      </div>

      {milestones.length === 0 && !adding && (
        <div style={{ color: 'var(--ink-3)', fontSize: 12, padding: '14px 0', textAlign: 'center', fontFamily: 'var(--f-mono)' }}>
          ยังไม่มี milestone — กด <strong style={{ color: 'var(--amber)' }}>+ เพิ่ม</strong>
        </div>
      )}

      {/* Detail list */}
      {milestones.length > 0 && (
        <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--line)', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {milestones.map(m => {
            const cat = CATEGORY_META[m.category] || CATEGORY_META.general;
            const d = new Date(m.target_date);
            return (
              <div key={m.id} style={{
                display: 'grid', gridTemplateColumns: '8px 80px 1fr 70px', gap: 10,
                alignItems: 'center', fontSize: 11, padding: '3px 0',
              }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: cat.color }} />
                <span style={{ fontFamily: 'var(--f-mono)', color: 'var(--ink-3)' }}>
                  {d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })}
                </span>
                <span style={{ color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {m.title}
                </span>
                <span style={{ fontFamily: 'var(--f-mono)', fontSize: 9.5, color: cat.color, textAlign: 'right' }}>
                  {cat.icon} {cat.label}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function MilestoneForm({ onSubmit, onCancel }) {
  const [form, setForm] = useState({ title: '', target_date: '', category: 'general' });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const submit = (e) => {
    e.preventDefault();
    if (!form.title.trim() || !form.target_date) return;
    onSubmit(form);
  };
  return (
    <form onSubmit={submit} style={{
      background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 'var(--r-md)',
      padding: 12, display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 8,
    }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 140px', gap: 6 }}>
        <input type="text" value={form.title} onChange={e => set('title', e.target.value)}
          placeholder="ชื่อ milestone" required
          style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 4, padding: '7px 10px', color: 'var(--ink)', fontSize: 12 }} />
        <input type="date" value={form.target_date} onChange={e => set('target_date', e.target.value)} required
          style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 4, padding: '7px 10px', color: 'var(--ink-2)', fontFamily: 'var(--f-mono)', fontSize: 11 }} />
      </div>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {Object.entries(CATEGORY_META).map(([k, m]) => (
          <button key={k} type="button" onClick={() => set('category', k)} style={{
            padding: '3px 9px', borderRadius: 99, fontSize: 10, cursor: 'pointer',
            background: form.category === k ? m.color : 'var(--surface)',
            color: form.category === k ? '#1a1410' : 'var(--ink-3)',
            border: `1px solid ${form.category === k ? m.color : 'var(--line)'}`, fontFamily: 'var(--f-mono)',
          }}>{m.icon}</button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
        <button type="button" onClick={onCancel} className="btn btn--ghost btn--sm">ยกเลิก</button>
        <button type="submit" className="btn btn--primary btn--sm">เพิ่ม</button>
      </div>
    </form>
  );
}

// ════════════════════════════════════════════════════════════════════════════
//  6. LIFE PULSE (cross-module quick stats)
// ════════════════════════════════════════════════════════════════════════════
export function LifePulse({ finance, modules, onNav }) {
  const tiles = [
    {
      key: 'finance', icon: '💰', label: 'การเงิน', accent: '#5fb878',
      main: finance ? (finance.net >= 0 ? '+' : '-') + '฿' + (Math.abs(finance.net) >= 1000 ? (Math.abs(finance.net) / 1000).toFixed(1) + 'K' : Math.abs(finance.net).toLocaleString('th')) : '—',
      sub: finance ? `ออม ${finance.savingsRate.toFixed(0)}%` : 'ยังไม่มีข้อมูล',
      goto: 'personal-finance',
    },
    {
      key: 'trading', icon: '📈', label: 'Trading', accent: '#d9a14f',
      main: modules?.trading != null ? `${modules.trading}` : '—',
      sub: modules?.trading > 0 ? 'positions เปิดอยู่' : 'ไม่มี position เปิด',
      goto: 'trading',
    },
    {
      key: 'learning', icon: '📚', label: 'Learning', accent: '#7aa4f0',
      main: modules?.learning != null ? `${modules.learning}` : '—',
      sub: 'sources กำลังเรียน',
      goto: 'learning',
    },
    {
      key: 'family', icon: '❤️', label: 'Family', accent: '#c084f5',
      main: modules?.family != null ? `${modules.family}` : '—',
      sub: 'events ที่จะมาถึง',
      goto: 'family',
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--ink-3)', letterSpacing: '0.18em' }}>
          ⚡ LIFE PULSE
        </div>
        <div style={{ fontFamily: 'var(--f-display)', fontSize: 15, color: 'var(--ink)', marginTop: 3 }}>
          ภาพรวมทุกโมดูล
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
        {tiles.map(t => (
          <button key={t.key} onClick={() => onNav?.(t.goto)} style={{
            background: 'var(--surface)', border: '1px solid var(--line)',
            borderRadius: 'var(--r-lg)', padding: '14px 16px', cursor: 'pointer',
            display: 'flex', flexDirection: 'column', gap: 6, textAlign: 'left',
            position: 'relative', overflow: 'hidden', transition: 'all 130ms',
          }}
          onMouseEnter={e => e.currentTarget.style.borderColor = t.accent}
          onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--line)'}>
            <div style={{ position: 'absolute', top: 0, left: 0, width: 3, height: '100%', background: t.accent }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <span style={{ fontSize: 16 }}>{t.icon}</span>
              <span style={{ fontFamily: 'var(--f-mono)', fontSize: 9.5, color: 'var(--ink-3)', letterSpacing: '0.14em', textTransform: 'uppercase' }}>
                {t.label}
              </span>
            </div>
            <div style={{ fontFamily: 'var(--f-display)', fontSize: 22, color: t.accent, lineHeight: 1.1 }}>
              {t.main}
            </div>
            <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>
              {t.sub}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
