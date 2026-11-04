// engine/sound/song.js — turns the data a game writes (songs, sound-effect recipes, instruments)
// into the plain, resolved form the synthesizer plays: notation parsed into note events, every
// track's instrument looked up and merged with its overrides. Pure data in, pure data out: the
// result can be posted to an audio worklet, rendered in Node, or shown in the studio.
//
// Instruments are parameter sets, not code (docs/contracts/SOUND.md):
//   lead:  { type: 'synth', wave: 'square', wave2: 'square', detune2: 7, cutoff: 2500, level: 0.4 }
//   pluck: { type: 'pluck', bright: 0.55, ring: 1.1, echo: 0.22 }
//   bell:  { type: 'fm', ratio: 3.5, index: 2.4 }
//   drums: { type: 'drums', kit: { K: [{ tone: 'sine', from: 150, to: 46, sweep: 0.2, len: 0.55, vol: 1 }], k: { like: 'K', vol: 0.55 } } }
// A drum piece is a list of hit layers (below) or { like: '<letter>', vol, tune, decay }.
// A hit layer is one tone or one noise burst — the same shape sound effects are made of:
//   { tone: 'sine'|'triangle'|'saw'|'square'|'pulse', from: Hz, to: Hz, sweep: s, len: s, vol, attack, lp, q, partials: [[ratio, amp]…] }
//   { noise: 'lowpass'|'highpass'|'bandpass'|'none', from: Hz, to: Hz, len: s, vol, attack, q }
// A sound effect is { vol, layers: [hit layers, or { note: 'E6' | ['C6','E6'], every: s, inst, len, vel },
//   or { drum: 'K', inst: 'drums', vel }] }, each layer optionally delayed by `at` seconds.
import { parseTrack, trackKeys, songOrder, stepSeconds, stepsPerBar, noteToMidi, TRACK_FIELDS } from './notation.js';

const WAVES = ['sine', 'triangle', 'saw', 'square', 'pulse'];
const WAVES_OFF = ['off', ...WAVES];
const FILTERS = ['lowpass', 'bandpass', 'highpass'];

