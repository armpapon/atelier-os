// ════════════════════════════════════════════════════════════════════════════
//  Integrations client — Phase 0 foundation
//  Talks to the Edge Functions (oauth-exchange, provider-proxy). Secrets stay
//  server-side; the client only ever holds the public client_id.
// ════════════════════════════════════════════════════════════════════════════
import { supabase } from './supabase.js';

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

// Every Google scope the app uses. Connect buttons always request the full
// set (with include_granted_scopes) so a re-consent never drops a scope the
// user granted earlier — lesson from v3.11.
export const GOOGLE_SCOPES = {
  calendar: 'https://www.googleapis.com/auth/calendar.readonly',
  gmail: 'https://www.googleapis.com/auth/gmail.readonly',
  sheets: 'https://www.googleapis.com/auth/spreadsheets.readonly',
  slides: 'https://www.googleapis.com/auth/presentations.readonly',
};
export const ALL_GOOGLE_SCOPES = Object.values(GOOGLE_SCOPES);

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
  if (!supabase) return null;
  const code = q.get('code');

  const stripParams = () => {
    const url = new URL(window.location.href);
    url.searchParams.delete('oauth');
    url.searchParams.delete('code');
    url.searchParams.delete('scope');
    window.history.replaceState({}, '', url.pathname + url.search);
  };

  // The Edge Function needs an authenticated caller. On a cold load the auth
  // session isn't restored yet, so invoking immediately failed — and the old
  // `finally` then stripped ?code= anyway, making the failure unrecoverable
  // without redoing the whole consent flow.
  try {
    await supabase.auth.getSession();
  } catch { /* fall through — the invoke below will report the real problem */ }

  try {
    const { data, error } = await supabase.functions.invoke('oauth-exchange', {
      body: { provider: 'google', code, redirectUri: googleRedirectUri() },
    });
    if (error || data?.error) throw new Error(error?.message || data?.error || 'exchange failed');
    stripParams();
    return 'google';
  } catch (e) {
    const msg = String(e?.message || e);
    // An auth code is single-use: once Google has rejected/consumed it there is
    // nothing to retry, so clear the URL. Anything else (network, cold session)
    // is worth a reload, so leave ?code= in place.
    const nonRetryable = /invalid_grant|expired|already|redirect_uri|invalid_request|unauthorized_client/i.test(msg);
    if (nonRetryable) stripParams();
    alert('เชื่อม Google ไม่สำเร็จ: ' + msg + (nonRetryable ? '' : ' — ลองรีเฟรชหน้าอีกครั้ง'));
    return null;
  }
}

// Read connection status (never returns raw tokens for display — just presence).
export async function getIntegration(provider) {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('integrations')
    .select('provider, scope, expires_at, meta, updated_at')
    .eq('provider', provider)
    .maybeSingle();
  // A failed read used to look identical to "not connected", so a transient
  // error silently downgraded the UI to a Connect button.
  if (error) throw error;
  return data;
}

// ── Asana (Personal Access Token — no OAuth, never expires) ─────────────────
// The user pastes the PAT in the app UI. We store it in `integrations` via a
// direct upsert (RLS restricts to the owner's row), then validate it through
// provider-proxy — a bad token is deleted again so the card stays disconnected.
export async function connectAsana(pat) {
  if (!supabase) throw new Error('Supabase not configured');
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not logged in');
  const { error } = await supabase.from('integrations').upsert({
    user_id: user.id, provider: 'asana', access_token: pat,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id,provider' });
  if (error) throw error;
  try {
    const me = await callProvider('asana', {
      url: 'https://app.asana.com/api/1.0/users/me?opt_fields=name,workspaces.name',
    });
    return me?.data;
  } catch (e) {
    await supabase.from('integrations').delete().eq('provider', 'asana');
    throw new Error('Token ใช้ไม่ได้ — เช็คว่า copy มาครบ: ' + (e.message || e));
  }
}

// Persist per-provider settings (e.g. Asana's chosen workspace/project).
export async function updateIntegrationMeta(provider, meta) {
  if (!supabase) throw new Error('Supabase not configured');
  const { error } = await supabase.from('integrations')
    .update({ meta, updated_at: new Date().toISOString() })
    .eq('provider', provider);
  if (error) throw error;
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
  const { data, error } = await supabase.from('gmail_dismissed').select('thread_id, dismissed_ts');
  if (error) throw error;
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
          // The proxy's own crash wrapper is { error: 'exception', detail: <real
          // cause> } — the bare word must never win over its detail, or every
          // failure (e.g. a Google token refresh rejection) reads as "exception".
          detail = j?.error?.message || j?.error?.detail || j?.errors?.[0]?.message
            || (typeof j?.error === 'string' && j?.detail ? `${j.error} — ${j.detail}` : null)
            || j?.error || j?.detail || text;
        } catch { detail = text; }
      }
    } catch { /* keep generic message */ }
    throw new Error(typeof detail === 'string' ? detail : JSON.stringify(detail));
  }
  return data;
}
