export function TweaksPanel({ open, onClose, accent, setAccent, density, setDensity, active, setActive }) {
  if (!open) return null;
  const accentOptions = ['#d4a574', '#6cbf83', '#7ba7d4', '#a78fcc', '#d49aa5', '#e07a6e'];
  const densityOptions = [
    { value: 'cozy', label: 'แน่น' },
    { value: 'comfortable', label: 'พอดี' },
    { value: 'spacious', label: 'โปร่ง' },
  ];
  const modules = [
    { id: 'dashboard', label: 'แดชบอร์ด' },
    { id: 'trading',   label: 'Trading Journal' },
    { id: 'learning',  label: 'Learning Hub' },
    { id: 'journal',   label: 'Daily Journal' },
    { id: 'finance',   label: 'Finance' },
    { id: 'family',    label: 'ครอบครัว' },
  ];
  return (
    <div style={{
      position: 'fixed', right: 16, bottom: 16, zIndex: 1000, width: 280,
      background: 'rgba(250,249,247,.92)', color: '#29261b',
      backdropFilter: 'blur(24px) saturate(160%)',
      border: '.5px solid rgba(255,255,255,.6)', borderRadius: 14,
      boxShadow: '0 12px 40px rgba(0,0,0,.35)',
      fontFamily: 'ui-sans-serif,system-ui,-apple-system,sans-serif',
      fontSize: 12, overflow: 'hidden',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px' }}>
        <b style={{ fontSize: 13 }}>Tweaks</b>
        <button onClick={onClose} style={{ background: 'transparent', border: 0, color: 'rgba(0,0,0,.55)', fontSize: 14, cursor: 'pointer' }}>✕</button>
      </div>
      <div style={{ padding: '4px 14px 14px', display: 'flex', flexDirection: 'column', gap: 12, maxHeight: 'calc(100vh - 90px)', overflowY: 'auto' }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: 'rgba(0,0,0,.45)', marginBottom: 8 }}>ลักษณะหน้าตา</div>
          <div style={{ marginBottom: 10 }}>
            <div style={{ marginBottom: 6, color: 'rgba(0,0,0,.7)' }}>สีหลัก</div>
            <div style={{ display: 'flex', gap: 6 }}>
              {accentOptions.map(c => (
                <button key={c} onClick={() => setAccent(c)}
                  style={{
                    flex: 1, height: 36, borderRadius: 6, background: c,
                    border: accent === c ? '2px solid #000' : '.5px solid rgba(0,0,0,.12)',
                    cursor: 'pointer',
                  }}
                />
              ))}
            </div>
          </div>
          <div style={{ marginBottom: 10 }}>
            <div style={{ marginBottom: 6, color: 'rgba(0,0,0,.7)' }}>ความหนาแน่น</div>
            <div style={{ display: 'flex', background: 'rgba(0,0,0,.06)', borderRadius: 8, padding: 2 }}>
              {densityOptions.map(o => (
                <button key={o.value} onClick={() => setDensity(o.value)} style={{
                  flex: 1, padding: '6px 4px', border: 0, borderRadius: 6, cursor: 'pointer',
                  background: density === o.value ? 'rgba(255,255,255,.95)' : 'transparent',
                  boxShadow: density === o.value ? '0 1px 2px rgba(0,0,0,.12)' : 'none',
                  color: 'inherit', fontWeight: 500,
                }}>{o.label}</button>
              ))}
            </div>
          </div>
        </div>
        <div>
          <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: 'rgba(0,0,0,.45)', marginBottom: 8 }}>โมดูล</div>
          <div style={{ color: 'rgba(0,0,0,.55)', lineHeight: 1.5, marginBottom: 8 }}>6 โมดูลพร้อมใช้ · 2 กำลังออกแบบ</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {modules.map(m => (
              <button key={m.id} onClick={() => setActive(m.id)} style={{
                textAlign: 'left', padding: '7px 9px', borderRadius: 6, cursor: 'pointer',
                background: active === m.id ? 'rgba(212,165,116,.18)' : 'transparent',
                border: '1px solid ' + (active === m.id ? 'rgba(212,165,116,.5)' : 'rgba(0,0,0,.08)'),
                color: active === m.id ? '#8a6438' : 'inherit', fontSize: 12,
              }}>{active === m.id ? '◉ ' : '○ '}{m.label}</button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
