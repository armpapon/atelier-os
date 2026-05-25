import { DATA } from '../data.js';
import { Icon } from '../components/Icon.jsx';
import { PageHeader } from '../components/PageHeader.jsx';
import { Sparkline } from '../components/Sparkline.jsx';
import { toneColor } from '../lib/helpers.js';

export function Finance() {
  const totalIn = DATA.transactions.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const totalOut = DATA.transactions.filter(t => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0);
  const spendCurve = [120, 240, 180, 320, 280, 410, 380, 220, 540, 460, 380, 320, 480, 520, 380, 290, 460, 540, 380, 280, 320, 410];

  return (
    <>
      <PageHeader
        eyebrow="พ.ค. 2568 · ครอบครัว 4 คน"
        title="การเงิน" em="ของบ้าน"
        sub="รายรับ-รายจ่าย, งบประมาณ, และพอร์ตการลงทุน — ดูทั้งภาพรวมและรายละเอียด"
        meta={<><div>ยอดสุทธิ</div><div className="page-header__meta-big profit">+฿12,400 / สัปดาห์</div></>}
        actions={<>
          <button className="btn btn--ghost">ดูเดือนก่อน</button>
          <button className="btn btn--primary"><Icon name="plus" size={14}/> บันทึกรายการ</button>
        </>}
      />

      <div className="page-body">
        <div className="finance-hero" style={{ marginBottom: 22 }}>
          <div className="balance-card">
            <div className="balance-card__label">มูลค่าสุทธิทั้งหมด</div>
            <div className="balance-card__value"><sup>฿</sup>{DATA.balance.total.toLocaleString()}</div>
            <div className="balance-card__delta">▲ {DATA.balance.delta} · +3.9%</div>
            <div style={{ marginTop: 24 }}>
              <Sparkline data={[420, 425, 428, 432, 430, 438, 445, 442, 450, 458, 462, 465, 470, 468, 475, 478, 482]} color="#d4a574" height={70} />
            </div>
            <div className="row row--between" style={{ marginTop: 10, fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--ink-3)' }}>
              <span>ม.ค.</span><span>ก.พ.</span><span>มี.ค.</span><span>เม.ย.</span><span>พ.ค.</span>
            </div>
          </div>

          <div className="card">
            <div className="card__head">
              <div className="card__title">บัญชี & ทรัพย์สิน</div>
              <span className="card__label">5 บัญชี</span>
            </div>
            <div className="col" style={{ gap: 12 }}>
              {DATA.accounts.map((a, i) => (
                <div key={i} className="row row--between" style={{ paddingBottom: 12, borderBottom: i < DATA.accounts.length - 1 ? '1px solid var(--line)' : 'none' }}>
                  <div className="row" style={{ gap: 10 }}>
                    <span style={{ width: 4, height: 28, borderRadius: 2, background: toneColor(a.tone) }}></span>
                    <span style={{ fontSize: 13 }}>{a.name}</span>
                  </div>
                  <span className="mono" style={{ fontSize: 13.5, color: 'var(--ink)' }}>฿{a.balance.toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="grid-3" style={{ marginBottom: 22 }}>
          <div className="card">
            <div className="stat__label">รายรับ · เดือนนี้</div>
            <div className="stat__value profit" style={{ marginTop: 6 }}>+฿{totalIn.toLocaleString()}</div>
            <div className="divider" style={{ margin: '14px 0' }} />
            <Sparkline data={[20, 0, 0, 0, 0, 65, 0, 0, 8.2, 0, 0]} color="#6cbf83" height={40} />
            <div className="stat__delta" style={{ marginTop: 6 }}>3 รายการ · เงินเดือน + Trade profit</div>
          </div>

          <div className="card">
            <div className="stat__label">รายจ่าย · เดือนนี้</div>
            <div className="stat__value loss" style={{ marginTop: 6 }}>−฿{totalOut.toLocaleString()}</div>
            <div className="divider" style={{ margin: '14px 0' }} />
            <Sparkline data={spendCurve} color="#e07a6e" height={40} />
            <div className="stat__delta" style={{ marginTop: 6 }}>22 รายการ · 60% ของงบ</div>
          </div>

          <div className="card">
            <div className="stat__label">หมวดที่ใช้เยอะสุด</div>
            <div style={{ fontFamily: 'var(--f-display)', fontSize: 24, marginTop: 6 }}>ลูก & ครอบครัว</div>
            <div className="divider" style={{ margin: '14px 0' }} />
            <div className="col" style={{ gap: 8 }}>
              {[
                { c: 'ลูก & ครอบครัว', v: 14500, tone: 'rose' },
                { c: 'อาหาร', v: 8420, tone: 'amber' },
                { c: 'บิล', v: 5840, tone: 'blue' },
              ].map((x, i) => (
                <div key={i} className="row row--between" style={{ fontSize: 13 }}>
                  <span className="row" style={{ gap: 8 }}>
                    <span style={{ width: 8, height: 8, borderRadius: 2, background: toneColor(x.tone) }}></span>
                    {x.c}
                  </span>
                  <span className="mono" style={{ color: 'var(--ink-2)' }}>฿{x.v.toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="dash-grid">
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div className="card__head" style={{ padding: '20px 20px 14px', margin: 0, borderBottom: '1px solid var(--line)' }}>
              <div className="card__title">รายการล่าสุด</div>
              <div className="row" style={{ gap: 8 }}>
                <button className="btn btn--ghost btn--sm">All</button>
                <button className="btn btn--ghost btn--sm">รายรับ</button>
                <button className="btn btn--ghost btn--sm">รายจ่าย</button>
              </div>
            </div>
            {DATA.transactions.map(t => (
              <div key={t.id} className="txn-row">
                <div className={`txn-icon txn-icon--${t.type}`}>
                  {t.type === 'food' ? '☕' : t.type === 'transport' ? '⛽' : t.type === 'bills' ? '⚡' : t.type === 'income' ? '＋' : '◇'}
                </div>
                <div>
                  <div className="txn-row__title">{t.title}</div>
                  <div className="txn-row__sub">{t.date}</div>
                </div>
                <div className="txn-row__cat">{t.cat}</div>
                <div className={`txn-row__amount ${t.amount > 0 ? 'txn-row__amount--in' : ''}`}>
                  {t.amount > 0 ? '+' : '−'}฿{Math.abs(t.amount).toLocaleString()}
                </div>
              </div>
            ))}
          </div>

          <div className="col">
            <div className="card">
              <div className="card__head">
                <div className="card__title">งบประมาณเดือนนี้</div>
                <span className="tag tag--amber">60% ใช้ไป</span>
              </div>
              <div className="col" style={{ gap: 14 }}>
                {DATA.budgets.map((b, i) => {
                  const pct = Math.round((b.spent / b.limit) * 100);
                  const over = pct > 95;
                  return (
                    <div key={i}>
                      <div className="row row--between" style={{ marginBottom: 4 }}>
                        <span style={{ fontSize: 13 }}>{b.cat}</span>
                        <span className="mono" style={{ fontSize: 11, color: over ? 'var(--loss)' : 'var(--ink-3)' }}>
                          ฿{b.spent.toLocaleString()} / ฿{b.limit.toLocaleString()}
                        </span>
                      </div>
                      <div className="budget-bar">
                        <div className={`budget-bar__fill ${over ? 'budget-bar__fill--over' : ''}`} style={{ width: `${Math.min(100, pct)}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="card card--paper">
              <div className="card__label" style={{ color: '#8a6438', marginBottom: 8 }}>เป้าหมายปีนี้</div>
              <div style={{ fontFamily: 'var(--f-display)', fontStyle: 'italic', fontSize: 22, color: 'var(--paper-ink)' }}>
                เก็บเงิน ฿600,000 เพื่อ <em>down ค่าบ้าน</em>
              </div>
              <div className="row row--between" style={{ marginTop: 14, fontFamily: 'var(--f-mono)', fontSize: 11, color: '#8a6438' }}>
                <span>เก็บได้ ฿382,000</span><span>63.7%</span>
              </div>
              <div className="budget-bar" style={{ marginTop: 4, background: 'rgba(58,46,34,0.15)' }}>
                <div className="budget-bar__fill" style={{ width: '63.7%', background: '#8a6438' }} />
              </div>
              <div className="mono" style={{ fontSize: 10.5, color: '#8a6438', marginTop: 10, letterSpacing: '0.1em' }}>
                ที่ pace นี้ — ถึงเป้าใน 4.2 เดือน
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
