import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !key) {
  console.warn(
    '[Supabase] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. ' +
    'App will fall back to mock data. Add them in .env.local or Vercel env vars.'
  );
}

export const supabase = (url && key) ? createClient(url, key) : null;
export const isSupabaseConfigured = !!supabase;
