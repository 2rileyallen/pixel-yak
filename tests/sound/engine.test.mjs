// tests/sound/engine.test.mjs — the sound engine without listening: notation both ways, renders
// that are healthy (no NaN, not silent, below full scale), strings in tune, WAV files that read
// back, the user's edits laid over the AI's songs (and drift when the AI changes them), MIDI in,
// hummed melodies in. Run: node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseTrack, formatTokens, tokenize, transposeToken, trackKeys, noteToMidi, midiToNote,
  compileSong, compileSfx, songSeconds, renderSong, renderSfx, renderWith, audioStats, encodeWav, decodeWav,
  applySoundEdits, makeSongEdit, makeSfxEdit, makeInstrumentEdits, applySongEdit, songChanges, describeChange,
  editsIndexSource, parseEditsIndexSource, checkSoundEdit, defineSound,
} from '../../engine/sound/index.js';
import { pitchTrack, detectPitch, melodyToTokens, guessKey, analyseAudio } from '../../engine/sound/pitch.js';
import { parseMidi, writeMidi, midiTrackToTokens } from '../../engine/sound/midi.js';

const INST = {
  lead: { type: 'synth', wave: 'square', wave2: 'square', detune2: 7, cutoff: 3000, level: 0.4 },
  pluck: { type: 'pluck', bright: 0.55, level: 0.9 },
  bass: { type: 'synth', wave: 'triangle', cutoff: 800, fenv: 3, ftime: 0.15, level: 0.8 },
  bell: { type: 'fm', ratio: 3.5, index: 2.4, level: 0.4 },
  drums: { type: 'drums', kit: {
    K: [{ tone: 'sine', from: 150, to: 46, sweep: 0.2, len: 0.55, vol: 1 }, { noise: 'lowpass', from: 900, len: 0.08, vol: 0.5 }],
    k: { like: 'K', vol: 0.55 },
    S: [{ noise: 'bandpass', from: 1900, q: 0.9, len: 0.16, vol: 0.55 }],
    h: [{ noise: 'highpass', from: 7000, len: 0.035, vol: 0.2 }],
    G: [{ tone: 'sine', from: 101, to: 98, sweep: 0.6, len: 3, vol: 0.5, partials: [[1, 1], [1.42, 0.6], [2.14, 0.45]] }],
  } },
};
const SONG = {
  name: 'Test', bpm: 120, order: ['A', 'B'],
  sections: {
    A: { tracks: [
      { inst: 'lead', vol: 0.5, notes: 'E5 - - . G5 - A5 - | B5 - - - . . . .' },
      { inst: 'bass', vol: 0.6, notes: 'A2 . A2 . E2 . A2 . | F2 . F2 . C3 . F2 .' },
      { inst: 'drums', vol: 0.6, notes: 'K . h . S . h . | K . K . S . h h!' },
      { inst: 'drums', vol: 0.3, notes: 'G_ . . . . . . . | . . . . . . . .' },
    ] },
    B: { tracks: [
      { inst: 'pluck', vol: 0.5, notes: 'A4 . C5 . E5 . C5 . | G4+B4+D5 - - - . . . .', spb: 2 },
      { inst: 'bell', vol: 0.4, notes: '. . . . E6 - - - | . . . . . . . .' },
    ] },
  },
};

const healthy = (r, what) => {
  const s = audioStats(r);
  assert.equal(s.nan, 0, `${what}: NaN samples`);
  assert.ok(!s.silent, `${what}: silent`);
  assert.ok(s.peak < 1, `${what}: peak ${s.peak} reaches full scale`);
  return s;
};

