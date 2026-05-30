import { useState } from 'react';
import { Button, Card, CardHeader, Badge, EmptyState } from '../ui/index.js';

const CATEGORY_META = {
  finance:  { color: 'var(--success)',  icon: '💰', label: 'การเงิน'  },
  health:   { color: 'var(--rose)',     icon: '💪', label: 'สุขภาพ'   },
  learning: { color: 'var(--blue)',     icon: '📚', label: 'การเรียน' },
  family:   { color: 'var(--violet)',   icon: '❤️', label: 'ครอบครัว' },
  trading:  { color: 'var(--warning)',  icon: '📈', label: 'Trading'  },
  general:  { color: 'var(--accent)',   icon: '◎',  label: 'ทั่วไป'   },
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
    <Card variant="paper" padding={26}>
      <CardHeader
        eyebrow="⌘ Manifest · North Star"
        title="หลักการตัดสินใจของชีวิตคุณ"
        accent="var(--accent-strong)"
        action={!editing && !isEmpty ? (
          <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>✎ แก้ไข</Button>
        ) : null}
      />

      {editing ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <textarea value={statement} onChange={e => setStatement(e.target.value)}
            rows={2}
            placeholder='เช่น "ค่อย ๆ ทำทีละอย่าง · สมาธิคือทรัพย์สิน · ครอบครัวก่อนเสมอ"'
            style={{
              background: 'var(--surface)', border: '1px solid var(--border-strong)',
              borderRadius: 'var(--radius-control)', padding: '12px 14px',
              color: 'var(--text-primary)', fontFamily: 'var(--f-display)',
              fontStyle: 'italic', fontSize: 18, lineHeight: 1.5, resize: 'vertical',
            }} />
          <input type="text" value={valuesText} onChange={e => setValuesText(e.target.value)}
            placeholder="ค่านิยม คั่นด้วย · (เช่น focus · family · patience)"
            style={{
              background: 'var(--surface)', border: '1px solid var(--border-strong)',
              borderRadius: 'var(--radius-control)', padding: '10px 14px',
              color: 'var(--text-secondary)', fontFamily: 'var(--f-mono)', fontSize: 12,
            }} />
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <Button variant="ghost" size="sm" onClick={cancel}>ยกเลิก</Button>
            <Button variant="primary" size="sm" onClick={save}>💾 บันทึก</Button>
          </div>
        </div>
      ) : isEmpty ? (
        <EmptyState
          icon="⌘"
          title="เขียน North Star แรกของคุณ"
          description="สรุปทิศทางชีวิตหรือหลักการตัดสินใจ เพื่อให้ทุกโมดูลใน Atelier OS มีเข็มทิศเดียวกัน"
          actionLabel="เริ่มเขียน Manifest"
          onAction={() => setEditing(true)}
          compact
        />
      ) : (
        <>
          {manifest?.statement && (
            <div style={{
              fontFamily: 'var(--f-display)', fontStyle: 'italic',
              fontSize: 22, color: 'var(--paper-ink)', lineHeight: 1.45,
            }}>
              "{manifest.statement}"
            </div>
          )}
          {(manifest?.values || []).length > 0 && (
            <div style={{ marginTop: 16, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {manifest.values.map(v => <Badge key={v} tone="accent">{v}</Badge>)}
            </div>
          )}
        </>
      )}
    </Card>
  );
}

