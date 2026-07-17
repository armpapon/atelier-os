import { useState } from 'react';
import { Icon } from './Icon.jsx';
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
export function MobileNav({ active, onChange, user }) {
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
        background: 'var(--background-soft)',
        borderTop: '1px solid var(--border)',
        display: 'flex',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}>
        {barItems.map(item => (
          <BarButton
            key={item.id}
            icon={<Icon name={item.icon} size={20} />}
            label={item.label}
            active={active === item.id}
            onClick={() => go(item.id)}
          />
        ))}
        <BarButton
          icon={
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <circle cx="5" cy="12" r="1.3" fill="currentColor" stroke="none" />
              <circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none" />
              <circle cx="19" cy="12" r="1.3" fill="currentColor" stroke="none" />
            </svg>
          }
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
            background: 'rgba(47, 41, 35, 0.4)',
            display: 'flex', alignItems: 'flex-end',
          }}>
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: '100%', maxHeight: '80vh', overflowY: 'auto',
              background: 'var(--surface)',
              borderRadius: '18px 18px 0 0',
              border: '1px solid var(--border)', borderBottom: 0,
              padding: '10px 16px',
              paddingBottom: 'calc(16px + env(safe-area-inset-bottom))',
            }}>
            {/* handle */}
            <div style={{
              width: 36, height: 4, borderRadius: 2, background: 'var(--border-strong)',
              margin: '2px auto 12px',
            }} />

            {/* brand + version */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '2px 4px 12px', borderBottom: '1px solid var(--border)', marginBottom: 8,
            }}>
              <span style={{ color: 'var(--accent)', display: 'inline-flex' }}><LoopMark size={22} /></span>
              <span style={{ fontFamily: 'var(--f-display)', fontSize: 17, fontWeight: 500, color: 'var(--text-primary)' }}>Loop</span>
              <button onClick={() => { setSheetOpen(false); setShowVersion(true); }}
                style={{
                  marginLeft: 'auto', background: 'var(--surface-muted)', border: 0,
                  fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--text-secondary)',
                  padding: '4px 10px', borderRadius: 'var(--radius-pill)', cursor: 'pointer',
                }}>
                {currentVersion}
              </button>
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
                        background: isActive ? 'var(--accent-soft)' : 'transparent',
                        color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                        border: 0, borderRadius: 'var(--radius-control)',
                        fontFamily: 'var(--f-body)', fontSize: 15, fontWeight: isActive ? 500 : 400,
                        cursor: 'pointer', textAlign: 'left',
                      }}>
                      <span style={{
                        width: 20, height: 20, display: 'inline-flex',
                        alignItems: 'center', justifyContent: 'center',
                        color: isActive ? 'var(--accent-strong)' : 'var(--text-muted)', flexShrink: 0,
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
              marginTop: 8, paddingTop: 12, borderTop: '1px solid var(--border)',
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
                    background: 'transparent', border: '1px solid var(--border)',
                    color: 'var(--danger)', fontSize: 13, fontFamily: 'inherit',
                    padding: '8px 14px', borderRadius: 'var(--radius-control)', cursor: 'pointer',
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
        flex: 1, minHeight: 56, border: 0, background: 'transparent',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        gap: 3, cursor: 'pointer', padding: '6px 0 5px',
        color: active ? 'var(--accent-strong)' : 'var(--text-muted)',
      }}>
      {icon}
      <span style={{
        fontSize: 10, fontFamily: 'var(--f-body)',
        fontWeight: active ? 600 : 400, lineHeight: 1,
        color: active ? 'var(--accent-strong)' : 'var(--text-secondary)',
      }}>{label}</span>
    </button>
  );
}