test('notation: notes, rests, ties, chords, accents', () => {
  const t = parseTrack('C4 - - . E4! | G4+B4 - Bb2_ .');
  assert.equal(t.len, 9);
  assert.deepEqual(t.events.map((e) => [e.step, e.len, e.midi, e.vel]), [[0, 3, [60], 1], [4, 1, [64], 1.25], [5, 2, [67, 71], 1], [7, 1, [46], 0.55]]);
  assert.equal(noteToMidi('A4'), 69);
  assert.equal(midiToNote(61), 'C#4');
  assert.equal(midiToNote(61, true), 'Db4');
  assert.equal(transposeToken('E4!', 1), 'F4!');
  assert.equal(transposeToken('C4+E4', 12), 'C5+E5');
  assert.equal(transposeToken('.', 3), '.');
  assert.equal(formatTokens(tokenize('a b c d e'), 2), 'a b | c d | e');
  const d = parseTrack('K . K+h S! .', { drums: true });
  assert.deepEqual(d.events.map((e) => e.hits.join('+')), ['K', 'K+h', 'S']);
  assert.equal(parseTrack('C4 Q9 .').bad.length, 1);
  assert.equal(parseTrack('- C4').events[0].step, 1, 'a tie at the start is silent');
});

test('track keys stay stable when other tracks are added', () => {
  assert.deepEqual(trackKeys([{ inst: 'lead' }, { inst: 'drums' }, { inst: 'drums' }, { inst: 'x', id: 'mine' }]), ['lead', 'drums#1', 'drums#2', 'mine']);
});

test('a song compiles and renders healthy audio (no NaN, not silent, below full scale)', () => {
  const c = compileSong(SONG, INST, { id: 'test' });
  assert.deepEqual(c.warnings, []);
  assert.equal(c.sections.A.len, 16);
  assert.equal(songSeconds(c), 32 * 0.125);
  const r = renderSong(c, { seconds: 5 });
  const s = healthy(r, 'song');
  assert.ok(s.rmsDb > -40, `too quiet: ${s.rmsDb} dB`);
});

test('unknown instruments and unreadable notes warn instead of crashing', () => {
  const c = compileSong({ bpm: 100, sections: { A: { tracks: [{ inst: 'nope', notes: 'C4 Z . K' }, { inst: 'drums', notes: 'K X' }] } } }, INST);
  assert.ok(c.warnings.some((w) => w.includes('unknown instrument "nope"')));
  assert.ok(c.warnings.some((w) => w.includes("can't read")));
  assert.ok(c.warnings.some((w) => w.includes('has no X')));
  healthy(renderSong(c, { seconds: 1 }), 'fallback');
});

test('a plucked string is in tune and never reads outside its buffer (no NaN), high or low', () => {
  for (const [note, hz] of [['A4', 440], ['E2', 82.41], ['C7', 2093], ['C1', 32.7], ['G9', 12543.85]]) {
    const r = renderWith(1.2, (e) => e.handle({ t: 'note', type: 'pluck', p: compileSong({ sections: { A: { tracks: [{ inst: 'pluck', notes: note }] } } }, INST).sections.A.tracks[0].p, midi: [noteToMidi(note)], len: 0.8, vel: 1, vol: 0.8 }));
    const s = audioStats(r);
    assert.equal(s.nan, 0, `${note}: NaN`);
    assert.ok(!s.silent, `${note}: silent`);
    if (hz < 1500 && hz > 60) {
      const seg = r.left.subarray(Math.round(0.1 * 44100), Math.round(0.1 * 44100) + 4096);
      const p = detectPitch(seg, 44100, { minHz: 40, maxHz: 2000 });
      const cents = 1200 * Math.log2(p.hz / hz);
      assert.ok(Math.abs(cents) < 15, `${note}: heard ${p.hz.toFixed(1)} Hz, want ${hz} (${cents.toFixed(1)} cents)`);
    }
  }
});

