// studio/ui/js/views/sound.js — the Sound view: see the music the AI wrote and change it. Every
// song of the active game shows as a tracker grid (rows = steps, columns = tracks, a little pitch
// mark per note so the tune's shape reads down the column) over a piano-roll strip of the whole
// song; sound effects show as their recipe layers with knobs. Play / stop / loop / solo / mute,
// edit notes and knobs, Save → a sound edit (laid over the AI's song in the game, never written
// into its code) + a sound lesson the AI learns from. Bring your own music in: a MIDI file, a
// hummed melody, or a reference recording for the AI (sound-dialogs.js).
//
// The game's code never runs here: a hidden frame on the game's own origin hands over the song
// data (sound-host.js) and the studio plays it with the engine (engine/sound/).
import { h, mount, btn, iconBtn, toast, confirmDialog, popMenu, copyText, isTyping, timeAgo, debounce, topModal } from '../ui.js';
import { icon } from '../icons.js';
import { openRequestDialog } from '../request-dialog.js';
import {
  compileSong, compileSfx, sfxSeconds, songSeconds, renderSfx, PARAMS, TRACK_KNOBS,
  tokenize, formatTokens, parseToken, transposeToken, tokenPitch, prefersFlats, trackKeys, stepsPerBar, midiToNote,
  applySoundEdits, makeSongEdit, makeSfxEdit, makeInstrumentEdits, songChanges, sfxChanges, instrumentChanges, describeChange, stableJson,
  createPlayer, TRACK_FIELDS,
} from '../../../../engine/sound/index.js';
import { openMidiImport, openHum, openReference } from '../sound-dialogs.js';

