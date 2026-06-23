import { useEffect, useMemo, useState, useCallback } from 'react';
import { TradeForm } from '../components/TradeForm.jsx';
import { TradeImporter } from '../components/trading/TradeImporter.jsx';
import { TradingPlaybook } from '../components/trading/TradingPlaybook.jsx';
import { DailyPlanCard } from '../components/trading/DailyPlanCard.jsx';
import { PnLCalendar } from '../components/trading/PnLCalendar.jsx';
import { Button, Card, CardHeader, Badge, EmptyState } from '../components/ui/index.js';
import { listTrades, deleteTrade, subscribeTrades, computeStats } from '../lib/api/trades.js';
import { useAuth } from '../lib/useAuth.js';

const SESSION_COLOR = {
  'London KZ':      'var(--blue)',
  'NY KZ':          'var(--accent-strong)',
  'New York KZ':    'var(--accent-strong)',
  'Silver Bullet':  'var(--violet)',
  'Asia':           'var(--brass)',
};

export function Trading() {
  const { user } = useAuth();
  const [trades, setTrades]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing]   = useState(null);
  const [viewing, setViewing]   = useState(null);
  const [importerOpen, setImporterOpen] = useState(false);

  // Filters
  const [filtSession, setFiltSession] = useState('all');
  const [filtSetup,   setFiltSetup]   = useState('all');
  const [filtResult,  setFiltResult]  = useState('all');

  const refresh = useCallback(async () => {
    try {
      setError(null);
      setTrades(await listTrades({ limit: 500 }));
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    if (!user?.id) return;
    const unsub = subscribeTrades(user.id, () => refresh());
    return () => unsub();
  }, [user?.id, refresh]);

  const sessions = useMemo(() => ['all', ...new Set(trades.map(t => t.session).filter(Boolean))], [trades]);
  const setups   = useMemo(() => ['all', ...new Set(trades.map(t => t.setup).filter(Boolean))], [trades]);
  const results  = useMemo(() => ['all', 'WIN', 'LOSS', 'BREAKEVEN', 'OPEN'], []);

  const filtered = useMemo(() => trades.filter(t =>
    (filtSession === 'all' || t.session === filtSession) &&
    (filtSetup   === 'all' || t.setup   === filtSetup) &&
    (filtResult  === 'all' || t.status  === filtResult)
  ), [trades, filtSession, filtSetup, filtResult]);

  const stats = useMemo(() => computeStats(filtered), [filtered]);

  const equityPoints = useMemo(() => {
    const sorted = [...filtered].sort((a, b) =>
      a.trade_date.localeCompare(b.trade_date) || (a.created_at || '').localeCompare(b.created_at || '')
    );
    let cum = 0;
    return sorted.map(t => {
      cum += Number(t.pnl) || 0;
      return {
        date: t.trade_date,
        equity: t.balance_after != null ? Number(t.balance_after) : cum,
        pnl: Number(t.pnl) || 0,
      };
    });
  }, [filtered]);

  const latestBalance = equityPoints.length > 0 ? equityPoints[equityPoints.length - 1].equity : 0;

  // Today's stats for Playbook
  const todayStr = new Date().toISOString().split('T')[0];
  const tradesToday  = trades.filter(t => t.trade_date === todayStr).length;
  // Recent losing streak (last N trades by date desc)
  const lossesInRow  = useMemo(() => {
    const sorted = [...trades].sort((a, b) => (b.trade_date || '').localeCompare(a.trade_date || ''));
    let cnt = 0;
    for (const t of sorted) { if (t.status === 'LOSS') cnt++; else break; }
    return cnt;
  }, [trades]);

  return (
    <div className="page-body" style={{ padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 18 }}>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 14 }}>
        <div>
          <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.18em' }}>
            📈 TRADING JOURNAL · ICT METHODOLOGY
          </div>
          <div style={{ fontFamily: 'var(--f-display)', fontSize: 30, color: 'var(--text-primary)', marginTop: 6, lineHeight: 1.1 }}>
            Trading <em style={{ color: 'var(--accent)' }}>Journal</em>
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 5 }}>
            XAUUSD · Pepperstone · London KZ / NY KZ / Silver Bullet
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Button variant="ghost"     onClick={refresh}>🔄 Refresh</Button>
          <a href="/playbook.html" target="_blank" rel="noreferrer"
            style={{ textDecoration: 'none' }}>
            <Button variant="ghost" type="button">📖 Playbook</Button>
          </a>
          <Button variant="secondary" onClick={() => setImporterOpen(true)}>📊 Import Excel</Button>
          <Button variant="primary"   onClick={() => setFormOpen(true)}>+ Log Trade</Button>
        </div>
      </div>

      {error && (
        <div style={{ padding: '12px 16px', background: 'var(--danger-soft)', color: 'var(--danger)', border: '1px solid var(--danger)', borderRadius: 'var(--radius-control)', fontSize: 13 }}>
          ⚠️ {error}
        </div>
      )}

      {/* Playbook — daily schedule + rules + checklist */}
      <TradingPlaybook tradesToday={tradesToday} lossesInRow={lossesInRow} />

      {/* Daily Trading Plan — Weekly bias + Daily bias + charts */}
      <DailyPlanCard />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12 }}>
        <KPI label="Total Trades"    value={stats.count}    sub={`${stats.wins}W / ${stats.losses}L`} />
        <KPI label="Win Rate"        value={`${stats.winRate}%`}
          color={stats.winRate >= 50 ? 'var(--success)' : 'var(--accent-strong)'} />
        <KPI label="Total P&L"       value={`${stats.totalPnl >= 0 ? '+' : ''}$${stats.totalPnl.toFixed(2)}`}
          color={stats.totalPnl >= 0 ? 'var(--success)' : 'var(--danger)'} />
        <KPI label="Avg RR"          value={typeof stats.avgRR === 'string' ? stats.avgRR : `1:${stats.avgRR}`} />
        <KPI label="Account Balance" value={`$${latestBalance.toFixed(2)}`}
          color="var(--accent-strong)" />
      </div>

      {/* Monthly P&L calendar */}
      <PnLCalendar trades={filtered} />

      <Card padding={14}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.14em', marginRight: 4 }}>FILTERS</span>
          <FilterPills label="Session" value={filtSession} onChange={setFiltSession} options={sessions} />
          <span style={{ color: 'var(--border-strong)' }}>·</span>
          <FilterPills label="Setup"   value={filtSetup}   onChange={setFiltSetup}   options={setups} />
          <span style={{ color: 'var(--border-strong)' }}>·</span>
          <FilterPills label="Result"  value={filtResult}  onChange={setFiltResult}  options={results} />
          {(filtSession !== 'all' || filtSetup !== 'all' || filtResult !== 'all') && (
            <Button variant="ghost" size="sm" onClick={() => { setFiltSession('all'); setFiltSetup('all'); setFiltResult('all'); }}
              style={{ marginLeft: 'auto' }}>× Clear</Button>
          )}
        </div>
      </Card>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 14 }}>
        <Card>
          <CardHeader eyebrow="Equity Curve" title="ยอดบัญชี (USD)"
            meta={`${equityPoints.length} trade · max DD $${Math.abs(stats.maxDrawdown).toFixed(2)}`} />
          {equityPoints.length >= 2
            ? <EquityChart data={equityPoints} />
            : <EmptyState icon="📈" title="ยังไม่มี trade เพียงพอ" description="ต้องการอย่างน้อย 2 trades เพื่อแสดง equity curve" compact />}
        </Card>

        <Card>
          <CardHeader eyebrow="Performance" title="Key Metrics" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <MetricRow label="Profit Factor" value={stats.profitFactor}
              color={Number(stats.profitFactor) >= 1.5 ? 'var(--success)' : Number(stats.profitFactor) >= 1 ? 'var(--accent-strong)' : 'var(--danger)'} />
            <MetricRow label="Max Drawdown"  value={`$${stats.maxDrawdown.toFixed(2)}`} color="var(--danger)" />
            <MetricRow label="Best Trade"    value={filtered.length ? `+$${Math.max(...filtered.map(t => Number(t.pnl) || 0)).toFixed(2)}` : '—'} color="var(--success)" />
            <MetricRow label="Worst Trade"   value={filtered.length ? `-$${Math.abs(Math.min(...filtered.map(t => Number(t.pnl) || 0))).toFixed(2)}` : '—'} color="var(--danger)" />
            <MetricRow label="Wins / Losses" value={`${stats.wins} / ${stats.losses}`} />
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader eyebrow={`Trade Log · ${filtered.length} trades`} title="ประวัติการเทรด"
          meta="คลิกแถวเพื่อดู Setup Detail + Lesson" />

        {filtered.length === 0 ? (
          <EmptyState icon="📈"
            title={trades.length === 0 ? 'ยังไม่มี trade' : 'ไม่เจอ trade ที่ตรง filter'}
            description={trades.length === 0
              ? 'Import จาก Excel (Trading-Journal-2026.xlsx) หรือ Log Trade เอง'
              : 'ลองล้าง filter หรือเลือก option อื่น'}
            actionLabel={trades.length === 0 ? '📊 Import จาก Excel' : '× Clear filters'}
            onAction={trades.length === 0 ? () => setImporterOpen(true) : () => { setFiltSession('all'); setFiltSetup('all'); setFiltResult('all'); }}
            secondaryLabel={trades.length === 0 ? '+ Log Trade' : null}
            onSecondary={trades.length === 0 ? () => setFormOpen(true) : null}
          />
        ) : (
          <TradeTable trades={filtered} onView={setViewing}
            onDelete={async (id) => { if (confirm('ลบ trade นี้?')) { await deleteTrade(id); refresh(); } }} />
        )}
      </Card>

      {formOpen && <TradeForm open onClose={() => setFormOpen(false)} onSaved={() => { setFormOpen(false); refresh(); }} />}
      {editing && <TradeForm open initialTrade={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); refresh(); }} />}
      {importerOpen && <TradeImporter onImported={refresh} onClose={() => setImporterOpen(false)} />}
      {viewing && <TradeDetailDrawer trade={viewing} onClose={() => setViewing(null)} onEdit={() => { setEditing(viewing); setViewing(null); }} />}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