test('every voice type renders without NaN at extreme settings', () => {
  const extreme = {
    a: { type: 'synth', wave: 'saw', wave2: 'pulse', wave3: 'square', oct3: 2, sub: 1, breath: 1, cutoff: 16000, q: 12, fenv: 16, ftime: 0.01, attack: 0.001, decay: 0.01, sustain: 0, release: 0.01, vibrato: 60, vrate: 12, scoop: 200 },
    b: { type: 'fm', ratio: 8, index: 12, indexEnd: 0, itime: 0.02, decay: 0.05 },
    c: { type: 'pluck', bright: 1, sustain: 1, ring: 0.05, tone: 3 },
  };
  const c = compileSong({ bpm: 400, sections: { A: { tracks: ['a', 'b', 'c'].map((inst) => ({ inst, vol: 1.5, notes: 'C0 G9 C4+E4+G4+B4! - . C-1 G9' })) } } }, extreme);
  healthy(renderSong(c, { seconds: 2 }), 'extreme');
});

test('sound effects compile and render', () => {
  const fx = compileSfx({ vol: 1, layers: [
    { noise: 'lowpass', from: 2400, to: 400, len: 0.1, vol: 0.5 },
    { tone: 'sine', from: 160, to: 70, len: 0.1, vol: 0.4, at: 0.02 },
    { note: ['E6', 'B6'], every: 0.06, inst: 'bell', len: 0.1, vel: 0.4 },
    { drum: 'K', inst: 'drums', vel: 0.5 },
  ] }, INST);
  assert.deepEqual(fx.warnings, []);
  assert.equal(fx.layers.length, 5);
  healthy(renderSfx(fx), 'sfx');
});

test('WAV files: header, length and samples read back', () => {
  const r = renderSong(compileSong(SONG, INST), { seconds: 1 });
  const bytes = encodeWav(r);
  assert.equal(String.fromCharCode(...bytes.subarray(0, 4)), 'RIFF');
  assert.equal(bytes.length, 44 + 44100 * 2 * 2);
  const d = decodeWav(bytes);
  assert.equal(d.sampleRate, 44100);
  assert.equal(d.channels.length, 2);
  assert.equal(d.channels[0].length, 44100);
  let err = 0;
  for (let i = 0; i < 44100; i += 97) err = Math.max(err, Math.abs(d.channels[0][i] - r.left[i]));
  assert.ok(err < 1 / 16000, `16-bit round trip error ${err}`);
  const f = decodeWav(encodeWav(r, { bits: 32 }));
  assert.equal(f.channels[1][500], r.right[500]);
});

test("the user's song edit: saved as a diff, laid back on exactly, flagged when the AI changes the track", () => {
  const working = JSON.parse(JSON.stringify(SONG));
  working.bpm = 132;
  const lead = working.sections.A.tracks[0];
  const toks = tokenize(lead.notes);
  toks[4] = 'A5'; toks[5] = '.';
  lead.notes = toks.join(' ');
  lead.vol = 0.35;
  working.sections.A.tracks[1].cutoff = 1200; // a track-only instrument tweak
  working.sections.B.tracks.push({ id: 'hum-1', inst: 'lead', notes: 'C5 - - - . . . . | . . . . . . . .', vol: 0.4, added: 'hum' });
  const ed = makeSongEdit(SONG, working, { game: 'g', song: 'test' });
  assert.deepEqual(checkSoundEdit(ed), []);
  assert.equal(ed.bpm, 132);
  assert.deepEqual(ed.tracks['A/lead'].steps, { 4: 'A5', 5: '.' });
  assert.equal(ed.tracks['A/lead'].vol, 0.35);
  assert.deepEqual(ed.tracks['A/bass'].set, { cutoff: 1200 });
  assert.equal(ed.added[0].from, 'hum');
  // applying it reproduces the user's version
  const { song, drift, orphans } = applySongEdit(SONG, ed);
  assert.deepEqual(drift, []);
  assert.deepEqual(orphans, []);
  assert.deepEqual(tokenize(song.sections.A.tracks[0].notes), toks);
  assert.equal(song.sections.B.tracks.at(-1).id, 'hum-1');
  // the AI adds a track before the lead and rewrites the bass: the lead edit still lands, the bass drifts
  const next = JSON.parse(JSON.stringify(SONG));
  next.sections.A.tracks.unshift({ inst: 'pluck', notes: 'C4 . . .' });
  next.sections.A.tracks[2].notes = 'A1 . . . | . . . .';
  const r2 = applySongEdit(next, ed);
  assert.deepEqual(tokenize(r2.song.sections.A.tracks[1].notes).slice(4, 6), ['A5', '.']);
  assert.deepEqual(r2.drift, []);
  // the AI removes the lead: the edit is an orphan, never applied elsewhere
  const gone = JSON.parse(JSON.stringify(SONG));
  gone.sections.A.tracks.shift();
  assert.deepEqual(applySongEdit(gone, ed).orphans, ['A/lead']);
  // the AI changes the lead's notes under the user's edit: drift
  const moved = JSON.parse(JSON.stringify(SONG));
  moved.sections.A.tracks[0].notes = 'D5 - - . G5 - A5 - | B5 - - - . . . .';
  assert.deepEqual(applySongEdit(moved, ed).drift, ['A/lead']);
  // changes in words (lessons)
  const ch = songChanges(SONG, song);
  assert.ok(ch.some((c) => c.what === 'tempo'));
  const n = ch.find((c) => c.what === 'notes');
  assert.deepEqual(n.bars, [1]);
  assert.match(describeChange(n), /A\/lead: 2 steps changed in bar 1/);
  assert.ok(ch.some((c) => c.what === 'track-added' && c.from === 'hum'));
});