// ════════════════════════════════════════════════════════════════════════════
//  2. THEMES CARD
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
    { key: 'year_theme',    label: 'ปี ' + labels.year_label,        value: themes?.year_theme,    placeholder: '"ปีแห่งการสร้างระบบ"' },
    { key: 'quarter_theme', label: labels.quarter_label,              value: themes?.quarter_theme, placeholder: '"Optimize before scale"' },
    { key: 'week_theme',    label: 'สัปดาห์ ' + labels.week_label,    value: themes?.week_theme,    placeholder: '"เปิด Atelier OS ให้ใช้งานจริง"' },
  ];

  return (
    <Card>
      <CardHeader
        eyebrow="☉ Compass · Themes"
        title="ทิศทางของช่วงเวลานี้"
        action={!editing && <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>✎ แก้ไข</Button>}
      />

      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {rows.map((r, i) => (
          <div key={r.key} style={{
            display: 'grid', gridTemplateColumns: '130px 1fr', gap: 14,
            padding: '12px 0', borderTop: i === 0 ? 'none' : '1px solid var(--border)',
            alignItems: 'center',
          }}>
            <div style={{
              fontFamily: 'var(--f-mono)', fontSize: 10.5, color: 'var(--text-muted)',
              letterSpacing: '0.12em', fontWeight: 500,
            }}>
              {r.label}
            </div>
            {editing ? (
              <input type="text" value={form[r.key]} onChange={e => setForm({ ...form, [r.key]: e.target.value })}
                placeholder={r.placeholder}
                style={{
                  background: 'var(--background-soft)', border: '1px solid var(--border-strong)',
                  borderRadius: 'var(--radius-control)', padding: '7px 11px',
                  color: 'var(--text-primary)', fontFamily: 'var(--f-display)',
                  fontStyle: 'italic', fontSize: 15,
                }} />
            ) : r.value ? (
              <div style={{
                fontFamily: 'var(--f-display)', fontStyle: 'italic',
                fontSize: 16, color: 'var(--text-primary)',
              }}>
                "{r.value}"
              </div>
            ) : (
              <div style={{ color: 'var(--text-muted)', fontSize: 13, fontStyle: 'italic' }}>
                — ยังไม่ตั้งธีม —
              </div>
            )}
          </div>
        ))}
      </div>

      {editing && (
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
          <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>ยกเลิก</Button>
          <Button variant="primary" size="sm" onClick={save}>💾 บันทึก</Button>
        </div>
      )}
    </Card>
  );
}

