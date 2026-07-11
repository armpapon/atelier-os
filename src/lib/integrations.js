// ════════════════════════════════════════════════════════════════════════════
//  Integrations client — Phase 0 foundation
//  Talks to the Edge Functions (oauth-exchange, provider-proxy). Secrets stay
//  server-side; the client only ever holds the public client_id.
// ════════════════════════════════════════════════════════════════════════════
import { supabase } from './supabase.js';

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

// Redirect back to the app root with a marker we detect on load.
export function googleRedirectUri() {
  return `${window.location.origin}/?oauth=google`;
}

// Kick off Google consent. Pass the scopes the current phase needs.
// offline + prompt=consent so we always receive a refresh_token.
export function startGoogleAuth(scopes = ['https://www.googleapis.com/auth/calendar.readonly']) {
  if (!GOOGLE_CLIENT_ID) { alert('ยังไม่ได้ตั้งค่า VITE_GOOGLE_CLIENT_ID'); return; }
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: googleRedirectUri(),
    response_type: 'code',
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    scope: scopes.join(' '),
  });
  window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

// Detect ?oauth=google&code=... on load, exchange the code, then clean the URL.
// Returns 'google' if a connection was just made, else null.
export async function handleOAuthRedirect() {
  const q = new URLSearchParams(window.location.search);
  if (q.get('oauth') !== 'google' || !q.get('code')) return null;
  const code = q.get('code');
  try {
    const { data, error } = await supabase.functions.invoke('oauth-exchange', {
      body: { provider: 'google', code, redirectUri: googleRedirectUri() },
    });
    if (error || data?.error) throw new Error(error?.message || data?.error);
    return 'google';
  } catch (e) {
    alert('เชื่อม Google ไม่สำเร็จ: ' + e.message);
    return null;
  } finally {
    // Strip the oauth params from the URL regardless.
    const url = new URL(window.location.href);
    url.searchParams.delete('oauth');
    url.searchParams.delete('code');
    url.searchParams.delete('scope');
    window.history.replaceState({}, '', url.pathname + url.search);
  }
}

// Read connection status (never returns raw tokens for display — just presence).
export async function getIntegration(provider) {
  if (!supabase) return null;
  const { data } = await supabase
    .from('integrations')
    .select('provider, scope, expires_at, updated_at')
    .eq('provider', provider)
    .maybeSingle();
  return data;
}

export async function disconnect(provider) {
  if (!supabase) return;
  await supabase.from('integrations').delete().eq('provider', provider);
}

// ── Gmail "เมลค้างตอบ" manual dismiss ────────────────────────────────────────
// Threads the user marked as handled. dismissed_ts = the latest message's
// timestamp at dismissal, so a newer client message resurfaces the thread.
export async function listGmailDismissed() {
  if (!supabase) return [];
  const { data } = await supabase.from('gmail_dismissed').select('thread_id, dismissed_ts');
  return data || [];
}

export async function dismissGmailThread(threadId, lastTs) {
  if (!supabase) throw new Error('Supabase not configured');
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not logged in');
  const { error } = await supabase.from('gmail_dismissed').upsert({
    user_id: user.id, thread_id: threadId, dismissed_ts: lastTs,
  });
  if (error) throw error;
}

// Call a provider API through the authenticated proxy.
export async function callProvider(provider, { url, method = 'GET', body } = {}) {
  const { data, error } = await supabase.functions.invoke('provider-proxy', {
    body: { provider, url, method, body },
  });
  if (error) {
    // supabase-js hides the real body behind a generic message on non-2xx.
    // The proxy forwards the provider's status + body, so read it back for a
    // useful error (e.g. Gmail API disabled, insufficient scopes, not_connected).
    let detail = error.message;
    try {
      const text = await error.context?.text?.();
      if (text) {
        try {
          const j = JSON.parse(text);
          detail = j?.error?.message || j?.error?.detail || j?.error || j?.detail || text;
        } catch { detail = text; }
      }
    } catch { /* keep generic message */ }
    throw new Error(typeof detail === 'string' ? detail : JSON.stringify(detail));
  }
  return data;
}