test('instrument and sound-effect edits, and the generated index', () => {
  const ie = makeInstrumentEdits(INST, { lead: { ...INST.lead, cutoff: 5000 } }, { game: 'g' });
  assert.deepEqual(ie.instruments.lead, { set: { cutoff: 5000 }, base: { cutoff: 3000 } });
  const fx = { vol: 1, layers: [{ tone: 'sine', from: 160, to: 70, len: 0.1, vol: 0.4 }] };
  const fe = makeSfxEdit(fx, { vol: 0.8, layers: [{ ...fx.layers[0], from: 220 }] }, { game: 'g', sfx: 'hit' });
  assert.deepEqual(fe.layers, { 0: { from: 220 } });
  const idx = { songs: {}, sfx: { hit: fe }, instruments: ie };
  const back = parseEditsIndexSource(editsIndexSource(idx));
  assert.deepEqual(back.sfx.hit.layers, { 0: { from: 220 } });
  const applied = applySoundEdits({ instruments: INST, songs: {}, sfx: { hit: fx } }, back);
  assert.equal(applied.instruments.lead.cutoff, 5000);
  assert.equal(applied.sfx.hit.layers[0].from, 220);
  assert.equal(applied.sfx.hit.vol, 0.8);
  assert.deepEqual(applied.report, { drift: [], orphans: [] });
  // the AI retunes the lead's cutoff under the user's knob: drift
  const r = applySoundEdits({ instruments: { ...INST, lead: { ...INST.lead, cutoff: 2000 } }, songs: {}, sfx: {} }, back);
  assert.deepEqual(r.report.drift, ['instrument lead.cutoff']);
});

test('defineSound applies edits at load and works in Node (no audio until unlock)', () => {
  const ed = makeSongEdit(SONG, { ...JSON.parse(JSON.stringify(SONG)), bpm: 90 }, { game: 'g', song: 'test' });
  const S = defineSound({ game: 'g', instruments: INST, songs: { test: SONG }, sfx: {}, edits: { songs: { test: ed }, sfx: {}, instruments: {} } });
  assert.equal(S.songs.test.bpm, 90);
  assert.equal(S.base.songs.test.bpm, 120);
  assert.equal(S.song('test').bpm, 90);
  S.music('test'); // before unlock: remembered, no audio
  assert.equal(S.current(), 'test');
});

