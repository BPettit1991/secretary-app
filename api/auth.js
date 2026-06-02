export async function getAccessToken() {
  const {
    MS_TENANT_ID,
    MS_CLIENT_ID,
    MS_CLIENT_SECRET,
    MS_REFRESH_TOKEN,
  } = process.env;

  if (!MS_CLIENT_ID || !MS_REFRESH_TOKEN) {
    throw new Error('Missing MS_CLIENT_ID or MS_REFRESH_TOKEN env vars');
  }

  // Personal Microsoft accounts must use 'consumers', work/school use tenant ID or 'common'
  const tenant = MS_TENANT_ID || 'common';

  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: MS_CLIENT_ID,
    refresh_token: MS_REFRESH_TOKEN,
    scope: 'https://graph.microsoft.com/Calendars.Read https://graph.microsoft.com/Tasks.ReadWrite https://graph.microsoft.com/Files.Read offline_access',
  });

  // Only include client_secret if provided (confidential client)
  if (MS_CLIENT_SECRET) {
    body.set('client_secret', MS_CLIENT_SECRET);
  }

  const res = await fetch(
    `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    }
  );

  const data = await res.json();

  if (!data.access_token) {
    const detail = data.error_description || data.error || JSON.stringify(data);
    throw new Error(`Token refresh failed: ${detail}`);
  }

  return data.access_token;
}
