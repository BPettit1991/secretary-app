import { createHash, randomBytes } from 'crypto';

export function generatePKCE() {
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

export function parseCookies(req) {
  return Object.fromEntries(
    (req?.headers?.cookie || '').split(';').flatMap(c => {
      const idx = c.indexOf('=');
      if (idx < 0) return [];
      return [[c.slice(0, idx).trim(), decodeURIComponent(c.slice(idx + 1).trim())]];
    })
  );
}

export async function getAccessToken(req) {
  const { MS_CLIENT_ID, MS_TENANT_ID } = process.env;

  if (!MS_CLIENT_ID) throw new Error('NOT_CONFIGURED');

  const cookies = parseCookies(req);
  const refreshToken = cookies.ms_rt;

  if (!refreshToken) throw new Error('NOT_CONNECTED');

  const tenant = MS_TENANT_ID || 'common';

  const res = await fetch(
    `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: MS_CLIENT_ID,
        refresh_token: refreshToken,
        scope: 'https://graph.microsoft.com/Calendars.Read https://graph.microsoft.com/Tasks.ReadWrite https://graph.microsoft.com/Files.Read offline_access',
      }),
    }
  );

  const data = await res.json();
  if (!data.access_token) {
    const msg = data.error_description?.split('\r\n')[0] || data.error || 'unknown';
    // If refresh token is stale, signal re-auth
    if (data.error === 'invalid_grant') throw new Error('NOT_CONNECTED');
    throw new Error(`Token error: ${msg}`);
  }

  return { accessToken: data.access_token, newRefreshToken: data.refresh_token };
}
