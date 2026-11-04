// engine/sound/edits.js — the user's sound edits: the file format the studio writes and the code
// that lays them over the AI's songs, sound effects and instruments when a game loads. The AI's
// song code is never rewritten; the user's changes live in their own files and survive the AI
// changing the song (a change under an edit is flagged as drift, like painted-over art).
//
// Files in the game's sound edits folder (default game/sound/edits/, docs/contracts/SOUND.md):
//   song.<id>.json      { format, kind: 'song', game, song, updated,
//                         bpm?, baseBpm?,                                   tempo the user set
//                         tracks: { '<section>/<trackKey>': {
//                           base: '<hash of the AI notes when saved>', len?,  drift check
//                           steps: { '<step>': '<token>' },                 the notes the user changed
//                           vol?, pan?, echo?, mute?, set?: { param: v } } }, the mix + instrument overrides
//                         added: [{ id, section, inst, notes, vol?, pan?, echo?, from? }],  tracks the user added
//                         notes: [{ ts, text }] }                            the user's words
//   sfx.<id>.json       { format, kind: 'sfx', game, sfx, base, vol?, layers: { '<index>': { from: 900, … } }, notes }
//   instruments.json    { format, kind: 'instruments', game, instruments: { <id>: { set: { param: v }, base: { param: aiValue } } } }
//   index.js            generated: export const SOUND_EDITS = { songs: {…}, sfx: {…}, instruments: {…} };
import { tokenize, formatTokens, trackKeys, hashTokens, hashText, stableJson, stepsPerBar, tokenPitch, TRACK_FIELDS } from './notation.js';

// The format this version writes, and every format it reads, as plain strings (the studio reads the
// list from each game's engine copy as text). A format's meaning never changes; a new one is added to
// the list and an old one is never dropped (docs/contracts/SOUND.md → Versions).
export const SOUND_EDIT_FORMAT = 'pixel-yak-sound-edit@1';
export const SOUND_EDIT_FORMATS = Object.freeze(['pixel-yak-sound-edit@1']);
export const EMPTY_EDITS = Object.freeze({ songs: {}, sfx: {}, instruments: {} });
const MIX = ['vol', 'pan', 'echo', 'mute'];
const clone = (o) => (o == null ? o : JSON.parse(JSON.stringify(o)));
export const ID_RE = /^[A-Za-z0-9_.-]{1,96}$/;

// ------------------------------------------------------------------- apply ---
// A song + its edit → { song (a new object), drift: [track keys], orphans: [track keys] }.
export function applySongEdit(song, ed) {
  const out = clone(song);
  const drift = [], orphans = [];
  if (!ed || !out || !out.sections) return { song: out, drift, orphans };
  if (Number.isFinite(+ed.bpm) && +ed.bpm > 0) {
    out.bpm = +ed.bpm;
    if (ed.baseBpm != null && +song.bpm !== +ed.baseBpm) drift.push('tempo');
  }
  const bar = stepsPerBar(out);
  for (const [k, te] of Object.entries(ed.tracks || {})) {
    const [sk, ...rest] = k.split('/');
    const key = rest.join('/');
    const sec = out.sections[sk];
    const tracks = sec && Array.isArray(sec.tracks) ? sec.tracks : null;
    const i = tracks ? trackKeys(tracks).indexOf(key) : -1;
    if (i < 0) { orphans.push(k); continue; }
    const tr = tracks[i];
    if (te.steps && Object.keys(te.steps).length || te.len != null) {
      const tokens = tokenize(tr.notes);
      if (te.base && hashTokens(tokens) !== te.base) drift.push(k);
      const len = te.len != null ? Math.max(0, te.len | 0) : tokens.length;
      while (tokens.length < len) tokens.push('.');
      tokens.length = len;
      for (const [s, tok] of Object.entries(te.steps || {})) {
        const n = s | 0;
        if (n >= 0 && n < len && typeof tok === 'string' && tok) tokens[n] = tok;
      }
      tr.notes = formatTokens(tokens, bar);
    }
    for (const f of MIX) if (te[f] !== undefined) tr[f] = te[f];
    if (te.set && typeof te.set === 'object') for (const [p, v] of Object.entries(te.set)) if (!TRACK_FIELDS.has(p)) tr[p] = v;
  }
  for (const a of ed.added || []) {
    const sec = out.sections[a.section];
    if (!sec || !Array.isArray(sec.tracks)) { orphans.push(`${a.section}/${a.id}`); continue; }
    const t = { id: a.id, inst: a.inst, notes: String(a.notes || ''), name: a.name || a.id, added: a.from || 'studio' };
    for (const f of MIX) if (a[f] !== undefined) t[f] = a[f];
    sec.tracks.push(t);
  }
  return { song: out, drift, orphans };
}

