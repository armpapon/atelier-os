import { PageHeader } from './PageHeader.jsx';
import { Icon } from './Icon.jsx';

export function ComingSoon({ title, eyebrow, emoji, description }) {
  return (
    <>
      <PageHeader eyebrow={eyebrow} title={title} sub={description} />
      <div className="page-body">
        <div className="card" style={{ padding: 60, textAlign: 'center' }}>
          <div style={{ fontFamily: 'var(--f-display)', fontStyle: 'italic', fontSize: 56, color: 'var(--amber)', marginBottom: 14 }}>{emoji}</div>
          <div style={{ fontFamily: 'var(--f-display)', fontSize: 28, marginBottom: 10 }}>กำลังออกแบบอยู่</div>
          <div style={{ color: 'var(--ink-3)', maxWidth: 480, margin: '0 auto' }}>
            ส่วนนี้อยู่ใน roadmap — ถ้าอยากเริ่มที่นี่ก่อนบอกได้
          </div>
          <button className="btn btn--primary" style={{ marginTop: 22 }}>
            <Icon name="spark" size={14}/> ขอให้ออกแบบส่วนนี้
          </button>
        </div>
      </div>
    </>
  );
}
