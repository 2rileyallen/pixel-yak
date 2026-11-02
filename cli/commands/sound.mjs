// cli/commands/sound.mjs — the game's music and sound effects for an AI that can't listen: every
// song as notation (the AI's version and the user's edits), renders to WAV with the numbers that
// say a render is healthy, the user's sound lessons, and a reading of reference recordings.
// The game's sound module (game/sound.js) is imported here in Node — it only builds data until
// a game calls unlock(), so nothing plays.
import path from 'node:path';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { D, out, fail, rel, ago, gameArg, plural, printRequest } from '../lib.mjs';
import {
  compileSong, compileSfx, songSeconds, sfxSeconds, renderSong, renderSfx, audioStats, encodeWav, decodeWav, toMono,
  tokenize, stepsPerBar, trackKeys, songChanges, describeChange, applySongEdit, SOUND_RUNTIME,
} from '../../engine/sound/index.js';
import { analyseAudio } from '../../engine/sound/pitch.js';

export const section = { title: 'Sound (the user\'s notes and knobs are never overwritten — they sit on top of yours)', order: 25 };

// Import a game's sound module → { info, S (its SOUND), edits (files on disk) }.
export async function loadSound(pid) {
  const info = await D.soundInfo(pid);
  if (!info.hasModule) fail(`${info.moduleRel} doesn't exist — this game has no sound yet (skill sound)`);
  let mod;
  // the engine's console notes (drift, unknown instruments) are printed by these commands in context
  console.warn = () => {};
  try { mod = await import(pathToFileURL(info.module).href + `?t=${Date.now()}`); }
  catch (err) { fail(`${info.moduleRel} failed to load: ${err.message}`); }
  const S = mod.SOUND;
  if (!S || S.runtime !== SOUND_RUNTIME) fail(`${info.moduleRel} must export SOUND = defineSound({…}) (docs/contracts/SOUND.md)`);
  const edits = await D.readSoundEdits(pid);
  return { info, S, edits };
}

const r2 = (v) => Math.round(v * 100) / 100;
const instLabel = (S, id) => { const i = S.instruments[id]; return i ? `${id} (${i.type || 'synth'}${i.wave ? ': ' + i.wave : ''})` : `${id} (missing!)`; };

function songLine(S, id, edits) {
  const c = S.song(id);
  const base = compileSong(S.base.songs[id], S.base.instruments, { id });
  const secs = c.order.map((k) => `${k}×${c.sections[k] ? c.sections[k].len / c.barSteps : 0}`).join(' ');
  const tracks = [...new Set(Object.values(c.sections).flatMap((s) => s.tracks.map((t) => t.inst)))];
  const ed = edits.songs[id];
  const bits = [`- ${id} — "${c.name}" · ${c.bpm} bpm · ${secs} bars · ${r2(songSeconds(c))} s a pass · ${c.loop === false ? 'plays once' : 'loops'} · ${tracks.join(', ')}`];
  if (ed) {
    const ch = songChanges(S.base.songs[id], S.songs[id]);
    bits.push(`  USER EDITED (${ago(ed.updated)}): ${ch.slice(0, 4).map(describeChange).join('; ')}${ch.length > 4 ? ` … +${ch.length - 4}` : ''}`);
  }
  const drift = S.report.drift.filter((d) => d.startsWith(`song ${id}:`));
  if (drift.length) bits.push(`  DRIFT: you changed ${drift.map((d) => d.slice(`song ${id}: `.length)).join(', ')} after the user edited it — their notes still play on top; check it still fits`);
  const warn = [...base.warnings, ...c.warnings.filter((w) => !base.warnings.includes(w))];
  if (warn.length) bits.push(`  WARNINGS: ${warn.join(' · ')}`);
  return bits.join('\n');
}