// A sound effect + its edit → { sfx, drift, orphans }.
export function applySfxEdit(recipe, ed) {
  const out = clone(recipe) || { layers: [] };
  const drift = [], orphans = [];
  if (!ed) return { sfx: out, drift, orphans };
  if (ed.base && hashText(stableJson(recipe)) !== ed.base) drift.push('recipe');
  if (Number.isFinite(+ed.vol)) out.vol = +ed.vol;
  for (const [i, set] of Object.entries(ed.layers || {})) {
    const L = out.layers && out.layers[i | 0];
    if (!L) { orphans.push(`layer ${(i | 0) + 1}`); continue; }
    for (const [p, v] of Object.entries(set || {})) L[p] = v;
  }
  return { sfx: out, drift, orphans };
}

// Instruments + the instruments edit → { instruments, drift: ['lead.bright'], orphans: ['flute'] }.
export function applyInstrumentEdits(instruments, ed) {
  const out = clone(instruments) || {};
  const drift = [], orphans = [];
  for (const [id, ie] of Object.entries((ed && ed.instruments) || {})) {
    if (!out[id]) { orphans.push(id); continue; }
    for (const [p, v] of Object.entries(ie.set || {})) {
      if (ie.base && p in ie.base && stableJson(instruments[id][p]) !== stableJson(ie.base[p])) drift.push(`${id}.${p}`);
      out[id][p] = v;
    }
  }
  return { instruments: out, drift, orphans };
}

// Everything at once: { songs, sfx, instruments } + SOUND_EDITS → the same shape with the user's
// changes on top, and report: { drift: ['song theme: A/lead', …], orphans: [...] }.
export function applySoundEdits(base, edits) {
  const E = edits || EMPTY_EDITS;
  const report = { drift: [], orphans: [] };
  const inst = applyInstrumentEdits(base.instruments || {}, E.instruments || null);
  inst.drift.forEach((d) => report.drift.push(`instrument ${d}`));
  inst.orphans.forEach((d) => report.orphans.push(`instrument ${d}`));
  const songs = {};
  for (const [id, s] of Object.entries(base.songs || {})) {
    const r = applySongEdit(s, E.songs && E.songs[id]);
    songs[id] = r.song;
    r.drift.forEach((d) => report.drift.push(`song ${id}: ${d}`));
    r.orphans.forEach((d) => report.orphans.push(`song ${id}: ${d}`));
  }
  for (const id of Object.keys(E.songs || {})) if (!(base.songs || {})[id]) report.orphans.push(`song ${id}`);
  const sfx = {};
  for (const [id, s] of Object.entries(base.sfx || {})) {
    const r = applySfxEdit(s, E.sfx && E.sfx[id]);
    sfx[id] = r.sfx;
    r.drift.forEach((d) => report.drift.push(`sfx ${id}: ${d}`));
    r.orphans.forEach((d) => report.orphans.push(`sfx ${id}: ${d}`));
  }
  for (const id of Object.keys(E.sfx || {})) if (!(base.sfx || {})[id]) report.orphans.push(`sfx ${id}`);
  return { songs, sfx, instruments: inst.instruments, report };
}

