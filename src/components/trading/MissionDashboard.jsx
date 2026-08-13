import { useMemo } from 'react';
import { Card, CardHeader, Badge } from '../ui/index.js';

/**
 * MissionDashboard — HA-50 demo mission tracker
 *
 * ระบบ HA-50 (XAUUSD · 1h · EMA50 + Heikin Ashi flip) backtest แล้ว expectancy ~0
 * ภารกิจนี้จึงวัด "วินัย" ไม่ใช่กำไร: 30 ไม้ demo · ทำตามกติกา ≥ 90% · Avg R > 0
 *
 * Render ได้แม้ยังไม่ได้รัน migration_add_trades_ha50.sql — จะโชว์ hint แทน
 */

const TARGET_TRADES   = 30;
const TARGET_RULE_PCT = 90;
const MISSION_SYSTEM  = 'HA-50';

export function MissionDashboard({ trades = [] }) {
  const m = useMemo(() => {
    const schemaReady = trades.length === 0 || trades.some(t => 'system' in t);

    const mission = trades.filter(t => t.system === MISSION_SYSTEM);
    const closed  = mission.filter(t => t.status && t.status !== 'OPEN');
    const n       = closed.length;

    const wins   = closed.filter(t => t.status === 'WIN').length;
    const losses = closed.filter(t => t.status === 'LOSS').length;
    const decided = wins + losses;
    const winRate = decided > 0 ? Math.round((wins / decided) * 100) : null;

    const rs = closed
      .map(t => Number(t.r_multiple))
      .filter(v => Number.isFinite(v));
    const avgR = rs.length > 0 ? rs.reduce((a, b) => a + b, 0) / rs.length : null;

    // Trades logged before the followed_rules column existed are null — they are
    // "unknown", not "broke the rules". Counting them as violations dragged the
    // discipline score down for every historical trade.
    const rated    = closed.filter(t => t.followed_rules != null);
    const followed = rated.filter(t => t.followed_rules === true).length;
    const rulePct  = rated.length > 0 ? Math.round((followed / rated.length) * 100) : null;

    return { schemaReady, n, wins, losses, winRate, avgR, rs, rulePct, followed, ratedCount: rated.length };
  }, [trades]);

  const pct = Math.min(100, Math.round((m.n / TARGET_TRADES) * 100));

  const criteria = [
    {
      label: `ครบ ${TARGET_TRADES} ไม้`,
      detail: `ปิดแล้ว ${m.n}/${TARGET_TRADES} ไม้`,
      state: m.n >= TARGET_TRADES ? 'pass' : 'pending',
    },
    {
      label: `ทำตามกติกา ≥ ${TARGET_RULE_PCT}%`,
      detail: m.rulePct == null ? 'ยังไม่มีข้อมูล' : `${m.rulePct}% (${m.followed}/${m.ratedCount} ไม้ที่บันทึกไว้)`,
      state: m.rulePct == null ? 'pending' : m.rulePct >= TARGET_RULE_PCT ? 'pass' : 'fail',
    },
    {
      label: 'Avg R > 0',
      detail: m.avgR == null ? 'ยังไม่มีค่า R' : `${m.avgR >= 0 ? '+' : ''}${m.avgR.toFixed(2)}R จาก ${m.rs.length} ไม้`,
      state: m.avgR == null ? 'pending' : m.avgR > 0 ? 'pass' : 'fail',
    },
  ];

  return (
    <Card>
      <CardHeader
        eyebrow="🎯 HA-50 MISSION"
        title="ภารกิจ 30 ไม้ — วัดวินัย ไม่ใช่กำไร"
        meta="XAUUSD · 1h · EMA50 + Heikin Ashi flip · เสี่ยง 1% ต่อไม้"
      />

      {!m.schemaReady && (
        <div style={{
          marginBottom: 14, padding: '10px 14px',
          background: 'var(--warning-soft)', color: 'var(--accent-strong)',
          border: '1px solid var(--warning)', borderRadius: 'var(--radius-control)',
          fontSize: 12.5, lineHeight: 1.6,
        }}>
          ⏳ รอ migration — ยังไม่ได้รัน <code>supabase/migration_add_trades_ha50.sql</code> ใน Supabase
          ตัวเลขจะเริ่มนับหลังรัน SQL แล้วบันทึกไม้ใหม่
        </div>
      )}

      {/* Progress */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
          <span style={{ fontFamily: 'var(--f-mono)', fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
            ความคืบหน้า
          </span>
          <span style={{ fontFamily: 'var(--f-mono)', fontSize: 12.5, color: 'var(--text-primary)', fontWeight: 500 }}>
            {m.n} / {TARGET_TRADES} ไม้ · {pct}%
          </span>
        </div>
        <div style={{
          height: 6, borderRadius: 3,
          background: 'var(--surface-muted)',
          overflow: 'hidden',
        }}>
          <div style={{
            width: `${pct}%`, height: '100%', borderRadius: 3,
            background: pct >= 100 ? 'var(--success)' : 'var(--accent)',
            transition: 'width 240ms',
          }} />
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10, marginBottom: 16 }}>
        <Stat label="ไม้ที่ปิดแล้ว" value={String(m.n)} sub={`${m.wins}W / ${m.losses}L`} />
        <Stat label="Winrate" value={m.winRate == null ? '—' : `${m.winRate}%`}
          color={m.winRate == null ? undefined : m.winRate >= 50 ? 'var(--success)' : 'var(--accent-strong)'} />
        <Stat label="Avg R" value={m.avgR == null ? '—' : `${m.avgR >= 0 ? '+' : ''}${m.avgR.toFixed(2)}R`}
          sub={m.avgR == null ? 'expectancy' : `จาก ${m.rs.length} ไม้`}
          color={m.avgR == null ? undefined : m.avgR > 0 ? 'var(--success)' : 'var(--danger)'} />
        <Stat label="% ทำตามกติกา" value={m.rulePct == null ? '—' : `${m.rulePct}%`}
          sub={m.rulePct == null ? 'เป้า ≥ 90%' : `เป้า ≥ ${TARGET_RULE_PCT}%`}
          color={m.rulePct == null ? undefined : m.rulePct >= TARGET_RULE_PCT ? 'var(--success)' : 'var(--danger)'} />
      </div>

      {/* Pass criteria */}
      <div style={{ fontFamily: 'var(--f-mono)', fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>
        เกณฑ์ผ่านภารกิจ
      </div>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {criteria.map((c, i) => <CriterionRow key={c.label} {...c} isLast={i === criteria.length - 1} />)}
      </div>

      <div style={{
        marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border)',
        fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6, fontStyle: 'italic',
      }}>
        เป้าหมายของ 30 ไม้แรกคือวินัย ไม่ใช่กำไร — ผ่านเกณฑ์ครบก่อน แล้วค่อยคุยเรื่องขยับขนาด
      </div>
    </Card>
  );
}

// ────────────────────────────────────────────────────────────────────────────
function Stat({ label, value, sub, color = 'var(--text-primary)' }) {
  return (
    <div style={{
      padding: '12px 14px', background: 'var(--background-soft)',
      border: '1px solid var(--border)', borderRadius: 'var(--radius-control)',
    }}>
      <div style={{ fontFamily: 'var(--f-mono)', fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
        {label}
      </div>
      <div style={{ fontFamily: 'var(--f-display)', fontSize: 22, color, marginTop: 4, fontWeight: 600, lineHeight: 1.1, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </div>
      {sub && <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

const STATE_STYLE = {
  pass:    { icon: '✅', tone: 'success', label: 'ผ่าน',   color: 'var(--success)' },
  pending: { icon: '⏳', tone: 'neutral', label: 'รออยู่', color: 'var(--text-muted)' },
  fail:    { icon: '❌', tone: 'danger',  label: 'ไม่ผ่าน', color: 'var(--danger)' },
};

function CriterionRow({ label, detail, state, isLast }) {
  const st = STATE_STYLE[state] || STATE_STYLE.pending;
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
      minHeight: 40, padding: '6px 2px',
      borderBottom: isLast ? 'none' : '1px solid var(--border)',
    }}>
      <span style={{ fontSize: 14, flexShrink: 0 }}>{st.icon}</span>
      <span style={{ fontSize: 13, color: 'var(--text-primary)', flex: 1, minWidth: 120 }}>{label}</span>
      <span style={{ fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--text-secondary)' }}>{detail}</span>
      <Badge tone={st.tone} size="sm" style={{ marginLeft: 'auto' }}>{st.label}</Badge>
    </div>
  );
}
