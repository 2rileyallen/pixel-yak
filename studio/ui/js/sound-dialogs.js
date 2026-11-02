// studio/ui/js/sound-dialogs.js — the Sound view's "your own music in" dialogs:
//   MIDI file → a track (any app exports MIDI; quantized to the song's grid)
//   hum a melody → a track (the mic, pitch detection in plain JS, notes at the song's tempo)
//   a reference recording (WAV/MP3) → a request for the AI with what the studio heard in it;
//     the recording is attached for the AI and never goes into a game.
// A new track is a user edit like any other: it shows in the grid, plays, and is kept on Save.
import { h, mount, btn, modal, toast, field, select } from './ui.js';
import { icon } from './icons.js';
import { compileSong, tokenize, formatTokens, stepsPerBar, noteToMidi } from '../../../engine/sound/index.js';
import { parseMidi, describeMidiTrack, midiTrackToTokens } from '../../../engine/sound/midi.js';
import { detectPitch, pitchTrack, melodyToTokens, guessKey, analyseAudio } from '../../../engine/sound/pitch.js';

const clone = (o) => JSON.parse(JSON.stringify(o));

function sectionLen(view, section) {
  const c = compileSong(view.sel.work, view.inst.work);
  return c.sections[section] ? c.sections[section].len : 0;
}

// Play the song with a draft track added (the dialogs' "Hear it").
async function hearDraft(view, section, inst, tokens) {
  const song = clone(view.sel.work);
  song.sections[section].tracks.push({ id: 'draft', inst, notes: tokens.join(' '), vol: 0.55 });
  const c = compileSong(song, view.inst.work);
  const p = await view.ensurePlayer();
  p.send({ t: 'play', song: c, at: { order: Math.max(0, c.order.indexOf(section)), step: 0 }, range: { section }, fade: 0.01 });
  return p;
}

// A small piano roll of a token list (pixel-crisp), for the dialogs' previews.
function drawRoll(cv, tokens, { color = '#f4c443', drums = false } = {}) {
  const W = cv.width, H = cv.height, g = cv.getContext('2d');
  g.fillStyle = '#080913'; g.fillRect(0, 0, W, H);
  const px = W / Math.max(1, tokens.length);
  g.fillStyle = '#222846';
  for (let s = 0; s < tokens.length; s += 16) g.fillRect(Math.round(s * px), 0, 1, H);
  const notes = [];
  tokens.forEach((t, s) => {
    if (t === '.' || t === '-') return;
    let len = 1;
    while (tokens[s + len] === '-') len++;
    const ms = drums ? [60] : t.replace(/[!_]$/, '').split('+').map(noteToMidi).filter((m) => m != null);
    for (const m of ms) notes.push({ s, len, m });
  });
  if (!notes.length) return;
  const lo = Math.min(...notes.map((n) => n.m)) - 2, hi = Math.max(...notes.map((n) => n.m)) + 2;
  g.fillStyle = color;
  for (const n of notes) g.fillRect(Math.round(n.s * px), Math.round((1 - (n.m - lo) / Math.max(1, hi - lo)) * (H - 6)) + 1, Math.max(2, Math.round(n.len * px) - 1), 3);
}

const instOptions = (view) => Object.keys(view.inst.work).map((id) => [id, `${id} (${view.inst.work[id].type || 'synth'})`]);

