// engine/art/edits.js — Pixel Yak edit layers: the file format the studio writes and the
// code the game runtime uses to apply it. The studio applies edits with these same functions,
// so what the user paints is exactly what the game draws.
//
// One file per edited asset: <project editsDir>/<assetId>.json (docs/contracts/ART.md):
// {
//   "format": "pixel-studio-edits@1", "project": "my-game", "asset": "hero_battle",
//   "contract": { "fw": 48, "fh": 54, "ax": 22, "ay": 50 },
//   "legend": { "a": ["HAIR", 4], "b": ["INK", 1], "c": "#ff00aa" },
//   "poses": {
//     "idle_0":  { "mode": "patch", "base": "48x54:b4995a90", "at": [20, 8], "rows": ["aa.", "-.b"] },
//     "idle_1":  { "mode": "baked", "rows": [ fh rows of fw chars ] },
//     "idle_1b": { "mode": "baked", "after": "idle_1", "from": "idle_1", "rows": [ ... ] }
//   },
//   "anims": { "idle": ["idle_0", "idle_1", "idle_1b"] },
//   "notes": [{ "ts": "…", "pose": "idle_0", "text": "bigger eyes" }]
// }
// Grid chars: legend keys are colors. In a PATCH '.' = keep the generated pixel and
// '-' = erase it. In a BAKED pose '.' = transparent. A legend value is [MATERIAL, shade]
// (a palette reference, so palette edits still recolor it) or "#rrggbb" (off-palette).
// A pose that is not in the generator's pose list is a frame added in the studio; it is
// always baked and is listed after its "after" pose.
//
// Pure data helpers work in Node (the CLI uses them); canvas helpers need a DOM.

export const EDITS_FORMAT = 'pixel-studio-edits@1';

// Single characters usable as legend keys ('.', '-', ' ', '"' and '\' are reserved).
export const LEGEND_ALPHABET =
  'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789' +
  '#$%&*+=?@^~<>/|:;!()[]{}_,' +
  'ÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏÐÑÒÓÔÕÖØÙÚÛÜÝÞßàáâãäåæçèéêëìíîïðñòóôõöøùúûüýþÿ' +
  'ΑΒΓΔΕΖΗΘΙΚΛΜΝΞΟΠΡΣΤΥΦΧΨΩαβγδεζηθικλμνξοπρστυφχψω' +
  'БГДЖЗИЙЛПФЦЧШЩЪЫЬЭЮЯбвгджзийклмнптфцчшщъыьэюя';