test('MIDI: a file written and read back becomes notation on the grid', () => {
  const ppq = 480, st = ppq / 4;
  const notes = [{ tick: 0, dur: st * 2, midi: 64, vel: 100 }, { tick: st * 2, dur: st, midi: 67, vel: 100 }, { tick: st * 4, dur: st * 4, midi: 69, vel: 100 }, { tick: st * 4, dur: st * 4, midi: 60, vel: 80 }];
  const bytes = writeMidi({ ppq, bpm: 100, tracks: [{ name: 'Melody', notes }, { name: 'Beat', notes: [{ tick: 0, dur: 60, midi: 36, vel: 100, ch: 9 }, { tick: st * 2, dur: 60, midi: 42, vel: 100, ch: 9 }, { tick: st * 4, dur: 60, midi: 38, vel: 127, ch: 9 }] }] });
  const m = parseMidi(bytes);
  assert.equal(m.ppq, 480);
  assert.equal(m.bpm, 100);
  assert.equal(m.tracks.length, 2);
  assert.equal(m.tracks[0].name, 'Melody');
  const mono = midiTrackToTokens(m, 0, { spb: 4, barSteps: 16 });
  assert.deepEqual(mono.tokens.slice(0, 9), ['E4', '-', 'G4', '.', 'A4', '-', '-', '-', '.']);
  const chords = midiTrackToTokens(m, 0, { spb: 4, mode: 'chords' });
  assert.equal(chords.tokens[4], 'C4+A4');
  const drums = midiTrackToTokens(m, 1, { spb: 4 });
  assert.deepEqual(drums.tokens.slice(0, 5), ['K', '.', 'h', '.', 'S!']);
  assert.equal(mono.len, 16);
});

// a "hummed" test signal: sine notes with a little vibrato and gaps between them
function hum(notes, bpm, sr = 44100) {
  const stepSec = 60 / bpm / 4;
  const out = new Float32Array(Math.ceil(notes.length * stepSec * sr) + sr / 2);
  let ph = 0;
  notes.forEach((n, i) => {
    if (n === '.' || n === '-') return;
    let len = 1;
    while (notes[i + len] === '-') len++;
    const hz = 440 * Math.pow(2, (noteToMidi(n) - 69) / 12);
    const a = Math.round(i * stepSec * sr), b = Math.round((i + len) * stepSec * sr - 0.03 * sr);
    for (let k = a; k < b; k++) {
      ph += (hz * (1 + 0.004 * Math.sin((k / sr) * 2 * Math.PI * 5.5))) / sr;
      const env = Math.min(1, (k - a) / (0.01 * sr), (b - k) / (0.01 * sr));
      out[k] = 0.4 * env * (Math.sin(2 * Math.PI * ph) + 0.3 * Math.sin(4 * Math.PI * ph));
    }
  });
  return out;
}

test('a hummed melody becomes notes at the song tempo', () => {
  const want = ['A4', '-', 'C5', '-', 'E5', '-', '-', '-', 'D5', '-', 'C5', '-', 'A4', '-', '-', '-'];
  const x = hum(want, 100);
  const tr = pitchTrack(x, 44100);
  const got = melodyToTokens(tr, { bpm: 100, spb: 4, steps: 16 }).tokens;
  const notesOf = (t) => t.filter((v) => v !== '-' && v !== '.');
  assert.deepEqual(notesOf(got), notesOf(want), `heard ${got.join(' ')}`);
  const key = guessKey(tr);
  assert.ok(key && ['A minor', 'C major'].includes(key.name), `key ${key && key.name}`);
});

test('a reference recording is analysed: length, loudness, a tempo and a key', () => {
  const c = compileSong({ bpm: 120, sections: { A: { tracks: [
    { inst: 'drums', vol: 0.8, notes: Array(8).fill('K . . . S . . .').join(' ') },
    { inst: 'lead', vol: 0.5, notes: Array(4).fill('A4 - C5 - E5 - C5 - A4 - - - E4 - - -').join(' ') },
  ] } } }, INST);
  const r = renderSong(c, { seconds: 8 });
  const a = analyseAudio(r.left, 44100);
  assert.ok(Math.abs(a.seconds - 8) < 0.01);
  assert.ok(a.tempo && [60, 120, 240].some((t) => Math.abs(a.tempo - t) <= 3), `tempo ${a.tempo}`);
  assert.ok(a.lines.length >= 4);
});
