import { Card } from '../ui/index.js';

/**
 * PlaybookA3Doc — เอกสาร Playbook ฉบับเต็มของระบบ A3 ฝังในหน้า Trading
 * เนื้อหาเดียวกับ artifact "A3 Playbook" แปลงมาใช้ design tokens ของ Loop
 * ไดอะแกรมเป็น inline SVG (สีอิง var(--success/--danger/--accent-strong) ตามธีม)
 */

const svgEntry = `
<svg viewBox="0 0 760 452" role="img" aria-label="กายวิภาคการเข้าไม้ A3" style="display:block;max-width:100%;height:auto;margin:0 auto">
  <defs>
    <marker id="pbAh" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M0,0 L10,5 L0,10 z" fill="currentColor"/>
    </marker>
  </defs>
  <text x="18" y="30" font-size="12" font-family="var(--f-mono)" fill="currentColor" opacity=".65">ราคา XAUUSD · 1H</text>
  <text x="18" y="318" font-size="12" font-family="var(--f-mono)" fill="currentColor" opacity=".65">MACD (12,26,9)</text>
  <line x1="14" y1="292" x2="746" y2="292" stroke="currentColor" stroke-opacity=".18"/>
  <path d="M 30 250 C 180 242, 380 226, 520 208 S 700 186, 740 180" fill="none" stroke="var(--accent-strong)" stroke-width="2.5"/>
  <text x="36" y="240" font-size="12" fill="var(--accent-strong)" font-family="var(--f-mono)">EMA 200</text>
  <g stroke="var(--success)" fill="var(--success)">
    <line x1="70" y1="192" x2="70" y2="232"/><rect x="63" y="200" width="14" height="24" rx="1.5"/>
    <line x1="122" y1="172" x2="122" y2="212"/><rect x="115" y="180" width="14" height="24" rx="1.5"/>
    <line x1="174" y1="148" x2="174" y2="192"/><rect x="167" y="156" width="14" height="28" rx="1.5"/>
    <line x1="226" y1="132" x2="226" y2="170"/><rect x="219" y="140" width="14" height="22" rx="1.5"/>
  </g>
  <g stroke="var(--danger)" fill="var(--danger)">
    <line x1="278" y1="138" x2="278" y2="182"/><rect x="271" y="144" width="14" height="26" rx="1.5"/>
    <line x1="330" y1="152" x2="330" y2="196"/><rect x="323" y="158" width="14" height="28" rx="1.5"/>
    <line x1="382" y1="168" x2="382" y2="206"/><rect x="375" y="176" width="14" height="22" rx="1.5"/>
  </g>
  <g stroke="var(--success)" fill="var(--success)">
    <line x1="434" y1="170" x2="434" y2="204"/><rect x="427" y="178" width="14" height="16" rx="1.5"/>
    <line x1="486" y1="118" x2="486" y2="188"/><rect x="479" y="126" width="14" height="52" rx="1.5"/>
  </g>
  <g stroke="currentColor" fill="none" stroke-dasharray="3 3" opacity=".7">
    <line x1="538" y1="102" x2="538" y2="140"/><rect x="531" y="110" width="14" height="24" rx="1.5"/>
  </g>
  <line x1="512" y1="56" x2="512" y2="286" stroke="currentColor" stroke-dasharray="5 4" stroke-opacity=".5"/>
  <text x="506" y="48" font-size="12" font-family="var(--f-mono)" fill="currentColor" text-anchor="end">แท่งสัญญาณปิด</text>
  <g color="var(--success)">
    <line x1="512" y1="112" x2="528" y2="112" stroke="var(--success)" stroke-width="2" marker-end="url(#pbAh)"/>
  </g>
  <text x="548" y="98" font-size="13" font-weight="600" fill="var(--success)">เข้า LONG ที่ open แท่งถัดไป</text>
  <line x1="524" y1="196" x2="620" y2="196" stroke="var(--danger)" stroke-width="2" stroke-dasharray="7 4"/>
  <text x="628" y="200" font-size="12.5" fill="var(--danger)" font-family="var(--f-mono)">SL</text>
  <g color="var(--danger)">
    <line x1="600" y1="116" x2="600" y2="192" stroke="var(--danger)" stroke-opacity=".8" marker-start="url(#pbAh)" marker-end="url(#pbAh)"/>
  </g>
  <text x="610" y="158" font-size="12" fill="var(--danger)">1.5 × ATR</text>
  <line x1="30" y1="382" x2="740" y2="382" stroke="currentColor" stroke-opacity=".25"/>
  <path d="M 30 352 C 120 344, 200 342, 270 350 S 400 376, 470 374 S 600 352, 740 336" fill="none" stroke="currentColor" stroke-width="2" stroke-opacity=".5"/>
  <path d="M 30 344 C 120 336, 190 340, 260 358 S 390 396, 450 390 C 470 386, 478 378, 492 366 S 620 330, 740 316" fill="none" stroke="var(--accent-strong)" stroke-width="2.5"/>
  <circle cx="486" cy="371" r="7" fill="none" stroke="var(--success)" stroke-width="2.5"/>
  <text x="470" y="416" font-size="12.5" fill="var(--success)" font-weight="600">จุดตัดขึ้น</text>
  <text x="608" y="352" font-size="12" fill="var(--accent-strong)" font-family="var(--f-mono)">MACD</text>
  <text x="608" y="370" font-size="12" fill="currentColor" opacity=".55" font-family="var(--f-mono)">Signal</text>
  <text x="34" y="398" font-size="11" fill="currentColor" opacity=".45" font-family="var(--f-mono)">0</text>
</svg>`;

