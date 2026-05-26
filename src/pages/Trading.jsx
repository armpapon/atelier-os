import { useEffect, useMemo, useState, useCallback } from 'react';
import { Icon } from '../components/Icon.jsx';
import { PageHeader } from '../components/PageHeader.jsx';
import { CandleChart } from '../components/CandleChart.jsx';
import { TradeForm } from '../components/TradeForm.jsx';
import { listTrades, deleteTrade, subscribeTrades, computeStats } from '../lib/api/trades.js';
import { useAuth } from '../lib/useAuth.js';

export function Trading() {
  const { user } = useAuth();
  const [trades, setTrades] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  const refresh = useCallback(async () => {
    try {
      setError(null);
      const data = await listTrades({ limit: 200 });
      setTrades(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  // Realtime — เปิด 2 tab จะเห็น update ทันที
  useEffect(() => {
    if (!user?.id) return;
    const unsub = subscribeTrades(user.id, () => refresh());
    return () => unsub();
  }, [user?.id, refresh]);

  const stats = useMemo(() => computeStats(trades), [trades]);

  const candles = useMemo(() => {
    // Synthetic chart — ภายหลังจะแทนด้วยข้อมูลจริงจาก price feed
    const out = [];
    let price = 1.0820;
    for (let i = 0; i < 80; i++) {
      const drift = Math.sin(i / 7) * 0.0008 + (Math.random() - 0.48) * 0.0012;
      const o = price;
      const c = price + drift;
      const h = Math.max(o, c) + Math.random() * 0.0006;
      const l = Math.min(o, c) - Math.random() * 0.0006;
      out.push({ o, h, l, c });
      price = c;
    }
    return out;
  }, []);

  const handleEdit = (trade) => { setEditing(trade); setFormOpen(true); };
  const handleNew  = () => { setEditing(null); setFormOpen(true); };

  const handleDelete = async (trade) => {
    if (!confirm(`ลบ trade ${trade.symbol} วันที่ ${formatDate(trade.trade_date)} ?`)) return;
    try {
      await deleteTrade(trade.id);
      refresh();
    } catch (e) {
      alert('ลบไม่สำเร็จ: ' + e.message);
    }
  };

  const totalPnlDisplay = (stats.totalPnl >= 0 ? '+' : '') + '฿' + Math.abs(stats.totalPnl).toLocaleString(undefined, { maximumFractionDigits: 0 });
  const featured = trades.find(t => t.status === 'WIN' && (t.reason || t.emotion)) || trades[0];

  return (
    <>
      <PageHeader
        eyebrow="ICT · SMC · NY/LDN Session"
        title="Trading" em="Journal"
        sub="บันทึก setup, screenshot และอารมณ์ของทุก trade — เพื่อหา edge ของตัวเอง"
        meta={<><div>เดือน · {currentMonthLabel()}</div>
          <div className={`page-header__meta-big ${stats.totalPnl >= 0 ? 'profit' : 'loss'}`}>{totalPnlDisplay}</div></>}
        actions={<>
          <button className="btn btn--ghost" onClick={refresh}><Icon name="filter" size={14}/> Refresh</button>
          <button className="btn btn--primary" onClick={handleNew}><Icon name="plus" size={14}/> Log Trade</button>
        </>}
      />

      <div className="page-body">
        {error && (
          <div style={{
            marginBottom: 18, padding: '10px 14px', borderRadius: 'var(--r-md)',
            background: 'var(--loss-bg)', color: 'var(--loss)',
            border: '1px solid #4a2e2a', fontSize: 13,
          }}>⚠ {error}</div>
        )}

        {/* KPI row */}
        <div className="grid-4" style={{ marginBottom: 22 }}>
          <div className="card">
            <div className="stat__label">Win Rate</div>
            <div className="stat__value" style={{ color: stats.winRate >= 50 ? 'var(--profit)' : 'var(--ink)' }}>
              {loading ? '—' : `${stats.winRate}%`}
            </div>
            <div className="stat__delta">{stats.wins}W / {stats.losses}L · {stats.count} trades</div>
          </div>
          <div className="card">
            <div className="stat__label">Avg R:R</div>
            <div className="stat__value">{loading ? '—' : (stats.avgRR === '—' ? '—' : `1 : ${stats.avgRR}`)}</div>
            <div className="stat__delta">target 1:2 ขึ้นไป</div>
          </div>
          <div className="card">
            <div className="stat__label">Profit Factor</div>
            <div className="stat__value">{loading ? '—' : stats.profitFactor}</div>
            <div className="stat__delta profit">{Number(stats.profitFactor) >= 1.5 ? 'healthy zone' : 'ต้องปรับ'}</div>
          </div>
          <div className="card">
            <div className="stat__label">Max Drawdown</div>
            <div className="stat__value loss">{loading ? '—' : `฿${Math.round(stats.maxDrawdown).toLocaleString()}`}</div>
            <div className="stat__delta">running peak</div>
          </div>
        </div>

        {/* Chart + Trade Plan */}
        <div className="grid-2" style={{ marginBottom: 22 }}>
          <div className="card">
            <div className="card__head">
              <div>
                <div className="card__label">EURUSD · 15m · NY Session</div>
                <div style={{ fontFamily: 'var(--f-display)', fontSize: 24, marginTop: 6 }}>
                  1.08420 <span className="mono profit" style={{ fontSize: 13 }}>+0.42%</span>
                </div>
              </div>
              <div className="row" style={{ gap: 4 }}>
                {['1m', '5m', '15m', '1H', '4H'].map(tf => (
                  <button key={tf} className={`btn btn--sm ${tf === '15m' ? '' : 'btn--ghost'}`}>{tf}</button>
                ))}
              </div>
            </div>
            <div className="chart-stub">
              <div className="chart-stub__price">1.08420</div>
              <CandleChart candles={candles} />
              <div style={{ position: 'absolute', left: '42%', top: '34%' }}>
                <span className="setup-chip">OB · Bullish</span>
              </div>
              <div style={{ position: 'absolute', right: '14%', top: '58%' }}>
                <span className="setup-chip" style={{ background: '#2a1a20', color: 'var(--rose)', borderColor: '#4a2e36' }}>FVG</span>
              </div>
              <div style={{ position: 'absolute', left: '8%', bottom: '20%' }}>
                <span className="setup-chip" style={{ background: '#1f1a2a', color: 'var(--violet)', borderColor: '#3a2e4a' }}>Liq Sweep</span>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card__head">
              <div className="card__title">Trade Plan · วันนี้</div>
              <span className="tag tag--amber">LDN OPEN</span>
            </div>
            <div className="col" style={{ gap: 14 }}>
              <div>
                <div className="card__label" style={{ marginBottom: 4 }}>Bias</div>
                <div style={{ fontSize: 14, lineHeight: 1.55 }}>
                  HTF 4H bullish, มี <span className="amber mono">unmitigated bullish OB</span> ที่ 1.0815 และ liquidity ฝั่ง sell อยู่ใต้ 1.0795 — รอ sweep แล้วเข้า long
                </div>
              </div>
              <div className="divider" style={{ margin: 0 }} />
              <div>
                <div className="card__label" style={{ marginBottom: 4 }}>Entry Criteria</div>
                <div className="col" style={{ gap: 6, fontSize: 13 }}>
                  <div className="row" style={{ gap: 8 }}><span className="mono amber">1.</span> Sweep ของ Asian low</div>
                  <div className="row" style={{ gap: 8 }}><span className="mono amber">2.</span> CHoCH บน 5m หลัง sweep</div>
                  <div className="row" style={{ gap: 8 }}><span className="mono amber">3.</span> Entry บน 1m FVG หลัง CHoCH</div>
                  <div className="row" style={{ gap: 8 }}><span className="mono amber">4.</span> SL ใต้ swept low, TP ที่ EQH</div>
                </div>
              </div>
              <div className="divider" style={{ margin: 0 }} />
              <div className="grid-2">
                <div><div className="card__label">Max Risk</div><div className="mono" style={{ fontSize: 16, marginTop: 2 }}>1% / trade</div></div>
                <div><div className="card__label">Daily Cap</div><div className="mono loss" style={{ fontSize: 16, marginTop: 2 }}>−3R stop</div></div>
              </div>
            </div>
          </div>
        </div>

        {/* Trade log */}
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="card__head" style={{ padding: '20px 20px 14px', margin: 0, borderBottom: '1px solid var(--line)' }}>
            <div className="card__title">Trade Log</div>
            <div className="row" style={{ gap: 8 }}>
              <span className="card__label">{stats.count} trades</span>
              <button className="btn btn--ghost btn--sm" onClick={() => exportCSV(trades)}>Export CSV</button>
            </div>
          </div>

          {loading ? (
            <EmptyState icon="⟳" title="กำลังโหลด..." />
          ) : trades.length === 0 ? (
            <EmptyState
              icon="✦"
              title="ยังไม่มี Trade ในระบบ"
              hint="กดปุ่ม “Log Trade” มุมขวาบนเพื่อบันทึก trade แรก"
            />
          ) : (
            <>
              <div className="trade-row trade-row--head" style={{ gridTemplateColumns: '70px 80px 80px 1fr 80px 100px 100px 60px' }}>
                <span>DATE</span><span>SYMBOL</span><span>SIDE</span><span>SETUP</span>
                <span>R:R</span><span>P&amp;L</span><span style={{ textAlign: 'right' }}>RESULT</span><span></span>
              </div>
              {trades.map(t => (
                <TradeRow key={t.id} trade={t} onEdit={handleEdit} onDelete={handleDelete} />
              ))}
            </>
          )}
        </div>

        {/* Featured trade write-up */}
        {featured && (featured.reason || featured.emotion) && (
          <div className="card" style={{ marginTop: 22 }}>
            <div className="card__head">
              <div>
                <div className="card__label">Trade ล่าสุดที่มีโน้ต</div>
                <div style={{ fontFamily: 'var(--f-display)', fontSize: 22, marginTop: 4 }}>
                  <span style={{ fontStyle: 'italic' }}>{featured.symbol}</span>{' '}
                  <span className="muted" style={{ fontSize: 14 }}>· {formatDate(featured.trade_date)} · {featured.session}</span>
                </div>
              </div>
              <span className={`tag ${featured.status === 'WIN' ? 'tag--profit' : 'tag--loss'}`}>
                {formatPnl(featured.pnl)} · {featured.rr || '—'}
              </span>
            </div>
            <div className="grid-2">
              {featured.reason && (
                <div>
                  <div className="card__label" style={{ marginBottom: 8 }}>Why I took this trade</div>
                  <div style={{ fontSize: 13.5, lineHeight: 1.7, color: 'var(--ink-2)' }}>{featured.reason}</div>
                </div>
              )}
              {featured.emotion && (
                <div>
                  <div className="card__label" style={{ marginBottom: 8 }}>What I felt</div>
                  <div style={{ fontSize: 13.5, lineHeight: 1.7, color: 'var(--ink-2)', fontStyle: 'italic', fontFamily: 'var(--f-display)' }}>
                    "{featured.emotion}"
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <TradeForm
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSaved={refresh}
        initialTrade={editing}
      />
    </>
  );
}

// ───── helpers ──────────────────────────────────────────────────────────────

function TradeRow({ trade, onEdit, onDelete }) {
  const t = trade;
  return (
    <div className="trade-row" style={{ gridTemplateColumns: '70px 80px 80px 1fr 80px 100px 100px 60px' }}>
      <span className="mono" style={{ fontSize: 12, color: 'var(--ink-3)' }}>{formatDate(t.trade_date)}</span>
      <span className="trade-symbol">{t.symbol}</span>
      <span className={`trade-side trade-side--${t.side}`} style={{ justifySelf: 'start' }}>{t.side?.toUpperCase()}</span>
      <span style={{ color: 'var(--ink-2)' }}>{t.setup || '—'}</span>
      <span className="mono" style={{ fontSize: 12 }}>{t.rr || '—'}</span>
      <span className={`mono ${t.pnl >= 0 ? 'profit' : 'loss'}`} style={{ fontWeight: 500 }}>{formatPnl(t.pnl)}</span>
      <span style={{ textAlign: 'right' }}>
        <span className={`tag ${t.status === 'WIN' ? 'tag--profit' : t.status === 'LOSS' ? 'tag--loss' : ''}`}>{t.status}</span>
      </span>
      <span style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
        <IconBtn title="แก้ไข" onClick={() => onEdit(t)}>✎</IconBtn>
        <IconBtn title="ลบ" onClick={() => onDelete(t)}>×</IconBtn>
      </span>
    </div>
  );
}

function IconBtn({ children, ...props }) {
  return (
    <button {...props} style={{
      width: 24, height: 24, borderRadius: 4,
      background: 'transparent', border: '1px solid var(--line)',
      color: 'var(--ink-3)', cursor: 'pointer',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 12,
    }}>{children}</button>
  );
}

function EmptyState({ icon, title, hint }) {
  return (
    <div style={{ padding: '60px 20px', textAlign: 'center' }}>
      <div style={{
        fontFamily: 'var(--f-display)', fontStyle: 'italic', fontSize: 48,
        color: 'var(--amber)', marginBottom: 10,
      }}>{icon}</div>
      <div style={{ fontFamily: 'var(--f-display)', fontSize: 20, marginBottom: 6 }}>{title}</div>
      {hint && <div style={{ color: 'var(--ink-3)', fontSize: 13 }}>{hint}</div>}
    </div>
  );
}

function formatDate(d) {
  if (!d) return '—';
  const date = new Date(d);
  const months = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
  return `${date.getDate()} ${months[date.getMonth()]}`;
}

function formatPnl(pnl) {
  if (pnl == null || pnl === '') return '—';
  const n = Number(pnl);
  return (n >= 0 ? '+฿' : '−฿') + Math.abs(n).toLocaleString();
}

function currentMonthLabel() {
  const months = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
  const d = new Date();
  return `${months[d.getMonth()]} ${d.getFullYear() + 543}`;
}

function exportCSV(trades) {
  if (!trades?.length) return alert('ไม่มี trade ให้ export');
  const headers = ['date', 'symbol', 'side', 'setup', 'rr', 'pnl', 'status', 'session', 'reason', 'emotion'];
  const rows = trades.map(t => headers.map(h => {
    const v = h === 'date' ? t.trade_date : t[h];
    if (v == null) return '';
    return `"${String(v).replace(/"/g, '""')}"`;
  }).join(','));
  const csv = [headers.join(','), ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `trades-${new Date().toISOString().split('T')[0]}.csv`;
  a.click(); URL.revokeObjectURL(url);
}