// ------------------------------------------------------------------- MIDI ---
export async function openMidiImport(view, file) {
  let midi;
  try { midi = parseMidi(new Uint8Array(await file.arrayBuffer())); } catch (err) { toast(`Can't read ${file.name}: ${err.message}`, { kind: 'error' }); return; }
  if (!midi.tracks.length) { toast(`${file.name} has no notes.`, { kind: 'warn' }); return; }
  const s = view.sel;
  const song = s.work;
  const bar = stepsPerBar(song), spb = song.spb || 4;
  const st = { track: Math.max(0, midi.tracks.findIndex((t) => !t.channels.includes(9))), mode: 'mono', section: s.section, fit: true, inst: null };
  const isDrumTrack = () => midi.tracks[st.track].channels.includes(9);
  const defaultInst = () => (isDrumTrack() ? (view.inst.work.drums ? 'drums' : Object.keys(view.inst.work).find((k) => view.inst.work[k].type === 'drums')) : view.inst.work.lead ? 'lead' : Object.keys(view.inst.work)[0]);
  st.inst = defaultInst();
  let result = null;
  const roll = h('canvas.snd-roll', { width: 680, height: 72 });
  const text = h('pre.snd-pre');
  const info = h('div.dim', { style: { fontSize: '12px' } });
  const instSel = select(instOptions(view), st.inst, (v) => { st.inst = v; update(); });
  const tracks = h('div.snd-mtracks', null, midi.tracks.map((t, i) => h('label.snd-mtrack', null,
    h('input', { type: 'radio', name: 'mtrack', checked: i === st.track, onchange: () => { st.track = i; st.inst = defaultInst(); instSel.value = st.inst; update(); } }),
    h('span', null, describeMidiTrack(t)))));
  const update = () => {
    const drums = (view.inst.work[st.inst] || {}).type === 'drums';
    const len = sectionLen(view, st.section);
    result = midiTrackToTokens(midi, st.track, { spb, mode: st.mode, drums, barSteps: bar, steps: st.fit ? len : null });
    text.textContent = result.notes;
    drawRoll(roll, result.tokens, { drums });
    info.textContent = `${result.len} steps (${Math.round((result.len / bar) * 10) / 10} bars) on the song's grid${result.dropped ? ` · ${result.dropped} notes didn't fit (overlapping, out of range or past the end)` : ''}${st.fit ? ` · cut / padded to section ${st.section}'s ${len} steps` : ''}`;
  };
  let player = null;
  const m = modal({
    title: `Import from MIDI — ${file.name}`, wide: true,
    body: h('div.col', { style: { gap: '12px' } },
      h('p', { style: { margin: 0, color: 'var(--text2)' } }, `${midi.tracks.length} track${midi.tracks.length === 1 ? '' : 's'} with notes · the file's tempo is ${midi.bpm} bpm; the notes land on this song's grid (${song.bpm} bpm, ${spb} steps a beat). Pick one track:`),
      tracks,
      h('div.form-grid', null,
        field('Notes', select([['mono', 'Melody (the top note)'], ['chords', 'Chords (notes together)']], st.mode, (v) => { st.mode = v; update(); })),
        field('Instrument', instSel),
        field('Into section', select(Object.keys(song.sections).map((k) => [k, `Section ${k} (${sectionLen(view, k)} steps)`]), st.section, (v) => { st.section = v; update(); })),
        field('Length', h('label.check', null, h('input', { type: 'checkbox', checked: st.fit, onchange: (e) => { st.fit = e.target.checked; update(); } }), "Fit the section's length"))),
      roll, info, text),
    actions: [
      { label: 'Hear it', ico: 'play', left: true, fn: async () => { player = await hearDraft(view, st.section, st.inst, result.tokens); return false; } },
      { label: 'Cancel' },
      { label: 'Add as a track', kind: 'primary', ico: 'plus', fn: () => { view.addTrack(st.section, { inst: st.inst, notes: formatTokens(result.tokens, bar), from: 'midi', name: (midi.tracks[st.track].name || '').slice(0, 40) || undefined }); } },
    ],
    onClose: () => { if (player) player.send({ t: 'stop', fade: 0.1 }); },
  });
  update();
  return m;
}

