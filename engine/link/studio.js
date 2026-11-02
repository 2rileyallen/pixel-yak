// engine/link/studio.js — the game ↔ studio link every game imports (docs/contracts/TUNING.md,
// docs/contracts/MOMENTS.md).
//
//   import { studio } from '../../../engine/link/studio.js';
//   studio.attach(screen);                                   // optional: the panel uses the game's pixels
//   const speed = studio.knob('Hero walk speed', 1.0, { min: 0.5, max: 2, step: 0.1 });
//   const title = studio.variant('Title music', ['A · calm harp', 'B · war drums']);
//   x += speed() * dt;  playSong(SONGS[title()]);            // read them every frame: a plain call
//   studio.onMoment(() => ({ state: { scene, hp }, save: saveGame() }));
//   const save = await studio.loadMoment();                  // ?moment=<file>: boot into a saved moment
//
// F8 tuning works in a game launched from Pixel Yak (window.studioLink) or opened with ?tune=1.
// Anywhere else (a shipped build) every knob and variant is its code default, F8 does nothing and
// nothing is drawn, listened to or recorded. The panel and the frame recorder are only loaded
// when they're used.

const HAS_DOM = typeof window !== 'undefined' && typeof document !== 'undefined';
const params = HAS_DOM ? new URLSearchParams(location.search) : null;
const bridge = HAS_DOM && window.studioLink ? window.studioLink : null;
const ON = !!bridge || (!!params && params.get('tune') === '1');

const items = [];          // knobs and variants in the order the game made them
const bySlug = new Map();  // slug -> item
let screenRef = null;      // from attach(screen)
let momentFn = null;       // from onMoment(fn)

// "Hero walk speed" -> "hero-walk-speed" (the file name in games/<id>/tuning/)
export function slugOf(name) {
  return String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'knob';
}

// ------------------------------------------------------------ live values ---
// A live value is kept per game origin ({ v, d }); it only applies while the code's default is
// still d, so a default the AI changed in the code wins over an old experiment.
const LIVE = 'yak-tune:', KEPT = 'yak-tune-kept:';
function readStore(key) { try { const s = localStorage.getItem(key); return s == null ? undefined : JSON.parse(s); } catch { return undefined; } }
function writeStore(key, v) { try { if (v === undefined) localStorage.removeItem(key); else localStorage.setItem(key, JSON.stringify(v)); } catch { /* storage off: values just don't persist */ } }

const decimalsOf = (step) => { const s = String(step); const i = s.indexOf('.'); return i < 0 ? 0 : Math.min(6, s.length - i - 1); };
// "A · calm harp" -> "A"; otherwise A, B, C by position
const letterOf = (opt, i) => { const m = /^\s*([A-Za-z0-9])\s*(?:·|\.|:|\)|-|—)/.exec(String(opt)); return m ? m[1].toUpperCase() : String.fromCharCode(65 + (i % 26)); };

function register(item) {
  items.push(item);
  bySlug.set(item.slug, item);
  const live = readStore(LIVE + item.slug);
  if (live && JSON.stringify(live.d) === JSON.stringify(item.def)) item.set(live.v, { quiet: true });
  const kept = readStore(KEPT + item.slug);
  if (kept !== undefined) item.kept = kept;
  return item;
}
function remember(item) {
  writeStore(LIVE + item.slug, item.changed() ? { v: item.value, d: item.def } : undefined);
}

// ------------------------------------------------------------------ knobs ---
// A number the user can slide live. Returns a getter: speed() is the value now.
function knob(name, def, opts = {}) {
  def = Number(def);
  if (!Number.isFinite(def)) def = 0;
  if (!ON) return () => def;
  const slug = slugOf(name);
  const have = bySlug.get(slug);
  if (have) return have.get;
  let min = Number.isFinite(opts.min) ? opts.min : def > 0 ? 0 : def < 0 ? def * 2 : 0;
  let max = Number.isFinite(opts.max) ? opts.max : def > 0 ? def * 2 : def < 0 ? 0 : 1;
  if (!(max > min)) max = min + 1;
  const step = Number.isFinite(opts.step) && opts.step > 0 ? opts.step : Number.isInteger(def) && Number.isInteger(min) && Number.isInteger(max) && max - min >= 4 ? 1 : (max - min) / 20;
  const dec = decimalsOf(step);
  const snap = (v) => {
    const n = Math.round((Number(v) - min) / step) * step + min;
    return Number(Math.min(max, Math.max(min, n)).toFixed(dec));
  };
  let value = snap(def);
  const get = () => value;
  const item = {
    kind: 'knob', name: String(name), slug, def: snap(def), min, max, step, get, kept: undefined,
    get value() { return value; },
    set(v, { quiet = false } = {}) { const n = snap(v); if (!Number.isFinite(n) || n === value) return; value = n; if (!quiet) remember(item); },
    nudge(steps) { item.set(value + steps * step); },
    reset() { value = item.def; remember(item); },
    changed: () => value !== item.def,
    format: (v = value) => Number(v).toFixed(dec),
    label: () => item.format(),
    frac: (v = value) => (v - min) / (max - min),
  };
  return register(item).get;
}