// Every knob each instrument type has: range, default, label (the studio builds its knobs from
// this; the synth reads only these). log: shown on a logarithmic slider.
export const PARAMS = {
  common: {
    level: { min: 0, max: 2, step: 0.01, def: 1, label: 'Loudness' },
    echo: { min: 0, max: 1, step: 0.01, def: 0.2, label: 'Echo (reverb send)' },
    pan: { min: -1, max: 1, step: 0.05, def: 0, label: 'Pan (left · right)' },
  },
  pluck: {
    bright: { min: 0.05, max: 1, step: 0.01, def: 0.55, label: 'Brightness', hint: 'how sharp the pluck is' },
    sustain: { min: 0, max: 1, step: 0.01, def: 0.5, label: 'Sustain', hint: 'how long the string rings by itself' },
    ring: { min: 0.05, max: 4, step: 0.05, def: 1.1, label: 'Ring out (s)', hint: 'fade after the note ends' },
    tone: { min: 0.2, max: 3, step: 0.05, def: 1, label: 'Tone', hint: 'the filter after the string' },
  },
  synth: {
    wave: { options: WAVES, def: 'triangle', label: 'Wave' },
    wave2: { options: WAVES_OFF, def: 'off', label: 'Wave 2' },
    level2: { min: 0, max: 1, step: 0.01, def: 0.5, label: 'Wave 2 level' },
    detune2: { min: -50, max: 50, step: 1, def: 0, label: 'Wave 2 detune (cents)' },
    oct2: { min: -2, max: 2, step: 1, def: 0, label: 'Wave 2 octave' },
    wave3: { options: WAVES_OFF, def: 'off', label: 'Wave 3' },
    level3: { min: 0, max: 1, step: 0.01, def: 0.3, label: 'Wave 3 level' },
    detune3: { min: -50, max: 50, step: 1, def: 0, label: 'Wave 3 detune (cents)' },
    oct3: { min: -2, max: 2, step: 1, def: 1, label: 'Wave 3 octave' },
    sub: { min: 0, max: 1, step: 0.01, def: 0, label: 'Sub (octave below)' },
    breath: { min: 0, max: 1, step: 0.01, def: 0, label: 'Breath noise' },
    filter: { options: FILTERS, def: 'lowpass', label: 'Filter' },
    cutoff: { min: 60, max: 16000, step: 1, def: 4000, label: 'Brightness (filter Hz)', log: true },
    q: { min: 0.3, max: 12, step: 0.1, def: 0.7, label: 'Resonance' },
    fenv: { min: 1, max: 16, step: 0.1, def: 1, label: 'Filter sweep', hint: 'starts this many times brighter' },
    ftime: { min: 0.01, max: 2, step: 0.01, def: 0.2, label: 'Sweep time (s)' },
    attack: { min: 0.001, max: 2, step: 0.001, def: 0.01, label: 'Attack (s)' },
    decay: { min: 0.01, max: 3, step: 0.01, def: 0.2, label: 'Decay (s)' },
    sustain: { min: 0, max: 1, step: 0.01, def: 0.8, label: 'Sustain level' },
    release: { min: 0.01, max: 4, step: 0.01, def: 0.15, label: 'Release (s)' },
    vibrato: { min: 0, max: 60, step: 1, def: 0, label: 'Vibrato (cents)' },
    vrate: { min: 0.5, max: 12, step: 0.1, def: 5.5, label: 'Vibrato speed (Hz)' },
    vdelay: { min: 0, max: 2, step: 0.01, def: 0.3, label: 'Vibrato fades in (s)' },
    scoop: { min: 0, max: 200, step: 1, def: 0, label: 'Scoop (cents below)', hint: 'each note slides up into pitch' },
    stime: { min: 0.005, max: 0.5, step: 0.005, def: 0.06, label: 'Scoop time (s)' },
  },
  fm: {
    ratio: { min: 0.25, max: 8, step: 0.01, def: 3.5, label: 'Ratio', hint: 'metallic colour' },
    index: { min: 0, max: 12, step: 0.05, def: 2.4, label: 'Brightness (FM)' },
    indexEnd: { min: 0, max: 12, step: 0.05, def: 0.05, label: 'Brightness at the end' },
    itime: { min: 0.02, max: 3, step: 0.01, def: 0.6, label: 'Brightness fade (s)' },
    attack: { min: 0.001, max: 0.5, step: 0.001, def: 0.002, label: 'Attack (s)' },
    decay: { min: 0.05, max: 6, step: 0.05, def: 0.9, label: 'Ring out (s)' },
  },
  drums: {},
  // the knobs of every drum piece (multipliers) and of every hit layer (sound effects, kits)
  piece: {
    vol: { min: 0, max: 2, step: 0.01, def: 1, label: 'Volume' },
    tune: { min: 0.5, max: 2, step: 0.01, def: 1, label: 'Tune' },
    decay: { min: 0.2, max: 3, step: 0.01, def: 1, label: 'Length' },
  },
  hit: {
    from: { min: 20, max: 16000, step: 1, def: 440, label: 'From (Hz)', log: true },
    to: { min: 20, max: 16000, step: 1, def: 440, label: 'To (Hz)', log: true },
    sweep: { min: 0.005, max: 3, step: 0.005, def: 0.2, label: 'Sweep (s)' },
    len: { min: 0.01, max: 4, step: 0.01, def: 0.2, label: 'Length (s)' },
    vol: { min: 0, max: 1.5, step: 0.01, def: 0.5, label: 'Volume' },
    attack: { min: 0, max: 1, step: 0.005, def: 0, label: 'Attack (s)' },
    q: { min: 0.3, max: 12, step: 0.1, def: 1, label: 'Resonance' },
    lp: { min: 100, max: 16000, step: 1, def: 16000, label: 'Lowpass (Hz)', log: true },
    at: { min: 0, max: 2, step: 0.005, def: 0, label: 'Starts at (s)' },
  },
};
export const TYPES = ['synth', 'pluck', 'fm', 'drums'];
export const TRACK_KNOBS = {
  vol: { min: 0, max: 1.5, step: 0.01, def: 0.6, label: 'Volume' },
  pan: PARAMS.common.pan,
  echo: PARAMS.common.echo,
};

