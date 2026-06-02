/**
 * One-time script to get a Microsoft refresh token.
 * Run: node scripts/get-token.mjs
 * Paste the output values into Vercel environment variables.
 */
import * as readline from 'readline/promises';

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

const clientId = await rl.question('Client ID: ');
const tenantId = await rl.question('Tenant ID (or "common" for personal accounts): ');

// Step 1 — get device code
const codeRes = await fetch(
  `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/devicecode`,
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      scope: 'Calendars.Read Tasks.ReadWrite Files.Read offline_access',
    }),
  }
);
const codeData = await codeRes.json();
if (!codeData.device_code) {
  console.error('Failed:', codeData);
  process.exit(1);
}

console.log('\n─────────────────────────────────────────');
console.log(`Go to: ${codeData.verification_uri}`);
console.log(`Enter code: ${codeData.user_code}`);
console.log('─────────────────────────────────────────\n');
console.log('Waiting for you to sign in...');

// Step 2 — poll for token
const interval = (codeData.interval || 5) * 1000;
let tokenData = null;

while (!tokenData) {
  await new Promise(r => setTimeout(r, interval));
  const pollRes = await fetch(
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
        client_id: clientId,
        device_code: codeData.device_code,
      }),
    }
  );
  const poll = await pollRes.json();
  if (poll.refresh_token) {
    tokenData = poll;
  } else if (poll.error === 'authorization_pending') {
    process.stdout.write('.');
  } else if (poll.error === 'expired_token') {
    console.error('\nCode expired. Run the script again.');
    process.exit(1);
  }
}

console.log('\n\n✓ Got it. Add these to Vercel:\n');
console.log(`MS_TENANT_ID=${tenantId}`);
console.log(`MS_CLIENT_ID=${clientId}`);
console.log(`MS_REFRESH_TOKEN=${tokenData.refresh_token}`);
console.log('\n(MS_CLIENT_SECRET comes from your Azure App Registration → Certificates & secrets)');

rl.close();
