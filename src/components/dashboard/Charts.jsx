import { formatBaht } from './KPICard.jsx';

const CATEGORY_COLORS = {
  food:      '#e87f4f',
  transport: '#6fb8d9',
  bills:     '#d9a14f',
  income:    '#5fb878',
  shop:      '#c884d4',
  family:    '#e0708f',
  other:     '#8a8580',
};

const CATEGORY_ICONS = {
  food: '🍜', transport: '🚗', bills: '💡',
  income: '💰', shop: '🛍', family: '❤️', other: '📦',
};

// ── Spending by Category (horizontal bars) ───────────────────────────────────
export function CategoryBreakdown({ data, totalExpense }) {
  if (!data?.length) return <EmptyCard label="ไม่มีรายจ่ายในเดือนนี้" />;

  const top = data.slice(0, 8);
  const maxAmount = top[0]?.amount || 1;

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--r-lg)', padding: '18px 20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 14 }}>
        <div>
          <div style={{ fontFamily: 'var(--f-display)', fontSize: 16, color: 'var(--ink)' }}>
            รายจ่ายตามหมวด
          </div>
          <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--ink-3)', marginTop: 3, letterSpacing: '0.1em' }}>
            TOP {top.length} · จาก {data.length} หมวด
          </div>
        </div>
        <div style={{ fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--ink-3)' }}>
          รวม -{formatBaht(totalExpense, { compact: true })}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
        {top.map(row => {
          const pct      = (row.amount / maxAmount) * 100;
          const ofTotal  = totalExpense > 0 ? (row.amount / totalExpense) * 100 : 0;
          const color    = CATEGORY_COLORS[row.type] || CATEGORY_COLORS.other;
          const icon     = CATEGORY_ICONS[row.type]  || CATEGORY_ICONS.other;
          return (
            <div key={row.category}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 12 }}>
                <span style={{ color: 'var(--ink-2)' }}>
                  <span style={{ marginRight: 6 }}>{icon}</span>{row.category}
                  <span style={{ marginLeft: 8, color: 'var(--ink-4)', fontFamily: 'var(--f-mono)', fontSize: 10 }}>
                    {row.count} ครั้ง
                  </span>
                </span>
                <span style={{ fontFamily: 'var(--f-mono)', color: 'var(--ink)' }}>
                  ฿{Math.round(row.amount).toLocaleString('th')}
                  <span style={{ color: 'var(--ink-4)', marginLeft: 6, fontSize: 10 }}>
                    {ofTotal.toFixed(0)}%
                  </span>
                </span>
              </div>
              <div style={{ height: 6, background: 'var(--surface-2)', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ width: `${pct}%`, height: '100%', background: color, transition: 'width 300ms' }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Top 10 Expenses (list) ───────────────────────────────────────────────────
export function TopExpenses({ data }) {
  if (!data?.length) return <EmptyCard label="ยังไม่มีรายจ่าย" />;

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--r-lg)', padding: '18px 20px' }}>
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontFamily: 'var(--f-display)', fontSize: 16, color: 'var(--ink)' }}>
          Top {data.length} รายจ่าย
        </div>
        <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--ink-3)', marginTop: 3, letterSpacing: '0.1em' }}>
          เรียงจากมากไปน้อย · คลิกเพื่อดูรายละเอียด
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        {data.map((t, i) => (
          <div key={t.id || i} style={{
            display: 'grid', gridTemplateColumns: '20px 60px 1fr auto', gap: 10,
            padding: '8px 0', alignItems: 'center', fontSize: 12,
            borderBottom: i < data.length - 1 ? '1px solid var(--line)' : 0,
          }}>
            <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--ink-4)' }}>
              {String(i + 1).padStart(2, '0')}
            </div>
            <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--ink-3)' }}>
              {(t.occurred_at || '').substring(5, 10).replace('-', '/')}
            </div>
            <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--ink)' }}>
              {t.title}
              <span style={{ marginLeft: 8, fontFamily: 'var(--f-mono)', fontSize: 9.5, color: 'var(--ink-4)' }}>
                {t.category}
              </span>
            </div>
            <div style={{ fontFamily: 'var(--f-mono)', fontSize: 12, color: 'var(--loss)', fontWeight: 500 }}>
              -฿{Math.abs(t.amount).toLocaleString('th', { maximumFractionDigits: 0 })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Budget vs Actual ─────────────────────────────────────────────────────────
export function BudgetProgress({ budgets, categoryActuals }) {
  if (!budgets?.length) {
    return (
      <div style={{ background: 'var(--surface)', border: '1px dashed var(--line)', borderRadius: 'var(--r-lg)', padding: '24px 20px' }}>
        <div style={{ fontFamily: 'var(--f-display)', fontSize: 16, color: 'var(--ink)', marginBottom: 4 }}>
          งบรายเดือน
        </div>
        <div style={{ fontSize: 12, color: 'var(--ink-3)', marginBottom: 16 }}>
          ยังไม่ได้ตั้งงบเดือนนี้ — ตั้งงบเพื่อ track การใช้จ่ายให้อยู่ในแผน
        </div>
        <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--ink-4)' }}>
          กดปุ่ม "+ บัญชี" ในหน้าการเงินเพื่อเพิ่ม budget ต่อหมวด
        </div>
      </div>
    );
  }

  // Build map of actuals
  const actualMap = {};
  categoryActuals?.forEach(c => { actualMap[c.category] = c.amount; });

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--r-lg)', padding: '18px 20px' }}>
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontFamily: 'var(--f-display)', fontSize: 16, color: 'var(--ink)' }}>
          งบ vs จ่ายจริง
        </div>
        <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--ink-3)', marginTop: 3, letterSpacing: '0.1em' }}>
          {budgets.length} หมวด · แถบเตือนเมื่อใกล้/เกินงบ
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
        {budgets.map(b => {
          const limit  = Number(b.monthly_limit) || 0;
          const actual = actualMap[b.category] || 0;
          const pct    = limit > 0 ? (actual / limit) * 100 : 0;
          const tone   = pct >= 100 ? 'loss' : pct >= 80 ? 'amber' : 'profit';
          const colors = {
            profit: { bg: 'var(--profit)', text: 'var(--profit)' },
            amber:  { bg: 'var(--amber)',  text: 'var(--amber)'  },
            loss:   { bg: 'var(--loss)',   text: 'var(--loss)'   },
          }[tone];

          return (
            <div key={b.id}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 12 }}>
                <span style={{ color: 'var(--ink-2)' }}>
                  {b.category}
                  {tone === 'loss' && <span style={{ marginLeft: 6, color: 'var(--loss)' }}>⚠️</span>}
                </span>
                <span style={{ fontFamily: 'var(--f-mono)', color: 'var(--ink)' }}>
                  ฿{Math.round(actual).toLocaleString('th')}
                  <span style={{ color: 'var(--ink-4)', margin: '0 4px' }}>/</span>
                  ฿{Math.round(limit).toLocaleString('th')}
                  <span style={{ color: colors.text, marginLeft: 8, fontSize: 10.5 }}>
                    {pct.toFixed(0)}%
                  </span>
                </span>
              </div>
              <div style={{ height: 8, background: 'var(--surface-2)', borderRadius: 4, overflow: 'hidden', position: 'relative' }}>
                <div style={{
                  width: `${Math.min(100, pct)}%`, height: '100%',
                  background: colors.bg, transition: 'width 300ms',
                }} />
                {pct > 100 && (
                  <div style={{ position: 'absolute', top: 0, right: 0, fontSize: 9, color: 'var(--loss)', padding: '0 4px', fontFamily: 'var(--f-mono)' }}>
                    +{(pct - 100).toFixed(0)}%
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Net Worth Card (assets - liabilities) ────────────────────────────────────
export function NetWorthCard({ accounts }) {
  if (!accounts?.length) {
    return (
      <div style={{ background: 'var(--surface)', border: '1px dashed var(--line)', borderRadius: 'var(--r-lg)', padding: '24px 20px', height: '100%' }}>
        <div style={{ fontFamily: 'var(--f-display)', fontSize: 16, color: 'var(--ink)', marginBottom: 4 }}>
          มูลค่าสุทธิ
        </div>
        <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>
          ยังไม่ได้เพิ่มบัญชี — เพิ่มบัญชี/ทรัพย์สิน/หนี้สินในหน้าการเงิน
        </div>
      </div>
    );
  }

  let assets = 0, liabilities = 0;
  for (const a of accounts) {
    const bal = Number(a.current_balance) || 0;
    if (a.type === 'debt' || bal < 0) liabilities += Math.abs(bal);
    else assets += bal;
  }
  const net = assets - liabilities;
  const debtRatio = assets > 0 ? (liabilities / assets) * 100 : 0;

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--r-lg)', padding: '18px 20px', height: '100%' }}>
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontFamily: 'var(--f-display)', fontSize: 16, color: 'var(--ink)' }}>
          มูลค่าสุทธิ
        </div>
        <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--ink-3)', marginTop: 3, letterSpacing: '0.1em' }}>
          {accounts.length} บัญชี · สินทรัพย์ − หนี้สิน
        </div>
      </div>

      <div style={{
        fontFamily: 'var(--f-display)', fontSize: 32,
        color: net >= 0 ? 'var(--ink)' : 'var(--loss)',
        marginBottom: 12,
      }}>
        ฿{net.toLocaleString('th', { maximumFractionDigits: 0 })}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <NWRow label="สินทรัพย์" value={assets} color="var(--profit)" />
        <NWRow label="หนี้สิน"    value={liabilities} color="var(--loss)" sign="-" />
        <div style={{ height: 1, background: 'var(--line)', margin: '4px 0' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
          <span style={{ color: 'var(--ink-3)', fontFamily: 'var(--f-mono)', letterSpacing: '0.1em' }}>DEBT RATIO</span>
          <span style={{
            fontFamily: 'var(--f-mono)',
            color: debtRatio > 50 ? 'var(--loss)' : debtRatio > 30 ? 'var(--amber)' : 'var(--profit)',
          }}>{debtRatio.toFixed(1)}%</span>
        </div>
      </div>

      <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--line)', display: 'flex', flexDirection: 'column', gap: 5 }}>
        {accounts.slice(0, 4).map(a => {
          const bal = Number(a.current_balance) || 0;
          const isDebt = a.type === 'debt' || bal < 0;
          return (
            <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
              <span style={{ color: 'var(--ink-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 140 }}>
                {a.name}
              </span>
              <span style={{
                fontFamily: 'var(--f-mono)',
                color: isDebt ? 'var(--loss)' : 'var(--ink-2)',
              }}>
                {isDebt ? '-' : ''}฿{Math.abs(bal).toLocaleString('th', { maximumFractionDigits: 0 })}
              </span>
            </div>
          );
        })}
        {accounts.length > 4 && (
          <div style={{ fontSize: 10, color: 'var(--ink-4)', fontFamily: 'var(--f-mono)', textAlign: 'center', marginTop: 4 }}>
            +{accounts.length - 4} บัญชี
          </div>
        )}
      </div>
    </div>
  );
}

function NWRow({ label, value, color, sign = '' }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
      <span style={{ color: 'var(--ink-3)' }}>{label}</span>
      <span style={{ fontFamily: 'var(--f-mono)', color }}>
        {sign}฿{value.toLocaleString('th', { maximumFractionDigits: 0 })}
      </span>
    </div>
  );
}

// ── Daily Heatmap (calendar grid) ────────────────────────────────────────────
export function DailyHeatmap({ dailyMap, yearMonth }) {
  const [y, m] = yearMonth.split('-').map(Number);
  const firstDay   = new Date(y, m - 1, 1);
  const daysInMon  = new Date(y, m, 0).getDate();
  const firstWday  = (firstDay.getDay() + 6) % 7; // Mon = 0

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

  const SHADES = ['var(--surface-2)', '#3a2a1f', '#5a3a2a', '#8a4f30', '#c46a3e'];

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--r-lg)', padding: '18px 20px' }}>
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontFamily: 'var(--f-display)', fontSize: 16, color: 'var(--ink)' }}>
          ปฏิทินรายจ่าย
        </div>
        <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--ink-3)', marginTop: 3, letterSpacing: '0.1em' }}>
          {activeDays} วันที่มีรายจ่าย · เฉลี่ย ฿{Math.round(avg).toLocaleString('th')}/วัน
        </div>
      </div>

      {/* Day-of-week header */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: 6 }}>
        {['จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส', 'อา'].map((d, i) => (
          <div key={i} style={{
            textAlign: 'center', fontSize: 9.5, color: 'var(--ink-4)',
            fontFamily: 'var(--f-mono)', letterSpacing: '0.1em',
          }}>{d}</div>
        ))}
      </div>

      {/* Day cells */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
        {cells.map((c, i) => {
          if (!c) return <div key={i} />;
          const lvl = intensity(c.amount);
          return (
            <div key={i}
              title={c.amount > 0 ? `${c.day}: ฿${Math.round(c.amount).toLocaleString('th')}` : `${c.day}: ไม่มีรายจ่าย`}
              style={{
                aspectRatio: '1', borderRadius: 4,
                background: SHADES[lvl],
                border: '1px solid ' + (lvl > 0 ? 'transparent' : 'var(--line)'),
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 10, color: lvl >= 3 ? '#fff' : 'var(--ink-3)',
                fontFamily: 'var(--f-mono)', cursor: 'default',
                transition: 'transform 100ms',
              }}>
              {c.day}
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 12, fontSize: 10, color: 'var(--ink-3)', fontFamily: 'var(--f-mono)' }}>
        <span>น้อย</span>
        {SHADES.map((c, i) => (
          <div key={i} style={{ width: 14, height: 14, borderRadius: 3, background: c, border: '1px solid ' + (i > 0 ? 'transparent' : 'var(--line)') }} />
        ))}
        <span>มาก</span>
      </div>
    </div>
  );
}

// ── Empty placeholder ────────────────────────────────────────────────────────
export function EmptyCard({ label }) {
  return (
    <div style={{
      background: 'var(--surface)', border: '1px dashed var(--line)',
      borderRadius: 'var(--r-lg)', padding: '32px 20px',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: 'var(--ink-3)', fontFamily: 'var(--f-mono)', fontSize: 11,
      letterSpacing: '0.1em',
    }}>
      {label}
    </div>
  );
}
