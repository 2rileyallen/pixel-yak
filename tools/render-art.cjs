#!/usr/bin/env node
// tools/render-art.cjs — render a game's art to PNG (or ICO) headless: one pose, an animation strip,
// every pose, or a small composition of several sprites (promo art, icons, a README picture).
// The art comes through the game's own registry (games/<id>/assets.js), so the user's Pixel Yak edits
// are included unless --raw.
//   node tools/render-art.cjs <game> <asset> [pose|anim|all] [--scale 8] [--out x.png] [--raw] [--gap 1] [--bg #hex]
//   node tools/render-art.cjs <game> --compose <file.json> [--scale 4] [--out x.png|x.ico]
// Without a pose it draws the asset's default animation. --out defaults to scratch/art/<game>-<asset>.png.
// An .ico out holds the picture at 1×, 2×, 4× and 8× its size, up to 256 px (app icons).
// Compose file: { "w": 160, "h": 90, "bg": "#hex"?, "layers": [
//   { "asset": "sky", "pose": "day", "x": 0, "y": 0 },                        top-left at x, y
//   { "asset": "ground", "pose": "meadow", "x": 0, "y": 72, "repeat": [10, 2] }, tiled 10 across, 2 down
//   { "asset": "yak", "pose": "walk_1", "x": 80, "y": 71, "anchor": true, "flip": false } ] }   anchor at x, y
// Run with node; it starts Electron by itself (no window is shown).
const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..');

if (!process.versions.electron) {
  const { spawnSync } = require('child_process');
  const r = spawnSync(require('electron'), [__filename, ...process.argv.slice(2)], { stdio: 'inherit' });
  process.exit(r.status ?? 1);
}

const { app, BrowserWindow } = require('electron');
const argv = process.argv.slice(process.argv.findIndex((a) => a.endsWith('render-art.cjs')) + 1);
const opt = {}, pos = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--raw') opt.raw = true;
  else if (a.startsWith('--')) opt[a.slice(2)] = argv[++i];
  else pos.push(a);
}
const [game, asset, pose] = pos;
const usage = 'usage: node tools/render-art.cjs <game> <asset> [pose|anim|all] [--scale N] [--out x.png] [--raw]\n   or: node tools/render-art.cjs <game> --compose <file.json> [--scale N] [--out x.png|x.ico]';

// A 32-bit BMP icon entry (BITMAPINFOHEADER, BGRA rows bottom-up, then the 1-bit transparency mask):
// what every Windows reader understands below 256 px.
function bmpEntry(w, h, rgba) {
  const maskRow = Math.ceil(w / 32) * 4;
  const buf = Buffer.alloc(40 + w * h * 4 + maskRow * h);
  buf.writeUInt32LE(40, 0); buf.writeInt32LE(w, 4); buf.writeInt32LE(h * 2, 8);
  buf.writeUInt16LE(1, 12); buf.writeUInt16LE(32, 14); buf.writeUInt32LE(w * h * 4 + maskRow * h, 20);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const src = (y * w + x) * 4, dst = 40 + ((h - 1 - y) * w + x) * 4;
    buf[dst] = rgba[src + 2]; buf[dst + 1] = rgba[src + 1]; buf[dst + 2] = rgba[src]; buf[dst + 3] = rgba[src + 3];
    if (!rgba[src + 3]) buf[40 + w * h * 4 + (h - 1 - y) * maskRow + (x >> 3)] |= 0x80 >> (x & 7);
  }
  return buf;
}

function ico(pngs) {
  // ICONDIR + one ICONDIRENTRY per picture: 256 px as PNG, smaller ones as BMP.
  const head = Buffer.alloc(6 + 16 * pngs.length);
  head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(pngs.length, 4);
  let offset = head.length;
  pngs.forEach(({ w, h, buf }, i) => {
    const e = 6 + 16 * i;
    head.writeUInt8(w >= 256 ? 0 : w, e); head.writeUInt8(h >= 256 ? 0 : h, e + 1);
    head.writeUInt16LE(1, e + 4); head.writeUInt16LE(32, e + 6);
    head.writeUInt32LE(buf.length, e + 8); head.writeUInt32LE(offset, e + 12);
    offset += buf.length;
  });
  return Buffer.concat([head, ...pngs.map((p) => p.buf)]);
}

app.whenReady().then(async () => {
  const fail = (msg) => { console.error(`render-art: ${msg}`); app.exit(1); };
  if (!game || !/^[a-z0-9][a-z0-9-]{0,47}$/.test(game) || (!asset && !opt.compose)) return fail(usage);
  if (!fs.existsSync(path.join(ROOT, 'games', game, 'assets.js'))) return fail(`no games/${game}/assets.js`);
  let job;
  if (opt.compose) {
    try { job = { compose: JSON.parse(fs.readFileSync(path.resolve(opt.compose), 'utf8')) }; } catch (err) { return fail(`can't read ${opt.compose}: ${err.message}`); }
  } else job = { asset, pose: pose || null, raw: !!opt.raw, gap: Math.max(0, Number(opt.gap ?? 1) | 0), bg: opt.bg || null };
  const out = path.resolve(opt.out || path.join(ROOT, 'scratch', 'art', `${game}-${opt.compose ? path.basename(opt.compose, '.json') : asset}.png`));
  const scale = Math.max(1, Math.min(32, Number(opt.scale) || (out.endsWith('.ico') ? 1 : 4)));

  const logs = [];
  const win = new BrowserWindow({ width: 400, height: 300, show: false, webPreferences: { offscreen: true } });
  win.webContents.on('console-message', (e) => { if ((e.level === 'error' || e.level === 'warning') && !/Security Warning/.test(e.message)) logs.push(e.message); });
  await win.loadFile(path.join(__dirname, 'render-art.html'), { search: `game=${game}` });
  const ask = (s) => win.webContents.executeJavaScript(`window.renderArt(${JSON.stringify({ ...job, scale: s, rgba: out.endsWith('.ico') })})`);
  try {
    for (let t = 0; t < 100 && !(await win.webContents.executeJavaScript('!!window.renderArt')); t++) await new Promise((r) => setTimeout(r, 50));
    fs.mkdirSync(path.dirname(out), { recursive: true });
    let r;
    if (out.endsWith('.ico')) {
      const pngs = [];
      for (const s of [1, 2, 4, 8].map((k) => k * scale)) {
        r = await ask(s);
        if (r.error) break;
        if (r.w > 256 || r.h > 256) break;
        pngs.push({ w: r.w, h: r.h, buf: r.w >= 256 ? Buffer.from(r.png, 'base64') : bmpEntry(r.w, r.h, Buffer.from(r.rgba, 'base64')) });
      }
      if (!pngs.length) return fail(r && r.error ? r.error : 'the picture is bigger than 256 px at 1×');
      fs.writeFileSync(out, ico(pngs));
      console.log(`wrote ${path.relative(ROOT, out)} (${pngs.map((p) => p.w + '×' + p.h).join(', ')})`);
    } else {
      r = await ask(scale);
      if (r.error) return fail(r.error);
      fs.writeFileSync(out, Buffer.from(r.png, 'base64'));
      console.log(`wrote ${path.relative(ROOT, out)} (${r.w}×${r.h}${r.frames ? `, ${r.frames.join(' ')}` : ''})`);
    }
    for (const l of logs) console.log(`  console: ${l}`);
    app.exit(0);
  } catch (err) { fail(err.message); }
});
