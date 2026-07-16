import { useState } from 'react';
import { Icon } from './Icon.jsx';
import { Badge } from './ui/index.js';
import { signOut } from '../lib/useAuth.js';
import { VersionHistory, CHANGELOG } from './VersionHistory.jsx';
import { LoopMark } from './LoopMark.jsx';

// Shared nav model — Sidebar (desktop) + MobileNav (bottom bar) render from this
export const NAV_GROUPS = [
  { group: 'หลัก', children: [
    { id: 'dashboard', label: 'แดชบอร์ด',    icon: 'home',    badge: null },
    { id: 'journal',   label: 'Daily Journal', icon: 'journal', badge: '6' },
  ]},
  { group: 'เรียนรู้ & ทำเงิน', children: [
    { id: 'trading',          label: 'Trading Journal',  icon: 'trade',  badge: null },
    { id: 'learning',         label: 'Learning Hub',     icon: 'book',   badge: null },
    { id: 'personal-finance', label: 'การเงินส่วนตัว',  icon: 'money',  badge: null },
    { id: 'family-finance',   label: 'การเงินครอบครัว', icon: 'money',  badge: null },
  ]},
  { group: 'งาน', children: [
    { id: 'petty-cash', label: 'Petty Cash', icon: 'work', badge: null },
  ]},
  { group: 'ชีวิต', children: [
    { id: 'family', label: 'ครอบครัว',       icon: 'family', badge: '4'    },
    { id: 'life-calendar', label: 'Life Calendar', icon: 'hourglass', badge: null },
    { id: 'goals',  label: 'เป้าหมาย & OKR', icon: 'target', badge: 'Soon' },
    { id: 'brain',  label: 'Second Brain',   icon: 'brain',  badge: null   },
  ]},
];

export function Sidebar({ active, onChange, user, collapsed = false, onToggleCollapse }) {
  const [showVersion, setShowVersion] = useState(false);
  const currentVersion = CHANGELOG[0]?.version || 'v0.5';

  const items = NAV_GROUPS;

  const displayName    = user?.user_metadata?.name || user?.email?.split('@')[0] || 'อาทิตย์';
  const displayInitial = (displayName[0] || 'A').toUpperCase();
  const subText        = user ? user.email : 'preview · ไม่ได้ login';

  const handleSignOut = async () => {
    if (confirm('ออกจากระบบ?')) {
      try { await signOut(); } catch (e) { alert(e.message); }
    }
  };

  return (
    <>
      <aside className="sidebar" style={{
        background: 'var(--background-soft)',
        borderRight: '1px solid var(--border)',
      }}>
        {/* Brand */}
        {collapsed ? (
          <div style={{
            padding: '20px 0 18px', borderBottom: '1px solid var(--border)',
            marginBottom: 14, display: 'flex', flexDirection: 'column',
            alignItems: 'center', gap: 14,
          }}>
            <span style={{ color: 'var(--accent)', display: 'inline-flex' }}>
              <LoopMark size={24} />
            </span>
            <CollapseToggle collapsed onClick={onToggleCollapse} />
          </div>
        ) : (
          <div style={{
            padding: '20px 14px 22px', borderBottom: '1px solid var(--border)',
            marginBottom: 18, display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <span style={{ color: 'var(--accent)', display: 'inline-flex' }}>
              <LoopMark size={26} />
            </span>
            <span style={{
              fontFamily: 'var(--f-display)', fontSize: 19, fontWeight: 500,
              color: 'var(--text-primary)', letterSpacing: '-0.005em',
            }}>Loop</span>
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 2 }}>
              <button onClick={() => setShowVersion(true)}
                title="Version history" aria-label="Version history"
                style={{
                  background: 'transparent', border: 'none',
                  fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--text-muted)',
                  cursor: 'pointer', padding: '3px 7px', borderRadius: 'var(--radius-pill)',
                  transition: 'all 130ms',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface-muted)'; e.currentTarget.style.color = 'var(--accent-strong)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-muted)'; }}>
                {currentVersion}
              </button>
              <CollapseToggle onClick={onToggleCollapse} />
            </div>
          </div>
        )}

        {/* Nav groups */}
        {items.map((group, gi) => (
          <div key={gi} style={{ marginBottom: collapsed ? 12 : 22 }}>
            {collapsed
              ? (gi > 0 && <div style={{ height: 1, background: 'var(--border)', margin: '0 14px 12px' }} />)
              : (
                <div style={{
                  fontFamily: 'var(--f-mono)', fontSize: 10,
                  letterSpacing: '0.18em', textTransform: 'uppercase',
                  color: 'var(--text-muted)', padding: '0 14px 10px', fontWeight: 500,
                }}>{group.group}</div>
              )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {group.children.map(item => (
                <NavItem key={item.id} item={item} active={active === item.id} collapsed={collapsed} onClick={() => onChange(item.id)} />
              ))}
            </div>
          </div>
        ))}

        {/* Footer — user */}
        <div style={{
          marginTop: 'auto', padding: collapsed ? '14px 0 12px' : '14px 12px 12px',
          borderTop: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: collapsed ? 'center' : 'flex-start', gap: 10,
        }}>
          <div title={collapsed ? displayName : undefined} style={{
            width: 36, height: 36, borderRadius: '50%',
            background: 'var(--accent-soft)', color: 'var(--accent-strong)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: 'var(--f-display)', fontSize: 16, fontWeight: 500,
            flexShrink: 0,
          }}>{displayInitial}</div>
          {!collapsed && (
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: 13, color: 'var(--text-primary)', fontWeight: 500,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>{displayName}</div>
            <div style={{
              fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--text-muted)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>{subText}</div>
          </div>
          )}
          {!collapsed && user && (
            <button onClick={handleSignOut} title="ออกจากระบบ" aria-label="ออกจากระบบ" style={{
              background: 'transparent', border: 0, color: 'var(--text-muted)',
              cursor: 'pointer', padding: 6, borderRadius: 6,
              display: 'flex', alignItems: 'center',
            }}
            onMouseEnter={e => { e.currentTarget.style.color = 'var(--danger)'; e.currentTarget.style.background = 'var(--danger-soft)'; }}
            onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.background = 'transparent'; }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                   stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                <polyline points="16 17 21 12 16 7"/>
                <line x1="21" y1="12" x2="9" y2="12"/>
              </svg>
            </button>
          )}
        </div>
      </aside>

      {showVersion && <VersionHistory onClose={() => setShowVersion(false)} />}
    </>
  );
}

