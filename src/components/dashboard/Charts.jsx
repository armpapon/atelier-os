import { formatBaht } from './KPICard.jsx';
import { Card, CardHeader, Badge, EmptyState } from '../ui/index.js';

const CATEGORY_COLORS = {
  food:      'var(--accent)',
  transport: 'var(--blue)',
  bills:     'var(--warning)',
  income:    'var(--success)',
  shop:      'var(--violet)',
  family:    'var(--rose)',
  other:     'var(--text-muted)',
};

const CATEGORY_ICONS = {
  food: '🍜', transport: '🚗', bills: '💡',
  income: '💰', shop: '🛍', family: '❤️', other: '📦',
};

// ── Spending by Category ────────────────────────────────────────────────────
export function CategoryBreakdown({ data, totalExpense }) {
  if (!data?.length) {
    return (
      <Card>
        <CardHeader eyebrow="หมวด" title="รายจ่ายตามหมวด" />
        <EmptyState
          icon="🍜"
          title="ยังไม่มีรายจ่ายเดือนนี้"
          description="เมื่อมีรายจ่าย จะแบ่งเป็นหมวด เช่น อาหาร เดินทาง บิล ให้อัตโนมัติ"
          compact
        />
      </Card>
    );
  }

  const top = data.slice(0, 8);
  const maxAmount = top[0]?.amount || 1;

  return (
    <Card>
      <CardHeader
        eyebrow={`หมวด · TOP ${top.length} จาก ${data.length}`}
        title="รายจ่ายตามหมวด"
        meta={`รวม -${formatBaht(totalExpense, { compact: true })}`}
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {top.map(row => {
          const pct      = (row.amount / maxAmount) * 100;
          const ofTotal  = totalExpense > 0 ? (row.amount / totalExpense) * 100 : 0;
          const color    = CATEGORY_COLORS[row.type] || CATEGORY_COLORS.other;
          const icon     = CATEGORY_ICONS[row.type]  || CATEGORY_ICONS.other;
          return (
            <div key={row.category}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5, fontSize: 12.5 }}>
                <span style={{ color: 'var(--text-primary)' }}>
                  <span style={{ marginRight: 8 }}>{icon}</span>{row.category}
                  <span style={{ marginLeft: 8, color: 'var(--text-muted)', fontFamily: 'var(--f-mono)', fontSize: 10.5, fontVariantNumeric: 'tabular-nums' }}>
                    {row.count} ครั้ง
                  </span>
                </span>
                <span style={{ fontFamily: 'var(--f-mono)', color: 'var(--text-primary)', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                  ฿{Math.round(row.amount).toLocaleString('th')}
                  <span style={{ color: 'var(--text-muted)', marginLeft: 6, fontSize: 10.5, fontWeight: 400 }}>
                    {ofTotal.toFixed(0)}%
                  </span>
                </span>
              </div>
              <div style={{ height: 4, background: 'var(--fill)', borderRadius: 999, overflow: 'hidden' }}>
                <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 999, transition: 'width 300ms' }} />
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

// ── Top Expenses ────────────────────────────────────────────────────────────
export function TopExpenses({ data }) {
  if (!data?.length) {
    return (
      <Card>
        <CardHeader eyebrow="Top 10" title="รายจ่ายใหญ่สุด" />
        <EmptyState
          icon="💸"
          title="ยังไม่มีรายจ่าย"
          description="เมื่อมีรายการ จะแสดง 10 อันดับรายจ่ายที่ใหญ่ที่สุดของเดือน"
          compact
        />
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader
        eyebrow={`Top ${data.length}`}
        title="รายจ่ายใหญ่สุด"
        meta="เรียงจากมากไปน้อย"
      />

      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {data.map((t, i) => (
          <div key={t.id || i} style={{
            display: 'grid', gridTemplateColumns: '22px 56px 1fr auto', gap: 10,
            padding: '9px 0', alignItems: 'center', fontSize: 12.5,
            borderTop: i === 0 ? 'none' : '1px solid var(--hairline)',
          }}>
            <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
              {String(i + 1).padStart(2, '0')}
            </div>
            <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10.5, color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
              {(t.occurred_at || '').substring(5, 10).replace('-', '/')}
            </div>
            <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-primary)' }}>
              {t.title}
              <span style={{ marginLeft: 8, fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--text-muted)' }}>
                {t.category}
              </span>
            </div>
            <div style={{ fontFamily: 'var(--f-mono)', fontSize: 12.5, color: 'var(--danger)', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
              -฿{Math.abs(t.amount).toLocaleString('th', { maximumFractionDigits: 0 })}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ── Budget vs Actual ────────────────────────────────────────────────────────
export function BudgetProgress({ budgets, categoryActuals, onAddBudget }) {
  if (!budgets?.length) {
    return (
      <Card>
        <CardHeader eyebrow="งบประมาณ" title="งบ vs จ่ายจริง" />
        <EmptyState
          icon="◎"
          title="ยังไม่ได้ตั้งงบเดือนนี้"
          description="ตั้งงบต่อหมวด (อาหาร เดินทาง บิล) เพื่อ track การใช้จ่ายให้อยู่ในแผน"
          actionLabel={onAddBudget ? 'ตั้งงบแรก' : null}
          onAction={onAddBudget}
          compact
        />
      </Card>
    );
  }

  const actualMap = {};
  categoryActuals?.forEach(c => { actualMap[c.category] = c.amount; });

  return (
    <Card>
      <CardHeader
        eyebrow={`งบประมาณ · ${budgets.length} หมวด`}
        title="งบ vs จ่ายจริง"
        meta="แถบเตือนเมื่อใกล้/เกินงบ"
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
        {budgets.map(b => {
          const limit  = Number(b.monthly_limit) || 0;
          const actual = actualMap[b.category] || 0;
          const pct    = limit > 0 ? (actual / limit) * 100 : 0;
          const tone   = pct >= 100 ? 'danger' : pct >= 80 ? 'warning' : 'success';
          const colors = {
            success: { bg: 'var(--success)', text: 'var(--success)' },
            warning: { bg: 'var(--warning)', text: 'var(--accent-strong)' },
            danger:  { bg: 'var(--danger)',  text: 'var(--danger)' },
          }[tone];

          return (
            <div key={b.id}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5, fontSize: 12.5 }}>
                <span style={{ color: 'var(--text-primary)' }}>
                  {b.category}
                  {tone === 'danger' && <Badge tone="danger" size="sm" style={{ marginLeft: 8 }}>เกินงบ</Badge>}
                </span>
                <span style={{ fontFamily: 'var(--f-mono)', color: 'var(--text-primary)', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                  ฿{Math.round(actual).toLocaleString('th')}
                  <span style={{ color: 'var(--text-muted)', margin: '0 4px', fontWeight: 400 }}>/</span>
                  ฿{Math.round(limit).toLocaleString('th')}
                  <span style={{ color: colors.text, marginLeft: 8, fontSize: 11, fontWeight: 500 }}>
                    {pct.toFixed(0)}%
                  </span>
                </span>
              </div>
              <div style={{ height: 4, background: 'var(--fill)', borderRadius: 999, overflow: 'hidden', position: 'relative' }}>
                <div style={{
                  width: `${Math.min(100, pct)}%`, height: '100%',
                  background: colors.bg, borderRadius: 999, transition: 'width 300ms',
                }} />
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

// ── Net Worth Card ──────────────────────────────────────────────────────────
// `unconfirmed` (audit B4): the post-anchor ledger could not be read, so the
// figures below are stale anchors. They are shown — labelled — never as truth.
export function NetWorthCard({ accounts, unconfirmed = false }) {
  if (!accounts?.length) {
    return (
      <Card style={{ height: '100%' }}>
        <CardHeader eyebrow="มูลค่าสุทธิ" title="Net Worth" />
        <EmptyState
          icon="💼"
          title="ยังไม่มีบัญชี"
          description="เพิ่มบัญชี/ทรัพย์สิน หรือ import จาก Make จะสร้างให้อัตโนมัติ"
          compact
        />
      </Card>
    );
  }

  let assets = 0, liabilities = 0;
  for (const a of accounts) {
    const bal = Number(a.current_balance ?? a.balance) || 0;
    if (a.type === 'debt' || bal < 0) liabilities += Math.abs(bal);
    else assets += bal;
  }
  const net = assets - liabilities;
  const debtRatio = assets > 0 ? (liabilities / assets) * 100 : 0;

  return (
    <Card style={{ height: '100%' }}>
      <CardHeader
        eyebrow={`มูลค่าสุทธิ · ${accounts.length} บัญชี`}
        title="Net Worth"
        meta={unconfirmed ? 'สินทรัพย์ − หนี้สิน · ยังไม่ยืนยัน' : 'สินทรัพย์ − หนี้สิน'}
      />

      {unconfirmed && (
        <div style={{
          fontVariantNumeric: 'tabular-nums',
          fontWeight: 500, fontSize: 13,
          color: 'var(--warning)', marginBottom: 8
        }}>
          ⚠️ ยังไม่ยืนยัน — ยังไม่รวมรายการหลังวันตั้งต้น
        </div>
      )}

      <div style={{
        fontFamily: 'var(--f-display)', fontSize: 34, fontWeight: 600,
        color: unconfirmed ? 'var(--warning)' : (net >= 0 ? 'var(--text-primary)' : 'var(--danger)'),
        marginBottom: 16, letterSpacing: '-0.01em', fontVariantNumeric: 'tabular-nums',
      }}>
        ฿{net.toLocaleString('th', { maximumFractionDigits: 0 })}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <NWRow label="สินทรัพย์" value={assets} color="var(--success)" />
        <NWRow label="หนี้สิน"    value={liabilities} color="var(--danger)" sign="-" />
        <div style={{ height: 1, background: 'var(--hairline)', margin: '4px 0' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5 }}>
          <span style={{ color: 'var(--text-muted)', fontFamily: 'var(--f-mono)'}}>DEBT RATIO</span>
          <Badge tone={debtRatio > 50 ? 'danger' : debtRatio > 30 ? 'warning' : 'success'} size="sm">
            {debtRatio.toFixed(1)}%
          </Badge>
        </div>
      </div>

      <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--hairline)', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {accounts.slice(0, 4).map(a => {
          const bal = Number(a.current_balance ?? a.balance) || 0;
          const isDebt = a.type === 'debt' || bal < 0;
          return (
            <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
              <span style={{ color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 160 }}>
                {a.name}
              </span>
              <span style={{
                fontFamily: 'var(--f-mono)',
                color: isDebt ? 'var(--danger)' : 'var(--text-primary)',
                fontVariantNumeric: 'tabular-nums',
              }}>
                {isDebt ? '-' : ''}฿{Math.abs(bal).toLocaleString('th', { maximumFractionDigits: 0 })}
              </span>
            </div>
          );
        })}
        {accounts.length > 4 && (
          <div style={{ fontSize: 10.5, color: 'var(--text-muted)', fontFamily: 'var(--f-mono)', textAlign: 'center', marginTop: 4 }}>
            +{accounts.length - 4} บัญชี
          </div>
        )}
      </div>
    </Card>
  );
}

function NWRow({ label, value, color, sign = '' }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
      <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
      <span style={{ fontFamily: 'var(--f-mono)', color, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
        {sign}฿{value.toLocaleString('th', { maximumFractionDigits: 0 })}
      </span>
    </div>
  );
}

// ── Daily Heatmap ───────────────────────────────────────────────────────────
export function DailyHeatmap({ dailyMap, yearMonth }) {
  const [y, m] = yearMonth.split('-').map(Number);
  const firstDay   = new Date(y, m - 1, 1);
  const daysInMon  = new Date(y, m, 0).getDate();
  const firstWday  = (firstDay.getDay() + 6) % 7;

  const values = Object.values(dailyMap);
  const max = Math.max(...values, 1);
  const total = values.reduce((s, v) => s + v, 0);
  const activeDays = values.length;
  const avg = activeDays > 0 ? total / activeDays : 0;

  const cells = [];
  for (let i = 0; i < firstWday; i++) cells.push(null);
  for (let d = 1; d <= daysInMon; d++) {
    const k = String(d).padStart(2, '0');
    cells.push({ day: d, amount: dailyMap[k] || 0 });
  }

  const intensity = (amt) => {
    if (amt <= 0) return 0;
    const ratio = amt / max;
    if (ratio < 0.25) return 1;
    if (ratio < 0.5)  return 2;
    if (ratio < 0.75) return 3;
    return 4;
  };

  // Warm earth shades — light tints → deeper clay, all token-driven so dark mode inverts cleanly
  const SHADES = [
    'var(--surface-muted)',
    'var(--accent-tint)',
    'var(--accent-soft)',
    'var(--accent)',
    'var(--accent-strong)',
  ];

  return (
    <Card>
      <CardHeader
        eyebrow={`ปฏิทินรายจ่าย · ${activeDays} วัน`}
        title="Daily Spending"
        meta={`เฉลี่ย ฿${Math.round(avg).toLocaleString('th')}/วัน`}
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: 6 }}>
        {['จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส', 'อา'].map((d, i) => (
          <div key={i} style={{
            fontVariantNumeric: 'tabular-nums',
            textAlign: 'center', fontSize: 10, color: 'var(--text-muted)', fontWeight: 500
          }}>{d}</div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
        {cells.map((c, i) => {
          if (!c) return <div key={i} />;
          const lvl = intensity(c.amount);
          return (
            <div key={i}
              title={c.amount > 0 ? `${c.day}: ฿${Math.round(c.amount).toLocaleString('th')}` : `${c.day}: ไม่มีรายจ่าย`}
              style={{
                aspectRatio: '1', borderRadius: 6,
                background: SHADES[lvl],
                border: '1px solid ' + (lvl > 0 ? 'transparent' : 'var(--hairline)'),
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, color: lvl >= 3 ? 'var(--text-inverse)' : 'var(--text-secondary)',
                fontFamily: 'var(--f-mono)', cursor: 'default',
                fontVariantNumeric: 'tabular-nums',
                transition: 'transform 100ms',
              }}>
              {c.day}
            </div>
          );
        })}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 14, fontSize: 10.5, color: 'var(--text-muted)', fontFamily: 'var(--f-mono)' }}>
        <span>น้อย</span>
        {SHADES.map((c, i) => (
          <div key={i} style={{
            width: 14, height: 14, borderRadius: 3, background: c,
            border: '1px solid ' + (i > 0 ? 'transparent' : 'var(--hairline)'),
          }} />
        ))}
        <span>มาก</span>
      </div>
    </Card>
  );
}

export function EmptyCard({ label }) {
  return (
    <Card>
      <EmptyState description={label} compact />
    </Card>
  );
}