// The notation of one song: per section and track, bar by bar; the user's bars next to yours.
function printSong(S, id, { sectionOnly = null, aiOnly = false, edits = null } = {}) {
  const base = S.base.songs[id], cur = aiOnly ? base : S.songs[id];
  const c = compileSong(cur, S.instruments, { id });
  const bar = stepsPerBar(cur);
  out(`# ${id} — "${c.name}" · ${c.bpm} bpm${!aiOnly && +base.bpm !== +cur.bpm ? ` (yours: ${base.bpm}; the user set ${cur.bpm})` : ''} · ${c.spb} steps a beat, ${bar} a bar · order ${c.order.join(' ')} · ${c.loop === false ? 'plays once' : c.loop === true ? 'loops' : `loops to ${c.order[c.loop]}`}`);
  const ed = edits && edits.songs[id];
  if (ed && !aiOnly) {
    out(`The user edited this song (${S.game}'s sound edits, ${ago(ed.updated)}). USER rows are what the game plays; AI rows are yours. Never write their notes back into the song code — they already apply.`);
    for (const n of ed.notes || []) out(`  their note (${ago(n.ts)}): "${n.text}"`);
  }
  const drift = S.report.drift.filter((d) => d.startsWith(`song ${id}:`)).map((d) => d.slice(`song ${id}: `.length));
  for (const [sk, sec] of Object.entries(cur.sections)) {
    if (sectionOnly && sk !== sectionOnly) continue;
    const bsec = base.sections[sk] || { tracks: [] };
    const keys = trackKeys(sec.tracks), bkeys = trackKeys(bsec.tracks);
    const len = c.sections[sk].len;
    out(`\n## ${sk} — ${len} steps = ${r2(len / bar)} bars`);
    sec.tracks.forEach((t, i) => {
      const k = keys[i];
      const bt = bsec.tracks[bkeys.indexOf(k)];
      const mix = ['vol', 'pan', 'echo'].filter((f) => t[f] != null).map((f) => `${f} ${t[f]}${bt && bt[f] !== t[f] && !aiOnly ? ` (yours ${bt[f] ?? '—'})` : ''}`).join(' · ');
      const flags = [t.added ? `ADDED BY THE USER (${t.added})` : null, t.mute ? 'SILENT IN GAME (the user muted it)' : null, drift.includes(`${sk}/${k}`) ? 'DRIFT' : null].filter(Boolean);
      out(`### ${sk}/${k} — ${instLabel(S, t.inst)}${mix ? ' · ' + mix : ''}${t.oct ? ` · oct ${t.oct}` : ''}${flags.length ? ' · ' + flags.join(' · ') : ''}`);
      const a = bt ? tokenize(bt.notes) : null, b = tokenize(t.notes);
      const bars = Math.ceil(Math.max(b.length, a ? a.length : 0) / bar);
      for (let n = 0; n < bars; n++) {
        const ub = b.slice(n * bar, (n + 1) * bar).join(' ');
        const ab = a ? a.slice(n * bar, (n + 1) * bar).join(' ') : null;
        if (!aiOnly && a && ab !== ub) { out(`  ${String(n + 1).padStart(3)} AI   | ${ab}`); out(`  ${String(n + 1).padStart(3)} USER | ${ub}   <- changed`); }
        else out(`  ${String(n + 1).padStart(3)}      | ${ub}`);
      }
    });
  }
}

export async function soundContext(req) {
  printRequest(req, true);
  const id = req.target.song || req.target.sfx;
  out(`\nAbout ${req.target.song ? 'song' : 'sound effect'} "${id}"${req.target.section ? `, section ${req.target.section}` : ''}${req.target.bars && req.target.bars.length ? `, bars ${req.target.bars.join('–')}` : ''}:\n`);
  const { S, edits } = await loadSound(req.scope);
  if (req.target.song) {
    if (!S.base.songs[id]) { out(`(no song "${id}" in the game any more)`); return; }
    printSong(S, id, { edits, sectionOnly: req.target.section || null });
  } else printSfx(S, id, edits);
  out(`\nHear it without listening: node cli/yak.mjs render-song ${req.scope} ${id} --out scratch/${id}.wav (prints length, peak, loudness)`);
}

function printSfx(S, id, edits) {
  const fx = S.sfx[id], base = S.base.sfx[id];
  if (!fx) { out(`(no sound effect "${id}")`); return; }
  const c = compileSfx(fx, S.instruments);
  out(`# sfx ${id} · ${c.layers.length} layer(s) · ${r2(sfxSeconds(c))} s · vol ${fx.vol ?? 1}${edits.sfx[id] ? ' · USER EDITED (their values below; yours in brackets)' : ''}`);
  (fx.layers || []).forEach((L, i) => {
    const B = (base.layers || [])[i] || {};
    out(`  ${i + 1}. ${Object.entries(L).map(([k, v]) => `${k} ${JSON.stringify(v)}${JSON.stringify(B[k]) !== JSON.stringify(v) ? ` [${JSON.stringify(B[k] ?? null)}]` : ''}`).join(', ')}`);
  });
  for (const n of (edits.sfx[id] && edits.sfx[id].notes) || []) out(`  their note: "${n.text}"`);
}