function CollapseToggle({ collapsed = false, onClick }) {
  return (
    <button
      onClick={onClick}
      title={collapsed ? 'ขยายเมนู' : 'ยุบเมนู'}
      aria-label={collapsed ? 'ขยายเมนู' : 'ยุบเมนู'}
      className="focus-ring"
      style={{
        background: 'transparent', border: 0, color: 'var(--text-muted)',
        cursor: 'pointer', padding: 5, borderRadius: 'var(--r-sm)',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        transition: 'all 130ms',
      }}
      onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface-muted)'; e.currentTarget.style.color = 'var(--accent-strong)'; }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-muted)'; }}>
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none"
           stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <line x1="9" y1="4" x2="9" y2="20" />
      </svg>
    </button>
  );
}

function NavItem({ item, active, onClick, collapsed = false }) {
  const isSoon = item.badge === 'Soon';
  return (
    <button
      onClick={onClick}
      className="focus-ring"
      title={collapsed ? item.label : undefined}
      style={{
        display: 'flex', alignItems: 'center', gap: collapsed ? 0 : 11,
        justifyContent: collapsed ? 'center' : 'flex-start',
        width: collapsed ? 'calc(100% - 12px)' : 'calc(100% - 16px)',
        margin: collapsed ? '0 6px' : '0 8px', padding: collapsed ? '10px 0' : '9px 12px',
        background: active ? 'var(--accent-soft)' : 'transparent',
        color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
        border: 0, borderRadius: 'var(--radius-control)',
        fontFamily: 'var(--f-body)', fontSize: 13.5, fontWeight: active ? 500 : 400,
        cursor: 'pointer', textAlign: 'left', position: 'relative',
        transition: 'background 130ms, color 130ms',
      }}
      onMouseEnter={e => {
        if (!active) {
          e.currentTarget.style.background = 'var(--surface-muted)';
          e.currentTarget.style.color = 'var(--text-primary)';
        }
      }}
      onMouseLeave={e => {
        if (!active) {
          e.currentTarget.style.background = 'transparent';
          e.currentTarget.style.color = 'var(--text-secondary)';
        }
      }}>
      {active && (
        <span style={{
          position: 'absolute', left: collapsed ? -6 : -8, top: '50%', transform: 'translateY(-50%)',
          width: 3, height: 18, background: 'var(--accent)', borderRadius: '0 3px 3px 0',
        }} />
      )}
      <span style={{
        width: 16, height: 16, display: 'inline-flex',
        alignItems: 'center', justifyContent: 'center',
        color: active ? 'var(--accent-strong)' : 'var(--text-muted)',
        flexShrink: 0,
      }}>
        <Icon name={item.icon} size={16} />
      </span>
      {!collapsed && (
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {item.label}
        </span>
      )}
      {!collapsed && item.badge && (
        <Badge tone={isSoon ? 'outline' : (active ? 'accent' : 'neutral')} size="sm">
          {item.badge}
        </Badge>
      )}
    </button>
  );
}