const num = (v, spec) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return spec.def;
  return Math.max(spec.min, Math.min(spec.max, n));
};

// Clean one parameter set of a type: known keys only, numbers clamped, options checked.
function cleanParams(type, raw) {
  const out = {};
  const specs = { ...PARAMS.common, ...(PARAMS[type] || {}) };
  for (const [k, spec] of Object.entries(specs)) {
    const v = raw[k];
    if (spec.options) out[k] = spec.options.includes(v) ? v : spec.def;
    else out[k] = num(v, spec);
  }
  return out;
}

// A hit layer with its defaults filled in.
export function cleanLayer(raw, scale = {}) {
  const L = raw || {};
  const kind = L.noise != null ? 'noise' : 'tone';
  const H = PARAMS.hit;
  const tune = scale.tune || 1, decay = scale.decay || 1;
  const len = num(L.len ?? H.len.def, H.len) * decay;
  const from = num(L.from ?? H.from.def, H.from) * tune;
  const out = {
    kind,
    wave: kind === 'tone' ? (WAVES.includes(L.tone) ? L.tone : 'sine') : null,
    filter: kind === 'noise' ? (['lowpass', 'highpass', 'bandpass', 'none'].includes(L.noise) ? L.noise : 'none') : null,
    from,
    to: num(L.to ?? L.from ?? H.to.def, H.to) * tune,
    sweep: num(L.sweep ?? (L.len ?? H.len.def), H.sweep) * decay,
    len,
    vol: num(L.vol ?? H.vol.def, H.vol) * (scale.vol ?? 1),
    attack: num(L.attack ?? 0, H.attack),
    q: num(L.q ?? H.q.def, H.q),
    lp: L.lp != null ? num(L.lp, H.lp) : 0,
    at: num(L.at ?? 0, H.at),
    pan: L.pan != null ? num(L.pan, PARAMS.common.pan) : null,
    echo: L.echo != null ? num(L.echo, PARAMS.common.echo) : null,
    partials: Array.isArray(L.partials) ? L.partials.filter((p) => Array.isArray(p) && p.length >= 2).slice(0, 12).map(([r, a]) => [Math.max(0.01, +r || 1), Math.max(0, +a || 0)]) : null,
  };
  return out;
}

// A drum kit → { letter: [clean hit layers] } (resolving like: references, at most a few deep).
// A piece may also be { layers: [..], vol, tune, decay }: the multipliers scale its layers.
export function resolveKit(kit) {
  const out = {};
  const src = kit && typeof kit === 'object' ? kit : {};
  const piece = (letter, depth = 0) => {
    const p = src[letter];
    if (!p || depth > 4) return [];
    if (Array.isArray(p)) return p.map((l) => cleanLayer(l));
    if (Array.isArray(p.layers)) return p.layers.map((l) => cleanLayer(l, p));
    if (p.like) return piece(p.like, depth + 1).map((l) => scaleLayer(l, p));
    return [cleanLayer(p)];
  };
  for (const k of Object.keys(src)) if (/^[A-Za-z]$/.test(k)) out[k] = piece(k);
  return out;
}
function scaleLayer(l, s) {
  const tune = Number.isFinite(+s.tune) ? +s.tune : 1, decay = Number.isFinite(+s.decay) ? +s.decay : 1, vol = Number.isFinite(+s.vol) ? +s.vol : 1;
  return { ...l, from: l.from * tune, to: l.to * tune, len: l.len * decay, sweep: l.sweep * decay, vol: l.vol * vol };
}

