import { useState } from 'react';
import { Icon, IconButton } from './Icon.jsx';
import { Badge } from './ui/index.js';
import { signOut } from '../lib/useAuth.js';
import { VersionHistory, CHANGELOG } from './VersionHistory.jsx';
import { visibleNavGroups, canSeePage } from './Sidebar.jsx';
import { LoopMark } from './LoopMark.jsx';

// ผู้สมัครสำหรับแถบล่าง — กรองด้วยสิทธิ์แล้วเอา 4 อันแรก ที่เหลือผ่าน "เพิ่มเติม"
// เรียงให้แต่ละคนได้ 4 ช่องพอดี: Arm ไม่เห็น Petty Cash, แพทไม่เห็นการเงิน
const BAR_CANDIDATES = [
  { id: 'dashboard',        label: 'หน้าหลัก',   icon: 'home' },
  { id: 'journal',          label: 'Journal',    icon: 'journal' },
  { id: 'personal-finance', label: 'การเงิน',    icon: 'money' },
  { id: 'petty-cash',       label: 'Petty Cash', icon: 'work' },
  { id: 'family',           label: 'ครอบครัว',   icon: 'family' },
];

/**
 * MobileNav — bottom navigation สำหรับจอแคบ (<1024px)
 * แทนที่ Sidebar ทั้งตัว: แถบล่าง 4 โมดูลหลัก + ปุ่ม "เพิ่มเติม"
 * เปิด sheet รายการเต็ม (ทุกโมดูล + user + ออกจากระบบ + version)
 */