// ------------------------------------------------------------------ colors ---
export function hexToRgb(hex) {
  const n = parseInt(String(hex).slice(1, 7), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export const rgbToHex = (r, g, b) => '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);

// A project palette is { materials: { NAME: id }, ramps: { id: ['#hex' x5] }, glow?: [NAME] }.
// makePalette indexes it both ways so rendered pixels can be read back as material+shade.
export function makePalette(src) {
  const byName = new Map(), byId = new Map(), byHex = new Map();
  const list = [];
  if (src && src.materials && src.ramps) {
    for (const [name, id] of Object.entries(src.materials)) {
      const ramp = src.ramps[id];
      if (!Array.isArray(ramp)) continue;
      const m = { name, id, ramp: ramp.map((h) => String(h).toLowerCase()), glow: false };
      m.rgb = m.ramp.map(hexToRgb);
      byName.set(name, m); byId.set(id, m); list.push(m);
      m.ramp.forEach((hex, s) => { if (!byHex.has(hex)) byHex.set(hex, [name, s]); });
    }
  }
  for (const g of (src && src.glow) || []) { const m = byName.get(g); if (m) m.glow = true; }
  return { list, byName, byId, byHex };
}

// Legend value → '#rrggbb' (null for transparent / unknown material).
export function refToHex(ref, pal) {
  if (ref == null) return null;
  if (typeof ref === 'string') return ref.toLowerCase();
  const m = pal && pal.byName.get(ref[0]);
  if (!m) return null;
  return m.ramp[Math.max(0, Math.min(m.ramp.length - 1, ref[1] | 0))];
}

// '#rrggbb' → legend value: a palette reference when the color is a ramp stop, else the hex.
export function hexToRef(hex, pal) {
  const h = hex.toLowerCase();
  const r = pal && pal.byHex.get(h);
  return r ? [r[0], r[1]] : h;
}

const refKey = (ref) => (ref == null ? '.' : typeof ref === 'string' ? ref.toLowerCase() : `${ref[0]}:${ref[1]}`);

// ------------------------------------------------------------ pose helpers ---
// Effective pose list: generator poses plus studio-added frames, each after its "after" pose.
export function effectivePoses(genPoses, edit) {
  const out = [...genPoses];
  if (!edit || !edit.poses) return out;
  for (const [name, pe] of Object.entries(edit.poses)) {
    if (out.includes(name) || !pe || pe.mode !== 'baked') continue;
    const at = pe.after ? out.indexOf(pe.after) : -1;
    // keep consecutive added frames in insertion order: skip past frames already added after `after`
    let i = at < 0 ? out.length : at + 1;
    while (i < out.length && !genPoses.includes(out[i]) && edit.poses[out[i]] && edit.poses[out[i]].after === pe.after) i++;
    out.splice(i, 0, name);
  }
  return out;
}

export function effectiveAnims(genAnims, edit) {
  const out = { ...(genAnims || {}) };
  if (edit && edit.anims) for (const [k, v] of Object.entries(edit.anims)) if (Array.isArray(v) && v.length) out[k] = [...v];
  return out;
}

// ----------------------------------------------------------- grid encoding ---
// Index arrays used by the studio: 0 = transparent, otherwise an index into `values`
// (a list of legend values). `encodePatch` / `encodeBaked` turn them into rows + legend.

// Build or extend a legend so every value used has a key. Reuses existing keys so saves
// produce small diffs. Returns { legend, keyOf: Map(refKey → char) }.
export function buildLegend(usedRefs, oldLegend = {}) {
  const legend = {};
  const keyOf = new Map();
  const taken = new Set();
  const want = new Map(usedRefs.map((r) => [refKey(r), r]));
  for (const [ch, ref] of Object.entries(oldLegend || {})) {
    const k = refKey(ref);
    if (want.has(k) && !keyOf.has(k) && ch.length === 1) { legend[ch] = ref; keyOf.set(k, ch); taken.add(ch); }
  }
  let next = 0;
  for (const [k, ref] of want) {
    if (keyOf.has(k)) continue;
    while (next < LEGEND_ALPHABET.length && taken.has(LEGEND_ALPHABET[next])) next++;
    if (next >= LEGEND_ALPHABET.length) throw new Error(`too many distinct colors for one asset (max ${LEGEND_ALPHABET.length})`);
    const ch = LEGEND_ALPHABET[next++];
    legend[ch] = ref; keyOf.set(k, ch); taken.add(ch);
  }
  return { legend, keyOf };
}

// after/base: arrays of legend values (null = transparent), length w*h.
// Returns null when nothing differs.
export function diffToPatch(base, after, w, h, keyOf) {
  let x0 = w, y0 = h, x1 = -1, y1 = -1, changed = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (refKey(base[i]) !== refKey(after[i])) {
      changed++;
      if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y;
    }
  }
  if (!changed) return null;
  const rows = [];
  for (let y = y0; y <= y1; y++) {
    let row = '';
    for (let x = x0; x <= x1; x++) {
      const i = y * w + x;
      if (refKey(base[i]) === refKey(after[i])) row += '.';
      else if (after[i] == null) row += '-';
      else row += keyOf.get(refKey(after[i]));
    }
    rows.push(row);
  }
  return { at: [x0, y0], rows, changed };
}

export function gridToRows(vals, w, h, keyOf) {
  const rows = [];
  for (let y = 0; y < h; y++) {
    let row = '';
    for (let x = 0; x < w; x++) { const v = vals[y * w + x]; row += v == null ? '.' : keyOf.get(refKey(v)); }
    rows.push(row);
  }
  return rows;
}

// Every legend value used by an edit file's poses (for re-keying on save).
export function refsInEdit(edit) {
  const used = new Map();
  const legend = (edit && edit.legend) || {};
  for (const pe of Object.values((edit && edit.poses) || {})) {
    for (const row of pe.rows || []) for (const ch of row) {
      if (ch === '.' || ch === '-') continue;
      const ref = legend[ch];
      if (ref !== undefined) used.set(refKey(ref), ref);
    }
  }
  return [...used.values()];
}

// Visit every pixel a pose edit sets: fn(x, y, ref | null) where null = erase / transparent.
// Patches skip '.', baked poses report '.' as transparent.
export function forEachEditPixel(pe, legend, fn) {
  if (!pe || !pe.rows) return;
  const baked = pe.mode === 'baked';
  const [ox, oy] = baked ? [0, 0] : (pe.at || [0, 0]);
  for (let j = 0; j < pe.rows.length; j++) {
    const row = pe.rows[j];
    let i = 0;
    for (const ch of row) {
      if (ch === '.') { if (baked) fn(ox + i, oy + j, null); }
      else if (ch === '-') fn(ox + i, oy + j, null);
      else { const ref = legend[ch]; if (ref !== undefined) fn(ox + i, oy + j, ref); }
      i++;
    }
  }
}

// ---------------------------------------------------------- validation ---
const ID_RE = /^[A-Za-z0-9_.-]{1,96}$/;
// Shape check used by the studio, the CLI and the runtime before trusting a file.
export function checkEdit(edit) {
  const errs = [];
  if (!edit || typeof edit !== 'object') return ['not an object'];
  if (edit.format !== EDITS_FORMAT) errs.push(`format must be "${EDITS_FORMAT}"`);
  if (!ID_RE.test(String(edit.asset || ''))) errs.push('bad asset id');
  if (edit.legend && typeof edit.legend !== 'object') errs.push('legend must be an object');
  for (const [ch, ref] of Object.entries(edit.legend || {})) {
    if (ch.length !== 1 || ch === '.' || ch === '-') errs.push(`bad legend key "${ch}"`);
    const ok = (typeof ref === 'string' && /^#[0-9a-fA-F]{6}$/.test(ref)) ||
      (Array.isArray(ref) && typeof ref[0] === 'string' && Number.isInteger(ref[1]) && ref[1] >= 0 && ref[1] <= 9);
    if (!ok) errs.push(`bad legend value for "${ch}"`);
  }
  for (const [name, pe] of Object.entries(edit.poses || {})) {
    if (!ID_RE.test(name)) errs.push(`bad pose name "${name}"`);
    if (!pe || (pe.mode !== 'patch' && pe.mode !== 'baked')) { errs.push(`pose ${name}: mode must be patch|baked`); continue; }
    if (!Array.isArray(pe.rows) || pe.rows.some((r) => typeof r !== 'string')) errs.push(`pose ${name}: rows must be strings`);
    if (pe.mode === 'patch' && !(Array.isArray(pe.at) && pe.at.length === 2)) errs.push(`pose ${name}: patch needs "at": [x, y]`);
  }
  for (const [k, v] of Object.entries(edit.anims || {})) {
    if (!ID_RE.test(k) || !Array.isArray(v) || v.some((p) => !ID_RE.test(String(p)))) errs.push(`bad anim "${k}"`);
  }
  return errs;
}

// Light per-asset summary for lists (the studio's asset flags, `edits` in the CLI).
export function summarizeEdit(ed) {
  const poses = {};
  for (const [pose, pe] of Object.entries((ed && ed.poses) || {})) {
    poses[pose] = { mode: pe.mode, changed: pe.changed ?? null, added: !!pe.after || !!pe.from, base: pe.base || null, updated: pe.updated || null };
  }
  return { poses, anims: Object.keys((ed && ed.anims) || {}), notes: ((ed && ed.notes) || []).length, updated: (ed && ed.updated) || null };
}

// Source of the generated index module the game imports (one per project editsDir). The object
// literal is plain JSON (no trailing comma), so parseEditsIndexSource can read it back without
// importing it — a running game re-reads edits by fetch, never by re-importing a module per save.
// jsonOf(id, edit) may return a cached JSON.stringify of the edit.
export function editsIndexSource(editsById, jsonOf = (id, ed) => JSON.stringify(ed)) {
  const ids = Object.keys(editsById).sort();
  const body = ids.map((id) => `  ${JSON.stringify(id)}: ${jsonOf(id, editsById[id])}`).join(',\n');
  return [
    '// GENERATED by Pixel Yak from the *.json files in this folder. Do not edit by hand:',
    '// edit the JSON (or paint in the studio) and run `node cli/yak.mjs edits-index <project>`.',
    `export const EDITS = {${ids.length ? '\n' + body + '\n' : ''}};`,
    '',
  ].join('\n');
}

// The EDITS object from an index module's source text (also reads older indexes, which ended
// every entry with a comma).
export function parseEditsIndexSource(text) {
  const at = text.indexOf('{', text.indexOf('export const EDITS'));
  const end = text.lastIndexOf('}');
  if (at < 0 || end < at) throw new Error('not an edits index');
  return JSON.parse(text.slice(at, end + 1).replace(/,(\s*)}$/, '$1}'));
}

// --------------------------------------------------------------- canvas side ---
const hasDom = () => typeof document !== 'undefined';

function newCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

export function fnv1a(bytes) {
  let h = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i++) { h ^= bytes[i]; h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}

// Fingerprint of a rendered canvas: "WxH:hash". A patch stores the fingerprint of the
// generator output it was painted on, so drift (generator changed underneath) is visible.
export function canvasHash(c) {
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  return `${c.width}x${c.height}:${fnv1a(d)}`;
}

// Apply one pose's patch to a generated canvas → new canvas (the input is not modified).
export function applyPatchToCanvas(src, pe, legend, pal) {
  if (!hasDom()) throw new Error('applyPatchToCanvas needs a DOM');
  const c = newCanvas(src.width, src.height);
  const g = c.getContext('2d');
  g.drawImage(src, 0, 0);
  const img = g.getImageData(0, 0, c.width, c.height);
  writePixels(img, pe, legend, pal);
  g.putImageData(img, 0, 0);
  return c;
}

// Render a baked pose (or a studio-added frame) → canvas of the contract size.
export function bakedToCanvas(pe, legend, pal, w, h) {
  if (!hasDom()) throw new Error('bakedToCanvas needs a DOM');
  const c = newCanvas(w, h);
  const g = c.getContext('2d');
  const img = g.createImageData(w, h);
  writePixels(img, pe, legend, pal);
  g.putImageData(img, 0, 0);
  return c;
}

function writePixels(img, pe, legend, pal) {
  const { width: w, height: h, data: d } = img;
  forEachEditPixel(pe, legend, (x, y, ref) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const k = (y * w + x) * 4;
    const hex = refToHex(ref, pal);
    if (!hex) { d[k] = d[k + 1] = d[k + 2] = d[k + 3] = 0; return; }
    const [r, g, b] = hexToRgb(hex);
    d[k] = r; d[k + 1] = g; d[k + 2] = b; d[k + 3] = 255;
  });
}

// Read a canvas back into legend values (null = transparent). Colors that are ramp stops
// become [MATERIAL, shade]; anything else stays "#rrggbb". Partial alpha counts as opaque.
export function canvasToRefs(c, pal) {
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  const out = new Array(c.width * c.height);
  const memo = new Map();
  for (let i = 0, k = 0; i < out.length; i++, k += 4) {
    if (!d[k + 3]) { out[i] = null; continue; }
    const hex = rgbToHex(d[k], d[k + 1], d[k + 2]);
    let ref = memo.get(hex);
    if (ref === undefined) { ref = hexToRef(hex, pal); memo.set(hex, ref); }
    out[i] = ref;
  }
  return out;
}
