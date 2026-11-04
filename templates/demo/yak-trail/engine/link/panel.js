// engine/link/panel.js — the F8 tuning panel: a pixel-art overlay over the running game, drawn with
// the engine's pixel font in a small canvas that is scaled up by a whole number (no HTML widgets).
// engine/link/studio.js loads it the first time F8 is pressed.
//
// While it's open the game keeps running. The panel takes only the keys it uses (arrows, K, R,
// Tab, Esc — every key while typing a "why") and clicks that land on it; WASD, other keys and
// clicks elsewhere still reach the game. Closed, it listens to nothing and draws nothing.
//   ↑↓ pick · ←→ change (Shift: 10 steps) · K keep (+ an optional why) · R reset to the code's
//   default · Tab move to another corner · Esc / F8 close. Mouse: click a row, drag a slider,
//   click an option, the wheel nudges what it's over.
import { text, measure } from '../shell/font.js';

const C = {
  shadow: '#000000', bg: '#0b0a16', bar: '#1b1a33', line: '#5c6080', dim: '#2e3250', sel: '#1f2347',
  text: '#d4d8e8', muted: '#8a8fb0', hint: '#565b80', white: '#ffffff', gold: '#ffd34a', cyan: '#6ee8ff', green: '#6ee89a', orchid: '#d79bff', red: '#ff7a6a',
};
const ROW = 11, TITLE = 11, TRACK = 44, MIN_W = 150, MAX_W = 236;
// keys by e.key (letters upper-cased): K for Keep wherever K is on the keyboard; events that carry
// only a code (tools/game-capture.cjs) fall back to it
const EATEN = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'K', 'R', 'Tab', 'Escape', 'Enter']);
const keyName = (e) => {
  if (e.key && e.key !== 'Unidentified') return e.key.length === 1 ? e.key.toUpperCase() : e.key;
  const c = e.code || '';
  return c.startsWith('Key') ? c.slice(3) : c;
};
const CORNER = 'yak-tune-corner';

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// link: { items, keep(item, note) -> Promise<{ok, error?, copied?}>, gameCanvas(), gameScale(), inStudio }
export function createPanel(link) {
  const { items } = link;
  const el = document.createElement('canvas');
  el.dataset.yakLink = 'panel';
  Object.assign(el.style, { position: 'fixed', left: '0', top: '0', pointerEvents: 'none', imageRendering: 'pixelated', zIndex: '2147483000', display: 'none' });
  document.body.appendChild(el);
  const g = el.getContext('2d');

  let open = false, sel = 0, scroll = 0, mode = 'list', why = '', tick = 0;
  let corner = 0;
  try { corner = Number(localStorage.getItem(CORNER)) || 0; } catch { /* storage off */ }
  let LW = 320, LH = 180;
  let box = { x: 0, y: 0, w: 0, h: 0 };
  let hits = [];             // clickable areas from the last draw: { x, y, w, h, act, item?, i?, x0?, w0? }
  let hover = null, drag = null;
  let flash = null;          // { text, color, until }

  // ------------------------------------------------------------ layout ---
  // One panel pixel = the game's pixel, unless the game is so small the panel wouldn't fit
  // (then a smaller whole number), so the text reads like the game's own.
  function layout() {
    const src = link.gameCanvas();
    const dpr = window.devicePixelRatio || 1;
    const r = src ? src.getBoundingClientRect() : { left: 0, top: 0, width: innerWidth, height: innerHeight };
    const devW = Math.max(1, Math.round(r.width * dpr)), devH = Math.max(1, Math.round(r.height * dpr));
    const gs = link.gameScale();
    const P = gs ? Math.max(1, Math.min(gs, Math.floor(devW / 256))) : Math.max(1, Math.floor(devW / 320));
    LW = Math.max(64, Math.floor(devW / P)); LH = Math.max(48, Math.floor(devH / P));
    if (el.width !== LW || el.height !== LH) { el.width = LW; el.height = LH; }
    g.imageSmoothingEnabled = false;
    Object.assign(el.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${(LW * P) / dpr}px`, height: `${(LH * P) / dpr}px` });
  }

  // ------------------------------------------------------------- draw ---
  const fit = (s, w) => {
    if (measure(s) <= w) return s;
    let t = s;
    while (t.length > 1 && measure(t + '…') > w) t = t.slice(0, -1);
    return t + '…';
  };
  const fill = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
  const frame = (x, y, w, h, c) => { fill(x, y, w, 1, c); fill(x, y + h - 1, w, 1, c); fill(x, y, 1, h, c); fill(x + w - 1, y, 1, h, c); };
  const isHover = (act, i) => hover && hover.act === act && (i === undefined || hover.i === i);

  function controlWidth(item) {
    if (item.kind === 'variant') return item.options.length * 9 - 1;
    return TRACK + 4 + Math.max(measure(item.format(item.min)), measure(item.format(item.max)), measure(item.format(item.def)));
  }

  function draw() {
    tick++;
    g.clearRect(0, 0, LW, LH);
    hits = [];
    const nameW = Math.min(110, Math.max(60, ...items.map((i) => measure(i.name))));
    const ctrlW = Math.max(40, ...items.map(controlWidth));
    const W = Math.min(LW - 8, MAX_W, Math.max(MIN_W, 4 + 8 + nameW + 6 + ctrlW + 4 + 7 + 3));
    const nameFit = Math.max(20, W - (4 + 8 + 6 + ctrlW + 4 + 7 + 3));
    const footH = mode === 'why' ? 24 : 13;
    const room = Math.max(1, Math.floor((LH - 8 - TITLE - 4 - 11 - footH - 2) / ROW));
    const shown = Math.min(Math.max(1, items.length), room);
    if (sel < scroll) scroll = sel;
    if (sel >= scroll + shown) scroll = sel - shown + 1;
    scroll = Math.max(0, Math.min(scroll, Math.max(0, items.length - shown)));
    const H = TITLE + 2 + shown * ROW + 2 + 11 + footH;
    const x = corner & 1 ? LW - W - 4 : 4, y = corner & 2 ? LH - H - 4 : 4;
    box = { x, y, w: W, h: H };

    // the frame: a hard shadow, a dark body, a 1-pixel rim and a title bar
    fill(x + 1, y + 1, W, H, C.shadow);
    fill(x, y, W, H, C.bg);
    fill(x + 1, y + 1, W - 2, TITLE - 1, C.bar);
    frame(x, y, W, H, C.line);
    fill(x + 1, y + TITLE, W - 2, 1, C.line);
    text(g, 'TUNE', x + 4, y + 2, C.gold);
    const now = performance.now();
    if (flash && now < flash.until) text(g, fit(flash.text, W - 40), x + W - 16, y + 2, flash.color, { align: 'right' });
    else if (items.length > shown) text(g, `${sel + 1}/${items.length}`, x + W - 16, y + 2, C.muted, { align: 'right' });
    text(g, '×', x + W - 9, y + 2, isHover('close') ? C.white : C.muted);
    hits.push({ x: x + W - 12, y, w: 12, h: TITLE, act: 'close' });

    const top = y + TITLE + 2;
    if (!items.length) {
      text(g, 'No knobs in this game yet.', x + 6, top + 2, C.text);
    }
    for (let r = 0; r < shown && scroll + r < items.length; r++) {
      const i = scroll + r, item = items[i], ry = top + r * ROW;
      const on = i === sel;
      if (on) fill(x + 1, ry, W - 2, ROW, C.sel);
      if (on) text(g, '▶', x + 3, ry + 2, C.gold);
      text(g, fit(item.name, nameFit), x + 10, ry + 2, on ? C.white : C.text);
      hits.push({ x: x + 1, y: ry, w: W - 2, h: ROW, act: 'row', i });
      const cx = x + W - 3 - 7 - 4 - ctrlW;
      if (item.kind === 'knob') drawKnob(item, i, cx, ry);
      else drawVariant(item, i, cx, ry);
      // ✓ kept (what's showing is what was kept) · a dot: changed from the code's default
      if (item.kept !== undefined && same(item.kept, item.value)) text(g, '✓', x + W - 8, ry + 2, C.green);
      else if (item.changed()) fill(x + W - 6, ry + 4, 2, 2, C.orchid);
    }
    if (scroll > 0) text(g, '↑', x + W - 7, top - 1, C.muted);
    if (scroll + shown < items.length) text(g, '↓', x + W - 7, top + shown * ROW - 8, C.muted);

    // the detail line: the whole value of the selected row
    const dy = top + shown * ROW + 1;
    fill(x + 1, dy, W - 2, 1, C.dim);
    const it = items[sel];
    if (it) {
      const detail = it.kind === 'knob'
        ? `${it.format()}  [m]code ${it.format(it.def)}, range ${it.format(it.min)} to ${it.format(it.max)}`
        : `${it.label()}${it.changed() ? `  [m]code ${it.label(it.defIndex)}` : '  [m]the code\'s default'}`;
      text(g, fit(detail, W - 10), x + 5, dy + 2, C.white);
    }

    // the footer: what the keys do, as buttons the mouse can press too
    const fy = dy + 11;
    fill(x + 1, fy, W - 2, 1, C.dim);
    if (mode === 'why') {
      const cursor = (tick >> 5) & 1 ? '_' : ' ';
      text(g, 'Why?', x + 5, fy + 3, C.gold);
      const room2 = W - 10 - measure('Why? ') - 4;
      let shownWhy = why;
      while (shownWhy && measure(shownWhy + '_') > room2) shownWhy = shownWhy.slice(1);
      text(g, (why ? shownWhy : '') + cursor, x + 5 + measure('Why? '), fy + 3, C.white);
      if (!why) text(g, 'optional', x + 5 + measure('Why? ') + 6, fy + 3, C.hint);
      buttons(x + 4, fy + 13, [['Enter', 'Keep', 'keep-now'], ['Esc', 'Cancel', 'cancel']]);
    } else {
      buttons(x + 4, fy + 2, [['K', 'Keep', 'keep'], ['R', 'Reset', 'reset'], ['Tab', 'Move', 'move']]);
    }
  }

  function drawKnob(item, i, cx, ry) {
    const tx = cx, ty = ry + 5;
    fill(tx, ty, TRACK, 2, C.dim);
    const hx = tx + Math.round(item.frac() * (TRACK - 1));
    fill(tx, ty, hx - tx, 2, C.cyan);
    const dx = tx + Math.round(item.frac(item.def) * (TRACK - 1));
    fill(dx, ry + 8, 1, 2, C.muted);           // where the code's default sits
    fill(hx - 2, ry + 1, 5, 9, C.shadow);
    fill(hx - 1, ry + 2, 3, 7, drag && drag.item === item ? C.gold : C.white);
    text(g, item.format(), tx + TRACK + 4, ry + 2, item.changed() ? C.orchid : C.text);
    hits.push({ x: tx - 3, y: ry, w: TRACK + 6, h: ROW, act: 'track', i, item, x0: tx, w0: TRACK });
  }

  function drawVariant(item, i, cx, ry) {
    item.options.forEach((opt, j) => {
      const bx = cx + j * 9, chosen = j === item.index;
      if (chosen) fill(bx, ry + 1, 8, 9, C.gold);
      else frame(bx, ry + 1, 8, 9, isHover('chip', i) && hover.j === j ? C.line : C.dim);
      const l = item.letter(j);
      text(g, l, bx + 4 - Math.floor(measure(l) / 2), ry + 2, chosen ? C.bg : j === item.defIndex ? C.text : C.muted);
      hits.push({ x: bx, y: ry, w: 9, h: ROW, act: 'chip', i, j, item });
    });
  }

  function buttons(bx, by, list) {
    for (const [key, label, act] of list) {
      const w = measure(key) + 3 + measure(label) + 6;
      const hot = isHover(act);
      frame(bx, by, w, 10, hot ? C.line : C.dim);
      text(g, key, bx + 3, by + 1, C.gold);
      text(g, label, bx + 3 + measure(key) + 3, by + 1, hot ? C.white : C.muted);
      hits.push({ x: bx, y: by, w, h: 10, act });
      bx += w + 3;
    }
  }

  // ---------------------------------------------------------- actions ---
  const say = (t, color = C.green, ms = 2600) => { flash = { text: t, color, until: performance.now() + ms }; };
  function act(name, item = items[sel]) {
    if (name === 'close') return toggle(false);
    if (name === 'move') { corner = (corner + 1) % 4; try { localStorage.setItem(CORNER, String(corner)); } catch { /* storage off */ } return; }
    if (!item) return;
    if (name === 'reset') { item.reset(); say('back to the code\'s default', C.muted, 1600); return; }
    if (name === 'keep') { mode = 'why'; why = ''; return; }
    if (name === 'cancel') { mode = 'list'; why = ''; return; }
    if (name === 'keep-now') {
      const note = why.trim();
      mode = 'list'; why = '';
      say('keeping…', C.muted, 8000);
      const shownAs = item.kind === 'variant' ? item.letter() : item.format();
      link.keep(item, note).then((r) => {
        if (r && r.ok !== false) say(r.copied ? `copied ${shownAs}: paste it to your AI` : `kept ${shownAs}`);
        else say((r && r.error) || 'not kept', C.red, 5000);
      }, (err) => say(err.message || 'not kept', C.red, 5000));
    }
  }

  // ------------------------------------------------------------ input ---
  function onKey(e) {
    const k = keyName(e);
    if (!open || k === 'F8') return;
    if (mode === 'why') {
      if (/^F\d+$/.test(k)) return; // F5 / F9 / F12 still do their thing
      e.preventDefault(); e.stopImmediatePropagation();
      const ch = e.key || '';
      if (k === 'Enter') act('keep-now');
      else if (k === 'Escape') act('cancel');
      else if (k === 'Backspace') why = why.slice(0, -1);
      else if (ch.length === 1 && !e.ctrlKey && !e.metaKey && why.length < 200) why += ch;
      return;
    }
    if (!EATEN.has(k) || e.ctrlKey || e.altKey || e.metaKey) return; // WASD and the rest go to the game
    e.preventDefault(); e.stopImmediatePropagation();
    const item = items[sel];
    if (k === 'ArrowUp' && items.length) sel = (sel - 1 + items.length) % items.length;
    else if (k === 'ArrowDown' && items.length) sel = (sel + 1) % items.length;
    else if ((k === 'ArrowLeft' || k === 'ArrowRight') && item) item.nudge((k === 'ArrowLeft' ? -1 : 1) * (e.shiftKey && item.kind === 'knob' ? 10 : 1));
    else if (k === 'K' || k === 'Enter') act('keep');
    else if (k === 'R') act('reset');
    else if (k === 'Tab') act('move');
    else if (k === 'Escape') act('close');
  }

  function at(e) {
    const r = el.getBoundingClientRect();
    if (!r.width) return null;
    return { x: Math.floor(((e.clientX - r.left) / r.width) * LW), y: Math.floor(((e.clientY - r.top) / r.height) * LH) };
  }
  const inBox = (p) => p && p.x >= box.x && p.y >= box.y && p.x < box.x + box.w + 1 && p.y < box.y + box.h + 1;
  const hitAt = (p) => { for (let k = hits.length - 1; k >= 0; k--) { const h = hits[k]; if (p.x >= h.x && p.y >= h.y && p.x < h.x + h.w && p.y < h.y + h.h) return h; } return null; };
  const slide = (h, p) => h.item.set(h.item.min + Math.max(0, Math.min(1, (p.x - h.x0) / (h.w0 - 1))) * (h.item.max - h.item.min));

  // Pointer and wheel events on the panel (or while dragging a slider) stop here; the rest
  // reach the game untouched.
  function onPointer(e) {
    if (!open) return;
    const p = at(e);
    const mine = drag || inBox(p);
    if (e.type === 'pointermove') {
      hover = mine ? hitAt(p) : null;
      if (drag && p) slide(drag, p);
    }
    if (!mine) return;
    e.stopImmediatePropagation();
    if (e.cancelable && e.type !== 'pointermove') e.preventDefault();
    if (e.type === 'pointerdown' && e.button === 0 && p) {
      const h = hitAt(p);
      if (!h) return;
      if (h.i !== undefined) sel = h.i;
      if (h.act === 'track') { drag = h; slide(h, p); }
      else if (h.act === 'chip') h.item.choose(h.j);
      else if (h.act !== 'row') act(h.act);
    }
    if (e.type === 'pointerup') drag = null;
    if (e.type === 'wheel' && p) {
      const h = hitAt(p), dir = Math.sign(e.deltaY);
      if (h && h.item) h.item.nudge(-dir);
      else if (items.length) sel = Math.max(0, Math.min(items.length - 1, sel + dir));
    }
  }

  const KEY_EVENTS = ['keydown'];
  const POINTER_EVENTS = ['pointerdown', 'pointermove', 'pointerup', 'mousedown', 'mouseup', 'click', 'dblclick', 'auxclick', 'contextmenu', 'wheel'];
  let raf = 0;
  const loop = () => { if (!open) return; draw(); raf = requestAnimationFrame(loop); };
  const onResize = () => layout();
  const onBlur = () => { drag = null; };

  function toggle(want = !open) {
    if (want === open) return;
    open = want;
    if (open) {
      for (const t of KEY_EVENTS) addEventListener(t, onKey, true);
      for (const t of POINTER_EVENTS) addEventListener(t, onPointer, { capture: true, passive: false });
      addEventListener('resize', onResize);
      addEventListener('blur', onBlur);
      mode = 'list'; why = ''; drag = null;
      sel = Math.min(sel, Math.max(0, items.length - 1));
      layout();
      el.style.display = 'block';
      loop();
    } else {
      for (const t of KEY_EVENTS) removeEventListener(t, onKey, true);
      for (const t of POINTER_EVENTS) removeEventListener(t, onPointer, { capture: true });
      removeEventListener('resize', onResize);
      removeEventListener('blur', onBlur);
      cancelAnimationFrame(raf);
      el.style.display = 'none';
      drag = null; hover = null;
    }
  }

  return { toggle, get open() { return open; } };
}
