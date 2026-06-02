// Initiates device code flow — no redirect URI needed in Azure
export default async function handler(req, res) {
  const { MS_CLIENT_ID, MS_TENANT_ID } = process.env;

  if (!MS_CLIENT_ID) {
    return res.status(500).json({ error: 'MS_CLIENT_ID not configured in Vercel env vars' });
  }

  const tenant = MS_TENANT_ID || 'common';

  const r = await fetch(
    `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/devicecode`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: MS_CLIENT_ID,
        scope: 'https://graph.microsoft.com/Calendars.Read https://graph.microsoft.com/Tasks.ReadWrite https://graph.microsoft.com/Files.Read offline_access',
      }),
    }
  );

  const data = await r.json();

  if (!data.device_code) {
    return res.status(500).json({ error: data.error_description || data.error || 'Device code request failed' });
  }

  res.json({
    device_code: data.device_code,
    user_code: data.user_code,
    verification_uri: data.verification_uri,
    expires_in: data.expires_in,
    interval: data.interval || 5,
  });
}
