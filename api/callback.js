import { parseCookies } from './auth.js';

export default async function handler(req, res) {
  const { MS_CLIENT_ID, MS_TENANT_ID } = process.env;
  const { code, state, error, error_description } = req.query;

  if (error) {
    return res.status(400).send(`
      <h2>Auth error: ${error}</h2>
      <p>${error_description || ''}</p>
      <a href="/">← Back</a>
    `);
  }

  const cookies = parseCookies(req);

  if (!state || state !== cookies.oauth_s) {
    return res.status(400).send('State mismatch. <a href="/">Try again</a>');
  }

  const verifier = cookies.pkce_v;
  if (!verifier) {
    return res.status(400).send('PKCE verifier missing. <a href="/api/setup">Try again</a>');
  }

  const tenant = MS_TENANT_ID || 'common';
  const redirectUri = `https://${req.headers.host}/api/callback`;

  const tokenRes = await fetch(
    `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: MS_CLIENT_ID,
        code,
        redirect_uri: redirectUri,
        code_verifier: verifier,
      }),
    }
  );

  const tokens = await tokenRes.json();

  if (!tokens.refresh_token) {
    return res.status(400).send(`
      <h2>Token exchange failed</h2>
      <p>${tokens.error_description || tokens.error || 'No refresh token returned'}</p>
      <a href="/api/setup">Try again</a>
    `);
  }

  const cookie = (name, val, maxAge) =>
    `${name}=${encodeURIComponent(val)}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`;

  res.setHeader('Set-Cookie', [
    cookie('ms_rt', tokens.refresh_token, 60 * 60 * 24 * 30), // 30 days
    // Clear temp cookies
    `pkce_v=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`,
    `oauth_s=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`,
  ]);

  res.redirect('/');
}