const TYPE_LABEL = { synth: 'synth', pluck: 'plucked string', fm: 'FM bell', drums: 'drum kit' };
const MAIN_KNOBS = ['level', 'echo', 'wave', 'cutoff', 'bright', 'sustain', 'ring', 'attack', 'release', 'vibrato', 'index', 'decay'];
const COLORS = ['#f4c443', '#3acbc9', '#da63c3', '#ff9d20', '#6c8ee0', '#31cb7b', '#e8705a', '#a46cf0'];
const clone = (o) => (o == null ? o : JSON.parse(JSON.stringify(o)));
const same = (a, b) => stableJson(a) === stableJson(b);
// Colours by track (its key), in the order the song first has them — the same track keeps its
// colour in every section, and no two tracks of a song share one (up to eight).
let colorMap = new Map();
function setColors(song) {
  colorMap = new Map();
  for (const sec of Object.values((song && song.sections) || {})) for (const k of trackKeys(sec.tracks || [])) if (!colorMap.has(k)) colorMap.set(k, COLORS[colorMap.size % COLORS.length]);
}
const colorOf = (key) => colorMap.get(key) || COLORS[(colorMap.size + String(key).length) % COLORS.length];
const tokWord = (t) => (t === '' || t == null ? '—' : t === '.' ? 'rest' : t === '-' ? 'hold' : t);
const r2 = (v) => Math.round(v * 100) / 100;
const ls = {
  get: (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

// The game's sound data, read in a hidden frame on the game's own origin (studio://sound-<id>).
let hostSeq = 0;
function loadSoundData(project, module, timeout = 20000) {
  return new Promise((resolve) => {
    const v = String(++hostSeq);
    const origin = `studio://sound-${project.id}`;
    const f = document.createElement('iframe');
    f.className = 'host-frame';
    f.setAttribute('aria-hidden', 'true');
    f.tabIndex = -1;
    const done = (res) => { removeEventListener('message', onMsg); clearTimeout(t); f.remove(); resolve(res); };
    const onMsg = (e) => {
      if (e.source !== f.contentWindow || e.origin !== origin || !e.data || e.data.type !== 'sound-data' || e.data.v !== v) return;
      done(e.data);
    };
    addEventListener('message', onMsg);
    const t = setTimeout(() => done({ ok: false, errors: [`${module} did not load within ${timeout / 1000} s`] }), timeout);
    f.src = `${origin}/studio/ui/sound-host.html?${new URLSearchParams({ module, v })}`;
    document.body.append(f);
  });
}

const lessonId = (target) => {
  const n = new Date(), p = (x) => String(x).padStart(2, '0');
  return `S-${n.getFullYear()}${p(n.getMonth() + 1)}${p(n.getDate())}-${p(n.getHours())}${p(n.getMinutes())}${p(n.getSeconds())}-${String(target).replace(/[^A-Za-z0-9_.-]/g, '_')}`.slice(0, 118);
};

export class SoundView {
  constructor(app) {
    this.app = app;
    this.el = h('section.view.sound');
    this.project = null;
    this.data = null; // { base: { songs, sfx, instruments }, errors }
    this.disk = { songs: {}, sfx: {}, instruments: null, invalid: [] };
    this.applied = null;
    this.sessions = new Map(); // 'song:id' | 'sfx:id' → session
    this.sel = null;
    this.inst = { saved: {}, work: {} }; // the game's instruments (every song)
    this.player = null;
    this.playing = false;
    this.loop = ls.get('ps.sound.loop', false);
    this.follow = true;
    this.muted = new Set();
    this.solo = new Set();
    this.showAI = false;
    this.posQ = [];
    this.pos = null;
    this.build();
    window.addEventListener('keydown', (e) => this.onKey(e));
    this.updatePlaying = debounce(() => { if (this.playing && this.player && this.sel && this.sel.kind === 'song') this.player.send({ t: 'update', song: this.compiled(), range: this.loopRange() }); }, 60);
    this.renderOverviewSoon = debounce(() => this.renderOverview(), 40);
  }

  // ================================================================ layout ===
  build() {
    this.list = h('div.snd-list', { role: 'listbox', 'aria-label': 'Songs and sound effects' });
    this.listHead = h('div.snd-list-head');
    this.browserFoot = h('div.browser-foot');
    this.browser = h('aside.browser.snd-browser', null, this.listHead, this.list, this.browserFoot);

    this.playBtn = btn('Play', () => this.togglePlay(), { kind: 'primary', ico: 'play', small: true, title: 'Play / stop (Space) — Enter plays from the selected row' });
    this.loopBtn = iconBtn('loop', 'Loop this section — or the bars you selected (L)', () => this.toggleLoop(), { active: this.loop });
    this.sections = h('div.seg.snd-sections');
    this.bpmInput = h('input.input.snd-bpm', { type: 'number', min: 20, max: 400, step: 1, title: 'Tempo (beats per minute)', onchange: (e) => this.setBpm(+e.target.value) });
    this.aiBtn = iconBtn('compare', "Show and play the AI's version (V)", () => this.toggleAI());
    this.addBtn = btn('Add music', (e) => this.addMenu(e.currentTarget), { ico: 'plus', small: true, title: 'Import a MIDI file, hum a melody, or attach a reference recording' });
    this.askBtn = btn('Ask AI', () => this.ask(), { kind: 'teal', ico: 'bot', small: true, title: 'Ask the AI about this song (the selected bars go with it)' });
    this.toolbar = h('div.toolbar.snd-toolbar', null, this.playBtn, this.loopBtn, h('span.sep'), this.sections, h('span.sep'),
      h('label.snd-tempo', null, icon('note'), this.bpmInput, h('span.dim', null, 'bpm')), this.aiBtn, h('div.grow'), this.addBtn, this.askBtn);
    this.overview = h('canvas.snd-overview', { title: 'The whole song: click a section to show it', onclick: (e) => this.overviewClick(e) });
    this.banner = h('div.snd-banner');
    this.stage = h('div.snd-stage', { tabIndex: 0 });
    this.center = h('section.center.snd-center', null, this.toolbar, h('div.snd-ov-wrap', null, this.overview), this.banner, this.stage);

    this.inspScroll = h('div.insp-scroll');
    this.noteInput = h('input.input', { placeholder: 'What did you change and why? (teaches the AI)', maxlength: 300, onkeydown: (e) => { if (e.key === 'Enter') this.save(); } });
    this.saveState = h('div');
    this.saveBtn = btn('Save', () => this.save(), { kind: 'primary', ico: 'save', title: 'Save (Ctrl+S) — the game plays it, live if it is running' });
    this.saveBtn.style.width = '100%';
    this.moreBtn = iconBtn('chevron', 'More: revert, copy', (e) => this.moreMenu(e.currentTarget));
    this.saveBar = h('div.save-bar', null, this.saveState, this.noteInput, h('div.row', null, h('div.grow', null, this.saveBtn), this.moreBtn));
    this.inspector = h('aside.inspector', null, this.inspScroll, this.saveBar);
    mount(this.el, this.browser, this.center, this.inspector);
    this.renderEmpty('Pick a game', 'Its songs and sound effects show here.');
    new ResizeObserver(() => this.renderOverviewSoon()).observe(this.center);
  }

  // ============================================================== project ===
  async setProject(project) {
    this.stop();
    this.project = project;
    this.sessions = new Map();
    this.sel = null;
    this.data = null;
    this.muted.clear(); this.solo.clear();
    this.renderEmpty('Loading sound…', `Reading ${project.name}'s songs`);
    mount(this.list, h('div.empty', null, h('p', null, 'Loading…')));
    this.listHead.replaceChildren();
    await this.load();
  }

  async load({ keepWork = false } = {}) {
    const p = this.project;
    if (!p) return;
    let info;
    try { info = await window.studio.sound.info(p.id); } catch (err) { this.renderError(err.message); return; }
    this.info = info;
    if (!info.hasModule) { this.data = null; this.renderNoSound(); return; }
    const res = await loadSoundData(p, info.module);
    if (!this.project || this.project.id !== p.id) return;
    if (!res.ok) { this.data = null; this.renderError((res.errors || []).join('\n\n')); return; }
    this.data = { base: res.base, errors: res.errors || [] };
    await this.reloadEdits({ keepWork });
    const want = ls.get(`ps.sound.sel.${p.id}`, null);
    const songs = Object.keys(this.data.base.songs || {}), fx = Object.keys(this.data.base.sfx || {});
    const pick = this.sel ? { kind: this.sel.kind, id: this.sel.id } : want && (want.kind === 'song' ? songs : fx).includes(want.id) ? want : songs.length ? { kind: 'song', id: songs[0] } : fx.length ? { kind: 'sfx', id: fx[0] } : null;
    if (pick && (pick.kind === 'song' ? this.data.base.songs[pick.id] : this.data.base.sfx[pick.id])) this.select(pick.kind, pick.id);
    else { this.sel = null; this.renderEmpty('No songs yet', `${info.module} has no songs or sound effects yet.`); }
    this.renderList();
    this.renderFoot();
  }

  // Read the user's edits from disk and lay them over the AI's data.
  async reloadEdits({ keepWork = true } = {}) {
    const pid = this.project.id;
    this.disk = await window.studio.sound.edits(pid).catch(() => ({ songs: {}, sfx: {}, instruments: null, invalid: [] }));
    const base = this.data.base;
    this.applied = applySoundEdits(base, { songs: this.disk.songs, sfx: this.disk.sfx, instruments: this.disk.instruments || {} });
    const instDirty = !same(this.inst.work, this.inst.saved) && this.inst.pid === pid;
    this.inst = { pid, saved: clone(this.applied.instruments), work: instDirty && keepWork ? this.inst.work : clone(this.applied.instruments) };
    for (const [key, s] of this.sessions) {
      const src = s.kind === 'song' ? this.applied.songs[s.id] : this.applied.sfx[s.id];
      if (!src) { this.sessions.delete(key); continue; }
      const dirty = !same(s.work, s.saved);
      s.base = s.kind === 'song' ? base.songs[s.id] : base.sfx[s.id];
      s.saved = clone(src);
      if (!dirty || !keepWork) s.work = clone(src);
    }
  }

  session(kind, id) {
    const key = `${kind}:${id}`;
    let s = this.sessions.get(key);
    if (!s) {
      const base = kind === 'song' ? this.data.base.songs[id] : this.data.base.sfx[id];
      const src = kind === 'song' ? this.applied.songs[id] : this.applied.sfx[id];
      s = { kind, id, base, saved: clone(src), work: clone(src), undo: [], redo: [] };
      if (kind === 'song') {
        const secs = Object.keys(src.sections || {});
        s.section = secs[0] || null;
        s.cursor = { track: 0, step: 0 };
        s.rows = null; // selected rows { from, to } (whole bars)
      }
      this.sessions.set(key, s);
    }
    return s;
  }

  select(kind, id) {
    if (this.playing) this.stop();
    this.sel = this.session(kind, id);
    this.showAI = false;
    ls.set(`ps.sound.sel.${this.project.id}`, { kind, id });
    this.render();
  }

  // Called by the app when files change on disk.
  async onFsChange(changes) {
    if (!this.project || !this.info) return;
    const pid = this.project.id;
    const editsDir = this.info.edits + '/';
    const files = changes.flatMap((c) => (c.files && c.files.length ? c.files : [c.file])).filter(Boolean);
    const mine = files.filter((f) => f.startsWith(`games/${pid}/`) || f.startsWith('engine/sound/'));
    if (!mine.length && !changes.some((c) => c.more && (c.project === pid || c.project === '*'))) return;
    const onlyEdits = mine.length && mine.every((f) => f.startsWith(editsDir));
    if (onlyEdits) {
      if (this._saving) return;
      await this.reloadEdits({ keepWork: true });
      this.render(); this.renderList();
      return;
    }
    const soundCode = mine.some((f) => /\.m?js$/.test(f) && (f.startsWith('engine/sound/') || f === this.info.module || f.startsWith(`games/${pid}/design/`) || f.startsWith(`games/${pid}/game/sound`)));
    if (!soundCode && this.data) return;
    const dirty = this.dirty();
    await this.load({ keepWork: true });
    this.app.logActivity?.(`Sound code changed → ${this.project.name}'s songs reloaded${dirty ? ' (your unsaved changes are kept)' : ''}`, 'studio');
    if (dirty) toast(`The AI changed ${this.project.name}'s sound. Your unsaved changes are kept on top.`, { kind: 'live', timeout: 6000 });
  }

  dirty() {
    if (!this.data) return false;
    if (!same(this.inst.work, this.inst.saved)) return true;
    for (const s of this.sessions.values()) if (!same(s.work, s.saved)) return true;
    return false;
  }

  sessionDirty(s) { return !!s && (!same(s.work, s.saved) || !same(this.inst.work, this.inst.saved)); }

  // instrument knobs the AI changed after the user set them: ['lead.cutoff', …]
  instDrift() { return this.applied ? this.applied.report.drift.filter((d) => d.startsWith('instrument ')).map((d) => d.slice(11)) : []; }

  // drift: the AI changed what the user edited (song keys like 'A/lead', 'tempo', 'recipe')
  driftOf(s) {
    if (!this.applied || !s) return [];
    const pre = `${s.kind === 'song' ? 'song' : 'sfx'} ${s.id}: `;
    return this.applied.report.drift.filter((d) => d.startsWith(pre)).map((d) => d.slice(pre.length));
  }

  // ================================================================ render ===
  renderEmpty(title, sub) {
    this.toolbar.classList.add('hidden');
    this.overview.parentElement.classList.add('hidden');
    this.banner.replaceChildren();
    mount(this.stage, h('div.empty', null, icon('sound'), h('h3', null, title), sub ? h('p', null, sub) : null));
    this.inspScroll.replaceChildren();
    this.renderSaveState();
  }

  renderNoSound() {
    const p = this.project;
    this.renderEmpty('No sound yet', `${p.name} has no ${this.info.module} yet. Ask the AI for music in the engine's notation (skill sound) — it appears here by itself.`);
    this.stage.querySelector('.empty').append(btn('Ask the AI for music', () => openRequestDialog(this.app, { scope: p.id, kind: 'audio', title: `Music and sound effects for ${p.name}`, body: 'Write a first song and a few sound effects (skill sound).' }), { kind: 'teal', ico: 'bot' }));
    this.list.replaceChildren();
    this.renderFoot();
  }

  renderError(err) {
    const p = this.project;
    this.renderEmpty(`${p.name}'s sound failed to load`, null);
    this.stage.querySelector('.empty').append(h('p', null, 'This usually means an AI edit broke a module. The studio keeps watching: once the code is fixed, the songs come back by themselves.'),
      h('div.err-box', { style: { textAlign: 'left', maxWidth: '760px', width: '100%' } }, err),
      h('div.row', null, btn('Retry', () => this.load(), { ico: 'refresh' }),
        btn('Ask the AI to fix it', () => openRequestDialog(this.app, { scope: p.id, kind: 'bug', title: 'Sound code fails to load in Pixel Yak', body: `Pixel Yak can't load the game's sound module:\n\n${String(err).slice(0, 2000)}` }), { kind: 'teal', ico: 'bot' })));
    this.list.replaceChildren();
  }

  renderList() {
    if (!this.data) return;
    const p = this.project, base = this.data.base;
    mount(this.listHead, h('div.snd-title', null, icon('sound'), h('b', null, 'Sound'), h('span.dim', null, p.name)),
      h('div.dim.snd-path', { title: 'The game\'s sound module (its songs and sound effects)' }, this.info.module));
    const reqs = this.app.requestsFor(p.id).filter((r) => (r.status === 'open' || r.status === 'in-progress') && r.target);
    const row = (kind, id, name, sub) => {
      const s = this.sessions.get(`${kind}:${id}`);
      const edited = kind === 'song' ? !!this.disk.songs[id] : !!this.disk.sfx[id];
      const drift = this.applied.report.drift.some((d) => d.startsWith(`${kind === 'song' ? 'song' : 'sfx'} ${id}:`));
      const open = reqs.filter((r) => (kind === 'song' ? r.target.song : r.target.sfx) === id).length;
      const on = this.sel && this.sel.kind === kind && this.sel.id === id;
      return h(`div.snd-item${on ? '.on' : ''}`, { role: 'option', 'aria-selected': on ? 'true' : 'false', tabIndex: 0, onclick: () => this.select(kind, id), onkeydown: (e) => { if (e.key === 'Enter') this.select(kind, id); } },
        h(`div.snd-ico.${kind}`, null, icon(kind === 'song' ? 'note' : 'sound')),
        h('div.meta', null, h('div.name', null, name), h('div.id', null, sub)),
        h('div.snd-flags', null,
          s && !same(s.work, s.saved) ? h('span.tag.fire', { title: 'Unsaved changes' }, 'unsaved') : null,
          drift ? h('span.tag.red', { title: 'The AI changed this after you edited it' }, 'AI changed') : null,
          edited ? h('span.tag.gold', { title: 'You edited this — the game plays your version' }, 'yours') : null,
          open ? h('span.badge.teal', { title: `${open} open request${open > 1 ? 's' : ''}` }, String(open)) : null));
    };
    const songs = Object.entries(base.songs || {});
    const fx = Object.entries(base.sfx || {});
    mount(this.list,
      h('div.asset-group', null, `Songs · ${songs.length}`),
      songs.map(([id, s]) => { const c = this.applied.songs[id]; const secs = Object.keys(c.sections || {}).length; return row('song', id, s.name || id, `${id} · ${c.bpm || 120} bpm · ${secs} section${secs === 1 ? '' : 's'}`); }),
      h('div.asset-group', null, `Sound effects · ${fx.length}`),
      fx.map(([id, f]) => row('sfx', id, f.name || id, `${id} · ${(f.layers || []).length} layer${(f.layers || []).length === 1 ? '' : 's'}`)),
      this.data.errors.length ? h('div.note-box.fire', { style: { margin: '8px', fontSize: '12px' } }, this.data.errors.slice(0, 4).join('\n')) : null);
  }

  async renderFoot() {
    if (!this.project) return;
    const pid = this.project.id;
    const sum = await window.studio.sound.summary(pid).catch(() => null);
    if (!sum || !this.project || this.project.id !== pid) { this.browserFoot.replaceChildren(); return; }
    mount(this.browserFoot, icon('lessons'), h('span.grow', null, `${sum.lessons} sound lesson${sum.lessons === 1 ? '' : 's'}${sum.undistilled ? ` · ${sum.undistilled} new` : ''}`),
      sum.undistilled ? btn('Teach the AI', () => this.app.copyPrompt(distillPrompt(this.project, sum.undistilled), 'Distill prompt'), { kind: 'orchid', small: true, title: 'Copy a prompt: the AI learns your sound edits into the game\'s sound design (skill sound-learn)' }) : null);
  }

  render() {
    const s = this.sel;
    if (!s || !this.data) return;
    this.toolbar.classList.remove('hidden');
    if (s.kind === 'song') { this.renderSongToolbar(); this.renderGrid(); this.overview.parentElement.classList.remove('hidden'); this.renderOverview(); }
    else { this.renderSfxToolbar(); this.renderSfx(); this.overview.parentElement.classList.add('hidden'); }
    this.renderInspector();
    this.renderSaveState();
  }

  renderSongToolbar() {
    const s = this.sel;
    this.toolbar.classList.remove('sfx-mode');
    const song = this.shown();
    this.bpmInput.disabled = this.showAI;
    this.bpmInput.value = song.bpm || 120;
    this.bpmInput.parentElement.classList.remove('hidden');
    this.sections.classList.remove('hidden');
    this.loopBtn.classList.remove('hidden');
    this.aiBtn.classList.remove('hidden');
    this.addBtn.classList.remove('hidden');
    this.aiBtn.classList.toggle('on', this.showAI);
    const order = (song.order && song.order.length ? song.order : Object.keys(song.sections));
    mount(this.sections, Object.keys(song.sections).map((k) => h(`button${k === s.section ? '.on' : ''}`, {
      type: 'button', title: `Section ${k} — plays ${order.filter((x) => x === k).length}× in the order ${order.join(' ')}`, onclick: () => this.setSection(k),
    }, k)));
    this.askBtn.title = 'Ask the AI about this song (the selected bars go with it)';
  }

  renderSfxToolbar() {
    this.toolbar.classList.add('sfx-mode');
    for (const el of [this.sections, this.loopBtn, this.aiBtn, this.addBtn]) el.classList.add('hidden');
    this.bpmInput.parentElement.classList.add('hidden');
    this.askBtn.title = 'Ask the AI about this sound effect';
  }

  // The song the grid shows: the user's working copy, or the AI's when comparing.
  shown() { return this.showAI ? this.sel.base : this.sel.work; }
  instShown() { return this.showAI ? this.data.base.instruments : this.inst.work; }
  compiled() { return compileSong(this.shown(), this.instShown(), { id: this.sel.id }); }

  // ------------------------------------------------------------------ grid ---
  renderGrid() {
    const s = this.sel, song = this.shown();
    setColors(song);
    const sec = song.sections[s.section];
    if (!sec) { mount(this.stage, h('div.empty', null, h('p', null, 'This section is empty.'))); return; }
    const c = this.compiled();
    const csec = c.sections[s.section];
    const tracks = sec.tracks;
    const keys = trackKeys(tracks);
    const bsec = s.base.sections[s.section] || { tracks: [] };
    const bkeys = trackKeys(bsec.tracks || []);
    const len = Math.max(csec.len, 1);
    const bar = stepsPerBar(song), spb = song.spb || 4;
    const drift = this.driftOf(s);
    this.banner.replaceChildren();
    if (this.showAI) this.banner.append(h('div.note-box.teal', null, icon('compare'), " The AI's version — what plays without your edits. Read only: press V (or the button) to go back to yours."));
    else if (drift.length) this.banner.append(h('div.note-box.fire', null, icon('warn'), ` The AI changed ${drift.join(', ')} after you edited it. Your notes still play on top — check they fit, then Save to keep them.`));
    if (s.cursor.track >= tracks.length) s.cursor.track = Math.max(0, tracks.length - 1);
    if (s.cursor.step >= len) s.cursor.step = len - 1;
    const cols = `56px repeat(${tracks.length}, minmax(96px, 1fr))`;
    // per track: tokens, the AI's tokens, pitch range for the contour marks
    const info = tracks.map((t, i) => {
      const toks = tokenize(t.notes);
      const bi = bkeys.indexOf(keys[i]);
      const ai = t.added ? null : bi >= 0 ? tokenize(bsec.tracks[bi].notes) : null;
      const drums = csec.tracks[i] && csec.tracks[i].type === 'drums';
      const ps = drums ? [] : toks.map(tokenPitch).filter((p) => p != null);
      return { t, key: keys[i], toks, ai, drums, lo: ps.length ? Math.min(...ps) : 60, hi: ps.length ? Math.max(...ps) : 72, color: colorOf(keys[i]), drift: drift.includes(`${s.section}/${keys[i]}`) };
    });
    const head = h('div.snd-row.snd-head', { style: { gridTemplateColumns: cols } }, h('div.snd-corner', null, 'bar'),
      info.map((x, i) => {
        const k = x.key;
        const ct = csec.tracks[i];
        return h(`div.snd-th${i === s.cursor.track ? '.on' : ''}`, { style: `--c: ${x.color}`, onclick: () => { s.cursor.track = i; this.renderGrid(); this.renderInspector(); } },
          h('div.snd-th-top', null, h('i.dot'), h('b', null, x.t.name && x.t.name !== k ? x.t.name : k),
            x.t.added ? h('span.tag.teal', { title: `You added this track (${x.t.added})` }, x.t.added) : null,
            x.drift ? h('span.tag.red', { title: 'The AI changed this track after you edited it' }, '!') : null,
            x.t.mute ? h('span.tag', { title: 'Silent in the game (your edit)' }, 'off') : null),
          h('div.snd-th-sub', null, h('span.dim', null, `${x.t.inst !== k ? `${x.t.inst} · ` : ''}${ct ? TYPE_LABEL[ct.type] || ct.type : ''}`),
            h('span.grow'),
            h(`button.snd-ms${this.muted.has(k) ? '.on' : ''}`, { type: 'button', title: 'Mute while listening (not saved)', onclick: (e) => { e.stopPropagation(); this.toggleSet(this.muted, k); } }, 'M'),
            h(`button.snd-ms.solo${this.solo.has(k) ? '.on' : ''}`, { type: 'button', title: 'Solo while listening (not saved)', onclick: (e) => { e.stopPropagation(); this.toggleSet(this.solo, k); } }, 'S')));
      }));
    const rows = [];
    for (let st = 0; st < len; st++) {
      const beat = Math.floor(st / spb), inBar = st % bar;
      const barNo = Math.floor(st / bar) + 1;
      const selRow = s.rows && st >= s.rows.from && st < s.rows.to;
      const row = h(`div.snd-row${inBar === 0 ? '.bar' : st % spb === 0 ? '.beat' : ''}${selRow ? '.sel' : ''}`, { style: { gridTemplateColumns: cols }, dataset: { step: st } },
        h('div.snd-num', { title: 'Click: select this bar (Shift: more bars) — loops and Ask AI use it', onclick: (e) => this.selectBar(barNo - 1, e.shiftKey) }, inBar === 0 ? h('b', null, String(barNo)) : st % spb === 0 ? `${barNo}.${(beat % (bar / spb)) + 1}` : ''));
      info.forEach((x, ti) => row.append(this.cell(x, ti, st)));
      rows.push(row);
    }
    const grid = h('div.snd-grid', { role: 'grid', 'aria-label': `Section ${s.section}` }, head, rows);
    const scroll = this.stage.scrollTop;
    mount(this.stage, grid);
    this.stage.scrollTop = scroll;
    this.rowEls = rows;
    this.lastPlayRow = null;
    this.showPlayhead();
  }

  cell(x, ti, st) {
    const s = this.sel;
    const tok = x.toks[st];
    const cur = s.cursor.track === ti && s.cursor.step === st;
    const user = !this.showAI && !!x.ai && (x.ai[st] ?? '') !== (tok ?? ''); // added tracks say so in their header
    const cls = ['snd-cell'];
    let mark = null, label = '';
    if (tok == null) { cls.push('out'); label = ''; }
    else {
      const p = parseToken(tok, x.drums);
      if (p.kind === 'rest') { cls.push('rest'); label = '·'; }
      else if (p.kind === 'tie') {
        cls.push('tie');
        const prev = this.prevPitch(x.toks, st);
        mark = h('i.tie-mark', { style: { left: `${this.markX(prev, x)}%` } });
      } else if (p.kind === 'note') {
        cls.push('note');
        label = p.midi.length > 1 ? `${midiToNote(p.midi[p.midi.length - 1], /b/.test(tok))}+${p.midi.length - 1}` : tok.replace(/[!_]$/, '');
        mark = h('i.mark', { style: { left: `${this.markX(Math.max(...p.midi), x)}%` } });
        if (p.mark === '!') cls.push('acc'); else if (p.mark === '_') cls.push('ghost');
      } else if (p.kind === 'drum') { cls.push('drum'); label = p.hits.join('+'); if (p.mark === '!') cls.push('acc'); else if (p.mark === '_') cls.push('ghost'); }
      else { cls.push('bad'); label = tok; }
    }
    if (user) cls.push('user');
    if (cur) cls.push('cur');
    return h(`div.${cls.join('.')}`, {
      style: `--c: ${x.color}`, title: tok ? `${tokWord(tok)}${user && x.ai ? `  (the AI wrote: ${tokWord(x.ai[st])})` : ''}` : 'past the end of this track',
      onmousedown: (e) => { e.preventDefault(); this.stage.focus(); this.setCursor(ti, st); },
      ondblclick: () => this.op('note'),
      onwheel: (e) => { if (!e.altKey) return; e.preventDefault(); this.setCursor(ti, st, false); this.op(e.deltaY < 0 ? 'up' : 'down'); },
    }, mark, h('span', null, label));
  }

  markX(p, x) { if (p == null) return 50; const span = Math.max(1, x.hi - x.lo); return 6 + ((p - x.lo) / span) * 80; }
  prevPitch(toks, st) { for (let i = st - 1; i >= 0; i--) { const p = tokenPitch(toks[i]); if (p != null) return p; if (toks[i] !== '-') return null; } return null; }

  // ------------------------------------------------------------- overview ---
  renderOverview() {
    const s = this.sel;
    const cv = this.overview;
    if (!s || s.kind !== 'song' || !cv.isConnected) return;
    const wrap = cv.parentElement;
    const W = Math.max(200, Math.floor(wrap.clientWidth) - 20), H = 64; // the wrap's padding
    const dpr = Math.max(1, Math.round(window.devicePixelRatio || 1));
    if (cv.width !== W * dpr || cv.height !== H * dpr) { cv.width = W * dpr; cv.height = H * dpr; cv.style.width = `${W}px`; cv.style.height = `${H}px`; }
    const g = cv.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.imageSmoothingEnabled = false;
    g.fillStyle = '#080913'; g.fillRect(0, 0, W, H);
    const c = this.compiled();
    const total = c.order.reduce((n, k) => n + (c.sections[k] ? c.sections[k].len : 0), 0) || 1;
    const px = W / total;
    let lo = 127, hi = 0;
    for (const k of new Set(c.order)) for (const t of c.sections[k].tracks) if (t.type !== 'drums') for (const e of t.events) for (const m of e.midi) { lo = Math.min(lo, m); hi = Math.max(hi, m); }
    if (lo > hi) { lo = 48; hi = 84; }
    const top = 4, band = H - 16, span = Math.max(12, hi - lo + 1);
    const y = (m) => Math.round(top + (1 - (m - lo + 0.5) / span) * band);
    let x0 = 0;
    this.ovSections = [];
    c.order.forEach((k, oi) => {
      const sec = c.sections[k];
      const w = sec.len * px;
      if (k === s.section) { g.fillStyle = '#13162a'; g.fillRect(Math.round(x0), 0, Math.round(w), H); }
      g.fillStyle = '#2f3662'; g.fillRect(Math.round(x0), 0, 1, H);
      g.fillStyle = k === s.section ? '#f4c443' : '#6d739a';
      g.font = '10px Segoe UI, sans-serif';
      g.fillText(k, Math.round(x0) + 3, H - 3);
      for (const t of sec.tracks) {
        if (this.muted.has(t.key) || (this.solo.size && !this.solo.has(t.key))) g.globalAlpha = 0.25;
        g.fillStyle = colorOf(t.key);
        for (const e of t.events) {
          const ex = Math.round(x0 + e.step * px);
          if (t.type === 'drums') { g.fillRect(ex, H - 9, Math.max(1, Math.round(px)), 2); continue; }
          const ew = Math.max(1, Math.round((e.len || 1) * px) - 1);
          for (const m of e.midi) g.fillRect(ex, y(m), ew, 2);
        }
        g.globalAlpha = 1;
      }
      this.ovSections.push({ k, oi, x: x0, w });
      x0 += w;
    });
    this.ovPx = px;
    this.drawOvPlayhead();
  }

  drawOvPlayhead() {
    const pos = this.pos;
    const el = this.ovHead || (this.ovHead = h('i.snd-ov-head'));
    if (!pos || !this.playing || !this.ovSections) { el.remove(); return; }
    const sec = this.ovSections.find((x) => x.oi === pos.order);
    if (!sec) { el.remove(); return; }
    if (!el.isConnected) this.overview.parentElement.append(el);
    el.style.left = `${Math.round(sec.x + pos.step * this.ovPx)}px`;
  }

  overviewClick(e) {
    if (!this.ovSections) return;
    const r = this.overview.getBoundingClientRect();
    const x = e.clientX - r.left;
    const hit = this.ovSections.find((s) => x >= s.x && x < s.x + s.w);
    if (!hit) return;
    this.sel.cursor.step = Math.max(0, Math.floor((x - hit.x) / this.ovPx));
    this.setSection(hit.k);
  }

  // ------------------------------------------------------------- sfx view ---
  renderSfx() {
    const s = this.sel;
    const fx = this.showAI ? s.base : s.work;
    const c = compileSfx(fx, this.inst.work);
    this.banner.replaceChildren();
    const drift = this.driftOf(s);
    if (drift.length) this.banner.append(h('div.note-box.fire', null, icon('warn'), ' The AI changed this sound effect after you edited it. Your values still apply on top — check it, then Save to keep them.'));
    const wave = h('canvas.snd-wave');
    const layers = (fx.layers || []).map((L, i) => this.layerCard(L, i, s));
    mount(this.stage, h('div.snd-sfx', null,
      h('div.snd-sfx-head', null, h('div', null, h('h2', null, s.base.name || s.id), h('div.dim', null, `${s.id} · ${(fx.layers || []).length} layer${(fx.layers || []).length === 1 ? '' : 's'} · ${r2(sfxSeconds(c))} s`)),
        h('div.grow'), btn('Play', () => this.playSfx(), { kind: 'primary', ico: 'play', title: 'Play (Space)' })),
      h('div.snd-wave-wrap', null, wave),
      this.knob({ ...PARAMS.piece.vol, label: 'Volume (the whole effect)' }, fx.vol ?? 1, s.base.vol ?? 1, (v) => { s.work.vol = v; }, () => this.afterSfxKnob()),
      h('div.snd-layers', null, layers)));
    requestAnimationFrame(() => this.drawWave(wave, c));
  }

  layerCard(L, i, s) {
    const B = (s.base.layers || [])[i] || {};
    const kind = L.note != null ? 'note' : L.drum != null ? 'drum' : L.noise != null ? 'noise' : 'tone';
    const title = kind === 'note' ? `Note${Array.isArray(L.note) ? 's' : ''} · ${L.inst || 'bell'} · ${[].concat(L.note).join(' ')}` : kind === 'drum' ? `Drum ${L.drum} · ${L.inst || 'drums'}` : kind === 'noise' ? `Noise · ${L.noise}` : `Tone · ${L.tone || 'sine'}`;
    const specs = kind === 'note' ? { len: { ...PARAMS.hit.len, label: 'Length (s)' }, vel: { ...PARAMS.hit.vol, label: 'Velocity' }, every: { ...PARAMS.hit.at, label: 'Between notes (s)' }, at: PARAMS.hit.at }
      : kind === 'drum' ? { vel: { ...PARAMS.hit.vol, label: 'Velocity' }, at: PARAMS.hit.at }
        : { from: PARAMS.hit.from, to: PARAMS.hit.to, len: PARAMS.hit.len, vol: PARAMS.hit.vol, attack: PARAMS.hit.attack, q: PARAMS.hit.q, ...(kind === 'tone' ? { lp: PARAMS.hit.lp } : {}), at: PARAMS.hit.at };
    const defs = { vel: 0.5, every: 0, at: 0, len: 0.15 };
    return h('div.snd-layer', null, h('div.snd-layer-head', null, h('b', null, `${i + 1}`), h('span', null, title)),
      Object.entries(specs).map(([k, spec]) => this.knob(spec, L[k] ?? (k === 'to' ? L.from : defs[k] ?? spec.def), B[k] ?? (k === 'to' ? B.from : defs[k] ?? spec.def), (v) => { s.work.layers[i][k] = v; }, () => this.afterSfxKnob())));
  }

  afterSfxKnob() {
    this.renderSaveState(); this.renderList();
    const wave = this.stage.querySelector('.snd-wave');
    if (wave) this.drawWave(wave, compileSfx(this.sel.work, this.inst.work));
    this.playSfx();
  }

  drawWave(cv, c) {
    const wrap = cv.parentElement;
    if (!wrap) return;
    const W = Math.max(200, wrap.clientWidth), H = 96;
    cv.width = W; cv.height = H;
    const g = cv.getContext('2d');
    g.fillStyle = '#080913'; g.fillRect(0, 0, W, H);
    const r = renderSfx(c, { sampleRate: 22050 });
    const n = r.left.length, per = Math.max(1, Math.floor(n / W));
    g.fillStyle = '#3acbc9';
    for (let x = 0; x < W; x++) {
      let mx = 0;
      for (let i = x * per; i < Math.min(n, (x + 1) * per); i++) mx = Math.max(mx, Math.abs(r.left[i]));
      const hh = Math.max(1, Math.round(mx * (H - 8)));
      g.fillRect(x, Math.round((H - hh) / 2), 1, hh);
    }
    g.fillStyle = '#6d739a'; g.font = '10px Segoe UI, sans-serif';
    g.fillText(`${r2(n / 22050)} s`, 6, 12);
  }

  // ------------------------------------------------------------- inspector ---
  renderInspector() {
    const s = this.sel;
    if (!s || !this.data) { this.inspScroll.replaceChildren(); return; }
    if (s.kind === 'sfx') {
      mount(this.inspScroll, this.secSfxInfo(s), this.secRequests(s));
      return;
    }
    mount(this.inspScroll, this.secCell(s), this.secTrack(s), this.secInstrument(s), this.secSong(s), this.secRequests(s));
  }

  curTrack() {
    const s = this.sel;
    const sec = this.shown().sections[s.section];
    return sec && sec.tracks[s.cursor.track] ? { t: sec.tracks[s.cursor.track], key: trackKeys(sec.tracks)[s.cursor.track] } : null;
  }

  secCell(s) {
    const ct = this.curTrack();
    if (!ct) return null;
    const song = this.shown();
    const bar = stepsPerBar(song), spb = song.spb || 4;
    const toks = tokenize(ct.t.notes);
    const tok = toks[s.cursor.step] ?? '';
    const bsec = s.base.sections[s.section] || { tracks: [] };
    const bi = trackKeys(bsec.tracks || []).indexOf(ct.key);
    const ai = ct.t.added || bi < 0 ? null : tokenize(bsec.tracks[bi].notes)[s.cursor.step] ?? '';
    const ro = this.showAI;
    const b = (ico, label, title, op) => btn(label, () => this.op(op), { ico, small: true, title, disabled: ro });
    return h('div.insp-sec', null, h('div.section-title', null, 'Note', h('div.grow')),
      h('div.snd-cellinfo', null, h('div.snd-tok', { style: `--c: ${colorOf(ct.key)}` }, tokWord(tok)),
        h('div.dim', null, `${s.section} · ${ct.key} · bar ${Math.floor(s.cursor.step / bar) + 1}, beat ${Math.floor((s.cursor.step % bar) / spb) + 1}, step ${(s.cursor.step % spb) + 1}`)),
      h('div.snd-ops', null, b('up', 'Up', 'One semitone higher (Shift+↑)', 'up'), b('down', 'Down', 'One semitone lower (Shift+↓)', 'down'),
        b('up', '+ Oct', 'An octave higher (Ctrl+Shift+↑)', 'oct-up'), b('down', '− Oct', 'An octave lower (Ctrl+Shift+↓)', 'oct-down'),
        b('stop', 'Rest', 'Silence here (. or Delete)', 'rest'), b('hold', 'Hold', 'The note before rings on (-)', 'tie'),
        b('plus', 'Accent', 'Louder (!)', 'accent'), b('play', 'Hear', 'Play this note', 'hear')),
      ai != null && ai !== tok && !ro ? h('div.row', null, h('span.dim', { style: { fontSize: '12px' } }, `The AI wrote: ${tokWord(ai)}`), h('div.grow'), btn("Use the AI's", () => this.op('ai'), { small: true, ico: 'revert' })) : null,
      h('div.dim.snd-keys', null, 'Keys: arrows move · Shift+↑↓ pitch · A–G note · . rest · - hold · ! accent · Space play · Ctrl+Z undo'));
  }

  secTrack(s) {
    const ct = this.curTrack();
    if (!ct) return null;
    const t = ct.t;
    const bsec = s.base.sections[s.section] || { tracks: [] };
    const bi = trackKeys(bsec.tracks || []).indexOf(ct.key);
    const bt = t.added || bi < 0 ? t : bsec.tracks[bi]; // a track the user added has no AI values to go back to
    const ro = this.showAI;
    const set = (k) => (v) => { this.pushUndo(); t[k] = v; };
    const commit = () => this.afterEdit({ grid: false });
    const overrides = Object.keys(t).filter((k) => !TRACK_FIELDS.has(k) && k !== 'spb');
    const inst = this.inst.work[t.inst];
    const type = inst ? inst.type || 'synth' : 'synth';
    const drift = this.driftOf(s).includes(`${s.section}/${ct.key}`);
    return h('div.insp-sec', null, h('div.section-title', null, h('i.snd-dot', { style: { background: colorOf(ct.key) } }), `Track · ${s.section}/${ct.key}`, h('div.grow')),
      h('div.dim', { style: { fontSize: '12px', marginTop: '-4px' } }, 'This song only.'),
      drift ? h('div.note-box.fire', { style: { fontSize: '12px' } }, 'The AI changed this track after you edited it. Your notes still play on top — check they fit, then Save to keep them.') : null,
      t.added ? h('div.note-box.teal', { style: { fontSize: '12px' } }, `You added this track (${t.added}). `, btn('Remove it', () => this.removeTrack(), { small: true, ico: 'trash', disabled: ro })) : null,
      ro ? null : [
        this.knob(TRACK_KNOBS.vol, t.vol ?? 0.6, bt.vol ?? 0.6, set('vol'), commit),
        this.knob(TRACK_KNOBS.pan, t.pan ?? inst?.pan ?? 0, bt.pan ?? inst?.pan ?? 0, set('pan'), commit),
        this.knob(TRACK_KNOBS.echo, t.echo ?? inst?.echo ?? 0.2, bt.echo ?? inst?.echo ?? 0.2, set('echo'), commit),
        overrides.map((k) => { const spec = (PARAMS[type] || {})[k] || PARAMS.common[k]; return spec ? this.knob({ ...spec, label: `${spec.label} (this track)` }, t[k], bt[k], set(k), commit) : null; }),
        h('label.check', { title: 'The game leaves this track out (saved with the song)' }, h('input', { type: 'checkbox', checked: !!t.mute, onchange: (e) => { this.pushUndo(); t.mute = e.target.checked || undefined; this.afterEdit(); } }), 'Silent in the game'),
      ]);
  }

  secInstrument(s) {
    const ct = this.curTrack();
    if (!ct || this.showAI) return null;
    const id = ct.t.inst;
    const inst = this.inst.work[id];
    const base = this.data.base.instruments[id];
    if (!inst || !base) return h('div.insp-sec', null, h('div.section-title', null, `Instrument · ${id}`), h('div.note-box.fire', null, `There is no instrument "${id}" in the game's instruments — it plays a plain tone. Ask the AI to add it.`));
    const type = inst.type || 'synth';
    const commit = () => this.afterEdit({ grid: false, inst: true });
    const setP = (k) => (v) => { this.pushUndo(); inst[k] = v; };
    const specs = { ...PARAMS.common, ...(PARAMS[type] || {}) };
    let body;
    if (type === 'drums') {
      const kit = Object.keys(base.kit || {}).filter((k) => /^[A-Za-z]$/.test(k));
      body = [this.knob(specs.level, inst.level ?? 1, base.level ?? 1, setP('level'), commit), this.knob(specs.echo, inst.echo ?? 0.2, base.echo ?? 0.2, setP('echo'), commit),
        kit.map((L) => h('div.snd-piece', null, h('div.snd-piece-head', null, h('b', null, L), btn('Hear', () => this.preview({ hits: [L] }), { small: true, ico: 'play' })),
          ['vol', 'tune', 'decay'].map((k) => this.knob(PARAMS.piece[k], inst[`${L}.${k}`] ?? 1, base[`${L}.${k}`] ?? 1, setP(`${L}.${k}`), commit))))];
    } else {
      // the knobs the AI set and the main ones first; the rest behind "All knobs"
      const main = Object.keys(specs).filter((k) => k in base || MAIN_KNOBS.includes(k) || k in inst);
      const rest = Object.keys(specs).filter((k) => !main.includes(k));
      const all = this.allKnobs;
      body = [main.map((k) => this.knob(specs[k], inst[k] ?? specs[k].def, base[k] ?? specs[k].def, setP(k), commit)),
        rest.length ? h('button.btn.ghost.sm.snd-more', { type: 'button', onclick: () => { this.allKnobs = !all; this.renderInspector(); } }, icon(all ? 'up' : 'down'), h('span', null, all ? 'Fewer knobs' : `All knobs (${rest.length} more)`)) : null,
        all ? rest.map((k) => this.knob(specs[k], inst[k] ?? specs[k].def, base[k] ?? specs[k].def, setP(k), commit)) : null];
    }
    const shared = this.usersOf(id);
    const drift = this.instDrift().filter((d) => d.startsWith(`${id}.`)).map((d) => d.slice(id.length + 1));
    return h('div.insp-sec', null, h('div.section-title', null, `Instrument · ${id} (${type})`, h('div.grow'), btn('Hear', () => this.preview({}), { small: true, ico: 'play', title: 'Play a note with this instrument' })),
      h('div.dim', { style: { fontSize: '12px', marginTop: '-4px' } }, shared > 1 ? `Every song: ${shared} songs use it.` : 'Every song that uses it.'),
      drift.length ? h('div.note-box.fire', { style: { fontSize: '12px' } }, `The AI changed ${drift.join(', ')} after you set ${drift.length > 1 ? 'them' : 'it'}. Your value${drift.length > 1 ? 's' : ''} still apply — Save to keep ${drift.length > 1 ? 'them' : 'it'}, or press ↺ to take the AI's.`) : null,
      h('div.snd-knobs', null, body));
  }

  usersOf(inst) { return Object.values(this.applied.songs).filter((s) => Object.values(s.sections || {}).some((sec) => (sec.tracks || []).some((t) => t.inst === inst))).length; }

  secSong(s) {
    const song = this.shown();
    const c = this.compiled();
    const order = c.order;
    const changes = this.showAI ? [] : songChanges(s.base, s.work);
    return h('div.insp-sec', null, h('div.section-title', null, `Song · ${s.id}`, h('div.grow')),
      h('dl.kv', null,
        h('dt', null, 'Name'), h('dd', null, song.name || s.id),
        h('dt', null, 'Tempo'), h('dd', null, `${c.bpm} bpm · ${c.spb} steps a beat`),
        h('dt', null, 'Plays'), h('dd', null, `${order.join(' → ')}${c.loop === false ? ' (once)' : ' (loops)'}`),
        h('dt', null, 'Length'), h('dd', null, `${r2(songSeconds(c))} s a pass`)),
      c.warnings.length ? h('div.note-box.fire', { style: { fontSize: '12px' } }, c.warnings.join('\n')) : null,
      changes.length ? h('div.snd-changes', null, h('div.dim', null, 'Yours vs the AI:'), changes.slice(0, 8).map((x) => h('div', null, '• ', describeChange(x))), changes.length > 8 ? h('div.dim', null, `… ${changes.length - 8} more`) : null) : null);
  }

  secSfxInfo(s) {
    const changes = sfxChanges(s.base, s.work);
    return h('div.insp-sec', null, h('div.section-title', null, `Sound effect · ${s.id}`, h('div.grow')),
      h('p.dim', { style: { margin: 0, fontSize: '12px' } }, 'Turn a knob and it plays. Save keeps your values on top of the AI\'s recipe — the game uses them.'),
      changes.length ? h('div.snd-changes', null, h('div.dim', null, 'Yours vs the AI:'), changes.map((x) => h('div', null, '• ', describeChange(x)))) : h('div.dim', { style: { fontSize: '12px' } }, 'Same as the AI wrote it.'));
  }

  secRequests(s) {
    const rs = this.app.requestsFor(this.project.id).filter((r) => r.target && (s.kind === 'song' ? r.target.song : r.target.sfx) === s.id);
    if (!rs.length) return null;
    return h('div.insp-sec', null, h('div.section-title', null, `Requests · ${rs.length}`, h('div.grow')),
      h('div.req-mini', null, rs.slice(0, 6).map((r) => h('div.rq', { onclick: () => this.app.openRequest(r) }, h('span.tag', null, r.status), h('span.t', null, r.title), h('span.dim', null, timeAgo(r.createdAt))))));
  }

  // A labelled slider + value; log sliders for frequencies. onInput while dragging, onCommit at release.
  knob(spec, value, ai, onInput, onCommit) {
    const ro = this.showAI;
    const reset = h('button.icon-btn.snd-reset', { type: 'button', title: `Back to the AI's value (${fmt(ai)})`, onclick: () => { onInput(ai); onCommit(); this.renderInspector(); if (this.sel.kind === 'sfx') this.renderSfx(); } }, icon('revert'));
    const changed = () => !same(value, ai);
    if (spec.options) {
      const sel = h('select.input', { disabled: ro, onchange: (e) => { value = e.target.value; onInput(value); onCommit(); this.renderInspector(); } }, spec.options.map((o) => h('option', { value: o, selected: o === value }, o)));
      return h(`div.snd-knob${changed() ? '.changed' : ''}`, null, h('span.lbl', { title: spec.hint || '' }, spec.label), sel, changed() ? reset : h('span.snd-reset-ph'));
    }
    const lg = spec.log && spec.min > 0;
    const toPos = (v) => (lg ? Math.round((Math.log(v / spec.min) / Math.log(spec.max / spec.min)) * 1000) : v);
    const fromPos = (p) => (lg ? roundTo(spec.min * Math.pow(spec.max / spec.min, p / 1000), spec.step) : +p);
    const out = h('span.val', null, fmt(value));
    const range = h('input', {
      type: 'range', disabled: ro, min: lg ? 0 : spec.min, max: lg ? 1000 : spec.max, step: lg ? 1 : spec.step, value: toPos(value),
      oninput: (e) => { value = fromPos(e.target.value); out.textContent = fmt(value); onInput(value); this.liveUpdate(); },
      onchange: () => { onCommit(); this.renderSaveState(); this.renderInspectorSoon(); },
    });
    return h(`div.snd-knob${changed() ? '.changed' : ''}`, { title: spec.hint || `AI: ${fmt(ai)}` }, h('span.lbl', null, spec.label), range, out, changed() ? reset : h('span.snd-reset-ph'));
  }

  renderInspectorSoon() { clearTimeout(this._inspT); this._inspT = setTimeout(() => { if (!document.activeElement || document.activeElement.type !== 'range') this.renderInspector(); }, 250); }

  // ================================================================ edits ===
  setCursor(track, step, render = true) {
    const s = this.sel;
    const changedTrack = s.cursor.track !== track;
    s.cursor = { track, step };
    if (!render) return;
    this.renderGridCursor();
    if (changedTrack) this.renderInspector(); else { const c = this.inspScroll.firstChild; if (c) c.replaceWith(this.secCell(s) || h('div')); }
  }

  renderGridCursor() {
    const s = this.sel;
    this.stage.querySelectorAll('.snd-cell.cur').forEach((e) => e.classList.remove('cur'));
    this.stage.querySelectorAll('.snd-th.on').forEach((e) => e.classList.remove('on'));
    const row = this.rowEls && this.rowEls[s.cursor.step];
    const cell = row && row.children[s.cursor.track + 1];
    if (cell) { cell.classList.add('cur'); cell.scrollIntoView({ block: 'nearest' }); }
    const th = this.stage.querySelector('.snd-head') && this.stage.querySelector('.snd-head').children[s.cursor.track + 1];
    if (th) th.classList.add('on');
  }

  pushUndo() {
    const s = this.sel;
    if (!s) return;
    s.undo.push(JSON.stringify({ w: s.work, i: this.inst.work }));
    if (s.undo.length > 200) s.undo.shift();
    s.redo.length = 0;
  }
  undoRedo(back) {
    const s = this.sel;
    if (!s) return;
    const from = back ? s.undo : s.redo, to = back ? s.redo : s.undo;
    if (!from.length) return;
    to.push(JSON.stringify({ w: s.work, i: this.inst.work }));
    const st = JSON.parse(from.pop());
    s.work = st.w; this.inst.work = st.i;
    this.afterEdit({ inst: true });
  }

  afterEdit({ grid = true, inst = false } = {}) {
    if (!this.sel) return;
    if (this.sel.kind === 'song') {
      if (grid) this.renderGrid();
      this.renderOverviewSoon();
      this.bpmInput.value = this.shown().bpm || 120;
    } else this.renderSfx();
    this.renderInspector();
    this.renderSaveState();
    this.renderList();
    this.updatePlaying();
    if (inst) this.updatePlaying();
  }

  liveUpdate() { this.updatePlaying(); }

  // One edit on the note under the cursor.
  op(kind, arg) {
    const s = this.sel;
    if (!s || s.kind !== 'song' || this.showAI) return;
    const sec = s.work.sections[s.section];
    const t = sec && sec.tracks[s.cursor.track];
    if (!t) return;
    const c = compileSong(s.work, this.inst.work);
    const ct = c.sections[s.section].tracks[s.cursor.track];
    const drums = ct && ct.type === 'drums';
    const toks = tokenize(t.notes);
    const st = s.cursor.step;
    while (toks.length <= st) toks.push('.');
    const tok = toks[st];
    const flats = prefersFlats(toks);
    const bsec = s.base.sections[s.section] || { tracks: [] };
    let next = tok;
    const prevNote = () => { for (let i = st - 1; i >= 0; i--) if (toks[i] !== '-' && toks[i] !== '.') return toks[i].replace(/[!_]$/, ''); for (let i = st + 1; i < toks.length; i++) if (toks[i] !== '-' && toks[i] !== '.') return toks[i].replace(/[!_]$/, ''); return null; };
    const kit = drums ? Object.keys(ct.kit || {}) : [];
    switch (kind) {
      case 'hear': this.preview({}); return;
      case 'up': case 'down': case 'oct-up': case 'oct-down': {
        const n = kind === 'up' ? 1 : kind === 'down' ? -1 : kind === 'oct-up' ? 12 : -12;
        if (drums) {
          if (!kit.length) return;
          const cur = parseToken(tok, true);
          const i = cur.kind === 'drum' ? kit.indexOf(cur.hits[0]) : -1;
          next = kit[(((i < 0 ? 0 : i + Math.sign(n)) % kit.length) + kit.length) % kit.length];
        } else if (tokenPitch(tok) != null) next = transposeToken(tok, n, flats);
        else next = prevNote() || (this.inst.work[t.inst] && this.inst.work[t.inst].type === 'synth' && /bass/.test(t.inst) ? 'A2' : 'C5');
        break;
      }
      case 'note': if (tok === '.' || tok === '-' || tok == null) next = drums ? (kit.includes('K') ? 'K' : kit[0]) : prevNote() || 'C5'; else return; break;
      case 'letter': {
        if (drums) { if (!kit.includes(arg)) { toast(`The ${t.inst} kit has no "${arg}" — it has ${kit.join(' ')}`, { kind: 'warn', timeout: 2500 }); return; } next = arg; break; }
        const ref = tokenPitch(tok) ?? tokenPitch(prevNote() || '') ?? 72;
        const oct = Math.floor(ref / 12) - 1;
        const cand = [oct - 1, oct, oct + 1].map((o) => `${arg}${o}`).map((n2) => [n2, tokenPitch(n2)]).filter(([, p]) => p != null);
        cand.sort((a, b) => Math.abs(a[1] - ref) - Math.abs(b[1] - ref));
        next = cand[0][0];
        break;
      }
      case 'rest': {
        next = '.';
        for (let i = st + 1; i < toks.length && toks[i] === '-'; i++) toks[i] = '.';
        break;
      }
      case 'tie': {
        const before = st > 0 ? toks[st - 1] : null;
        if (drums || !before || before === '.') { toast(drums ? 'Drum hits have no hold.' : 'A hold continues the note before it — there is none here.', { kind: 'info', timeout: 2200 }); return; }
        next = '-';
        break;
      }
      case 'accent': {
        if (tok === '.' || tok === '-') return;
        next = tok.endsWith('!') ? tok.slice(0, -1) : tok.replace(/_$/, '') + '!';
        break;
      }
      case 'ai': {
        const bi = trackKeys(bsec.tracks || []).indexOf(trackKeys(sec.tracks)[s.cursor.track]);
        if (bi < 0) return;
        next = tokenize(bsec.tracks[bi].notes)[st] ?? '.';
        break;
      }
      default: return;
    }
    if (next === tok && kind !== 'rest') return;
    this.pushUndo();
    toks[st] = next;
    t.notes = formatTokens(toks, stepsPerBar(s.work));
    this.afterEdit();
    if (next !== '.' && next !== '-' && kind !== 'ai') this.preview({ tok: next });
  }

  removeTrack() {
    const s = this.sel;
    const sec = s.work.sections[s.section];
    const t = sec.tracks[s.cursor.track];
    if (!t || !t.added) return;
    this.pushUndo();
    sec.tracks.splice(s.cursor.track, 1);
    s.cursor.track = Math.max(0, s.cursor.track - 1);
    this.afterEdit();
  }

  // Add a track the user brought in (MIDI, hum): it is a user edit until saved.
  addTrack(section, { inst, notes, from, name }) {
    const s = this.sel;
    if (!s || s.kind !== 'song') return;
    const sec = s.work.sections[section];
    if (!sec) return;
    this.pushUndo();
    const taken = new Set(Object.values(s.work.sections).flatMap((x) => x.tracks.map((t) => t.id)).filter(Boolean));
    let n = 1;
    while (taken.has(`${from}-${n}`)) n++;
    sec.tracks.push({ id: `${from}-${n}`, inst, notes, vol: 0.5, added: from, ...(name ? { name } : {}) });
    s.section = section;
    s.cursor = { track: sec.tracks.length - 1, step: 0 };
    this.afterEdit();
    toast(`Added ${from}-${n} to section ${section}. Play it, adjust it, then Save to keep it.`, { kind: 'ok', timeout: 5000 });
  }

  setSection(k) {
    const s = this.sel;
    if (!s || !s.work.sections[k]) return;
    s.section = k;
    s.rows = null;
    const len = Math.max(1, compileSong(this.shown(), this.instShown()).sections[k].len);
    s.cursor.step = Math.min(s.cursor.step, len - 1);
    this.renderSongToolbar();
    this.renderGrid();
    this.renderOverview();
    this.renderInspector();
    if (this.playing && !this.follow) this.play();
  }

  selectBar(b, extend) {
    const s = this.sel;
    const bar = stepsPerBar(this.shown());
    if (extend && s.rows) {
      const from = Math.min(s.rows.from, b * bar), to = Math.max(s.rows.to, (b + 1) * bar);
      s.rows = { from, to };
    } else if (s.rows && s.rows.from === b * bar && s.rows.to === (b + 1) * bar) s.rows = null;
    else s.rows = { from: b * bar, to: (b + 1) * bar };
    s.cursor.step = b * bar;
    this.renderGrid();
    this.renderInspector();
    if (this.playing) this.player.send({ t: 'range', range: this.loopRange() });
  }

  setBpm(v) {
    const s = this.sel;
    if (!s || s.kind !== 'song' || !Number.isFinite(v)) return;
    const bpm = Math.max(20, Math.min(400, Math.round(v)));
    if (bpm === s.work.bpm) return;
    this.pushUndo();
    s.work.bpm = bpm;
    this.afterEdit({ grid: false });
  }

  toggleSet(set, k) {
    if (set.has(k)) set.delete(k); else set.add(k);
    this.renderGrid();
    this.renderOverview();
    if (this.player) { this.player.send({ t: 'mute', keys: [...this.muted] }); this.player.send({ t: 'solo', keys: [...this.solo] }); }
  }

  toggleAI() {
    if (!this.sel) return;
    this.showAI = !this.showAI;
    this.render();
    if (this.playing) this.play();
  }

  // ================================================================ audio ===
  async ensurePlayer() {
    if (!this.player) {
      this.player = await createPlayer();
      if (!this.player) throw new Error('This computer has no audio output the studio can use.');
      this.player.onMessage((m) => this.onAudio(m));
    }
    await this.player.resume();
    return this.player;
  }

  loopRange() {
    const s = this.sel;
    if (!s || s.kind !== 'song' || !this.loop) return null;
    return s.rows ? { section: s.section, from: s.rows.from, to: s.rows.to } : { section: s.section };
  }

  togglePlay() { if (this.playing) this.stop(); else this.play(); }

  async play({ fromCursor = false } = {}) {
    const s = this.sel;
    if (!s) return;
    if (s.kind === 'sfx') { this.playSfx(); return; }
    let p;
    try { p = await this.ensurePlayer(); } catch (err) { toast(err.message, { kind: 'error' }); return; }
    const c = this.compiled();
    const oi = Math.max(0, c.order.indexOf(s.section));
    const step = fromCursor ? s.cursor.step : s.rows && this.loop ? s.rows.from : 0;
    p.send({ t: 'mute', keys: [...this.muted] });
    p.send({ t: 'solo', keys: [...this.solo] });
    p.send({ t: 'play', song: c, at: { order: oi, step }, range: this.loopRange(), fade: 0.01 });
    this.playing = true;
    this.posQ = [];
    this.pos = null;
    this.renderPlayBtn();
    if (!this.raf) this.raf = requestAnimationFrame(() => this.tick());
  }

  stop() {
    if (this.player && this.playing) this.player.send({ t: 'stop', fade: 0.12 });
    this.playing = false;
    this.posQ = [];
    this.pos = null;
    this.renderPlayBtn();
    this.showPlayhead();
    this.drawOvPlayhead();
  }

  async playSfx() {
    const s = this.sel;
    if (!s || s.kind !== 'sfx') return;
    let p;
    try { p = await this.ensurePlayer(); } catch (err) { toast(err.message, { kind: 'error' }); return; }
    p.send({ t: 'sfx', sfx: compileSfx(this.showAI ? s.base : s.work, this.inst.work) });
  }

  // Hear one note / drum hit with the selected track's instrument (as it is now).
  async preview({ tok = null, hits = null } = {}) {
    const s = this.sel;
    const ct = this.curTrack();
    if (!ct) return;
    let p;
    try { p = await this.ensurePlayer(); } catch { return; }
    const c = compileSong({ bpm: s.work.bpm, sections: { A: { tracks: [{ ...ct.t, notes: 'C4' }] } } }, this.inst.work);
    const tr = c.sections.A.tracks[0];
    const t = tok ?? tokenize(ct.t.notes)[s.cursor.step];
    const msg = { t: 'note', type: tr.type, p: tr.p, kit: tr.kit, vol: tr.vol, pan: tr.pan, echo: tr.echo, len: 0.35 };
    if (tr.type === 'drums') { const pt = parseToken(t || '', true); msg.hits = hits || (pt.kind === 'drum' ? pt.hits : Object.keys(tr.kit || {}).slice(0, 1)); }
    else { const pt = parseToken(t || '', false); msg.midi = pt.kind === 'note' ? pt.midi : [60]; }
    p.send(msg);
  }

  onAudio(m) {
    if (!m || m.t !== 'pos') return;
    if (m.ended) { this.posQ.push({ ended: true, ctxTime: m.ctxTime ?? 0 }); return; }
    this.posQ.push(m);
    if (this.posQ.length > 400) this.posQ.splice(0, this.posQ.length - 400);
  }

  tick() {
    this.raf = null;
    if (!this.playing || !this.player) return;
    const now = this.player.now();
    let moved = false;
    while (this.posQ.length && this.posQ[0].ctxTime <= now) {
      const m = this.posQ.shift();
      if (m.ended) { this.stop(); return; }
      this.pos = m; moved = true;
    }
    if (moved && this.sel && this.sel.kind === 'song') {
      if (this.follow && this.pos.section !== this.sel.section && this.sel.work.sections[this.pos.section]) { this.sel.section = this.pos.section; this.renderSongToolbar(); this.renderGrid(); this.renderOverview(); }
      this.showPlayhead();
      this.drawOvPlayhead();
    }
    this.raf = requestAnimationFrame(() => this.tick());
  }

  showPlayhead() {
    if (this.lastPlayRow) { this.lastPlayRow.classList.remove('play'); this.lastPlayRow = null; }
    const pos = this.pos;
    if (!this.playing || !pos || !this.sel || pos.section !== this.sel.section || !this.rowEls) return;
    const row = this.rowEls[pos.step];
    if (!row) return;
    row.classList.add('play');
    this.lastPlayRow = row;
    if (this.follow) {
      const r = row.getBoundingClientRect(), st = this.stage.getBoundingClientRect();
      if (r.bottom > st.bottom - 24 || r.top < st.top + 40) this.stage.scrollTop += r.top - st.top - 60;
    }
  }

  renderPlayBtn() {
    mount(this.playBtn, icon(this.playing ? 'stop' : 'play'), h('span', null, this.playing ? 'Stop' : 'Play'));
    this.playBtn.classList.toggle('playing', this.playing);
  }

  toggleLoop() {
    this.loop = !this.loop;
    ls.set('ps.sound.loop', this.loop);
    this.loopBtn.classList.toggle('on', this.loop);
    if (this.playing && this.player) this.player.send({ t: 'range', range: this.loopRange() });
  }

  // ================================================================= save ===
  renderSaveState() {
    const s = this.sel;
    const dirty = this.sessionDirty(s);
    const drift = s ? this.driftOf(s).length + this.instDrift().length : 0;
    const inst = !same(this.inst.work, this.inst.saved);
    const others = [...this.sessions.values()].filter((x) => x !== s && !same(x.work, x.saved)).length;
    const live = this.project && this.app.gameRunning(this.project.id) ? ' The running game updates live.' : '';
    mount(this.saveState,
      !s ? h('span.clean', null, 'Nothing selected')
        : dirty ? h('span.dirty', null, `Unsaved changes${inst ? ' (incl. instrument knobs — every song)' : ''}`)
          : drift ? h('span.dirty', null, 'Save to keep your edits on the AI\'s new version')
            : h('span.clean', null, (s.kind === 'song' ? this.disk.songs[s.id] : this.disk.sfx[s.id]) ? `Saved — the game plays your version.${live}` : 'The AI\'s version — nothing edited yet.'),
      others ? h('div.dim', { style: { fontSize: '11.5px' } }, `${others} other unsaved song${others > 1 ? 's' : ''}/effect${others > 1 ? 's' : ''}`) : null);
    this.saveBtn.disabled = !s || (!dirty && !drift) || this.showAI;
  }

  async save() {
    const s = this.sel;
    if (!s || !this.project || this._saving) return;
    const drift = this.driftOf(s).length;
    const instDrift = this.instDrift().length;
    if (!this.sessionDirty(s) && !drift && !instDrift) { toast('Nothing to save.', { kind: 'info', timeout: 1500 }); return; }
    const pid = this.project.id;
    const note = this.noteInput.value.trim();
    const ts = new Date().toISOString();
    const edits = [];
    const changes = [];
    if (!same(s.work, s.saved) || drift) {
      if (s.kind === 'song') {
        const ed = makeSongEdit(s.base, s.work, { game: pid, song: s.id, prev: this.disk.songs[s.id] });
        if (note) ed.notes.push({ ts, text: note });
        edits.push(ed);
        changes.push(...songChanges(s.saved, s.work));
      } else {
        const ed = makeSfxEdit(s.base, s.work, { game: pid, sfx: s.id, prev: this.disk.sfx[s.id] });
        if (note) ed.notes.push({ ts, text: note });
        edits.push(ed);
        changes.push(...sfxChanges(s.saved, s.work));
      }
    }
    if (!same(this.inst.work, this.inst.saved) || instDrift) {
      edits.push(makeInstrumentEdits(this.data.base.instruments, this.inst.work, { game: pid }));
      changes.push(...instrumentChanges(this.inst.saved, this.inst.work));
    }
    const kinds = [...new Set(changes.map((c) => c.what))];
    const lesson = changes.length ? {
      id: lessonId(s.id), ts, kind: kinds.length === 1 ? kinds[0] : 'mixed', [s.kind === 'song' ? 'song' : 'sfx']: s.id,
      note, changes, summary: changes.map(describeChange).join('; ').slice(0, 2000), design: this.info.design || null,
      base: s.kind === 'song' ? { bpm: s.base.bpm } : undefined,
    } : null;
    this._saving = true;
    this.saveBtn.disabled = true;
    try {
      await window.studio.sound.save(pid, { edits, lessons: lesson ? [lesson] : [] });
    } catch (err) {
      this._saving = false;
      this.renderSaveState();
      toast(`Save failed: ${err.message}`, { kind: 'error', timeout: 8000 });
      return;
    }
    await this.reloadEdits({ keepWork: true });
    s.work = clone(s.saved);
    setTimeout(() => { this._saving = false; }, 1200);
    this.noteInput.value = '';
    this.render();
    this.renderList();
    this.renderFoot();
    const live = this.app.gameRunning(pid) ? ' The running game picked it up.' : '';
    toast(`Saved ${s.base.name || s.id}${lesson ? ' · 1 sound lesson for the AI' : ''}.${live}`, { kind: 'ok' });
    this.app.logActivity?.(`Saved sound edits for ${s.kind} ${s.id}${changes.length ? `: ${changes.slice(0, 3).map(describeChange).join('; ')}` : ''}`, 'studio');
  }

  moreMenu(anchor) {
    const s = this.sel;
    if (!s) return;
    const pid = this.project.id;
    const edited = s.kind === 'song' ? this.disk.songs[s.id] : this.disk.sfx[s.id];
    popMenu(anchor, [
      { label: 'Discard unsaved changes', ico: 'undo', disabled: same(s.work, s.saved) && same(this.inst.work, this.inst.saved), fn: () => { this.pushUndo(); s.work = clone(s.saved); this.inst.work = clone(this.inst.saved); this.afterEdit({ inst: true }); } },
      { label: `Revert ${s.kind === 'song' ? 'the song' : 'the effect'} to the AI's version…`, ico: 'revert', danger: true, disabled: !edited, fn: async () => {
        if (!(await confirmDialog("Back to the AI's version?", `Your saved edits of "${s.base.name || s.id}" are removed (the instrument knobs stay). Undo can bring them back until you leave the song.`, { okLabel: 'Revert', danger: true }))) return;
        this.pushUndo();
        await window.studio.sound.revert(pid, s.kind, s.id);
        await this.reloadEdits({ keepWork: false });
        this.render(); this.renderList();
        toast('Reverted to the AI\'s version.', { kind: 'ok' });
      } },
      { label: 'Revert every instrument knob…', ico: 'revert', danger: true, disabled: !this.disk.instruments, fn: async () => {
        if (!(await confirmDialog('Instrument knobs back to the AI\'s?', 'Your saved instrument changes (every song) are removed.', { okLabel: 'Revert', danger: true }))) return;
        await window.studio.sound.revert(pid, 'instruments');
        this.inst.saved = {}; // forces the reload to take the fresh values
        await this.reloadEdits({ keepWork: false });
        this.render();
      } },
      '-',
      { label: s.kind === 'song' ? 'Copy the song as notation' : 'Copy the recipe', ico: 'copy', fn: () => copyText(s.kind === 'song' ? songText(s.work) : JSON.stringify(s.work, null, 2)).then(() => toast('Copied.', { kind: 'ok', timeout: 1500 })) },
      { label: 'Open the edits folder', ico: 'folder', fn: () => window.studio.shell.open(this.info.edits, false).catch((e) => toast(e.message, { kind: 'error' })) },
    ], { align: 'right' });
  }

  // ============================================================ music in ===
  addMenu(anchor) {
    const s = this.sel;
    if (!s || s.kind !== 'song') return;
    popMenu(anchor, [
      { label: 'Import a MIDI file…', ico: 'note', hint: '.mid', fn: () => pickFile('.mid,.midi,audio/midi', (f) => openMidiImport(this, f)) },
      { label: 'Hum a melody…', ico: 'mic', fn: () => openHum(this) },
      '-',
      { label: 'Attach a reference recording…', ico: 'send', hint: 'WAV · MP3', fn: () => pickFile('.wav,.mp3,.ogg,.flac,.m4a,audio/*', (f) => openReference(this, f)) },
    ]);
  }

  ask() {
    const s = this.sel;
    if (!s || !this.project) return;
    const p = this.project;
    if (s.kind === 'sfx') { openRequestDialog(this.app, { scope: p.id, kind: 'audio', target: { sfx: s.id }, title: '', body: `About the sound effect "${s.base.name || s.id}" (${s.id}):\n` }); return; }
    const bar = stepsPerBar(s.work);
    const bars = s.rows ? [s.rows.from / bar + 1, s.rows.to / bar] : null;
    openRequestDialog(this.app, {
      scope: p.id, kind: 'audio', title: '',
      target: { song: s.id, section: s.section, bars },
      body: `About the song "${s.base.name || s.id}" (${s.id}), section ${s.section}${bars ? `, bar${bars[0] === bars[1] ? ` ${bars[0]}` : `s ${bars[0]}–${bars[1]}`}` : ''}:\n`,
    });
  }

  // ================================================================= keys ===
  onKey(e) {
    if (this.app.view !== 'sound' || !this.sel || topModal() || isTyping(e)) return;
    const s = this.sel;
    const k = e.key;
    if ((e.ctrlKey || e.metaKey) && k.toLowerCase() === 's') { e.preventDefault(); this.save(); return; }
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && k.toLowerCase() === 'z') { e.preventDefault(); this.undoRedo(true); return; }
    if ((e.ctrlKey || e.metaKey) && (k.toLowerCase() === 'y' || (e.shiftKey && k.toLowerCase() === 'z'))) { e.preventDefault(); this.undoRedo(false); return; }
    if (k === ' ') { e.preventDefault(); this.togglePlay(); return; }
    if (s.kind !== 'song') return;
    if (k === 'Enter') { e.preventDefault(); this.play({ fromCursor: true }); return; }
    const c = this.compiled();
    const sec = c.sections[s.section];
    const n = sec ? sec.tracks.length : 0, len = sec ? Math.max(1, sec.len) : 1;
    if (k === 'ArrowUp' || k === 'ArrowDown') {
      e.preventDefault();
      if (e.shiftKey) { this.op(k === 'ArrowUp' ? (e.ctrlKey ? 'oct-up' : 'up') : (e.ctrlKey ? 'oct-down' : 'down')); return; }
      this.setCursor(s.cursor.track, Math.max(0, Math.min(len - 1, s.cursor.step + (k === 'ArrowUp' ? -1 : 1))));
      return;
    }
    if (k === 'ArrowLeft' || k === 'ArrowRight') { e.preventDefault(); this.setCursor(Math.max(0, Math.min(n - 1, s.cursor.track + (k === 'ArrowLeft' ? -1 : 1))), s.cursor.step); return; }
    if (k === 'PageDown' || k === 'PageUp') { e.preventDefault(); const bar = stepsPerBar(s.work); this.setCursor(s.cursor.track, Math.max(0, Math.min(len - 1, s.cursor.step + (k === 'PageUp' ? -bar : bar)))); return; }
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    const isDrum = sec && sec.tracks[s.cursor.track] && sec.tracks[s.cursor.track].type === 'drums';
    if (k === '.' || k === 'Delete' || k === 'Backspace') { e.preventDefault(); this.op('rest'); this.moveDown(len); return; }
    if (k === '-') { e.preventDefault(); this.op('tie'); this.moveDown(len); return; }
    if (k === '!') { e.preventDefault(); this.op('accent'); return; }
    if (isDrum && /^[A-Za-z]$/.test(k)) { e.preventDefault(); this.op('letter', k); this.moveDown(len); return; }
    if (!isDrum && /^[a-gA-G]$/.test(k)) { e.preventDefault(); this.op('letter', k.toUpperCase()); this.moveDown(len); return; }
    if (k === 'l' || k === 'L') { this.toggleLoop(); return; }
    if (k === 'v' || k === 'V') { this.toggleAI(); }
  }

  moveDown(len) { const s = this.sel; this.setCursor(s.cursor.track, Math.min(len - 1, s.cursor.step + 1)); }

  onShow() { if (this.sel && this.sel.kind === 'song') requestAnimationFrame(() => this.renderOverview()); }
}

// ---------------------------------------------------------------- helpers ---
function fmt(v) {
  if (v == null) return '—';
  if (typeof v !== 'number') return String(v);
  const a = Math.abs(v);
  return String(a >= 100 ? Math.round(v) : a >= 10 ? Math.round(v * 10) / 10 : Math.round(v * 100) / 100);
}
function roundTo(v, step) { const s = step || 1; return Math.round(v / s) * s; }

function pickFile(accept, fn) {
  const inp = h('input', { type: 'file', accept, style: { display: 'none' }, onchange: () => { const f = inp.files && inp.files[0]; inp.remove(); if (f) fn(f); } });
  document.body.append(inp);
  inp.click();
}

function songText(song) {
  const lines = [`// ${song.name || 'song'} — ${song.bpm} bpm`];
  for (const [k, sec] of Object.entries(song.sections || {})) {
    lines.push(`${k}:`);
    const keys = trackKeys(sec.tracks);
    sec.tracks.forEach((t, i) => lines.push(`  ${keys[i]} (${t.inst}): ${formatTokens(tokenize(t.notes), stepsPerBar(song))}`));
  }
  return lines.join('\n');
}

function distillPrompt(project, n) {
  return `I made ${n} new sound edit${n === 1 ? '' : 's'} in ${project.name} (${project.id}) in Pixel Yak's Sound view. Learn from them: follow ` +
    `.agents/skills/sound-learn/SKILL.md — start with \`node cli/yak.mjs sound-lessons ${project.id} --new\`, then update ` +
    `games/${project.id}/design/sound.md and design/instruments.js so the next songs need fewer fixes. Use a smart model for this.`;
}