// ════════════════════════════════════════════════════════════════════════════
//  3. GOALS LIST
// ════════════════════════════════════════════════════════════════════════════
export function GoalsList({ goals, onAdd, onUpdate, onDelete }) {
  const [adding, setAdding] = useState(false);

  return (
    <Card>
      <CardHeader
        eyebrow={`◎ Active Goals · ${goals.length}`}
        title="เป้าหมายที่กำลังทำ"
        action={!adding && <Button variant="secondary" size="sm" onClick={() => setAdding(true)}>+ เพิ่มเป้าหมาย</Button>}
      />

      {adding && <GoalForm onSubmit={async (g) => { await onAdd(g); setAdding(false); }} onCancel={() => setAdding(false)} />}

      {goals.length === 0 && !adding ? (
        <EmptyState
          icon="◎"
          title="ยังไม่มีเป้าหมายที่กำลังทำ"
          description="เพิ่มเป้าหมาย 1–3 ข้อที่สำคัญที่สุดในช่วงนี้ แล้วเชื่อมกับ focus รายวัน"
          actionLabel="เพิ่มเป้าหมายแรก"
          onAction={() => setAdding(true)}
          compact
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: adding ? 14 : 0 }}>
          {goals.map(g => <GoalRow key={g.id} goal={g} onUpdate={onUpdate} onDelete={onDelete} />)}
        </div>
      )}
    </Card>
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
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, gap: 12 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', minWidth: 0, flex: 1 }}>
          <span style={{ fontSize: 15 }}>{cat.icon}</span>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 13.5, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {goal.title}
            </div>
            {goal.deadline && (
              <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--text-muted)', marginTop: 1 }}>
                ⌛ {new Date(goal.deadline).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })}
              </div>
            )}
          </div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontFamily: 'var(--f-mono)', fontSize: 11.5, color: 'var(--text-secondary)' }}>
            {Number(goal.current_value).toLocaleString('th')}{goal.unit && ` ${goal.unit}`}
            <span style={{ color: 'var(--text-muted)', margin: '0 4px' }}>/</span>
            {Number(goal.target_value).toLocaleString('th')}
          </div>
          <div style={{ fontFamily: 'var(--f-mono)', fontSize: 11, color: isComplete ? 'var(--success)' : 'var(--accent-strong)', fontWeight: 500 }}>
            {pct.toFixed(0)}%
          </div>
        </div>
      </div>
      <div style={{ height: 6, background: 'var(--surface-muted)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: isComplete ? 'var(--success)' : cat.color, transition: 'width 300ms' }} />
      </div>
      <div style={{ display: 'flex', gap: 12, marginTop: 5 }}>
        <button onClick={() => setEditing(true)} className="focus-ring"
          style={{ background: 'none', border: 0, color: 'var(--text-muted)', fontSize: 11, cursor: 'pointer', padding: 0 }}>
          แก้ไข
        </button>
        <button onClick={() => confirm('ลบเป้าหมาย?') && onDelete(goal.id)} className="focus-ring"
          style={{ background: 'none', border: 0, color: 'var(--text-muted)', fontSize: 11, cursor: 'pointer', padding: 0 }}>
          ลบ
        </button>
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

  const inputStyle = {
    background: 'var(--surface)', border: '1px solid var(--border-strong)',
    borderRadius: 'var(--radius-control)', padding: '7px 11px',
    color: 'var(--text-primary)', fontSize: 12.5,
  };

  return (
    <form onSubmit={submit} style={{
      background: 'var(--background-soft)', border: '1px solid var(--border-strong)',
      borderRadius: 'var(--radius-control)', padding: 14,
      display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 8,
    }}>
      <input type="text" value={form.title} onChange={e => set('title', e.target.value)}
        placeholder="ชื่อเป้าหมาย" required style={inputStyle} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 100px 1fr', gap: 6 }}>
        <input type="number" value={form.current_value} onChange={e => set('current_value', e.target.value)} placeholder="มีอยู่" min="0" step="any"
          style={{ ...inputStyle, fontFamily: 'var(--f-mono)', fontSize: 11 }} />
        <input type="number" value={form.target_value} onChange={e => set('target_value', e.target.value)} placeholder="เป้า" min="0" step="any" required
          style={{ ...inputStyle, fontFamily: 'var(--f-mono)', fontSize: 11 }} />
        <input type="text" value={form.unit} onChange={e => set('unit', e.target.value)} placeholder="หน่วย"
          style={{ ...inputStyle, fontFamily: 'var(--f-mono)', fontSize: 11 }} />
        <input type="date" value={form.deadline} onChange={e => set('deadline', e.target.value)}
          style={{ ...inputStyle, fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--text-secondary)' }} />
      </div>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {Object.entries(CATEGORY_META).map(([k, m]) => (
          <button key={k} type="button" onClick={() => set('category', k)} className="focus-ring"
            style={{
              padding: '3px 10px', borderRadius: 'var(--radius-pill)', fontSize: 10.5, cursor: 'pointer',
              background: form.category === k ? 'var(--accent-soft)' : 'var(--surface)',
              color: form.category === k ? 'var(--accent-strong)' : 'var(--text-secondary)',
              border: `1px solid ${form.category === k ? 'var(--accent)' : 'var(--border)'}`,
              fontFamily: 'var(--f-mono)', fontWeight: 500,
            }}>{m.icon} {m.label}</button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>ยกเลิก</Button>
        <Button type="submit" variant="primary" size="sm">บันทึก</Button>
      </div>
    </form>
  );
}

// ════════════════════════════════════════════════════════════════════════════
//  4. TODAY'S FOCUS
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
    <Card>
      <CardHeader
        eyebrow={`☼ Today's Focus · ${items.length}/3`}
        title="วันนี้ — 3 สิ่งที่สำคัญที่สุด"
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {items.length === 0 && !canAdd && (
          <EmptyState
            icon="☼"
            title="วันนี้ยังว่างอยู่"
            description="บันทึก 1–3 สิ่งที่สำคัญที่สุดวันนี้ เริ่มจากงาน ความรู้สึก หรือสิ่งที่อยากจำ"
            compact
          />
        )}

        {items.map((it, i) => (
          <label key={it.id} className="focus-ring" style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '11px 14px',
            background: it.done ? 'var(--background-soft)' : 'var(--surface)',
            border: '1px solid var(--border)', borderRadius: 'var(--radius-control)',
            cursor: 'pointer',
            opacity: it.done ? 0.55 : 1, transition: 'opacity 150ms',
          }}>
            <input type="checkbox" checked={it.done} onChange={(e) => onToggle(it.id, e.target.checked)}
              style={{ width: 18, height: 18, accentColor: 'var(--accent)', cursor: 'pointer', flexShrink: 0 }} />
            <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10.5, color: 'var(--text-muted)' }}>0{i + 1}</div>
            <div style={{
              flex: 1, color: 'var(--text-primary)', fontSize: 13.5,
              textDecoration: it.done ? 'line-through' : 'none',
            }}>{it.title}</div>
            <button onClick={(e) => { e.preventDefault(); confirm('ลบ?') && onDelete(it.id); }}
              aria-label="ลบ"
              style={{ background: 'none', border: 0, color: 'var(--text-muted)', fontSize: 16, cursor: 'pointer', padding: 4 }}>
              ×
            </button>
          </label>
        ))}

        {canAdd && (
          <form onSubmit={submit} style={{ display: 'flex', gap: 8, marginTop: items.length > 0 ? 4 : 0 }}>
            <input type="text" value={newTitle} onChange={e => setNewTitle(e.target.value)}
              placeholder={items.length === 0 ? 'สิ่งที่ต้องโฟกัสที่สุดวันนี้…' : `+ เพิ่ม focus ที่ ${items.length + 1}`}
              style={{
                flex: 1, background: 'var(--surface)', border: '1px solid var(--border-strong)',
                borderRadius: 'var(--radius-control)', padding: '10px 14px',
                color: 'var(--text-primary)', fontSize: 13.5,
              }} />
            <Button type="submit" variant="primary" size="md" disabled={!newTitle.trim()}>+</Button>
          </form>
        )}

        {items.length === 3 && (
          <div style={{
            fontFamily: 'var(--f-mono)', fontSize: 10.5, color: 'var(--text-muted)',
            textAlign: 'center', marginTop: 4, letterSpacing: '0.1em',
          }}>
            ครบ 3 แล้ว — โฟกัสที่นี่ก่อน
          </div>
        )}
      </div>
    </Card>
  );
}

