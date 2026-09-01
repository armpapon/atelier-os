import { useState, useMemo, useRef, useLayoutEffect } from 'react';
import { Icon } from '../components/Icon.jsx';
import { PageHeader } from '../components/PageHeader.jsx';
import { EmptyState } from '../components/ui/index.js';
import { todayStr } from '../lib/dates.js';

const LS_BIRTH = 'loop:life-birthdate';
const LS_SPAN  = 'loop:life-lifespan';
const LS_MILESTONES = 'loop:life-milestones';

const MS_DAY  = 86400000;
const MS_WEEK = 7 * MS_DAY;
const MS_YEAR = 365.2425 * MS_DAY;

const MILESTONE_EMOJIS = ['⭐', '🎓', '💍', '👶', '🏠', '✈️', '💼', '🎉', '❤️', '📖', '🚀', '🌱'];

function loadMilestones() {
  try { return JSON.parse(localStorage.getItem(LS_MILESTONES) || '[]'); }
  catch { return []; }
}

// Index of the cell a given date falls into, for the active grid mode.
function milestoneIndex(dateStr, birthMs, mode) {
  const t = new Date(dateStr + 'T00:00:00').getTime();
  if (isNaN(t) || t < birthMs) return -1;
  if (mode === 'weeks') return Math.floor((t - birthMs) / MS_WEEK);
  if (mode === 'years') return Math.floor((t - birthMs) / MS_YEAR);
  const b = new Date(birthMs), d = new Date(t);
  return (d.getFullYear() - b.getFullYear()) * 12 + (d.getMonth() - b.getMonth()) - (d.getDate() < b.getDate() ? 1 : 0);
}

const QUOTES = [
  'เวลาที่ผ่านไปไม่ย้อนกลับ — ใช้สัปดาห์นี้ให้คุ้ม',
  'ชีวิตไม่ได้สั้น แต่เราเสียเวลาไปเยอะ — Seneca',
  'อย่ารอ "วันหนึ่ง" เพราะ "วันหนึ่ง" ไม่มีในปฏิทิน',
  'คุณมีเวลาน้อยกว่าที่คิด และมากพอที่จะเริ่มวันนี้',
];

const MODES = [
  // maxCell caps how big a square can grow; cells flex to fill the row up to it.
  { id: 'weeks',  label: 'สัปดาห์', cols: 52, maxCell: 18, gap: 3 },
  { id: 'months', label: 'เดือน',   cols: 12, maxCell: 30, gap: 5 },
  { id: 'years',  label: 'ปี',      cols: 10, maxCell: 38, gap: 6 },
];

const LABEL_GUTTER = 22;
const ROW_GAP = 8;

function fmtInt(n) { return Math.max(0, Math.round(n)).toLocaleString('en-US'); }

// ── Setup form ─────────────────────────────────────────────────────────────
function SetupCard({ initialBirth, initialSpan, onSave, onCancel }) {
  const [birth, setBirth] = useState(initialBirth || '');
  const [span, setSpan]   = useState(String(initialSpan || 80));

  const submit = (e) => {
    e.preventDefault();
    if (!birth) return;
    onSave({ birth, span: Math.min(120, Math.max(1, Number(span) || 80)) });
  };

  return (
    <form onSubmit={submit} className="card" style={{ maxWidth: 420, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <div className="card__title">ตั้งค่า Life Calendar</div>
        <div style={{ fontSize: 13, color: 'var(--ink-3)', marginTop: 4 }}>
          ใส่วันเกิดและอายุที่คาดหวัง เพื่อวาดชีวิตทั้งหมดเป็นกริด
        </div>
      </div>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 500, fontSize: 13, color: 'var(--ink-3)' }}>วันเกิด</span>
        <input type="date" className="input" value={birth} onChange={e => setBirth(e.target.value)} required autoFocus max={todayStr()} />
      </label>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 500, fontSize: 13, color: 'var(--ink-3)' }}>อายุที่คาดหวัง (ปี)</span>
        <input type="number" className="input" value={span} onChange={e => setSpan(e.target.value)} min={1} max={120} />
      </label>
      <div style={{ display: 'flex', gap: 10 }}>
        {onCancel && <button type="button" className="btn btn--ghost" onClick={onCancel} style={{ flex: 1 }}>ยกเลิก</button>}
        <button type="submit" className="btn btn--primary" style={{ flex: 2 }}>บันทึก</button>
      </div>
    </form>
  );
}

