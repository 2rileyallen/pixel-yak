// tools/capture.cjs — headless screenshot of any repo page (the look-at-your-work loop).
//   electron tools/capture.cjs <page relative to the repo>[?query] <out.png> [w] [h] [waitMs] [--full] [--pages=<maxH>]
// Waits until the page sets window.__ready (or waitMs), then saves the PNG and the page's
// console next to it (<out>.console.txt). --full grows the window to the page height first.
// --pages=<maxH> is for pages that split themselves (editor/sheet.html ?paged=): every page
// (≤ maxH px tall) is saved as <out>-1.png, <out>-2.png, … and "PAGEFILES <n>" is printed.
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..');
const CAP = 16000; // the tallest offscreen capture Chromium does reliably
const args = process.argv.slice(process.argv.findIndex((a) => a.endsWith('capture.cjs')) + 1).filter((a) => !a.startsWith('--inspect'));
const full = args.includes('--full');
const pagesArg = args.find((a) => a.startsWith('--pages='));
const pagesMax = pagesArg ? Math.max(400, Math.min(CAP, Number(pagesArg.slice(8)) || 4000)) : 0;
const [page, out, w = '1280', h = '900', waitMs = '1500'] = args.filter((a) => !a.startsWith('--'));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
app.whenReady().then(async () => {
  if (!page || !out) { console.error('usage: electron tools/capture.cjs <page> <out.png> [w] [h] [waitMs] [--full] [--pages=<maxH>]'); app.exit(2); return; }
  const outFile = path.resolve(out);
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  const logs = [];
  const win = new BrowserWindow({ width: +w, height: +h, show: false, useContentSize: true, webPreferences: { offscreen: true, backgroundThrottling: false } });
  win.webContents.on('console-message', (e) => { if (!/Security Warning|willReadFrequently/.test(e.message)) logs.push(`[${e.level}] ${e.message}`); });
  const [file, query0] = page.split('?');
  const query = pagesMax ? `${query0 ? query0 + '&' : ''}paged=${pagesMax}` : query0;
  try { await win.loadFile(path.join(ROOT, file), query ? { search: query } : undefined); }
  catch (err) { fs.writeFileSync(outFile.replace(/\.png$/, '.console.txt'), `[load-error] ${err.message}`); app.exit(1); return; }
  const js = (s, fallback) => win.webContents.executeJavaScript(s).catch(() => fallback);
  const waitReady = async () => {
    const t0 = Date.now();
    while (Date.now() - t0 < +waitMs) {
      if (await js('!!window.__ready', false)) break;
      await wait(100);
    }
  };
  // Offscreen canvases go blank when the window is resized after drawing, so grow the window
  // first, then reload and let the page draw again at the final size.
  const growAndReload = async (height) => {
    win.setContentSize(+w, height);
    await win.webContents.reloadIgnoringCache();
    await new Promise((r) => win.webContents.once('did-finish-load', r));
    await waitReady();
    await wait(200);
  };
  await waitReady();
  if (pagesMax) {
    const heights = await js('window.__pages || null', null);
    if (!heights || !heights.length) {
      fs.writeFileSync(outFile.replace(/\.png$/, '.console.txt'), [...logs, '[capture] the page did not split itself (no window.__pages)'].join('\n'));
      app.exit(1);
      return;
    }
    const H = Math.min(CAP, Math.max(+h, ...heights));
    await growAndReload(H);
    const n = (await js('(window.__pages || []).length', 0)) || heights.length;
    const base = outFile.replace(/\.png$/, '');
    for (let i = 0; i < n; i++) {
      const ph = Math.min(H, await js(`window.__showPage(${i})`, H));
      await wait(120);
      const img = await win.webContents.capturePage({ x: 0, y: 0, width: +w, height: ph });
      fs.writeFileSync(`${base}-${i + 1}.png`, img.toPNG());
    }
    fs.writeFileSync(`${base}.console.txt`, logs.join('\n') || '(no console output)');
    console.log(`PAGEFILES ${n}`);
    app.exit(0);
    return;
  }
  if (full) {
    const ph = await js('Math.ceil(document.documentElement.scrollHeight)', +h);
    await growAndReload(Math.min(Math.max(+h, ph), CAP));
  }
  const img = await win.webContents.capturePage();
  fs.writeFileSync(outFile, img.toPNG());
  fs.writeFileSync(outFile.replace(/\.png$/, '.console.txt'), logs.join('\n') || '(no console output)');
  app.exit(0);
});
