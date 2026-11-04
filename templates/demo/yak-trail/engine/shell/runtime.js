// engine/shell/runtime.js — the genre-agnostic game shell every new game imports: a pixel
// screen of any native resolution (resizable at runtime), a fixed-step loop, keyboard +
// gamepad + mouse input, a scene director with pixel-style transitions, deterministic RNG.
// Nothing here assumes a resolution: pass your own width, height and scale.

// ------------------------------------------------------------------ screen ---
// Scenes draw into a w x h buffer; present() blits it at the largest integer scale that is
// exact in *device* pixels (so 125%/150% Windows scaling stays crisp). resize() changes the
// native resolution on the fly (e.g. a GBA 240x160 view next to a 640x360 one).
export function createScreen(canvas, { w = 320, h = 180, background = '#05040a' } = {}) {
  const buf = document.createElement('canvas');
  const g = buf.getContext('2d');
  const out = canvas.getContext('2d');
  let scale = 1;
  const screen = { g, buf, w, h, canvas, get scale() { return scale; } };

  function fit() {
    const dpr = window.devicePixelRatio || 1;
    scale = Math.max(1, Math.floor(Math.min((innerWidth * dpr) / screen.w, (innerHeight * dpr) / screen.h)));
    canvas.width = screen.w * scale;
    canvas.height = screen.h * scale;
    canvas.style.width = `${(screen.w * scale) / dpr}px`;
    canvas.style.height = `${(screen.h * scale) / dpr}px`;
    out.imageSmoothingEnabled = false;
  }

  screen.resize = (nw, nh) => {
    nw = Math.max(16, Math.round(nw)); nh = Math.max(16, Math.round(nh));
    if (nw === screen.w && nh === screen.h && buf.width === nw) return;
    screen.w = nw; screen.h = nh;
    buf.width = nw; buf.height = nh;
    g.imageSmoothingEnabled = false;
    fit();
  };
  // Layers drawn over the picture at their own whole-pixel scale, this frame only — a HUD that keeps
  // its size while the world zooms: screen.layers.push({ canvas, scale }) (x, y: where its top-left
  // goes, in device pixels; 0, 0 when left out).
  screen.layers = [];
  screen.present = () => {
    out.fillStyle = background;
    out.fillRect(0, 0, canvas.width, canvas.height);
    out.drawImage(buf, 0, 0, canvas.width, canvas.height);
    for (const l of screen.layers) out.drawImage(l.canvas, l.x || 0, l.y || 0, l.canvas.width * l.scale, l.canvas.height * l.scale);
    screen.layers.length = 0;
  };
  // Window/client coordinates → buffer pixel coordinates (null when outside the picture).
  screen.toBuffer = (clientX, clientY) => {
    const r = canvas.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    const x = ((clientX - r.left) / r.width) * screen.w, y = ((clientY - r.top) / r.height) * screen.h;
    return { x: Math.floor(x), y: Math.floor(y), inside: x >= 0 && y >= 0 && x < screen.w && y < screen.h };
  };

  buf.width = w; buf.height = h;
  g.imageSmoothingEnabled = false;
  addEventListener('resize', fit);
  fit();
  return screen;
}