// ── Milestone form ────────────────────────────────────────────────────────────
function MilestoneForm({ maxDate, onAdd, onClose }) {
  const [emoji, setEmoji] = useState('⭐');
  const [label, setLabel] = useState('');
  const [date, setDate]   = useState('');

  const submit = (e) => {
    e.preventDefault();
    if (!label.trim() || !date) return;
    onAdd({ id: Date.now().toString(36), emoji, label: label.trim(), date });
    onClose();
  };

  return (
    <form onSubmit={submit} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 16 }}>
      <div className="card__title" style={{ fontSize: 15 }}>เพิ่มเหตุการณ์สำคัญ</div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {MILESTONE_EMOJIS.map(em => (
          <button key={em} type="button" onClick={() => setEmoji(em)}
            style={{
              fontSize: 18, width: 38, height: 38, borderRadius: 'var(--r-sm)', cursor: 'pointer',
              border: `1px solid ${emoji === em ? 'var(--accent)' : 'var(--line)'}`,
              background: emoji === em ? 'var(--accent-soft)' : 'transparent',
            }}>{em}</button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <input className="input" value={label} onChange={e => setLabel(e.target.value)}
          placeholder="เช่น เรียนจบ, แต่งงาน, เปิดบริษัท, เกษียณ" autoFocus required style={{ flex: 2, minWidth: 200 }} />
        <input type="date" className="input" value={date} max={maxDate}
          onChange={e => setDate(e.target.value)} required style={{ flex: 1, minWidth: 150 }} />
      </div>
      <div style={{ fontSize: 11.5, color: 'var(--ink-4)' }}>ใส่ได้ทั้งวันในอดีตและอนาคต (เป้าหมายที่อยากไปถึง)</div>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
        <button type="button" className="btn btn--ghost" onClick={onClose}>ยกเลิก</button>
        <button type="submit" className="btn btn--primary">เพิ่ม</button>
      </div>
    </form>
  );
}

// ── Stat ────────────────────────────────────────────────────────────────────
function Stat({ label, value, sub, tone }) {
  return (
    <div className="card" style={{ padding: 16 }}>
      <div className="stat__label">{label}</div>
      <div className="stat__value" style={{ fontSize: 26, color: tone || 'var(--ink)', fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      {sub && <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10.5, color: 'var(--ink-4)', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

// ── Life grid ─────────────────────────────────────────────────────────────────
function LifeGrid({ mode, lifespan, lived, markers, fit }) {
  const m = MODES.find(x => x.id === mode);
  const total = mode === 'years' ? lifespan : lifespan * m.cols;
  const rows = Math.ceil(total / m.cols);
  const livedCount = Math.min(lived, total);
  const gap = fit ? Math.max(1, m.gap - 2) : m.gap;

  const cardRef = useRef(null);
  const [box, setBox] = useState({ w: 0, top: 0 });

  useLayoutEffect(() => {
    const measure = () => {
      const el = cardRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setBox({ w: r.width, top: r.top });
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [mode, fit]);

  // Compute a pixel cell size: fill the row width up to maxCell, and — in fit
  // mode — also shrink so every row fits the viewport height (no scroll).
  const cell = useMemo(() => {
    const cardPad = 40;            // .card horizontal padding (20 + 20)
    const availW = (box.w || 900) - cardPad - LABEL_GUTTER - ROW_GAP;
    let c = Math.min(m.maxCell, (availW - (m.cols - 1) * gap) / m.cols);
    if (fit && box.w) {
      const reserve = 96;          // card padding + legend + breathing room
      const availH = window.innerHeight - box.top - reserve;
      const byH = (availH - (rows - 1) * gap) / rows;
      c = Math.min(c, byH);
    }
    return Math.max(2, Math.floor(c));
  }, [box, fit, m.cols, m.maxCell, rows, gap]);

  const labelFor = (rowIdx) => {
    if (mode === 'years') return `${rowIdx * 10}`;          // decade
    return rowIdx % 10 === 0 ? `${rowIdx}` : '';            // age in years
  };

  const showLabels = cell >= 6; // hide the age gutter when cells get tiny

  const rowEls = useMemo(() => {
    const out = [];
    for (let r = 0; r < rows; r++) {
      const cells = [];
      for (let c = 0; c < m.cols; c++) {
        const idx = r * m.cols + c;
        if (idx >= total) break;
        const isLived   = idx < livedCount;
        const isCurrent = idx === livedCount;
        const ms = markers && markers.get(idx);
        const title = ms ? ms.map(x => `${x.emoji} ${x.label}`).join(' · ') : (mode === 'years' ? `ปีที่ ${idx + 1}` : undefined);
        cells.push(
          <div key={c} title={title}
            style={{
              width: cell, height: cell, borderRadius: cell >= 16 ? 4 : (cell >= 5 ? 2 : 1), flexShrink: 0,
              background: ms ? 'var(--rose)' : (isLived ? 'var(--accent)' : (isCurrent ? 'var(--amber)' : 'transparent')),
              border: (isLived || ms) ? 'none' : `1px solid ${isCurrent ? 'var(--amber-deep)' : 'var(--line-2)'}`,
              boxShadow: ms ? `0 0 0 ${cell >= 8 ? 2 : 1}px var(--rose)` : (isCurrent ? `0 0 0 ${cell >= 8 ? 2 : 1}px var(--amber-deep)` : 'none'),
            }} />
        );
      }
      out.push(
        <div key={r} style={{ display: 'flex', alignItems: 'center', gap: ROW_GAP }}>
          {showLabels && (
            <div style={{ width: LABEL_GUTTER, textAlign: 'right', fontFamily: 'var(--f-mono)', fontSize: 9, color: 'var(--ink-4)', flexShrink: 0 }}>
              {labelFor(r)}
            </div>
          )}
          <div style={{ display: 'flex', gap }}>{cells}</div>
        </div>
      );
    }
    return out;
  }, [mode, lifespan, livedCount, total, rows, m.cols, cell, gap, markers, showLabels]);

  return (
    <div className="card" ref={cardRef}>
      <div style={{ display: 'flex', flexDirection: 'column', gap, width: 'fit-content', margin: '0 auto' }}>
        {rowEls}
      </div>
      {/* Legend */}
      <div style={{ display: 'flex', gap: 18, marginTop: 18, flexWrap: 'wrap', fontFamily: 'var(--f-mono)', fontSize: 10.5, color: 'var(--ink-3)' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 11, height: 11, borderRadius: 2, background: 'var(--accent)' }} /> ผ่านมาแล้ว
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 11, height: 11, borderRadius: 2, background: 'var(--amber)', boxShadow: '0 0 0 1.5px var(--amber-deep)' }} /> ตอนนี้
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 11, height: 11, borderRadius: 2, border: '1px solid var(--line-2)' }} /> ยังมาไม่ถึง
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 11, height: 11, borderRadius: 2, background: 'var(--rose)' }} /> เหตุการณ์สำคัญ
        </span>
      </div>
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────
export function LifeCalendar() {
  const [birth, setBirth] = useState(() => localStorage.getItem(LS_BIRTH) || '');
  const [lifespan, setLifespan] = useState(() => Number(localStorage.getItem(LS_SPAN)) || 80);
  const [mode, setMode] = useState('weeks');
  const [fit, setFit] = useState(true);
  const [editing, setEditing] = useState(false);
  const [milestones, setMilestones] = useState(loadMilestones);
  const [addingMs, setAddingMs] = useState(false);

  const save = ({ birth: b, span }) => {
    localStorage.setItem(LS_BIRTH, b);
    localStorage.setItem(LS_SPAN, String(span));
    setBirth(b); setLifespan(span); setEditing(false);
  };

  const persistMilestones = (next) => {
    localStorage.setItem(LS_MILESTONES, JSON.stringify(next));
    setMilestones(next);
  };
  const addMilestone = (ms) => persistMilestones([...milestones, ms]);
  const removeMilestone = (id) => persistMilestones(milestones.filter(x => x.id !== id));

  const stats = useMemo(() => {
    if (!birth) return null;
    const birthMs = new Date(birth + 'T00:00:00').getTime();
    const ageMs = Date.now() - birthMs;
    const ageYears  = ageMs / MS_YEAR;
    const weeksLived  = Math.floor(ageMs / MS_WEEK);
    const monthsLived = Math.floor(ageYears * 12);
    const yearsLived  = Math.floor(ageYears);
    const pct = Math.min(100, (ageYears / lifespan) * 100);
    return {
      ageYears, weeksLived, monthsLived, yearsLived, pct,
      totalWeeks: lifespan * 52,
      weeksLeft: Math.max(0, lifespan * 52 - weeksLived),
      yearsLeft: Math.max(0, lifespan - ageYears),
      over: ageYears > lifespan,
    };
  }, [birth, lifespan]);

  const livedForMode = stats
    ? (mode === 'weeks' ? stats.weeksLived : mode === 'months' ? stats.monthsLived : stats.yearsLived)
    : 0;

  // Map cell-index → milestones for the active mode (for grid markers).
  const markerMap = useMemo(() => {
    const map = new Map();
    if (!birth) return map;
    const birthMs = new Date(birth + 'T00:00:00').getTime();
    for (const ms of milestones) {
      const idx = milestoneIndex(ms.date, birthMs, mode);
      if (idx < 0) continue;
      const cur = map.get(idx) || [];
      cur.push(ms);
      map.set(idx, cur);
    }
    return map;
  }, [milestones, birth, mode]);

  const sortedMilestones = useMemo(
    () => [...milestones].sort((a, b) => a.date.localeCompare(b.date)),
    [milestones]
  );

  const quote = QUOTES[(stats?.weeksLived || 0) % QUOTES.length];

  return (
    <>
      <PageHeader
        eyebrow="ชีวิต · เวลามีค่า"
        title="Life" em="Calendar"
        sub="ชีวิตหนึ่งมีไม่กี่สัปดาห์ — เห็นเป็นภาพแล้วใช้ทุกช่องให้คุ้ม"
        actions={birth && (
          <button className="btn btn--ghost" onClick={() => setEditing(true)}>
            <Icon name="tweak" size={14} /> ตั้งค่า
          </button>
        )}
      />

      <div className="page-body">
        {!birth || editing ? (
          editing ? (
            <SetupCard initialBirth={birth} initialSpan={lifespan} onSave={save} onCancel={birth ? () => setEditing(false) : undefined} />
          ) : (
            <EmptyState
              icon="⏳"
              title="เริ่มต้น Life Calendar ของคุณ"
              description="ใส่วันเกิดและอายุที่คาดหวัง แล้วเราจะวาดชีวิตทั้งหมดให้เห็นเป็นกริด — เตือนใจว่าแต่ละสัปดาห์มีค่า"
              actionLabel="+ ตั้งค่าวันเกิด"
              onAction={() => setEditing(true)}
            />
          )
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Quote */}
            <div style={{ fontFamily: 'var(--f-display)', fontStyle: 'italic', fontSize: 17, color: 'var(--accent-strong)' }}>
              “{quote}”
            </div>

            {/* Stats */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 14 }}>
              <Stat label="อายุ" value={`${stats.ageYears.toFixed(1)} ปี`} sub={`${fmtInt(stats.weeksLived)} สัปดาห์`} />
              <Stat label="ผ่านมาแล้ว" value={`${stats.pct.toFixed(1)}%`} sub={`ของ ${lifespan} ปี`} tone="var(--accent-strong)" />
              <Stat label="เหลืออีก" value={stats.over ? '—' : `${Math.floor(stats.yearsLeft)} ปี`} sub={stats.over ? 'เกินเป้าที่ตั้งไว้แล้ว 🎉' : `≈ ${fmtInt(stats.weeksLeft)} สัปดาห์`} tone="var(--profit)" />
              <Stat label="ทั้งชีวิต" value={`${fmtInt(stats.totalWeeks)}`} sub="สัปดาห์" />
            </div>

            {/* Progress bar */}
            <div>
              <div style={{ height: 8, borderRadius: 999, background: 'var(--fill)', overflow: 'hidden' }}>
                <div style={{ width: `${stats.pct}%`, height: '100%', background: 'var(--accent)', transition: 'width 400ms' }} />
              </div>
            </div>

            {/* Mode switch */}
            <div style={{ display: 'flex', gap: 6 }}>
              {MODES.map(md => (
                <button key={md.id} onClick={() => setMode(md.id)}
                  style={{
                    padding: '5px 14px', borderRadius: 'var(--radius-pill)', cursor: 'pointer',
                    fontFamily: 'var(--f-mono)', fontSize: 11,
                    border: `1px solid ${mode === md.id ? 'var(--accent)' : 'var(--line)'}`,
                    background: mode === md.id ? 'var(--accent-soft)' : 'transparent',
                    color: mode === md.id ? 'var(--accent-strong)' : 'var(--ink-3)',
                  }}>
                  {md.label}
                </button>
              ))}
              <button onClick={() => setFit(f => !f)}
                style={{
                  marginLeft: 'auto', padding: '5px 14px', borderRadius: 'var(--radius-pill)', cursor: 'pointer',
                  fontFamily: 'var(--f-mono)', fontSize: 11,
                  border: `1px solid ${fit ? 'var(--accent)' : 'var(--line)'}`,
                  background: fit ? 'var(--accent-soft)' : 'transparent',
                  color: fit ? 'var(--accent-strong)' : 'var(--ink-3)',
                }}>
                {fit ? '⤢ พอดีจอ' : '⤢ ขนาดปกติ'}
              </button>
            </div>

            <LifeGrid mode={mode} lifespan={lifespan} lived={livedForMode} markers={markerMap} fit={fit} />

            {/* Milestones */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <div className="card__title">เหตุการณ์สำคัญในชีวิต</div>
                {!addingMs && (
                  <button className="btn btn--ghost btn--sm" onClick={() => setAddingMs(true)}>
                    <Icon name="plus" size={13} /> เพิ่มเหตุการณ์
                  </button>
                )}
              </div>

              {addingMs && (
                <MilestoneForm onAdd={addMilestone} onClose={() => setAddingMs(false)} />
              )}

              {sortedMilestones.length === 0 ? (
                !addingMs && (
                  <div style={{ fontSize: 13, color: 'var(--ink-4)', fontStyle: 'italic' }}>
                    ยังไม่มีเหตุการณ์ — มาร์กช่วงสำคัญ เช่น วันเรียนจบ วันแต่งงาน หรือเป้าหมายในอนาคต แล้วมันจะไปปรากฏบนกริด
                  </div>
                )
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {sortedMilestones.map(ms => {
                    const birthMs = new Date(birth + 'T00:00:00').getTime();
                    const ageAt = (new Date(ms.date + 'T00:00:00').getTime() - birthMs) / MS_YEAR;
                    const yearsFromNow = (new Date(ms.date + 'T00:00:00').getTime() - Date.now()) / MS_YEAR;
                    const future = yearsFromNow > 0;
                    return (
                      <div key={ms.id} style={{
                        display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px',
                        borderRadius: 'var(--r-md)', border: '1px solid var(--line)',
                        background: future ? 'var(--surface)' : 'var(--surface-2)',
                      }}>
                        <span style={{ fontSize: 20 }}>{ms.emoji}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontFamily: 'var(--f-display)', fontSize: 14.5, color: 'var(--ink)' }}>{ms.label}</div>
                          <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10.5, color: 'var(--ink-4)' }}>
                            {new Date(ms.date + 'T00:00:00').toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })}
                            {ageAt >= 0 && ` · อายุ ${ageAt.toFixed(0)} ปี`}
                          </div>
                        </div>
                        <span style={{ fontFamily: 'var(--f-mono)', fontSize: 10.5, color: future ? 'var(--accent-strong)' : 'var(--ink-4)' }}>
                          {future ? `อีก ${Math.max(1, Math.round(yearsFromNow * 10) / 10)} ปี` : `ผ่านมา ${Math.round(Math.abs(yearsFromNow))} ปี`}
                        </span>
                        <button onClick={() => removeMilestone(ms.id)} title="ลบ"
                          style={{ color: 'var(--ink-4)', fontSize: 16, padding: '2px 4px', cursor: 'pointer' }}
                          onMouseEnter={e => e.currentTarget.style.color = 'var(--danger)'}
                          onMouseLeave={e => e.currentTarget.style.color = 'var(--ink-4)'}>×</button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
