// Phase 0 — authenticated proxy to a provider API.
// Client sends { provider, url, method?, body? } with the user's JWT.
// We look up that user's token (refreshing Google tokens when expired) and call
// the provider on their behalf. Secrets never reach the browser.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, json } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID') ?? '';
const GOOGLE_CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET') ?? '';

async function refreshGoogle(admin: any, row: any) {
  if (!row.refresh_token) return row.access_token;
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: row.refresh_token,
      grant_type: 'refresh_token',
    }),
  });
  const tok = await res.json();
  if (!res.ok) throw new Error('refresh_failed: ' + JSON.stringify(tok));
  await admin.from('integrations').update({
    access_token: tok.access_token,
    expires_at: tok.expires_in ? new Date(Date.now() + tok.expires_in * 1000).toISOString() : null,
    updated_at: new Date().toISOString(),
  }).eq('id', row.id);
  return tok.access_token;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    const userClient = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: 'unauthorized' }, 401);

    const { provider, url, method = 'GET', body } = await req.json();
    if (!provider || !url) return json({ error: 'missing provider/url' }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: row } = await admin
      .from('integrations').select('*')
      .eq('user_id', user.id).eq('provider', provider).maybeSingle();
    if (!row) return json({ error: 'not_connected' }, 400);

    let token = row.access_token;
    if (provider === 'google' && row.expires_at && new Date(row.expires_at) <= new Date(Date.now() + 60000)) {
      token = await refreshGoogle(admin, row);
    }

    const res = await fetch(url, {
      method,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    return new Response(text, {
      status: res.status,
      headers: { ...corsHeaders, 'Content-Type': res.headers.get('Content-Type') ?? 'application/json' },
    });
  } catch (e) {
    return json({ error: 'exception', detail: String(e) }, 500);
  }
});