function statsLine(s) {
  return `${s.seconds} s · peak ${s.peakDb} dBFS (at ${s.peakAt} s) · loudness ${s.rmsDb} dB RMS · loudest ${s.loudest[0]}–${s.loudest[1]} s${s.nan ? ` · ${s.nan} NaN SAMPLES (a voice is broken)` : ''}${s.clipped ? ` · ${s.clipped} clipped samples` : ''}${s.silent ? ' · SILENT' : ''}`;
}

// For `yak check`: every song and sound effect compiles and renders a moment healthy.
export async function checkSound(pid) {
  const lines = [];
  let errors = 0;
  for (const l of await D.checkSoundFiles(pid)) { lines.push(l); if (l.startsWith('ERROR')) errors++; }
  const info = await D.soundInfo(pid);
  if (!info.hasModule) return { lines, errors };
  let S;
  const warn = console.warn;
  console.warn = () => {}; // reported below, in context
  try { S = (await import(pathToFileURL(info.module).href + `?t=${Date.now()}`)).SOUND; }
  catch (err) { return { lines: [...lines, `ERROR ${info.moduleRel} failed to load: ${err.message.split('\n')[0]}`], errors: errors + 1 }; }
  if (!S || S.runtime !== SOUND_RUNTIME) return { lines: [...lines, `ERROR ${info.moduleRel} must export SOUND = defineSound({…})`], errors: errors + 1 };
  let n = 0;
  for (const id of Object.keys(S.songs)) {
    const c = S.song(id);
    for (const w of c.warnings) lines.push(`WARN  song ${id}: ${w}`);
    const s = audioStats(renderSong(c, { seconds: Math.min(3, Math.max(0.5, songSeconds(c))) }));
    if (s.nan || s.silent) { errors++; lines.push(`ERROR song ${id}: ${s.nan ? `${s.nan} NaN samples` : 'renders silence'}`); }
    n++;
  }
  for (const id of Object.keys(S.sfx)) {
    const c = S.effect(id);
    for (const w of c.warnings) lines.push(`WARN  sfx ${id}: ${w}`);
    const s = audioStats(renderSfx(c));
    if (s.nan || s.silent) { errors++; lines.push(`ERROR sfx ${id}: ${s.nan ? `${s.nan} NaN samples` : 'renders silence'}`); }
    n++;
  }
  for (const d of S.report.drift) lines.push(`WARN  drift: ${d} changed after the user edited it — check it in the Sound view`);
  for (const o of S.report.orphans) lines.push(`WARN  a user sound edit points at ${o}, which no longer exists`);
  console.warn = warn;
  lines.unshift(`sound: ${plural(Object.keys(S.songs).length, 'song')} · ${plural(Object.keys(S.sfx).length, 'sound effect')}${n ? ' — each renders without NaN or silence' : ''}`);
  return { lines, errors };
}