// -------------------------------------------------------------------- make ---
// The edit that turns the AI's song into the user's working copy (the studio keeps a whole
// edited song while you work; saving stores only what differs). Tracks the user added carry
// `added` (where they came from: 'hum', 'midi', 'studio'). prev: the edit on disk (keeps notes).
export function makeSongEdit(baseSong, working, { game = null, song = null, prev = null } = {}) {
  const ed = { format: SOUND_EDIT_FORMAT, kind: 'song', game, song, tracks: {}, added: [], notes: prev && Array.isArray(prev.notes) ? prev.notes.slice(-40) : [] };
  if (+working.bpm !== +baseSong.bpm) { ed.bpm = +working.bpm; ed.baseBpm = +baseSong.bpm; }
  for (const [sk, sec] of Object.entries(working.sections || {})) {
    const bsec = baseSong.sections && baseSong.sections[sk];
    const own = (sec.tracks || []).filter((t) => !t.added);
    const keys = trackKeys(own);
    const bkeys = bsec ? trackKeys(bsec.tracks || []) : [];
    own.forEach((t, i) => {
      const bi = bkeys.indexOf(keys[i]);
      if (bi < 0) return;
      const bt = bsec.tracks[bi];
      const te = {};
      const a = tokenize(bt.notes), b = tokenize(t.notes);
      const steps = {};
      for (let s = 0; s < b.length; s++) if (a[s] !== b[s]) steps[s] = b[s];
      if (Object.keys(steps).length || a.length !== b.length) { te.base = hashTokens(a); te.steps = steps; if (a.length !== b.length) te.len = b.length; }
      for (const f of MIX) if (stableJson(t[f]) !== stableJson(bt[f]) && t[f] !== undefined) te[f] = t[f];
      const set = {};
      for (const [p, v] of Object.entries(t)) if (!TRACK_FIELDS.has(p) && stableJson(v) !== stableJson(bt[p])) set[p] = v;
      if (Object.keys(set).length) te.set = set;
      if (Object.keys(te).length) ed.tracks[`${sk}/${keys[i]}`] = te;
    });
    for (const t of (sec.tracks || []).filter((x) => x.added)) {
      const a = { id: String(t.id), section: sk, inst: t.inst, notes: formatTokens(tokenize(t.notes), stepsPerBar(working)), from: t.added === true ? 'studio' : String(t.added) };
      if (t.name && t.name !== t.id) a.name = t.name;
      for (const f of MIX) if (t[f] !== undefined) a[f] = t[f];
      ed.added.push(a);
    }
  }
  if (!ed.added.length) delete ed.added;
  return ed;
}

export function makeSfxEdit(baseRecipe, working, { game = null, sfx = null, prev = null } = {}) {
  const ed = { format: SOUND_EDIT_FORMAT, kind: 'sfx', game, sfx, base: hashText(stableJson(baseRecipe)), layers: {}, notes: prev && Array.isArray(prev.notes) ? prev.notes.slice(-40) : [] };
  if (stableJson(working.vol) !== stableJson(baseRecipe.vol) && working.vol !== undefined) ed.vol = working.vol;
  (working.layers || []).forEach((L, i) => {
    const B = (baseRecipe.layers || [])[i] || {};
    const set = {};
    for (const [p, v] of Object.entries(L)) if (stableJson(v) !== stableJson(B[p])) set[p] = v;
    if (Object.keys(set).length) ed.layers[i] = set;
  });
  return ed;
}

// working: { id: params } for the instruments the user touched. → the instruments edit.
export function makeInstrumentEdits(baseInstruments, working, { game = null } = {}) {
  const ed = { format: SOUND_EDIT_FORMAT, kind: 'instruments', game, instruments: {} };
  for (const [id, params] of Object.entries(working || {})) {
    const B = baseInstruments[id];
    if (!B) continue;
    const set = {}, base = {};
    for (const [p, v] of Object.entries(params)) if (stableJson(v) !== stableJson(B[p])) { set[p] = v; base[p] = B[p] === undefined ? null : B[p]; }
    if (Object.keys(set).length) ed.instruments[id] = { set, base };
  }
  return ed;
}

export const isEmptyEdit = (ed) => !ed || (ed.kind === 'song' ? !Object.keys(ed.tracks || {}).length && !(ed.added || []).length && ed.bpm == null
  : ed.kind === 'sfx' ? !Object.keys(ed.layers || {}).length && ed.vol == null
  : !Object.keys(ed.instruments || {}).length);

