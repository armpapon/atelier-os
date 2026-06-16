import { useState, useMemo } from 'react';
import { Icon } from '../components/Icon.jsx';
import { PageHeader } from '../components/PageHeader.jsx';
import { EmptyState } from '../components/ui/index.js';

const LS_BIRTH = 'loop:life-birthdate';
const LS_SPAN  = 'loop:life-lifespan';

const MS_DAY  = 86400000;
const MS_WEEK = 7 * MS_DAY;
const MS_YEAR = 365.2425 * MS_DAY;

const QUOTES = [
  'เวลาที่ผ่านไปไม่ย้อนกลับ — ใช้สัปดาห์นี้ให้คุ้ม',
  'ชีวิตไม่ได้สั้น แต่เราเสียเวลาไปเยอะ — Seneca',
  'อย่ารอ "วันหนึ่ง" เพราะ "วันหนึ่ง" ไม่มีในปฏิทิน',
  'คุณมีเวลาน้อยกว่าที่คิด และมากพอที่จะเริ่มวันนี้',
];

const MODES = [
  { id: 'weeks',  label: 'สัปดาห์', cols: 52, cell: 10, gap: 3 },
  { id: 'months', label: 'เดือน',   cols: 12, cell: 17, gap: 5 },
  { id: 'years',  label: 'ปี',      cols: 10, cell: 26, gap: 6 },
];

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
        <span style={{ fontFamily: 'var(--f-mono)', fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--ink-3)' }}>วันเกิด</span>
        <input type="date" className="input" value={birth} onChange={e => setBirth(e.target.value)} required autoFocus max={new Date().toISOString().split('T')[0]} />
      </label>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={{ fontFamily: 'var(--f-mono)', fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--ink-3)' }}>อายุที่คาดหวัง (ปี)</span>
        <input type="number" className="input" value={span} onChange={e => setSpan(e.target.value)} min={1} max={120} />
      </label>
      <div style={{ display: 'flex', gap: 10 }}>
        {onCancel && <button type="button" className="btn btn--ghost" onClick={onCancel} style={{ flex: 1 }}>ยกเลิก</button>}
        <button type="submit" className="btn btn--primary" style={{ flex: 2 }}>บันทึก</button>
      </div>
    </form>
  );
}

// ── Stat ────────────────────────────────────────────────────────────────────
function Stat({ label, value, sub, tone }) {
  return (
    <div className="card" style={{ padding: 16 }}>
      <div className="stat__label">{label}</div>
      <div className="stat__value" style={{ fontSize: 26, color: tone || 'var(--ink)' }}>{value}</div>
      {sub && <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10.5, color: 'var(--ink-4)', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

// ── Life grid ─────────────────────────────────────────────────────────────────
function LifeGrid({ mode, lifespan, lived }) {
  const m = MODES.find(x => x.id === mode);
  const total = mode === 'years' ? lifespan : lifespan * m.cols;
  const rows = Math.ceil(total / m.cols);
  const livedCount = Math.min(lived, total);

  const labelFor = (rowIdx) => {
    if (mode === 'years') return `${rowIdx * 10}`;          // decade
    return rowIdx % 10 === 0 ? `${rowIdx}` : '';            // age in years
  };

  const rowEls = useMemo(() => {
    const out = [];
    for (let r = 0; r < rows; r++) {
      const cells = [];
      for (let c = 0; c < m.cols; c++) {
        const idx = r * m.cols + c;
        if (idx >= total) break;
        const isLived   = idx < livedCount;
        const isCurrent = idx === livedCount;
        cells.push(
          <div key={c} title={mode === 'years' ? `ปีที่ ${idx + 1}` : undefined}
            style={{
              width: m.cell, height: m.cell, borderRadius: mode === 'years' ? 4 : 2,
              background: isLived ? 'var(--accent)' : (isCurrent ? 'var(--amber)' : 'transparent'),
              border: isLived ? 'none' : `1px solid ${isCurrent ? 'var(--amber-deep)' : 'var(--line-2)'}`,
              boxShadow: isCurrent ? '0 0 0 2px var(--amber-deep)' : 'none',
              flexShrink: 0,
            }} />
        );
      }
      out.push(
        <div key={r} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 22, textAlign: 'right', fontFamily: 'var(--f-mono)', fontSize: 9, color: 'var(--ink-4)', flexShrink: 0 }}>
            {labelFor(r)}
          </div>
          <div style={{ display: 'flex', gap: m.gap }}>{cells}</div>
        </div>
      );
    }
    return out;
  }, [mode, lifespan, livedCount, total, rows, m.cols, m.cell, m.gap]);

  return (
    <div className="card" style={{ overflowX: 'auto' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: m.gap, width: 'fit-content' }}>
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
      </div>
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────
export function LifeCalendar() {
  const [birth, setBirth] = useState(() => localStorage.getItem(LS_BIRTH) || '');
  const [lifespan, setLifespan] = useState(() => Number(localStorage.getItem(LS_SPAN)) || 80);
  const [mode, setMode] = useState('weeks');
  const [editing, setEditing] = useState(false);

  const save = ({ birth: b, span }) => {
    localStorage.setItem(LS_BIRTH, b);
    localStorage.setItem(LS_SPAN, String(span));
    setBirth(b); setLifespan(span); setEditing(false);
  };

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
              <div style={{ height: 8, borderRadius: 999, background: 'var(--surface-muted)', overflow: 'hidden' }}>
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
              <span style={{ alignSelf: 'center', marginLeft: 6, fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--ink-4)' }}>
                1 ช่อง = 1 {MODES.find(x => x.id === mode).label} · ตัวเลขซ้าย = อายุ (ปี)
              </span>
            </div>

            <LifeGrid mode={mode} lifespan={lifespan} lived={livedForMode} />
          </div>
        )}
      </div>
    </>
  );
}