const svgLifecycle = `
<svg viewBox="0 0 760 240" role="img" aria-label="วงจรชีวิตหนึ่งไม้ของ A3" style="display:block;max-width:100%;height:auto;margin:0 auto">
  <defs>
    <marker id="pbAh2" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M0,0 L10,5 L0,10 z" fill="currentColor"/>
    </marker>
  </defs>
  <g font-family="inherit" font-size="13">
    <rect x="20" y="42" width="130" height="52" rx="9" fill="none" stroke="currentColor" stroke-opacity=".55"/>
    <text x="85" y="64" text-anchor="middle" fill="currentColor">แท่ง 1H ปิด</text>
    <text x="85" y="82" text-anchor="middle" fill="currentColor" opacity=".55" font-size="11.5">ทุกต้นชั่วโมง</text>
    <line x1="150" y1="68" x2="188" y2="68" stroke="currentColor" marker-end="url(#pbAh2)"/>
    <rect x="190" y="42" width="150" height="52" rx="9" fill="none" stroke="currentColor" stroke-opacity=".55"/>
    <text x="265" y="64" text-anchor="middle" fill="currentColor">ตรวจ cross + EMA</text>
    <text x="265" y="82" text-anchor="middle" fill="currentColor" opacity=".55" font-size="11.5">บนแท่งที่ปิดแล้ว</text>
    <line x1="340" y1="68" x2="378" y2="68" stroke="currentColor" marker-end="url(#pbAh2)"/>
    <text x="359" y="56" text-anchor="middle" font-size="11" fill="currentColor" opacity=".6">ครบ</text>
    <rect x="380" y="42" width="160" height="52" rx="9" fill="none" stroke="var(--success)" stroke-width="1.5"/>
    <text x="460" y="64" text-anchor="middle" fill="var(--success)" font-weight="600">เข้าไม้ + SL แนบทันที</text>
    <text x="460" y="82" text-anchor="middle" fill="var(--success)" opacity=".8" font-size="11.5">open แท่งถัดไป · 0.01 lot</text>
    <line x1="540" y1="68" x2="578" y2="68" stroke="currentColor" marker-end="url(#pbAh2)"/>
    <rect x="580" y="42" width="120" height="52" rx="9" fill="none" stroke="currentColor" stroke-opacity=".55"/>
    <text x="640" y="64" text-anchor="middle" fill="currentColor">ถือไม้</text>
    <text x="640" y="82" text-anchor="middle" fill="currentColor" opacity=".55" font-size="11.5">ไม่มี TP — ปล่อยวิ่ง</text>
    <line x1="640" y1="94" x2="640" y2="120" stroke="currentColor" stroke-opacity=".4"/>
    <line x1="640" y1="120" x2="270" y2="120" stroke="currentColor" stroke-opacity=".4"/>
    <line x1="270" y1="120" x2="270" y2="146" stroke="currentColor" marker-end="url(#pbAh2)" stroke-opacity=".7"/>
    <line x1="640" y1="120" x2="640" y2="146" stroke="currentColor" marker-end="url(#pbAh2)" stroke-opacity=".7"/>
    <rect x="150" y="148" width="240" height="62" rx="9" fill="none" stroke="var(--danger)" stroke-width="1.5"/>
    <text x="270" y="172" text-anchor="middle" fill="var(--danger)" font-weight="600">ประตู 1 — ราคาแตะ SL</text>
    <text x="270" y="192" text-anchor="middle" fill="var(--danger)" opacity=".85" font-size="12">ออกทันทีกลางแท่ง · ขาดทุน ≈ −1R เสมอ</text>
    <rect x="520" y="148" width="240" height="62" rx="9" fill="none" stroke="currentColor" stroke-opacity=".55"/>
    <text x="640" y="172" text-anchor="middle" fill="currentColor" font-weight="600">ประตู 2 — MACD ตัดกลับฝั่ง</text>
    <text x="640" y="192" text-anchor="middle" fill="currentColor" opacity=".6" font-size="12">รอแท่งปิดยืนยัน → ออกที่ open ถัดไป</text>
  </g>
</svg>`;

