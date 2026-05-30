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
import { useAuth } from './lib/useAuth.js';
import { isSupabaseConfigured } from './lib/supabase.js';

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
        background: 'var(--bg)', color: 'var(--ink-3)',
        fontFamily: 'var(--f-display)', fontStyle: 'italic', fontSize: 20,
      }}>
        <span style={{ color: 'var(--amber)', fontSize: 32, marginRight: 10 }}>ạ</span>
        Atelier OS
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
      case 'brain':     return <ComingSoon eyebrow="Second Brain · 128 โน้ต" title="Second Brain" emoji="✦" description="โน้ตทั้งหมดของคุณ — เชื่อมโยงกันแบบ Zettelkasten ค้นได้ใน 200ms" />;
      default: return <Dashboard onNav={setActive} user={user} />;
    }
  };

  return (
    <div className="app" data-density={density}>
      <Sidebar active={active} onChange={setActive} user={user} />
      <main className="main" key={active}>
        {previewMode && (
          <div style={{
            padding: '10px 16px', background: 'var(--amber)',
            borderBottom: '1px solid var(--amber-deep)', color: '#fff',
            fontFamily: 'var(--f-mono)', fontSize: 11, textAlign: 'center',
            letterSpacing: '0.12em', display: 'flex', justifyContent: 'center',
            alignItems: 'center', gap: 14,
          }}>
            <span>🎨 PREVIEW MODE · โหมดดูดีไซน์ · ไม่มีข้อมูลจริง (RLS protected)</span>
            <a href={window.location.pathname} style={{
              color: '#fff', textDecoration: 'underline', fontSize: 10.5,
            }}>ออกจาก preview</a>
          </div>
        )}
        {demoMode && !previewMode && (
          <div style={{
            padding: '8px 16px', background: 'var(--paper)',
            borderBottom: '1px solid var(--paper-2)', color: 'var(--paper-ink)',
            fontFamily: 'var(--f-mono)', fontSize: 11, textAlign: 'center',
            letterSpacing: '0.1em',
          }}>
            DEMO MODE — Supabase ยังไม่ได้ตั้งค่า • ข้อมูลเป็น mock data
          </div>
        )}
        <div className="fade-in">{render()}</div>
      </main>

      {!tweaksOpen && (
        <button
          onClick={() => setTweaksOpen(true)}
          title="Tweaks"
          style={{
            position: 'fixed', right: 16, bottom: 16, zIndex: 999,
            width: 40, height: 40, borderRadius: '50%',
            background: 'var(--amber)', color: '#fff',
            border: 0, cursor: 'pointer', display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 6px 20px rgba(80,60,30,0.18)',
          }}><Icon name="tweak" size={18} /></button>
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