// ------------------------------------------------------------------ check ---
// `formats`: the formats accepted (default: every one this engine reads).
export function checkSoundEdit(ed, formats = SOUND_EDIT_FORMATS) {
  const errs = [];
  if (!ed || typeof ed !== 'object') return ['not an object'];
  if (!formats.includes(ed.format)) errs.push(`format ${JSON.stringify(ed.format ?? null)} isn't one this engine reads (${formats.join(', ')})`);
  if (!['song', 'sfx', 'instruments'].includes(ed.kind)) errs.push('kind must be song, sfx or instruments');
  const tok = (t) => typeof t === 'string' && t.length > 0 && t.length <= 64 && !/\s/.test(t);
  if (ed.kind === 'song') {
    if (!ID_RE.test(String(ed.song || ''))) errs.push('song id missing or invalid');
    if (ed.bpm != null && !(+ed.bpm >= 20 && +ed.bpm <= 400)) errs.push('bpm out of range (20–400)');
    for (const [k, te] of Object.entries(ed.tracks || {})) {
      if (!/^[^/\s]{1,48}\/[^\s]{1,96}$/.test(k)) { errs.push(`track key "${k}" must be "<section>/<track>"`); continue; }
      for (const [s, t] of Object.entries((te && te.steps) || {})) if (!/^\d{1,5}$/.test(s) || !tok(t)) { errs.push(`${k}: bad step ${s} = ${JSON.stringify(t)}`); break; }
      if (te.len != null && !(Number.isInteger(te.len) && te.len >= 0 && te.len <= 4096)) errs.push(`${k}: bad len`);
    }
    for (const a of ed.added || []) {
      if (!a || !ID_RE.test(String(a.id || '')) || typeof a.section !== 'string' || typeof a.inst !== 'string' || typeof a.notes !== 'string') { errs.push('an added track needs id, section, inst and notes'); break; }
      if (a.notes.length > 200000) errs.push(`added track ${a.id} is too long`);
    }
  } else if (ed.kind === 'sfx') {
    if (!ID_RE.test(String(ed.sfx || ''))) errs.push('sfx id missing or invalid');
    for (const [i, set] of Object.entries(ed.layers || {})) if (!/^\d{1,3}$/.test(i) || !set || typeof set !== 'object') { errs.push(`bad layer ${i}`); break; }
  } else if (ed.kind === 'instruments') {
    for (const [id, ie] of Object.entries(ed.instruments || {})) if (!ID_RE.test(id) || !ie || typeof ie.set !== 'object') { errs.push(`bad instrument edit ${id}`); break; }
  }
  return errs;
}

// --------------------------------------------------------------- the index ---
export function editsIndexSource(all) {
  const body = JSON.stringify({ songs: all.songs || {}, sfx: all.sfx || {}, instruments: all.instruments || {} });
  return `// Generated by Pixel Yak from the sound edit files next to this one — don't edit by hand\n// (the user's own changes to the music and sound effects; docs/contracts/SOUND.md).\nexport const SOUND_EDITS = ${body};\n`;
}
export function parseEditsIndexSource(text) {
  const m = /export const SOUND_EDITS = (\{[\s\S]*\});\s*$/.exec(String(text || ''));
  if (!m) return { songs: {}, sfx: {}, instruments: {} };
  try { return JSON.parse(m[1]); } catch { return { songs: {}, sfx: {}, instruments: {} }; }
}

// -------------------------------------------------------- what changed (lessons) ---
// Steps that differ between two token lists, grouped into the bars they touch, with the
// before/after notation of just those bars (what an AI reads to learn from the edit).
export function diffTracks(a, b, barSteps = 16) {
  const steps = [];
  const n = Math.max(a.length, b.length);
  for (let s = 0; s < n; s++) if ((a[s] ?? '') !== (b[s] ?? '')) steps.push({ step: s, before: a[s] ?? '', after: b[s] ?? '' });
  if (!steps.length) return null;
  const bars = [...new Set(steps.map((x) => Math.floor(x.step / barSteps)))];
  const slice = (t) => bars.map((bi) => t.slice(bi * barSteps, (bi + 1) * barSteps).join(' ')).join(' | ');
  let up = 0, down = 0, rests = 0, ties = 0, notes = 0;
  for (const x of steps) {
    const p0 = tokenPitch(x.before), p1 = tokenPitch(x.after);
    if (p0 != null && p1 != null) { if (p1 > p0) up += p1 - p0; else down += p0 - p1; notes++; }
    else if (x.after === '.') rests++;
    else if (x.after === '-') ties++;
    else notes++;
  }
  return { steps, bars: bars.map((b2) => b2 + 1), before: slice(a), after: slice(b), up, down, rests, ties, notes };
}

