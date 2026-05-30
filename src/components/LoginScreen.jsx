import { useState } from 'react';
import { signIn, signUp } from '../lib/useAuth.js';
import { isSupabaseConfigured } from '../lib/supabase.js';
import { LoopMark } from './LoopMark.jsx';

export function LoginScreen() {
  const [mode, setMode] = useState('signin'); // 'signin' | 'signup'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [info, setInfo] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true); setError(null); setInfo(null);
    try {
      if (mode === 'signin') {
        await signIn(email, password);
        // onAuthStateChange จะ trigger App ให้ render หน้าหลักเอง
      } else {
        const { user, session } = await signUp(email, password, name);
        if (session) {
          // signup สำเร็จและได้ session เลย (email confirmation ปิดอยู่)
        } else {
          setInfo('สมัครเรียบร้อย! เช็คอีเมลเพื่อยืนยันก่อน หรือปิด "Confirm email" ใน Supabase Auth settings');
        }
      }
    } catch (err) {
      setError(err.message || 'เกิดข้อผิดพลาด');
    } finally {
      setLoading(false);
    }
  };

  if (!isSupabaseConfigured) {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <div style={styles.brand}><LoopMark size={26} /> <span style={{ marginLeft: 10 }}>Loop</span></div>
          <div style={styles.title}>ยังไม่ได้ตั้งค่า Supabase</div>
          <div style={styles.sub}>
            ใส่ <code>VITE_SUPABASE_URL</code> และ <code>VITE_SUPABASE_ANON_KEY</code>
            ใน <code>.env.local</code> (local) หรือ Vercel Environment Variables (production) แล้ว redeploy
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <form style={styles.card} onSubmit={handleSubmit}>
        <div style={styles.brand}><LoopMark size={26} /> <span style={{ marginLeft: 10 }}>Loop</span></div>
        <div style={styles.title}>
          {mode === 'signin' ? 'ยินดีต้อนรับกลับ' : 'สร้างบัญชีใหม่'}
        </div>
        <div style={styles.sub}>
          {mode === 'signin'
            ? 'เข้าสู่ระบบเพื่อเปิดข้อมูลส่วนตัวของคุณ'
            : 'สร้างบัญชีเพื่อเริ่มบันทึกชีวิตของคุณ'}
        </div>

        {mode === 'signup' && (
          <label style={styles.field}>
            <span style={styles.label}>ชื่อ</span>
            <input
              type="text" value={name} onChange={(e) => setName(e.target.value)}
              placeholder="อาทิตย์" style={styles.input}
              required minLength={1}
            />
          </label>
        )}

        <label style={styles.field}>
          <span style={styles.label}>อีเมล</span>
          <input
            type="email" value={email} onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com" style={styles.input}
            required autoComplete="email"
          />
        </label>

        <label style={styles.field}>
          <span style={styles.label}>รหัสผ่าน</span>
          <input
            type="password" value={password} onChange={(e) => setPassword(e.target.value)}
            placeholder="อย่างน้อย 6 ตัวอักษร" style={styles.input}
            required minLength={6}
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
          />
        </label>

        {error && <div style={{ ...styles.alert, ...styles.alertError }}>{error}</div>}
        {info && <div style={{ ...styles.alert, ...styles.alertInfo }}>{info}</div>}

        <button type="submit" disabled={loading} style={styles.submit}>
          {loading ? 'กำลังโหลด...' : (mode === 'signin' ? 'เข้าสู่ระบบ' : 'สมัครสมาชิก')}
        </button>

        <button
          type="button"
          onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setError(null); setInfo(null); }}
          style={styles.switch}
        >
          {mode === 'signin' ? 'ยังไม่มีบัญชี? สมัครเลย' : 'มีบัญชีอยู่แล้ว? เข้าสู่ระบบ'}
        </button>
      </form>
    </div>
  );
}

const styles = {
  container: {
    position: 'fixed', inset: 0,                   // ครอบ viewport จริง ไม่อิงกับ meta width=1280
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'radial-gradient(800px 400px at 50% 0%, rgba(212,165,116,0.12), transparent 60%), var(--bg)',
    padding: 20, overflow: 'auto',
  },
  card: {
    width: '100%', maxWidth: 380,
    background: 'var(--surface)', border: '1px solid var(--line)',
    borderRadius: 'var(--r-xl)', padding: 36,
    display: 'flex', flexDirection: 'column', gap: 14,
  },
  brand: {
    fontFamily: 'var(--f-display)', fontSize: 22, color: 'var(--accent)',
    fontWeight: 500,
    display: 'flex', alignItems: 'center', marginBottom: 8,
  },
  title: {
    fontFamily: 'var(--f-display)', fontSize: 26, color: 'var(--ink)',
    letterSpacing: '-0.01em',
  },
  sub: { color: 'var(--ink-3)', fontSize: 13.5, marginBottom: 8 },
  field: { display: 'flex', flexDirection: 'column', gap: 6 },
  label: {
    fontFamily: 'var(--f-mono)', fontSize: 10, letterSpacing: '0.18em',
    textTransform: 'uppercase', color: 'var(--ink-3)',
  },
  input: {
    background: 'var(--bg-2)', border: '1px solid var(--line)',
    borderRadius: 'var(--r-md)', padding: '10px 12px',
    color: 'var(--ink)', fontSize: 14, outline: 'none',
    fontFamily: 'inherit',
  },
  submit: {
    marginTop: 6, padding: '11px 14px', borderRadius: 'var(--r-md)',
    background: 'var(--amber)', color: '#1a1410',
    border: 0, fontWeight: 500, fontSize: 14, cursor: 'pointer',
    fontFamily: 'inherit',
  },
  switch: {
    background: 'transparent', border: 0, color: 'var(--ink-3)',
    fontSize: 12.5, cursor: 'pointer', padding: '4px 0',
    fontFamily: 'inherit',
  },
  alert: {
    padding: '10px 12px', borderRadius: 'var(--r-md)',
    fontSize: 12.5, lineHeight: 1.5,
  },
  alertError: {
    background: 'var(--loss-bg)', color: 'var(--loss)',
    border: '1px solid #4a2e2a',
  },
  alertInfo: {
    background: '#2a2014', color: 'var(--amber)',
    border: '1px solid #4a3a22',
  },
};
