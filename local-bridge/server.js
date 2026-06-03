/**
 * SECRETARY — Local Bridge v2
 * Handles file operations, PowerShell commands, and system info.
 * Run: node server.js  |  Or double-click start.bat
 */

import http from 'http';
import { exec, execSync } from 'child_process';
import os from 'os';
import fs from 'fs';
import path from 'path';

const PORT = 7474;
const ALLOWED_ORIGIN = 'https://secretary-app-dun.vercel.app';

// Commands/paths that are never allowed
const BLOCKED = ['rm -rf', 'format', 'del /f /s', 'Remove-Item -Recurse -Force C:\\', 'shutdown', 'reg delete'];

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

function isSafe(cmd) {
  const lower = cmd.toLowerCase();
  return !BLOCKED.some(b => lower.includes(b.toLowerCase()));
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', d => body += d);
    req.on('end', () => { try { resolve(JSON.parse(body)); } catch { resolve({}); } });
    req.on('error', reject);
  });
}

function openPath(filePath) {
  return new Promise(resolve => {
    const cmd = process.platform === 'win32'
      ? `explorer.exe "${filePath}"`
      : process.platform === 'darwin' ? `open "${filePath}"` : `xdg-open "${filePath}"`;
    exec(cmd, err => resolve({ ok: !err, error: err?.message }));
  });
}

function openUrl(url) {
  return new Promise(resolve => {
    const cmd = process.platform === 'win32'
      ? `start "" "${url}"`
      : process.platform === 'darwin' ? `open "${url}"` : `xdg-open "${url}"`;
    exec(cmd, err => resolve({ ok: !err, error: err?.message }));
  });
}

function runPowerShell(command) {
  return new Promise(resolve => {
    if (!isSafe(command)) {
      return resolve({ ok: false, error: 'Command blocked by safety filter' });
    }
    exec(
      `powershell.exe -NonInteractive -NoProfile -Command "${command.replace(/"/g, '\\"')}"`,
      { timeout: 15000, maxBuffer: 1024 * 1024 },
      (err, stdout, stderr) => {
        resolve({
          ok: !err,
          stdout: stdout?.trim(),
          stderr: stderr?.trim(),
          error: err?.message,
        });
      }
    );
  });
}

function getDiskInfo() {
  return new Promise(resolve => {
    if (process.platform === 'win32') {
      exec('wmic logicaldisk get caption,freespace,size /format:csv', (err, stdout) => {
        if (err) return resolve([]);
        const lines = stdout.trim().split('\n').slice(2).filter(Boolean);
        resolve(lines.map(line => {
          const [, caption, free, size] = line.split(',');
          return { drive: caption?.trim(), free: parseInt(free) || 0, total: parseInt(size) || 0 };
        }).filter(d => d.drive && d.total > 0));
      });
    } else {
      exec("df -k / /home 2>/dev/null", (err, stdout) => {
        if (err) return resolve([]);
        resolve(stdout.trim().split('\n').slice(1).map(line => {
          const p = line.split(/\s+/);
          return { drive: p[5], free: parseInt(p[3]) * 1024, total: parseInt(p[1]) * 1024 };
        }));
      });
    }
  });
}

function listDir(dirPath) {
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    return entries.slice(0, 200).map(e => ({
      name: e.name,
      type: e.isDirectory() ? 'dir' : 'file',
      path: path.join(dirPath, e.name),
      ext: e.isFile() ? path.extname(e.name).toLowerCase() : null,
    }));
  } catch (err) {
    return { error: err.message };
  }
}

function readFile(filePath) {
  try {
    const stat = fs.statSync(filePath);
    if (stat.size > 500 * 1024) return { error: 'File too large to read (>500KB)' };
    const content = fs.readFileSync(filePath, 'utf8');
    return { content, size: stat.size };
  } catch (err) {
    return { error: err.message };
  }
}