// -------------------------------------------------------------------- loop ---
// Logic always runs at 60 ticks/s regardless of monitor refresh rate.
// An error in step/draw is logged (once per message) and the loop keeps going — a bug shows up
// as a broken frame in the console, never as a frozen game.
export function runLoop(rawStep, rawDraw) {
  const seen = new Set();
  const guard = (fn) => () => {
    try { fn(); } catch (err) {
      const key = String(err && err.message);
      if (!seen.has(key)) { seen.add(key); console.error('[loop]', err); }
    }
  };
  const step = guard(rawStep), draw = guard(rawDraw);
  const DT = 1000 / 60;
  let acc = 0;
  let last = performance.now();
  function frame(now) {
    let dt = now - last;
    last = now;
    if (!(dt > 0)) dt = 0;
    if (dt > 250) dt = 250; // tab was asleep: don't fast-forward
    acc += dt;
    let n = 0;
    while (acc >= DT && n < 6) { step(); acc -= DT; n++; }
    if (n >= 6) acc = 0;
    draw();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

// ------------------------------------------------------------------- input ---
// Actions are plain names. A game passes its own key map (KeyboardEvent.code → action) and
// gamepad map (button index → action); sticks feed up/down/left/right. Mouse coordinates are
// in buffer pixels once attach(screen) is called.
export const DEFAULT_KEYS = {
  ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down',
  ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
  KeyK: 'a', KeyX: 'a', Space: 'a', KeyJ: 'b', KeyZ: 'b', Backspace: 'b',
  KeyL: 'l', KeyC: 'l', KeyQ: 'l', KeyE: 'l',
  Enter: 'start', Escape: 'start', KeyP: 'start', ShiftLeft: 'run', ShiftRight: 'run',
};
export const DEFAULT_PAD = { 0: 'a', 3: 'a', 1: 'b', 2: 'b', 4: 'l', 5: 'l', 6: 'l', 7: 'l', 8: 'start', 9: 'start', 12: 'up', 13: 'down', 14: 'left', 15: 'right' };

export function createInput({ keys = DEFAULT_KEYS, pad = DEFAULT_PAD } = {}) {
  const actions = [...new Set([...Object.values(keys), ...Object.values(pad), 'up', 'down', 'left', 'right'])];
  const held = new Set();   // keyboard codes currently held
  const taps = new Set();   // actions pressed since last tick (catches sub-tick taps)
  const cur = {}, frames = {}, pressedNow = {}, releasedNow = {};
  let prevPad = {};
  for (const a of actions) { cur[a] = false; frames[a] = 0; }
  const mouse = { x: -1, y: -1, inside: false, down: false, pressed: false, released: false, wheel: 0, moved: false };
  const raw = { down: false, clicks: 0, ups: 0, wheel: 0, moved: false };
  // Raw layer (a game screen can bind its own controls on top of the action map):
  // key codes, mouse buttons (0 left · 1 middle · 2 right · 3 back · 4 forward), pad buttons.
  const codeTaps = new Set(), codeNow = new Set(), claimed = new Set();
  const btnTaps = new Set(), btnNow = new Set(), btnHeld = new Set();
  let padNow = [], padPrev = [];

  const input = {
    actions, mouse, onFirstInput: null,
    first() { if (input.onFirstInput) { const f = input.onFirstInput; input.onFirstInput = null; f(); } },
    // Call once at the start of every logic tick.
    update() {
      const ps = padState();
      if (Object.keys(ps).length) input.first();
      for (const a of actions) {
        let kb = false;
        for (const code of held) if (keys[code] === a) { kb = true; break; }
        const was = cur[a];
        const now = kb || !!ps[a];
        pressedNow[a] = taps.has(a) || (ps[a] && !prevPad[a]);
        releasedNow[a] = was && !now;
        cur[a] = now || taps.has(a);
        frames[a] = cur[a] ? frames[a] + 1 : 0;
      }
      prevPad = ps;
      taps.clear();
      mouse.pressed = raw.clicks > 0; mouse.released = raw.ups > 0; mouse.down = raw.down || mouse.pressed;
      mouse.wheel = raw.wheel; mouse.moved = raw.moved;
      raw.clicks = 0; raw.ups = 0; raw.wheel = 0; raw.moved = false;
      codeNow.clear(); for (const c of codeTaps) codeNow.add(c); codeTaps.clear();
      btnNow.clear(); for (const b of btnTaps) btnNow.add(b); btnTaps.clear();
      padPrev = padNow; padNow = padButtons();
    },
    down: (a) => !!cur[a],
    pressed: (a) => !!pressedNow[a],
    released: (a) => !!releasedNow[a],
    heldFor: (a) => frames[a] || 0,
    // Menu-style auto-repeat: fires on press, then every 5 ticks after 14.
    repeat(a) { const f = frames[a] || 0; return !!pressedNow[a] || (f > 14 && (f - 14) % 5 === 0); },
    anyPressed: () => actions.some((a) => pressedNow[a]) || mouse.pressed,
    // Raw controls: was this key / mouse button / pad button pressed this tick (or is it held)?
    keyPressed: (code) => codeNow.has(code),
    keyDown: (code) => held.has(code),
    mouseButton: (b) => btnNow.has(b),
    mouseHeld: (b) => btnHeld.has(b),
    padPressed: (i) => !!padNow[i] && !padPrev[i],
    padDown: (i) => !!padNow[i],
    // Keys a screen binds for itself (stops the browser acting on them, e.g. Alt or Tab).
    claim(codes) { for (const c of codes) claimed.add(c); return input; },
    // Drop all presses this tick (e.g. after a scene change).
    consume() { for (const a of actions) pressedNow[a] = false; mouse.pressed = false; codeNow.clear(); btnNow.clear(); padPrev = padNow.slice(); },
    // Track the mouse in buffer pixels of a screen made by createScreen().
    attach(screen) {
      const at = (e) => { const p = screen.toBuffer(e.clientX, e.clientY); if (p) { mouse.x = p.x; mouse.y = p.y; mouse.inside = p.inside; raw.moved = true; } };
      addEventListener('pointermove', at);
      addEventListener('pointerdown', (e) => { at(e); if (e.button === 0) { raw.down = true; raw.clicks++; } input.first(); });
      addEventListener('pointerup', (e) => { at(e); if (e.button === 0) { raw.down = false; raw.ups++; } });
      addEventListener('pointerleave', () => { mouse.inside = false; });
      addEventListener('wheel', (e) => { raw.wheel += Math.sign(e.deltaY); }, { passive: true });
      // every button of the mouse is a control: no context menu, no middle-click autoscroll,
      // no back/forward navigation from the side buttons
      addEventListener('mousedown', (e) => { btnTaps.add(e.button); btnHeld.add(e.button); if (e.button !== 0) e.preventDefault(); });
      addEventListener('mouseup', (e) => { btnHeld.delete(e.button); if (e.button > 2) e.preventDefault(); });
      addEventListener('auxclick', (e) => e.preventDefault());
      addEventListener('contextmenu', (e) => e.preventDefault());
      return input;
    },
  };

  function padState() {
    const st = {};
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads) {
      if (!p) continue;
      p.buttons.forEach((b, i) => { if (b && b.pressed && pad[i]) st[pad[i]] = true; });
      const ax = p.axes[0] || 0, ay = p.axes[1] || 0;
      if (ax < -0.5) st.left = true;
      if (ax > 0.5) st.right = true;
      if (ay < -0.5) st.up = true;
      if (ay > 0.5) st.down = true;
    }
    return st;
  }
  // Every pad button (standard mapping: 0 A · 1 B · 2 X · 3 Y · 4 LB · 5 RB · 6 LT · 7 RT ·
  // 8 View · 9 Menu · 10/11 stick clicks · 12–15 d-pad), any connected pad.
  function padButtons() {
    const out = [];
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads) {
      if (!p) continue;
      p.buttons.forEach((b, i) => { if (b && (b.pressed || b.value > 0.5)) out[i] = true; });
    }
    return out;
  }

  addEventListener('keydown', (e) => {
    const a = keys[e.code];
    if (a || claimed.has(e.code)) e.preventDefault();
    if (a) { if (!e.repeat) taps.add(a); }
    if (!e.repeat) codeTaps.add(e.code);
    held.add(e.code);
    input.first();
  });
  addEventListener('keyup', (e) => { held.delete(e.code); });
  addEventListener('blur', () => { held.clear(); btnHeld.clear(); raw.down = false; });
  return input;
}

