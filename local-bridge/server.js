/**
 * SECRETARY — Local Bridge
 * Runs on each machine (MAIN-LAP, BLACKBETTY, etc.)
 * Lets the web app open files, folders, and URLs on this machine.
 *
 * Start: node server.js
 * Or double-click: start.bat
 */

import http from 'http';
import { exec } from 'child_process';
import os from 'os';
import fs from 'fs';
import path from 'path';

const PORT = 7474;
const ALLOWED_ORIGIN = 'https://secretary-app-dun.vercel.app';

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function json(res, data, status = 200) {
  cors(res);
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function openPath(filePath) {
  return new Promise((resolve) => {
    // Windows: explorer.exe, Mac: open, Linux: xdg-open
    const cmd = process.platform === 'win32'
      ? `explorer.exe "${filePath}"`
      : process.platform === 'darwin'
        ? `open "${filePath}"`
        : `xdg-open "${filePath}"`;
    exec(cmd, (err) => resolve({ ok: !err, error: err?.message }));
  });
}

function openUrl(url) {
  return new Promise((resolve) => {
    const cmd = process.platform === 'win32'
      ? `start "" "${url}"`
      : process.platform === 'darwin'
        ? `open "${url}"`
        : `xdg-open "${url}"`;
    exec(cmd, (err) => resolve({ ok: !err, error: err?.message }));
  });
}

function getDiskInfo() {
  return new Promise((resolve) => {
    if (process.platform === 'win32') {
      exec('wmic logicaldisk get caption,freespace,size /format:csv', (err, stdout) => {
        if (err) return resolve([]);
        const lines = stdout.trim().split('\n').slice(2).filter(Boolean);
        const disks = lines.map(line => {
          const [, caption, free, size] = line.split(',');
          return {
            drive: caption?.trim(),
            free: parseInt(free?.trim()) || 0,
            total: parseInt(size?.trim()) || 0,
          };
        }).filter(d => d.drive && d.total > 0);
        resolve(disks);
      });
    } else {
      exec('df -k /', (err, stdout) => {
        if (err) return resolve([]);
        const lines = stdout.trim().split('\n').slice(1);
        const disks = lines.map(line => {
          const parts = line.split(/\s+/);
          return { drive: parts[5], free: parseInt(parts[3]) * 1024, total: parseInt(parts[1]) * 1024 };
        });
        resolve(disks);
      });
    }
  });
}

function listDir(dirPath) {
  return new Promise((resolve) => {
    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });
      resolve(entries.slice(0, 100).map(e => ({
        name: e.name,
        type: e.isDirectory() ? 'dir' : 'file',
        path: path.join(dirPath, e.name),
      })));
    } catch (err) {
      resolve({ error: err.message });
    }
  });
}

const server = http.createServer(async (req, res) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    cors(res);
    res.writeHead(204);
    return res.end();
  }

  const url = new URL(req.url, `http://localhost:${PORT}`);

  // GET /status — machine info
  if (req.method === 'GET' && url.pathname === '/status') {
    const disks = await getDiskInfo();
    return json(res, {
      hostname: os.hostname(),
      platform: os.platform(),
      arch: os.arch(),
      uptime: os.uptime(),
      memory: { free: os.freemem(), total: os.totalmem() },
      disks,
      user: os.userInfo().username,
    });
  }

  // POST /open — open a file or folder
  if (req.method === 'POST' && url.pathname === '/open') {
    let body = '';
    req.on('data', d => body += d);
    req.on('end', async () => {
      try {
        const { path: filePath } = JSON.parse(body);
        if (!filePath) return json(res, { error: 'path required' }, 400);
        const result = await openPath(filePath);
        return json(res, result);
      } catch (e) {
        return json(res, { error: e.message }, 400);
      }
    });
    return;
  }

  // POST /url — open a URL in default browser
  if (req.method === 'POST' && url.pathname === '/url') {
    let body = '';
    req.on('data', d => body += d);
    req.on('end', async () => {
      try {
        const { url: targetUrl } = JSON.parse(body);
        if (!targetUrl) return json(res, { error: 'url required' }, 400);
        const result = await openUrl(targetUrl);
        return json(res, result);
      } catch (e) {
        return json(res, { error: e.message }, 400);
      }
    });
    return;
  }

  // GET /ls?path=... — list directory contents
  if (req.method === 'GET' && url.pathname === '/ls') {
    const dirPath = url.searchParams.get('path') || os.homedir();
    const entries = await listDir(dirPath);
    return json(res, { path: dirPath, entries });
  }

  json(res, { error: 'not found' }, 404);
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`
╔══════════════════════════════════════╗
║   SECRETARY — Local Bridge           ║
║   Running on localhost:${PORT}          ║
║   Machine: ${os.hostname().padEnd(26)}║
║   Keep this window open              ║
╚══════════════════════════════════════╝
  `);
});

process.on('SIGINT', () => {
  console.log('\nBridge stopped.');
  process.exit(0);
});
