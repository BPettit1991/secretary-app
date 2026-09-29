/**
 * App-level authentication for all /api routes.
 * Underscore prefix: Vercel does not expose this file as a route.
 *
 * Two ways in:
 *   1. Browser: POST /api/login with APP_PASSWORD -> signed HttpOnly cookie.
 *   2. Non-browser clients (phone app): Authorization: Bearer <APP_API_TOKEN>.
 *
 * Fails closed: if neither APP_PASSWORD nor APP_API_TOKEN is set, every
 * protected route returns 503.
 */
import { createHash, createHmac, timingSafeEqual } from 'crypto';
import { parseCookies } from './auth.js';

export const SESSION_COOKIE = 'sec_session';
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 days, in seconds

function sessionKey() {
  const { APP_SESSION_SECRET, APP_PASSWORD } = process.env;
  if (APP_SESSION_SECRET) return APP_SESSION_SECRET;
  // Derived from the password so changing the password invalidates sessions.
  if (APP_PASSWORD) return createHash('sha256').update(`session:${APP_PASSWORD}`).digest('hex');
  return null;
}

// Constant-time compare for strings of any length.
export function safeEqual(a, b) {
  const ha = createHash('sha256').update(String(a)).digest();
  const hb = createHash('sha256').update(String(b)).digest();
  return timingSafeEqual(ha, hb);
}

function sign(value, key) {
  return createHmac('sha256', key).update(value).digest('base64url');
}

export function createSessionCookie(req) {
  const key = sessionKey();
  const exp = String(Math.floor(Date.now() / 1000) + SESSION_MAX_AGE);
  const value = `${exp}.${sign(exp, key)}`;
  const isHttps = req.headers['x-forwarded-proto'] === 'https' || req.connection?.encrypted;
  const secure = isHttps ? '; Secure' : '';
  return `${SESSION_COOKIE}=${value}; HttpOnly${secure}; SameSite=Strict; Path=/; Max-Age=${SESSION_MAX_AGE}`;
}

export function clearSessionCookie() {
  return `${SESSION_COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`;
}

function validSession(req) {
  const key = sessionKey();
  if (!key) return false;
  const raw = parseCookies(req)[SESSION_COOKIE];
  if (!raw) return false;
  const [exp, sig] = raw.split('.');
  if (!exp || !sig) return false;
  if (!/^\d+$/.test(exp) || Number(exp) < Date.now() / 1000) return false;
  return safeEqual(sig, sign(exp, key));
}

function validBearer(req) {
  const token = process.env.APP_API_TOKEN;
  if (!token) return false;
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) return false;
  return safeEqual(header.slice(7), token);
}

export function authConfigured() {
  return Boolean(process.env.APP_PASSWORD || process.env.APP_API_TOKEN);
}

/**
 * Returns true if the request is authenticated. Otherwise sends the error
 * response and returns false. Usage: `if (!requireAuth(req, res)) return;`
 */
export function requireAuth(req, res) {
  if (!authConfigured()) {
    res.status(503).json({ error: 'AUTH_NOT_CONFIGURED', hint: 'Set APP_PASSWORD (and optionally APP_API_TOKEN)' });
    return false;
  }
  if (validBearer(req) || validSession(req)) return true;
  res.status(401).json({ error: 'UNAUTHORIZED' });
  return false;
}
