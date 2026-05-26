import { useState, useEffect, useMemo } from 'react';
import {
  listTransactions, listTransactionsRange, listAccounts, listBudgets,
  summarize, aggregateByMonth, aggregateByCategory, aggregateByDay, topExpenses,
  previousMonth, lastNMonths, getMonthBounds, currentYearMonth,
} from '../lib/api/finance.js';
import { isSupabaseConfigured } from '../lib/supabase.js';
import { MonthNav, formatThaiMonth } from '../components/dashboard/MonthNav.jsx';
import { KPICard, formatBaht } from '../components/dashboard/KPICard.jsx';
import { CashFlowChart } from '../components/dashboard/CashFlowChart.jsx';
import { CategoryBreakdown, TopExpenses, BudgetProgress, NetWorthCard, DailyHeatmap } from '../components/dashboard/Charts.jsx';

const SCOPE_TABS = [
  { id: 'personal', label: 'ส่วนตัว',  accent: '#7aa4f0', sub: 'รายรับ-รายจ่ายของคุณ' },
  { id: 'family',   label: 'ครอบครัว', accent: '#c084f5', sub: 'กองทุนครอบครัว & น้องอคิน' },
];

export function Dashboard() {
  const [scope, setScope]         = useState(() => localStorage.getItem('atelier:dash:scope') || 'personal');
  const [yearMonth, setYearMonth] = useState(() => localStorage.getItem('atelier:dash:ym') || currentYearMonth());

  const [thisMonth, setThisMonth] = useState([]);
  const [prevMonth, setPrevMonth] = useState([]);
  const [trend12, setTrend12]     = useState([]);
  const [accounts, setAccounts]   = useState([]);
  const [budgets, setBudgets]     = useState([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(null);

  useEffect(() => { localStorage.setItem('atelier:dash:scope', scope); }, [scope]);
  useEffect(() => { localStorage.setItem('atelier:dash:ym', yearMonth); }, [yearMonth]);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setThisMonth([]); setPrevMonth([]); setTrend12([]); setAccounts([]); setBudgets([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true); setError(null);

    (async () => {
      try {
        const prev = previousMonth(yearMonth);
        const months12 = lastNMonths(12, yearMonth);
        const { start: startTrend } = getMonthBounds(months12[0]);
        const { end:   endTrend   } = getMonthBounds(months12[months12.length - 1]);

        const [thisM, prevM, range12, accs, buds] = await Promise.all([
          listTransactions({ yearMonth, scope, limit: 2000 }),
          listTransactions({ yearMonth: prev, scope, limit: 2000 }),
          listTransactionsRange({ startDate: startTrend, endDate: endTrend, scope }),
          listAccounts({ scope }),
          listBudgets(yearMonth, scope),
        ]);

        if (cancelled) return;
        setThisMonth(thisM || []);
        setPrevMonth(prevM || []);
        setTrend12(range12 || []);
        setAccounts(accs || []);
        setBudgets(buds || []);
      } catch (e) {
        if (!cancelled) setError(e.message || 'โหลดข้อมูลไม่สำเร็จ');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [scope, yearMonth]);

  // ── Computed ────────────────────────────────────────────────────────────────
  const thisSum = useMemo(() => summarize(thisMonth), [thisMonth]);
  const prevSum = useMemo(() => summarize(prevMonth), [prevMonth]);

  const trendData = useMemo(() => {
    const agg = aggregateByMonth(trend12);
    const months = lastNMonths(12, yearMonth);
    return months.map(ym => agg.find(a => a.ym === ym) || { ym, income: 0, expense: 0, net: 0, savingsRate: 0, count: 0 });
  }, [trend12, yearMonth]);

  const categories = useMemo(() => aggregateByCategory(thisMonth), [thisMonth]);
  const top10      = useMemo(() => topExpenses(thisMonth, 10), [thisMonth]);
  const dailyMap   = useMemo(() => aggregateByDay(thisMonth, yearMonth), [thisMonth, yearMonth]);

  const deltas = useMemo(() => {
    const pct = (cur, prev) => prev > 0 ? ((cur - prev) / prev) * 100 : (cur > 0 ? 100 : 0);
    return {
      income:      pct(thisSum.income,  prevSum.income),
      expense:     pct(thisSum.expense, prevSum.expense),
      net:         pct(thisSum.net,     prevSum.net),
      savingsRate: thisSum.savingsRate - prevSum.savingsRate,
    };
  }, [thisSum, prevSum]);

  const currentTab = SCOPE_TABS.find(t => t.id === scope) || SCOPE_TABS[0];

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="page-body" style={{ padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 18 }}>

      {/* Header: title + month nav */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 14 }}>
          <div>
            <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--ink-3)', letterSpacing: '0.18em', marginBottom: 5 }}>
              FINANCIAL PLANNER · {formatThaiMonth(yearMonth).toUpperCase()}
            </div>
            <div style={{ fontFamily: 'var(--f-display)', fontSize: 32, color: 'var(--ink)', lineHeight: 1.1 }}>
              ภาพรวม <em style={{ color: currentTab.accent }}>{currentTab.label}</em>
            </div>
            <div style={{ fontSize: 13, color: 'var(--ink-3)', marginTop: 5 }}>
              {currentTab.sub} · เทียบกับ {formatThaiMonth(previousMonth(yearMonth))}
            </div>
          </div>
          <MonthNav value={yearMonth} onChange={setYearMonth} />
        </div>

        {/* Scope tabs */}
        <div style={{ display: 'flex', gap: 4, background: 'var(--bg-2)', padding: 4, borderRadius: 'var(--r-md)', border: '1px solid var(--line)', width: 'fit-content' }}>
          {SCOPE_TABS.map(t => (
            <button key={t.id} onClick={() => setScope(t.id)}
              style={{
                padding: '8px 22px', borderRadius: 'var(--r-sm)', border: 0,
                background: scope === t.id ? 'var(--surface)' : 'transparent',
                color: scope === t.id ? t.accent : 'var(--ink-3)',
                fontFamily: 'var(--f-body)', fontSize: 13, cursor: 'pointer',
                boxShadow: scope === t.id ? '0 1px 4px rgba(0,0,0,.3)' : 'none',
                transition: 'all 130ms', display: 'flex', alignItems: 'center', gap: 7,
              }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: t.accent, opacity: scope === t.id ? 1 : 0.5 }} />
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div style={{ padding: '10px 16px', background: 'var(--loss-bg)', color: 'var(--loss)', border: '1px solid #4a2e2a', borderRadius: 'var(--r-md)', fontSize: 13 }}>
          ⚠️ {error}
        </div>
      )}
      {loading && (
        <div style={{ padding: '8px 14px', background: 'var(--surface-2)', color: 'var(--ink-3)', borderRadius: 'var(--r-md)', fontSize: 11, fontFamily: 'var(--f-mono)', letterSpacing: '0.1em', textAlign: 'center' }}>
          กำลังโหลดข้อมูล…
        </div>
      )}

      {/* Row 1: KPI cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
        <KPICard
          label="รายรับเดือนนี้" sub={`${thisMonth.filter(t => t.amount > 0).length} ครั้ง`}
          value={'+' + formatBaht(thisSum.income, { compact: true })}
          valueColor="var(--profit)" accent="var(--profit)"
          delta={deltas.income} deltaLabel="vs เดือนก่อน"
        />
        <KPICard
          label="รายจ่ายเดือนนี้" sub={`${thisMonth.filter(t => t.amount < 0).length} ครั้ง`}
          value={'-' + formatBaht(thisSum.expense, { compact: true })}
          valueColor="var(--loss)" accent="var(--loss)"
          delta={-deltas.expense} deltaLabel="vs เดือนก่อน"
        />
        <KPICard
          label="คงเหลือสุทธิ" sub="รายรับ − รายจ่าย"
          value={(thisSum.net >= 0 ? '+' : '-') + formatBaht(Math.abs(thisSum.net), { compact: true })}
          valueColor={thisSum.net >= 0 ? 'var(--ink)' : 'var(--loss)'}
          accent={thisSum.net >= 0 ? 'var(--amber)' : 'var(--loss)'}
          delta={deltas.net} deltaLabel="vs เดือนก่อน"
        />
        <KPICard
          label="อัตราการออม" sub="% ของรายรับ"
          value={isFinite(thisSum.savingsRate) ? thisSum.savingsRate.toFixed(1) + '%' : '—'}
          valueColor={thisSum.savingsRate >= 20 ? 'var(--profit)' : thisSum.savingsRate >= 0 ? 'var(--amber)' : 'var(--loss)'}
          accent={thisSum.savingsRate >= 20 ? 'var(--profit)' : 'var(--amber)'}
          delta={deltas.savingsRate} deltaLabel="pp"
        />
      </div>

      {/* Row 2: Cash flow chart */}
      <CashFlowChart data={trendData} currentYm={yearMonth} onMonthClick={setYearMonth} />

      {/* Row 3: Categories + Top expenses */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <CategoryBreakdown data={categories} totalExpense={thisSum.expense} />
        <TopExpenses data={top10} />
      </div>

      {/* Row 4: Budget vs Actual */}
      <BudgetProgress budgets={budgets} categoryActuals={categories} />

      {/* Row 5: Net worth + Heatmap */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 14 }}>
        <NetWorthCard accounts={accounts} />
        <DailyHeatmap dailyMap={dailyMap} yearMonth={yearMonth} />
      </div>

      {/* Footer info */}
      <div style={{
        marginTop: 8, padding: '10px 16px', borderTop: '1px solid var(--line)',
        fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--ink-4)',
        letterSpacing: '0.1em', textAlign: 'center',
      }}>
        {thisMonth.length} รายการเดือนนี้ · {accounts.length} บัญชี · {budgets.length} งบ
        {!isSupabaseConfigured && ' · DEMO MODE'}
      </div>
    </div>
  );
}