const STREAK = ['L','L','W','L','L','L','L','W','W','L','L','L','W','L','L','L','L','L','W','L','W','L','W','W','L','L','W','W','L','W'];

const s = {
  h3: { fontFamily: 'var(--f-display)', fontSize: 19, color: 'var(--text-primary)', margin: '26px 0 8px' },
  p:  { fontSize: 14.5, color: 'var(--text-secondary)', lineHeight: 1.75, margin: '0 0 10px' },
  em: { color: 'var(--accent-strong)', fontStyle: 'normal', fontWeight: 600 },
  fig:{ border: '1px solid var(--border)', borderRadius: 'var(--radius-control)', padding: '14px 10px 8px', overflowX: 'auto', color: 'var(--text-primary)', background: 'var(--surface)' },
  cap:{ fontSize: 12.5, color: 'var(--text-muted)', margin: '10px 6px 2px', lineHeight: 1.65 },
  grid:{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 10, margin: '4px 0 10px' },
  stat:{ border: '1px solid var(--border)', borderRadius: 'var(--radius-control)', padding: '12px 14px 10px', background: 'var(--surface)' },
  statV:{ fontFamily: 'var(--f-mono)', fontSize: 21, color: 'var(--accent-strong)', fontVariantNumeric: 'tabular-nums' },
  statL:{ fontSize: 12.5, color: 'var(--text-muted)' },
  table:{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 },
  th: { fontVariantNumeric: 'tabular-nums', fontWeight: 500, fontSize: 13, color: 'var(--text-muted)', textAlign: 'left', padding: '8px 12px', borderBottom: '1px solid var(--border)' },
  td: { padding: '8px 12px', borderBottom: '1px solid var(--border)', color: 'var(--text-secondary)' },
  callout:{ borderLeft: '4px solid var(--accent)', background: 'var(--accent-soft)', borderRadius: '0 10px 10px 0', padding: '12px 16px', fontSize: 14, lineHeight: 1.7, color: 'var(--text-primary)', margin: '10px 0' },
  warn:{ borderLeft: '4px solid var(--danger)', background: 'var(--danger-soft)', borderRadius: '0 10px 10px 0', padding: '12px 16px', fontSize: 14, lineHeight: 1.7, color: 'var(--text-primary)', margin: '10px 0' },
};