// --------------------------------------------------------------- variants ---
// 2–4 real alternatives, flipped live. Returns a getter: title() is the chosen option itself
// (use it as a key: SONGS[title()], sprite(roof(), pose)); title.index() is its position.
function variant(name, options, opts = {}) {
  const list = Array.isArray(options) && options.length ? options.slice(0, 26) : [''];
  const d = opts.default;
  const defIdx = Number.isInteger(d) && d >= 0 && d < list.length ? d : Math.max(0, list.indexOf(d));
  if (!ON) { const v = list[defIdx]; const f = () => v; f.index = () => defIdx; return f; }
  const slug = slugOf(name);
  const have = bySlug.get(slug);
  if (have) return have.get;
  let idx = defIdx;
  const get = () => list[idx];
  get.index = () => idx;
  const item = {
    kind: 'variant', name: String(name), slug, options: list, def: list[defIdx], defIndex: defIdx, get, kept: undefined,
    get value() { return list[idx]; },
    get index() { return idx; },
    set(v, { quiet = false } = {}) { const i = list.findIndex((o) => JSON.stringify(o) === JSON.stringify(v)); if (i >= 0) item.choose(i, { quiet }); },
    choose(i, { quiet = false } = {}) { i = ((i % list.length) + list.length) % list.length; if (i === idx) return; idx = i; if (!quiet) remember(item); },
    nudge(steps) { item.choose(idx + steps); },
    reset() { idx = defIdx; remember(item); },
    changed: () => idx !== defIdx,
    letter: (i = idx) => letterOf(list[i], i),
    label: (i = idx) => String(list[i]),
  };
  return register(item).get;
}

// ------------------------------------------------------------------- keep ---
// Keep the current value: the studio writes games/<id>/tuning/<slug>.json and a lesson line.
// With ?tune=1 outside the studio there are no files to write, so the choice is copied instead.
async function keep(item, note = '') {
  const choice = {
    name: item.name, slug: item.slug, kind: item.kind, chosen: item.value, label: item.kind === 'variant' ? item.label() : item.format(),
    default: item.def, note: String(note || '').slice(0, 300), at: new Date().toISOString(),
    ...(item.kind === 'knob' ? { range: { min: item.min, max: item.max, step: item.step } } : { options: item.options.slice() }),
  };
  let r;
  if (bridge && typeof bridge.keep === 'function') r = await bridge.keep(choice);
  else {
    const line = `Tuning kept: ${choice.name} = ${choice.label} (code default ${JSON.stringify(choice.default)})${choice.note ? ` — ${choice.note}` : ''}`;
    console.info('[tune]', line);
    let copied = false;
    try { await navigator.clipboard.writeText(line); copied = true; } catch { /* no clipboard: the console line is it */ }
    r = { ok: true, copied };
  }
  if (r && r.ok !== false) { item.kept = item.value; writeStore(KEPT + item.slug, item.value); }
  return r || { ok: false, error: 'no answer from the studio' };
}

// ---------------------------------------------------------------- moments ---
// What F9 attaches: { state, save } from the game's onMoment(fn). A function that returns
// anything else is taken as the state. window.__studioMoment() still works (state only).
function readMoment() {
  let r = null;
  if (momentFn) r = momentFn();
  else if (HAS_DOM && typeof window.__studioMoment === 'function' && !window.__studioMoment.byLink) r = window.__studioMoment();
  if (r && typeof r === 'object' && !Array.isArray(r) && ('state' in r || 'save' in r)) return { state: r.state ?? null, save: r.save ?? null };
  return { state: r ?? null, save: null };
}

function onMoment(fn) {
  if (typeof fn !== 'function') return;
  momentFn = fn;
  // capture tests and older tools read the state through window.__studioMoment()
  if (HAS_DOM && typeof window.__studioMoment !== 'function') {
    const f = () => readMoment().state;
    f.byLink = true;
    window.__studioMoment = f;
  }
}

