// studio/ui/js/canvas-editor.js — the pixel canvas. Paints into a Grid (pixels.js) of color
// indices. Each art pixel is an exact whole number of device pixels at any Windows scaling.
//
// Tools: pencil (pixel-perfect strokes), eraser, fill (Shift = replace color everywhere),
// picker, line (Shift = 45° snap), rect (Shift = filled), shade (lighten; right-click or
// Shift = darken along the material's ramp), select (drag; drag inside to move; Ctrl+C/V/X,
// Del, arrows nudge, Shift+H / Shift+V flip). Mirror-X paints both halves. Alt+click picks.
// Middle-drag or Space+drag pans; the wheel zooms around the cursor.

import { Grid, gridCanvas } from './pixels.js';

const ZOOMS = [1, 2, 3, 4, 5, 6, 8, 10, 12, 14, 16, 20, 24, 28, 32, 40, 48];
const UNDO_MAX = 120;
let clipboard = null; // { w, h, refs: [] } — refs so paste works across assets

export class PixelEditor {
  constructor(stage, cb = {}) {
    this.stage = stage;
    this.cb = cb;
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'view-canvas';
    stage.append(this.canvas);
    this.g = this.canvas.getContext('2d');
    this.frame = null;
    this.tool = 'pencil';
    this.color = 0;
    this.zoom = 8;
    this.pan = { x: 0, y: 0 };
    this.opts = { grid: true, onion: false, diff: false, mirror: false, compare: false, bg: 'checker', pixelPerfect: true };
    this.hover = null;
    this.drag = null;
    this.sel = null;
    this.spaceDown = false;
    this.preview = null; // { points: [[x,y]], v }
    this.raf = 0;
    this.antsT = null;
    this.ro = new ResizeObserver(() => { this.resize(); if (this._fitPending) this.fit(); });
    this.ro.observe(stage);
    this.bind();
    this.resize();
  }

  // ------------------------------------------------------------- frame setup ---
  // frame: { grid, raw (Grid|null), table, ax, ay, undo: [], redo: [], prev, next }
  setFrame(frame, { fit = false } = {}) {
    this.commitFloat(false);
    this.sel = null;
    this.frame = frame;
    this.imgCache = null;
    this.onionCache = null;
    if (fit || !this._fitted) { this._fitted = true; this.fit(); }
    this.invalidate();
  }
  setTool(t) { this.commitFloat(); if (t !== 'select') this.sel = null; this.tool = t; this.updateCursor(); this.invalidate(); }
  setColor(v) { this.color = v; this.invalidate(); }
  setOpt(k, v) { this.opts[k] = v; if (k === 'onion') this.onionCache = null; this.invalidate(); }
  frameChanged() { this.imgCache = null; this.invalidate(); }
  onionChanged() { this.onionCache = null; this.invalidate(); }

  get dpr() { return window.devicePixelRatio || 1; }
  get s() { return Math.max(1, Math.round(this.zoom * this.dpr)); }