export function PlaybookA3Doc() {
  return (
    <Card>
      <div style={{ maxWidth: 780 }}>
        <div style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 500, fontSize: 13, color: 'var(--accent-strong)'}}>
          A3 PLAYBOOK · ฉบับเต็ม
        </div>
        <p style={{ ...s.p, marginTop: 8 }}>
          เข้าเมื่อ<b>โมเมนตัมเพิ่งกลับทิศ</b> — เฉพาะฝั่งเดียวกับ<b>เทรนใหญ่</b> — แล้วปล่อยให้กำไรวิ่ง
          โดยมี<b>จุดตัดขาดทุนที่ปรับตามความผันผวน</b>คุมหลังทุกไม้ บอทเป็นคนเทรดทั้งหมด หน้าที่ของคนคือไม่แทรกแซง
        </p>

        <h3 style={s.h3}>เครื่องยนต์ 3 ชิ้น</h3>
        <p style={s.p}><em style={s.em}>MACD ตัดเส้น Signal</em> — วัดว่าแรงส่งกำลังเร่งหรือแผ่ว จังหวะตัดขึ้น = แรงส่งเพิ่งกลับมาฝั่งขึ้น นั่นคือเสียงปืนปล่อยตัว</p>
        <p style={s.p}><em style={s.em}>EMA 200 กรองเทรนใหญ่</em> — สัญญาณตัดขึ้นถูกรับเฉพาะเมื่อราคายืนเหนือ EMA 200 (ตัดลงต้องอยู่ใต้) เราไม่เถียงกับกระแสน้ำใหญ่</p>
        <p style={s.p}><em style={s.em}>SL = 1.5 × ATR</em> — กว้างตอนตลาดเหวี่ยง แคบตอนตลาดนิ่ง ทุกไม้เสี่ยงเป็น "1R" ที่เทียบกันได้เสมอ</p>

        <h3 style={s.h3}>กายวิภาคของการเข้าไม้</h3>
        <p style={s.p}>เงื่อนไขทั้งหมดตรวจบน<em style={s.em}>แท่งที่ปิดแล้วเท่านั้น</em> แล้วเข้าที่ราคาเปิดของแท่งถัดไป — ไม่มีการแอบมองแท่งที่ยังไม่จบ</p>
        <div style={s.fig} dangerouslySetInnerHTML={{ __html: svgEntry }} />
        <p style={s.cap}><b>เงื่อนไข Long ครบสามข้อในภาพเดียว:</b> ปิดเหนือ EMA 200 · MACD ตัดขึ้นบนแท่งที่ปิดแล้ว · เข้า open แท่งถัดไปพร้อม SL 1.5×ATR แนบไปกับออเดอร์ — ฝั่ง Short คือภาพเดียวกันกลับหัว</p>

        <h3 style={s.h3}>วงจรชีวิตของหนึ่งไม้ — ทางออกมี 2 ประตู</h3>
        <div style={s.fig} dangerouslySetInnerHTML={{ __html: svgLifecycle }} />
        <p style={s.cap}><b>ความไม่สมมาตรนี้คือดีไซน์:</b> ฝั่งขาดทุนถูกตัดเร็วเพดานตายตัว (−1R) ฝั่งกำไรไม่มีเพดาน — ไม้ชนะบางไม้วิ่ง +3R +5R ซึ่งเป็นแหล่งกำไรทั้งหมด · การออกด้วยสัญญาณต้องรอราคาเด้งสวนก่อน กำไร ณ จุดออกจึงน้อยกว่าจุดพีคเสมอ นั่นคือค่าตั๋ว ไม่ใช่ข้อผิดพลาด · ออกแล้วไม่เข้าฝั่งตรงข้ามทันที ต้องรอ cross ใหม่</p>

        <h3 style={s.h3}>ทำไมถึงเชื่อระบบนี้</h3>
        <p style={s.p}>A3 คือ<em style={s.em}>ผู้รอดเพียงหนึ่งเดียวจาก 285 สูตร</em>ที่ทดสอบด้วยเกณฑ์ตั้งก่อนเห็นผล: ผ่าน Bonferroni · ยังกำไรหลังหักอิทธิพลทองขาขึ้น (p=0.002) · พารามิเตอร์ข้างเคียง 50 ชุดบวกหมด · ทำเงินทั้งสองฝั่งบนข้อมูล 18 ปี</p>
        <div style={s.grid}>
          <div style={s.stat}><div style={s.statV}>1.505</div><div style={s.statL}>Profit Factor (net)</div></div>
          <div style={s.stat}><div style={{ ...s.statV, color: 'var(--text-primary)' }}>36%</div><div style={s.statL}>Winrate — แพ้บ่อยกว่าชนะ</div></div>
          <div style={s.stat}><div style={s.statV}>+0.24R</div><div style={s.statL}>กำไรเฉลี่ยต่อไม้</div></div>
          <div style={s.stat}><div style={{ ...s.statV, color: 'var(--text-primary)' }}>~213</div><div style={s.statL}>ไม้ต่อปี (≈4/สัปดาห์)</div></div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={s.table}>
            <thead><tr><th style={s.th}>ช่วงเวลา</th><th style={s.th}>ผลต่อไม้</th><th style={s.th}>สภาพตลาดทอง</th></tr></thead>
            <tbody>
              <tr><td style={s.td}>2008–2012</td><td style={{ ...s.td, fontFamily: 'var(--f-mono)', color: 'var(--success)' }}>+0.236R</td><td style={s.td}>เทรนขาขึ้นแรง</td></tr>
              <tr><td style={s.td}>2012–2017</td><td style={{ ...s.td, fontFamily: 'var(--f-mono)', color: 'var(--danger)' }}>−0.020R</td><td style={s.td}>ไซด์เวย์ยาว</td></tr>
              <tr><td style={s.td}>2017–2022</td><td style={{ ...s.td, fontFamily: 'var(--f-mono)', color: 'var(--danger)' }}>−0.018R</td><td style={s.td}>ไซด์เวย์สลับสวิง</td></tr>
              <tr><td style={{ ...s.td, borderBottom: 'none' }}>2022–2026</td><td style={{ ...s.td, borderBottom: 'none', fontFamily: 'var(--f-mono)', color: 'var(--success)' }}>+0.626R</td><td style={{ ...s.td, borderBottom: 'none' }}>เทรนขาขึ้นแรง (ปัจจุบัน)</td></tr>
            </tbody>
          </table>
        </div>
        <div style={s.callout}>
          <b>อ่านตารางนี้ให้ขาด:</b> A3 คือ<b>เครื่องเก็บเกี่ยวเทรนทอง</b> ไม่ใช่ระบบทุกสภาพตลาด — ช่วงมีเทรนทำเงินหนัก ช่วงไซด์เวย์เจ๊าโดยไม่เจ็บหนัก ถ้าทองเข้าไซด์เวย์ยาวแล้วผลตอบแทนหาย นั่นคือพฤติกรรมปกติ ไม่ใช่ระบบพัง
        </div>

        <h3 style={s.h3}>สิ่งที่ต้องเตรียมใจ — Winrate 36%</h3>
        <p style={s.p}>แพ้คือเหตุการณ์ปกติที่เกิด<em style={s.em}>บ่อยกว่าชนะ</em> ระบบกำไรจากไม้ชนะที่ใหญ่กว่า ไม่ใช่จากการชนะบ่อย — ข้างล่างคือหน้าตาจริงของ 30 ไม้ที่ WR 36%</p>
        <div style={{ ...s.fig, padding: '16px 12px' }}>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {STREAK.map((r, i) => (
              <div key={i} title={`ไม้ ${i + 1}: ${r === 'W' ? 'ชนะ' : 'แพ้'}`} style={{
                width: 18, height: 24, borderRadius: 4,
                background: r === 'W' ? 'var(--success)' : 'var(--danger)',
                opacity: r === 'W' ? 1 : 0.75,
              }} />
            ))}
          </div>
          <p style={s.cap}><b>แพ้ 5–6 ไม้ติดจะเกิดแน่นอน</b>ทุก ๆ ~30–50 ไม้ — มันคือคณิตศาสตร์ของ WR 36% ไม่ใช่สัญญาณว่าระบบเสีย การปิดบอทกลางสตรีคคือการล็อกขาดทุนไว้แล้วทิ้งไม้ชนะใหญ่ที่ตามมา</p>
        </div>
        <div style={s.warn}>
          <b>ความเสี่ยงจริงของโหมด 0.01 lot บนทุนเริ่ม $76:</b> SL เฉลี่ย ~$18/ไม้ ≈ 24% ของพอร์ตต่อไม้ (ไม้ SL กว้างแตะ ~$40 = 53%) — สตรีคแพ้ 5 ไม้ = พอร์ตหายราวครึ่ง นี่คือดีลที่เลือกแล้วโดยรู้ตัว ดูความเสี่ยง $ จริงได้จากบรรทัด SIZING-FIXED ใน Log ทุกไม้
        </div>

        <h3 style={s.h3}>กติกาของคน — งานเดียวคือวินัย</h3>
        <p style={s.p}>1. <b>ห้ามปิดไม้แทนบอท ห้ามเลื่อน SL</b> — ทุกการแทรกแซงเปลี่ยนระบบที่พิสูจน์แล้วให้เป็นระบบที่ไม่เคยพิสูจน์<br/>
        2. <b>ห้ามแก้พารามิเตอร์กลางการทดสอบ</b> — แก้เมื่อไหร่ นับหนึ่งใหม่<br/>
        3. <b>จดทุกไม้ภายในวันเดียวกัน</b> — แคป History ส่งให้ Claude ลงระบบ<br/>
        4. <b>แพ้เกิน 6 ไม้ติด</b> — แคป Log มาคุยก่อน ไม่ใช่ปิดบอทเอง<br/>
        5. <b>เช็คเช้า–เย็นพอ</b>: Running · ไม้มี SL · ไม่มี REJECT แปลก — จบ ไม่ต้องเฝ้าจอ</p>
        <p style={{ ...s.p, fontSize: 13, color: 'var(--text-muted)', fontStyle: 'italic' }}>
          30 ไม้แรกมีไว้เทียบกับเฉลยวิจัย (WR ~36% · AvgR บวก) ไม่ใช่ตัดสินระบบ — การตัดสินจริงต้องใช้ ~300 ไม้
        </p>
      </div>
    </Card>
  );
}