function writeFile(filePath, content) {
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content, 'utf8');
    return { ok: true, path: filePath };
  } catch (err) {
    return { error: err.message };
  }
}

// ── Server ────────────────────────────────────────────────────────────────

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') { cors(res); res.writeHead(204); return res.end(); }

  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (req.method === 'GET' && url.pathname === '/status') {
    const disks = await getDiskInfo();
    return json(res, {
      hostname: os.hostname(),
      platform: os.platform(),
      uptime: Math.round(os.uptime()),
      memory: { free: os.freemem(), total: os.totalmem() },
      disks,
      user: os.userInfo().username,
      version: 2,
    });
  }

  if (req.method === 'POST' && url.pathname === '/open') {
    const body = await parseBody(req);
    if (!body.path) return json(res, { error: 'path required' }, 400);
    return json(res, await openPath(body.path));
  }

  if (req.method === 'POST' && url.pathname === '/url') {
    const body = await parseBody(req);
    if (!body.url) return json(res, { error: 'url required' }, 400);
    return json(res, await openUrl(body.url));
  }

  if (req.method === 'POST' && url.pathname === '/run') {
    const body = await parseBody(req);
    if (!body.command) return json(res, { error: 'command required' }, 400);
    return json(res, await runPowerShell(body.command));
  }

  if (req.method === 'GET' && url.pathname === '/ls') {
    const dirPath = url.searchParams.get('path') || os.homedir();
    return json(res, { path: dirPath, entries: listDir(dirPath) });
  }

  if (req.method === 'GET' && url.pathname === '/read') {
    const filePath = url.searchParams.get('path');
    if (!filePath) return json(res, { error: 'path required' }, 400);
    return json(res, readFile(filePath));
  }

  // GET /screenshot — capture the screen as base64 PNG
  if (req.method === 'GET' && url.pathname === '/screenshot') {
    if (process.platform !== 'win32') {
      return json(res, { error: 'Screenshots only supported on Windows' });
    }
    const ps = `
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$screen = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
$bmp = New-Object System.Drawing.Bitmap($screen.Width, $screen.Height)
$gfx = [System.Drawing.Graphics]::FromImage($bmp)
$gfx.CopyFromScreen($screen.Location, [System.Drawing.Point]::Empty, $screen.Size)
$ms = New-Object System.IO.MemoryStream
$bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
$bytes = $ms.ToArray()
[System.Convert]::ToBase64String($bytes)
    `.trim();
    return new Promise(resolve => {
      exec(`powershell.exe -NonInteractive -NoProfile -Command "${ps.replace(/\n/g,' ').replace(/"/g,'\\"')}"`,
        { maxBuffer: 10 * 1024 * 1024, timeout: 15000 },
        (err, stdout) => {
          if (err) return resolve(json(res, { error: err.message }));
          resolve(json(res, { image: stdout.trim(), mediaType: 'image/png' }));
        }
      );
    });
  }

  if (req.method === 'POST' && url.pathname === '/write') {
    const body = await parseBody(req);
    if (!body.path || body.content === undefined) return json(res, { error: 'path and content required' }, 400);
    return json(res, writeFile(body.path, body.content));
  }

  json(res, { error: 'not found' }, 404);
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`
╔══════════════════════════════════════════╗
║   SECRETARY — Local Bridge v2            ║
║   http://localhost:${PORT}                  ║
║   Machine: ${os.hostname().padEnd(28)}║
╠══════════════════════════════════════════╣
║   Endpoints:                             ║
║   GET  /status     — system info         ║
║   POST /open       — open file/folder    ║
║   POST /url        — open URL            ║
║   POST /run        — run PowerShell      ║
║   GET  /ls?path=   — list directory      ║
║   GET  /read?path= — read file           ║
║   POST /write      — write file          ║
╚══════════════════════════════════════════╝
  `);
});

process.on('SIGINT', () => { console.log('\nBridge stopped.'); process.exit(0); });
