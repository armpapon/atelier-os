import { DATA } from '../data.js';
import { Icon } from '../components/Icon.jsx';
import { PageHeader } from '../components/PageHeader.jsx';

export function Journal() {
  return (
    <>
      <PageHeader
        eyebrow="Bullet Journal · กระดาษอบอุ่น"
        title="Daily" em="Journal"
        sub="บันทึกชีวิตประจำวันแบบ rapid logging — บุลเล็ตเดียวเล่าเรื่องหนึ่งได้"
        meta={<><div>วันนี้</div><div className="page-header__meta-big">22 / 05</div></>}
        actions={<>
          <button className="btn btn--ghost"><Icon name="calendar" size={14}/> เดือน</button>
          <button className="btn btn--primary"><Icon name="plus" size={14}/> รายการใหม่</button>
        </>}
      />

      <div className="page-body">
        <div className="bujo-grid">
          <div className="bujo-page">
            <div className="bujo-page__date">
              <div>
                <div className="bujo-page__day">22 พฤษภาคม</div>
                <div style={{ fontFamily: 'var(--f-display)', fontStyle: 'italic', fontSize: 16, color: '#5a4632', marginTop: 2 }}>
                  2568 · ฝนตกตอนเช้า อากาศเย็นสบาย
                </div>
              </div>
              <div className="bujo-page__day-of-week">พฤหัสบดี · W21</div>
            </div>

            <div>
              {DATA.journalBullets.map((b, i) => {
                const bClass = b.done ? 'done' : b.bullet;
                return (
                  <div key={i} className={`bujo-line ${b.done ? 'bujo-line--done' : ''}`}>
                    <span className={`bujo-line__bullet bujo-line__bullet--${bClass}`}></span>
                    <span className="bujo-line__text">{b.text}</span>
                    {b.tag && <span className="bujo-line__tag">{b.tag}</span>}
                  </div>
                );
              })}
            </div>

            <div style={{ marginTop: 28, padding: '14px 18px', borderLeft: '3px solid #8a6438', background: 'rgba(138,100,56,0.06)' }}>
              <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#8a6438', marginBottom: 6 }}>
                สิ่งที่ต้องจำของวันนี้
              </div>
              <div style={{ fontFamily: 'var(--f-display)', fontStyle: 'italic', fontSize: 17, lineHeight: 1.55, color: 'var(--paper-ink)' }}>
                การ chase trade ตอนเหนื่อย ไม่เคยจบสวย — ครั้งหน้าถ้ารู้สึกตัวว่าใจร้อน ให้ปิดจอ 15 นาทีก่อนตัดสินใจ
              </div>
            </div>
          </div>

          <div className="col">
            <div className="card">
              <div className="card__head">
                <div className="card__title">อารมณ์สัปดาห์นี้</div>
                <span className="mono" style={{ fontSize: 11, color: 'var(--ink-3)' }}>เฉลี่ย 3.9 / 5</span>
              </div>
              <div className="mood-strip">
                {DATA.moods.map((m, i) => (
                  <div key={i} className={`mood-cell mood-cell--${m.v}`}>
                    <div className="mood-cell__dot"></div>
                    <span style={{ position: 'absolute', top: 4, left: 5 }}>{m.d}</span>
                  </div>
                ))}
              </div>
              <div className="divider" />
              <div className="row" style={{ gap: 14, fontFamily: 'var(--f-mono)', fontSize: 10.5, color: 'var(--ink-3)' }}>
                <span className="row" style={{ gap: 4 }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: '#4a3a2e', display: 'inline-block' }}></span> แย่</span>
                <span className="row" style={{ gap: 4 }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--amber)', display: 'inline-block' }}></span> ดี</span>
                <span className="row" style={{ gap: 4 }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: '#e8c08a', display: 'inline-block', boxShadow: '0 0 8px rgba(232,192,138,0.4)' }}></span> เยี่ยม</span>
              </div>
            </div>

            <div className="card">
              <div className="card__head">
                <div className="card__title">สัญลักษณ์</div>
                <span className="card__label">KEY</span>
              </div>
              <div className="col" style={{ gap: 8, fontSize: 13 }}>
                <div className="row" style={{ gap: 12 }}><span className="mono" style={{ width: 18, textAlign: 'center', color: 'var(--ink-2)' }}>·</span> งานที่ต้องทำ</div>
                <div className="row" style={{ gap: 12 }}><span className="mono" style={{ width: 18, textAlign: 'center', color: 'var(--ink-2)' }}>×</span> ทำเสร็จแล้ว</div>
                <div className="row" style={{ gap: 12 }}><span className="mono" style={{ width: 18, textAlign: 'center', color: 'var(--ink-2)' }}>›</span> เลื่อนไปวันอื่น</div>
                <div className="row" style={{ gap: 12 }}><span className="mono" style={{ width: 18, textAlign: 'center', color: 'var(--ink-2)' }}>○</span> เหตุการณ์ / นัดหมาย</div>
                <div className="row" style={{ gap: 12 }}><span className="mono" style={{ width: 18, textAlign: 'center', color: 'var(--ink-2)' }}>—</span> โน้ต / ความคิด</div>
                <div className="row" style={{ gap: 12 }}><span className="mono amber" style={{ width: 18, textAlign: 'center' }}>★</span> สิ่งที่อยากจำ</div>
              </div>
            </div>

            <div className="card">
              <div className="card__head">
                <div className="card__title">เดือน พ.ค.</div>
                <span className="tag tag--profit">23 / 30 วัน</span>
              </div>
              <div className="grid-2">
                <div className="stat"><div className="stat__label">รายการ</div><div className="stat__value">186</div></div>
                <div className="stat"><div className="stat__label">เสร็จ</div><div className="stat__value profit">142</div></div>
              </div>
            </div>
          </div>
        </div>

        <div className="card" style={{ marginTop: 28 }}>
          <div className="card__head">
            <div className="card__title">Habit Tracker · 30 วัน</div>
            <div className="row" style={{ gap: 10 }}>
              <span className="card__label">พ.ค. 2568</span>
              <button className="btn btn--ghost btn--sm">+ habit</button>
            </div>
          </div>
          <div className="col" style={{ gap: 8 }}>
            <div className="habit-grid">
              <span></span>
              {Array.from({ length: 30 }, (_, i) => (
                <span key={i} className="mono" style={{ fontSize: 9, color: 'var(--ink-4)', textAlign: 'center' }}>
                  {((i + 1) % 5 === 0 || i === 0) ? (i + 1) : ''}
                </span>
              ))}
            </div>
            {DATA.habits.map((h, i) => (
              <div key={i} className="habit-grid">
                <span className="habit-name">{h.name}</span>
                {h.pattern.split('').map((c, j) => (
                  <span key={j} className={`habit-cell ${c === '1' ? 'habit-cell--done' : 'habit-cell--miss'}`}></span>
                ))}
              </div>
            ))}
          </div>
          <div className="divider" />
          <div className="row" style={{ gap: 20, fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--ink-3)' }}>
            <span>Streak ยาวสุด: <span className="amber">23 วัน</span> · อ่านหนังสือ</span>
            <span>เฉลี่ยรวม: <span style={{ color: 'var(--ink)' }}>78%</span></span>
          </div>
        </div>
      </div>
    </>
  );
}