export function MobileNav({ active, onChange, user, theme = 'light', onToggleTheme }) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [showVersion, setShowVersion] = useState(false);
  const currentVersion = CHANGELOG[0]?.version || 'v0.5';

  const displayName    = user?.user_metadata?.name || user?.email?.split('@')[0] || 'อาทิตย์';
  const displayInitial = (displayName[0] || 'A').toUpperCase();
  const subText        = user ? user.email : 'preview · ไม่ได้ login';

  const barItems = BAR_CANDIDATES.filter(i => canSeePage(user, i.id)).slice(0, 4);
  const barIds = barItems.map(i => i.id);
  const moreActive = !barIds.includes(active); // หน้า active อยู่ใน "เพิ่มเติม"

  const go = (id) => { onChange(id); setSheetOpen(false); };

  const handleSignOut = async () => {
    if (confirm('ออกจากระบบ?')) {
      try { await signOut(); } catch (e) { alert(e.message); }
    }
  };

  return (
    <>
      {/* ── Bottom bar ─────────────────────────────────────────────── */}
      <nav style={{
        position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 950,
        background: 'var(--sidebar-bg)',
        WebkitBackdropFilter: 'blur(40px) saturate(1.6)',
        backdropFilter: 'blur(40px) saturate(1.6)',
        borderTop: '1px solid var(--hairline)',
        display: 'flex',
        padding: '8px 6px calc(14px + env(safe-area-inset-bottom))',
      }}>
        {barItems.map(item => (
          <BarButton
            key={item.id}
            icon={<Icon name={item.icon} size={21} />}
            label={item.label}
            active={active === item.id}
            onClick={() => go(item.id)}
          />
        ))}
        <BarButton
          icon={<Icon name="more" size={21} />}
          label="เพิ่มเติม"
          active={moreActive || sheetOpen}
          onClick={() => setSheetOpen(true)}
        />
      </nav>

      {/* ── "เพิ่มเติม" sheet ──────────────────────────────────────── */}
      {sheetOpen && (
        <div
          onClick={() => setSheetOpen(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 1200,
            background: 'var(--dim)',
            display: 'flex', alignItems: 'flex-end',
          }}>
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: '100%', maxHeight: '80vh', overflowY: 'auto',
              background: 'var(--surface)',
              borderRadius: 'var(--radius-card) var(--radius-card) 0 0',
              borderTop: '1px solid var(--hairline)',
              boxShadow: 'var(--shadow-pop)',
              padding: '10px 16px',
              paddingBottom: 'calc(16px + env(safe-area-inset-bottom))',
            }}>
            {/* handle */}
            <div style={{
              width: 36, height: 5, borderRadius: 3, background: 'var(--fill-2)',
              margin: '2px auto 12px',
            }} />

            {/* brand + version */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '2px 4px 12px', borderBottom: '1px solid var(--hairline)', marginBottom: 8,
            }}>
              <span style={{ color: 'var(--accent)', display: 'inline-flex' }}><LoopMark size={22} /></span>
              <span style={{ fontFamily: 'var(--f-display)', fontSize: 19, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--text-primary)' }}>Loop</span>
              <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
                <IconButton
                  icon={theme === 'dark' ? 'sun' : 'moon'}
                  label={theme === 'dark' ? 'โหมดสว่าง' : 'โหมดมืด'}
                  onClick={onToggleTheme}
                  size={34} iconSize={18}
                />
                <button onClick={() => { setSheetOpen(false); setShowVersion(true); }}
                  style={{
                    background: 'var(--fill-2)', border: 0,
                    fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--text-secondary)',
                    padding: '5px 11px', borderRadius: 'var(--radius-btn)', cursor: 'pointer',
                  }}>
                  {currentVersion}
                </button>
              </div>
            </div>

            {/* nav groups — ทุกโมดูล */}
            {visibleNavGroups(user).map((group, gi) => (
              <div key={gi} style={{ marginBottom: 6 }}>
                <div style={{
                  fontFamily: 'var(--f-mono)', fontSize: 10,
                  letterSpacing: '0.18em', textTransform: 'uppercase',
                  color: 'var(--text-muted)', padding: '10px 4px 6px', fontWeight: 500,
                }}>{group.group}</div>
                {group.children.map(item => {
                  const isActive = active === item.id;
                  const isSoon = item.badge === 'Soon';
                  return (
                    <button key={item.id} onClick={() => go(item.id)}
                      className="focus-ring"
                      style={{
                        display: 'flex', alignItems: 'center', gap: 12,
                        width: '100%', minHeight: 46, padding: '0 10px',
                        background: isActive ? 'var(--fill-2)' : 'transparent',
                        color: 'var(--text-primary)',
                        border: 0, borderRadius: 10,
                        fontFamily: 'var(--f-body)', fontSize: 15, fontWeight: isActive ? 600 : 500,
                        cursor: 'pointer', textAlign: 'left',
                      }}>
                      <span style={{
                        width: 20, height: 20, display: 'inline-flex',
                        alignItems: 'center', justifyContent: 'center',
                        color: isActive ? 'var(--accent)' : 'var(--text-secondary)', flexShrink: 0,
                      }}><Icon name={item.icon} size={18} /></span>
                      <span style={{ flex: 1 }}>{item.label}</span>
                      {item.badge && (
                        <Badge tone={isSoon ? 'outline' : (isActive ? 'accent' : 'neutral')} size="sm">
                          {item.badge}
                        </Badge>
                      )}
                    </button>
                  );
                })}
              </div>
            ))}

            {/* user + sign out */}
            <div style={{
              marginTop: 8, paddingTop: 12, borderTop: '1px solid var(--hairline)',
              display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <div style={{
                width: 38, height: 38, borderRadius: '50%',
                background: 'var(--accent-soft)', color: 'var(--accent-strong)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: 'var(--f-display)', fontSize: 16, fontWeight: 500, flexShrink: 0,
              }}>{displayInitial}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: 14, color: 'var(--text-primary)', fontWeight: 500,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>{displayName}</div>
                <div style={{
                  fontFamily: 'var(--f-mono)', fontSize: 10.5, color: 'var(--text-muted)',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>{subText}</div>
              </div>
              {user && (
                <button onClick={handleSignOut}
                  style={{
                    background: 'transparent', border: '1px solid var(--hairline)',
                    color: 'var(--danger)', fontSize: 13, fontFamily: 'inherit',
                    padding: '8px 16px', borderRadius: 'var(--radius-btn)', cursor: 'pointer',
                  }}>
                  ออกจากระบบ
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {showVersion && <VersionHistory onClose={() => setShowVersion(false)} />}
    </>
  );
}

function BarButton({ icon, label, active, onClick }) {
  return (
    <button onClick={onClick} className="focus-ring"
      style={{
        flex: 1, border: 0, background: 'transparent',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        gap: 4, cursor: 'pointer', padding: 0,
        color: active ? 'var(--accent-strong)' : 'var(--text-secondary)',
      }}>
      {icon}
      <span style={{
        fontSize: 10, fontFamily: 'var(--f-body)',
        fontWeight: 500, lineHeight: 1, color: 'inherit',
      }}>{label}</span>
    </button>
  );
}
