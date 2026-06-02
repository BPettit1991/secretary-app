/**
 * Run: node scripts/test-token.mjs
 * Tests your env vars directly against Microsoft's token endpoint.
 * Set these before running:
 *   $env:MS_TENANT_ID="..."
 *   $env:MS_CLIENT_ID="..."
 *   $env:MS_CLIENT_SECRET="..."   (optional — only if you created one)
 *   $env:MS_REFRESH_TOKEN="..."
 */

const { MS_TENANT_ID, MS_CLIENT_ID, MS_CLIENT_SECRET, MS_REFRESH_TOKEN } = process.env;

console.log('Testing with:');
console.log('  TENANT_ID :', MS_TENANT_ID || '(not set — will use "common")');
console.log('  CLIENT_ID :', MS_CLIENT_ID ? MS_CLIENT_ID.slice(0,8)+'...' : '(not set)');
console.log('  CLIENT_SECRET:', MS_CLIENT_SECRET ? '(set)' : '(not set — public client)');
console.log('  REFRESH_TOKEN:', MS_REFRESH_TOKEN ? MS_REFRESH_TOKEN.slice(0,20)+'...' : '(not set)');
console.log('');

const tenant = MS_TENANT_ID || 'common';
const body = new URLSearchParams({
  grant_type: 'refresh_token',
  client_id: MS_CLIENT_ID,
  refresh_token: MS_REFRESH_TOKEN,
  scope: 'https://graph.microsoft.com/Calendars.Read https://graph.microsoft.com/Tasks.ReadWrite https://graph.microsoft.com/Files.Read offline_access',
});
if (MS_CLIENT_SECRET) body.set('client_secret', MS_CLIENT_SECRET);

const res = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body,
});

const data = await res.json();

if (data.access_token) {
  console.log('✓ Token refresh succeeded!');
  console.log('  Token expires in:', data.expires_in, 'seconds');
  console.log('  Scope granted:', data.scope);

  // Quick test — fetch /me
  const me = await fetch('https://graph.microsoft.com/v1.0/me', {
    headers: { Authorization: `Bearer ${data.access_token}` }
  }).then(r => r.json());
  console.log('\n✓ Signed in as:', me.displayName, '|', me.mail || me.userPrincipalName);
} else {
  console.error('✗ Token refresh failed:');
  console.error('  Error:', data.error);
  console.error('  Description:', data.error_description?.split('\r\n')[0]);

  console.log('\n--- Troubleshooting ---');
  if (data.error === 'invalid_client') {
    console.log('→ Client secret is wrong or app is registered as public client (no secret needed)');
  }
  if (data.error_description?.includes('AADSTS9002313')) {
    console.log('→ Request is malformed. Most likely the refresh token has invalid characters.');
    console.log('  Check: was the refresh token copied in full with no line breaks?');
    console.log('  Check: is MS_TENANT_ID a valid GUID or "common" or "consumers"?');
  }
  if (data.error_description?.includes('AADSTS700082')) {
    console.log('→ Refresh token expired. Re-run scripts/get-token.mjs to get a new one.');
  }
  if (data.error_description?.includes('AADSTS70011')) {
    console.log('→ Scope not supported. Check API permissions in Azure App Registration.');
  }
}
