// engine/sound/midi.js — Standard MIDI Files, in plain JavaScript: read one (any app can export
// MIDI) and turn a track into tracker notation on a song's grid; write one (tests, exports).
import { midiToNote, formatTokens } from './notation.js';

// ------------------------------------------------------------------- read ---
// bytes → { format, ppq, bpm (first tempo), tempos: [{ tick, bpm }], tracks: [{ index, name,
//   channels: [..], notes: [{ tick, dur, midi, vel, ch }] }] }
export function parseMidi(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let p = 0;
  const tag = () => String.fromCharCode(u8[p], u8[p + 1], u8[p + 2], u8[p + 3]);
  const u32 = () => { const v = (u8[p] << 24) | (u8[p + 1] << 16) | (u8[p + 2] << 8) | u8[p + 3]; p += 4; return v >>> 0; };
  const u16 = () => { const v = (u8[p] << 8) | u8[p + 1]; p += 2; return v; };
  if (u8.length < 14 || tag() !== 'MThd') throw new Error('not a MIDI file (no MThd header)');
  p = 4;
  const hlen = u32();
  const format = u16(), ntrks = u16(), division = u16();
  p = 8 + hlen;
  const ppq = division & 0x8000 ? 480 : division || 480; // SMPTE timing: treat as 480 per beat
  const tempos = [];
  const tracks = [];
  let seen = 0;
  while (seen < ntrks && p + 8 <= u8.length) {
    const id = tag();
    p += 4;
    const len = u32();
    const end = Math.min(u8.length, p + len);
    if (id !== 'MTrk') { p = end; continue; } // unknown chunks are skipped
    seen++;
    const track = { index: tracks.length, name: '', channels: new Set(), notes: [] };
    const open = new Map(); // `${ch}:${key}` → [note…]
    let tick = 0, status = 0;
    const vlq = () => { let v = 0; for (let i = 0; i < 4 && p < end; i++) { const b = u8[p++]; v = (v << 7) | (b & 0x7f); if (!(b & 0x80)) break; } return v; };
    while (p < end) {
      tick += vlq();
      let b = u8[p];
      if (b & 0x80) { status = b; p++; } else if (!status) { p++; continue; } // running status
      const type = status & 0xf0, ch = status & 0x0f;
      if (status === 0xff) {
        const meta = u8[p++];
        const l = vlq();
        if (meta === 0x51 && l === 3) tempos.push({ tick, bpm: Math.round((60000000 / ((u8[p] << 16) | (u8[p + 1] << 8) | u8[p + 2])) * 100) / 100 });
        if (meta === 0x03 && !track.name) track.name = new TextDecoder().decode(u8.subarray(p, p + l)).trim();
        p += l;
        if (meta === 0x2f) break;
        status = 0;
        continue;
      }
      if (status === 0xf0 || status === 0xf7) { const l = vlq(); p += l; status = 0; continue; }
      if (type === 0x90 || type === 0x80) {
        const key = u8[p++], vel = u8[p++];
        const k = `${ch}:${key}`;
        if (type === 0x90 && vel > 0) {
          const n = { tick, dur: 0, midi: key, vel, ch };
          track.notes.push(n);
          track.channels.add(ch);
          if (!open.has(k)) open.set(k, []);
          open.get(k).push(n);
        } else {
          const q = open.get(k);
          if (q && q.length) { const n = q.shift(); n.dur = Math.max(1, tick - n.tick); }
        }
      } else if (type === 0xc0 || type === 0xd0) p += 1;
      else p += 2; // 0xA0, 0xB0, 0xE0
    }
    for (const q of open.values()) for (const n of q) if (!n.dur) n.dur = Math.max(1, tick - n.tick);
    p = end;
    track.notes.sort((a, b) => a.tick - b.tick || b.midi - a.midi);
    track.channels = [...track.channels].sort((a, b) => a - b);
    tracks.push(track);
  }
  tempos.sort((a, b) => a.tick - b.tick);
  return { format, ppq, bpm: tempos.length ? tempos[0].bpm : 120, tempos, tracks: tracks.filter((t) => t.notes.length) };
}

// One line per track, for picking one in the studio.
export function describeMidiTrack(t) {
  if (!t.notes.length) return `${t.name || `track ${t.index + 1}`}: empty`;
  const lo = Math.min(...t.notes.map((n) => n.midi)), hi = Math.max(...t.notes.map((n) => n.midi));
  const drums = t.channels.includes(9);
  return `${t.name || `Track ${t.index + 1}`} · ${t.notes.length} notes · ${drums ? 'drums (channel 10)' : `${midiToNote(lo)}–${midiToNote(hi)}`}`;
}

// General MIDI drum keys → this engine's usual kit letters.
export const GM_DRUMS = { 35: 'K', 36: 'K', 37: 'S', 38: 'S', 39: 'S', 40: 'S', 41: 'K', 42: 'h', 43: 'K', 44: 'h', 46: 'o', 49: 'C', 51: 'o', 52: 'C', 55: 'C', 57: 'C', 59: 'o' };

