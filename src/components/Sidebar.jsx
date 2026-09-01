import { useState, useEffect } from 'react';
import { Icon, IconButton } from './Icon.jsx';
import { Badge } from './ui/index.js';
import { signOut } from '../lib/useAuth.js';
import { VersionHistory, CHANGELOG } from './VersionHistory.jsx';
import { LoopMark } from './LoopMark.jsx';
import { FINANCE_TABS, DEFAULT_FINANCE_TAB, financeScopeOf } from '../lib/financeTabs.js';

// Shared nav model — Sidebar (desktop) + MobileNav (bottom bar) render from this
export const NAV_GROUPS = [
  { group: 'หลัก', children: [
    { id: 'dashboard', label: 'แดชบอร์ด',    icon: 'home',    badge: null },
    { id: 'journal',   label: 'Daily Journal', icon: 'journal', badge: '6' },
  ]},
  { group: 'เรียนรู้ & ทำเงิน', children: [
    { id: 'trading',          label: 'Trading Journal',  icon: 'trade',  badge: null },
    { id: 'learning',         label: 'Learning Hub',     icon: 'book',   badge: null },
    // `subs: true` — the desktop sidebar renders these two as accordion groups
    // holding the six finance rooms (v4.38). MobileNav ignores the flag: on a
    // narrow screen the in-page tab bar is the sub-navigation.
    { id: 'personal-finance', label: 'การเงินส่วนตัว',  icon: 'money',  badge: null, subs: true },
    { id: 'family-finance',   label: 'การเงินครอบครัว', icon: 'money',  badge: null, subs: true },
  ]},
  { group: 'Seal Interactive', children: [
    { id: 'petty-cash', label: 'Petty Cash', icon: 'work', badge: null },
    { id: 'team',       label: 'ทะเบียนพนักงาน', icon: 'family', badge: null },
  ]},
  { group: 'ชีวิต', children: [
    { id: 'family', label: 'ครอบครัว',       icon: 'family', badge: '4'    },
    { id: 'life-calendar', label: 'Life Calendar', icon: 'hourglass', badge: null },
    { id: 'tax',    label: 'วางแผนภาษี',      icon: 'tax',    badge: null   },
    { id: 'goals',  label: 'เป้าหมาย & OKR', icon: 'target', badge: 'Soon' },
    { id: 'brain',  label: 'Second Brain',   icon: 'brain',  badge: null   },
  ]},
];

// Which account sees which page. Pages left out here are visible to both.
// This is menu tidying, not a security boundary — every table is already
// isolated by RLS on user_id. Add or drop an email to change access.
const ARM = 'armpapon@gmail.com';
const PAT = 'parnrada@sealinteractive.com';

const PAGE_ACCESS = {
  'petty-cash':       [PAT],
  'team':             [PAT],
  'trading':          [ARM],
  'learning':         [ARM],
  'personal-finance': [ARM],
  'family-finance':   [ARM],
  // App.jsx still routes the legacy 'finance' id to PersonalFinance, so it has
  // to carry the same access rule or it becomes a back door into that page.
  'finance':          [ARM],
  // Household tax planning holds both salaries and everyone's deductions —
  // owner-only, same as the rest of the money pages.
  'tax':              [ARM],
};

const KNOWN_ACCOUNTS = [ARM, PAT];

/** Preview mode and any other account fall through to seeing everything. */
export function canSeePage(user, id) {
  const email = user?.email?.toLowerCase() || '';
  if (!KNOWN_ACCOUNTS.includes(email)) return true;
  const allowed = PAGE_ACCESS[id];
  return !allowed || allowed.includes(email);
}

/**
 * The nav entry a page id belongs to. The pre-v4.0 'finance' id still routes to
 * PersonalFinance, so it highlights (and expands) การเงินส่วนตัว.
 */
function navIdOf(pageId) { return pageId === 'finance' ? 'personal-finance' : pageId; }

/** NAV_GROUPS with hidden pages — and any group left empty — stripped out. */
export function visibleNavGroups(user) {
  return NAV_GROUPS
    .map(g => ({ ...g, children: g.children.filter(c => canSeePage(user, c.id)) }))
    .filter(g => g.children.length > 0);
}