// --------------------------------------------------------------- transitions ---
// Ordered-dither fade (4x4 Bayer) and GBA-style mosaic. No smooth alpha ramps.
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const ditherCache = new Map();
function ditherPattern(g, level, color) {
  const key = `${level}|${color}`;
  let pat = ditherCache.get(key);
  if (!pat) {
    const c = document.createElement('canvas');
    c.width = 4; c.height = 4;
    const x = c.getContext('2d');
    x.fillStyle = color;
    for (let i = 0; i < 16; i++) if (BAYER[i] < level) x.fillRect(i & 3, i >> 2, 1, 1);
    pat = g.createPattern(c, 'repeat');
    ditherCache.set(key, pat);
  }
  return pat;
}

// level 0..16: 0 = clear, 16 = solid color. Defaults to the whole target canvas.
export function ditherFill(g, level, color = '#05040a', x = 0, y = 0, w = g.canvas.width, h = g.canvas.height) {
  level = Math.max(0, Math.min(16, Math.round(level)));
  if (level === 0) return;
  if (level >= 16) { g.fillStyle = color; g.fillRect(x, y, w, h); return; }
  g.fillStyle = ditherPattern(g, level, color);
  g.fillRect(x, y, w, h);
}

// Smooth-color fade (k 0..1) for games whose look avoids dither patterns.
export function alphaFill(g, k, color = '#05040a', x = 0, y = 0, w = g.canvas.width, h = g.canvas.height) {
  k = Math.max(0, Math.min(1, k || 0));
  if (k <= 0) return;
  g.save();
  g.globalAlpha = k;
  g.fillStyle = color;
  g.fillRect(x, y, w, h);
  g.restore();
}

