/**
 * Proxies requests to remote machine bridges.
 * Enables Vercel frontend to reach Mac Mini and other nodes
 * via their bridge URLs (Tailscale, cloudflare tunnel, etc.)
 *
 * Usage: POST /api/bridge-proxy
 * Body: { machine: "MAC-MINI", endpoint: "/status", method: "GET", body: {} }
 */

const MACHINES = {
  'MAIN-LAP': process.env.BRIDGE_MAINLAP || null,    // Optional — usually reached via localhost
  'BLACKBETTY': process.env.BRIDGE_BLACKBETTY || null,
  'MAC-MINI': process.env.BRIDGE_MACMINI || null,
  'TERTIARY': process.env.BRIDGE_TERTIARY || null,
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { machine, endpoint = '/status', method = 'GET', body } = req.body || {};

  if (!machine) return res.status(400).json({ error: 'machine required' });

  const baseUrl = MACHINES[machine];
  if (!baseUrl) {
    return res.status(404).json({
      error: `No bridge URL configured for ${machine}`,
      hint: `Set BRIDGE_${machine.replace('-', '')} in Vercel env vars`,
    });
  }

  try {
    const r = await fetch(`${baseUrl}${endpoint}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(8000),
    });

    const data = await r.json().catch(() => ({}));
    res.status(r.status).json(data);
  } catch (err) {
    res.status(502).json({ error: `Bridge unreachable: ${err.message}`, machine });
  }
}