/**
 * @param onChange     (pageId, tabId?) — App.jsx's navigate(). The finance
 *                     sub-items pass the room they want opened; everything else
 *                     calls it with the page id alone, as before.
 * @param financeTabs  { personal, family } — the room each finance page is in,
 *                     so the open sub gets the accent dot.
 */
export function Sidebar({ active, onChange, user, financeTabs = {}, onToggleCollapse, theme = 'light', onToggleTheme }) {
  const [showVersion, setShowVersion] = useState(false);
  const currentVersion = CHANGELOG[0]?.version || 'v0.5';

  // Accordion state: the open group follows the finance page the user is on,
  // and collapses entirely on any other page. `setExpanded` on top of that is
  // the manual toggle — clicking the header of the page you are already on
  // folds it away without navigating anywhere else.
  const [expanded, setExpanded] = useState(() => (financeScopeOf(active) ? navIdOf(active) : null));
  useEffect(() => { setExpanded(financeScopeOf(active) ? navIdOf(active) : null); }, [active]);

  const activeId = navIdOf(active);
  const items = visibleNavGroups(user);

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
      <aside className="sidebar">
        {/* Brand + shell controls */}
        <div style={{
          padding: '2px 6px 20px',
          display: 'flex', alignItems: 'center', gap: 9,
        }}>
          <span style={{ color: 'var(--accent)', display: 'inline-flex' }}>
            <LoopMark size={24} />
          </span>
          <span style={{
            fontFamily: 'var(--f-display)', fontSize: 21, fontWeight: 700,
            color: 'var(--text-primary)', letterSpacing: '-0.02em',
          }}>Loop</span>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 1 }}>
            <IconButton
              icon={theme === 'dark' ? 'sun' : 'moon'}
              label={theme === 'dark' ? 'โหมดสว่าง' : 'โหมดมืด'}
              onClick={onToggleTheme}
            />
            <IconButton icon="menu" label="ซ่อนเมนู" onClick={onToggleCollapse} />
          </div>
        </div>

        {/* Nav groups */}
        {items.map((group, gi) => (
          <div key={gi} style={{ marginBottom: 18 }}>
            <div style={{
              fontVariantNumeric: 'tabular-nums', fontSize: 13,
              color: 'var(--text-muted)', padding: '0 10px 7px', fontWeight: 500
            }}>{group.group}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {group.children.map(item => {
                const isActive = activeId === item.id;
                if (!item.subs) {
                  return <NavItem key={item.id} item={item} active={isActive} onClick={() => onChange(item.id)} />;
                }
                // Finance accordion group (v4.38).
                const scope   = financeScopeOf(item.id);
                const openTab = financeTabs[scope] || DEFAULT_FINANCE_TAB;
                const isOpen  = expanded === item.id;
                return (
                  <div key={item.id}>
                    <NavItem
                      item={item} active={isActive}
                      expandable expanded={isOpen}
                      // Header click = go to the page at the room it is already
                      // in, and fold/unfold the list. Landing on the page makes
                      // the effect above re-open it, so the collapse only
                      // sticks when you were already there — like the mockup.
                      onClick={() => { onChange(item.id, openTab); setExpanded(prev => (prev === item.id ? null : item.id)); }}
                    />
                    <NavSubs
                      open={isOpen} pageId={item.id}
                      activeTab={isActive ? openTab : null}
                      onPick={(tabId) => { onChange(item.id, tabId); setExpanded(item.id); }}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        {/* Footer — version + user */}
        <div style={{ marginTop: 'auto', paddingTop: 10 }}>
          <button onClick={() => setShowVersion(true)}
            title="Version history" aria-label="Version history"
            className="focus-ring"
            style={{
              display: 'block', margin: '0 0 8px 10px',
              background: 'transparent', border: 'none',
              fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--text-muted)',
              cursor: 'pointer', padding: '3px 8px', borderRadius: 'var(--radius-btn)',
              transition: 'background 150ms, color 150ms',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--fill-2)'; e.currentTarget.style.color = 'var(--text-primary)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-muted)'; }}>
            {currentVersion}
          </button>

          <div style={{
            padding: '10px 10px 0', borderTop: '1px solid var(--hairline)',
            display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <div style={{
              width: 30, height: 30, borderRadius: '50%',
              background: 'var(--accent-tint)', color: 'var(--accent-strong)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 12, fontWeight: 700, flexShrink: 0,
            }}>{displayInitial}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: 13, color: 'var(--text-primary)', fontWeight: 600,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>{displayName}</div>
              <div style={{
                fontSize: 11, color: 'var(--text-secondary)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>{subText}</div>
            </div>
            {user && (
              <IconButton icon="sign-out" label="ออกจากระบบ" onClick={handleSignOut} size={28} iconSize={16} />
            )}
          </div>
        </div>
      </aside>

      {showVersion && <VersionHistory onClose={() => setShowVersion(false)} />}
    </>
  );
}

function NavItem({ item, active, onClick, expandable = false, expanded = false }) {
  const isSoon = item.badge === 'Soon';
  return (
    <button
      onClick={onClick}
      className="focus-ring"
      aria-expanded={expandable ? expanded : undefined}
      aria-controls={expandable ? `nav-subs-${item.id}` : undefined}
      style={{
        display: 'flex', alignItems: 'center', gap: 11,
        width: '100%', padding: '8px 10px',
        background: active ? 'var(--fill-2)' : 'transparent',
        color: 'var(--text-primary)',
        border: 0, borderRadius: 8,
        fontFamily: 'var(--f-body)', fontSize: 14, fontWeight: active ? 600 : 500,
        cursor: 'pointer', textAlign: 'left',
        transition: 'background 150ms',
      }}
      onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'var(--fill)'; }}
      onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent'; }}>
      <span style={{
        width: 17, height: 17, display: 'inline-flex',
        alignItems: 'center', justifyContent: 'center',
        color: active ? 'var(--accent-strong)' : 'var(--text-secondary)',
        flexShrink: 0,
      }}>
        <Icon name={item.icon} size={17} />
      </span>
      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {item.label}
      </span>
      {item.badge && (
        <Badge tone={isSoon ? 'outline' : (active ? 'accent' : 'neutral')} size="sm">
          {item.badge}
        </Badge>
      )}
      {expandable && (
        <span aria-hidden="true" style={{
          display: 'inline-flex', color: 'var(--text-muted)', flexShrink: 0,
          transform: expanded ? 'rotate(90deg)' : 'none',
          transition: 'transform 160ms',
        }}>
          <Icon name="chevron" size={13} />
        </span>
      )}
    </button>
  );
}

/**
 * The six finance rooms, folded under their page (v4.38).
 *
 * Kept MOUNTED and collapsed with max-height (the mockup's `.nav-subs`
 * transition) rather than unmounted, so the fold actually animates. `hidden`
 * would kill that animation outright, so the folded list is taken out of the
 * accessibility tree and the tab order the other way: `aria-hidden` +
 * `visibility: hidden` (switched only after the transition has run) and
 * `tabIndex=-1` on every button while it is closed.
 */
function NavSubs({ open, pageId, activeTab, onPick }) {
  return (
    <div id={`nav-subs-${pageId}`} aria-hidden={open ? undefined : true}
      style={{
        overflow: 'hidden',
        maxHeight: open ? 300 : 0,
        visibility: open ? 'visible' : 'hidden',
        transition: open
          ? 'max-height 180ms ease, visibility 0s'
          : 'max-height 180ms ease, visibility 0s 180ms',
      }}>
      {FINANCE_TABS.map(t => {
        const on = t.id === activeTab;
        return (
          <button key={t.id} type="button" className="focus-ring"
            data-sub-page={pageId} data-sub-tab={t.id}
            aria-current={on ? 'page' : undefined}
            tabIndex={open ? 0 : -1}
            onClick={() => onPick(t.id)}
            style={{
              position: 'relative', display: 'flex', alignItems: 'center',
              width: '100%', padding: '5.5px 10px 5.5px 36px',
              background: 'transparent', border: 0, borderRadius: 8,
              fontFamily: 'var(--f-body)', fontSize: 12.5,
              fontWeight: on ? 600 : 500,
              color: on ? 'var(--accent-strong)' : 'var(--text-secondary)',
              cursor: 'pointer', textAlign: 'left',
              transition: 'background 150ms, color 150ms',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--fill)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>
            {/* accent dot — the mockup's `.nav-sub.on::before` */}
            {on && (
              <span aria-hidden="true" style={{
                position: 'absolute', left: 24, top: '50%', transform: 'translateY(-50%)',
                width: 4, height: 4, borderRadius: 999, background: 'var(--accent)',
              }} />
            )}
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
