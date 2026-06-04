/**
 * Server-side token store.
 * Persists the Microsoft refresh token to disk so all devices
 * share a single login — no per-device authentication needed.
 */
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TOKEN_FILE = join(__dirname, '..', '.ms_token');

export function getStoredToken() {
  // 1. Check disk store (set after first login)
  if (existsSync(TOKEN_FILE)) {
    try {
      const data = JSON.parse(readFileSync(TOKEN_FILE, 'utf8'));
      if (data.refresh_token) return data.refresh_token;
    } catch {}
  }
  // 2. Fall back to env var (manually set)
  return process.env.MS_REFRESH_TOKEN || null;
}

export function saveToken(refreshToken) {
  try {
    writeFileSync(TOKEN_FILE, JSON.stringify({
      refresh_token: refreshToken,
      updated: new Date().toISOString(),
    }), 'utf8');
  } catch (e) {
    console.warn('Could not save token to disk:', e.message);
  }
}
