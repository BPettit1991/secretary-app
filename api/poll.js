import { saveToken } from './token-store.js';

// Polls Microsoft for token after user has entered device code
export default async function handler(req, res) {
  const { MS_CLIENT_ID, MS_TENANT_ID } = process.env;
  const { device_code } = req.body || {};

  if (!device_code) return res.status(400).json({ error: 'device_code required' });

  const tenant = MS_TENANT_ID || 'common';

  const r = await fetch(
    `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
        client_id: MS_CLIENT_ID,
        device_code,
      }),
    }
  );

  const data = await r.json();

  if (data.refresh_token) {
    // Save server-side so all devices share this login
    saveToken(data.refresh_token);

    // Also set cookie for this browser session
    const isHttps = (req.headers['x-forwarded-proto'] === 'https') || (req.connection?.encrypted);
    const cookieVal = encodeURIComponent(data.refresh_token);
    const secure = isHttps ? '; Secure' : '';
    res.setHeader('Set-Cookie',
      `ms_rt=${cookieVal}; HttpOnly${secure}; SameSite=Lax; Path=/; Max-Age=${60 * 60 * 24 * 30}`
    );
    return res.json({ status: 'ok' });
  }

  if (data.error === 'authorization_pending') {
    return res.json({ status: 'pending' });
  }

  if (data.error === 'expired_token') {
    return res.json({ status: 'expired' });
  }

  return res.json({ status: 'error', message: data.error_description || data.error });
}
