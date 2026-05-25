import { useEffect, useState } from 'react';
import { Sidebar } from './components/Sidebar.jsx';
import { Icon } from './components/Icon.jsx';
import { TweaksPanel } from './components/TweaksPanel.jsx';
import { ComingSoon } from './components/ComingSoon.jsx';
import { Dashboard } from './pages/Dashboard.jsx';
import { Trading } from './pages/Trading.jsx';
import { Learning } from './pages/Learning.jsx';
import { Journal } from './pages/Journal.jsx';
import { Finance } from './pages/Finance.jsx';
import { Family } from './pages/Family.jsx';

export default function App() {
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

  const render = () => {
    switch (active) {
      case 'dashboard': return <Dashboard />;
      case 'trading':   return <Trading />;
      case 'learning':  return <Learning />;
      case 'journal':   return <Journal />;
      case 'finance':   return <Finance />;
      case 'family':    return <Family />;
      case 'goals':     return <ComingSoon eyebrow="เป้าหมาย & OKR" title="Goals" emoji="◎" description="ตั้งเป้าหมายระยะยาว แบ่งเป็น quarter และ checklist รายสัปดาห์" />;
      case 'brain':     return <ComingSoon eyebrow="Second Brain · 128 โน้ต" title="Second Brain" emoji="✦" description="โน้ตทั้งหมดของคุณ — เชื่อมโยงกันแบบ Zettelkasten ค้นได้ใน 200ms" />;
      default: return <Dashboard />;
    }
  };

  return (
    <div className="app" data-density={density}>
      <Sidebar active={active} onChange={setActive} />
      <main className="main" key={active}>
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
