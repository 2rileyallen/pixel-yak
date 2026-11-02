// studio/ui/js/sheet.js — contact sheet for `node cli/yak.mjs sheet <project>`: every pose
// of every asset, with the user's studio edits applied (gold border = patched, teal = added
// frame). ?raw=1 also shows the AI's original under each edited pose. Loaded via file://.
import { makePalette, applyPatchToCanvas, bakedToCanvas, effectivePoses } from '../../../engine/art/edits.js';

const q = new URLSearchParams(location.search);
const entry = q.get('entry');
const only = q.get('only') ? q.get('only').split(',') : null;
const Z = Math.max(1, Math.min(12, +(q.get('z') || 3)));
const showRaw = q.get('raw') === '1';
const editedOnly = q.get('edited') === '1';
const root = document.getElementById('root');

const scale = (src) => {
  const c = document.createElement('canvas');
  c.width = src.width * Z; c.height = src.height * Z;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.drawImage(src, 0, 0, c.width, c.height);
  return c;
};

try {
  const mod = await import(`../../../${entry}`);
  let EDITS = {};
  if (q.get('edits')) { try { EDITS = (await import(`../../../${q.get('edits')}/index.js`)).EDITS || {}; } catch { /* no edits yet */ } }
  const pal = makePalette(mod.STUDIO && mod.STUDIO.palette);
  for (const a of mod.ASSETS || []) {
    if (a.kind !== 'visual') continue;
    if (only && !only.some((o) => a.id.startsWith(o))) continue;
    const ed = EDITS[a.id];
    if (editedOnly && !ed) continue;
    const raw = (pose) => (typeof a.getRaw === 'function' ? a.getRaw(pose) : a.getCanvas(pose));
    const box = document.createElement('div');
    box.className = 'asset';
    box.dataset.id = a.id;
    box.innerHTML = `<h3>${a.id} <span>${a.name} · ${a.fw}×${a.fh} · ${a.category}</span>${ed ? '<b>user-edited</b>' : ''}</h3>`;
    const row = document.createElement('div');
    row.className = 'row';
    for (const pose of effectivePoses(a.poses, ed)) {
      const pe = ed && ed.poses && ed.poses[pose];
      const cell = document.createElement('div');
      cell.className = `cell${pe ? (a.poses.includes(pose) ? ' edited' : ' added') : ''}`;
      let fin = null, base = null;
      try {
        base = a.poses.includes(pose) ? raw(pose) : null;
        fin = pe ? (pe.mode === 'baked' ? bakedToCanvas(pe, ed.legend || {}, pal, a.fw, a.fh) : applyPatchToCanvas(base, pe, ed.legend || {}, pal)) : base;
      } catch (err) { cell.append(Object.assign(document.createElement('small'), { textContent: `error: ${err.message}` })); }
      if (fin) cell.append(scale(fin));
      if (showRaw && pe && base) {
        const lab = document.createElement('span'); lab.className = 'lab'; lab.textContent = 'AI version';
        const c = scale(base); c.className = 'ai';
        cell.append(lab, c);
      }
      const label = document.createElement('small');
      label.textContent = pe ? `${pose} · ${pe.mode}` : pose;
      cell.append(label);
      row.append(cell);
    }
    box.append(row);
    root.append(box);
  }
  if (!root.children.length) root.innerHTML = '<div class="err">No assets matched.</div>';
  // ?paged=<maxH>: split the assets into pages no taller than maxH (an asset never splits);
  // tools/capture.cjs --pages shows one page at a time with __showPage(i) and captures it.
  if (q.get('paged')) {
    const maxH = Math.max(400, +q.get('paged') || 4000);
    const head = document.createElement('div');
    head.className = 'pagehead';
    document.body.prepend(head);
    const budget = maxH - head.offsetHeight - 4;
    const pages = [];
    let cur = null;
    for (const b of [...root.children]) {
      const hgt = b.offsetHeight;
      if (!cur || (cur.h + hgt > budget && cur.boxes.length)) pages.push((cur = { boxes: [], h: 0 }));
      cur.boxes.push(b);
      cur.h += hgt;
    }
    window.__pages = pages.map((p) => p.h + head.offsetHeight);
    window.__showPage = (i) => {
      pages.forEach((p, j) => p.boxes.forEach((b) => { b.style.display = j === i ? '' : 'none'; }));
      const ids = pages[i].boxes.map((b) => b.dataset.id).filter(Boolean);
      head.textContent = `${q.get('project') || ''} — page ${i + 1} of ${pages.length}${ids.length ? ` · ${ids[0]} … ${ids[ids.length - 1]}` : ''}`;
      return Math.ceil(root.getBoundingClientRect().bottom); // this page's content, not the window
    };
    window.__showPage(0);
    console.log(`PAGES ${pages.length}`);
  }
} catch (err) {
  root.innerHTML = '';
  const d = document.createElement('div'); d.className = 'err'; d.textContent = `Could not load ${entry}:\n${err.stack || err.message}`;
  root.append(d);
  console.error(err.stack || err.message);
}
window.__ready = true;