const FALLBACK = { type: 'synth', wave: 'triangle', cutoff: 3000, level: 0.5 };

// An instrument by id → { type, p (clean params), kit? } — unknown ids warn and play a plain tone.
export function resolveInstrument(instruments, id, overrides = null, warnings = null) {
  let raw = instruments && instruments[id];
  if (!raw || typeof raw !== 'object') {
    if (warnings) warnings.push(`unknown instrument "${id}" — playing a plain tone (add it to the game's instruments)`);
    raw = FALLBACK;
  }
  const type = TYPES.includes(raw.type) ? raw.type : 'synth';
  const merged = overrides ? { ...raw, ...overrides } : raw;
  const out = { type, p: cleanParams(type, merged) };
  if (type === 'drums') {
    const kit = resolveKit(raw.kit);
    // per-piece knobs (the studio's drum knobs): "K.vol": 1.2, "S.tune": 0.9, "h.decay": 1.5
    const scale = {};
    for (const [k, v] of Object.entries(merged)) {
      const m = /^([A-Za-z])\.(vol|tune|decay)$/.exec(k);
      if (m && kit[m[1]] && Number.isFinite(+v)) (scale[m[1]] ||= {})[m[2]] = +v;
    }
    for (const [letter, s] of Object.entries(scale)) kit[letter] = kit[letter].map((l) => scaleLayer(l, s));
    out.kit = kit;
  }
  return out;
}

// The track overrides of an instrument: every key of the track that isn't a track field.
export function trackOverrides(track) {
  const o = {};
  for (const [k, v] of Object.entries(track || {})) if (!TRACK_FIELDS.has(k)) o[k] = v;
  return Object.keys(o).length ? o : null;
}

// A song → the compiled form the synth plays:
// { id, name, bpm, spb, beats, barSteps, stepSec, order, loop, sections: { key: { len, tracks: [
//   { key, name, inst, type, p, kit?, vol, pan, echo, len, events, tokens, bad } ] } }, warnings }
export function compileSong(song, instruments, { id = null } = {}) {
  const warnings = [];
  if (!song || typeof song !== 'object' || !song.sections) return { id, warnings: ['not a song (no sections)'], sections: {}, order: [], bpm: 120, spb: 4, stepSec: 0.125, loop: false };
  const sections = {};
  for (const [sk, sec] of Object.entries(song.sections)) {
    const tracks = Array.isArray(sec && sec.tracks) ? sec.tracks : [];
    const keys = trackKeys(tracks);
    const out = tracks.map((t, i) => {
      const inst = resolveInstrument(instruments, t.inst, trackOverrides(t), warnings);
      const parsed = parseTrack(t.notes, { drums: inst.type === 'drums', oct: t.oct || 0 });
      if (parsed.bad.length) warnings.push(`${sk}/${keys[i]}: can't read ${parsed.bad.slice(0, 4).map((b) => `"${b.tok}" (step ${b.step + 1})`).join(', ')}`);
      if (inst.type === 'drums') {
        const missing = [...new Set(parsed.events.flatMap((e) => e.hits).filter((h) => !inst.kit[h]))];
        if (missing.length) warnings.push(`${sk}/${keys[i]}: the kit "${t.inst}" has no ${missing.join(', ')}`);
      }
      return {
        key: keys[i], name: t.name || keys[i], inst: t.inst, type: inst.type, p: inst.p, kit: inst.kit || null,
        vol: Number.isFinite(+t.vol) ? Math.max(0, +t.vol) : 0.6,
        pan: Number.isFinite(+t.pan) ? Math.max(-1, Math.min(1, +t.pan)) : inst.p.pan,
        echo: Number.isFinite(+t.echo) ? Math.max(0, Math.min(1, +t.echo)) : inst.p.echo,
        mute: !!t.mute,
        len: parsed.len, events: parsed.events, tokens: parsed.tokens, bad: parsed.bad.length,
      };
    });
    sections[sk] = { len: Math.max(0, ...out.map((t) => t.len)), tracks: out };
  }
  const order = songOrder(song);
  if (!order.length) warnings.push('the song has no sections to play');
  for (const k of song.order || []) if (!song.sections[k]) warnings.push(`order names section "${k}", which doesn't exist`);
  let loop = song.loop === undefined ? true : song.loop;
  if (typeof loop === 'number') loop = Math.max(0, Math.min(order.length - 1, loop | 0));
  else loop = loop !== false;
  return {
    id, name: song.name || id || 'song', bpm: Math.max(20, Math.min(400, +song.bpm || 120)), spb: Math.max(1, Math.min(8, song.spb | 0 || 4)),
    beats: Math.max(1, Math.min(16, song.beats | 0 || 4)), barSteps: stepsPerBar(song), stepSec: stepSeconds(song),
    order, loop, sections, warnings,
  };
}

