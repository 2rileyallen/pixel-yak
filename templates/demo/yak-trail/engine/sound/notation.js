// engine/sound/notation.js — the tracker notation songs are written in, read and written both
// ways: parse a track's text into note events, and format tokens back into text (so the studio
// can save the user's notes as notation an AI can read). Pure data: works in Node and browsers.
//
// A track is a string of tokens separated by spaces (docs/contracts/SOUND.md):
//   C4  F#3  Bb2       a note (letter A–G, optional # or b, octave -1–9); C4 = middle C
//   C4+E4+G4           a chord: several notes struck together
//   .                  a rest (silence for one step)
//   -                  a tie: the note before rings one step longer
//   |                  a bar line (only for reading; it takes no time)
//   K  S  h  K+h       drum hits, on a track whose instrument is a drum kit (letters are the kit's)
//   E4!  K_            suffix ! = accent (louder, ×1.25), _ = ghost (softer, ×0.55)
// One token = one step. A song says how long a step is: bpm (beats per minute) and spb (steps
// per beat, default 4 — so one step is a sixteenth note and a 4/4 bar is 16 steps).

export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLAT_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const LETTER = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
export const ACCENT = 1.25;
export const GHOST = 0.55;

export const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

export function noteToMidi(s) {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(String(s));
  if (!m) return null;
  const v = 12 * (+m[3] + 1) + LETTER[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
  return v >= 0 && v <= 127 ? v : null;
}

export function midiToNote(m, flats = false) {
  const n = Math.round(m);
  return (flats ? FLAT_NAMES : NOTE_NAMES)[((n % 12) + 12) % 12] + (Math.floor(n / 12) - 1);
}

// The words of a track (bar lines dropped). Accepts a string or an array of strings (bars).
export function tokenize(text) {
  const s = Array.isArray(text) ? text.join(' ') : String(text || '');
  return s.split(/\s+/).filter((t) => t && t !== '|');
}

// One token → what it means. drums: the track's instrument is a drum kit.
// → { kind: 'rest' | 'tie' | 'note' | 'drum' | 'bad', midi: [..], hits: [..], vel, mark: '' | '!' | '_' }
export function parseToken(tok, drums = false) {
  if (tok === '.') return { kind: 'rest' };
  if (tok === '-') return { kind: 'tie' };
  let t = String(tok), vel = 1, mark = '';
  if (t.endsWith('!')) { vel = ACCENT; mark = '!'; t = t.slice(0, -1); }
  else if (t.endsWith('_')) { vel = GHOST; mark = '_'; t = t.slice(0, -1); }
  const parts = t.split('+').filter(Boolean);
  if (!parts.length) return { kind: 'bad', tok };
  if (drums) {
    if (!parts.every((p) => /^[A-Za-z]$/.test(p))) return { kind: 'bad', tok };
    return { kind: 'drum', hits: parts, vel, mark };
  }
  const midi = parts.map(noteToMidi);
  if (midi.some((m) => m == null)) return { kind: 'bad', tok };
  return { kind: 'note', midi, vel, mark };
}

// A track's text → { tokens, len, events, bad }.
// events: notes { step, len (steps), midi: [..], vel } or drum hits { step, hits: [..], vel }.
// oct transposes notes by whole octaves. Ties after a rest (or at the start) are silent.
export function parseTrack(text, { drums = false, oct = 0 } = {}) {
  const tokens = tokenize(text);
  const events = [];
  const bad = [];
  let last = null;
  tokens.forEach((tok, step) => {
    const p = parseToken(tok, drums);
    if (p.kind === 'tie') { if (last) last.len++; return; }
    last = null;
    if (p.kind === 'rest') return;
    if (p.kind === 'bad') { bad.push({ step, tok }); return; }
    if (p.kind === 'drum') { events.push({ step, hits: p.hits, vel: p.vel }); return; }
    last = { step, len: 1, midi: p.midi.map((m) => Math.max(0, Math.min(127, m + 12 * (oct | 0)))), vel: p.vel };
    events.push(last);
  });
  return { tokens, len: tokens.length, events, bad };
}

// Tokens → notation text with a bar line every barSteps tokens: 'E3 . B3 . | C3 . G3 . |…'.
export function formatTokens(tokens, barSteps = 16) {
  const bars = [];
  for (let i = 0; i < tokens.length; i += barSteps) bars.push(tokens.slice(i, i + barSteps).join(' '));
  return bars.join(' | ');
}

// Shift a note token by semitones (chords move together, accents stay). Rests, ties and drum
// hits come back unchanged; a note that would leave the MIDI range stays put.
export function transposeToken(tok, semis, flats = false) {
  const p = parseToken(tok, false);
  if (p.kind !== 'note') return tok;
  const next = p.midi.map((m) => m + semis);
  if (next.some((m) => m < 0 || m > 127)) return tok;
  return next.map((m) => midiToNote(m, flats)).join('+') + p.mark;
}

// The pitch of a token (the top note of a chord), or null.
export function tokenPitch(tok) {
  const p = parseToken(tok, false);
  return p.kind === 'note' ? Math.max(...p.midi) : null;
}

// Does the text use flats (Bb) rather than sharps (A#)? Edits keep the song's spelling.
export const prefersFlats = (tokens) => tokens.some((t) => /^[A-G]b/.test(t)) && !tokens.some((t) => /^[A-G]#/.test(t));

// -------------------------------------------------------------- song shape ---
// A song (docs/contracts/SOUND.md):
//   { name, bpm, spb: 4, beats: 4, order: ['A', 'B'], loop: true | false | <order index>,
//     sections: { A: { tracks: [{ inst, notes, vol, pan, echo, oct, id, name, ...params }] } } }
// Fields of a track that are not instrument parameters:
export const TRACK_FIELDS = new Set(['inst', 'notes', 'vol', 'pan', 'echo', 'oct', 'id', 'name', 'mute', 'added']);

export const songOrder = (song) => (Array.isArray(song.order) && song.order.length ? song.order : Object.keys(song.sections || {})).filter((k) => song.sections && song.sections[k]);
export const stepsPerBar = (song) => Math.max(1, (song.spb || 4) * (song.beats || 4));
export const stepSeconds = (song) => 60 / Math.max(1, song.bpm || 120) / Math.max(1, song.spb || 4);

// A track's stable key inside its section: its id, else its instrument when only one track of
// the section uses it, else "inst#n" (the nth track with that instrument). Edits are keyed by
// "<section>/<key>", so the AI adding or reordering other tracks never moves the user's edits.
export function trackKeys(tracks) {
  const count = new Map();
  for (const t of tracks) if (!t.id) count.set(t.inst, (count.get(t.inst) || 0) + 1);
  const seen = new Map();
  return tracks.map((t) => {
    if (t.id) return String(t.id);
    const n = (seen.get(t.inst) || 0) + 1;
    seen.set(t.inst, n);
    return count.get(t.inst) > 1 ? `${t.inst}#${n}` : String(t.inst);
  });
}

// Section length in steps: the longest track.
export const sectionLength = (sec) => Math.max(0, ...((sec && sec.tracks) || []).map((t) => tokenize(t.notes).length));

// FNV-1a over a string → 8 hex chars (drift detection: "did the AI change this since?").
export function hashText(s) {
  let h = 0x811c9dc5;
  const str = String(s);
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16).padStart(8, '0');
}
export const hashTokens = (tokens) => hashText(tokens.join(' '));

// Stable JSON (sorted keys) — hashes of parameter sets don't depend on key order.
export function stableJson(v) {
  if (Array.isArray(v)) return `[${v.map(stableJson).join(',')}]`;
  if (v && typeof v === 'object') return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stableJson(v[k])}`).join(',')}}`;
  return JSON.stringify(v ?? null);
}
