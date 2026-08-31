import { canSeePage } from './Sidebar.jsx';
import { ACCENT_OPTIONS } from '../lib/accents.js';

export function TweaksPanel({ open, onClose, accent, setAccent, density, setDensity, active, setActive, user }) {
  if (!open) return null;
  // Colour DATA the user picks an accent from — not tokens, keep literal.
  // Each option ships its own AA-safe text/fill variants; see src/lib/accents.js.
  const accentOptions = ACCENT_OPTIONS;
  const densityOptions = [
    { value: 'cozy', label: 'แน่น' },
    { value: 'comfortable', label: 'พอดี' },
    { value: 'spacious', label: 'โปร่ง' },
  ];
  // Same access rules as the sidebar — this shortcut list used to offer pages
  // the signed-in account can't see in its own menu.
  const modules = [
    { id: 'dashboard', label: 'แดชบอร์ด' },
    { id: 'trading',   label: 'Trading Journal' },
    { id: 'learning',  label: 'Learning Hub' },
    { id: 'journal',   label: 'Daily Journal' },
    { id: 'finance',   label: 'Finance' },
    { id: 'family',    label: 'ครอบครัว' },
  ].filter(m => canSeePage(user, m.id));
  return (
    <div style={{
      position: 'fixed', right: 16, bottom: 16, zIndex: 1000, width: 280,
      background: 'var(--sidebar-bg)', color: 'var(--text-primary)',
      backdropFilter: 'blur(24px) saturate(160%)',
      border: '.5px solid var(--hairline)', borderRadius: 14,
      boxShadow: 'var(--shadow-pop)',
      fontFamily: 'var(--f-body)',
      fontSize: 12, overflow: 'hidden',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px' }}>
        <b style={{ fontSize: 13 }}>Tweaks</b>
        <button onClick={onClose} style={{ background: 'transparent', border: 0, color: 'var(--text-secondary)', fontSize: 14, cursor: 'pointer' }}>✕</button>
      </div>
      <div style={{ padding: '4px 14px 14px', display: 'flex', flexDirection: 'column', gap: 12, maxHeight: 'calc(100vh - 90px)', overflowY: 'auto' }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 8 }}>ลักษณะหน้าตา</div>
          <div style={{ marginBottom: 10 }}>
            <div style={{ marginBottom: 6, color: 'var(--text-secondary)' }}>สีหลัก</div>
            <div style={{ display: 'flex', gap: 6 }}>
              {accentOptions.map(o => (
                <button key={o.id} onClick={() => setAccent(o.light.base)}
                  title={o.label} aria-label={o.label}
                  data-accent={o.id}
                  aria-pressed={accent === o.light.base}
                  style={{
                    flex: 1, height: 36, borderRadius: 6, background: o.light.base,
                    border: accent === o.light.base ? '2px solid var(--text-primary)' : '.5px solid var(--hairline)',
                    cursor: 'pointer',
                  }}
                />
              ))}
            </div>
          </div>
          <div style={{ marginBottom: 10 }}>
            <div style={{ marginBottom: 6, color: 'var(--text-secondary)' }}>ความหนาแน่น</div>
            <div style={{ display: 'flex', background: 'var(--fill)', borderRadius: 8, padding: 2 }}>
              {densityOptions.map(o => (
                <button key={o.value} onClick={() => setDensity(o.value)} style={{
                  flex: 1, padding: '6px 4px', border: 0, borderRadius: 6, cursor: 'pointer',
                  background: density === o.value ? 'var(--surface)' : 'transparent',
                  boxShadow: density === o.value ? 'var(--shadow-card)' : 'none',
                  color: 'inherit', fontWeight: 500,
                }}>{o.label}</button>
              ))}
            </div>
          </div>
        </div>
        <div>
          <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 8 }}>โมดูล</div>
          <div style={{ color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: 8 }}>6 โมดูลพร้อมใช้ · 2 กำลังออกแบบ</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {modules.map(m => (
              <button key={m.id} onClick={() => setActive(m.id)} style={{
                textAlign: 'left', padding: '7px 9px', borderRadius: 6, cursor: 'pointer',
                background: active === m.id ? 'var(--accent-tint)' : 'transparent',
                border: '1px solid ' + (active === m.id ? 'var(--accent)' : 'var(--hairline)'),
                color: active === m.id ? 'var(--accent-strong)' : 'inherit', fontSize: 12,
              }}>{active === m.id ? '◉ ' : '○ '}{m.label}</button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