export const commands = {
  sound: {
    usage: 'sound <game>',
    help: 'its songs and sound effects, one line each, and what the user changed in them',
    async run({ pos }) {
      const p = await gameArg(pos[0]);
      const { info, S, edits } = await loadSound(p.id);
      out(`# Sound of ${p.id} — ${info.moduleRel} · instruments design/instruments.js${info.design ? ` (started from designs/sound/${info.design})` : ''} · the user's edits: ${info.editsRel}/`);
      out('\nSongs:');
      for (const id of Object.keys(S.base.songs)) out(songLine(S, id, edits));
      if (!Object.keys(S.base.songs).length) out('  (none)');
      out('\nSound effects:');
      for (const id of Object.keys(S.base.sfx)) {
        const c = S.effect(id);
        const ed = edits.sfx[id];
        out(`- ${id} · ${plural(c.layers.length, 'layer')} · ${r2(sfxSeconds(c))} s${ed ? ` · USER EDITED (${ago(ed.updated)}): ${Object.entries(ed.layers || {}).map(([i, set]) => `layer ${+i + 1} ${Object.keys(set).join(', ')}`).join('; ')}${ed.vol != null ? ` vol ${ed.vol}` : ''}` : ''}`);
      }
      if (!Object.keys(S.base.sfx).length) out('  (none)');
      out(`\nInstruments: ${Object.keys(S.base.instruments).map((id) => instLabel(S, id)).join(', ')}`);
      if (edits.instruments) out(`The user's knobs (every song): ${Object.entries(edits.instruments.instruments || {}).map(([id, ie]) => Object.entries(ie.set).map(([k, v]) => `${id}.${k} ${v} (yours ${S.base.instruments[id] ? S.base.instruments[id][k] ?? 'default' : '?'}${S.report.drift.includes(`instrument ${id}.${k}`) ? ', you changed it after they set theirs' : ''})`).join(', ')).join('; ')}`);
      for (const o of S.report.orphans) out(`WARN a user edit points at ${o}, which no longer exists`);
      for (const x of edits.invalid) out(`ERROR ${x.file}: ${x.errors.join('; ')}`);
      const ls = await D.soundLessonSummary(p.id);
      out(`\nSound lessons: ${ls.lessons} (${ls.undistilled} not distilled yet)${ls.undistilled ? ` → node cli/yak.mjs sound-lessons ${p.id} --new (skill sound-learn)` : ''}`);
      out(`Read a song: node cli/yak.mjs song ${p.id} <id> · hear it as numbers: node cli/yak.mjs render-song ${p.id} <id> --out scratch/<id>.wav`);
    },
  },

  song: {
    usage: 'song <game> <songId> [--section A] [--ai]',
    help: 'the song as notation, bar by bar: the user\'s changed bars next to yours\n(--ai: only your version)',
    async run({ pos, opt }) {
      const p = await gameArg(pos[0]);
      const id = D.assertId('asset', pos[1] || '');
      const { S, edits } = await loadSound(p.id);
      if (!S.base.songs[id]) fail(`no song "${id}" — have: ${Object.keys(S.base.songs).join(', ') || 'none'}`);
      printSong(S, id, { sectionOnly: typeof opt.section === 'string' ? opt.section : null, aiOnly: !!opt.ai, edits });
      const ch = songChanges(S.base.songs[id], S.songs[id]);
      if (ch.length && !opt.ai) out(`\nWhat the user changed: ${ch.map(describeChange).join(' · ')}`);
      const c = S.song(id);
      if (c.warnings.length) out(`\nWARNINGS: ${c.warnings.join(' · ')}`);
      out(`\nNotation: notes C4 F#3 Bb2 · chords C4+E4+G4 · '.' rest · '-' hold · '|' bar · drum letters · ! accent · _ soft (docs/contracts/SOUND.md)`);
    },
  },

  'render-song': {
    usage: 'render-song <game> <songId> --out <file.wav> [--seconds N] [--ai] [--rate 44100]',
    help: 'render a song (with the user\'s edits; --ai: without) to a WAV and print its\nlength, peak and loudness — how to check a song without listening',
    async run({ pos, opt }) {
      const p = await gameArg(pos[0]);
      const id = D.assertId('asset', pos[1] || '');
      const { S } = await loadSound(p.id);
      const song = opt.ai ? S.base.songs[id] : S.songs[id];
      if (!song) fail(`no song "${id}" — have: ${Object.keys(S.base.songs).join(', ') || 'none'}`);
      const c = compileSong(song, opt.ai ? S.base.instruments : S.instruments, { id });
      for (const w of c.warnings) out(`WARN ${w}`);
      const seconds = opt.seconds != null && opt.seconds !== true ? Math.max(0.1, Math.min(600, Number(opt.seconds) || 0)) : null;
      const sampleRate = Math.max(8000, Math.min(96000, Number(opt.rate) || 44100));
      const t0 = Date.now();
      const r = renderSong(c, { seconds, sampleRate });
      const file = path.resolve(typeof opt.out === 'string' ? opt.out : path.join(D.ROOT, 'scratch', 'sound', `${p.id}-${id}.wav`));
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, encodeWav(r));
      const s = audioStats(r);
      out(`wrote ${rel(file)} — ${statsLine(s)} · ${sampleRate} Hz stereo 16-bit · rendered in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
      out(`one pass of the song: ${r2(songSeconds(c))} s${c.loop === false ? '' : ' (it loops)'}${opt.ai ? ' · your version, without the user\'s edits' : ''}`);
      if (s.nan || s.silent) process.exitCode = 1;
    },
  },

  'render-sfx': {
    usage: 'render-sfx <game> <sfxId> --out <file.wav>',
    help: 'render one sound effect (with the user\'s edits) to a WAV and print its numbers',
    async run({ pos, opt }) {
      const p = await gameArg(pos[0]);
      const id = D.assertId('asset', pos[1] || '');
      const { S } = await loadSound(p.id);
      const c = S.effect(id);
      if (!c) fail(`no sound effect "${id}" — have: ${Object.keys(S.base.sfx).join(', ') || 'none'}`);
      const r = renderSfx(c);
      const file = path.resolve(typeof opt.out === 'string' ? opt.out : path.join(D.ROOT, 'scratch', 'sound', `${p.id}-sfx-${id}.wav`));
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, encodeWav(r));
      out(`wrote ${rel(file)} — ${statsLine(audioStats(r))}`);
    },
  },

  'sound-lessons': {
    usage: 'sound-lessons <game> [--new] [--limit N]',
    help: 'what the user changed in the music, save by save, with their words\n(--new: only those not distilled yet; skill sound-learn)',
    async run({ pos, opt }) {
      const p = await gameArg(pos[0]);
      const sum = await D.soundLessonSummary(p.id);
      const ls = await D.readSoundLessons(p.id, { limit: Number(opt.limit) || 60, onlyNew: !!opt.new });
      out(`# Sound lessons for ${p.id} — ${ls.length} shown, ${sum.undistilled} not distilled yet · rules: games/${p.id}/design/sound.md + design/instruments.js`);
      for (const l of ls) {
        out(`\n## ${l.id} · ${l.kind} · ${l.song ? `song ${l.song}` : l.sfx ? `sfx ${l.sfx}` : ''} · ${ago(l.ts)}${l.design ? ` · sound design ${l.design}` : ''}`);
        if (l.note) out(`user's note: "${l.note}"`);
        for (const c of l.changes || []) {
          out(`- ${describeChange(c)}`);
          if (c.what === 'notes') { out(`    before: ${c.before}`); out(`    after:  ${c.after}`); }
          if (c.what === 'track-added') out(`    notes: ${c.notes}`);
        }
      }
      if (ls.length) out(`\nWhen done: node cli/yak.mjs sound-distilled ${p.id} --through ${ls[ls.length - 1].id} --summary "<what you learned>"`);
      else out('No sound lessons yet: they appear when the user saves a change in the Sound view.');
    },
  },

  'sound-distilled': {
    usage: 'sound-distilled <game> --through <lessonId> --summary "…"',
    help: 'record a distillation of sound lessons (after updating design/sound.md + instruments.js)',
    async run({ pos, opt }) {
      const p = await gameArg(pos[0]);
      if (!opt.through || !opt.summary) fail('usage: sound-distilled <game> --through <lessonId> --summary "…"');
      const e = await D.addSoundDistilled(p.id, { through: String(opt.through), summary: String(opt.summary), version: opt.version });
      out(`recorded a sound distillation through ${e.through}`);
    },
  },

  'sound-index': {
    usage: 'sound-index <game>',
    help: 'rebuild the sound edits index.js (after hand-repairing an edit file)',
    async run({ pos }) {
      const n = await D.rebuildSoundIndex((await gameArg(pos[0])).id);
      out(`rebuilt the sound edits index (${plural(n, 'edit file')})`);
    },
  },

  'analyse-audio': {
    usage: 'analyse-audio <file.wav>',
    help: 'a reference recording as numbers and notes: length, loudness, a tempo and key\nguess, its clearest tune (WAV here; the Sound view also reads MP3/OGG)',
    async run({ pos }) {
      const f = path.resolve(pos[0] || '');
      if (!pos[0] || !fs.existsSync(f)) fail('usage: analyse-audio <file.wav>');
      if (!/\.wav$/i.test(f)) fail('only WAV files here (Node has no MP3 decoder): attach the MP3 in the Sound view, which writes this analysis into the request, or convert it to WAV');
      const w = decodeWav(fs.readFileSync(f));
      const a = analyseAudio(toMono(w.channels), w.sampleRate);
      out(`# ${rel(f)} — ${w.channels.length} channel(s), ${w.sampleRate} Hz, ${w.bits}-bit`);
      for (const l of a.lines) out(`- ${l}`);
      out('These are guesses from the sound (no AI listened). A reference shapes the style of what you write; it is never shipped in the game.');
    },
  },
};
