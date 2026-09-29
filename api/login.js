import { safeEqual, createSessionCookie, clearSessionCookie } from './_session.js';

// POST   /api/login  { password } -> sets session cookie
// DELETE /api/login               -> clears session cookie (logout)
export default async function handler(req, res) {
  if (req.method === 'DELETE') {
    res.setHeader('Set-Cookie', clearSessionCookie());
    return res.json({ ok: true });
  }
  if (req.method !== 'POST') return res.status(405).end();

  const expected = process.env.APP_PASSWORD;
  if (!expected) return res.status(503).json({ error: 'AUTH_NOT_CONFIGURED', hint: 'Set APP_PASSWORD' });

  const { password } = req.body || {};
  if (typeof password !== 'string' || !safeEqual(password, expected)) {
    // Slow down guessing; serverless has no shared state for real rate limiting.
    await new Promise(r => setTimeout(r, 1000));
    return res.status(401).json({ error: 'INVALID_PASSWORD' });
  }

  res.setHeader('Set-Cookie', createSessionCookie(req));
  res.json({ ok: true });
}