// Two versions of a song (e.g. the last save and now) → a list of changes, each one line-able:
// { what: 'notes'|'mix'|'tempo'|'track-added'|'track-removed'|'track-param', track?, … }
export function songChanges(before, after) {
  const out = [];
  if (+before.bpm !== +after.bpm) out.push({ what: 'tempo', before: +before.bpm, after: +after.bpm });
  const bar = stepsPerBar(after);
  for (const [sk, sec] of Object.entries(after.sections || {})) {
    const bsec = (before.sections || {})[sk] || { tracks: [] };
    const keys = trackKeys(sec.tracks || []), bkeys = trackKeys(bsec.tracks || []);
    (sec.tracks || []).forEach((t, i) => {
      const k = `${sk}/${keys[i]}`;
      const bi = bkeys.indexOf(keys[i]);
      if (bi < 0) { out.push({ what: 'track-added', track: k, inst: t.inst, from: t.added || 'studio', notes: formatTokens(tokenize(t.notes), bar) }); return; }
      const bt = bsec.tracks[bi];
      const d = diffTracks(tokenize(bt.notes), tokenize(t.notes), bar);
      if (d) out.push({ what: 'notes', track: k, inst: t.inst, ...d });
      for (const f of MIX) if (stableJson(t[f]) !== stableJson(bt[f])) out.push({ what: 'mix', track: k, inst: t.inst, field: f, before: bt[f] ?? null, after: t[f] ?? null });
      for (const p of new Set([...Object.keys(t), ...Object.keys(bt)])) {
        if (TRACK_FIELDS.has(p)) continue;
        if (stableJson(t[p]) !== stableJson(bt[p])) out.push({ what: 'track-param', track: k, inst: t.inst, param: p, before: bt[p] ?? null, after: t[p] ?? null });
      }
    });
    (bsec.tracks || []).forEach((t, i) => { if (!keys.includes(bkeys[i])) out.push({ what: 'track-removed', track: `${sk}/${bkeys[i]}`, inst: t.inst }); });
  }
  return out;
}

// One short line per change, in plain words.
export function describeChange(c) {
  switch (c.what) {
    case 'tempo': return `tempo ${c.before} → ${c.after} bpm`;
    case 'notes': {
      const bits = [];
      if (c.up) bits.push(`raised ${c.up} semitone${c.up === 1 ? '' : 's'}`);
      if (c.down) bits.push(`lowered ${c.down} semitone${c.down === 1 ? '' : 's'}`);
      if (c.rests) bits.push(`${c.rests} rest${c.rests === 1 ? '' : 's'}`);
      if (c.ties) bits.push(`${c.ties} tie${c.ties === 1 ? '' : 's'}`);
      return `${c.track}: ${c.steps.length} step${c.steps.length === 1 ? '' : 's'} changed in bar${c.bars.length === 1 ? '' : 's'} ${c.bars.join(', ')}${bits.length ? ` (${bits.join(', ')})` : ''}`;
    }
    case 'mix': return `${c.track}: ${c.field} ${fmt(c.before)} → ${fmt(c.after)}`;
    case 'track-param': return `${c.track}: ${c.param} ${fmt(c.before)} → ${fmt(c.after)} (this track only)`;
    case 'track-added': return `${c.track}: new ${c.inst} track (from ${c.from})`;
    case 'track-removed': return `${c.track}: removed`;
    case 'instrument': return `instrument ${c.inst}: ${c.param} ${fmt(c.before)} → ${fmt(c.after)} (every song)`;
    case 'sfx': return c.layer < 0 ? `volume ${fmt(c.before)} → ${fmt(c.after)}` : `layer ${c.layer + 1}: ${c.param} ${fmt(c.before)} → ${fmt(c.after)}`;
    default: return JSON.stringify(c);
  }
}
const fmt = (v) => (v == null ? '—' : typeof v === 'number' ? String(Math.round(v * 1000) / 1000) : String(v));

// Instruments before/after → changes (what: 'instrument').
export function instrumentChanges(before, after) {
  const out = [];
  for (const [id, p] of Object.entries(after || {})) {
    const b = (before || {})[id] || {};
    for (const k of new Set([...Object.keys(p), ...Object.keys(b)])) if (stableJson(p[k]) !== stableJson(b[k])) out.push({ what: 'instrument', inst: id, param: k, before: b[k] ?? null, after: p[k] ?? null });
  }
  return out;
}

// Sound effect before/after → changes (what: 'sfx').
export function sfxChanges(before, after) {
  const out = [];
  if (stableJson(before.vol) !== stableJson(after.vol)) out.push({ what: 'sfx', layer: -1, param: 'vol', before: before.vol ?? 1, after: after.vol ?? 1 });
  (after.layers || []).forEach((L, i) => {
    const B = (before.layers || [])[i] || {};
    for (const k of new Set([...Object.keys(L), ...Object.keys(B)])) if (stableJson(L[k]) !== stableJson(B[k])) out.push({ what: 'sfx', layer: i, param: k, before: B[k] ?? null, after: L[k] ?? null });
  });
  return out;
}

