import { DATA } from '../data.js';
import { Icon } from '../components/Icon.jsx';
import { PageHeader } from '../components/PageHeader.jsx';
import { Sparkline } from '../components/Sparkline.jsx';

export function Dashboard() {
  const equityCurve = [120, 122, 121, 124, 128, 127, 130, 134, 133, 136, 140, 138, 143, 148, 152, 150, 156, 161, 159, 165, 172, 178];
  const moodCurve   = [3, 4, 3, 4, 5, 4, 4, 3, 4, 5, 5, 4, 4, 5, 3, 4, 5, 4, 5, 4, 5, 4];
  return (
    <>
      <PageHeader
        eyebrow={DATA.weekRange}
        title="สวัสดีตอนเช้า,"
        em="อาทิตย์"
        sub="วันนี้คุณมี 6 งาน · 2 trade ที่เปิดอยู่ · 1 ครอบครัวต้องดูแล. ค่อย ๆ ทำทีละอย่าง"
        meta={<><div>{DATA.today}</div><div className="page-header__meta-big">06:42 น.</div></>}
        actions={<button className="btn btn--primary"><Icon name="plus" size={14}/> Quick Entry</button>}
      />
      <div className="page-body">
        <div className="dash-hero">
          <div className="dash-hero__greeting">วันนี้คือ <em>วันที่ดี</em> ที่จะทำต่อไป</div>
          <div className="dash-hero__sub">เป้าหมายของสัปดาห์: backtest 30 setup, อ่านหนังสือจบ 1 เล่ม, ใช้เงินไม่เกิน ฿8,000</div>
          <div className="kpi-strip">
            {DATA.kpis.map((k, i) => (
              <div key={i} className="kpi">
                <div className="stat__label">{k.label}</div>
                <div className="stat__value" style={{ marginTop: 8, color: k.tone === 'profit' ? 'var(--profit)' : k.tone === 'amber' ? 'var(--amber)' : 'var(--ink)' }}>{k.value}</div>
                <div className="stat__delta">{k.delta}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ height: 18 }} />

        <div className="dash-grid">
          <div className="col">
            <div className="card">
              <div className="card__head">
                <div className="card__title">วันนี้ของคุณ</div>
                <div className="row" style={{ gap: 6 }}>
                  <span className="card__label">6 งาน</span>
                  <button className="btn btn--ghost btn--sm">ดูทั้งหมด <Icon name="chevron" size={12}/></button>
                </div>
              </div>
              <div className="today-list">
                {DATA.todayTasks.map(t => (
                  <div key={t.id} className={`today-item ${t.done ? 'today-item--done' : ''}`}>
                    <div className="today-item__check">{t.done && <Icon name="check" size={12} />}</div>
                    <div><div className="today-item__text">{t.text}</div></div>
                    <div className="row" style={{ gap: 10 }}>
                      <span className={`tag tag--${t.tag === 'TRADE' ? 'amber' : t.tag === 'FINANCE' ? 'profit' : t.tag === 'LEARN' ? 'blue' : t.tag === 'READ' ? 'violet' : 'rose'}`}>{t.tag}</span>
                      <span className="today-item__meta">{t.time}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid-2">
              <div className="card">
                <div className="card__head">
                  <div>
                    <div className="card__label">Equity Curve · 30 วัน</div>
                    <div style={{ fontFamily: 'var(--f-display)', fontSize: 28, marginTop: 4, color: 'var(--profit)' }}>+฿42,180</div>
                  </div>
                  <span className="tag tag--profit">+8.7%</span>
                </div>
                <Sparkline data={equityCurve} color="#6cbf83" />
                <div className="row row--between" style={{ marginTop: 10, fontSize: 11, color: 'var(--ink-3)', fontFamily: 'var(--f-mono)' }}>
                  <span>22 เม.ย.</span><span>22 พ.ค.</span>
                </div>
              </div>

              <div className="card">
                <div className="card__head">
                  <div>
                    <div className="card__label">อารมณ์ & พลังงาน</div>
                    <div style={{ fontFamily: 'var(--f-display)', fontSize: 28, marginTop: 4 }}>โอเค</div>
                  </div>
                  <Icon name="mood" size={22}/>
                </div>
                <Sparkline data={moodCurve} color="#d4a574" />
                <div className="row" style={{ marginTop: 10, gap: 6, flexWrap: 'wrap' }}>
                  <span className="tag tag--amber">โฟกัสได้ดี</span>
                  <span className="tag">นอนน้อย</span>
                  <span className="tag">ใจร้อน</span>
                </div>
              </div>
            </div>
          </div>

          <div className="col">
            <div className="card card--paper">
              <div className="card__head">
                <div className="card__title" style={{ fontStyle: 'italic' }}>โน้ตของวันนี้</div>
                <span className="card__label" style={{ color: '#8a6438' }}>22 พ.ค.</span>
              </div>
              <div style={{ fontFamily: 'var(--f-display)', fontSize: 17, lineHeight: 1.55, color: 'var(--paper-ink)' }}>
                "ก่อนเข้า trade ให้ถามตัวเองว่า — ถ้านี่คือ trade สุดท้ายของเดือน คุณยังจะกดเข้าอยู่ไหม?"
              </div>
              <div style={{ fontFamily: 'var(--f-mono)', fontSize: 11, color: '#8a6438', marginTop: 14, letterSpacing: '0.1em' }}>
                — จาก Mark Douglas, Trading in the Zone
              </div>
            </div>

            <div className="card">
              <div className="card__head">
                <div className="card__title">กำลังเรียนอยู่</div>
                <span className="card__label">3 active</span>
              </div>
              {DATA.courses.slice(0, 3).map(c => (
                <div key={c.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--line)' }}>
                  <div className="row row--between" style={{ marginBottom: 6 }}>
                    <span className="tag">{c.src}</span>
                    <span className="mono" style={{ fontSize: 11, color: 'var(--ink-3)' }}>{c.progress}%</span>
                  </div>
                  <div style={{ fontSize: 13.5, color: 'var(--ink)' }}>{c.title}</div>
                  <div className="mono" style={{ fontSize: 10.5, color: 'var(--ink-3)', marginTop: 3 }}>{c.author} · {c.dur}</div>
                  <div className="budget-bar" style={{ marginTop: 8 }}>
                    <div className="budget-bar__fill" style={{ width: `${c.progress}%` }} />
                  </div>
                </div>
              ))}
            </div>

            <div className="card">
              <div className="card__head">
                <div className="card__title">การเงินสัปดาห์นี้</div>
                <span className="tag tag--profit">+฿12,400</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div className="stat"><div className="stat__label">เข้า</div><div className="stat__value profit">฿73,200</div></div>
                <div className="stat"><div className="stat__label">ออก</div><div className="stat__value loss">฿60,800</div></div>
              </div>
              <div className="divider" />
              <div className="col" style={{ gap: 12 }}>
                {DATA.budgets.slice(0, 3).map((b, i) => {
                  const pct = Math.round((b.spent / b.limit) * 100);
                  return (
                    <div key={i}>
                      <div className="row row--between" style={{ marginBottom: 4 }}>
                        <span style={{ fontSize: 13 }}>{b.cat}</span>
                        <span className="mono" style={{ fontSize: 11, color: 'var(--ink-3)' }}>฿{b.spent.toLocaleString()} / ฿{b.limit.toLocaleString()}</span>
                      </div>
                      <div className="budget-bar">
                        <div className={`budget-bar__fill ${pct > 90 ? 'budget-bar__fill--over' : ''}`} style={{ width: `${Math.min(100, pct)}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
