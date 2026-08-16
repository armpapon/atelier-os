import { useMemo, useState } from 'react';
import {
  buildLeakInsights, sumExpense, leakDateLabel, normalizeCategory, resolveYearMonth,
} from '../../lib/moneyLeaks.js';
import { formatBaht } from './KPICard.jsx';
import { formatThaiMonth } from './MonthNav.jsx';
import { currentYearMonth } from '../../lib/api/finance.js';
import { Card, CardHeader } from '../ui/index.js';

// ── Drill-down: the transactions behind one insight ───────────────────────────
function TxnList({ items = [], accountName, nested = false, extraMeta }) {
  const total = sumExpense(items);
  return (
    <div className={'leak-detail' + (nested ? ' leak-detail--nested' : '')}>
      <div style={{
        display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap',
        fontFamily: 'var(--f-mono)', fontSize: 10.5, letterSpacing: '0.06em',
        color: 'var(--text-muted)', padding: '6px 0 8px',
      }}>
        <span>{items.length} รายการ</span>
        <span>·</span>
        <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>รวม {formatBaht(total)}</span>
        {extraMeta && <><span>·</span><span>{extraMeta}</span></>}
      </div>

      {items.length === 0 ? (
        <div style={{ fontSize: 12.5, color: 'var(--text-muted)', paddingBottom: 4 }}>
          ไม่มีรายการที่จับคู่ได้
        </div>
      ) : (
        <div className="leak-detail__scroll">
          {items.map((t, i) => {
            const acc = accountName?.(t);
            return (
              <div key={t.id ?? i} style={{
                display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr) auto',
                gap: 10, alignItems: 'baseline', padding: '6px 0',
                borderTop: i === 0 ? 'none' : '1px solid var(--hairline)',
              }}>
                <span style={{
                  fontFamily: 'var(--f-mono)', fontSize: 10.5, color: 'var(--text-muted)',
                  whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums',
                }}>{leakDateLabel(t.occurred_at)}</span>
                <span style={{ minWidth: 0 }}>
                  <span style={{
                    display: 'block', fontSize: 12.5, color: 'var(--text-primary)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>{t.title || '(ไม่มีชื่อรายการ)'}</span>
                  <span style={{
                    display: 'block', fontFamily: 'var(--f-mono)', fontSize: 10,
                    color: 'var(--text-muted)', overflow: 'hidden',
                    textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {normalizeCategory(t.category)}{acc ? ` · ${acc}` : ''}
                  </span>
                </span>
                <span style={{
                  fontFamily: 'var(--f-mono)', fontSize: 12.5, fontWeight: 600,
                  color: 'var(--text-primary)', whiteSpace: 'nowrap',
                  fontVariantNumeric: 'tabular-nums',
                }}>{formatBaht(Math.abs(Number(t.amount) || 0))}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── One insight row. A real <button> when it can be opened, so Enter/Space,
//    focus-visible and screen-reader semantics all come from the platform. ──
function LeakRow({
  id, icon, title, detail, value, tone = 'var(--text-primary)',
  onActivate, expanded = false, chevron = '›', nested = false, children,
}) {
  const body = (
    <>
      <span style={{
        fontSize: nested ? 13 : 15, flexShrink: 0,
        width: nested ? 22 : 28, height: nested ? 22 : 28, borderRadius: '50%',
        background: nested ? 'transparent' : 'var(--fill-2)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>{icon}</span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{
          display: 'block', fontSize: nested ? 12.5 : 13.5,
          color: 'var(--text-primary)', fontWeight: 500,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{title}</span>
        {detail && (
          <span style={{
            display: 'block', fontFamily: 'var(--f-mono)', fontSize: 10.5,
            color: 'var(--text-muted)', marginTop: 2,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{detail}</span>
        )}
      </span>
      {value != null && (
        <span style={{
          fontFamily: 'var(--f-mono)', fontSize: nested ? 12.5 : 14, fontWeight: 600,
          color: tone, flexShrink: 0, fontVariantNumeric: 'tabular-nums',
        }}>{value}</span>
      )}
    </>
  );

  if (!onActivate) {
    return (
      <div className="leak-row" style={{ cursor: 'default' }} data-leak-row={id}>
        {body}
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        className="leak-row focus-ring"
        data-leak-row={id}
        aria-expanded={children !== undefined ? expanded : undefined}
        aria-controls={children !== undefined ? `leak-panel-${id}` : undefined}
        onClick={onActivate}
      >
        {body}
        <span className="leak-row__chev" aria-hidden="true">{chevron}</span>
      </button>
      {children !== undefined && expanded && (
        <div id={`leak-panel-${id}`} role="region" data-leak-detail={id}>
          {children}
        </div>
      )}
    </>
  );
}

// ── Money Leaks / Insights ─────────────────────────────────────────────────────
export function MoneyLeaks({
  txns = [], prevTxns = [], trend12 = [], debts = [], allCategories = [],
  accounts = [], onOpenDebts, yearMonth,
}) {
  // Icons only. The DISPLAY LABEL is the transaction's own category — see the
  // header comment in lib/moneyLeaks.js for why resolving it through this map
  // used to render 'กาแฟ' as a second 'อาหาร' row.
  const iconOf = useMemo(() => {
    const byLabel = {}, byType = {};
    for (const c of allCategories) {
      if (c?.label) byLabel[c.label] = c.icon;
      if (c?.type && !byType[c.type]) byType[c.type] = c.icon;
    }
    return (g) => byLabel[g?.category] || byType[g?.type] || '📦';
  }, [allCategories]);

  const accountName = useMemo(() => {
    const byId = {};
    for (const a of accounts) if (a?.id) byId[a.id] = a.name;
    return (t) => (t?.account_id ? byId[t.account_id] : null) || null;
  }, [accounts]);

  // `yearMonth` is the month the page is showing — not necessarily the calendar
  // month. The subscriptions listed are the ones charged around THAT month, so
  // the corner label has to name it too: "เดือนนี้" only while the page really
  // is on the current Bangkok month, otherwise the month being viewed
  // (audited: DLG-FIN-001 · A4).
  const insights = useMemo(
    () => buildLeakInsights({ txns, prevTxns, trend12, debts, yearMonth }),
    [txns, prevTxns, trend12, debts, yearMonth],
  );
  const viewedMonth = resolveYearMonth(yearMonth);
  const monthLabel = viewedMonth === currentYearMonth() ? 'เดือนนี้' : formatThaiMonth(viewedMonth);

  const [openRow, setOpenRow] = useState(null);
  const [openSub, setOpenSub] = useState(null);
  const toggle = (id) => setOpenRow(cur => (cur === id ? null : id));

  const {
    thisSum, srDelta, creep, frequent, recurring, recurringTotal,
    remainingInterest, worst, topCats,
  } = insights;

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
  const nothingFlagged = creep.length === 0 && frequent.length === 0
    && recurring.length === 0 && remainingInterest === 0;

  return (
    <Card>
      <CardHeader
        title="เงินรั่ว · Insights"
        meta="แตะแถวไหนก็ได้เพื่อดูว่าตัวเลขนั้นมาจากรายการอะไรบ้าง"
        action={
          <span style={{
            fontFamily: 'var(--f-mono)', fontSize: 10.5, letterSpacing: '0.14em',
            textTransform: 'uppercase', color: 'var(--text-muted)',
          }}>{monthLabel}</span>
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
        {creep.map(c => {
          const id = 'creep-' + c.key;
          return (
            <LeakRow key={id} id={id} icon={iconOf(c)}
              title={`${c.category} — โตขึ้นจากเดือนก่อน`}
              detail={`เดือนนี้ ${formatBaht(c.amount)} · ${c.count} รายการ`}
              value={`+${formatBaht(c.delta)}`} tone="var(--danger)"
              expanded={openRow === id} onActivate={() => toggle(id)}>
              <TxnList items={c.txns} accountName={accountName} />
            </LeakRow>
          );
        })}

        {/* Subscriptions — the summary row opens the four bills, and each bill
            opens its own charges across the 12-month window. */}
        {recurring.length > 0 && (() => {
          const id = 'subs';
          return (
            <LeakRow key={id} id={id} icon="🔁"
              title={`บิล/subscription ซ้ำ ${recurring.length} รายการ`}
              detail={`เรียกเก็บล่าสุด · ${recurring.map(r => r.title).slice(0, 3).join(' · ')}`}
              value={`${formatBaht(recurringTotal)}/ด`} tone="var(--accent-strong)"
              expanded={openRow === id} onActivate={() => toggle(id)}>
              <div className="leak-detail">
                <div style={{
                  fontFamily: 'var(--f-mono)', fontSize: 10.5, letterSpacing: '0.06em',
                  color: 'var(--text-muted)', padding: '6px 0 4px',
                }}>
                  {recurring.length} รายการ · เรียกเก็บล่าสุด · รวม <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>{formatBaht(recurringTotal)}</span>/เดือน
                </div>
                {recurring.map((r, i) => {
                  const subId = `${id}-${i}`;
                  const charges = r.txns || [];
                  const paid = sumExpense(charges);
                  return (
                    <LeakRow key={subId} id={subId} nested icon="•"
                      title={r.title}
                      detail={`${r.monthsCount} เดือน · จ่ายไปแล้ว ${formatBaht(paid)}`}
                      value={`${formatBaht(r.avgAmount)}/ด`}
                      expanded={openSub === subId}
                      onActivate={() => setOpenSub(cur => (cur === subId ? null : subId))}>
                      <TxnList items={charges} accountName={accountName} nested
                        extraMeta={`เฉลี่ย ${formatBaht(r.avgAmount)}/ครั้ง`} />
                    </LeakRow>
                  );
                })}
              </div>
            </LeakRow>
          );
        })()}

        {/* Small but frequent */}
        {frequent.map(c => {
          const id = 'freq-' + c.key;
          return (
            <LeakRow key={id} id={id} icon="☕"
              title={`${c.category} — เล็กแต่ถี่`}
              detail={`${c.count} ครั้ง · เฉลี่ย ${formatBaht(c.avg)}/ครั้ง`}
              value={formatBaht(c.amount)}
              expanded={openRow === id} onActivate={() => toggle(id)}>
              <TxnList items={c.txns} accountName={accountName} />
            </LeakRow>
          );
        })}

        {/* Debt interest — its detail is a debt, not a set of transactions,
            so this one jumps to the Debt Tracker card instead of expanding. */}
        {remainingInterest > 0 && (
          <LeakRow id="debt" icon="🏦"
            title="ดอกเบี้ยหนี้ที่ยังต้องจ่าย"
            detail={worst
              ? `ถล่มก้อนดอกสูงสุดก่อน: ${worst.name} (${Number(worst.interest_rate).toFixed(1)}%) → ไปที่ตารางหนี้`
              : 'รวมทุกก้อน → ไปที่ตารางหนี้'}
            value={formatBaht(remainingInterest)} tone="var(--danger)"
            chevron="↓"
            onActivate={onOpenDebts} />
        )}

        {/* Fallback: top categories if nothing flagged */}
        {nothingFlagged && (
          <>
            <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10.5, color: 'var(--text-muted)', margin: '4px 0 6px' }}>หมวดที่ใช้มากสุดเดือนนี้</div>
            {topCats.map(c => {
              const id = 'top-' + c.key;
              return (
                <LeakRow key={id} id={id} icon={iconOf(c)} title={c.category}
                  detail={`${c.count} รายการ`} value={formatBaht(c.amount)}
                  expanded={openRow === id} onActivate={() => toggle(id)}>
                  <TxnList items={c.txns} accountName={accountName} />
                </LeakRow>
              );
            })}
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