// ════════════════════════════════════════════════════════════════════════════
//  5. ROADMAP TIMELINE (6 months)
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

  const ticks = [];
  for (let i = 0; i <= monthsAhead; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    ticks.push({ pct: positionPct(d.toISOString().split('T')[0]), label: THAI_MONTHS[d.getMonth()] });
  }

  return (
    <Card>
      <CardHeader
        eyebrow={`➔ Roadmap · ${monthsAhead} เดือนข้างหน้า`}
        title="Milestones สำคัญ"
        action={!adding && <Button variant="secondary" size="sm" onClick={() => setAdding(true)}>+ เพิ่ม milestone</Button>}
      />

      {adding && <MilestoneForm onSubmit={async (m) => { await onAdd(m); setAdding(false); }} onCancel={() => setAdding(false)} />}

      {milestones.length === 0 && !adding ? (
        <EmptyState
          icon="➔"
          title="ยังไม่มี milestone"
          description="วาง milestone สำคัญใน 6 เดือนข้างหน้า เพื่อมองเห็นภาพรวมระยะกลาง"
          actionLabel="เพิ่ม milestone แรก"
          onAction={() => setAdding(true)}
          compact
        />
      ) : (
        <>
          {/* Timeline */}
          <div style={{ position: 'relative', height: 100, marginTop: 18, marginBottom: 8 }}>
            <div style={{
              position: 'absolute', top: 38, left: 0, right: 0, height: 2,
              background: 'var(--border-strong)', borderRadius: 1,
            }} />
            {ticks.map((t, i) => (
              <div key={i} style={{ position: 'absolute', top: 30, left: `${t.pct}%`, transform: 'translateX(-50%)' }}>
                <div style={{ width: 1, height: 8, background: 'var(--border-strong)', margin: '0 auto' }} />
                <div style={{
                  fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--text-muted)',
                  marginTop: 4, textAlign: 'center', fontWeight: 500,
                }}>
                  {t.label}
                </div>
              </div>
            ))}
            <div style={{ position: 'absolute', top: 14, left: `${todayPct}%`, transform: 'translateX(-50%)' }}>
              <div style={{
                fontFamily: 'var(--f-mono)', fontSize: 9, color: 'var(--accent-strong)',
                letterSpacing: '0.14em', textAlign: 'center', marginBottom: 2, fontWeight: 600,
              }}>NOW</div>
              <div style={{ width: 1.5, height: 30, background: 'var(--accent)', margin: '0 auto' }} />
            </div>
            {milestones.map((m, idx) => {
              const cat = CATEGORY_META[m.category] || CATEGORY_META.general;
              const pct = positionPct(m.target_date);
              const isDone = m.status === 'done';
              const above = idx % 2 === 0;
              return (
                <div key={m.id} style={{
                  position: 'absolute', top: above ? 0 : 60, left: `${pct}%`,
                  transform: 'translateX(-50%)', cursor: 'pointer',
                }} title={`${m.title} · ${new Date(m.target_date).toLocaleDateString('th-TH')}`}
                onClick={() => confirm(`ลบ "${m.title}"?`) && onDelete(m.id)}>
                  {above && (
                    <div style={{
                      fontSize: 11, color: 'var(--text-primary)',
                      maxWidth: 100, textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap', marginBottom: 6, fontWeight: 500,
                    }}>{m.title}</div>
                  )}
                  <div style={{
                    width: 14, height: 14, borderRadius: '50%',
                    background: isDone ? 'var(--success)' : cat.color,
                    border: '2px solid var(--surface)',
                    boxShadow: `0 0 0 1.5px ${isDone ? 'var(--success)' : cat.color}`,
                    margin: '0 auto', position: 'relative', top: above ? 30 : -6,
                  }} />
                  {!above && (
                    <div style={{
                      fontSize: 11, color: 'var(--text-primary)',
                      maxWidth: 100, textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap', marginTop: 6, fontWeight: 500,
                    }}>{m.title}</div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Detail list */}
          <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {milestones.map(m => {
              const cat = CATEGORY_META[m.category] || CATEGORY_META.general;
              const d = new Date(m.target_date);
              return (
                <div key={m.id} style={{
                  display: 'grid', gridTemplateColumns: '10px 80px 1fr auto', gap: 12,
                  alignItems: 'center', fontSize: 12, padding: '4px 0',
                }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: cat.color }} />
                  <span style={{ fontFamily: 'var(--f-mono)', color: 'var(--text-secondary)' }}>
                    {d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })}
                  </span>
                  <span style={{ color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {m.title}
                  </span>
                  <Badge tone="neutral" size="sm">{cat.icon} {cat.label}</Badge>
                </div>
              );
            })}
          </div>
        </>
      )}
    </Card>
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
  const inputStyle = {
    background: 'var(--surface)', border: '1px solid var(--border-strong)',
    borderRadius: 'var(--radius-control)', padding: '8px 11px',
    color: 'var(--text-primary)', fontSize: 12.5,
  };
  return (
    <form onSubmit={submit} style={{
      background: 'var(--background-soft)', border: '1px solid var(--border-strong)',
      borderRadius: 'var(--radius-control)', padding: 12,
      display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 8,
    }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 150px', gap: 6 }}>
        <input type="text" value={form.title} onChange={e => set('title', e.target.value)}
          placeholder="ชื่อ milestone" required style={inputStyle} />
        <input type="date" value={form.target_date} onChange={e => set('target_date', e.target.value)} required
          style={{ ...inputStyle, fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--text-secondary)' }} />
      </div>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {Object.entries(CATEGORY_META).map(([k, m]) => (
          <button key={k} type="button" onClick={() => set('category', k)} className="focus-ring"
            style={{
              padding: '4px 10px', borderRadius: 'var(--radius-pill)', fontSize: 10.5, cursor: 'pointer',
              background: form.category === k ? 'var(--accent-soft)' : 'var(--surface)',
              color: form.category === k ? 'var(--accent-strong)' : 'var(--text-secondary)',
              border: `1px solid ${form.category === k ? 'var(--accent)' : 'var(--border)'}`,
              fontFamily: 'var(--f-mono)',
            }}>{m.icon} {m.label}</button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>ยกเลิก</Button>
        <Button type="submit" variant="primary" size="sm">เพิ่ม</Button>
      </div>
    </form>
  );
}

// ════════════════════════════════════════════════════════════════════════════
//  6. LIFE PULSE
// ════════════════════════════════════════════════════════════════════════════
export function LifePulse({ finance, modules, onNav }) {
  const tiles = [
    {
      key: 'finance', icon: '💰', label: 'การเงิน', accent: 'var(--success)',
      main: finance ? (finance.net >= 0 ? '+' : '-') + '฿' + (Math.abs(finance.net) >= 1000 ? (Math.abs(finance.net) / 1000).toFixed(1) + 'K' : Math.abs(finance.net).toLocaleString('th')) : '—',
      sub: finance ? `ออม ${finance.savingsRate.toFixed(0)}%` : 'ยังไม่มีข้อมูล',
      goto: 'personal-finance',
    },
    {
      key: 'trading', icon: '📈', label: 'Trading', accent: 'var(--warning)',
      main: modules?.trading != null ? `${modules.trading}` : '—',
      sub: modules?.trading > 0 ? 'positions เปิดอยู่' : 'ไม่มี position เปิด',
      goto: 'trading',
    },
    {
      key: 'learning', icon: '📚', label: 'Learning', accent: 'var(--blue)',
      main: modules?.learning != null ? `${modules.learning}` : '—',
      sub: 'sources กำลังเรียน',
      goto: 'learning',
    },
    {
      key: 'family', icon: '❤️', label: 'Family', accent: 'var(--violet)',
      main: modules?.family != null ? `${modules.family}` : '—',
      sub: 'events ที่จะมาถึง',
      goto: 'family',
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10.5, color: 'var(--text-muted)', letterSpacing: '0.18em', textTransform: 'uppercase' }}>
          ⚡ Life Pulse
        </div>
        <div style={{ fontFamily: 'var(--f-display)', fontSize: 17, color: 'var(--text-primary)', marginTop: 4, fontWeight: 500 }}>
          ภาพรวมทุกโมดูล
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
        {tiles.map(t => (
          <button key={t.key} onClick={() => onNav?.(t.goto)} className="focus-ring"
            style={{
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius-card)', padding: '16px 18px', cursor: 'pointer',
              display: 'flex', flexDirection: 'column', gap: 6, textAlign: 'left',
              position: 'relative', overflow: 'hidden',
              boxShadow: 'var(--shadow-card)', transition: 'all 130ms',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = t.accent; e.currentTarget.style.transform = 'translateY(-1px)'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.transform = 'translateY(0)'; }}>
            <div style={{ position: 'absolute', top: 0, left: 0, width: 3, height: '100%', background: t.accent }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 16 }}>{t.icon}</span>
              <span style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.16em', textTransform: 'uppercase', fontWeight: 500 }}>
                {t.label}
              </span>
            </div>
            <div style={{ fontFamily: 'var(--f-display)', fontSize: 24, color: t.accent, lineHeight: 1.1, fontWeight: 500 }}>
              {t.main}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              {t.sub}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