// ?moment=<file> (relative to the game's page, same origin only): the save from an F9 moment, so a
// game can boot into it — headless, to reproduce what the user saw. null when there's none.
async function loadMoment() {
  const src = params && params.get('moment');
  if (!src) return null;
  let url;
  try { url = new URL(src, location.href); } catch { return null; }
  if (url.protocol !== location.protocol || url.host !== location.host) { console.warn('[studio] ?moment= must be a file of this game, ignored:', src); return null; }
  try {
    const data = (await import(url.href, { with: { type: 'json' } })).default;
    return data && typeof data === 'object' && 'save' in data ? data.save : data;
  } catch (err) {
    console.error('[studio] could not load the moment', src, err.message);
    return null;
  }
}

// ------------------------------------------------------------------ wiring ---
function gameCanvas() {
  if (screenRef && screenRef.canvas) return screenRef.canvas;
  let best = null, area = 0;
  for (const c of document.querySelectorAll('canvas')) {
    if (c.dataset.yakLink) continue;
    const a = c.width * c.height;
    if (a > area) { best = c; area = a; }
  }
  return best;
}
const gameScale = () => (screenRef && screenRef.scale) || null;
const gameSize = () => (screenRef ? { w: screenRef.w, h: screenRef.h } : null);

let panel = null;
function togglePanel() {
  panel = panel || import('./panel.js').then((m) => m.createPanel({ items, keep, gameCanvas, gameScale, inStudio: !!bridge }));
  panel.then((p) => p.toggle()).catch((err) => console.error('[studio] F8 panel:', err));
}

const list = () => items.map((i) => ({ name: i.name, slug: i.slug, kind: i.kind, value: i.value, default: i.def, kept: i.kept }));
const setByName = (name, v) => { const i = bySlug.get(slugOf(name)); if (i) i.set(v); return i ? i.value : undefined; };

if (ON) {
  // F8 opens and closes the panel; nothing else is listened to until it's open
  addEventListener('keydown', (e) => {
    if (e.key !== 'F8' && e.code !== 'F8') return;
    e.preventDefault(); e.stopImmediatePropagation();
    if (!e.repeat) togglePanel();
  }, true);
  // for tools and headless tests: window.__yakLink.tune.set('Hero walk speed', 1.4)
  window.__yakLink = {
    version: 1,
    tune: {
      list, set: setByName,
      keep: (name, note) => { const i = bySlug.get(slugOf(name)); return i ? keep(i, note) : Promise.resolve({ ok: false, error: `no knob or variant "${name}"` }); },
    },
  };
}

if (bridge) {
  // F9 in the studio: the last ~5 seconds (a small ring of frames), the state and a save-state.
  // The studio calls window.__yakLink.moment() when the user presses F9.
  const recorder = import('./moments.js').then((m) => m.startRecorder({ gameCanvas, gameSize }));
  Object.assign(window.__yakLink, {
    async moment() {
      const out = { link: 1, at: new Date().toISOString(), state: null, save: null, strip: null, frames: 0, seconds: 0, tuning: [] };
      try { Object.assign(out, readMoment()); } catch (err) { out.error = `onMoment failed: ${err.message}`; }
      out.tuning = items.filter((i) => i.changed()).map((i) => ({ name: i.name, value: i.value, default: i.def }));
      try { Object.assign(out, (await recorder).strip()); } catch (err) { out.stripError = err.message; }
      try { return JSON.stringify(out); } catch (err) {
        out.save = null; out.error = `the save could not be turned into JSON: ${err.message}`;
        try { return JSON.stringify(out); } catch { out.state = null; return JSON.stringify(out); }
      }
    },
  });
}

export const studio = {
  // true when F8 tuning is live: launched from Pixel Yak, or ?tune=1
  on: ON,
  // true only inside Pixel Yak (F9 moments, Keep writes files)
  inStudio: !!bridge,
  knob,
  variant,
  onMoment,
  loadMoment,
  // Optional: the game's screen (engine/shell/runtime.js createScreen) — the panel then draws at
  // the game's own pixel size and F9's frames are taken at its native resolution.
  attach(screen) { screenRef = screen || null; return screen; },
  // every knob and variant (for tools and tests): [{ name, slug, kind, value, default, kept }]
  list,
  // set one by name from a test or the console: studio.set('Hero walk speed', 1.4)
  set: setByName,
};
