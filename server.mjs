/**
 * SECRETARY — Self-hosted Express server
 * Serves the frontend + all API routes from a single process.
 * Runs on Proxmox CT 112 at 192.168.0.20
 */

import express from 'express';
import { createServer } from 'http';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import cookieParser from 'cookie-parser';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(cookieParser());

// ── API routes ──────────────────────────────────────────────────────────────
// Wrap Vercel-style handlers into Express middleware
function vercelHandler(handler) {
  return async (req, res) => {
    // Add Vercel-compatible helpers
    if (!res.json) res.json = (data) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(data)); };
    if (!res.redirect) res.redirect = (url) => { res.writeHead(302, { Location: url }); res.end(); };
    await handler(req, res);
  };
}

// Dynamically load API modules
const apis = ['data', 'chat', 'setup', 'poll', 'suggestions', 'bridge-proxy'];
for (const name of apis) {
  try {
    const mod = await import(`./api/${name}.js`);
    const handler = mod.default;
    app.all(`/api/${name}`, vercelHandler(handler));
    console.log(`  ✓ /api/${name}`);
  } catch (e) {
    console.warn(`  ✗ /api/${name}: ${e.message}`);
  }
}

// OAuth callback (for device code poll)
try {
  const mod = await import('./api/auth.js');
  app.get('/api/auth-status', (req, res) => {
    res.json({ ok: true, version: 'self-hosted' });
  });
} catch (e) {}

// ── Static frontend ─────────────────────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(join(__dirname, 'index.html'));
});

// ── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
  console.log(`
╔══════════════════════════════════════════════╗
║   SECRETARY — Self-hosted                    ║
║   http://192.168.0.20:${PORT}                   ║
║   Proxmox CT 112                             ║
╚══════════════════════════════════════════════╝
  `);
});
