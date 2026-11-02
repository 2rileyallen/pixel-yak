// studio/ui/js/views/clips.js — promo clips of the current game (docs/contracts/CLIPS.md). A clip is
// a recipe (games/<id>/clips/<name>.clip.json) the recorder films into an MP4. Here you watch it,
// change its words, their timing, the music, the length and the aspect in a simple form and
// Re-render; Probe takes a few stills for framing. New clip… and Ask AI to change… write requests:
// the AI writes recipes and shot scripts (skill promo).
import { h, mount, btn, iconBtn, toast, modal, field, timeAgo, copyText, popMenu, confirmDialog } from '../ui.js';
import { icon } from '../icons.js';
import { openRequestDialog } from '../request-dialog.js';
import { requestPrompt } from '../prompts.js';

const ASPECTS = [['9:16', 'Portrait', '9:16'], ['16:9', 'Wide', '16:9'], ['1:1', 'Square', '1:1']];
const POS = [['top', 'Top'], ['middle', 'Middle'], ['bottom', 'Bottom']];
const BACKDROPS = [['dim', 'Dim the game'], ['solid', 'Solid'], ['none', 'Words only']];
const STAGE = { start: 'Starting', copy: 'Copying the last commit', music: 'Rendering the music', boot: 'Booting the game', setup: 'Setting the scene', film: 'Filming', encode: 'Finishing the video' };
const ls = {
  get: (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};
const clone = (o) => JSON.parse(JSON.stringify(o));
const r1 = (n) => Math.round(n * 10) / 10;
const size = (n) => (n < 1048576 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1048576).toFixed(1)} MB`);
// a form field around buttons (a <label> would click its first button when its words are clicked)
const group = (label, control, hint = null) => h('div.field.clip-group', null, h('span.field-label', null, label), control, hint ? h('span.field-hint', null, hint) : null);
const url = (rel, v) => `/${rel.split('/').map(encodeURIComponent).join('/')}${v ? `?v=${encodeURIComponent(v)}` : ''}`;

export class ClipsView {
  constructor(app) {
    this.app = app;
    this.el = h('section.view.split.clips');
    this.left = h('div.pane.left');
    this.right = h('div.pane.clip-pane');
    mount(this.el, this.left, this.right);
    this.pid = null;
    this.list = [];
    this.loaded = false;
    this.sel = null;
    this.draft = null; // the form's copy of the selected recipe
    this.dirty = false;
    this.job = null; // the recorder's run, from clips:progress
    this.songs = [];
    this.lastError = null;
    const s = window.studio;
    if (s && s.clips) {
      s.onClipProgress((m) => this.onProgress(m));
      s.onFsChanged((changes) => { if (changes.some((c) => c.kind === 'clips' && c.project === this.pid) && !this.job) this.refreshSoon(); });
      s.clips.job().then((j) => { if (j) { this.job = { ...j, ...j.last }; this.renderProgress(); } }).catch(() => {});
    }
  }

  setProject(p) {
    if (p && p.id === this.pid) return;
    this.pid = p ? p.id : null;
    this.sel = ls.get(`ps.clip.${this.pid}`, null);
    this.draft = null; this.dirty = false; this.lastError = null; this.loaded = false; this.list = [];
    if (this.el.classList.contains('on')) this.load(); else this.render();
  }

  onShow() {
    const p = this.app.project;
    if (p && p.id !== this.pid) { this.setProject(p); return; }
    this.load();
  }

  refreshSoon() { clearTimeout(this._t); this._t = setTimeout(() => this.load(), 250); }

  async load() {
    const pid = this.pid;
    if (!pid) { this.render(); return; }
    const [list, songs] = await Promise.all([window.studio.clips.list(pid).catch(() => []), window.studio.clips.songs(pid).catch(() => [])]);
    if (pid !== this.pid) return;
    this.list = list; this.songs = songs; this.loaded = true;
    if (!this.list.some((c) => c.name === this.sel)) this.sel = this.list[0] ? this.list[0].name : null;
    const cur = this.current();
    if (cur && (!this.draft || this.draft.name !== cur.name || !this.dirty)) { this.draft = clone(cur.clip); this.dirty = false; }
    this.render();
  }

  current() { return this.list.find((c) => c.name === this.sel) || null; }

  async select(name) {
    if (name === this.sel) return;
    if (this.dirty && !(await confirmDialog('Leave this clip?', 'Your unsaved changes to its words are dropped.', { okLabel: 'Drop changes', danger: true }))) return;
    this.sel = name; ls.set(`ps.clip.${this.pid}`, name);
    const cur = this.current();
    this.draft = cur ? clone(cur.clip) : null; this.dirty = false; this.lastError = null;
    this.render();
  }

  // ================================================================ render ===
  render() {
    const p = this.app.project;
    mount(this.left,
      h('div.pane-head', null,
        h('h1', null, icon('film'), 'Clips', h('div.grow'), btn('New clip…', () => this.newClip(), { kind: 'primary', ico: 'plus', small: true, disabled: !p })),
        h('p', null, 'Short videos of this game for social media. Each clip is a recipe: change its words here and re-render, or ask the AI for new shots.')),
      h('div.pane-scroll', null, !p ? null : this.list.length ? this.list.map((c) => this.card(c))
        : h('div.empty', null, icon('film'), h('h3', null, this.loaded ? 'No clips yet' : 'Loading…'),
          this.loaded ? h('p', null, `Use New clip… to tell the AI what the video should show. It writes the recipe in games/${p.id}/clips/ and renders it.`) : null)));
    mount(this.right, this.detail());
  }

  card(c) {
    const busy = this.job && this.job.pid === this.pid && this.job.name === c.name;
    const a = c.clip.aspect;
    return h(`div.card.clip-card${c.name === this.sel ? '.on' : ''}`, { onclick: () => this.select(c.name) },
      h(`div.clip-thumb.a${a.replace(':', 'x')}`, null, c.probe ? h('img', { src: url(c.probe.stills[Math.floor(c.probe.stills.length / 2)], c.probe.at), alt: '' }) : icon('film')),
      h('div.grow', null,
        h('div.ct', null, c.clip.title),
        h('div.cm', null, h('span.tag.sky', null, a), `${c.clip.length} s`, c.clip.music ? h('span', { title: 'Music' }, icon('sound'), c.clip.music.song) : null),
        h('div.cm', null, busy ? h('span.clip-busy', null, h('i.spin'), this.job.probe ? 'Probing…' : 'Rendering…')
          : c.render ? h('span', null, `Rendered ${timeAgo(c.render.at)} · ${size(c.render.bytes)}`) : h('span.dim', null, 'Not rendered yet'),
        !busy && c.render && c.changedAt && c.changedAt > c.render.at ? h('span.tag.fire', { title: 'The recipe changed after the last render' }, 'edited') : null)));
  }

  detail() {
    const c = this.current();
    if (!this.app.project) return h('div.empty', { style: { flex: 1 } }, icon('film'), h('h3', null, 'No game open'));
    if (!c) return h('div.empty', { style: { flex: 1 } }, icon('film'), h('h3', null, this.loaded ? 'Pick a clip, or make one' : 'Loading…'),
      h('p', null, 'A clip is filmed from a committed version of the game, offscreen, with title cards and captions in the pixel font.'));
    const d = this.draft;
    const running = this.job && !this.job.finished;
    const mine = running && this.job.pid === this.pid && this.job.name === c.name;
    this.progressEl = h('div.clip-progress-slot');
    const head = h('div.clip-head', null,
      h('div.grow', null,
        h('h2', null, c.clip.title),
        h('div.clip-meta', null, h('span.tag.sky', null, c.clip.aspect), `${c.clip.length} s · ${c.clip.fps} fps`, c.clip.music ? h('span', null, ' · music ', h('b', null, c.clip.music.song)) : ' · no music',
          h('span.mono.dim', null, ` · ${c.file}`))),
      btn('Probe', () => this.run(c, true), { ico: 'camera', disabled: running, title: 'Take a few stills (no video) to check the framing — quick' }),
      btn('Ask AI to change…', () => this.askAi(c), { kind: 'teal', ico: 'bot', title: 'New shots, a different moment, other words: a request for the AI' }),
      btn(this.dirty ? 'Save & re-render' : 'Re-render', () => this.run(c, false), { kind: 'primary', ico: 'film', disabled: running, title: running && !mine ? `Busy with "${this.job.name}" — one at a time` : 'Film the clip again from the recipe (a committed copy of the game, offscreen)' }),
      iconBtn('folder', 'More', (e) => popMenu(e.currentTarget, [
        { label: 'Show the MP4 in its folder', ico: 'folder', disabled: !c.render, fn: () => window.studio.shell.open(c.render.mp4, true).catch((err) => toast(err.message, { kind: 'error' })) },
        { label: 'Open the recipe', ico: 'open', fn: () => window.studio.shell.open(c.file).catch((err) => toast(err.message, { kind: 'error' })) },
        c.shotFile ? { label: 'Open the shot script', ico: 'open', fn: () => window.studio.shell.open(c.shotFile).catch((err) => toast(err.message, { kind: 'error' })) } : null,
        '-',
        { label: 'Copy: render this clip (CLI)', ico: 'copy', fn: () => copyText(`node cli/yak.mjs clip ${this.pid} ${c.name}`).then(() => toast('Copied', { kind: 'ok', timeout: 1500 })) },
      ].filter(Boolean), { align: 'right' })));
    const body = h('div.clip-body', null, this.playerCol(c), this.form(c, d));
    const wrap = h('div.detail.clip-detail', null, head, this.progressEl, this.lastError && this.lastError.name === c.name ? this.errorBox(this.lastError) : null, body);
    this.renderProgress();
    return wrap;
  }

  // ------------------------------------------------------------- player ---
  playerCol(c) {
    const a = c.clip.aspect.replace(':', 'x');
    const info = c.render && c.render.info;
    let video = null;
    const screen = h('div.clip-screen');
    if (c.render) {
      video = h('video', { src: url(c.render.mp4, c.render.at), controls: true, loop: true, preload: 'auto', playsInline: true });
      screen.append(video);
    } else {
      screen.append(h('div.clip-screen-empty', null, icon('film'), h('b', null, 'Not rendered yet'), h('span', null, 'Re-render films it (about the clip\'s length plus a few seconds).')));
    }
    this.video = video;
    if (video) {
      let raf = 0;
      const loop = () => { this.movePlayhead(); raf = video.paused ? 0 : requestAnimationFrame(loop); };
      video.addEventListener('play', () => { if (!raf) raf = requestAnimationFrame(loop); });
      video.addEventListener('seeked', () => this.movePlayhead());
      video.addEventListener('timeupdate', () => this.movePlayhead());
    }
    const tl = this.timeline(c, video);
    const meta = c.render ? h('div.clip-render-meta', null,
      h('span', null, `Rendered ${timeAgo(c.render.at)}`), h('span', null, size(c.render.bytes)),
      info && info.media ? h('span', null, `${info.media.width}×${info.media.height} · ${info.media.duration} s · ${info.media.fps} fps${info.media.audio ? ' · sound' : ''}`) : null,
      info && info.game ? h('span', { title: info.game.subject }, `game commit ${info.game.commit}`) : null,
      c.changedAt && c.changedAt > c.render.at ? h('span.tag.fire', null, 'recipe edited since') : null) : null;
    const notes = info && info.notes && info.notes.length ? h('div.clip-notes', null, info.notes.map((n) => h('div', null, icon('warn'), n))) : null;
    return h(`div.clip-player.a${a}`, null, screen, tl, meta, notes, this.probeStrip(c));
  }

  // Blocks for the cards and captions on the clip's clock; click to jump there. A playhead follows the video.
  timeline(c, video) {
    const d = this.dirty ? this.draft : c.clip;
    const len = d.length || 1;
    const pct = (t) => `${Math.max(0, Math.min(100, (t / len) * 100))}%`;
    const blocks = [];
    const add = (s, cls, label) => blocks.push(h(`button.tl-block.${cls}`, { type: 'button', title: `${label} · ${s.from}–${s.to} s`, style: { left: pct(s.from), width: `calc(${pct(s.to - s.from)} - 2px)` }, onclick: (e) => { e.stopPropagation(); if (video) { video.currentTime = s.from + 0.05; video.pause(); } } }, label));
    if (d.titleCard) add(d.titleCard, 'card', d.titleCard.text);
    d.captions.forEach((cap) => add(cap, `cap.${cap.pos}`, cap.text));
    if (d.endCard) add(d.endCard, 'card', d.endCard.text);
    const head = h('div.tl-playhead');
    const track = h('div.tl-track', { onclick: (e) => { if (!video) return; const r = track.getBoundingClientRect(); video.currentTime = Math.max(0, Math.min(len, ((e.clientX - r.left) / r.width) * len)); } }, blocks, head);
    const ticks = h('div.tl-ticks', null, Array.from({ length: Math.floor(len) + 1 }, (_, i) => (i % (len > 30 ? 5 : len > 12 ? 2 : 1) === 0 ? h('span', { style: { left: pct(i) } }, `${i}s`) : null)));
    this.tlHead = head; this.tlLen = len;
    if (!video) head.classList.add('hidden');
    this.movePlayhead();
    return h('div.clip-timeline', null, track, ticks);
  }

  movePlayhead() {
    if (this.tlHead && this.video) this.tlHead.style.left = `${Math.max(0, Math.min(100, (this.video.currentTime / (this.tlLen || 1)) * 100))}%`;
  }

  probeStrip(c) {
    if (!c.probe) return null;
    return h('div.clip-probe', null,
      h('div.clip-sub', null, icon('camera'), `Probe stills · ${c.probe.at ? timeAgo(c.probe.at) : ''}`),
      h('div.clip-stills', null, c.probe.stills.map((s) => {
        const t = Number((/still-([\d.]+)s\.png$/.exec(s) || [])[1]);
        return h(`button.clip-still.a${c.clip.aspect.replace(':', 'x')}`, { type: 'button', title: `${t} s — click to enlarge`, onclick: () => this.showStill(s, c, t) },
          h('img', { src: url(s, c.probe.at), alt: `${t} s` }), h('span', null, `${t}s`));
      })));
  }

  showStill(s, c, t) {
    modal({ title: `${c.clip.title} at ${t} s (probe)`, wide: true, body: h('div.clip-still-big', null, h('img', { src: url(s, c.probe.at), alt: '' })), actions: [{ label: 'Close', kind: 'primary' }] });
  }

  errorBox(e) {
    return h('div.clip-error', null, icon('warn'), h('div.grow', null,
      h('b', null, e.probe ? 'The probe failed' : 'The render failed'), h('div', null, e.error),
      e.console && e.console.length ? h('pre', null, e.console.join('\n')) : null),
      btn('Ask AI to fix it', () => openRequestDialog(this.app, { scope: this.pid, kind: 'promo', title: `Clip "${e.name}" won't ${e.probe ? 'probe' : 'render'}`, body: `node cli/yak.mjs clip ${this.pid} ${e.name}${e.probe ? ' --probe' : ''} fails:\n\n${e.error}${e.console && e.console.length ? `\n\nPage console:\n${e.console.join('\n')}` : ''}` }), { kind: 'teal', ico: 'bot', small: true }));
  }

  // --------------------------------------------------------------- form ---
  form(c, d) {
    const mark = () => { if (!this.dirty) { this.dirty = true; this.renderSaveBar(); this.renderHeadButton(); } this.refreshTimeline(c); };
    const num = (value, set, { min = 0, max = d.length, step = 0.1, w = '64px' } = {}) => h('input.input.clip-num', {
      type: 'number', value, min, max, step, style: { width: w },
      oninput: (e) => { const v = Number(e.target.value); if (Number.isFinite(v)) { set(r1(v)); mark(); } },
    });
    const txt = (value, set, placeholder) => h('input.input', { value: value || '', maxlength: 200, placeholder, oninput: (e) => { set(e.target.value); mark(); } });
    const seg = (opts, cur, set) => {
      const el = h('div.seg', null, opts.map(([v, l, sub]) => h(`button${cur === v ? '.on' : ''}`, { type: 'button', onclick: () => { set(v); el.querySelectorAll('button').forEach((b, i) => b.classList.toggle('on', opts[i][0] === v)); mark(); } }, l, sub ? h('span.dim', null, sub) : null)));
      return el;
    };
    const span = (s) => h('div.clip-span', null, num(s.from, (v) => { s.from = v; }), h('span.dim', null, '→'), num(s.to, (v) => { s.to = v; }), h('span.dim', null, 's'));

    const cardSec = (key, label, fallback) => {
      const on = !!d[key];
      const box = h('div.clip-sec');
      const toggle = h('input', { type: 'checkbox', checked: on, onchange: (e) => { d[key] = e.target.checked ? (d[key] || fallback()) : null; mark(); this.rerenderForm(c); } });
      box.append(h('div.clip-sec-head', null, h('label.check', null, toggle, h('b', null, label)), h('div.grow'), on ? span(d[key]) : null));
      if (on) {
        const s = d[key];
        box.append(h('div.clip-grid', null,
          field('Words', txt(s.text, (v) => { s.text = v; }, 'The game\'s name')),
          field('Under it', txt(s.sub, (v) => { s.sub = v; }, 'optional, e.g. coming soon')),
          h('div.full', null, group('Behind the words', seg(BACKDROPS, s.backdrop, (v) => { s.backdrop = v; })))));
      }
      return box;
    };

    const caps = h('div.clip-caps', null, d.captions.map((cap, i) => h('div.clip-cap', null,
      h('span.clip-cap-n', null, String(i + 1)),
      span(cap),
      h('div.grow', null, txt(cap.text, (v) => { cap.text = v; }, 'Short words — under 40 letters reads best')),
      seg(POS, cap.pos, (v) => { cap.pos = v; }),
      iconBtn('trash', 'Remove this caption', () => { d.captions.splice(i, 1); mark(); this.rerenderForm(c); }))));
    const addCap = btn('Add caption', () => {
      const last = d.captions[d.captions.length - 1];
      const from = r1(Math.min(d.length - 0.5, last ? last.to + 0.3 : (d.titleCard ? d.titleCard.to + 0.3 : 0.5)));
      d.captions.push({ from, to: r1(Math.min(d.length, from + 2)), text: '', pos: 'bottom' });
      mark(); this.rerenderForm(c);
      setTimeout(() => this.formEl && this.formEl.querySelector('.clip-cap:last-child input:not(.clip-num)')?.focus(), 0);
    }, { ico: 'plus', small: true });

    const songList = h('datalist', { id: 'clip-songs' }, this.songs.map((s) => h('option', { value: s.id }, s.name)));
    const music = h('input.input', { value: d.music ? d.music.song : '', list: 'clip-songs', placeholder: this.songs.length ? 'No music — or pick a song' : 'No music — or a song id of this game', maxlength: 96,
      oninput: (e) => { const v = e.target.value.trim(); d.music = v ? { song: v } : null; mark(); } });

    this.formEl = h('div.clip-form', null,
      h('div.clip-sec', null,
        h('div.clip-sec-head', null, h('b', null, 'The clip')),
        h('div.clip-grid', null,
          h('div.full', null, group('Shape', seg(ASPECTS, d.aspect, (v) => { d.aspect = v; }), 'Portrait for Shorts / Reels / TikTok; wide for YouTube; square for feeds.')),
          field('Length (seconds)', num(d.length, (v) => { d.length = v; }, { min: 1, max: 180, step: 0.5, w: '90px' })),
          field('Music', h('div', null, music, songList), this.songs.length ? null : 'Rendered from the game\'s own songs.'))),
      cardSec('titleCard', 'Title card', () => ({ from: 0, to: Math.min(2, r1(d.length / 3)), text: this.app.project.name, sub: '', backdrop: 'dim' })),
      h('div.clip-sec', null, h('div.clip-sec-head', null, h('b', null, 'Captions'), h('span.dim', null, d.captions.length ? `${d.captions.length}` : 'none yet'), h('div.grow'), addCap), caps),
      cardSec('endCard', 'End card', () => ({ from: r1(Math.max(0, d.length - 1.6)), to: d.length, text: this.app.project.name, sub: 'coming soon', backdrop: 'solid' })),
      this.saveBar = h('div.clip-save'));
    this.renderSaveBar();
    return this.formEl;
  }

  rerenderForm(c) {
    if (!this.formEl) return;
    const scroll = this.formEl.parentElement?.closest('.detail')?.scrollTop;
    this.formEl.replaceWith(this.form(c, this.draft));
    const det = this.right.querySelector('.detail');
    if (det && scroll != null) det.scrollTop = scroll;
  }

  refreshTimeline(c) {
    const old = this.right.querySelector('.clip-timeline');
    if (old) old.replaceWith(this.timeline(c, this.video));
  }

  renderHeadButton() {
    const b = this.right.querySelector('.clip-head .btn.primary > span:last-child');
    if (b) b.textContent = this.dirty ? 'Save & re-render' : 'Re-render';
  }

  renderSaveBar() {
    if (!this.saveBar) return;
    mount(this.saveBar, this.dirty
      ? [h('span.clip-dirty', null, h('i'), 'Unsaved changes'), h('div.grow'),
        btn('Revert', () => { const c = this.current(); this.draft = clone(c.clip); this.dirty = false; this.render(); }, { kind: 'ghost', small: true }),
        btn('Save', () => this.save(), { small: true, ico: 'save' })]
      : [h('span.dim', null, 'Saved in the recipe. Re-render to see changes in the video.')]);
  }

  async save() {
    const c = this.current();
    if (!c || !this.dirty) return c && c.clip;
    const d = this.draft;
    const before = d.captions.length;
    try {
      const n = await window.studio.clips.save(this.pid, c.name, { aspect: d.aspect, length: d.length, titleCard: d.titleCard, captions: d.captions, endCard: d.endCard, music: d.music });
      const lost = before - n.captions.length;
      if (lost > 0) toast(`${lost} caption${lost === 1 ? ' was' : 's were'} left out: no words, or it ends before it starts.`, { kind: 'warn', timeout: 6000 });
      this.dirty = false;
      c.clip = n; this.draft = clone(n);
      await this.load();
      return n;
    } catch (err) { toast(err.message, { kind: 'error' }); return null; }
  }

  // ------------------------------------------------------------ actions ---
  async run(c, probe) {
    if (this.dirty && !(await this.save())) return;
    this.lastError = null;
    try {
      const j = await window.studio.clips.render(this.pid, c.name, { probe });
      this.job = { ...j, stage: 'start' };
      this.render();
    } catch (err) { toast(err.message, { kind: 'error' }); }
  }

  onProgress(m) {
    if (m.finished) {
      this.job = null;
      if (m.ok && m.done) {
        if (m.probe) toast(`${m.done.stills.length} probe stills of "${m.name}" — check the framing below the player.`, { kind: 'ok' });
        else {
          const md = m.done.media || {};
          toast(`"${m.name}" rendered — ${md.duration ?? m.done.seconds} s, ${size(m.done.bytes)}${m.done.music ? ', with music' : ''}.`, { kind: 'ok' });
        }
        for (const n of m.done.notes || []) toast(n, { kind: 'warn', timeout: 9000 });
      } else if (m.cancelled) toast(`Stopped "${m.name}".`, { kind: 'info' });
      else { this.lastError = { name: m.name, probe: m.probe, error: m.error, console: m.console }; toast(`"${m.name}" ${m.probe ? 'probe' : 'render'} failed: ${m.error}`, { kind: 'error', timeout: 9000 }); }
      if (m.pid === this.pid) this.load(); else this.render();
      return;
    }
    const wasRunning = !!this.job;
    this.job = { ...(this.job || {}), pid: m.pid, name: m.name, probe: m.probe, ...(m.stage ? { stage: m.stage } : {}), ...(m.of ? { frame: m.frame, of: m.of } : {}) };
    if (!wasRunning) this.render(); else this.renderProgress();
  }

  renderProgress() {
    if (!this.progressEl) return;
    const j = this.job;
    const c = this.current();
    if (!j || !c || j.pid !== this.pid || j.name !== c.name) {
      mount(this.progressEl, j && !j.finished ? h('div.clip-progress.other', null, h('i.spin'), `Busy with "${j.name}"${j.pid !== this.pid ? ` (${j.pid})` : ''} — one clip at a time.`) : null);
      return;
    }
    const pct = j.stage === 'film' && j.of ? Math.round((j.frame / j.of) * 100) : j.stage === 'encode' ? 100 : 0;
    const label = j.probe && j.stage === 'film' ? `Taking stills ${j.frame || 0} of ${j.of || '…'}` : `${STAGE[j.stage] || 'Working'}${j.stage === 'film' ? ` · ${pct}%` : '…'}`;
    mount(this.progressEl, h('div.clip-progress', null,
      h('i.spin'), h('span.clip-progress-label', null, label),
      h('div.clip-bar', null, h('i', { style: { width: `${j.stage === 'film' || j.stage === 'encode' ? pct : 4}%` } })),
      btn('Cancel', () => window.studio.clips.cancel().catch(() => {}), { small: true, kind: 'ghost', ico: 'close' })));
  }

  // A request for the AI about this clip; the frame you're on comes along.
  askAi(c) {
    const v = this.video;
    const attachments = [];
    let at = '';
    if (v && v.readyState >= 2 && v.videoWidth) {
      const w = (c.render.info && c.render.info.window) || [v.videoWidth, v.videoHeight];
      const cv = document.createElement('canvas');
      cv.width = w[0]; cv.height = w[1];
      const g = cv.getContext('2d');
      g.imageSmoothingEnabled = false;
      g.drawImage(v, 0, 0, cv.width, cv.height);
      try { attachments.push(cv.toDataURL('image/png')); at = ` The attached frame is at ${r1(v.currentTime)} s.`; } catch {}
    }
    openRequestDialog(this.app, {
      scope: this.pid, kind: 'promo', title: `Clip "${c.clip.title}": `,
      dialogTitle: `Ask the AI about the clip "${c.clip.title}"`,
      body: `About the clip ${c.file}${c.render ? ` (last render ${c.render.mp4}, ${timeAgo(c.render.at)})` : ''}.${at}\n\n`,
      attachments,
    });
  }

  newClip() {
    const p = this.app.project;
    if (!p) return;
    let aspect = '9:16';
    const what = h('textarea.input', { rows: 5, autofocus: true, placeholder: 'e.g. The knight dashing through the moss cave, then a close-up of the boss. End on the title.' });
    const name = h('input.input', { placeholder: 'e.g. boss-reveal (optional)', maxlength: 48 });
    const length = h('input.input', { type: 'number', value: 15, min: 3, max: 180, step: 1, style: { width: '90px' } });
    const music = h('input.input', { list: 'clip-songs-new', placeholder: 'No music', maxlength: 96 });
    const seg = h('div.seg', null, ASPECTS.map(([v, l, sub]) => h(`button${v === aspect ? '.on' : ''}`, { type: 'button', onclick: (e) => { aspect = v; seg.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b === e.currentTarget)); } }, l, h('span.dim', null, sub))));
    modal({
      title: `New clip of ${p.name}`,
      wide: true,
      body: h('div.col', { style: { gap: '14px' } },
        field('What should the video show?', what, 'A moment, a feature, a feeling, a video you liked. The AI writes the recipe and the shot, probes it, and renders it.'),
        h('div.form-grid', null,
          h('div.full', null, group('Shape', seg)),
          field('Length (seconds)', length),
          field('Music', h('div', null, music, h('datalist', { id: 'clip-songs-new' }, this.songs.map((s) => h('option', { value: s.id }, s.name))))),
          h('div.full', null, field('Name', name, 'Lowercase words and dashes; the AI picks one if you leave it empty.')))),
      actions: [
        { label: 'Cancel' },
        {
          label: 'Ask the AI', kind: 'primary', ico: 'send',
          fn: async (m) => {
            const text = what.value.trim();
            if (!text) { what.focus(); toast('Say what the video should show', { kind: 'warn' }); return false; }
            const slug = name.value.trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48);
            const secs = Math.max(3, Math.min(180, Number(length.value) || 15));
            m.setBusy(true);
            try {
              const r = await window.studio.requests.create(p.id, {
                kind: 'promo', assignee: 'ai',
                title: `New clip: ${text.split('\n')[0].slice(0, 80)}`,
                body: [
                  `A new promo clip for ${p.name}, asked for in the Clips view. Follow skill promo (.agents/skills/promo/SKILL.md).`,
                  '', 'What it should show:', text, '',
                  `Shape ${aspect} · about ${secs} s · music: ${music.value.trim() || 'none'}${slug ? ` · name it "${slug}"` : ''}`,
                  `Write games/${p.id}/clips/<name>.clip.json and its shot script, probe and look at the stills, render, then mark this done — it shows up in the Clips view.`,
                ].join('\n'),
              });
              toast('Request saved — the AI will see it in the inbox.', { kind: 'ok', action: { label: 'Copy prompt', fn: () => copyText(requestPrompt(r, p)).then(() => toast('Prompt copied — paste it into your AI chat.', { kind: 'ok' })) } });
              return true;
            } catch (err) { m.setBusy(false); toast(err.message, { kind: 'error' }); return false; }
          },
        },
      ],
    });
  }
}
