import { useState } from 'react';
import { DATA } from '../data.js';
import { Icon } from '../components/Icon.jsx';
import { PageHeader } from '../components/PageHeader.jsx';
import { Sparkline } from '../components/Sparkline.jsx';
import { thumbBg } from '../lib/helpers.js';

export function Learning() {
  const [tab, setTab] = useState('all');
  const filtered = tab === 'all' ? DATA.courses : DATA.courses.filter(c => c.src.toLowerCase() === tab);

  return (
    <>
      <PageHeader
        eyebrow="คุณกำลังเรียนรู้ 6 อย่างพร้อมกัน"
        title="Learning" em="Hub"
        sub="YouTube · หนังสือ · คอร์ส · พอดแคสต์ · บทความ — รวมไว้ที่นี่ พร้อมโน้ตของคุณเอง"
        meta={<><div>เวลาเรียนสะสม</div><div className="page-header__meta-big">142 ชม.</div></>}
        actions={<>
          <button className="btn btn--ghost"><Icon name="search" size={14}/> ค้นหา</button>
          <button className="btn btn--primary"><Icon name="plus" size={14}/> เพิ่มแหล่งเรียน</button>
        </>}
      />

      <div className="page-body">
        <div className="dash-hero" style={{ marginBottom: 22 }}>
          <div className="row row--between" style={{ alignItems: 'flex-start' }}>
            <div>
              <div className="card__label">กำลังเรียน · เน้นสัปดาห์นี้</div>
              <div style={{ fontFamily: 'var(--f-display)', fontSize: 36, lineHeight: 1.1, marginTop: 8, maxWidth: 600 }}>
                <em style={{ color: 'var(--amber)', fontStyle: 'italic' }}>ICT Mentorship 2024</em><br/>
                Market Maker Buy Model — Episode 7
              </div>
              <div className="row" style={{ gap: 8, marginTop: 14 }}>
                <span className="tag tag--amber">TRADING</span>
                <span className="tag">YOUTUBE · 47 นาที</span>
                <span className="tag">โดย ICT</span>
              </div>
            </div>
            <button className="btn btn--primary" style={{ padding: '10px 18px' }}>
              <Icon name="play" size={12}/> เรียนต่อ · 72%
            </button>
          </div>
          <div className="budget-bar" style={{ marginTop: 22, height: 3 }}>
            <div className="budget-bar__fill" style={{ width: '72%' }} />
          </div>
          <div className="row row--between" style={{ marginTop: 14, fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--ink-3)' }}>
            <span>เริ่มเมื่อ 18 พ.ค.</span><span>เหลือ 13 นาที</span>
          </div>
        </div>

        <div className="tabs">
          {[
            { id: 'all', label: 'ทั้งหมด · 6' },
            { id: 'youtube', label: 'YouTube · 3' },
            { id: 'udemy', label: 'คอร์ส · 1' },
            { id: 'podcast', label: 'Podcast · 1' },
            { id: 'blog', label: 'บทความ · 1' },
          ].map(t => (
            <button key={t.id} className={`tab ${tab === t.id ? 'tab--active' : ''}`} onClick={() => setTab(t.id)}>{t.label}</button>
          ))}
        </div>

        <div className="grid-3">
          {filtered.map(c => (
            <div key={c.id} className="course-card">
              <div className="course-thumb" style={{ background: thumbBg(c.src) }}>
                <span className="course-thumb__src">{c.src}</span>
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'rgba(14,13,11,0.55)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink)', border: '1px solid rgba(255,255,255,0.1)' }}>
                    <Icon name="play" size={14}/>
                  </div>
                </div>
                <div style={{ position: 'absolute', right: -10, bottom: -10, fontFamily: 'var(--f-display)', fontStyle: 'italic', fontSize: 86, color: 'rgba(212,165,116,0.18)', lineHeight: 1 }}>
                  {c.id.slice(-1)}
                </div>
                <div className="course-thumb__progress"><span style={{ width: `${c.progress}%` }} /></div>
              </div>
              <div className="course-card__body">
                <div className="course-card__title">{c.title}</div>
                <div className="course-card__meta">{c.author} · {c.dur} · {c.progress}%</div>
              </div>
            </div>
          ))}
        </div>

        <div className="card" style={{ marginTop: 28 }}>
          <div className="card__head">
            <div className="card__title">หนังสือที่อ่านอยู่</div>
            <span className="card__label">4 เล่ม</span>
          </div>
          {DATA.books.map(b => (
            <div key={b.id} className="book-item">
              <div className={`book-cover book-cover--${b.cover}`}>{b.glyph}</div>
              <div>
                <div style={{ fontFamily: 'var(--f-display)', fontSize: 17, color: 'var(--ink)' }}>{b.title}</div>
                <div className="mono" style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 2 }}>{b.author}</div>
                <div className="row" style={{ gap: 10, marginTop: 8 }}>
                  <div className="budget-bar" style={{ width: 200 }}>
                    <div className="budget-bar__fill" style={{ width: `${b.progress}%` }} />
                  </div>
                  <span className="mono" style={{ fontSize: 11, color: 'var(--ink-3)' }}>{b.progress}%</span>
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                {b.progress === 100
                  ? <span className="tag tag--profit">อ่านจบแล้ว</span>
                  : <button className="btn btn--ghost btn--sm">เปิดอ่าน</button>}
              </div>
            </div>
          ))}
        </div>

        <div className="grid-2" style={{ marginTop: 22 }}>
          <div className="card card--paper">
            <div className="card__head">
              <div className="card__label" style={{ color: '#8a6438' }}>โน้ตล่าสุด</div>
              <span className="mono" style={{ fontSize: 11, color: '#8a6438' }}>21 พ.ค.</span>
            </div>
            <div style={{ fontFamily: 'var(--f-display)', fontSize: 18, fontStyle: 'italic', color: 'var(--paper-ink)', marginBottom: 10 }}>
              FVG = Fair Value Gap
            </div>
            <div style={{ fontSize: 13.5, lineHeight: 1.65, color: '#3a2e22' }}>
              ช่องว่างระหว่างราคา 3 แท่งที่ ราคาเคลื่อนเร็วจนข้าม level ไป — เป็นจุดที่ราคามักกลับมา mitigate. สำคัญ: ดูพร้อมกับ HTF bias เสมอ ไม่งั้น false signal เยอะมาก
            </div>
            <div className="mono" style={{ fontSize: 10.5, color: '#8a6438', marginTop: 14, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
              จาก ICT Ep.4 · #trading #ict #notes
            </div>
          </div>

          <div className="card">
            <div className="card__head">
              <div className="card__title">สัปดาห์นี้</div>
              <span className="tag tag--profit">เกินเป้า</span>
            </div>
            <div className="grid-2">
              <div className="stat"><div className="stat__label">เวลาเรียน</div><div className="stat__value">8.4 <span className="muted" style={{ fontSize: 14 }}>ชม.</span></div><div className="stat__delta">เป้า 7 ชม. · +20%</div></div>
              <div className="stat"><div className="stat__label">โน้ตที่เขียน</div><div className="stat__value">14</div><div className="stat__delta">12 trading · 2 ทั่วไป</div></div>
            </div>
            <div className="divider" />
            <div className="card__label" style={{ marginBottom: 10 }}>กราฟ 14 วัน</div>
            <Sparkline data={[1.2, 1.8, 0.6, 2.4, 1.6, 1.0, 2.2, 1.8, 0.4, 2.6, 2.0, 1.4, 2.8, 2.2]} color="#a78fcc" />
          </div>
        </div>
      </div>
    </>
  );
}
