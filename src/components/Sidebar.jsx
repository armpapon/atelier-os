import { DATA } from '../data.js';
import { Icon } from './Icon.jsx';

export function Sidebar({ active, onChange }) {
  const items = [
    { group: 'หลัก', children: [
      { id: 'dashboard', label: 'แดชบอร์ด',    icon: 'home',    badge: null },
      { id: 'journal',   label: 'Daily Journal', icon: 'journal', badge: '6' },
    ]},
    { group: 'เรียนรู้ & ทำเงิน', children: [
      { id: 'trading',  label: 'Trading Journal', icon: 'trade',  badge: '7' },
      { id: 'learning', label: 'Learning Hub',    icon: 'book',   badge: null },
      { id: 'finance',  label: 'Finance',         icon: 'money',  badge: null },
    ]},
    { group: 'ชีวิต', children: [
      { id: 'family',   label: 'ครอบครัว',    icon: 'family',  badge: '4' },
      { id: 'goals',    label: 'เป้าหมาย & OKR', icon: 'target',  badge: null },
      { id: 'brain',    label: 'Second Brain',   icon: 'brain',   badge: '128' },
    ]},
  ];

  return (
    <aside className="sidebar">
      <div className="sidebar__brand">
        <span className="sidebar__brand-mark">ạ</span>
        <span className="sidebar__brand-name">Atelier OS</span>
        <span className="sidebar__brand-sub">v.0.4</span>
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
        <div className="avatar">{DATA.user.initial}</div>
        <div>
          <div className="sidebar__user-name">{DATA.user.name}</div>
          <div className="sidebar__user-meta">PRO · 247 วัน</div>
        </div>
      </div>
    </aside>
  );
}
