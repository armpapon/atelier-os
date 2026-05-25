import { DATA } from '../data.js';
import { Icon } from '../components/Icon.jsx';
import { PageHeader } from '../components/PageHeader.jsx';
import { toneColor } from '../lib/helpers.js';

export function Family() {
  return (
    <>
      <PageHeader
        eyebrow="ครอบครัว · 4 คน"
        title="ครอบครัว" em="ของเรา"
        sub="วันสำคัญ, การดูแล, และโน้ตเล็ก ๆ น้อย ๆ ของคนที่รัก"
        meta={<><div>เหตุการณ์ที่กำลังมา</div><div className="page-header__meta-big">3 อัน</div></>}
        actions={<>
          <button className="btn btn--ghost"><Icon name="calendar" size={14}/> ปฏิทิน</button>
          <button className="btn btn--primary"><Icon name="plus" size={14}/> เพิ่มสมาชิก</button>
        </>}
      />
      <div className="page-body">
        <div className="card card--paper" style={{ marginBottom: 22, padding: 36 }}>
          <div className="row row--between" style={{ alignItems: 'flex-start' }}>
            <div style={{ maxWidth: 600 }}>
              <div className="card__label" style={{ color: '#8a6438', marginBottom: 10 }}>คำเตือนของวัน</div>
              <div style={{ fontFamily: 'var(--f-display)', fontStyle: 'italic', fontSize: 32, lineHeight: 1.3, color: 'var(--paper-ink)' }}>
                เงินที่หามาได้, การเรียนรู้, และ trade ที่ชนะ — ทั้งหมดมีค่าเพราะมีคนข้างหลังที่เรารัก
              </div>
            </div>
            <div style={{ display: 'flex' }}>
              {DATA.family.map((p, i) => (
                <div key={i} className="family-avatar" style={{
                  background: p.color, marginLeft: i === 0 ? 0 : -10,
                  border: '3px solid var(--paper)', position: 'relative', zIndex: 4 - i,
                  width: 56, height: 56, fontSize: 26,
                }}>{p.initial}</div>
              ))}
            </div>
          </div>
        </div>

        <div className="grid-2">
          <div className="card">
            <div className="card__head">
              <div className="card__title">สมาชิก</div>
              <span className="card__label">4 คน</span>
            </div>
            {DATA.family.map((m, i) => (
              <div key={i} className="family-member">
                <div className="family-avatar" style={{ background: m.color }}>{m.initial}</div>
                <div>
                  <div style={{ fontFamily: 'var(--f-display)', fontSize: 17 }}>{m.name}</div>
                  <div className="mono" style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 2 }}>{m.role}</div>
                  <div style={{ fontSize: 12.5, color: 'var(--ink-2)', marginTop: 6 }}>{m.note}</div>
                </div>
                <button className="btn btn--ghost btn--sm">ดู</button>
              </div>
            ))}
          </div>

          <div className="col">
            <div className="card">
              <div className="card__head">
                <div className="card__title">วันสำคัญ</div>
                <span className="card__label">มิ.ย. - ก.ค.</span>
              </div>
              <div className="col" style={{ gap: 14 }}>
                {[
                  { d: '28', m: 'พ.ค.', who: 'แม่', event: 'นัดหมอ — รพ.จุฬาฯ', tone: 'amber', days: 6 },
                  { d: '30', m: 'พ.ค.', who: 'น้องโชค', event: 'รับวัคซีน MMR', tone: 'blue', days: 8 },
                  { d: '14', m: 'มิ.ย.', who: 'พี่ใหม่', event: 'วันเกิด — จองร้านไว้แล้ว', tone: 'violet', days: 23 },
                  { d: '01', m: 'ก.ค.', who: 'น้องดาว', event: 'เปิดเทอม + ซื้อชุดใหม่', tone: 'rose', days: 40 },
                ].map((e, i) => (
                  <div key={i} className="row" style={{ gap: 14, paddingBottom: 12, borderBottom: i < 3 ? '1px solid var(--line)' : 'none' }}>
                    <div style={{ width: 56, padding: '6px 0', background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 6, textAlign: 'center' }}>
                      <div style={{ fontFamily: 'var(--f-display)', fontSize: 22, lineHeight: 1, color: toneColor(e.tone) }}>{e.d}</div>
                      <div className="mono" style={{ fontSize: 9, color: 'var(--ink-3)', letterSpacing: '0.1em', marginTop: 4 }}>{e.m}</div>
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13.5 }}>{e.event}</div>
                      <div className="mono" style={{ fontSize: 10.5, color: 'var(--ink-3)', marginTop: 3 }}>กับ {e.who} · อีก {e.days} วัน</div>
                    </div>
                    <span className={`tag tag--${e.tone}`}>{e.who}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="card">
              <div className="card__head">
                <div className="card__title">ค่าใช้จ่ายครอบครัวเดือนนี้</div>
                <span className="tag tag--loss">90% ของงบ</span>
              </div>
              <div className="grid-3" style={{ marginTop: 4 }}>
                <div className="stat"><div className="stat__label">ลูก</div><div className="stat__value" style={{ fontSize: 22 }}>฿14.5k</div></div>
                <div className="stat"><div className="stat__label">บ้าน</div><div className="stat__value" style={{ fontSize: 22 }}>฿8.8k</div></div>
                <div className="stat"><div className="stat__label">แม่</div><div className="stat__value" style={{ fontSize: 22 }}>฿5.0k</div></div>
              </div>
            </div>
          </div>
        </div>

        <div className="card" style={{ marginTop: 22 }}>
          <div className="card__head">
            <div className="card__title">โน้ตที่แชร์กัน</div>
            <button className="btn btn--ghost btn--sm"><Icon name="plus" size={12}/> โน้ตใหม่</button>
          </div>
          <div className="grid-3">
            {[
              { who: 'พี่ใหม่', when: 'วันนี้ 09:14', title: 'ของฝากแม่', body: 'อย่าลืมซื้อยาแม่ — ที่ Watsons สาขาสยาม + ผลไม้ตามฤดู' },
              { who: 'อาทิตย์', when: 'เมื่อวาน', title: 'งบเที่ยวเดือนหน้า', body: 'ตั้งใจจะไปทะเลกัน 3 วัน 2 คืน — งบประมาณ 15,000 ทั้งทริป รวมค่าเดินทาง' },
              { who: 'น้องดาว', when: '20 พ.ค.', title: 'ลายมือลูก ❤', body: '"หนูรักพ่อแม่ที่สุดในโลกเลยค่าาาา" — เขียนใส่กระดาษวางบนโต๊ะ' },
            ].map((n, i) => (
              <div key={i} className="card card--paper" style={{ padding: 18 }}>
                <div className="row row--between" style={{ marginBottom: 8 }}>
                  <span className="mono" style={{ fontSize: 10.5, color: '#8a6438', letterSpacing: '0.1em', textTransform: 'uppercase' }}>โดย {n.who}</span>
                  <span className="mono" style={{ fontSize: 10, color: '#8a6438' }}>{n.when}</span>
                </div>
                <div style={{ fontFamily: 'var(--f-display)', fontStyle: 'italic', fontSize: 18, marginBottom: 6 }}>{n.title}</div>
                <div style={{ fontSize: 13, lineHeight: 1.55, color: '#3a2e22' }}>{n.body}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
