import { useEffect, useState } from 'react';
import { Sidebar } from './components/Sidebar.jsx';
import { Icon } from './components/Icon.jsx';
import { TweaksPanel } from './components/TweaksPanel.jsx';
import { ComingSoon } from './components/ComingSoon.jsx';
import { LoginScreen } from './components/LoginScreen.jsx';
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
import { useAuth } from './lib/useAuth.js';
import { isSupabaseConfigured } from './lib/supabase.js';
import { handleOAuthRedirect } from './lib/integrations.js';
import { LoopBrand } from './components/LoopMark.jsx';

// ── Preview mode: ?preview=1 in URL bypasses login (for design review) ──────
// Note: Supabase RLS still blocks all writes & private data — only the
// shell/skeleton is visible. Safe to share the preview link publicly.
function isPreviewMode() {
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).get('preview') === '1';
}

export default function App() {
  const { user, loading } = useAuth();
  const [active, setActive]   = useState(() => localStorage.getItem('atelier:active') || 'dashboard');
  const [accent, setAccent]   = useState(() => localStorage.getItem('atelier:accent') || '#b27a42');
  const [density, setDensity] = useState(() => localStorage.getItem('atelier:density') || 'comfortable');
  const [tweaksOpen, setTweaksOpen] = useState(false);

  const previewMode = isPreviewMode();

  // Complete an OAuth redirect (?oauth=google&code=...) once, on load.
  useEffect(() => {
    handleOAuthRedirect().then(provider => {
      if (provider) alert(`เชื่อม ${provider} สำเร็จ ✓`);
    });
  }, []);

  useEffect(() => { localStorage.setItem('atelier:active', active); }, [active]);
  useEffect(() => {
    localStorage.setItem('atelier:accent', accent);
    document.documentElement.style.setProperty('--amber', accent);
  }, [accent]);
  useEffect(() => { localStorage.setItem('atelier:density', density); }, [density]);

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

  // ── Auth gate: skip in preview mode ──────────────────────────────────────
  if (isSupabaseConfigured && !user && !previewMode) {
    return <LoginScreen />;
  }

  const demoMode = !isSupabaseConfigured;

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
      case 'goals':     return <ComingSoon eyebrow="เป้าหมาย & OKR" title="Goals" emoji="◎" description="ตั้งเป้าหมายระยะยาว แบ่งเป็น quarter และ checklist รายสัปดาห์" />;
      case 'brain':     return <SecondBrain />;
      case 'life-calendar': return <LifeCalendar />;
      default: return <Dashboard onNav={setActive} user={user} />;
    }
  };

  return (
    <div className="app" data-density={density}>
      <Sidebar active={active} onChange={setActive} user={user} />
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
        <div className="fade-in">{render()}</div>
      </main>

      {!tweaksOpen && (
        <button
          onClick={() => setTweaksOpen(true)}
          title="Tweaks"
          aria-label="เปิด Tweaks"
          className="focus-ring"
          style={{
            position: 'fixed', right: 20, bottom: 20, zIndex: 999,
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