  resize() {
    const w = Math.max(1, Math.round(this.stage.clientWidth * this.dpr));
    const h = Math.max(1, Math.round(this.stage.clientHeight * this.dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h; }
    this.invalidate();
  }

  fit() {
    const f = this.frame;
    if (!f) return;
    const vw = this.stage.clientWidth, vh = this.stage.clientHeight;
    if (vw < 20 || vh < 20) { this._fitPending = true; return; }
    this._fitPending = false;
    const g = f.grid;
    let z = ZOOMS[0];
    for (const zz of ZOOMS) if (g.w * zz <= vw * 0.86 && g.h * zz <= vh * 0.84) z = zz;
    this.zoom = z;
    this.center();
  }

  center() {
    const g = this.frame && this.frame.grid;
    if (!g) return;
    this.pan.x = Math.round((this.canvas.width - g.w * this.s) / 2);
    this.pan.y = Math.round((this.canvas.height - g.h * this.s) / 2);
    this.cb.onZoom?.(this.zoom);
    this.invalidate();
  }

  setZoom(z, cx = null, cy = null) {
    z = Math.max(ZOOMS[0], Math.min(ZOOMS[ZOOMS.length - 1], z));
    if (cx == null) { cx = this.canvas.width / 2; cy = this.canvas.height / 2; }
    const s0 = this.s;
    const ax = (cx - this.pan.x) / s0, ay = (cy - this.pan.y) / s0;
    this.zoom = z;
    const s1 = this.s;
    this.pan.x = Math.round(cx - ax * s1);
    this.pan.y = Math.round(cy - ay * s1);
    this.cb.onZoom?.(this.zoom);
    this.invalidate();
  }
  zoomStep(dir, cx, cy) {
    let i = ZOOMS.findIndex((z) => z >= this.zoom);
    if (i < 0) i = ZOOMS.length - 1;
    if (dir > 0) i = ZOOMS[i] > this.zoom ? i : i + 1; else i = i - 1;
    this.setZoom(ZOOMS[Math.max(0, Math.min(ZOOMS.length - 1, i))], cx, cy);
  }

  // ----------------------------------------------------------------- undo ---
  snapshot() {
    const f = this.frame;
    f.undo.push(f.grid.clone());
    if (f.undo.length > UNDO_MAX) f.undo.shift();
    f.redo.length = 0;
  }
  undo() {
    this.commitFloat(false);
    const f = this.frame;
    if (!f || !f.undo.length) return false;
    f.redo.push(f.grid);
    f.grid = f.undo.pop();
    this.sel = null;
    this.changed();
    return true;
  }
  redo() {
    const f = this.frame;
    if (!f || !f.redo.length) return false;
    f.undo.push(f.grid);
    f.grid = f.redo.pop();
    this.changed();
    return true;
  }
  changed() { this.imgCache = null; this.invalidate(); this.cb.onChange?.(); }

  // -------------------------------------------------------------- painting ---
  toArt(e) {
    const r = this.canvas.getBoundingClientRect();
    const dx = (e.clientX - r.left) * this.dpr, dy = (e.clientY - r.top) * this.dpr;
    return { x: Math.floor((dx - this.pan.x) / this.s), y: Math.floor((dy - this.pan.y) / this.s), dx, dy };
  }
  mirrorX(x) { return this.frame.grid.w - 1 - x; }

  put(x, y, v) {
    const g = this.frame.grid;
    if (!g.inside(x, y)) return;
    g.set(x, y, v);
    if (this.opts.mirror) g.set(this.mirrorX(x), y, v);
  }

  shadeValue(v, dir) {
    const t = this.frame.table;
    const ref = t.ref(v);
    if (!Array.isArray(ref)) return v;
    const m = t.pal.byName.get(ref[0]);
    const max = m ? m.ramp.length - 1 : 4;
    const s = Math.max(0, Math.min(max, ref[1] + dir));
    return s === ref[1] ? v : t.idx([ref[0], s]);
  }

  line(x0, y0, x1, y1, fn) {
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      fn(x0, y0);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }

  linePoints(a, b, snap) {
    let { x, y } = b;
    if (snap) {
      const dx = x - a.x, dy = y - a.y, adx = Math.abs(dx), ady = Math.abs(dy);
      if (adx > ady * 2) y = a.y; else if (ady > adx * 2) x = a.x;
      else { const m = Math.max(adx, ady); x = a.x + Math.sign(dx) * m; y = a.y + Math.sign(dy) * m; }
    }
    const pts = [];
    this.line(a.x, a.y, x, y, (px, py) => pts.push([px, py]));
    return pts;
  }

  rectPoints(a, b, filled) {
    const x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x), y0 = Math.min(a.y, b.y), y1 = Math.max(a.y, b.y);
    const pts = [];
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      if (filled || x === x0 || x === x1 || y === y0 || y === y1) pts.push([x, y]);
    }
    return pts;
  }

  flood(x, y, v, global) {
    const g = this.frame.grid;
    if (!g.inside(x, y)) return false;
    const target = g.get(x, y);
    if (target === v) return false;
    if (global) {
      for (let i = 0; i < g.data.length; i++) if (g.data[i] === target) g.data[i] = v;
      return true;
    }
    const stack = [[x, y]];
    const seen = new Uint8Array(g.w * g.h);
    while (stack.length) {
      const [cx, cy] = stack.pop();
      if (!g.inside(cx, cy)) continue;
      const i = cy * g.w + cx;
      if (seen[i] || g.data[i] !== target) continue;
      seen[i] = 1;
      g.data[i] = v;
      if (this.opts.mirror) { const mx = this.mirrorX(cx); if (g.data[cy * g.w + mx] === target) stack.push([mx, cy]); }
      stack.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
    }
    return true;
  }

  // ------------------------------------------------------------- selection ---
  lift() {
    const s = this.sel;
    if (!s || s.float) return;
    this.snapshot();
    const g = this.frame.grid;
    const fl = new Grid(s.w, s.h);
    for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) {
      fl.set(x, y, g.get(s.x + x, s.y + y));
      if (g.inside(s.x + x, s.y + y)) g.set(s.x + x, s.y + y, 0);
    }
    s.float = fl;
    this.imgCache = null;
  }

  commitFloat(notify = true) {
    const s = this.sel;
    if (!s || !s.float || !this.frame) return;
    const g = this.frame.grid;
    for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) {
      const v = s.float.get(x, y);
      if (v) g.set(s.x + x, s.y + y, v);
    }
    s.float = null;
    this.imgCache = null;
    if (notify) this.changed();
  }

  selectAll() { if (!this.frame) return; this.commitFloat(); this.tool = 'select'; this.sel = { x: 0, y: 0, w: this.frame.grid.w, h: this.frame.grid.h, float: null }; this.cb.onTool?.('select'); this.startAnts(); this.invalidate(); }
  deselect() { this.commitFloat(); this.sel = null; this.stopAnts(); this.invalidate(); }

  copy(cut = false) {
    const f = this.frame;
    if (!f) return;
    const s = this.sel || { x: 0, y: 0, w: f.grid.w, h: f.grid.h };
    const src = s.float || null;
    const refs = [];
    for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) {
      const v = src ? src.get(x, y) : f.grid.get(s.x + x, s.y + y);
      refs.push(v ? f.table.ref(v) : null);
    }
    clipboard = { w: s.w, h: s.h, refs };
    if (cut && this.sel) { this.lift(); this.sel.float = null; this.sel = null; this.changed(); }
  }

  paste() {
    const f = this.frame;
    if (!f || !clipboard) return false;
    this.commitFloat();
    this.snapshot();
    const fl = new Grid(clipboard.w, clipboard.h);
    clipboard.refs.forEach((r, i) => { if (r) fl.data[i] = f.table.idx(r); });
    const x = this.sel ? this.sel.x : 0, y = this.sel ? this.sel.y : 0;
    this.sel = { x, y, w: fl.w, h: fl.h, float: fl };
    this.tool = 'select';
    this.cb.onTool?.('select');
    this.startAnts();
    this.invalidate();
    return true;
  }

  deleteSel() {
    if (!this.sel) return;
    if (this.sel.float) { this.sel.float = null; this.sel = null; this.changed(); return; }
    this.snapshot();
    const s = this.sel, g = this.frame.grid;
    for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) if (g.inside(s.x + x, s.y + y)) g.set(s.x + x, s.y + y, 0);
    this.changed();
  }

  nudge(dx, dy) {
    if (!this.sel) return false;
    this.lift();
    this.sel.x += dx; this.sel.y += dy;
    this.invalidate();
    return true;
  }

  flip(axis) {
    const f = this.frame;
    if (!f) return;
    if (this.sel) this.lift(); else this.snapshot();
    const src = this.sel ? this.sel.float : f.grid;
    const out = new Grid(src.w, src.h);
    for (let y = 0; y < src.h; y++) for (let x = 0; x < src.w; x++) {
      out.set(axis === 'h' ? src.w - 1 - x : x, axis === 'v' ? src.h - 1 - y : y, src.get(x, y));
    }
    if (this.sel) { this.sel.float = out; this.invalidate(); } else { f.grid.data.set(out.data); this.changed(); }
  }

  startAnts() { if (!this.antsT) this.antsT = setInterval(() => this.invalidate(), 140); }
  stopAnts() { clearInterval(this.antsT); this.antsT = null; }

  // ---------------------------------------------------------------- events ---
  bind() {
    const c = this.canvas;
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    c.addEventListener('pointerdown', (e) => this.down(e));
    c.addEventListener('pointermove', (e) => this.move(e));
    c.addEventListener('pointerup', (e) => this.up(e));
    c.addEventListener('pointercancel', (e) => this.up(e));
    c.addEventListener('pointerleave', () => { this.hover = null; this.cb.onHover?.(null); this.invalidate(); });
    c.addEventListener('wheel', (e) => {
      e.preventDefault();
      const r = this.canvas.getBoundingClientRect();
      const cx = (e.clientX - r.left) * this.dpr, cy = (e.clientY - r.top) * this.dpr;
      if (e.shiftKey && !e.ctrlKey) { this.pan.x -= Math.sign(e.deltaY) * 40 * this.dpr; this.invalidate(); return; }
      this.zoomStep(e.deltaY < 0 ? 1 : -1, cx, cy);
    }, { passive: false });
    window.addEventListener('keydown', (e) => { if (e.code === 'Space' && !isField(e.target)) { this.spaceDown = true; this.updateCursor(); } });
    window.addEventListener('keyup', (e) => { if (e.code === 'Space') { this.spaceDown = false; this.updateCursor(); } });
    window.addEventListener('blur', () => { this.spaceDown = false; this.updateCursor(); });
  }

  updateCursor() {
    const t = this.spaceDown ? 'grab' : { picker: 'copy', select: 'crosshair' }[this.tool] || 'crosshair';
    this.canvas.style.cursor = t;
  }

  down(e) {
    if (!this.frame) return;
    try { this.canvas.setPointerCapture(e.pointerId); } catch { /* synthetic or stale pointer */ }
    const p = this.toArt(e);
    if (e.button === 1 || this.spaceDown) { this.drag = { mode: 'pan', sx: p.dx, sy: p.dy, px: this.pan.x, py: this.pan.y }; this.canvas.style.cursor = 'grabbing'; return; }
    if (this.opts.compare) return;
    const g = this.frame.grid;
    const right = e.button === 2;
    if (e.altKey || this.tool === 'picker') {
      if (g.inside(p.x, p.y)) this.cb.onPick?.(g.get(p.x, p.y));
      this.drag = { mode: 'pick' };
      return;
    }
    const tool = this.tool;
    if (tool === 'select') {
      const s = this.sel;
      if (s && p.x >= s.x && p.y >= s.y && p.x < s.x + s.w && p.y < s.y + s.h) {
        this.lift();
        this.drag = { mode: 'move', ox: p.x - s.x, oy: p.y - s.y };
      } else {
        this.commitFloat();
        this.sel = null;
        this.drag = { mode: 'marquee', a: p };
        this.startAnts();
      }
      this.invalidate();
      return;
    }
    if (tool === 'fill') {
      this.snapshot();
      if (this.flood(p.x, p.y, right ? 0 : this.color, e.shiftKey)) this.changed(); else this.frame.undo.pop();
      return;
    }
    if (tool === 'line' || tool === 'rect') {
      this.drag = { mode: tool, a: p, b: p, v: right ? 0 : this.color };
      this.updatePreview(e);
      return;
    }
    // pencil / eraser / shade: freehand stroke
    this.snapshot();
    const v = tool === 'eraser' || (tool === 'pencil' && right) ? 0 : this.color;
    this.drag = { mode: 'stroke', tool, v, last: p, pts: [], touched: new Set(), before: this.frame.undo[this.frame.undo.length - 1], dir: right || e.shiftKey ? -1 : 1, any: false };
    this.strokeTo(p);
  }

  strokeTo(p) {
    const d = this.drag;
    const g = this.frame.grid;
    this.line(d.last.x, d.last.y, p.x, p.y, (x, y) => {
      if (!g.inside(x, y)) return;
      if (d.tool === 'shade') {
        const xs = this.opts.mirror ? [x, this.mirrorX(x)] : [x];
        for (const sx of xs) {
          const k = y * g.w + sx;
          if (d.touched.has(k)) continue;
          d.touched.add(k);
          const nv = this.shadeValue(d.before.get(sx, y), d.dir);
          if (nv !== g.get(sx, y)) { g.set(sx, y, nv); d.any = true; }
        }
        return;
      }
      const last = d.pts[d.pts.length - 1];
      if (last && last[0] === x && last[1] === y) return;
      this.put(x, y, d.v);
      d.any = true;
      d.pts.push([x, y]);
      // pixel-perfect: drop the corner pixel of an L made by three consecutive points
      if (this.opts.pixelPerfect && d.tool === 'pencil' && d.pts.length >= 3) {
        const [a, b, cc] = d.pts.slice(-3);
        if (Math.abs(a[0] - cc[0]) === 1 && Math.abs(a[1] - cc[1]) === 1 && ((b[0] === a[0] && b[1] === cc[1]) || (b[1] === a[1] && b[0] === cc[0]))) {
          this.put(b[0], b[1], d.before.get(b[0], b[1]));
          d.pts.splice(d.pts.length - 2, 1);
        }
      }
    });
    d.last = p;
    this.imgCache = null;
    this.invalidate();
  }

  updatePreview(e) {
    const d = this.drag;
    const pts = d.mode === 'line' ? this.linePoints(d.a, d.b, e.shiftKey) : this.rectPoints(d.a, d.b, e.shiftKey);
    if (this.opts.mirror) {
      const n = pts.length;
      for (let i = 0; i < n; i++) pts.push([this.mirrorX(pts[i][0]), pts[i][1]]);
    }
    this.preview = { points: pts, v: d.v };
    this.invalidate();
  }

  move(e) {
    if (!this.frame) return;
    const p = this.toArt(e);
    const g = this.frame.grid;
    const inside = g.inside(p.x, p.y);
    const hv = inside ? { x: p.x, y: p.y, v: g.get(p.x, p.y) } : null;
    if (!this.hover || !hv || this.hover.x !== hv.x || this.hover.y !== hv.y) {
      this.hover = hv;
      this.cb.onHover?.(hv);
      this.invalidate();
    }
    const d = this.drag;
    if (!d) return;
    if (d.mode === 'pan') { this.pan.x = Math.round(d.px + (p.dx - d.sx)); this.pan.y = Math.round(d.py + (p.dy - d.sy)); this.invalidate(); return; }
    if (d.mode === 'stroke') { this.strokeTo(p); return; }
    if (d.mode === 'line' || d.mode === 'rect') { d.b = p; this.updatePreview(e); return; }
    if (d.mode === 'marquee') {
      const x0 = Math.max(0, Math.min(d.a.x, p.x)), y0 = Math.max(0, Math.min(d.a.y, p.y));
      const x1 = Math.min(g.w - 1, Math.max(d.a.x, p.x)), y1 = Math.min(g.h - 1, Math.max(d.a.y, p.y));
      this.sel = x1 >= x0 && y1 >= y0 ? { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1, float: null } : null;
      this.invalidate();
      return;
    }
    if (d.mode === 'move' && this.sel) { this.sel.x = p.x - d.ox; this.sel.y = p.y - d.oy; this.invalidate(); }
    if (d.mode === 'pick' && e.buttons && inside) this.cb.onPick?.(g.get(p.x, p.y));
  }

  up(e) {
    const d = this.drag;
    this.drag = null;
    if (!d) return;
    if (d.mode === 'pan') { this.updateCursor(); return; }
    if (d.mode === 'stroke') {
      if (!d.any) this.frame.undo.pop();
      else this.changed();
      this.cb.onStroke?.();
      return;
    }
    if (d.mode === 'line' || d.mode === 'rect') {
      const pv = this.preview;
      this.preview = null;
      if (pv && pv.points.length) {
        this.snapshot();
        for (const [x, y] of pv.points) this.frame.grid.set(x, y, pv.v);
        this.changed();
      }
      this.invalidate();
      return;
    }
    if (d.mode === 'marquee' && !this.sel) this.stopAnts();
    this.invalidate();
  }

  // ---------------------------------------------------------------- render ---
  invalidate() {
    if (this.raf) return;
    this.raf = requestAnimationFrame(() => { this.raf = 0; this.render(); });
  }

  checker() {
    const dpr = this.dpr;
    const key = `${this.opts.bg}:${dpr}`;
    if (this._checkKey === key) return this._checker;
    const n = Math.round(8 * dpr);
    const c = document.createElement('canvas');
    c.width = c.height = n * 2;
    const g = c.getContext('2d');
    g.fillStyle = '#171a2e'; g.fillRect(0, 0, n * 2, n * 2);
    g.fillStyle = '#1f2340'; g.fillRect(0, 0, n, n); g.fillRect(n, n, n, n);
    this._checker = this.g.createPattern(c, 'repeat');
    this._checkKey = key;
    return this._checker;
  }

  tinted(grid, rgb) {
    const c = gridCanvas(grid, this.frame.table);
    const g = c.getContext('2d');
    const img = g.getImageData(0, 0, c.width, c.height);
    const d = img.data;
    for (let k = 0; k < d.length; k += 4) if (d[k + 3]) { d[k] = (d[k] + rgb[0]) >> 1; d[k + 1] = (d[k + 1] + rgb[1]) >> 1; d[k + 2] = (d[k + 2] + rgb[2]) >> 1; }
    g.putImageData(img, 0, 0);
    return c;
  }

  render() {
    const ctx = this.g, cw = this.canvas.width, ch = this.canvas.height;
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#080913';
    ctx.fillRect(0, 0, cw, ch);
    const f = this.frame;
    if (!f) return;
    const g = f.grid, s = this.s, ox = this.pan.x, oy = this.pan.y, W = g.w * s, H = g.h * s;

    // artboard background
    const bg = this.opts.bg;
    ctx.save();
    if (bg === 'checker') { ctx.translate(ox, oy); ctx.fillStyle = this.checker(); ctx.fillRect(0, 0, W, H); ctx.restore(); ctx.save(); }
    else { ctx.fillStyle = { dark: '#0c1024', light: '#c9cbe0', mid: '#4b5070', black: '#000000' }[bg] || '#0c1024'; ctx.fillRect(ox, oy, W, H); }
    ctx.restore();

    // onion skins
    if (this.opts.onion && !this.opts.compare && (f.prev || f.next)) {
      if (!this.onionCache) this.onionCache = { prev: f.prev ? this.tinted(f.prev, [255, 80, 90]) : null, next: f.next ? this.tinted(f.next, [60, 220, 220]) : null };
      ctx.globalAlpha = 0.32;
      if (this.onionCache.prev) ctx.drawImage(this.onionCache.prev, ox, oy, W, H);
      if (this.onionCache.next) ctx.drawImage(this.onionCache.next, ox, oy, W, H);
      ctx.globalAlpha = 1;
    }

    // the frame (or the generator's version when comparing)
    const showRaw = this.opts.compare && f.raw;
    if (showRaw) ctx.drawImage(gridCanvas(f.raw, f.table), ox, oy, W, H);
    else {
      if (!this.imgCache) this.imgCache = gridCanvas(g, f.table, this._imgCanvas || (this._imgCanvas = document.createElement('canvas')));
      ctx.drawImage(this.imgCache, ox, oy, W, H);
    }

    // floating selection
    const sel = this.sel;
    if (sel && sel.float && !showRaw) ctx.drawImage(gridCanvas(sel.float, f.table), ox + sel.x * s, oy + sel.y * s, sel.w * s, sel.h * s);

    // line / rect preview
    if (this.preview) {
      const t = f.table;
      for (const [x, y] of this.preview.points) {
        if (!g.inside(x, y)) continue;
        const c = t.rgba[this.preview.v];
        ctx.fillStyle = this.preview.v ? `rgba(${c[0]},${c[1]},${c[2]},0.9)` : 'rgba(255,95,86,0.55)';
        ctx.fillRect(ox + x * s, oy + y * s, s, s);
      }
    }

    // diff overlay: where the user's pixels differ from the generator
    if (this.opts.diff && f.raw && !showRaw) {
      ctx.fillStyle = 'rgba(218, 99, 195, 0.9)';
      const t = Math.max(1, Math.round(s / 6));
      for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) {
        const i = y * g.w + x;
        if (g.data[i] === f.raw.data[i]) continue;
        const px = ox + x * s, py = oy + y * s;
        if (s >= 4) { ctx.fillRect(px, py, s, t); ctx.fillRect(px, py + s - t, s, t); ctx.fillRect(px, py, t, s); ctx.fillRect(px + s - t, py, t, s); }
        else ctx.fillRect(px, py, s, s);
      }
    }

    // pixel grid
    if (this.opts.grid && s >= 6) {
      const x0 = Math.max(0, Math.floor(-ox / s)), x1 = Math.min(g.w, Math.ceil((cw - ox) / s));
      const y0 = Math.max(0, Math.floor(-oy / s)), y1 = Math.min(g.h, Math.ceil((ch - oy) / s));
      const top = Math.max(oy, 0), bot = Math.min(oy + H, ch), left = Math.max(ox, 0), right = Math.min(ox + W, cw);
      for (let x = x0; x <= x1; x++) { ctx.fillStyle = x % 8 === 0 ? 'rgba(255,255,255,0.13)' : 'rgba(255,255,255,0.055)'; ctx.fillRect(ox + x * s, top, 1, bot - top); }
      for (let y = y0; y <= y1; y++) { ctx.fillStyle = y % 8 === 0 ? 'rgba(255,255,255,0.13)' : 'rgba(255,255,255,0.055)'; ctx.fillRect(left, oy + y * s, right - left, 1); }
    }

    // artboard border
    ctx.strokeStyle = 'rgba(120, 130, 190, 0.35)';
    ctx.lineWidth = 1;
    ctx.strokeRect(ox - 0.5, oy - 0.5, W + 1, H + 1);

    // anchor + ground line
    if (Number.isFinite(f.ax) && Number.isFinite(f.ay)) {
      const gy = oy + (f.ay + 1) * s;
      ctx.fillStyle = 'rgba(244, 196, 67, 0.28)';
      ctx.fillRect(ox, gy, W, Math.max(1, Math.round(this.dpr)));
      const ax = ox + f.ax * s, ay = oy + f.ay * s, k = Math.max(3, Math.round(s * 0.45)), lw = Math.max(1, Math.round(this.dpr));
      ctx.fillStyle = 'rgba(244, 196, 67, 0.95)';
      ctx.fillRect(ax - 1, ay - 1, k, lw); ctx.fillRect(ax - 1, ay - 1, lw, k);
      ctx.fillRect(ax + s - k + 1, ay + s, k, lw); ctx.fillRect(ax + s, ay + s - k + 1, lw, k);
    }

    // mirror axis
    if (this.opts.mirror) {
      const mx = ox + (g.w / 2) * s;
      ctx.fillStyle = 'rgba(58, 203, 201, 0.75)';
      for (let y = oy; y < oy + H; y += 8 * this.dpr) ctx.fillRect(Math.round(mx), y, Math.max(1, Math.round(this.dpr)), 4 * this.dpr);
    }

    // selection marquee (marching ants)
    if (sel) {
      const x = ox + sel.x * s, y = oy + sel.y * s, w = sel.w * s, h = sel.h * s;
      const phase = Math.floor(performance.now() / 140) % 8;
      ctx.lineWidth = Math.max(1, Math.round(this.dpr));
      ctx.setLineDash([4 * this.dpr, 4 * this.dpr]);
      ctx.strokeStyle = '#000'; ctx.lineDashOffset = phase; ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
      ctx.strokeStyle = '#fff'; ctx.lineDashOffset = phase + 4 * this.dpr; ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
      ctx.setLineDash([]);
    }

    // hover / brush preview
    const hv = this.hover;
    if (hv && !this.drag && !this.opts.compare) {
      const xs = [hv.x];
      if (this.opts.mirror) xs.push(this.mirrorX(hv.x));
      for (const x of xs) {
        const px = ox + x * s, py = oy + hv.y * s;
        if ((this.tool === 'pencil' || this.tool === 'line' || this.tool === 'rect' || this.tool === 'fill') && this.color) {
          const c = f.table.rgba[this.color];
          ctx.fillStyle = `rgba(${c[0]},${c[1]},${c[2]},0.75)`;
          ctx.fillRect(px, py, s, s);
        }
        ctx.strokeStyle = this.tool === 'eraser' ? 'rgba(255,95,86,0.95)' : 'rgba(255,255,255,0.9)';
        ctx.lineWidth = Math.max(1, Math.round(this.dpr));
        ctx.strokeRect(px + 0.5, py + 0.5, s - 1, s - 1);
      }
    }
  }

  destroy() { this.ro.disconnect(); this.stopAnts(); cancelAnimationFrame(this.raf); this.canvas.remove(); }
}

function isField(t) { return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable); }
