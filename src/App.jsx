import { useEffect, useState } from 'react';
import { Sidebar, canSeePage } from './components/Sidebar.jsx';
import { MobileNav } from './components/MobileNav.jsx';
import { Icon, IconButton } from './components/Icon.jsx';
import { TweaksPanel } from './components/TweaksPanel.jsx';
import {
  DEFAULT_ACCENT, ACCENT_VAR_NAMES, accentOption, accentVars, isKnownAccent,
} from './lib/accents.js';
import { ComingSoon } from './components/ComingSoon.jsx';
import { LoginScreen } from './components/LoginScreen.jsx';
import { ResetPasswordScreen } from './components/ResetPasswordScreen.jsx';
import { Dashboard } from './pages/Dashboard.jsx';
import { Trading } from './pages/Trading.jsx';
import { Learning } from './pages/Learning.jsx';
import { Journal } from './pages/Journal.jsx';
import { Finance } from './pages/Finance.jsx';
import { PersonalFinance } from './pages/PersonalFinance.jsx';
import { FamilyFinance } from './pages/FamilyFinance.jsx';
import { Family } from './pages/Family.jsx';
import { SecondBrain } from './pages/SecondBrain.jsx';
import { LifeCalendar } from './pages/LifeCalendar.jsx';
import { PettyCash } from './pages/PettyCash.jsx';
import { TaxPlanner } from './pages/TaxPlanner.jsx';
import { Team } from './pages/Team.jsx';
import { useAuth } from './lib/useAuth.js';
import { useMediaQuery, MOBILE_QUERY } from './lib/useMediaQuery.js';
import { financeScopeOf, initialFinanceTabs } from './lib/financeTabs.js';
import { isSupabaseConfigured } from './lib/supabase.js';
import { handleOAuthRedirect } from './lib/integrations.js';
import { LoopBrand } from './components/LoopMark.jsx';

// Pages already adapted for narrow screens (phases 3-5 of the mobile plan).
// Pages NOT in this set render at their designed desktop width inside a
// horizontal-pan container on mobile — readable & tappable in the meantime.
const MOBILE_READY = new Set([
  'dashboard', 'journal', 'personal-finance', 'family-finance', 'finance',
  'trading', 'learning', 'family', 'brain', 'life-calendar', 'tax',
]);

// ── Preview mode: ?preview=1 in URL bypasses login (for design review) ──────
// Note: Supabase RLS still blocks all writes & private data — only the
// shell/skeleton is visible. Safe to share the preview link publicly.
function isPreviewMode() {
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).get('preview') === '1';
}

// The accent Tweak used to write --amber unconditionally, which meant this
// legacy default silently overrode the palette token for every var(--amber)
// consumer — including the dark theme's gold. Treat it as "not customised".
//
// A10 finding 3: treating ONLY this hex as legacy was too narrow. Every other
// value the old panel offered was a warm ivory swatch too, so a user who had
// actually picked one kept a tan accent painted over the True Cupertino
// palette. The migration is now "is this value in the CURRENT option set?" —
// see isKnownAccent — which retires the whole warm set at once. LEGACY_ACCENT
// is kept only so the sentinel remains greppable next to that history.
const LEGACY_ACCENT = '#b27a42';

// localStorage throws in private-browsing / storage-blocked contexts, and a
// throw inside a useState initialiser takes the entire app down before the
// first paint. Preferences are never worth a white screen.
const safeLS = {
  get(key, fallback = null) {
    try { const v = localStorage.getItem(key); return v === null ? fallback : v; }
    catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(key, value); } catch { /* preferences are optional */ }
  },
};

