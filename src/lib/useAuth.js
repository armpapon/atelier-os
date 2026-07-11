import { useEffect, useState } from 'react';
import { supabase } from './supabase.js';

/**
 * useAuth — ติดตาม session ของ user ปัจจุบัน
 * - loading: true ระหว่างเช็ค session ครั้งแรก
 * - session: object ถ้า logged in / null ถ้าไม่
 * - user: shortcut ของ session.user
 */
export function useAuth() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  // true เมื่อ user กลับมาจากลิงก์ "ลืมรหัสผ่าน" ในอีเมล — App จะโชว์หน้าตั้งรหัสใหม่
  const [passwordRecovery, setPasswordRecovery] = useState(false);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    // เช็ค session ปัจจุบันตอน mount
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    // listen การเปลี่ยนแปลง auth state (login/logout/refresh/password recovery)
    const { data: sub } = supabase.auth.onAuthStateChange((event, newSession) => {
      setSession(newSession);
      if (event === 'PASSWORD_RECOVERY') setPasswordRecovery(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  return {
    session,
    user: session?.user ?? null,
    loading,
    passwordRecovery,
    clearPasswordRecovery: () => setPasswordRecovery(false),
  };
}

export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signUp(email, password, name) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { name } },
  });
  if (error) throw error;
  return data;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function resetPassword(email) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin,
  });
  if (error) throw error;
}

export async function updatePassword(password) {
  const { data, error } = await supabase.auth.updateUser({ password });
  if (error) throw error;
  return data;
}