// Seconds for one pass through the song's order.
export function songSeconds(c) {
  return c.order.reduce((s, k) => s + (c.sections[k] ? c.sections[k].len : 0), 0) * c.stepSec;
}

// A sound effect → { vol, layers: [ { at, kind: 'hit', layer } | { at, kind: 'note', type, p, midi: [..], len, vel } | { at, kind: 'drum', layers } ] }
export function compileSfx(recipe, instruments, warnings = []) {
  const r = recipe && typeof recipe === 'object' ? recipe : {};
  const layers = [];
  (Array.isArray(r.layers) ? r.layers : []).forEach((L, i) => {
    if (!L || typeof L !== 'object') return;
    const at = Math.max(0, +L.at || 0);
    if (L.note != null) {
      const inst = resolveInstrument(instruments, L.inst || 'bell', null, warnings);
      const notes = Array.isArray(L.note) ? L.note : [L.note];
      const every = Math.max(0, +L.every || 0);
      notes.forEach((n, j) => {
        const midi = typeof n === 'number' ? n : noteToMidi(n);
        if (midi == null) { warnings.push(`layer ${i + 1}: can't read note "${n}"`); return; }
        layers.push({ at: at + j * every, kind: 'note', type: inst.type, p: inst.p, kit: null, midi: [midi], len: Math.max(0.01, +L.len || 0.15), vel: Number.isFinite(+L.vel) ? +L.vel : 0.5, pan: L.pan ?? null, echo: L.echo ?? null });
      });
    } else if (L.drum != null) {
      const inst = resolveInstrument(instruments, L.inst || 'drums', null, warnings);
      const piece = inst.kit && inst.kit[L.drum];
      if (!piece) { warnings.push(`layer ${i + 1}: no drum "${L.drum}" in "${L.inst || 'drums'}"`); return; }
      layers.push({ at, kind: 'drum', layers: piece, vel: Number.isFinite(+L.vel) ? +L.vel : 0.6, pan: L.pan ?? null, echo: L.echo ?? null, p: inst.p });
    } else {
      layers.push({ at: 0, kind: 'hit', layer: cleanLayer(L) }); // the layer keeps its own `at`
    }
  });
  return { vol: Number.isFinite(+r.vol) ? Math.max(0, Math.min(4, +r.vol)) : 1, layers, warnings };
}

// How long a compiled sound effect lasts (seconds, with its ring-out).
export function sfxSeconds(c) {
  let end = 0.05;
  for (const l of c.layers) {
    if (l.kind === 'hit') end = Math.max(end, l.at + l.layer.at + l.layer.len + 0.05);
    else if (l.kind === 'drum') end = Math.max(end, l.at + Math.max(0, ...l.layers.map((x) => x.at + x.len)) + 0.05);
    else end = Math.max(end, l.at + l.len + (l.type === 'pluck' ? l.p.ring : l.type === 'fm' ? l.p.decay : l.p.release || 0.2) + 0.1);
  }
  return end;
}
