// Phase 0 — OAuth code → token exchange.
// Client sends { provider, code, redirectUri } with the user's JWT.
// We verify the user, exchange the code for tokens (using the provider secret),
// and store them in `integrations` via the service role.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, json } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID') ?? '';
const GOOGLE_CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET') ?? '';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    // Verify the caller and get their user id.
    const userClient = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: 'unauthorized' }, 401);

    const { provider, code, redirectUri } = await req.json();
    if (provider !== 'google') return json({ error: 'unsupported provider' }, 400);
    if (!code || !redirectUri) return json({ error: 'missing code/redirectUri' }, 400);

    // Exchange authorization code for tokens.
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });
    const tok = await tokenRes.json();
    if (!tokenRes.ok) return json({ error: 'token_exchange_failed', detail: tok }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const expires_at = tok.expires_in
      ? new Date(Date.now() + tok.expires_in * 1000).toISOString()
      : null;

    const patch: Record<string, unknown> = {
      user_id: user.id, provider: 'google',
      access_token: tok.access_token,
      expires_at, scope: tok.scope ?? null,
      updated_at: new Date().toISOString(),
    };
    // Google only returns a refresh_token on the first consent — keep the old
    // one if this exchange didn't include a new one.
    if (tok.refresh_token) patch.refresh_token = tok.refresh_token;

    const { error } = await admin
      .from('integrations')
      .upsert(patch, { onConflict: 'user_id,provider' });
    if (error) return json({ error: 'store_failed', detail: error.message }, 500);

    return json({ ok: true, provider: 'google', scope: tok.scope ?? null });
  } catch (e) {
    return json({ error: 'exception', detail: String(e) }, 500);
  }
});
