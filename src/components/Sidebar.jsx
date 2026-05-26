import { Icon } from './Icon.jsx';
import { signOut } from '../lib/useAuth.js';

export function Sidebar({ active, onChange, user }) {
  const items = [
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
    { group: 'ชีวิต', children: [
      { id: 'family',   label: 'ครอบครัว',    icon: 'family',  badge: '4' },
      { id: 'goals',    label: 'เป้าหมาย & OKR', icon: 'target',  badge: null },
      { id: 'brain',    label: 'Second Brain',   icon: 'brain',   badge: '128' },
    ]},
  ];

  // Display info — prefer logged-in user, fallback to default
  const displayName = user?.user_metadata?.name || user?.email?.split('@')[0] || 'อาทิตย์';
  const displayInitial = (displayName[0] || 'A').toUpperCase();
  const subText = user ? user.email : 'ยังไม่ได้ login';

  const handleSignOut = async () => {
    if (confirm('ออกจากระบบ?')) {
      try { await signOut(); } catch (e) { alert(e.message); }
    }
  };

  return (
    <aside className="sidebar">
      <div className="sidebar__brand">
        <span className="sidebar__brand-mark">ạ</span>
        <span className="sidebar__brand-name">Atelier OS</span>
        <span className="sidebar__brand-sub">v.0.5</span>
      </div>

      {items.map((group, gi) => (
        <div key={gi}>
          <div className="nav-section-label">{group.group}</div>
          {group.children.map(item => (
            <button
              key={item.id}
              className={`nav-item ${active === item.id ? 'nav-item--active' : ''}`}
              onClick={() => onChange(item.id)}
            >
              <span className="nav-item__icon"><Icon name={item.icon} size={16} /></span>
              <span>{item.label}</span>
              {item.badge && <span className="nav-item__badge">{item.badge}</span>}
            </button>
          ))}
        </div>
      ))}

      <div className="sidebar__footer">
        <div className="avatar">{displayInitial}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="sidebar__user-name" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{displayName}</div>
          <div className="sidebar__user-meta" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{subText}</div>
        </div>
        {user && (
          <button
            onClick={handleSignOut}
            title="ออกจากระบบ"
            style={{
              background: 'transparent', border: 0, color: 'var(--ink-3)',
              cursor: 'pointer', padding: 4, borderRadius: 4,
              display: 'flex', alignItems: 'center',
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
              <polyline points="16 17 21 12 16 7"/>
              <line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
          </button>
        )}
      </div>
    </aside>
  );
}