export default function App() {
  const { user, loading, passwordRecovery, clearPasswordRecovery } = useAuth();
  const [active, setActive]   = useState(() => safeLS.get('atelier:active', 'dashboard'));
  // A saved value that is not one of the current options (every legacy warm
  // swatch, plus the LEGACY_ACCENT sentinel) collapses to the default here, so
  // the warm palette cannot survive a reload.
  const [accent, setAccent]   = useState(() => {
    const saved = safeLS.get('atelier:accent', DEFAULT_ACCENT);
    return isKnownAccent(saved) ? saved : DEFAULT_ACCENT;
  });
  const [density, setDensity] = useState(() => safeLS.get('atelier:density', 'comfortable'));
  const [tweaksOpen, setTweaksOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    const v = safeLS.get('loop:sidebar-collapsed');
    if (v !== null) return v === '1';
    return safeLS.get('loop:sidebar') === 'collapsed';  // migrate pre-v4.1 key
  });
  const [theme, setTheme] = useState(() => safeLS.get('loop:theme', 'light'));
  // Which room each finance scope is in (v4.38). Lifted out of FinanceView so
  // the sidebar accordion and the page cannot disagree. Deliberately NOT
  // persisted — a fresh load always opens on ภาพรวม, like the month does.
  const [financeTabs, setFinanceTabs] = useState(initialFinanceTabs);
  const isMobile = useMediaQuery(MOBILE_QUERY);

  const previewMode = isPreviewMode();

  // Complete an OAuth redirect (?oauth=google&code=...) once, on load.
  useEffect(() => {
    handleOAuthRedirect().then(provider => {
      if (provider) {
        // Let any mounted integration UI (e.g. Journal's Google button) re-check
        // its connection status now that the token row is stored.
        window.dispatchEvent(new Event('loop:oauth-connected'));
        alert(`เชื่อม ${provider} สำเร็จ ✓`);
      }
    });
  }, []);

  useEffect(() => { safeLS.set('atelier:active', active); }, [active]);
  // 'atelier:active' outlives a sign-in, so it can point at a page this account
  // no longer has in its menu. Send those back to the dashboard.
  useEffect(() => {
    if (user && !canSeePage(user, active)) setActive('dashboard');
  }, [user, active]);
  useEffect(() => {
    // Overwrite the stored key, so a legacy warm value is not just ignored at
    // runtime but actually retired from localStorage on the next load.
    safeLS.set('atelier:accent', accent);

    const root = document.documentElement;
    const opt = accentOption(accent);
    // The default option means "styles.css owns the palette": clear every
    // override rather than pinning the tokens to one hex, so the stylesheet —
    // including the dark block — keeps control in BOTH themes.
    if (!opt || opt.light.base === DEFAULT_ACCENT) {
      for (const name of ACCENT_VAR_NAMES) root.style.removeProperty(name);
      // Retire the old lone --amber override left behind by earlier builds.
      root.style.removeProperty('--amber');
      return;
    }
    // A10-r2: an inline override on <html> beats BOTH :root and
    // [data-theme="dark"], so a single palette leaked light values into the
    // dark theme — a filled control's dark --text-inverse sat on a light fill
    // at 2.18–4.00:1. Apply the variant set for the theme that is actually on,
    // and re-run when it toggles (hence `theme` in the dependency list).
    //
    // Set the whole alias group, not just one member. --amber/--amber-2/
    // --amber-deep are declared as var(--accent)/var(--accent-strong) in
    // styles.css, so they follow from these automatically.
    for (const [name, value] of accentVars(opt, theme)) root.style.setProperty(name, value);
    root.style.removeProperty('--amber');
  }, [accent, theme]);
  useEffect(() => { safeLS.set('atelier:density', density); }, [density]);
  useEffect(() => { safeLS.set('loop:sidebar-collapsed', sidebarCollapsed ? '1' : '0'); }, [sidebarCollapsed]);
  useEffect(() => {
    safeLS.set('loop:theme', theme);
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // ── Loading state ────────────────────────────────────────────────────────
  if (loading && !previewMode) {
    return (
      <div style={{
        position: 'fixed', inset: 0, display: 'flex',
        alignItems: 'center', justifyContent: 'center',
        background: 'var(--background)',
      }}>
        <LoopBrand size="lg" />
      </div>
    );
  }

  // ── Password recovery: user arrived from "ลืมรหัสผ่าน" email link ────────
  if (passwordRecovery) {
    return <ResetPasswordScreen onDone={clearPasswordRecovery} />;
  }

  // ── Auth gate: skip in preview mode ──────────────────────────────────────
  // Unconfigured Supabase splits two ways, both deliberate:
  //   prod → LoginScreen's "ยังไม่ได้ตั้งค่า Supabase" diagnostic card. Gating
  //          the whole branch on isSupabaseConfigured made that card
  //          unreachable, so a real misconfiguration served a dataless shell
  //          with no explanation.
  //   dev  → fall through to demo mode (shell + mock data + Demo Mode banner).
  //          That's the local playground for checking the UI with no env vars,
  //          so the diagnostic must not take it over.
  const needsLogin = isSupabaseConfigured ? !user : import.meta.env.PROD;
  if (needsLogin && !previewMode) {
    return <LoginScreen />;
  }

  const demoMode = !isSupabaseConfigured;
  const toggleTheme = () => setTheme(t => (t === 'dark' ? 'light' : 'dark'));

  const setFinanceTab = (scope, tabId) =>
    setFinanceTabs(m => (m[scope] === tabId ? m : { ...m, [scope]: tabId }));

  /**
   * Nav with an optional destination sub-tab. The sidebar's finance sub-items
   * pass one; every other caller passes the page id alone and behaves exactly
   * as `setActive` always did.
   */
  const navigate = (pageId, tabId) => {
    const scope = financeScopeOf(pageId);
    if (scope && tabId) setFinanceTab(scope, tabId);
    setActive(pageId);
  };

  const financeProps = (scope) => ({
    tab: financeTabs[scope],
    onTabChange: (tabId) => setFinanceTab(scope, tabId),
  });

  const render = () => {
    switch (active) {
      case 'dashboard':        return <Dashboard onNav={setActive} user={user} />;
      case 'trading':          return <Trading />;
      case 'learning':         return <Learning />;
      case 'journal':          return <Journal />;
      case 'finance':          return <PersonalFinance {...financeProps('personal')} />;   // backward compat
      case 'personal-finance': return <PersonalFinance {...financeProps('personal')} />;
      case 'family-finance':   return <FamilyFinance {...financeProps('family')} />;
      case 'family':           return <Family />;
      case 'petty-cash':       return <PettyCash />;
      case 'tax':              return <TaxPlanner />;
      case 'team':             return <Team />;
      case 'goals':     return <ComingSoon eyebrow="เป้าหมาย & OKR" title="Goals" emoji="◎" description="ตั้งเป้าหมายระยะยาว แบ่งเป็น quarter และ checklist รายสัปดาห์" />;
      case 'brain':     return <SecondBrain />;
      case 'life-calendar': return <LifeCalendar />;
      default: return <Dashboard onNav={setActive} user={user} />;
    }
  };

  return (
    <div className="app" data-density={density} data-sidebar={sidebarCollapsed ? 'collapsed' : 'expanded'}>
      {isMobile ? (
        <MobileNav
          active={active} onChange={setActive} user={user}
          theme={theme} onToggleTheme={toggleTheme}
        />
      ) : (
        <Sidebar
          active={active} onChange={navigate} user={user}
          financeTabs={financeTabs}
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed(v => !v)}
          theme={theme} onToggleTheme={toggleTheme}
        />
      )}

      {/* Collapsed sidebar leaves no chrome to reopen from — this floating
          cluster is the way back in, and keeps the theme toggle reachable. */}
      {!isMobile && sidebarCollapsed && (
        <div style={{
          position: 'fixed', top: 14, left: 14, zIndex: 900,
          display: 'flex', gap: 4, padding: 4,
          background: 'var(--sidebar-bg)',
          WebkitBackdropFilter: 'blur(40px) saturate(1.6)',
          backdropFilter: 'blur(40px) saturate(1.6)',
          border: '1px solid var(--hairline)',
          borderRadius: 'var(--radius-field)',
          boxShadow: 'var(--shadow-card)',
        }}>
          <IconButton
            label="แสดงเมนู" icon="menu"
            onClick={() => setSidebarCollapsed(false)}
          />
          <IconButton
            label={theme === 'dark' ? 'โหมดสว่าง' : 'โหมดมืด'}
            icon={theme === 'dark' ? 'sun' : 'moon'}
            onClick={toggleTheme}
          />
        </div>
      )}
      <main className="main" key={active}>
        {previewMode && (
          <div style={{
            position: 'sticky', top: 0, zIndex: 50,
            height: 32, padding: '0 16px',
            background: 'var(--warning-soft)',
            borderBottom: '1px solid var(--border)',
            display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 10,
            fontSize: 12, color: 'var(--text-secondary)',
          }}>
            <span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>Preview Mode</span>
            <span style={{ color: 'var(--text-muted)' }}>·</span>
            <span>โหมดดูดีไซน์ · ไม่มีข้อมูลจริง</span>
            <a href={window.location.pathname} style={{
              marginLeft: 6, color: 'var(--text-secondary)',
              textDecoration: 'underline', textUnderlineOffset: 3,
            }}
            onMouseEnter={e => e.currentTarget.style.color = 'var(--text-primary)'}
            onMouseLeave={e => e.currentTarget.style.color = 'var(--text-secondary)'}>
              ออกจาก preview
            </a>
          </div>
        )}
        {demoMode && !previewMode && (
          <div style={{
            height: 32, padding: '0 16px',
            background: 'var(--surface-warm)',
            borderBottom: '1px solid var(--border)',
            display: 'flex', justifyContent: 'center', alignItems: 'center',
            fontSize: 12, color: 'var(--paper-ink)',
          }}>
            <span style={{ fontWeight: 500, marginRight: 8 }}>Demo Mode</span>
            <span>Supabase ยังไม่ได้ตั้งค่า · ข้อมูลเป็น mock</span>
          </div>
        )}
        {isMobile && !MOBILE_READY.has(active) ? (
          // Interim: un-adapted page renders at designed width, pans horizontally
          <div className="fade-in" style={{ overflowX: 'auto' }}>
            <div style={{ minWidth: 1024 }}>{render()}</div>
          </div>
        ) : (
          // .m-ready scopes the mobile-layout CSS to adapted pages only
          <div className={`fade-in${isMobile ? ' m-ready' : ''}`}>{render()}</div>
        )}
      </main>

      {!tweaksOpen && (
        <button
          onClick={() => setTweaksOpen(true)}
          title="Tweaks"
          aria-label="เปิด Tweaks"
          className="focus-ring"
          style={{
            position: 'fixed', right: 20, zIndex: 999,
            bottom: isMobile ? 'calc(72px + env(safe-area-inset-bottom))' : 20,
            width: 44, height: 44, borderRadius: '50%',
            background: 'var(--accent-strong)', color: 'var(--text-inverse)',
            border: 0, cursor: 'pointer', display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            boxShadow: 'var(--shadow-pop)',
            transition: 'all 130ms',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--accent)'; e.currentTarget.style.transform = 'scale(1.05)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'var(--accent-strong)'; e.currentTarget.style.transform = 'scale(1)'; }}
        ><Icon name="tweak" size={18} /></button>
      )}

      <TweaksPanel
        open={tweaksOpen} onClose={() => setTweaksOpen(false)}
        accent={accent} setAccent={setAccent} theme={theme}
        density={density} setDensity={setDensity}
        active={active} setActive={setActive}
        user={user}
      />
    </div>
  );
}
