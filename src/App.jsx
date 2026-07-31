import { useEffect, useState } from 'react';
import { Sidebar, canSeePage } from './components/Sidebar.jsx';
import { MobileNav } from './components/MobileNav.jsx';
import { Icon, IconButton } from './components/Icon.jsx';
import { TweaksPanel } from './components/TweaksPanel.jsx';
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
import { Team } from './pages/Team.jsx';
import { useAuth } from './lib/useAuth.js';
import { useMediaQuery, MOBILE_QUERY } from './lib/useMediaQuery.js';
import { isSupabaseConfigured } from './lib/supabase.js';
import { handleOAuthRedirect } from './lib/integrations.js';
import { LoopBrand } from './components/LoopMark.jsx';

// Pages already adapted for narrow screens (phases 3-5 of the mobile plan).
// Pages NOT in this set render at their designed desktop width inside a
// horizontal-pan container on mobile — readable & tappable in the meantime.
const MOBILE_READY = new Set([
  'dashboard', 'journal', 'personal-finance', 'family-finance', 'finance',
  'trading', 'learning', 'family', 'brain', 'life-calendar',
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
const LEGACY_ACCENT = '#b27a42';

export default function App() {
  const { user, loading, passwordRecovery, clearPasswordRecovery } = useAuth();
  const [active, setActive]   = useState(() => localStorage.getItem('atelier:active') || 'dashboard');
  const [accent, setAccent]   = useState(() => localStorage.getItem('atelier:accent') || '#b27a42');
  const [density, setDensity] = useState(() => localStorage.getItem('atelier:density') || 'comfortable');
  const [tweaksOpen, setTweaksOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    const v = localStorage.getItem('loop:sidebar-collapsed');
    if (v !== null) return v === '1';
    return localStorage.getItem('loop:sidebar') === 'collapsed';  // migrate pre-v4.1 key
  });
  const [theme, setTheme] = useState(() => localStorage.getItem('loop:theme') || 'light');
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

  useEffect(() => { localStorage.setItem('atelier:active', active); }, [active]);
  // 'atelier:active' outlives a sign-in, so it can point at a page this account
  // no longer has in its menu. Send those back to the dashboard.
  useEffect(() => {
    if (user && !canSeePage(user, active)) setActive('dashboard');
  }, [user, active]);
  useEffect(() => {
    localStorage.setItem('atelier:accent', accent);
    // Only override the palette token when the user actually picked a colour —
    // otherwise styles.css owns --amber, so the warm accent and the dark
    // theme's gold both apply instead of being pinned to one hex.
    if (accent && accent !== LEGACY_ACCENT) {
      document.documentElement.style.setProperty('--amber', accent);
    } else {
      document.documentElement.style.removeProperty('--amber');
    }
  }, [accent]);
  useEffect(() => { localStorage.setItem('atelier:density', density); }, [density]);
  useEffect(() => { localStorage.setItem('loop:sidebar-collapsed', sidebarCollapsed ? '1' : '0'); }, [sidebarCollapsed]);
  useEffect(() => {
    localStorage.setItem('loop:theme', theme);
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
  if (isSupabaseConfigured && !user && !previewMode) {
    return <LoginScreen />;
  }

  const demoMode = !isSupabaseConfigured;
  const toggleTheme = () => setTheme(t => (t === 'dark' ? 'light' : 'dark'));

  const render = () => {
    switch (active) {
      case 'dashboard':        return <Dashboard onNav={setActive} user={user} />;
      case 'trading':          return <Trading />;
      case 'learning':         return <Learning />;
      case 'journal':          return <Journal />;
      case 'finance':          return <PersonalFinance />;   // backward compat
      case 'personal-finance': return <PersonalFinance />;
      case 'family-finance':   return <FamilyFinance />;
      case 'family':           return <Family />;
      case 'petty-cash':       return <PettyCash />;
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
          active={active} onChange={setActive} user={user}
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
        accent={accent} setAccent={setAccent}
        density={density} setDensity={setDensity}
        active={active} setActive={setActive}
      />
    </div>
  );
}