// ------------------------------------------------------------------- hum ---
// opts.samples/sampleRate: analyse a recording you already have (tests; no mic needed).
export function openHum(view, { samples = null, sampleRate = 44100 } = {}) {
  const s = view.sel;
  const song = s.work;
  const bar = stepsPerBar(song), spb = song.spb || 4;
  const bpm = song.bpm || 120;
  const st = { section: s.section, inst: view.inst.work.lead ? 'lead' : Object.keys(view.inst.work)[0], octave: 0, snap: true, tokens: null, track: null, rec: null };
  const allNotes = Object.values(compileSong(song, view.inst.work).sections).flatMap((x) => x.tracks.filter((t) => t.type !== 'drums').flatMap((t) => t.events.flatMap((e) => e.midi)));
  const key = allNotes.length ? guessKey(allNotes.map((m) => ({ midi: m, clarity: 1, rms: 1 }))) : null;
  const cv = h('canvas.snd-hum', { width: 680, height: 132 });
  const status = h('div.snd-hum-status', null, `Press Record: four clicks at ${bpm} bpm, then hum or sing one line. It records section ${st.section}'s length; Stop ends it early.`);
  const text = h('pre.snd-pre');
  const recBtn = btn('Record', () => (st.rec ? stopRec() : startRec()), { kind: 'danger', ico: 'mic' });
  const len = () => sectionLen(view, st.section);
  const stepSec = 60 / bpm / spb;
  const seconds = () => len() * stepSec;

  const draw = (live = null) => {
    const W = cv.width, H = cv.height, g = cv.getContext('2d');
    g.fillStyle = '#080913'; g.fillRect(0, 0, W, H);
    const total = Math.max(1, len());
    for (let i = 0; i <= total; i += spb) { g.fillStyle = i % bar === 0 ? '#2f3662' : '#171a2e'; g.fillRect(Math.round((i / total) * W), 0, 1, H); }
    const y = (m) => Math.round((1 - (m - 40) / 50) * (H - 8)) + 2;
    const tr = live || st.track || [];
    g.fillStyle = 'rgba(58,203,201,.75)';
    for (const f of tr) if (f.midi != null && f.clarity > 0.7) g.fillRect(Math.round((f.t / seconds()) * W), y(f.midi), 2, 2);
    if (st.tokens) {
      g.fillStyle = '#f4c443';
      st.tokens.forEach((t, i) => {
        if (t === '.' || t === '-') return;
        let l = 1; while (st.tokens[i + l] === '-') l++;
        g.fillRect(Math.round((i / total) * W), y(noteToMidi(t)) - 1, Math.max(2, Math.round((l / total) * W) - 1), 4);
      });
    }
  };

  const finish = (x, sr) => {
    st.track = pitchTrack(x, sr);
    const r = melodyToTokens(st.track, { bpm, spb, steps: len(), scale: st.snap ? key : null, octave: st.octave });
    st.tokens = r.tokens;
    text.textContent = formatTokens(r.tokens, bar);
    status.textContent = r.notes ? `Heard ${r.notes} note${r.notes === 1 ? '' : 's'} (${Math.round(r.voiced * 100)}% of the steps sound)${st.snap && key ? `, snapped to ${key.name}` : ''}. Hear it with the song, try again, or keep it.` : 'No clear notes heard — try humming louder, closer to the mic, one note at a time.';
    m.el.querySelector('[data-act="keep"]').disabled = !r.notes;
    draw();
  };

  let stream = null, proc = null, src = null, chunks = [], t0 = 0, rate = 44100, timer = null;
  async function startRec() {
    let p;
    try { p = await view.ensurePlayer(); } catch (err) { toast(err.message, { kind: 'error' }); return; }
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } }); }
    catch (err) { toast(`No microphone: ${err.message}`, { kind: 'error' }); return; }
    if (view.playing) view.stop();
    const ctx = p.ctx;
    rate = ctx.sampleRate;
    st.rec = true; st.tokens = null; chunks = [];
    mount(recBtn, icon('stop'), h('span', null, 'Stop'));
    // count-in: four clicks on the beat
    const click = (i) => p.send({ t: 'note', type: 'fm', p: { ratio: 3.5, index: 1.2, indexEnd: 0.05, itime: 0.1, attack: 0.001, decay: 0.15, level: 0.5, echo: 0, pan: 0 }, midi: [i === 0 ? 96 : 89], len: 0.05, vol: 0.7 });
    for (let i = 0; i < 4; i++) setTimeout(() => { if (st.rec) { click(i); status.textContent = `${4 - i}…`; } }, i * (60 / bpm) * 1000);
    await new Promise((r) => setTimeout(r, 4 * (60 / bpm) * 1000));
    if (!st.rec) return;
    src = ctx.createMediaStreamSource(stream);
    proc = ctx.createScriptProcessor(2048, 1, 1);
    const live = [];
    t0 = ctx.currentTime;
    proc.onaudioprocess = (e) => {
      const x = new Float32Array(e.inputBuffer.getChannelData(0));
      chunks.push(x);
      const pt = detectPitch(x, rate, { minHz: 70, maxHz: 1100 });
      live.push({ t: ctx.currentTime - t0, midi: pt.hz > 0 ? 69 + 12 * Math.log2(pt.hz / 440) : null, clarity: pt.clarity });
      draw(live);
    };
    src.connect(proc); proc.connect(ctx.destination);
    status.textContent = `Recording… ${Math.round(seconds())} s`;
    timer = setTimeout(stopRec, seconds() * 1000 + 150);
  }
  function stopRec() {
    clearTimeout(timer);
    const was = st.rec;
    st.rec = null;
    try { if (src) src.disconnect(); if (proc) proc.disconnect(); } catch { /* gone */ }
    if (stream) stream.getTracks().forEach((t) => t.stop());
    src = proc = stream = null;
    mount(recBtn, icon('mic'), h('span', null, 'Record again'));
    if (!was || !chunks.length) return;
    const n = chunks.reduce((a, c) => a + c.length, 0);
    const x = new Float32Array(n);
    let o = 0;
    for (const c of chunks) { x.set(c, o); o += c.length; }
    finish(x, rate);
  }

  let player = null;
  const m = modal({
    title: 'Hum a melody', wide: true,
    body: h('div.col', { style: { gap: '12px' } },
      h('div.row', null, recBtn, status),
      cv,
      h('div.form-grid', null,
        field('Into section', select(Object.keys(song.sections).map((k) => [k, `Section ${k} (${sectionLen(view, k)} steps)`]), st.section, (v) => { st.section = v; draw(); })),
        field('Instrument', select(instOptions(view), st.inst, (v) => { st.inst = v; })),
        field('Octave', select([['-1', 'One lower'], ['0', 'As hummed'], ['1', 'One higher']], '0', (v) => { st.octave = +v; if (st.track) refresh(); })),
        field('Key', h('label.check', null, h('input', { type: 'checkbox', checked: st.snap, onchange: (e) => { st.snap = e.target.checked; if (st.track) refresh(); } }), key ? `Snap to the song's key (${key.name})` : 'Snap to the song\'s key'))),
      text,
      h('p.dim', { style: { margin: 0, fontSize: '12px' } }, 'Nothing leaves this computer: the pitch is worked out right here, and only the notes are kept.')),
    actions: [
      { label: 'Hear it', ico: 'play', left: true, fn: async () => { if (st.tokens) player = await hearDraft(view, st.section, st.inst, st.tokens); return false; } },
      { label: 'Cancel' },
      { label: 'Keep as a track', kind: 'primary', ico: 'plus', id: 'keep', fn: () => { if (!st.tokens) return false; view.addTrack(st.section, { inst: st.inst, notes: formatTokens(st.tokens, bar), from: 'hum' }); } },
    ],
    onClose: () => { if (st.rec) stopRec(); if (player) player.send({ t: 'stop', fade: 0.1 }); },
  });
  const refresh = () => {
    const r = melodyToTokens(st.track, { bpm, spb, steps: len(), scale: st.snap ? key : null, octave: st.octave });
    st.tokens = r.tokens;
    text.textContent = formatTokens(r.tokens, bar);
    draw();
  };
  m.el.querySelector('[data-act="keep"]').disabled = true;
  draw();
  if (samples) finish(samples, sampleRate);
  return m;
}

