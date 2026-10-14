import {
  authUser,
  clearSessionCookie,
  extractToken,
  json,
  makeSessionCookie,
  redirect,
  signJwt,
  upsertUserOnSignIn,
  verifyJwt,
  writeStore,
} from './_shared.js';

function resolveOrigin(event) {
  const headers = event.headers || {};
  const host = headers['x-forwarded-host'] || headers.host || headers.Host;
  if (host) {
    const proto =
      headers['x-forwarded-proto'] ||
      (host.startsWith('localhost') || host.startsWith('127.0.0.1') ? 'http' : 'https');
    return `${proto}://${host}`;
  }
  if (event.rawUrl) {
    try {
      return new URL(event.rawUrl).origin;
    } catch {
      // ignore
    }
  }
  return (
    process.env.NEXTAUTH_URL ||
    process.env.VITE_APP_URL ||
    'http://localhost:5173'
  ).replace(/\/+$/, '');
}

function getSubroute(event) {
  const p = event.path || '';
  const params = event.queryStringParameters || {};
  if (params.action) return params.action;
  if (p.endsWith('/callback/google') || p.includes('/callback/google')) return 'callback/google';
  if (p.endsWith('/google') || p.endsWith('/signin/google')) return 'google';
  if (p.endsWith('/signout')) return 'signout';
  if (p.endsWith('/profile')) return 'profile';
  return 'session';
}

export const handler = async (event) => {
  const route = getSubroute(event);
  const method = (event.httpMethod || 'GET').toUpperCase();
  const origin = resolveOrigin(event);
  const clientId = process.env.GOOGLE_CLIENT_ID || '';
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET || '';
  const googleReady = Boolean(clientId && clientSecret);

  try {
    // 1. Start Google OAuth flow
    if (route === 'google' && method === 'GET') {
      if (!googleReady) {
        return redirect(`${origin}/login?error=google_not_configured`);
      }
      const redirectUri = `${origin}/api/auth/callback/google`;
      const stateToken = signJwt({ origin, redirectUri }, 600);
      const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
      authUrl.searchParams.set('client_id', clientId);
      authUrl.searchParams.set('redirect_uri', redirectUri);
      authUrl.searchParams.set('response_type', 'code');
      authUrl.searchParams.set('scope', 'openid email profile');
      authUrl.searchParams.set('prompt', 'select_account');
      authUrl.searchParams.set('state', stateToken);

      if (event.queryStringParameters?.mode === 'json') {
        return json(200, { url: authUrl.toString() });
      }
      return redirect(authUrl.toString());
    }

    // 2. Google OAuth callback (/api/auth/callback/google)
    if (route === 'callback/google' && method === 'GET') {
      const params = event.queryStringParameters || {};
      if (params.error || !params.code) {
        return redirect(`${origin}/login?error=${encodeURIComponent(params.error || 'missing_code')}`);
      }
      if (!googleReady) {
        return redirect(`${origin}/login?error=google_not_configured`);
      }

      const statePayload = verifyJwt(params.state);
      const redirectUri = statePayload?.redirectUri || `${origin}/api/auth/callback/google`;

      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code: params.code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code',
        }),
      });

      if (!tokenRes.ok) {
        const errText = await tokenRes.text().catch(() => '');
        console.error('[OweNow] Google token exchange failed:', errText);
        return redirect(`${origin}/login?error=oauth_token_exchange_failed`);
      }

      const tokenData = await tokenRes.json();
      const userRes = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });

      if (!userRes.ok) {
        return redirect(`${origin}/login?error=oauth_userinfo_failed`);
      }

      const googleUser = await userRes.json();
      if (!googleUser?.email) {
        return redirect(`${origin}/login?error=missing_email`);
      }

      const profile = await upsertUserOnSignIn({
        email: googleUser.email,
        name: googleUser.name,
        image: googleUser.picture,
      });

      const jwt = signJwt({
        sub: profile.id,
        email: profile.email,
        name: profile.full_name,
        picture: profile.avatar_url,
      });

      return redirect(`${origin}/?auth_token=${encodeURIComponent(jwt)}`, {
        'Set-Cookie': makeSessionCookie(jwt),
      });
    }

    // 3. Sign out
    if (route === 'signout' && (method === 'POST' || method === 'GET')) {
      return json(
        200,
        { ok: true },
        {
          'Set-Cookie': clearSessionCookie(),
        }
      );
    }

    // 4. Update profile
    if (route === 'profile' && (method === 'PATCH' || method === 'PUT' || method === 'POST')) {
      const { user, state } = await authUser(event);
      const body = JSON.parse(event.body || '{}');
      const existing = state.profiles[user.id];
      const updated = {
        ...existing,
        full_name:
          typeof body.full_name === 'string' && body.full_name.trim()
            ? body.full_name.trim()
            : existing.full_name,
      };
      state.profiles[user.id] = updated;
      await writeStore(state);
      return json(200, { profile: updated });
    }

    // 5. Session lookup (GET /api/auth/session or GET /api/auth)
    const token = extractToken(event);
    if (!token) {
      return json(200, { user: null, profile: null, session: null, googleReady });
    }

    try {
      const { user, profile } = await authUser(event);
      return json(200, {
        user,
        profile,
        session: { access_token: token, user },
        googleReady,
      });
    } catch {
      return json(
        200,
        { user: null, profile: null, session: null, googleReady },
        { 'Set-Cookie': clearSessionCookie() }
      );
    }
  } catch (err) {
    return json(err.status || 500, { error: err.message || 'Auth error' });
  }
};
