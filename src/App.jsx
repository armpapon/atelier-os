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

export default function App() {
  const { user, loading } = useAuth();
  const [active, setActive] = useState(() => localStorage.getItem('atelier:active') || 'dashboard');
  const [accent, setAccent] = useState(() => localStorage.getItem('atelier:accent') || '#d4a574');
  const [density, setDensity] = useState(() => localStorage.getItem('atelier:density') || 'comfortable');
  const [tweaksOpen, setTweaksOpen] = useState(false);

  useEffect(() => { localStorage.setItem('atelier:active', active); }, [active]);
  useEffect(() => {
    localStorage.setItem('atelier:accent', accent);
    document.documentElement.style.setProperty('--amber', accent);
  }, [accent]);
  useEffect(() => { localStorage.setItem('atelier:density', density); }, [density]);

  // ── Loading state ────────────────────────────────────────────────────────
  if (loading) {
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

  // ── ไม่ได้ login → แสดงหน้า Login ─────────────────────────────────────────
  // (ถ้า Supabase ยังไม่ตั้งค่า — LoginScreen จะแสดง warning เอง)
  if (isSupabaseConfigured && !user) {
    return <LoginScreen />;
  }

  // ── ถ้ายังไม่ได้ตั้ง Supabase — เปิด demo mode พร้อม banner ─────────────────
  const demoMode = !isSupabaseConfigured;

  const render = () => {
    switch (active) {
      case 'dashboard': return <Dashboard />;
      case 'trading':          return <Trading />;
      case 'learning':         return <Learning />;
      case 'journal':          return <Journal />;
      case 'finance':          return <PersonalFinance />;   // backward compat
      case 'personal-finance': return <PersonalFinance />;
      case 'family-finance':   return <FamilyFinance />;
      case 'family':           return <Family />;
      case 'goals':     return <ComingSoon eyebrow="เป้าหมาย & OKR" title="Goals" emoji="◎" description="ตั้งเป้าหมายระยะยาว แบ่งเป็น quarter และ checklist รายสัปดาห์" />;
      case 'brain':     return <ComingSoon eyebrow="Second Brain · 128 โน้ต" title="Second Brain" emoji="✦" description="โน้ตทั้งหมดของคุณ — เชื่อมโยงกันแบบ Zettelkasten ค้นได้ใน 200ms" />;
      default: return <Dashboard />;
    }
  };

  return (
    <div className="app" data-density={density}>
      <Sidebar active={active} onChange={setActive} user={user} />
      <main className="main" key={active}>
        {demoMode && (
          <div style={{
            padding: '8px 16px', background: '#2a2014',
            borderBottom: '1px solid #4a3a22', color: 'var(--amber)',
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
            background: 'var(--amber)', color: '#1a1410',
            border: 0, cursor: 'pointer', display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 6px 20px rgba(0,0,0,.4)',
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