const mosaicTmp = typeof document !== 'undefined' ? document.createElement('canvas') : null;
export function mosaic(g, buf, size) {
  size = Math.max(1, Math.round(size));
  if (size <= 1) return;
  const W = buf.width, H = buf.height;
  const w = Math.ceil(W / size), h = Math.ceil(H / size);
  mosaicTmp.width = w; mosaicTmp.height = h;
  const t = mosaicTmp.getContext('2d');
  t.imageSmoothingEnabled = false;
  t.drawImage(buf, 0, 0, w * size, h * size, 0, 0, w, h);
  g.imageSmoothingEnabled = false;
  g.drawImage(mosaicTmp, 0, 0, w, h, 0, 0, w * size, h * size);
}

// ------------------------------------------------------------------ director ---
// One active scene plus an overlay stack (pause menu, dialogue). Scene API:
// enter(), update(), draw(g), exit(); overlays may also define `blocks`.
export class Director {
  constructor(screen, input) {
    this.screen = screen;
    this.input = input;
    this.scene = null;
    this.overlays = [];
    this.tr = null; // active transition
    this.tick = 0;
    this.after = null; // (g) => … drawn over everything, just before the frame is shown (dev meters)
  }

  go(scene, style = 'fade', frames = 18) {
    if (!this.scene) { this._swap(scene); return; }
    this.tr = { scene, style, frames, t: 0, phase: 'out' };
  }

  _swap(scene) {
    if (this.scene && this.scene.exit) this.scene.exit();
    this.overlays.length = 0;
    this.scene = scene;
    if (scene.enter) scene.enter();
    this.input.consume();
  }

  push(o) { this.overlays.push(o); if (o.enter) o.enter(); this.input.consume(); }
  pop(o) {
    const i = o ? this.overlays.indexOf(o) : this.overlays.length - 1;
    if (i >= 0) { const [x] = this.overlays.splice(i, 1); if (x.exit) x.exit(); }
    this.input.consume();
  }
  get top() { return this.overlays.length ? this.overlays[this.overlays.length - 1] : this.scene; }

  update() {
    this.tick++;
    this.input.update();
    const tr = this.tr;
    if (tr) {
      tr.t++;
      if (tr.phase === 'out' && tr.t >= tr.frames) { this._swap(tr.scene); tr.phase = 'in'; tr.t = 0; }
      else if (tr.phase === 'in' && tr.t >= tr.frames) this.tr = null;
      if (tr.phase === 'out') return; // freeze the old scene while covering it
    }
    // Scenes under an overlay keep animating (tick) but don't read input.
    if (this.overlays.length && this.scene && this.scene.idle) this.scene.idle();
    const top = this.top;
    if (top && top.update) top.update();
  }

  draw() {
    const g = this.screen.g;
    if (this.scene && this.scene.draw) this.scene.draw(g);
    for (const o of this.overlays) if (o.draw) o.draw(g);
    const tr = this.tr;
    if (tr) {
      const k = tr.phase === 'out' ? tr.t / tr.frames : 1 - tr.t / tr.frames;
      if (tr.style === 'mosaic') { mosaic(g, this.screen.buf, 1 + k * 14); ditherFill(g, Math.max(0, k * 20 - 4)); }
      else if (tr.style === 'flash') ditherFill(g, k * 16, '#fff8e8');
      else if (tr.style === 'alpha') alphaFill(g, k); // smooth fade, no dither pattern
      else ditherFill(g, k * 16);
    }
    if (this.after) this.after(g);
    this.screen.present();
  }
}

// --------------------------------------------------------------------- rng ---
export function rng(seed = 1) {
  let a = seed >>> 0;
  const f = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  f.int = (n) => Math.floor(f() * n);
  f.pick = (arr) => arr[Math.floor(f() * arr.length)];
  return f;
}

// Deterministic 2D hash → [0,1). Use for art so sprites never change between runs.
export function hash(x, y, seed = 0) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(seed | 0, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1103515245);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
