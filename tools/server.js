// server/server.js — read-only static server for playing the games in a normal browser
// (`npm run web`, then http://127.0.0.1:8080/projects/tdg/game/). Pixel Yak itself is the
// desktop app (electron/), which never uses this server.
//
// Hardened 2026-10-22 (see docs/REPO-REVIEW-2026-10-22.md): listens on 127.0.0.1 only, serves GET/
// HEAD only, no write APIs, no CORS headers, every path contained in the repo, dot-folders and
// node_modules (except three.js) refused.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT) || 8080;
const HOST = '127.0.0.1';

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.css': 'text/css; charset=utf-8', '.md': 'text/markdown; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8',
};

function resolveSafe(urlPath) {
  let rel;
  try { rel = decodeURIComponent(urlPath); } catch { return null; }
  if (rel.includes('\0')) return null;
  const parts = rel.split('/').filter(Boolean);
  if (parts.some((p) => p.startsWith('.') || p.includes('\\'))) return null;
  if (parts[0] === 'node_modules' && parts[1] !== 'three') return null;
  const abs = path.resolve(ROOT, ...parts);
  const back = path.relative(ROOT, abs);
  if (back.startsWith('..') || path.isAbsolute(back)) return null;
  return abs;
}

const server = http.createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405, { Allow: 'GET, HEAD' }); res.end(); return; }
  const url = new URL(req.url, `http://${HOST}`);
  if (url.pathname === '/') { res.writeHead(302, { Location: '/projects/' }); res.end(); return; }
  let abs = resolveSafe(url.pathname);
  if (!abs) { res.writeHead(403); res.end('Forbidden'); return; }
  fs.stat(abs, (err, st) => {
    if (!err && st.isDirectory()) {
      const index = path.join(abs, 'index.html');
      if (fs.existsSync(index)) { abs = index; }
      else if (url.pathname.replace(/\/$/, '') === '/projects') {
        // tiny index of playable games
        const games = fs.readdirSync(abs, { withFileTypes: true }).filter((d) => d.isDirectory() && fs.existsSync(path.join(abs, d.name, 'game', 'index.html')));
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`<!doctype html><meta charset="utf-8"><title>Games</title><body style="font:14px system-ui;background:#0d0f1d;color:#e7e9f3;padding:24px"><h1>Games</h1><ul>${games.map((d) => `<li><a style="color:#f4c443" href="/projects/${encodeURIComponent(d.name)}/game/">${d.name}</a></li>`).join('')}</ul>`);
        return;
      } else { res.writeHead(404); res.end('Not found'); return; }
    } else if (err) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(abs).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    if (req.method === 'HEAD') { res.end(); return; }
    fs.createReadStream(abs).pipe(res);
  });
});

server.listen(PORT, HOST, () => {
  console.log(`[web] read-only, local only: http://${HOST}:${PORT}/projects/`);
});
