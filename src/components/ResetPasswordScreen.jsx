import { useState } from 'react';
import { updatePassword } from '../lib/useAuth.js';
import { authStyles as styles } from './LoginScreen.jsx';
import { LoopMark } from './LoopMark.jsx';

/**
 * ResetPasswordScreen — โชว์เมื่อ user กลับมาจากลิงก์ "ลืมรหัสผ่าน" ในอีเมล
 * (onAuthStateChange event 'PASSWORD_RECOVERY'). ตอนนี้ user มี session ชั่วคราวแล้ว
 * แค่ต้องตั้งรหัสใหม่ผ่าน supabase.auth.updateUser({ password })
 */
export function ResetPasswordScreen({ onDone }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (password !== confirm) {
      setError('รหัสผ่านทั้งสองช่องไม่ตรงกัน');
      return;
    }
    setLoading(true); setError(null);
    try {
      await updatePassword(password);
      setDone(true);
    } catch (err) {
      setError(err.message || 'เกิดข้อผิดพลาด');
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <div style={styles.brand}><LoopMark size={26} /> <span style={{ marginLeft: 10 }}>Loop</span></div>
          <div style={styles.title}>ตั้งรหัสผ่านใหม่เรียบร้อย</div>
          <div style={styles.sub}>ใช้รหัสผ่านใหม่นี้ในการเข้าสู่ระบบครั้งถัดไป</div>
          <button type="button" onClick={onDone} style={styles.submit}>
            เข้าใช้งาน Loop →
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <form style={styles.card} onSubmit={handleSubmit}>
        <div style={styles.brand}><LoopMark size={26} /> <span style={{ marginLeft: 10 }}>Loop</span></div>
        <div style={styles.title}>ตั้งรหัสผ่านใหม่</div>
        <div style={styles.sub}>กรอกรหัสผ่านใหม่ที่ต้องการใช้กับบัญชีนี้</div>

        <label style={styles.field}>
          <span style={styles.label}>รหัสผ่านใหม่</span>
          <input
            type="password" value={password} onChange={(e) => setPassword(e.target.value)}
            placeholder="อย่างน้อย 6 ตัวอักษร" style={styles.input}
            required minLength={6} autoComplete="new-password" autoFocus
          />
        </label>

        <label style={styles.field}>
          <span style={styles.label}>ยืนยันรหัสผ่านใหม่</span>
          <input
            type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)}
            placeholder="พิมพ์รหัสเดิมอีกครั้ง" style={styles.input}
            required minLength={6} autoComplete="new-password"
          />
        </label>

        {error && <div style={{ ...styles.alert, ...styles.alertError }}>{error}</div>}

        <button type="submit" disabled={loading} style={styles.submit}>
          {loading ? 'กำลังบันทึก...' : 'บันทึกรหัสผ่านใหม่'}
        </button>
      </form>
    </div>
  );
}