// A MIDI track → tracker tokens on a song grid (spb steps per beat).
// opts: { spb, mode: 'mono' (the top note) | 'chords' (notes together joined with +), drums: bool
//   (letters via GM_DRUMS), fromFirstBar: start at the bar of the first note, steps: length
//   (pad / cut), barSteps, transpose: semitones }
// → { tokens, notes (text), len, firstStep, dropped (notes that didn't fit) }
export function midiTrackToTokens(midi, trackIndex, { spb = 4, mode = 'mono', drums = null, fromFirstBar = true, steps = null, barSteps = 16, transpose = 0 } = {}) {
  const tr = midi.tracks[trackIndex];
  if (!tr) throw new Error(`no track ${trackIndex + 1} in this MIDI file`);
  const isDrums = drums == null ? tr.channels.includes(9) : drums;
  const tps = midi.ppq / spb;
  const q = (tick) => Math.round(tick / tps);
  let offset = 0;
  if (fromFirstBar && tr.notes.length) offset = Math.floor(q(tr.notes[0].tick) / barSteps) * barSteps;
  const groups = new Map(); // step → notes
  let last = 0;
  for (const n of tr.notes) {
    const s = q(n.tick) - offset;
    if (s < 0) continue;
    if (!groups.has(s)) groups.set(s, []);
    groups.get(s).push(n);
    last = Math.max(last, s + Math.max(1, Math.round(n.dur / tps)));
  }
  const len = steps != null ? steps : Math.max(barSteps, Math.ceil(last / barSteps) * barSteps);
  const tokens = new Array(len).fill('.');
  let dropped = 0;
  const starts = [...groups.keys()].sort((a, b) => a - b);
  starts.forEach((s, i) => {
    if (s >= len) { dropped += groups.get(s).length; return; }
    const g = groups.get(s);
    if (isDrums) {
      const letters = [...new Set(g.map((n) => GM_DRUMS[n.midi]).filter(Boolean))];
      dropped += g.filter((n) => !GM_DRUMS[n.midi]).length;
      if (letters.length) tokens[s] = letters.join('+') + (Math.max(...g.map((n) => n.vel)) >= 110 ? '!' : Math.max(...g.map((n) => n.vel)) < 50 ? '_' : '');
      return;
    }
    const pitches = [...new Set(g.map((n) => n.midi + transpose))].filter((m) => m >= 0 && m <= 127).sort((a, b) => b - a);
    const pick = mode === 'chords' ? pitches.slice(0, 4).sort((a, b) => a - b) : pitches.slice(0, 1);
    dropped += g.length - pick.length;
    const vel = Math.max(...g.map((n) => n.vel));
    tokens[s] = pick.map((m) => midiToNote(m)).join('+') + (vel >= 115 ? '!' : vel < 45 ? '_' : '');
    const dur = Math.max(1, Math.round(Math.max(...g.map((n) => n.dur)) / tps));
    const next = i + 1 < starts.length ? starts[i + 1] : len;
    for (let k = s + 1; k < Math.min(len, s + dur, next); k++) tokens[k] = '-';
  });
  return { tokens, notes: formatTokens(tokens, barSteps), len, firstStep: offset, dropped };
}

// ------------------------------------------------------------------ write ---
// { ppq, bpm, tracks: [{ name, notes: [{ tick, dur, midi, vel, ch }] }] } → Uint8Array (format 1)
export function writeMidi({ ppq = 480, bpm = 120, tracks = [] } = {}) {
  const out = [];
  const push = (...b) => out.push(...b);
  const u32 = (v) => [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255];
  const vlq = (v) => { const b = [v & 0x7f]; while ((v >>= 7)) b.unshift((v & 0x7f) | 0x80); return b; };
  const str = (s) => [...s].map((c) => c.charCodeAt(0) & 255);
  push(...str('MThd'), ...u32(6), 0, 1, 0, tracks.length + 1, (ppq >> 8) & 255, ppq & 255);
  const chunk = (events) => {
    const body = [];
    let t = 0;
    for (const e of events.sort((a, b) => a.tick - b.tick || a.order - b.order)) { body.push(...vlq(e.tick - t), ...e.bytes); t = e.tick; }
    body.push(0, 0xff, 0x2f, 0);
    push(...str('MTrk'), ...u32(body.length), ...body);
  };
  const us = Math.round(60000000 / bpm);
  chunk([{ tick: 0, order: 0, bytes: [0xff, 0x51, 3, (us >> 16) & 255, (us >> 8) & 255, us & 255] }]);
  for (const tr of tracks) {
    const ev = [];
    if (tr.name) { const nb = str(tr.name); ev.push({ tick: 0, order: 0, bytes: [0xff, 0x03, ...vlq(nb.length), ...nb] }); }
    for (const n of tr.notes || []) {
      const ch = (n.ch ?? 0) & 15;
      ev.push({ tick: n.tick, order: 2, bytes: [0x90 | ch, n.midi & 127, Math.max(1, n.vel ?? 96) & 127] });
      ev.push({ tick: n.tick + Math.max(1, n.dur), order: 1, bytes: [0x80 | ch, n.midi & 127, 0] });
    }
    chunk(ev);
  }
  return new Uint8Array(out);
}
