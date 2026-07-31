import { useState } from 'react';
import { signIn, signUp, resetPassword } from '../lib/useAuth.js';
import { isSupabaseConfigured } from '../lib/supabase.js';
import { LoopMark } from './LoopMark.jsx';

/** Supabase auth errors are English and terse — say it in Thai instead. */
function thaiAuthError(err) {
  const raw = String(err?.message || err || '');
  const m = raw.toLowerCase();
  if (m.includes('invalid login credentials'))  return 'อีเมลหรือรหัสผ่านไม่ถูกต้อง';
  if (m.includes('email not confirmed'))        return 'ยังไม่ได้ยืนยันอีเมล — เปิดลิงก์ยืนยันในเมลก่อน';
  if (m.includes('user already registered') ||
      m.includes('already been registered'))    return 'อีเมลนี้สมัครไว้แล้ว — ลองเข้าสู่ระบบแทน';
  if (m.includes('password should be at least')) return 'รหัสผ่านสั้นเกินไป — ต้องอย่างน้อย 6 ตัวอักษร';
  if (m.includes('unable to validate email') ||
      m.includes('invalid email'))              return 'รูปแบบอีเมลไม่ถูกต้อง';
  if (m.includes('for security purposes') ||
      m.includes('rate limit') ||
      m.includes('too many'))                   return 'ลองบ่อยเกินไป — รอสักครู่แล้วลองใหม่';
  if (m.includes('failed to fetch') ||
      m.includes('network'))                    return 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ — เช็คอินเทอร์เน็ตแล้วลองใหม่';
  return raw || 'เกิดข้อผิดพลาด';
}

export function LoginScreen() {
  const [mode, setMode] = useState('signin'); // 'signin' | 'signup' | 'forgot'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [info, setInfo] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true); setError(null); setInfo(null);
    // A stray space or a capital letter from autofill is not a different
    // account — Supabase treats the address case-sensitively on the way in.
    const addr = (email || '').trim().toLowerCase();
    try {
      if (mode === 'signin') {
        await signIn(addr, password);
        // onAuthStateChange จะ trigger App ให้ render หน้าหลักเอง
      } else if (mode === 'forgot') {
        await resetPassword(addr);
        setInfo('ส่งลิงก์ตั้งรหัสผ่านใหม่ไปที่อีเมลแล้ว — เปิดลิงก์ในเมลเพื่อตั้งรหัสใหม่ (เช็ค Junk/Spam ด้วยถ้าไม่เจอ)');
      } else {
        const { user, session } = await signUp(addr, password, name);
        if (session) {
          // signup สำเร็จและได้ session เลย (email confirmation ปิดอยู่)
        } else {
          setInfo('สมัครเรียบร้อย! เช็คอีเมลเพื่อยืนยันก่อน หรือปิด "Confirm email" ใน Supabase Auth settings');
        }
      }
    } catch (err) {
      setError(thaiAuthError(err));
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
          {mode === 'signin' ? 'ยินดีต้อนรับกลับ' : mode === 'forgot' ? 'ลืมรหัสผ่าน' : 'สร้างบัญชีใหม่'}
        </div>
        <div style={styles.sub}>
          {mode === 'signin'
            ? 'เข้าสู่ระบบเพื่อเปิดข้อมูลส่วนตัวของคุณ'
            : mode === 'forgot'
            ? 'กรอกอีเมลที่ใช้สมัคร เราจะส่งลิงก์ตั้งรหัสผ่านใหม่ให้'
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

        {mode !== 'forgot' && (
          <label style={styles.field}>
            <span style={styles.label}>รหัสผ่าน</span>
            <input
              type="password" value={password} onChange={(e) => setPassword(e.target.value)}
              placeholder="อย่างน้อย 6 ตัวอักษร" style={styles.input}
              required minLength={6}
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            />
          </label>
        )}

        {mode === 'signin' && (
          <button
            type="button"
            onClick={() => { setMode('forgot'); setError(null); setInfo(null); }}
            style={{ ...styles.switch, alignSelf: 'flex-end', marginTop: -6 }}
          >
            ลืมรหัสผ่าน?
          </button>
        )}

        {error && <div style={{ ...styles.alert, ...styles.alertError }}>{error}</div>}
        {info && <div style={{ ...styles.alert, ...styles.alertInfo }}>{info}</div>}

        <button type="submit" disabled={loading} style={styles.submit}>
          {loading ? 'กำลังโหลด...'
            : mode === 'signin' ? 'เข้าสู่ระบบ'
            : mode === 'forgot' ? 'ส่งลิงก์ตั้งรหัสผ่านใหม่'
            : 'สมัครสมาชิก'}
        </button>

        <button
          type="button"
          onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setError(null); setInfo(null); }}
          style={styles.switch}
        >
          {mode === 'signin' ? 'ยังไม่มีบัญชี? สมัครเลย'
            : mode === 'forgot' ? '← กลับไปเข้าสู่ระบบ'
            : 'มีบัญชีอยู่แล้ว? เข้าสู่ระบบ'}
        </button>
      </form>
    </div>
  );
}

const styles = {
  container: {
    position: 'fixed', inset: 0,                   // ครอบ viewport จริง ไม่อิงกับ meta width=1280
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'radial-gradient(800px 400px at 50% 0%, var(--accent-tint), transparent 60%), var(--bg)',
    padding: 20, overflow: 'auto',
  },
  card: {
    width: '100%', maxWidth: 380,
    background: 'var(--surface)', border: 'none', boxShadow: 'var(--shadow-pop)',
    borderRadius: 'var(--radius-card)', padding: 36,
    display: 'flex', flexDirection: 'column', gap: 14,
  },
  brand: {
    fontFamily: 'var(--f-display)', fontSize: 22, color: 'var(--accent)',
    fontWeight: 500,
    display: 'flex', alignItems: 'center', marginBottom: 8,
  },
  title: {
    fontFamily: 'var(--f-display)', fontSize: 26, color: 'var(--ink)',
    fontWeight: 700, letterSpacing: '-0.02em',
  },
  sub: { color: 'var(--ink-3)', fontSize: 13.5, marginBottom: 8 },
  field: { display: 'flex', flexDirection: 'column', gap: 6 },
  label: {
    fontFamily: 'var(--f-mono)', fontSize: 10, letterSpacing: '0.18em',
    textTransform: 'uppercase', color: 'var(--ink-3)',
  },
  input: {
    background: 'var(--fill)', border: '1px solid transparent',
    borderRadius: 'var(--radius-field)', padding: '11px 12px',
    color: 'var(--ink)', fontSize: 14, outline: 'none',
    fontFamily: 'inherit',
  },
  submit: {
    marginTop: 6, padding: '12px 14px', borderRadius: 'var(--radius-btn)',
    background: 'var(--accent)', color: 'var(--text-inverse)',
    border: 0, fontWeight: 600, fontSize: 14, cursor: 'pointer',
    fontFamily: 'inherit',
  },
  switch: {
    background: 'transparent', border: 0, color: 'var(--ink-3)',
    fontSize: 12.5, cursor: 'pointer', padding: '4px 0',
    fontFamily: 'inherit',
  },
  alert: {
    padding: '10px 12px', borderRadius: 'var(--radius-field)',
    fontSize: 12.5, lineHeight: 1.5,
  },
  alertError: {
    background: 'var(--danger-soft)', color: 'var(--danger)',
    border: 'none',
  },
  alertInfo: {
    background: 'var(--accent-tint)', color: 'var(--accent)',
    border: 'none',
  },
};

// Shared with ResetPasswordScreen so both auth screens stay visually identical.
export const authStyles = styles;
