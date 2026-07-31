import { useMemo } from 'react';
import {
  summarize, aggregateByCategory, detectRecurringFromTransactions, calculateDebtMath,
} from '../../lib/api/finance.js';
import { formatBaht } from './KPICard.jsx';
import { Card, CardHeader } from '../ui/index.js';

// ── Small UI bits ─────────────────────────────────────────────────────────────
function LeakRow({ icon, title, detail, value, tone = 'var(--text-primary)' }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 0', borderBottom: '1px solid var(--hairline)' }}>
      <span style={{
        fontSize: 15, flexShrink: 0, width: 28, height: 28, borderRadius: '50%',
        background: 'var(--fill)', display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>{icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, color: 'var(--text-primary)', fontWeight: 500 }}>{title}</div>
        {detail && <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10.5, color: 'var(--text-muted)', marginTop: 2 }}>{detail}</div>}
      </div>
      {value != null && (
        <div style={{ fontFamily: 'var(--f-mono)', fontSize: 14, fontWeight: 600, color: tone, flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      )}
    </div>
  );
}

// ── Money Leaks / Insights ─────────────────────────────────────────────────────
export function MoneyLeaks({ txns = [], prevTxns = [], trend12 = [], debts = [], allCategories = [] }) {
  // aggregateByCategory groups on `transaction.category` — the Thai LABEL —
  // while this map was keyed by category id, so every lookup missed and every
  // icon fell back to 📦. Key by label, and fall back to the row's `type`.
  const catOf = useMemo(() => {
    const byLabel = {}, byType = {};
    for (const c of allCategories) {
      byLabel[c.label] = c;
      if (c.type && !byType[c.type]) byType[c.type] = c;
    }
    return { byLabel, byType };
  }, [allCategories]);
  const lookup = (row) => {
    if (!row) return null;
    const key = typeof row === 'string' ? row : row.category;
    return catOf.byLabel[key] || (row && row.type ? catOf.byType[row.type] : null) || null;
  };
  const label = (row) => lookup(row)?.label || (typeof row === 'string' ? row : row?.category) || 'อื่น ๆ';
  const icon  = (row) => lookup(row)?.icon || '📦';

  const insights = useMemo(() => {
    const thisSum = summarize(txns);
    const prevSum = summarize(prevTxns);
    const srDelta = thisSum.savingsRate - prevSum.savingsRate;

    // 1) Lifestyle creep — categories that grew vs last month
    const thisCat = aggregateByCategory(txns);
    const prevMap = {};
    for (const c of aggregateByCategory(prevTxns)) prevMap[c.category] = c.amount;
    const creep = thisCat
      .map(c => ({ ...c, delta: c.amount - (prevMap[c.category] || 0) }))
      .filter(c => c.delta >= 300 && prevSum.expense > 0)
      .sort((a, b) => b.delta - a.delta)
      .slice(0, 3);

    // 2) Small-but-frequent — many transactions in a category
    const frequent = thisCat
      .filter(c => c.count >= 6)
      .map(c => ({ ...c, avg: c.amount / c.count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 2);

    // 3) Subscriptions / recurring charges (detected across 12 months)
    const recurring = detectRecurringFromTransactions(trend12).slice(0, 4);
    const recurringTotal = recurring.reduce((s, r) => s + r.avgAmount, 0);

    // 4) Debt interest leak
    const activeDebts = debts.filter(d => d.is_active !== false);
    let remainingInterest = 0;
    let worst = null; // highest interest rate
    for (const d of activeDebts) {
      const math = calculateDebtMath(d);
      remainingInterest += math.remainingInterest || 0;
      const rate = Number(d.interest_rate || 0);
      if (rate > 0 && (!worst || rate > Number(worst.interest_rate || 0))) worst = d;
    }

    // Top spending categories overall
    const topCats = thisCat.slice(0, 5);

    return { thisSum, prevSum, srDelta, creep, frequent, recurring, recurringTotal, remainingInterest, worst, topCats };
  }, [txns, prevTxns, trend12, debts]);

  const { thisSum, srDelta, creep, frequent, recurring, recurringTotal, remainingInterest, worst, topCats } = insights;

  if (!txns.length) {
    return (
      <Card>
        <CardHeader title="เงินรั่ว · Insights" />
        <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '24px 0', fontSize: 13 }}>
          ยังไม่มีรายการเดือนนี้ — พอมีข้อมูลแล้วระบบจะชี้ให้เห็นว่าเงินรั่วตรงไหน
        </div>
      </Card>
    );
  }

  const srColor = thisSum.savingsRate >= 20 ? 'var(--success)' : thisSum.savingsRate >= 0 ? 'var(--accent)' : 'var(--danger)';

  return (
    <Card>
      <CardHeader
        title="เงินรั่ว · Insights"
        action={
          <span style={{
            fontFamily: 'var(--f-mono)', fontSize: 10.5, letterSpacing: '0.14em',
            textTransform: 'uppercase', color: 'var(--text-muted)',
          }}>เดือนนี้</span>
        }
      />

      {/* Savings rate hero */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, flexWrap: 'wrap', marginBottom: 6 }}>
        <div>
          <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>อัตราการออม</div>
          <div style={{ fontFamily: 'var(--f-mono)', fontSize: 30, fontWeight: 600, color: srColor, lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>
            {thisSum.savingsRate.toFixed(0)}%
          </div>
        </div>
        <div style={{ fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
          {srDelta >= 0 ? '▲' : '▼'} {Math.abs(srDelta).toFixed(0)}% จากเดือนก่อน
          <div style={{ marginTop: 2 }}>
            เข้า {formatBaht(thisSum.income)} · ออก {formatBaht(thisSum.expense)} · เหลือ {formatBaht(thisSum.net)}
          </div>
        </div>
      </div>

      <div style={{ marginTop: 10 }}>
        {/* Lifestyle creep */}
        {creep.length > 0 && creep.map(c => (
          <LeakRow key={'creep-' + c.category} icon={icon(c)}
            title={`${label(c)} — โตขึ้นจากเดือนก่อน`}
            detail={`เดือนนี้ ${formatBaht(c.amount)} · ${c.count} รายการ`}
            value={`+${formatBaht(c.delta)}`} tone="var(--danger)" />
        ))}

        {/* Subscriptions */}
        {recurring.length > 0 && (
          <LeakRow icon="🔁"
            title={`บิล/subscription ซ้ำ ${recurring.length} รายการ`}
            detail={recurring.map(r => r.title).slice(0, 3).join(' · ')}
            value={`${formatBaht(recurringTotal)}/ด`} tone="var(--accent-strong)" />
        )}

        {/* Small but frequent */}
        {frequent.map(c => (
          <LeakRow key={'freq-' + c.category} icon="☕"
            title={`${label(c)} — เล็กแต่ถี่`}
            detail={`${c.count} ครั้ง · เฉลี่ย ${formatBaht(c.avg)}/ครั้ง`}
            value={formatBaht(c.amount)} />
        ))}

        {/* Debt interest */}
        {remainingInterest > 0 && (
          <LeakRow icon="🏦"
            title="ดอกเบี้ยหนี้ที่ยังต้องจ่าย"
            detail={worst ? `ถล่มก้อนดอกสูงสุดก่อน: ${worst.name} (${Number(worst.interest_rate).toFixed(1)}%)` : 'รวมทุกก้อน'}
            value={formatBaht(remainingInterest)} tone="var(--danger)" />
        )}

        {/* Fallback: top categories if nothing flagged */}
        {creep.length === 0 && frequent.length === 0 && recurring.length === 0 && remainingInterest === 0 && (
          <>
            <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10.5, color: 'var(--text-muted)', margin: '4px 0 6px' }}>หมวดที่ใช้มากสุดเดือนนี้</div>
            {topCats.map(c => (
              <LeakRow key={'top-' + c.category} icon={icon(c)} title={label(c)}
                detail={`${c.count} รายการ`} value={formatBaht(c.amount)} />
            ))}
          </>
        )}
      </div>

      <div style={{ marginTop: 12, fontFamily: 'var(--f-display)', fontStyle: 'italic', fontSize: 13, color: 'var(--text-muted)' }}>
        {thisSum.savingsRate >= 20
          ? 'ออมได้ดีมาก — รักษาระดับนี้ไว้ 💪'
          : thisSum.savingsRate >= 0
            ? 'เริ่มจากอุดรูที่ใหญ่สุดด้านบนก่อน แล้วค่อยไล่ลงมา'
            : 'เดือนนี้ใช้เกินรายรับ — ดูหมวดที่โตขึ้นด้านบนเป็นอันดับแรก'}
      </div>
    </Card>
  );
}