// -------------------------------------------------------------- reference ---
const MIME = { wav: 'audio/wav', mp3: 'audio/mpeg', ogg: 'audio/ogg', flac: 'audio/flac', m4a: 'audio/mp4', aac: 'audio/aac', webm: 'audio/webm' };

export async function openReference(view, file) {
  const s = view.sel;
  const p = view.project;
  if (file.size > 25_000_000) { toast(`${file.name} is over 25 MB — trim it to the part you mean.`, { kind: 'warn' }); return; }
  const ext = (/\.([a-z0-9]+)$/i.exec(file.name) || [])[1]?.toLowerCase();
  const mime = MIME[ext] || (file.type && file.type.startsWith('audio/') ? file.type : null);
  if (!mime) { toast('Pick a WAV, MP3, OGG, FLAC or M4A file.', { kind: 'warn' }); return; }
  const buf = await file.arrayBuffer();
  let audio;
  try { audio = await new OfflineAudioContext(1, 1, 44100).decodeAudioData(buf.slice(0)); }
  catch (err) { toast(`Can't decode ${file.name}: ${err.message}`, { kind: 'error' }); return; }
  const mono = new Float32Array(audio.length);
  for (let c = 0; c < audio.numberOfChannels; c++) { const d = audio.getChannelData(c); for (let i = 0; i < d.length; i++) mono[i] += d[i] / audio.numberOfChannels; }
  const a = analyseAudio(mono, audio.sampleRate);
  const url = URL.createObjectURL(file);
  const note = h('textarea.input', { rows: 4, placeholder: 'What should the AI take from it? The feel, the drums, the tempo, the instruments… (it shapes the style; the recording never goes into the game)' });
  const b64 = await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result).replace(/^data:[^;]*;base64,/, '')); fr.onerror = () => rej(fr.error); fr.readAsDataURL(file); });
  const name = s.base.name || s.id;
  return modal({
    title: `A reference for the AI — ${file.name}`, wide: true,
    body: h('div.col', { style: { gap: '12px' } },
      h('audio', { src: url, controls: true, style: { width: '100%' } }),
      field('What the studio heard (rough guesses, so the AI can work without listening)', h('pre.snd-pre', null, a.lines.map((l) => `- ${l}`).join('\n'))),
      field(`About "${name}"`, note),
      h('p.dim', { style: { margin: 0, fontSize: '12px' } }, 'The recording is attached to the request for the AI to study. It is a reference only — it is never shipped in a game.')),
    actions: [
      { label: 'Cancel' },
      { label: 'Send to the AI', kind: 'primary', ico: 'send', fn: async (api) => {
        api.setBusy(true);
        try {
          await window.studio.requests.create(p.id, {
            kind: 'audio', tier: 'smart', title: `Reference for "${name}": ${file.name}`.slice(0, 200),
            body: `${note.value.trim() || '(no note)'}\n\n---\nThe studio listened to the attached recording (a reference only — never put it in the game):\n${a.lines.map((l) => `- ${l}`).join('\n')}`,
            target: { song: s.id, section: s.section },
          }, [{ name: file.name, dataUrl: `data:${mime};base64,${b64}` }]);
          toast('Sent — the AI will find it in the inbox.', { kind: 'ok' });
          return true;
        } catch (err) { api.setBusy(false); toast(err.message, { kind: 'error' }); return false; }
      } },
    ],
    onClose: () => URL.revokeObjectURL(url),
  });
}
