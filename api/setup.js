import { generatePKCE } from './auth.js';
import { randomBytes } from 'crypto';

export default function handler(req, res) {
  const { MS_CLIENT_ID, MS_TENANT_ID } = process.env;

  if (!MS_CLIENT_ID) {
    return res.status(500).send(`
      <h2>MS_CLIENT_ID not set</h2>
      <p>Add it to your Vercel environment variables, then redeploy.</p>
    `);
  }

  const { verifier, challenge } = generatePKCE();
  const state = randomBytes(16).toString('hex');
  const tenant = MS_TENANT_ID || 'common';
  const redirectUri = `https://${req.headers.host}/api/callback`;

  const cookie = (name, val, maxAge = 600) =>
    `${name}=${val}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`;

  res.setHeader('Set-Cookie', [
    cookie('pkce_v', verifier),
    cookie('oauth_s', state),
  ]);

  const params = new URLSearchParams({
    client_id: MS_CLIENT_ID,
    response_type: 'code',
    redirect_uri: redirectUri,
    scope: 'https://graph.microsoft.com/Calendars.Read https://graph.microsoft.com/Tasks.ReadWrite https://graph.microsoft.com/Files.Read offline_access',
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state,
    prompt: 'select_account',
  });

  res.redirect(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize?${params}`);
}
