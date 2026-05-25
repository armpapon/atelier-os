import { useMemo } from 'react';
import { DATA } from '../data.js';
import { Icon } from '../components/Icon.jsx';
import { PageHeader } from '../components/PageHeader.jsx';
import { CandleChart } from '../components/CandleChart.jsx';

export function Trading() {
  const candles = useMemo(() => {
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

  const wins = DATA.trades.filter(t => t.status === 'WIN').length;
  const winRate = Math.round((wins / DATA.trades.length) * 100);

  return (
    <>
      <PageHeader
        eyebrow="ICT · SMC · NY/LDN Session"
        title="Trading" em="Journal"
        sub="บันทึก setup, screenshot และอารมณ์ของทุก trade — เพื่อหา edge ของตัวเอง"
        meta={<><div>เดือน · พ.ค. 2568</div><div className="page-header__meta-big profit">+฿18,420</div></>}
        actions={<>
          <button className="btn btn--ghost"><Icon name="filter" size={14}/> Filter</button>
          <button className="btn btn--primary"><Icon name="plus" size={14}/> Log Trade</button>
        </>}
      />

      <div className="page-body">
        <div className="grid-4" style={{ marginBottom: 22 }}>
          <div className="card"><div className="stat__label">Win Rate</div><div className="stat__value" style={{ color: 'var(--profit)' }}>{winRate}%</div><div className="stat__delta">{wins}W / {DATA.trades.length - wins}L · 7 trades</div></div>
          <div className="card"><div className="stat__label">Avg R:R</div><div className="stat__value">1 : 2.4</div><div className="stat__delta">target 1:2 ขึ้นไป</div></div>
          <div className="card"><div className="stat__label">Profit Factor</div><div className="stat__value">3.18</div><div className="stat__delta profit">healthy zone</div></div>
          <div className="card"><div className="stat__label">Max Drawdown</div><div className="stat__value loss">−4.2%</div><div className="stat__delta">วันที่ 18 พ.ค.</div></div>
        </div>

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

        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="card__head" style={{ padding: '20px 20px 14px', margin: 0, borderBottom: '1px solid var(--line)' }}>
            <div className="card__title">Trade Log</div>
            <div className="row" style={{ gap: 8 }}>
              <span className="card__label">7 trades</span>
              <button className="btn btn--ghost btn--sm">Export CSV</button>
            </div>
          </div>
          <div className="trade-row trade-row--head">
            <span>DATE</span><span>SYMBOL</span><span>SIDE</span><span>SETUP</span>
            <span>R:R</span><span>P&amp;L</span><span style={{ textAlign: 'right' }}>RESULT</span>
          </div>
          {DATA.trades.map(t => (
            <div key={t.id} className="trade-row">
              <span className="mono" style={{ fontSize: 12, color: 'var(--ink-3)' }}>{t.date}</span>
              <span className="trade-symbol">{t.sym}</span>
              <span className={`trade-side trade-side--${t.side}`} style={{ justifySelf: 'start' }}>{t.side.toUpperCase()}</span>
              <span style={{ color: 'var(--ink-2)' }}>{t.setup}</span>
              <span className="mono" style={{ fontSize: 12 }}>{t.rr}</span>
              <span className={`mono ${t.status === 'WIN' ? 'profit' : 'loss'}`} style={{ fontWeight: 500 }}>{t.pnl}</span>
              <span style={{ textAlign: 'right' }}>
                <span className={`tag ${t.status === 'WIN' ? 'tag--profit' : 'tag--loss'}`}>{t.status}</span>
              </span>
            </div>
          ))}
        </div>

        <div className="card" style={{ marginTop: 22 }}>
          <div className="card__head">
            <div>
              <div className="card__label">Trade ของวัน</div>
              <div style={{ fontFamily: 'var(--f-display)', fontSize: 22, marginTop: 4 }}>
                <span style={{ fontStyle: 'italic' }}>EURUSD</span> <span className="muted" style={{ fontSize: 14 }}>· 22 พ.ค. · 14:32 LDN</span>
              </div>
            </div>
            <span className="tag tag--profit">+฿4,820 · 1:3.2R</span>
          </div>
          <div className="grid-2">
            <div>
              <div className="card__label" style={{ marginBottom: 8 }}>Why I took this trade</div>
              <div style={{ fontSize: 13.5, lineHeight: 1.7, color: 'var(--ink-2)' }}>
                4H bullish bias ชัด — มี unmitigated bullish order block ที่ 1.0815 หลังจาก break ของ structure ตอน NY ก่อนหน้า ผมรอให้ราคา sweep liquidity ใต้ Asian low ที่ 1.0795 แล้วได้ CHoCH ที่ 5m ก่อน เข้า long ที่ FVG บน 1m หลัง displacement
              </div>
            </div>
            <div>
              <div className="card__label" style={{ marginBottom: 8 }}>What I felt</div>
              <div style={{ fontSize: 13.5, lineHeight: 1.7, color: 'var(--ink-2)', fontStyle: 'italic', fontFamily: 'var(--f-display)' }}>
                "รู้สึกใจเย็นมากตอนรอ. ตอน sweep เกิด ผมเกือบเข้าเร็วเกินไป แต่หยุดตัวเองได้ทัน รออีก 2 แท่งให้ CHoCH ยืนยัน — นี่คือสิ่งที่ตัวเอง 6 เดือนก่อนไม่เคยทำได้"
              </div>
            </div>
          </div>
          <div className="divider" />
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            <span className="setup-chip">OB · Bullish</span>
            <span className="setup-chip">FVG · 1m</span>
            <span className="setup-chip">Liquidity Sweep</span>
            <span className="setup-chip">CHoCH · 5m</span>
            <span className="setup-chip">LDN Killzone</span>
            <span className="setup-chip">A+ Setup</span>
          </div>
        </div>
      </div>
    </>
  );
}
