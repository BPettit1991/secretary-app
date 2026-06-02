export async function getAccessToken() {
  const { MS_TENANT_ID, MS_CLIENT_ID, MS_CLIENT_SECRET, MS_REFRESH_TOKEN } = process.env;

  if (!MS_TENANT_ID || !MS_CLIENT_ID || !MS_CLIENT_SECRET || !MS_REFRESH_TOKEN) {
    throw new Error('Missing Microsoft Graph env vars');
  }

  const res = await fetch(
    `https://login.microsoftonline.com/${MS_TENANT_ID}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: MS_CLIENT_ID,
        client_secret: MS_CLIENT_SECRET,
        refresh_token: MS_REFRESH_TOKEN,
        scope: 'Calendars.Read Tasks.ReadWrite Files.Read offline_access',
      }),
    }
  );

  const data = await res.json();
  if (!data.access_token) {
    throw new Error(`Token refresh failed: ${data.error_description || data.error}`);
  }

  return data.access_token;
}