function KPI({ label, value, sub, color = 'var(--text-primary)' }) {
  return (
    <Card padding={16}>
      <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.16em', textTransform: 'uppercase' }}>
        {label}
      </div>
      <div style={{ fontFamily: 'var(--f-display)', fontSize: 26, color, marginTop: 6, fontWeight: 500, lineHeight: 1.1, letterSpacing: '-0.01em' }}>
        {value}
      </div>
      {sub && <div style={{ fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{sub}</div>}
    </Card>
  );
}

function MetricRow({ label, value, color = 'var(--text-primary)' }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
      <span style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>{label}</span>
      <span style={{ fontFamily: 'var(--f-mono)', fontSize: 13, color, fontWeight: 500 }}>{value}</span>
    </div>
  );
}

function FilterPills({ label, value, onChange, options }) {
  if (options.length <= 1) return null;
  return (
    <>
      <span style={{ fontSize: 11, color: 'var(--text-muted)', marginRight: 2 }}>{label}:</span>
      {options.map(opt => (
        <button key={opt} onClick={() => onChange(opt)} className="focus-ring"
          style={{
            padding: '4px 10px', borderRadius: 'var(--radius-pill)',
            background: value === opt ? 'var(--accent-soft)' : 'var(--surface)',
            color: value === opt ? 'var(--accent-strong)' : 'var(--text-secondary)',
            border: '1px solid ' + (value === opt ? 'var(--accent)' : 'var(--border)'),
            fontSize: 11, fontFamily: 'var(--f-mono)', cursor: 'pointer',
          }}>
          {opt === 'all' ? 'All' : opt}
        </button>
      ))}
    </>
  );
}

function EquityChart({ data }) {
  const W = 600, H = 200, padL = 44, padR = 12, padT = 12, padB = 24;
  const iw = W - padL - padR, ih = H - padT - padB;
  const min = Math.min(...data.map(d => d.equity));
  const max = Math.max(...data.map(d => d.equity));
  const range = Math.max(1, max - min);
  const xStep = data.length > 1 ? iw / (data.length - 1) : iw;
  const y = (eq) => padT + ih - ((eq - min) / range) * ih;
  const path = data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${padL + i * xStep} ${y(d.equity)}`).join(' ');
  const areaPath = path + ` L ${padL + (data.length - 1) * xStep} ${padT + ih} L ${padL} ${padT + ih} Z`;
  const totalChange = data[data.length - 1].equity - data[0].equity;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block' }}>
      <defs>
        <linearGradient id="eqGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor={totalChange >= 0 ? 'var(--success)' : 'var(--danger)'} stopOpacity="0.25" />
          <stop offset="100%" stopColor={totalChange >= 0 ? 'var(--success)' : 'var(--danger)'} stopOpacity="0" />
        </linearGradient>
      </defs>
      <line x1={padL} x2={W - padR} y1={padT + ih} y2={padT + ih} stroke="var(--border)" strokeWidth="1" />
      <text x={padL - 6} y={y(max)} fontSize="9.5" fill="var(--text-muted)" fontFamily="var(--f-mono)" textAnchor="end" dominantBaseline="middle">${max.toFixed(0)}</text>
      <text x={padL - 6} y={y(min)} fontSize="9.5" fill="var(--text-muted)" fontFamily="var(--f-mono)" textAnchor="end" dominantBaseline="middle">${min.toFixed(0)}</text>
      <path d={areaPath} fill="url(#eqGrad)" />
      <path d={path} stroke={totalChange >= 0 ? 'var(--success)' : 'var(--danger)'} strokeWidth="2" fill="none" />
      {data.map((d, i) => (
        <circle key={i} cx={padL + i * xStep} cy={y(d.equity)} r="2.5"
          fill={d.pnl >= 0 ? 'var(--success)' : 'var(--danger)'} />
      ))}
      <text x={padL} y={H - 6} fontSize="9.5" fill="var(--text-muted)" fontFamily="var(--f-mono)">{data[0].date}</text>
      <text x={W - padR} y={H - 6} fontSize="9.5" fill="var(--text-muted)" fontFamily="var(--f-mono)" textAnchor="end">{data[data.length - 1].date}</text>
    </svg>
  );
}

function TradeTable({ trades, onView, onDelete }) {
  return (
    <div style={{ overflow: 'hidden', borderRadius: 'var(--radius-control)', border: '1px solid var(--border)' }}>
      <div style={{
        display: 'grid', gridTemplateColumns: '70px 60px 50px 1fr 60px 100px 90px 40px',
        gap: 10, padding: '8px 12px', background: 'var(--surface-muted)',
        fontFamily: 'var(--f-mono)', fontSize: 9.5, color: 'var(--text-muted)',
        letterSpacing: '0.14em', textTransform: 'uppercase',
        borderBottom: '1px solid var(--border)',
      }}>
        <div>วันที่</div><div>Symbol</div><div>Dir</div><div>Setup / Session</div>
        <div>RR</div><div style={{ textAlign: 'right' }}>P&L</div>
        <div style={{ textAlign: 'right' }}>Balance</div><div />
      </div>
      <div style={{ maxHeight: 540, overflow: 'auto' }}>
        {trades.map(t => (
          <div key={t.id} onClick={() => onView(t)}
            style={{
              display: 'grid', gridTemplateColumns: '70px 60px 50px 1fr 60px 100px 90px 40px',
              gap: 10, padding: '10px 12px', borderBottom: '1px solid var(--border)',
              alignItems: 'center', fontSize: 12.5, cursor: 'pointer', transition: 'background 130ms',
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-muted)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
            <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10.5, color: 'var(--text-secondary)' }}>
              {(t.trade_date || '').substring(5)}
            </div>
            <div style={{ fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--text-primary)' }}>{t.symbol}</div>
            <div style={{ fontSize: 14, color: t.side === 'long' ? 'var(--success)' : 'var(--danger)' }}>
              {t.side === 'long' ? '↗' : '↘'}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {t.setup || '—'}
              </div>
              {t.session && (
                <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: SESSION_COLOR[t.session] || 'var(--text-muted)', marginTop: 1 }}>
                  {t.session}
                </div>
              )}
            </div>
            <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10.5, color: 'var(--text-muted)' }}>{t.rr || '—'}</div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontFamily: 'var(--f-mono)', fontSize: 12.5, fontWeight: 500,
                color: t.status === 'WIN' ? 'var(--success)' : t.status === 'LOSS' ? 'var(--danger)' : 'var(--text-muted)' }}>
                {t.pnl != null ? (t.pnl > 0 ? '+' : '') + '$' + Number(t.pnl).toFixed(2) : '—'}
              </div>
              <Badge tone={t.status === 'WIN' ? 'success' : t.status === 'LOSS' ? 'danger' : t.status === 'BREAKEVEN' ? 'warning' : 'neutral'} size="sm">
                {t.status}
              </Badge>
            </div>
            <div style={{ textAlign: 'right', fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--text-secondary)' }}>
              {t.balance_after != null ? `$${Number(t.balance_after).toFixed(0)}` : '—'}
            </div>
            <button onClick={(e) => { e.stopPropagation(); onDelete(t.id); }} aria-label="ลบ"
              style={{ background: 'none', border: 0, color: 'var(--text-muted)', fontSize: 15, cursor: 'pointer', padding: 4 }}>×</button>
          </div>
        ))}
      </div>
    </div>
  );
}

function TradeDetailDrawer({ trade, onClose, onEdit }) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 500, display: 'flex', justifyContent: 'flex-end' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(40,30,15,0.5)' }} />
      <div style={{
        position: 'relative', width: '90vw', maxWidth: 560, height: '100%',
        background: 'var(--background)', borderLeft: '1px solid var(--border)',
        boxShadow: 'var(--shadow-pop)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        <div style={{
          padding: '20px 26px', background: 'var(--surface)',
          borderBottom: '1px solid var(--border)', flexShrink: 0,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12,
        }}>
          <div>
            <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.16em' }}>
              {trade.trade_date} · {trade.session || 'Session'}
            </div>
            <div style={{ fontFamily: 'var(--f-display)', fontSize: 22, color: 'var(--text-primary)', marginTop: 4 }}>
              {trade.symbol} <em style={{ color: trade.side === 'long' ? 'var(--success)' : 'var(--danger)' }}>
                {trade.side === 'long' ? '↗ Long' : '↘ Short'}
              </em>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <Button variant="ghost" size="sm" onClick={onEdit}>✎ แก้ไข</Button>
            <button onClick={onClose} aria-label="ปิด" style={{ background: 'none', border: 0, color: 'var(--text-muted)', fontSize: 22, cursor: 'pointer', padding: 4 }}>×</button>
          </div>
        </div>

        <div style={{ flex: 1, overflow: 'auto', padding: '20px 26px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Card variant={trade.status === 'WIN' ? 'paper' : 'default'} padding={16}>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.14em' }}>RESULT</div>
                <Badge tone={trade.status === 'WIN' ? 'success' : trade.status === 'LOSS' ? 'danger' : 'warning'} size="lg" style={{ marginTop: 4 }}>{trade.status}</Badge>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.14em' }}>P&L</div>
                <div style={{ fontFamily: 'var(--f-display)', fontSize: 26, color: trade.pnl >= 0 ? 'var(--success)' : 'var(--danger)', fontWeight: 500 }}>
                  {trade.pnl >= 0 ? '+' : ''}${Number(trade.pnl || 0).toFixed(2)}
                </div>
                {trade.pnl_pct != null && (
                  <div style={{ fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--text-muted)' }}>
                    {trade.pnl_pct >= 0 ? '+' : ''}{Number(trade.pnl_pct).toFixed(2)}%
                  </div>
                )}
              </div>
            </div>
          </Card>

          <Card padding={16}>
            <CardHeader eyebrow="Levels & Size" title="ราคา + ขนาด position" />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
              <Field label="Entry"   value={trade.entry_price}   mono />
              <Field label="Stop"    value={trade.stop_loss}     mono />
              <Field label="Target"  value={trade.take_profit}   mono />
              <Field label="Lot"     value={trade.position_size} mono />
              <Field label="RR"      value={trade.rr || '—'}     mono />
              <Field label="Balance After" value={trade.balance_after ? '$' + Number(trade.balance_after).toFixed(2) : '—'} mono />
            </div>
          </Card>

          {trade.setup_detail && (
            <Card padding={16}>
              <CardHeader eyebrow={`Setup · ${trade.setup || ''}`} title="Setup Detail" />
              <div style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
                {trade.setup_detail}
              </div>
            </Card>
          )}

          {trade.emotion && (
            <Card padding={16}>
              <CardHeader eyebrow="Emotion" title="ความรู้สึกตอนนั้น" />
              <div style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.7, whiteSpace: 'pre-wrap', fontStyle: 'italic' }}>
                {trade.emotion}
              </div>
            </Card>
          )}

          {trade.lesson_learned && (
            <Card variant="paper" padding={16}>
              <CardHeader eyebrow="🌟 Lesson Learned" title="สิ่งที่เรียนรู้" accent="var(--accent-strong)" />
              <div style={{ fontSize: 13.5, color: 'var(--paper-ink)', lineHeight: 1.75, whiteSpace: 'pre-wrap' }}>
                {trade.lesson_learned}
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, mono }) {
  return (
    <div style={{ padding: '8px 12px', background: 'var(--background-soft)', border: '1px solid var(--border)', borderRadius: 'var(--radius-control)' }}>
      <div style={{ fontFamily: 'var(--f-mono)', fontSize: 9.5, color: 'var(--text-muted)', letterSpacing: '0.12em' }}>{label}</div>
      <div style={{
        fontFamily: mono ? 'var(--f-mono)' : 'var(--f-body)',
        fontSize: 14, color: 'var(--text-primary)', fontWeight: 500, marginTop: 2,
      }}>{value ?? '—'}</div>
    </div>
  );
}
