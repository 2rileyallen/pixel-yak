// studio/ui/js/views/art.js — the Art workspace: browse every asset of the active project, paint
// any frame, add/hold/reorder frames, preview animations, save (→ edits the game reads live),
// bake, revert, and ask the AI about a frame. Every save also becomes a style lesson.
import { h, mount, btn, iconBtn, toast, confirmDialog, popMenu, copyText, isTyping, timeAgo, topModal } from '../ui.js';
import { icon } from '../icons.js';
import { PixelEditor } from '../canvas-editor.js';
import { makePalette, ColorTable, Grid, gridFromRgba, rgbaHash, applyPoseEdit, drawThumb, gridCanvas, usedColors, translateGrid } from '../pixels.js';
import { effectivePoses, effectiveAnims, hexToRef, summarizeEdit } from '../../../../engine/art/edits.js';
import { emptyEdit, encodeForSave } from '../edit-file.js';
import { buildLesson, describe } from '../lessons.js';
import { openRequestDialog } from '../request-dialog.js';
import { openPropagate } from '../propagate-dialog.js';
import * as P from '../prompts.js';

const TOOLS = [
  ['pencil', 'Pencil', 'B'], ['eraser', 'Eraser', 'E'], ['fill', 'Fill (Shift: every pixel of that color)', 'G'], ['picker', 'Pick color (or Alt+click)', 'I'],
  ['line', 'Line (Shift: 45° snap)', 'L'], ['rect', 'Rectangle (Shift: filled)', 'U'], ['shade', 'Shade: lighten · right-click/Shift darkens', 'D'], ['select', 'Select & move (Ctrl+C/V, Del, arrows)', 'M'],
];
const TOOL_KEYS = Object.fromEntries(TOOLS.map(([id, , k]) => [k.toLowerCase(), id]));
const BGS = [['checker', 'Checker'], ['dark', 'Navy'], ['mid', 'Grey'], ['light', 'Light'], ['black', 'Black']];
const ls = {
  get: (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

const frameDirty = (fr) => !!fr && (fr.isNew || fr.forceBake || fr.unbake || !fr.grid.equals(fr.saved));
const statusOf = (pe, raw) => (pe ? (pe.mode === 'baked' ? (raw ? 'baked' : 'added') : 'patch') : 'gen');
const NO_EDITS = Object.freeze({ edited: false, baked: false, added: 0, changed: 0, anyEdit: false });

export class ArtView {
  constructor(app) {
    this.app = app;
    this.el = h('section.view.art');
    this.project = null;
    this.host = null;
    this.listing = null;
    this.summary = {};
    this.sessions = new Map();
    this.session = null;
    this.thumbs = new Map();
    this.editCache = new Map();
    this.filter = { q: '', cat: 'all', status: 'all' };
    this.recent = []; // palette refs, newest first
    this.colorRef = undefined; // ref of the current color (null = transparent); undefined = not chosen yet
    this.playing = false;
    this.fps = 6;
    this.build();
    window.addEventListener('keydown', (e) => this.onKey(e));
    window.addEventListener('keyup', (e) => { if (e.key.toLowerCase() === 'c' && this.compareHeld) { this.compareHeld = false; this.editor.setOpt('compare', false); this.updateBanner(); } });
  }

  // ================================================================ layout ===
  build() {
    // browser
    // debounced: typing a word re-filters once, not once per letter
    this.search = h('input.input', {
      type: 'search', placeholder: 'Search assets, ids, tags…',
      oninput: (e) => { this.filter.q = e.target.value.trim().toLowerCase(); clearTimeout(this._qT); this._qT = setTimeout(() => this.renderList(), 140); },
      onkeydown: (e) => { if (e.key === 'Enter') this.flushSearch(); },
    });
    this.catChips = h('div.chips');
    this.statusChips = h('div.chips');
    this.list = h('div.asset-list', { role: 'listbox', 'aria-label': 'Assets' });
    this.browserFoot = h('div.browser-foot');
    this.browser = h('aside.browser', null,
      h('div.browser-head', null, h('div.search', null, icon('search'), this.search), this.catChips, this.statusChips),
      this.list, this.browserFoot);

    // toolbar
    this.toolBtns = {};
    const toolGroup = h('div.tool-group', null, TOOLS.map(([id, label, key]) => (this.toolBtns[id] = iconBtn(id, `${label} (${key})`, () => this.setTool(id)))));
    this.optBtns = {
      mirror: iconBtn('mirror', 'Mirror X — paint both halves (X)', () => this.toggleOpt('mirror')),
      pixelPerfect: iconBtn('pp', 'Pixel-perfect strokes: freehand lines drop L-shaped corners (P)', () => this.toggleOpt('pixelPerfect')),
      grid: iconBtn('grid', 'Pixel grid (#)', () => this.toggleOpt('grid')),
      onion: iconBtn('onion', 'Onion skin: previous (red) / next (teal) frame (O)', () => this.toggleOpt('onion')),
      diff: iconBtn('diff', 'Highlight your changes vs. the AI version (V)', () => this.toggleOpt('diff')),
      compare: iconBtn('compare', 'Show the AI-generated version (hold C)', () => this.toggleOpt('compare')),
    };
    this.zoomVal = h('span.zoom-val', null, '8x');
    this.undoBtn = iconBtn('undo', 'Undo (Ctrl+Z)', () => { this.editor.undo(); this.afterHistory(); });
    this.redoBtn = iconBtn('redo', 'Redo (Ctrl+Y)', () => { this.editor.redo(); this.afterHistory(); });
    this.bgBtn = iconBtn('frames', 'Canvas background', (e) => popMenu(e.currentTarget, BGS.map(([k, l]) => ({ label: l, active: this.editor.opts.bg === k, fn: () => { this.editor.setOpt('bg', k); ls.set('ps.canvasBg', k); } }))));
    this.toolbar = h('div.toolbar', null,
      toolGroup, h('span.sep'), this.optBtns.mirror, this.optBtns.pixelPerfect, h('span.sep'), this.undoBtn, this.redoBtn, h('span.sep'),
      iconBtn('zoomout', 'Zoom out (−)', () => this.editor.zoomStep(-1)), this.zoomVal, iconBtn('zoomin', 'Zoom in (+)', () => this.editor.zoomStep(1)),
      iconBtn('fit', 'Fit to view (0)', () => this.editor.fit()), iconBtn('refresh', "Reload this game's art from disk (F5) — normally automatic", () => this.reloadArt('manual')), h('span.sep'),
      this.optBtns.grid, this.optBtns.onion, this.optBtns.diff, this.optBtns.compare, this.bgBtn);

    // stage
    this.stage = h('div.stage', { tabIndex: 0 });
    this.hud = h('div.stage-hud');
    this.banner = h('div.stage-banner');
    this.stageEmpty = h('div.stage-empty');
    this.stage.append(this.hud, this.banner, this.stageEmpty);
    this.editor = new PixelEditor(this.stage, {
      onChange: () => this.frameEdited(),
      onPick: (v) => { this.setColor(v); },
      onHover: (hv) => this.updateHud(hv),
      onZoom: (z) => { this.zoomVal.textContent = `${z}x`; },
      onTool: (t) => this.setTool(t, true),
    });
    const prefs = ls.get('ps.editorOpts', {});
    for (const k of ['grid', 'onion', 'diff', 'mirror', 'pixelPerfect']) if (k in prefs) this.editor.setOpt(k, prefs[k]);
    this.editor.setOpt('bg', ls.get('ps.canvasBg', 'checker'));

    // timeline
    this.animSel = h('select.input', { title: 'Animation', onchange: (e) => this.setAnim(e.target.value) });
    this.playBtn = iconBtn('play', 'Play / pause (Enter)', () => this.togglePlay());
    this.fpsInput = h('input.input', { type: 'number', min: 1, max: 30, value: 6, title: 'Preview speed (frames per second)', style: { width: '58px' }, onchange: (e) => { this.fps = Math.max(1, Math.min(30, +e.target.value || 6)); this.restartPreview(); } });
    this.frameOps = h('div.row', { style: { gap: '4px' } });
    this.previewScale = 0;
    this.previewBg = ls.get('ps.previewBg', 'checker');
    this.previewCanvas = h('canvas');
    this.previewInfo = h('span.dim', { style: { fontSize: '11.5px' } });
    this.frames = h('div.frames');
    this.timeline = h('div.timeline', null,
      h('div.tl-head', null, icon('film'), this.animSel, this.playBtn, h('span.dim', null, 'fps'), this.fpsInput, h('span.sep', { style: { width: '1px', height: '20px', background: 'var(--line2)', margin: '0 4px' } }), this.frameOps, h('div.grow'),
        iconBtn('prev', 'Previous frame ([)', () => this.stepFrame(-1)), iconBtn('next', 'Next frame (])', () => this.stepFrame(1))),
      h('div.tl-body', null, this.frames,
        h('div.preview-box', null,
          h('div.preview', { title: 'Live preview (unsaved work included)' }, this.previewCanvas),
          h('div.row', { style: { justifyContent: 'space-between' } }, this.previewInfo,
            iconBtn('frames', 'Preview background', (e) => this.previewBgMenu(e.currentTarget))))));

    this.center = h('section.center', null, this.toolbar, this.stage, this.timeline);

    // inspector
    this.inspScroll = h('div.insp-scroll');
    this.noteInput = h('input.input', { placeholder: 'What did you change and why? (teaches the AI)', maxlength: 300, onkeydown: (e) => { if (e.key === 'Enter') this.save(); } });
    this.saveState = h('div');
    this.saveBtn = btn('Save', () => this.save(), { kind: 'primary', ico: 'save', title: 'Save (Ctrl+S) — the game picks it up live' });
    this.moreBtn = iconBtn('chevron', 'More: bake, revert, files', (e) => this.moreMenu(e.currentTarget));
    this.saveBar = h('div.save-bar', null, this.saveState, this.noteInput, h('div.row', null, h('div.grow', null, this.saveBtn), this.moreBtn));
    this.saveBtn.style.width = '100%';
    this.inspector = h('aside.inspector', null, this.inspScroll, this.saveBar);

    mount(this.el, this.browser, this.center, this.inspector);
    this.setTool('pencil');
    this.syncOptBtns();
    // thumbnails render when their row comes near the viewport (rows are observed, not thumbs:
    // off-screen rows skip rendering their contents — content-visibility in studio.css)
    this.io = new IntersectionObserver((entries) => {
      for (const en of entries) {
        if (!en.isIntersecting) continue;
        this.io.unobserve(en.target);
        en.target._thumbWanted = false;
        this.renderThumb(en.target.dataset.asset, en.target.querySelector('.thumb'));
      }
    }, { root: this.list, rootMargin: '200px' });
  }

  flushSearch() { if (this._qT) { clearTimeout(this._qT); this._qT = null; this.renderList(); } }

  // ============================================================== project ===
  async setProject(project, host) {
    this.stopPreview();
    this.project = project;
    this.host = host;
    this.listing = null;
    this.sessions = new Map();
    this.session = null;
    this.thumbs.clear();
    this.editCache.clear();
    this.rows = new Map();
    this.filter = { q: '', cat: 'all', status: 'all' };
    this.search.value = '';
    // colors are palette references; another game has another palette
    this.colorRef = undefined;
    this.recent = [];
    this.renderEmptyStage('Loading art…', `Running ${project.assetsPath}`);
    this.list.replaceChildren(h('div.empty', null, h('p', null, 'Loading assets…')));
    this.renderInspector();
    await this.loadListing({ initial: true });
  }

  async loadListing({ initial = false, reason = null } = {}) {
    const pid = this.project.id;
    // remember what the open asset's generator drew, to tell the user what changed
    const openId = this.session && this.session.asset.id;
    const before = openId ? new Map([...this.session.frames].map(([p, f]) => [p, f.rawHash])) : null;
    let listing;
    try {
      await this.host.readyPromise;
      listing = await this.host.list();
    } catch (err) {
      listing = { failed: true, errors: [err.message], assets: [], categories: [], meta: null };
    }
    if (!this.project || this.project.id !== pid) return;
    const prevIds = new Set((this.listing && this.listing.assets || []).map((a) => a.id));
    // the files the art host loaded (recorded by the main process as it served them)
    listing.modules = new Set(await window.studio.projects.artFiles(pid).catch(() => []));
    this.listing = listing;
    this.artReloads = (this.artReloads || 0) + (initial ? 0 : 1);
    this.meta = listing.meta;
    this.pal = makePalette(listing.meta && listing.meta.palette);
    this.paletteMode = listing.meta && listing.meta.palette ? 'materials' : 'colors';
    this.byId = new Map(listing.assets.map((a) => [a.id, a]));
    this.indexListing();
    this.summary = await window.studio.edits.list(pid).catch(() => ({}));
    // "new" = ids not seen before in this project (first visit: everything counts as seen)
    const seenKey = `ps.seen.${pid}`;
    let seen = ls.get(seenKey, null);
    if (!seen) { seen = listing.assets.map((a) => a.id); ls.set(seenKey, seen); }
    this.seen = new Set(seen);
    if (reason === 'code' && !listing.failed) {
      const added = listing.assets.filter((a) => !prevIds.has(a.id)).map((a) => a.id);
      if (added.length && prevIds.size) toast(`${added.length} new asset${added.length > 1 ? 's' : ''} in ${this.project.name}: ${added.slice(0, 4).join(', ')}${added.length > 4 ? '…' : ''}`, { kind: 'live', action: { label: 'Show', fn: () => this.selectAsset(added[0]) } });
    }
    this.thumbs.clear();
    this.rows = new Map(); // assets may have new names/sizes: rows are rebuilt as they're shown
    this.renderChips();
    this.renderList();
    if (listing.failed) { this.renderLoadError(); return; }
    // other assets visited earlier: drop clean ones (they rebuild when opened), refresh unsaved ones
    for (const [id, sess] of [...this.sessions]) {
      if (id === openId) continue;
      if (!this.byId.has(id) || !this.sessionDirty(sess)) this.sessions.delete(id);
      else await this.reloadSession(id, { keepUnsaved: true });
    }
    // keep / restore the selection
    if (this.session && this.byId.has(this.session.asset.id)) {
      await this.reloadSession(this.session.asset.id, { keepUnsaved: true });
      if (reason && before && this.session && this.session.asset.id === openId) this.announceChanges(before, reason);
    } else {
      const want = ls.get(`ps.sel.${pid}`, null);
      const first = listing.assets.find((a) => a.kind === 'visual');
      const pick = want && this.byId.has(want.asset) ? want : first ? { asset: first.id } : null;
      if (pick) await this.selectAsset(pick.asset, { pose: pick.pose, anim: pick.anim });
      else this.renderNoArt();
    }
    this.app.updateCounts?.();
  }

  // Does any of these code/style changes touch a file the art host loaded (its module graph)?
  // Game code (sim, data, scenes, tests) never does, so it never reloads the art.
  touchesArt(changes) {
    const mods = this.listing && !this.listing.failed && this.listing.modules;
    // graph unknown (art failed to load, or an older host): any code change of this game retries
    if (!mods || !mods.size) return changes.some((c) => c.kind === 'code');
    for (const c of changes) {
      if (c.more) return true;
      for (const f of (c.files && c.files.length ? c.files : [c.file])) if (f && mods.has(f)) return true; // repo-relative paths
    }
    return false;
  }

  // Called by the app when files change on disk.
  async onFsChange(changes) {
    if (!this.project) return;
    const pid = this.project.id;
    const code = changes.filter((c) => (c.kind === 'code' && (c.project === pid || c.project === '*')) || c.kind === 'styles');
    const edits = changes.some((c) => (c.kind === 'edits' || c.kind === 'edits-index') && c.project === pid);
    if (code.length && this.touchesArt(code)) {
      await this.reloadArt('code');
      return;
    }
    if (code.some((c) => c.kind === 'code')) this.app.logActivity?.('Code changed outside the art (game code, tests, docs) → art not reloaded', 'studio');
    // request badges (the app re-indexed requests already); only rows whose count changed rebuild
    if (!edits && changes.some((c) => c.kind === 'requests' && c.project === pid)) { this.renderChips(); this.renderList(); }
    if (edits) await this.onEditsChanged(changes.filter((c) => c.kind === 'edits' && c.project === pid));
  }

  // Edit files changed on disk (an AI, the CLI, or our own save echoing back). Only the named
  // assets are re-read; a cut-short change list falls back to re-reading everything.
  async onEditsChanged(changes) {
    const pid = this.project.id;
    const named = new Set();
    let all = false;
    for (const c of changes) {
      if (c.more) all = true;
      for (const f of c.files && c.files.length ? c.files : [c.file]) { const m = /([^/]+)\.json$/.exec(f || ''); if (m) named.add(m[1]); }
    }
    if (!all && !named.size) return; // only the generated index.js changed: nothing the studio reads
    if (all) {
      this.summary = await window.studio.edits.list(pid).catch(() => this.summary);
      this.editCache.clear();
      this.thumbs.clear();
    }
    const ids = all ? [...this.sessions.keys()] : [...named].filter((id) => id !== this.savingId);
    for (const id of ids) {
      if (this.savingId === id) continue;
      const disk = await window.studio.edits.read(pid, id).catch(() => null);
      if (!all) {
        if (disk) this.summary[id] = summarizeEdit(disk); else delete this.summary[id];
        this.editCache.delete(id);
        this.thumbs.delete(id);
      }
      // reload a clean session, warn on a dirty one
      const s = this.sessions.get(id);
      if (!s) continue;
      if (JSON.stringify(disk || null) === s.diskText) continue;
      if (this.sessionDirty(s)) { toast(`${id}: its edit file changed on disk. Your unsaved work is kept — saving will overwrite the disk version.`, { kind: 'warn', timeout: 8000 }); continue; }
      if (this.session && this.session.asset.id === id) await this.reloadSession(id);
      else this.sessions.delete(id);
    }
    this.renderChips();
    this.renderList();
  }

  // Re-run the project's art code (new iframe = fresh modules). Overlapping requests are
  // folded into one follow-up reload, so a burst of file changes never stacks reloads.
  async reloadArt(reason = 'manual') {
    if (!this.project || !this.host) return;
    if (this._reloading) { this._reloadAgain = reason; return this._reloading; }
    this._reloading = (async () => {
      try {
        await this.host.start().catch(() => {});
        await this.loadListing({ reason });
        if (reason === 'manual' && this.listing && !this.listing.failed && !this._announced) toast('Art reloaded from disk — nothing changed.', { kind: 'ok', timeout: 1800 });
      } finally {
        this._announced = false;
        this._reloading = null;
      }
      if (this._reloadAgain) { const again = this._reloadAgain; this._reloadAgain = null; await this.reloadArt(again); }
    })();
    return this._reloading;
  }

  // Tell the user which frames of the open asset changed underneath them, and flash them.
  announceChanges(before, reason) {
    const s = this.session;
    const changed = [...s.frames].filter(([p, f]) => before.has(p) && before.get(p) !== f.rawHash).map(([p]) => p);
    if (!changed.length) {
      if (reason === 'code') this.app.logActivity?.(`Art code changed → reloaded; ${s.asset.id} looks the same`, 'studio');
      return;
    }
    this._announced = true;
    const covered = changed.filter((p) => { const f = s.frames.get(p); return frameDirty(f) || f.status !== 'gen'; });
    toast(`${reason === 'manual' ? 'Reloaded' : 'Updated from the code'}: ${s.asset.name} — ${changed.join(', ')}${covered.length ? `. Your edits on ${covered.join(', ')} stay on top (Revert frame shows the new version).` : ''}`, { kind: 'live', timeout: 7000 });
    this.app.logActivity?.(`Art code changed → ${s.asset.id}: ${changed.join(', ')} updated`, 'studio');
    for (const p of changed) {
      this.frames.querySelectorAll(`.frame[data-pose="${CSS.escape(p)}"]`).forEach((el) => { el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); });
    }
  }

  // ============================================================== browser ===
  // Built once per listing: the display order and a lowercase search text per asset.
  indexListing() {
    const order = new Map((this.listing.categories || []).map((c, i) => [c.id, i]));
    const rank = (a) => (order.has(a.category) ? order.get(a.category) : 1000);
    this.sorted = this.listing.assets.slice().sort((a, b) => rank(a) - rank(b) || (a.order ?? 0) - (b.order ?? 0));
    this.hay = new Map(this.sorted.map((a) => [a.id, [a.id, a.name, ...(a.tags || [])].join('\n').toLowerCase()]));
  }

  // Edit flags live on the summary entry, which is replaced whenever that asset's edits change —
  // so they're computed once per change, and the rest is O(1) lookups.
  editFlags(id) {
    const s = this.summary[id];
    if (!s) return NO_EDITS;
    if (!s._flags) {
      const poses = Object.values(s.poses);
      s._flags = {
        edited: poses.some((p) => p.mode === 'patch'),
        baked: poses.some((p) => p.mode === 'baked' && !p.added),
        added: poses.filter((p) => p.added).length,
        changed: poses.reduce((n, p) => n + (p.changed || 0), 0),
        anyEdit: poses.length > 0,
      };
    }
    return s._flags;
  }

  flag(a, k) {
    if (k === 'isNew') return !this.seen.has(a.id);
    if (k === 'requests') return this.app.openRequestCount(this.project.id, a.id);
    if (k === 'dirty') { const sess = this.sessions.get(a.id); return !!sess && this.sessionDirty(sess); }
    return this.editFlags(a.id)[k];
  }

  assetFlags(a) {
    const sess = this.sessions.get(a.id);
    return {
      ...this.editFlags(a.id),
      isNew: !this.seen.has(a.id),
      dirty: !!sess && this.sessionDirty(sess),
      requests: this.app.openRequestCount(this.project.id, a.id),
    };
  }

  renderChips() {
    const assets = this.listing ? this.listing.assets : [];
    const counts = {};
    for (const a of assets) counts[a.category] = (counts[a.category] || 0) + 1;
    const cats = [{ id: 'all', label: 'All' }, ...(this.listing.categories || []).filter((c) => c.id !== 'all' && counts[c.id])];
    for (const c of Object.keys(counts)) if (!cats.some((x) => x.id === c)) cats.push({ id: c, label: c });
    mount(this.catChips, cats.map((c) => h(`button.chip${this.filter.cat === c.id ? '.on' : ''}`, {
      type: 'button', title: c.label, onclick: () => { this.filter.cat = c.id; this.renderChips(); this.renderList(); },
    }, shortCat(c), h('span.n', null, c.id === 'all' ? assets.length : counts[c.id] || 0))));
    const n = { anyEdit: 0, baked: 0, isNew: 0, requests: 0 };
    for (const a of assets) for (const k in n) if (this.flag(a, k)) n[k]++;
    const st = [['all', 'Everything'], ['anyEdit', `Edited ${n.anyEdit}`], ['baked', `Baked ${n.baked}`], ['isNew', `New ${n.isNew}`], ['requests', `Requests ${n.requests}`]];
    mount(this.statusChips, st.map(([k, l]) => h(`button.chip${this.filter.status === k ? '.on' : ''}`, { type: 'button', onclick: () => { this.filter.status = k; this.renderChips(); this.renderList(); } }, l)));
  }

  visibleAssets() {
    const { q, cat, status } = this.filter;
    if (!this.listing) return [];
    if (!this.sorted) this.indexListing();
    return this.sorted.filter((a) => (cat === 'all' || a.category === cat) && (status === 'all' || this.flag(a, status)) && (!q || this.hay.get(a.id).includes(q)));
  }

  // One row per asset, built once and reused while its badges stay the same; filtering only
  // re-orders existing rows (and off-screen rows skip rendering — content-visibility).
  rowFor(a, sel) {
    const f = this.assetFlags(a);
    const on = a.id === sel;
    const sig = `${on}|${f.dirty}|${f.isNew}|${f.edited}|${f.changed}|${f.baked}|${f.added}|${f.requests}`;
    const old = this.rows.get(a.id);
    if (old && old._sig === sig) return old;
    const thumb = (old && old.querySelector('.thumb')) || h(`div.thumb${a.kind === 'audio' ? '.audio' : ''}`, null, a.kind === 'audio' ? icon('sound') : null);
    const tags = [
      f.dirty ? h('span.tag.fire', null, 'unsaved') : null,
      f.isNew ? h('span.tag.teal', null, 'new') : null,
      f.edited ? h('span.tag.gold', null, `edited ${f.changed ? f.changed + 'px' : ''}`) : null,
      f.baked ? h('span.tag.orchid', null, 'baked') : null,
      f.added ? h('span.tag.teal', null, `+${f.added} fr`) : null,
      f.requests ? h('span.tag.sky', null, `${f.requests} req`) : null,
    ].filter(Boolean);
    const row = h(`div.asset-item${on ? '.on' : ''}`, {
      role: 'option', 'aria-selected': on ? 'true' : 'false', title: a.description || a.name, dataset: { asset: a.id },
      onclick: () => this.selectAsset(a.id),
    }, thumb, h('div.meta', null, h('div.name', null, a.name), h('div.id', null, a.kind === 'audio' ? a.id : `${a.id} · ${a.fw}×${a.fh}`), tags.length ? h('div.tags', null, tags) : null));
    row._sig = sig;
    if (old) { this.io.unobserve(old); old.replaceWith(row); }
    this.rows.set(a.id, row);
    return row;
  }

  // Show the cached thumbnail, or render it lazily when the row comes into view.
  syncThumb(a, row) {
    if (a.kind === 'audio') return;
    const c = this.thumbs.get(a.id);
    const el = row.querySelector('.thumb');
    if (c) { if (el.firstChild !== c) el.replaceChildren(c); return; }
    if (!row._thumbWanted) { row._thumbWanted = true; this.io.observe(row); }
  }

  renderList() {
    if (!this.listing) return;
    this._qT = null;
    const assets = this.visibleAssets();
    const sel = this.session && this.session.asset.id;
    if (!this.rows) this.rows = new Map();
    if (!this.groupEls) this.groupEls = new Map();
    const items = [];
    let lastCat = null;
    for (const a of assets) {
      if (this.filter.cat === 'all' && a.category !== lastCat) {
        lastCat = a.category;
        let g = this.groupEls.get(a.category);
        if (!g) this.groupEls.set(a.category, (g = h('div.asset-group', null, catLabel(this.listing, a.category))));
        items.push(g);
      }
      const row = this.rowFor(a, sel);
      this.syncThumb(a, row);
      items.push(row);
    }
    if (!assets.length) items.push(h('div.empty', null, h('p', null, this.listing.assets.length ? 'Nothing matches this filter.' : 'No assets yet.')));
    // same rows in the same order → leave the DOM alone
    const kids = this.list.children;
    const same = kids.length === items.length && items.every((el, i) => kids[i] === el);
    if (!same) this.list.replaceChildren(...items);
    const all = this.listing.assets;
    const withEdits = Object.keys(this.summary).length;
    if (this._footKey !== `${all.length}|${withEdits}`) {
      this._footKey = `${all.length}|${withEdits}`;
      mount(this.browserFoot, h('span', null, `${all.length} assets`), h('span.dim', null, '·'), h('span', null, `${withEdits} with edits`), h('div.grow'),
        iconBtn('refresh', 'Reload this project\'s art code', async () => { await this.host.start().catch(() => {}); await this.loadListing({ reason: 'code' }); toast('Art reloaded', { kind: 'ok', timeout: 1500 }); }));
    }
    const on = sel && this.rows.get(sel);
    if (on && on.isConnected && this._scrolledTo !== sel) { on.scrollIntoView({ block: 'nearest' }); this._scrolledTo = sel; }
  }

  async renderThumb(id, el) {
    const a = this.byId.get(id);
    if (!a || a.kind === 'audio' || !el) return;
    try {
      const sess = this.sessions.get(id);
      let grid, table;
      const pose = firstPose(a);
      if (sess) { table = sess.table; const fr = sess.frames.get(sess.anims[a.defaultAnim]?.[0] || sess.poses[0]); grid = fr && fr.grid; }
      if (!grid) {
        table = new ColorTable(this.pal);
        const r = (await this.host.raw(id, [pose])).get(pose);
        if (!r || !r.rgba) return;
        grid = gridFromRgba(r.w, r.h, r.rgba, table);
        if (this.summary[id] && this.summary[id].poses[pose]) {
          let ed = this.editCache.get(id);
          if (!ed) { ed = await window.studio.edits.read(this.project.id, id).catch(() => null); this.editCache.set(id, ed); }
          if (ed && ed.poses && ed.poses[pose]) grid = applyPoseEdit(grid, ed.poses[pose], ed.legend, table);
        }
      }
      const c = h('canvas');
      drawThumb(c, grid, table, { box: 42 });
      this.thumbs.set(id, c);
      el.replaceChildren(c);
    } catch { /* thumbnail is best-effort */ }
  }

  refreshThumb(id) {
    this.thumbs.delete(id);
    const row = this.rows && this.rows.get(id);
    if (row && row.isConnected) this.renderThumb(id, row.querySelector('.thumb'));
  }

  // ============================================================== sessions ===
  async selectAsset(id, { pose = null, anim = null } = {}) {
    const a = this.byId && this.byId.get(id);
    if (!a) return;
    this.editor.commitFloat();
    if (!this.seen.has(id)) { this.seen.add(id); ls.set(`ps.seen.${this.project.id}`, [...this.seen]); }
    this.stopPreview();
    if (a.kind === 'audio') { this.session = null; ls.set(`ps.sel.${this.project.id}`, { asset: id }); this.renderAudio(a); this.renderList(); this.renderInspector(); return; }
    let s = this.sessions.get(id);
    if (!s) {
      this.renderEmptyStage('Loading frames…', a.name);
      try { s = await this.loadSession(a); } catch (err) { this.renderEmptyStage('Could not render this asset', err.message, true); return; }
      this.sessions.set(id, s);
    }
    this.session = s;
    if (anim && (anim === '*' || s.anims[anim])) s.animSel = anim;
    if (pose && s.poses.includes(pose)) { s.pose = pose; s.seqIndex = Math.max(0, this.sequence().indexOf(pose)); }
    this._scrolledTo = null;
    this.stageEmpty.replaceChildren();
    this.showPose(s.pose, { fit: true });
    this.renderList();
    this.renderTimeline();
    this.renderInspector();
    this.startPreview();
  }

  async loadSession(a) {
    const pid = this.project.id;
    const disk = await window.studio.edits.read(pid, a.id).catch(() => null);
    const edit = disk ? JSON.parse(JSON.stringify(disk)) : emptyEdit(pid, a);
    const table = new ColorTable(this.pal);
    const poses = effectivePoses(a.poses, edit);
    const anims = effectiveAnims(a.anims, edit);
    const rawMap = await this.host.raw(a.id, a.poses);
    const frames = new Map();
    for (const pose of poses) frames.set(pose, this.makeFrame(a, pose, rawMap.get(pose), edit, table));
    const animSel = anims[a.defaultAnim] ? a.defaultAnim : Object.keys(anims)[0] || '*';
    const seq = animSel === '*' ? poses : anims[animSel];
    return {
      asset: a, edit, diskText: JSON.stringify(disk || null), table, poses, anims, genAnims: a.anims, frames,
      removed: new Set(), metaDirty: false, animSel, pose: seq[0] || poses[0], seqIndex: 0,
    };
  }

  makeFrame(a, pose, r, edit, table) {
    const raw = r && r.rgba ? gridFromRgba(r.w, r.h, r.rgba, table) : null;
    const rawHash = r && r.rgba ? rgbaHash(r.w, r.h, r.rgba) : null;
    const pe = edit.poses && edit.poses[pose];
    const w = raw ? raw.w : a.fw, hh = raw ? raw.h : a.fh;
    const grid = pe ? applyPoseEdit(raw || new Grid(w, hh), pe, edit.legend, table) : raw ? raw.clone() : new Grid(w, hh);
    return {
      pose, raw, rawHash, grid, saved: grid.clone(), undo: [], redo: [],
      status: statusOf(pe, raw), drift: !!(pe && pe.mode === 'patch' && pe.base && rawHash && pe.base !== rawHash),
      error: r && r.error ? r.error : (!raw && !pe ? 'the generator returned nothing for this pose' : null),
      sizeWarn: raw && a.fw && (raw.w !== a.fw || raw.h !== a.fh) ? `generator returns ${raw.w}×${raw.h}, contract says ${a.fw}×${a.fh}` : null,
      after: pe && pe.after, from: pe && pe.from, viaSaved: pe && pe.via ? pe.via : null,
    };
  }

  // Re-render a session from disk + fresh generator output; keepUnsaved keeps painted grids.
  async reloadSession(id, { keepUnsaved = false } = {}) {
    const old = this.sessions.get(id);
    const a = this.byId.get(id);
    if (!a) { this.sessions.delete(id); return; }
    const s = await this.loadSession(a);
    if (keepUnsaved && old) {
      // every grid in a session shares ONE color table: re-index kept work into the new one
      const tr = (g) => translateGrid(g, old.table, s.table);
      for (const [pose, fr] of old.frames) {
        if (!frameDirty(fr)) continue;
        let nf = s.frames.get(pose);
        if (!nf) {
          nf = { ...fr, raw: null, rawHash: null, status: 'added' };
          s.frames.set(pose, nf);
          if (!s.poses.includes(pose)) { const at = s.poses.indexOf(fr.after); s.poses.splice(at < 0 ? s.poses.length : at + 1, 0, pose); }
        }
        nf.grid = tr(fr.grid);
        nf.undo = fr.undo.map(tr);
        nf.redo = fr.redo.map(tr);
        if (fr.isNew) { nf.isNew = true; nf.saved = tr(fr.saved); }
        nf.forceBake = fr.forceBake; nf.unbake = fr.unbake;
      }
      if (old.metaDirty) { s.anims = old.anims; s.metaDirty = true; }
      s.removed = old.removed;
      s.animSel = old.animSel; s.pose = s.poses.includes(old.pose) ? old.pose : s.pose; s.seqIndex = old.seqIndex;
    }
    this.sessions.set(id, s);
    if (this.session && this.session.asset.id === id) {
      this.session = s;
      this.showPose(s.pose);
      this.renderTimeline();
      this.renderInspector();
      this.restartPreview();
    }
  }

  sessionDirty(s) { return !!s && (s.metaDirty || s.removed.size > 0 || [...s.frames.values()].some(frameDirty)); }
  dirtySessions() { return [...this.sessions.values()].filter((s) => this.sessionDirty(s)); }

  sequence() {
    const s = this.session;
    if (!s) return [];
    return s.animSel === '*' ? s.poses : (s.anims[s.animSel] || s.poses);
  }

  currentFrame() { return this.session && this.session.frames.get(this.session.pose); }

  showPose(pose, { fit = false } = {}) {
    const s = this.session;
    if (!s) return;
    const fr = s.frames.get(pose);
    if (!fr) return;
    s.pose = pose;
    ls.set(`ps.sel.${this.project.id}`, { asset: s.asset.id, pose, anim: s.animSel });
    const seq = this.sequence();
    const i = s.seqIndex != null && seq[s.seqIndex] === pose ? s.seqIndex : seq.indexOf(pose);
    s.seqIndex = Math.max(0, i);
    const prev = seq.length > 1 ? s.frames.get(seq[(s.seqIndex - 1 + seq.length) % seq.length]) : null;
    const next = seq.length > 1 ? s.frames.get(seq[(s.seqIndex + 1) % seq.length]) : null;
    fr.table = s.table;
    fr.ax = s.asset.ax ?? null; fr.ay = s.asset.ay ?? null;
    fr.prev = prev && prev !== fr ? prev.grid : null;
    fr.next = next && next !== fr ? next.grid : null;
    this.editor.setFrame(fr, { fit });
    this.editor.onionChanged();
    if (this.colorRef === undefined) this.pickDefaultColor();
    else this.editor.setColor(this.colorRef == null ? 0 : s.table.idx(this.colorRef));
    this.renderCurColor();
    this.updateBanner();
    this.updateHud(null);
    this.updateUndo();
  }

  stepFrame(d) {
    const s = this.session;
    if (!s) return;
    const seq = this.sequence();
    if (!seq.length) return;
    s.seqIndex = ((s.seqIndex || 0) + d + seq.length) % seq.length;
    this.showPose(seq[s.seqIndex]);
    this.renderTimeline();
    this.renderInspector();
  }

  setAnim(name) {
    const s = this.session;
    if (!s) return;
    s.animSel = name;
    const seq = this.sequence();
    s.seqIndex = Math.max(0, seq.indexOf(s.pose));
    if (!seq.includes(s.pose)) { s.seqIndex = 0; s.pose = seq[0]; }
    this.showPose(s.pose);
    this.renderTimeline();
    this.restartPreview();
  }

  // =============================================================== editing ===
  setTool(t, fromEditor = false) {
    this.tool = t;
    if (!fromEditor) this.editor.setTool(t);
    for (const [id, b] of Object.entries(this.toolBtns)) b.classList.toggle('on', id === t);
  }

  toggleOpt(k) {
    this.editor.setOpt(k, !this.editor.opts[k]);
    if (k !== 'compare') { const o = this.editor.opts; ls.set('ps.editorOpts', { grid: o.grid, onion: o.onion, diff: o.diff, mirror: o.mirror, pixelPerfect: o.pixelPerfect }); }
    this.syncOptBtns();
    this.updateBanner();
  }
  syncOptBtns() { for (const [k, b] of Object.entries(this.optBtns)) b.classList.toggle('on', !!this.editor.opts[k]); }

  pickDefaultColor() {
    const s = this.session;
    // most-used non-outline color of the frame is a friendlier start than the outline ink
    const used = usedColors([this.currentFrame()?.grid]).filter((v) => { const r = s.table.ref(v); return !(Array.isArray(r) && r[0] === 'INK'); });
    this.setColor(used[0] || (this.pal.list[0] ? s.table.idx([this.pal.list[0].name, 2]) : 0), { remember: false });
  }

  setColor(v, { remember = true } = {}) {
    const s = this.session;
    this.editor.setColor(v);
    this.colorRef = s ? s.table.ref(v) : null;
    if (v && remember && s) { const k = JSON.stringify(this.colorRef); this.recent = [this.colorRef, ...this.recent.filter((r) => JSON.stringify(r) !== k)].slice(0, 12); }
    if (v && (this.tool === 'eraser' || this.tool === 'picker')) this.setTool('pencil');
    this.renderCurColor();
    this.inspScroll.querySelectorAll('.swatch.on').forEach((e) => e.classList.remove('on'));
    this.inspScroll.querySelectorAll(`.swatch[data-v="${v}"]`).forEach((e) => e.classList.add('on'));
  }

  setShade(shade) {
    const s = this.session;
    if (!s) return;
    const ref = s.table.ref(this.editor.color);
    if (!Array.isArray(ref)) return;
    const m = this.pal.byName.get(ref[0]);
    if (!m || shade >= m.ramp.length) return;
    this.setColor(s.table.idx([ref[0], shade]));
  }

  frameEdited() {
    const s = this.session;
    if (!s) return;
    const fr = this.currentFrame();
    this.updateUndo();
    this.updateFrameCard(s.pose);
    this.renderSaveState();
    this.updateBanner();
    if (fr) fr._pv = null;
    // re-render the list only when the "unsaved" badge has to appear or disappear
    const shown = !!this.list.querySelector('.asset-item.on .tag.fire');
    if (shown !== this.sessionDirty(s)) this.renderList();
    if (this._inspT) clearTimeout(this._inspT);
    this._inspT = setTimeout(() => this.renderInspector(), 250);
  }

  afterHistory() { this.frameEdited(); }

  updateUndo() {
    const fr = this.currentFrame();
    this.undoBtn.disabled = !fr || !fr.undo.length;
    this.redoBtn.disabled = !fr || !fr.redo.length;
  }

  // =========================================================== frames/anims ===
  uniquePoseName(base) {
    const s = this.session;
    const stem = base.replace(/_v\d+$/, '');
    for (let n = 2; ; n++) { const name = `${stem}_v${n}`; if (!s.poses.includes(name) && !s.removed.has(name)) return name; }
  }

  newFrame() {
    const s = this.session;
    const fr = this.currentFrame();
    if (!s || !fr) return;
    this.editor.commitFloat();
    const name = this.uniquePoseName(s.pose);
    const nf = { pose: name, raw: null, rawHash: null, grid: fr.grid.clone(), saved: new Grid(fr.grid.w, fr.grid.h), undo: [], redo: [], status: 'added', isNew: true, after: s.pose, from: s.pose };
    s.frames.set(name, nf);
    let at = s.poses.indexOf(s.pose) + 1;
    while (at < s.poses.length && s.frames.get(s.poses[at])?.after === s.pose) at++;
    s.poses.splice(at, 0, name);
    if (s.animSel !== '*') {
      const seq = [...s.anims[s.animSel]];
      seq.splice(s.seqIndex + 1, 0, name);
      s.anims[s.animSel] = seq;
      s.seqIndex += 1;
    }
    s.metaDirty = true;
    this.showPose(name);
    this.renderTimeline();
    this.renderInspector();
    this.renderSaveState();
    this.restartPreview();
    toast(`Added frame ${name} (a copy of ${nf.from}) — paint it, then Save.`, { kind: 'ok' });
  }

  holdFrame(delta) {
    const s = this.session;
    if (!s || s.animSel === '*') return;
    const seq = [...s.anims[s.animSel]];
    if (delta > 0) { seq.splice(s.seqIndex + 1, 0, s.pose); s.seqIndex += 1; }
    else {
      if (seq.length <= 1) { toast('An animation needs at least one frame', { kind: 'warn' }); return; }
      seq.splice(s.seqIndex, 1);
      s.seqIndex = Math.min(s.seqIndex, seq.length - 1);
      s.pose = seq[s.seqIndex];
    }
    s.anims[s.animSel] = seq;
    s.metaDirty = true;
    this.showPose(s.pose);
    this.renderTimeline();
    this.renderSaveState();
    this.restartPreview();
  }

  moveInAnim(d) {
    const s = this.session;
    if (!s || s.animSel === '*') return;
    const seq = [...s.anims[s.animSel]];
    const i = s.seqIndex, j = i + d;
    if (j < 0 || j >= seq.length) return;
    [seq[i], seq[j]] = [seq[j], seq[i]];
    s.anims[s.animSel] = seq;
    s.seqIndex = j;
    s.metaDirty = true;
    this.renderTimeline();
    this.renderSaveState();
    this.restartPreview();
  }

  async deleteFrame() {
    const s = this.session;
    const fr = this.currentFrame();
    if (!s || !fr || fr.raw) return;
    if (!(await confirmDialog('Delete this frame?', `${s.pose} was added in the studio. It will be removed from every animation when you save.`, { okLabel: 'Delete frame', danger: true }))) return;
    const pose = s.pose;
    s.frames.delete(pose);
    s.poses = s.poses.filter((p) => p !== pose);
    for (const k of Object.keys(s.anims)) { const seq = s.anims[k].filter((p) => p !== pose); s.anims[k] = seq.length ? seq : [s.poses[0]]; }
    if (!fr.isNew) s.removed.add(pose);
    s.metaDirty = true;
    const seq = this.sequence();
    s.seqIndex = Math.min(s.seqIndex, seq.length - 1);
    this.showPose(seq[s.seqIndex] || s.poses[0]);
    this.renderTimeline();
    this.renderInspector();
    this.renderSaveState();
    this.restartPreview();
  }

  revertFrame() {
    const fr = this.currentFrame();
    if (!fr) return;
    if (!fr.raw) { this.deleteFrame(); return; }
    this.editor.commitFloat(false);
    this.editor.snapshot();
    fr.grid = fr.raw.clone();
    if (fr.status === 'baked') fr.unbake = true;
    fr.forceBake = false;
    this.editor.changed();
    toast('Frame reverted to the AI version (Ctrl+Z to undo). Save to keep it.', { kind: 'info' });
  }

  async bakeAsset() {
    const s = this.session;
    if (!s) return;
    const gen = [...s.frames.values()].filter((f) => f.raw && f.status !== 'baked');
    if (!gen.length) { toast('Every frame is already baked.', { kind: 'info' }); return; }
    const ok = await confirmDialog('Bake this asset?', `Freezes ${gen.length} frame${gen.length > 1 ? 's' : ''} of ${s.asset.name} as your own pixel data. The AI's generator stops changing them — this is how final art is locked.\n\nYou can still paint baked frames, and "Unbake" re-attaches the generator.`, { okLabel: 'Bake & save' });
    if (!ok) return;
    for (const f of gen) f.forceBake = true;
    await this.save({ bake: true });
  }

  unbakeFrame() {
    const fr = this.currentFrame();
    if (!fr || !fr.raw || fr.status !== 'baked') return;
    fr.unbake = true;
    this.frameEdited();
    toast('Frame will be stored as a patch on the generator again when you save.', { kind: 'info' });
  }

  async revertAsset() {
    const s = this.session;
    if (!s) return;
    const ok = await confirmDialog('Revert the whole asset?', `Deletes every edit you made to ${s.asset.name} (all frames, added frames and timing) and goes back to the AI's generated art. Lessons already learned are kept.`, { okLabel: 'Revert asset', danger: true });
    if (!ok) return;
    try {
      await window.studio.edits.remove(this.project.id, s.asset.id);
      this.sessions.delete(s.asset.id);
      delete this.summary[s.asset.id];
      this.thumbs.delete(s.asset.id);
      this.editCache.delete(s.asset.id);
      await this.selectAsset(s.asset.id);
      toast('Asset reverted to generated art.', { kind: 'ok' });
    } catch (err) { toast(err.message, { kind: 'error' }); }
  }

  // ================================================================== save ===
  async save({ bake = false, propagated = null, from = null } = {}) {
    const s = this.session;
    if (!s) return;
    const shownPose = s.pose;
    this.editor.commitFloat(false);
    if (!this.sessionDirty(s)) { toast('Nothing to save.', { kind: 'info', timeout: 1500 }); return; }
    const pid = this.project.id;
    const note = this.noteInput.value.trim();
    let enc;
    try { enc = encodeForSave(s, note); } catch (err) { toast(`Could not encode: ${err.message}`, { kind: 'error' }); return; }
    this.saveBtn.disabled = true;
    this.savingId = s.asset.id;
    let written;
    try {
      written = await window.studio.edits.write(pid, s.asset.id, enc.edit);
      s.diskText = JSON.stringify(written || null);
    } catch (err) {
      this.saveBtn.disabled = false;
      this.savingId = null;
      toast(`Save failed: ${err.message}`, { kind: 'error', timeout: 8000 });
      return;
    }
    // lessons: one per frame whose pixels changed since the last save
    const style = this.app.styleOf(this.project);
    let lessons = 0;
    for (const pose of enc.saved) {
      const fr = s.frames.get(pose);
      if (!fr || (!fr.isNew && fr.grid.equals(fr.saved))) continue;
      const kind = fr.via ? 'propagate' : !fr.raw ? 'add-frame' : (enc.edit.poses[pose] && enc.edit.poses[pose].mode === 'baked' ? 'bake' : 'edit');
      try {
        const { lesson, card } = buildLesson({
          project: pid, asset: s.asset, pose, kind, note, styleVersion: style && style.version,
          gen: fr.raw, before: fr.isNew ? null : fr.saved, after: fr.grid, table: s.table,
        });
        if (fr.from) lesson.from = fr.from;
        if (fr.via) lesson.from = fr.via.replace(/^propagate:/, '');
        await window.studio.lessons.append(style ? style.id : null, lesson, card);
        lessons++;
      } catch (err) { console.warn('lesson not recorded', err); }
    }
    // the session now matches the disk
    s.edit = written ? JSON.parse(JSON.stringify(written)) : emptyEdit(pid, s.asset);
    s.diskText = JSON.stringify(written || null);
    for (const fr of s.frames.values()) {
      fr.saved = fr.grid.clone();
      fr.isNew = false; fr.forceBake = false; fr.unbake = false;
      const pe = s.edit.poses[fr.pose];
      fr.status = statusOf(pe, fr.raw);
      fr.viaSaved = pe && pe.via ? pe.via : null;
      fr.via = null;
      fr.drift = false;
      fr._pv = null;
    }
    s.removed.clear();
    s.metaDirty = false;
    setTimeout(() => { if (this.savingId === s.asset.id) this.savingId = null; }, 1200);
    this.noteInput.value = '';
    this.saveBtn.disabled = false;
    if (written) this.summary[s.asset.id] = summarizeEdit(written); else delete this.summary[s.asset.id];
    this.editCache.delete(s.asset.id);
    this.refreshThumb(s.asset.id);
    this.renderList();
    this.renderChips();
    this.renderTimeline();
    this.renderInspector();
    this.app.onLessonsAdded?.(lessons);
    const live = this.app.gameRunning(pid) ? ' The running game updated live.' : '';
    const what = propagated ? `Carried your ${from} fix to ${propagated.join(', ')} and saved` : `${bake ? 'Baked' : 'Saved'} ${s.asset.name} · ${enc.saved.length || 'timing'}${enc.saved.length ? ` frame${enc.saved.length > 1 ? 's' : ''}` : ''}`;
    // a fresh fix on a generated frame with siblings → offer to carry it over right away
    const shown = s.frames.get(shownPose);
    const offer = !propagated && !bake && shown && shown.raw && enc.saved.includes(shownPose) && !shown.grid.equals(shown.raw) && s.poses.length > 1;
    toast(`${what}.${lessons ? ` ${lessons} lesson${lessons > 1 ? 's' : ''} for the style.` : ''}${live}`, {
      kind: 'ok', timeout: offer ? 9000 : 4200,
      action: offer ? { label: 'Do the same to other frames', fn: () => { if (this.session === s && s.pose === shownPose) openPropagate(this); } } : null,
    });
    this.app.logActivity?.(`${what} (${s.asset.id})`, 'studio');
  }

  // ============================================================== render: misc ===
  // Reset the center column whenever there is no frame to edit.
  clearStage() {
    this.stopPreview();
    this.editor.setFrame(null);
    this.frames.replaceChildren();
    this.frameOps.replaceChildren();
    this.animSel.replaceChildren();
    this.hud.replaceChildren();
    this.banner.replaceChildren();
    this.previewCanvas.getContext('2d').clearRect(0, 0, this.previewCanvas.width, this.previewCanvas.height);
    this.previewInfo.textContent = '';
  }

  renderEmptyStage(title, sub, isErr = false) {
    this.clearStage();
    mount(this.stageEmpty, h('div.empty', null, icon(isErr ? 'warn' : 'art'), h('h3', null, title), sub ? h(isErr ? 'div.err-box' : 'p', null, sub) : null));
  }

  renderNoArt() {
    const p = this.project;
    this.session = null;
    this.clearStage();
    mount(this.stageEmpty, h('div.empty', null, icon('art'), h('h3', null, 'No art registered yet'),
      h('p', null, `${p.name} doesn't list any assets for the studio. Once its art is wired into the art contract, every sprite, tile and effect shows up here automatically — no restart needed.`),
      btn('Copy prompt for the AI', () => copyText(P.noArtPrompt(p)).then(() => toast('Prompt copied', { kind: 'ok' })), { kind: 'teal', ico: 'bot' })));
    this.renderInspector();
  }

  renderLoadError() {
    const p = this.project;
    const err = (this.listing.errors || []).join('\n\n') || 'unknown error';
    this.session = null;
    this.clearStage();
    mount(this.stageEmpty, h('div.empty', { style: { maxWidth: '720px', margin: '0 auto' } }, icon('warn'), h('h3', null, `${p.name}'s art code failed to load`),
      h('p', null, 'This usually means an AI edit broke a module. The studio keeps watching — as soon as the code is fixed, the assets come back by themselves.'),
      h('div.err-box', { style: { textAlign: 'left', width: '100%' } }, err),
      h('div.row', null,
        btn('Retry', async () => { await this.host.start().catch(() => {}); this.loadListing({ reason: 'code' }); }, { ico: 'refresh' }),
        btn('Ask the AI to fix it', () => openRequestDialog(this.app, { scope: p.id, kind: 'bug', tier: 'any', title: `Art code fails to load in Pixel Yak`, body: `Pixel Yak can't load ${p.assetsPath}:\n\n${err.slice(0, 2000)}` }), { kind: 'teal', ico: 'bot' }),
        btn('Copy fix prompt', () => copyText(P.fixLoadPrompt(p, err)).then(() => toast('Prompt copied', { kind: 'ok' })), { ico: 'copy' }))));
    this.renderInspector();
  }

  renderAudio(a) {
    this.clearStage();
    mount(this.stageEmpty, h('div.audio-panel', null, h('div.big', null, icon('sound')), h('h3', { style: { margin: 0, color: 'var(--text)' } }, a.name), h('div.dim', null, a.description || a.id),
      h('div.row', null,
        btn('Play', () => this.host.play(a.id).catch((e) => toast(e.message, { kind: 'error' })), { kind: 'primary', ico: 'play' }),
        a.canStop ? btn('Stop', () => this.host.stop(a.id), { ico: 'pause' }) : null,
        btn('Ask AI about this sound', () => openRequestDialog(this.app, { scope: this.project.id, kind: 'audio', target: { asset: a.id }, title: '' }), { kind: 'teal', ico: 'bot' }))));
  }

  updateHud(hv) {
    const s = this.session;
    if (!s) { this.hud.replaceChildren(); return; }
    const fr = this.currentFrame();
    const parts = [];
    if (hv) {
      const hex = s.table.hex(hv.v);
      parts.push(h('span.hud', null, `${hv.x}, ${hv.y}`));
      parts.push(h('span.hud.swatch', null, h('i', { style: { background: hex || 'transparent' } }), s.table.label(hv.v)));
    }
    if (fr) parts.push(h('span.hud', null, `${fr.grid.w}×${fr.grid.h} · ${this.editor.zoom}x`));
    mount(this.hud, parts);
  }

  updateBanner() {
    const fr = this.currentFrame();
    const items = [];
    if (this.editor.opts.compare) items.push(h('span.compare-flag', null, fr && fr.raw ? "Showing the AI's generated version — release C / toggle to paint" : 'Added frame — there is no AI version to compare'));
    if (fr && fr.drift && !this.editor.opts.compare) items.push(h('span.tag.fire', { title: "The AI changed this frame's generator after you painted it. Your pixels are still applied on top — check they fit, then Save to re-anchor them." }, 'generator changed under your edit'));
    mount(this.banner, items);
  }

  // ============================================================= timeline ===
  renderTimeline() {
    const s = this.session;
    if (!s) { this.frames.replaceChildren(); this.frameOps.replaceChildren(); return; }
    mount(this.animSel, [...Object.keys(s.anims).map((k) => h('option', { value: k, selected: s.animSel === k }, `${k} · ${s.anims[k].length}f`)), h('option', { value: '*', selected: s.animSel === '*' }, `All poses · ${s.poses.length}`)]);
    const seq = this.sequence();
    const cards = seq.map((pose, i) => {
      const fr = s.frames.get(pose);
      const c = h('canvas');
      if (fr) drawThumb(c, fr.grid, s.table, { box: 56 });
      const st = fr ? (frameDirty(fr) ? 'dirty' : fr.status === 'gen' ? null : fr.status) : null;
      const hold = i > 0 && seq[i - 1] === pose;
      return h(`div.frame${i === s.seqIndex && pose === s.pose ? '.on' : ''}${fr && fr.drift ? '.drift' : ''}`, {
        title: `${pose}${fr ? ` — ${({ gen: 'AI generated', patch: 'your patch', baked: 'baked (yours)', added: 'added in the studio' })[fr.status]}` : ''}${st === 'dirty' ? ' · unsaved' : ''}`,
        dataset: { pose, i },
        onclick: () => { s.seqIndex = i; this.showPose(pose); this.renderTimeline(); this.renderInspector(); },
      }, c, h('span.fname', null, pose), st ? h(`i.fdot.${st}`) : null, hold ? h('span.fhold', null, 'hold') : null);
    });
    mount(this.frames, cards);
    const on = this.frames.querySelector('.frame.on');
    if (on) on.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    const inAnim = s.animSel !== '*';
    const fr = this.currentFrame();
    mount(this.frameOps,
      btn('New frame', () => this.newFrame(), { small: true, ico: 'dup', title: 'Duplicate this frame as a new frame right after it (N)' }),
      inAnim ? iconBtn('hold', 'Hold: show this frame one more tick (H)', () => this.holdFrame(1)) : null,
      inAnim ? iconBtn('minus', 'Remove this entry from the animation', () => this.holdFrame(-1)) : null,
      inAnim ? iconBtn('left', 'Move earlier in the animation', () => this.moveInAnim(-1)) : null,
      inAnim ? iconBtn('right', 'Move later in the animation', () => this.moveInAnim(1)) : null,
      fr && !fr.raw ? iconBtn('trash', 'Delete this added frame', () => this.deleteFrame()) : null,
      btn('In-betweens…', () => this.requestInbetweens(), { small: true, ico: 'bot', kind: 'ghost', title: 'Ask the AI to generate in-between frames for this animation' }));
  }

  updateFrameCard(pose) {
    const s = this.session;
    const fr = s && s.frames.get(pose);
    if (!fr) return;
    this.frames.querySelectorAll(`.frame[data-pose="${CSS.escape(pose)}"]`).forEach((card) => {
      const c = card.querySelector('canvas');
      drawThumb(c, fr.grid, s.table, { box: 56 });
      let dot = card.querySelector('.fdot');
      const st = frameDirty(fr) ? 'dirty' : fr.status === 'gen' ? null : fr.status;
      if (st && !dot) { dot = h('i.fdot'); card.append(dot); }
      if (dot) { dot.className = `fdot ${st || ''}`; if (!st) dot.remove(); }
    });
  }

  requestInbetweens() {
    const s = this.session;
    if (!s) return;
    const seq = this.sequence();
    const anim = s.animSel === '*' ? null : s.animSel;
    const i = s.seqIndex;
    const nextPose = seq[(i + 1) % seq.length];
    openRequestDialog(this.app, {
      scope: this.project.id, kind: 'frames', tier: 'builder',
      title: `Add in-between frames: ${s.asset.id} ${s.pose} → ${nextPose}`,
      body: `Add 1–2 in-between frames between ${s.pose} and ${nextPose}${anim ? ` in the "${anim}" animation` : ''}. Keep the contract (${s.asset.fw}×${s.asset.fh}, anchor ${s.asset.ax},${s.asset.ay}) and the style rules.`,
      target: { asset: s.asset.id, pose: s.pose, anim },
      targetThumb: this.thumbCanvas(),
      attachments: [this.frameSnapshot()],
    });
  }

  // ============================================================== preview ===
  startPreview() {
    this.stopPreview();
    this.pvTick = 0;
    this.drawPreview();
    if (this.playing) this.pvTimer = setInterval(() => { this.pvTick++; this.drawPreview(); }, 1000 / this.fps);
  }
  stopPreview() { clearInterval(this.pvTimer); this.pvTimer = null; }
  restartPreview() { this.startPreview(); }
  togglePlay() {
    this.playing = !this.playing;
    mount(this.playBtn, icon(this.playing ? 'pause' : 'play'));
    this.playBtn.classList.toggle('on', this.playing);
    this.startPreview();
  }

  previewBgMenu(anchor) {
    const tiles = (this.listing ? this.listing.assets : []).filter((a) => a.kind === 'visual' && (a.category === 'tileset' || a.category === 'structure' || a.category === 'environment' || a.category === 'grid'));
    popMenu(anchor, [
      { header: 'Preview background' },
      ...BGS.map(([k, l]) => ({ label: l, active: this.previewBg === k, fn: () => this.setPreviewBg(k) })),
      tiles.length ? '-' : null,
      tiles.length ? { header: 'In context (project art)' } : null,
      ...tiles.slice(0, 16).map((a) => ({ label: a.name, active: this.previewBg === `asset:${a.id}`, fn: () => this.setPreviewBg(`asset:${a.id}`) })),
      '-',
      ...[0, 1, 2, 3, 4].map((z) => ({ label: z ? `${z}x` : 'Fit', active: this.previewScale === z, fn: () => { this.previewScale = z; this.drawPreview(); } })),
    ].filter(Boolean), { align: 'right' });
  }

  async setPreviewBg(k) {
    this.previewBg = k;
    ls.set('ps.previewBg', k);
    this.pvBgCanvas = null;
    if (k.startsWith('asset:')) {
      const id = k.slice(6);
      const a = this.byId.get(id);
      if (a) {
        const r = (await this.host.raw(id, [firstPose(a)]).catch(() => new Map())).get(firstPose(a));
        if (r && r.rgba) { const t = new ColorTable(this.pal); this.pvBgCanvas = gridCanvas(gridFromRgba(r.w, r.h, r.rgba, t), t); }
      }
    }
    this.drawPreview();
  }

  drawPreview() {
    const s = this.session;
    const c = this.previewCanvas;
    const box = c.parentElement;
    if (!box) return;
    const dpr = window.devicePixelRatio || 1;
    const W = Math.round(box.clientWidth * dpr), H = Math.round(box.clientHeight * dpr);
    if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    const bg = this.previewBg;
    g.fillStyle = { dark: '#0c1024', light: '#c9cbe0', mid: '#4b5070', black: '#000', checker: '#14172b' }[bg] || '#0c1024';
    g.fillRect(0, 0, W, H);
    if (!s) return;
    const seq = this.sequence();
    const pose = this.playing ? seq[this.pvTick % seq.length] : s.pose;
    const fr = s.frames.get(pose);
    if (!fr) return;
    if (!fr._pv) fr._pv = gridCanvas(fr.grid, s.table, document.createElement('canvas'));
    const fit = Math.max(1, Math.floor(Math.min((W - 8) / fr.grid.w, (H - 8) / fr.grid.h)));
    const z = this.previewScale ? Math.max(1, Math.round(this.previewScale * dpr)) : fit;
    const w = fr.grid.w * z, hh = fr.grid.h * z;
    const x = Math.round((W - w) / 2), y = Math.round(H - hh - Math.max(4, (H - hh) / 4));
    if (this.pvBgCanvas && bg.startsWith('asset:')) {
      const t = this.pvBgCanvas, tz = z;
      for (let ty = H - t.height * tz; ty > -t.height * tz; ty -= t.height * tz) for (let tx = 0; tx < W; tx += t.width * tz) g.drawImage(t, tx, ty, t.width * tz, t.height * tz);
    }
    g.drawImage(fr._pv, x, y, w, hh);
    this.previewInfo.textContent = `${pose} · ${this.playing ? `${this.fps} fps` : 'paused'}`;
  }

  // ============================================================ inspector ===
  renderInspector() {
    const s = this.session;
    const secs = [];
    if (s) {
      secs.push(this.paletteSection());
      secs.push(this.frameSection());
      secs.push(this.assetSection());
      secs.push(this.requestsSection());
    } else if (this.project) {
      secs.push(h('div.insp-sec', null, h('div.section-title', null, 'Project', h('span.grow')),
        h('dl.kv', null, h('dt', null, 'Game'), h('dd', null, this.project.name), h('dt', null, 'Style'), h('dd', null, this.project.style || '—'), h('dt', null, 'Assets'), h('dd', null, this.listing ? this.listing.assets.length : '…'))));
    }
    mount(this.inspScroll, secs);
    this.renderCurColor();
    this.renderSaveState();
  }

  renderCurColor() {
    const el = this.inspScroll.querySelector('.cur-color');
    const s = this.session;
    if (!el || !s) return;
    const v = this.editor.color;
    const hex = s.table.hex(v);
    const ref = s.table.ref(v);
    const m = Array.isArray(ref) ? this.pal.byName.get(ref[0]) : null;
    mount(el, h('div.sw', null, h('i', { style: { background: hex || 'transparent' } })),
      h('div.grow', null, h('div.lbl', null, v ? (Array.isArray(ref) ? `${ref[0]} · shade ${ref[1]}` : 'Custom color') : 'Transparent (erase)'),
        h('div.sub', null, v ? `${hex}${m && m.glow ? ' · glows' : ''}${Array.isArray(ref) ? ' · keys 1–5 pick shade' : ''}` : 'Paints transparency')));
  }

  paletteSection() {
    const s = this.session;
    const used = usedColors([...s.frames.values()].map((f) => f.grid));
    const usedSet = new Set(used);
    const sec = h('div.insp-sec');
    const cur = h('div.cur-color');
    const sw = (v, title) => h(`button.swatch${v === this.editor.color ? '.on' : ''}${usedSet.has(v) ? '.inuse' : ''}`, {
      type: 'button', title, dataset: { v }, style: { background: s.table.hex(v) || 'transparent' }, onclick: () => this.setColor(v),
    });
    sec.append(h('div.section-title', null, 'Paint', h('span.grow')), cur);
    if (this.recent.length) sec.append(h('div.dim', { style: { fontSize: '11px' } }, 'Recent'), h('div.free-swatches', null, this.recent.map((r) => s.table.idx(r)).map((v) => sw(v, s.table.label(v)))));
    if (this.paletteMode === 'materials') {
      const usedMats = [];
      for (const v of used) { const r = s.table.ref(v); if (Array.isArray(r) && !usedMats.includes(r[0])) usedMats.push(r[0]); }
      const filt = (this._palFilter || '').toUpperCase();
      const rows = (names, cls) => names.filter((n) => !filt || n.includes(filt)).map((name) => {
        const m = this.pal.byName.get(name);
        if (!m) return null;
        return h(`div.mat-row${cls}`, null, h('span.mname', { title: name }, m.glow ? h('span.glow', null, '✦ ') : null, name),
          m.ramp.map((hex, i) => sw(s.table.idx([name, i]), `${name} ${i} · ${hex}${m.glow ? ' · glows' : ''}`)));
      });
      const others = this.pal.list.map((m) => m.name).filter((n) => !usedMats.includes(n));
      const filter = h('input.input', { placeholder: 'Find material…', value: this._palFilter || '', style: { flex: 1, height: '26px', padding: '3px 8px', fontSize: '12px' }, oninput: (e) => { this._palFilter = e.target.value; const pos = e.target.selectionStart; this.renderInspector(); const f = this.inspScroll.querySelector('.pal-tools input'); if (f) { f.focus(); f.setSelectionRange(pos, pos); } } });
      sec.append(h('div.pal-tools', null, filter, iconBtn('eraser', 'Transparent (erase)', () => this.setColor(0))));
      sec.append(h('div.palette', null, h('div.dim', { style: { fontSize: '11px' } }, 'In this asset'), rows(usedMats, '.used')));
      const showAll = this._palAll || !!filt;
      sec.append(h('button.btn.ghost.sm', { type: 'button', onclick: () => { this._palAll = !this._palAll; this.renderInspector(); } }, showAll ? `Hide other materials` : `All materials (${others.length})`));
      if (showAll) sec.append(h('div.palette', null, rows(others, '')));
    } else {
      const extra = h('input', { type: 'color', value: '#ffcc33', title: 'Add a custom color', style: { width: '30px', height: '26px', padding: 0, border: 0, background: 'transparent' }, onchange: (e) => { const v = s.table.idx(hexToRef(e.target.value, this.pal)); this.setColor(v); this.renderInspector(); } });
      sec.append(h('div.note-box', { style: { fontSize: '12px' } }, 'This project has no material palette yet (legacy art), so you paint plain colors.'));
      sec.append(h('div.free-swatches', null, used.map((v) => sw(v, s.table.hex(v))), iconBtn('eraser', 'Transparent (erase)', () => this.setColor(0)), extra));
    }
    return sec;
  }

  frameSection() {
    const s = this.session;
    const fr = this.currentFrame();
    const sec = h('div.insp-sec');
    sec.append(h('div.section-title', null, 'Frame', h('span.grow')));
    if (!fr) return sec;
    const label = { gen: ['AI generated', 'sky'], patch: ['Your patch', 'gold'], baked: ['Baked (yours)', 'orchid'], added: ['Added frame', 'teal'] }[fr.status];
    const changed = fr.raw ? fr.grid.countDiff(fr.raw) : fr.grid.opaque();
    const opaque = Math.max(fr.grid.opaque(), fr.raw ? fr.raw.opaque() : 0, 1);
    sec.append(h('div.row', null, h('b.mono', null, s.pose), h(`span.tag.${label[1]}`, null, label[0]), frameDirty(fr) ? h('span.tag.fire', null, 'unsaved') : null));
    const via = fr.via || fr.viaSaved;
    sec.append(h('dl.kv', null,
      h('dt', null, 'vs. AI'), h('dd', null, fr.raw ? `${changed} px changed (${Math.round((changed / opaque) * 1000) / 10}%)` : 'no AI version (added)'),
      fr.from ? h('dt', null, 'Copied from') : null, fr.from ? h('dd.mono', null, fr.from) : null,
      via ? h('dt', null, 'Fix from') : null, via ? h('dd', null, h('span.mono', null, via.replace(/^(ai-)?propagate:/, '')), via.startsWith('ai-') ? ' (carried over by the AI)' : ' (carried over)') : null,
      h('dt', null, 'Undo'), h('dd', null, `${fr.undo.length} step${fr.undo.length === 1 ? '' : 's'}`)));
    if (fr.raw && changed && s.poses.length > 1) {
      sec.append(btn('Do the same to other frames…', () => openPropagate(this), { kind: 'teal', ico: 'frames', small: true, title: `Carry the ${changed} px you changed here over to this asset's other frames (preview first)` }));
    }
    if (fr.drift) sec.append(h('div.note-box.fire', null, "The AI changed this frame's generator after you painted it. Your pixels are still applied on top — check they still fit, then Save to re-anchor them."));
    if (fr.sizeWarn) sec.append(h('div.note-box.fire', null, `Contract mismatch: ${fr.sizeWarn}.`));
    if (fr.error) sec.append(h('div.err-box', null, fr.error));
    sec.append(h('div.row', { style: { flexWrap: 'wrap', gap: '6px' } },
      fr.raw ? btn('Revert frame', () => this.revertFrame(), { small: true, ico: 'revert', title: "Back to the AI's version (undoable)" }) : btn('Delete frame', () => this.deleteFrame(), { small: true, ico: 'trash', kind: 'danger' }),
      fr.raw && fr.status === 'baked' ? btn('Unbake', () => this.unbakeFrame(), { small: true, ico: 'bake', title: 'Store as a patch on the generator again' }) : null,
      btn('Copy', () => { this.editor.copy(); toast('Frame copied — paste into any frame (Ctrl+V).', { kind: 'ok', timeout: 1800 }); }, { small: true, ico: 'copy', kind: 'ghost' })));
    return sec;
  }

  assetSection() {
    const s = this.session;
    const a = s.asset;
    const gen = a.gen;
    const editsPath = `${this.project.editsDir}/${a.id}.json`;
    const hasFile = !!this.summary[a.id];
    return h('div.insp-sec', null,
      h('div.section-title', null, 'Asset', h('span.grow')),
      h('div', { style: { fontWeight: 600 } }, a.name),
      a.description ? h('div.dim', { style: { fontSize: '12px' } }, a.description) : null,
      h('dl.kv', null,
        h('dt', null, 'Id'), h('dd.mono', null, a.id),
        h('dt', null, 'Size'), h('dd', null, `${a.fw}×${a.fh}${a.ax != null ? ` · anchor ${a.ax},${a.ay}` : ''}`),
        h('dt', null, 'Frames'), h('dd', null, `${s.poses.length} · ${Object.keys(s.anims).length} anims`),
        h('dt', null, 'Made by'), h('dd', null, gen ? `${gen.by || '?'}${gen.style ? ` · ${gen.style} v${gen.v || '?'}` : ''}${gen.date ? ` · ${gen.date}` : ''}` : h('span.dim', null, 'not stamped')),
        h('dt', null, 'In game'), h('dd', null, this.meta && this.meta.runtime ? h('span', { style: { color: 'var(--jade)' } }, 'edits apply live') : h('span', { style: { color: 'var(--fire)' }, title: "This game doesn't use core/art yet, so it can't read studio edits. Your edits are still saved and become lessons." }, 'not wired (legacy)')),
        h('dt', null, 'Edit file'), h('dd', null, hasFile ? h('a', { href: '#', class: 'mono', style: { color: 'var(--text2)', fontSize: '11.5px' }, onclick: (e) => { e.preventDefault(); window.studio.shell.open(editsPath, true).catch((err) => toast(err.message, { kind: 'error' })); } }, editsPath) : h('span.dim', null, 'none yet'))));
  }

  requestsSection() {
    const s = this.session;
    const reqs = this.app.requestsFor(this.project.id, s.asset.id);
    const open = reqs.filter((r) => r.status === 'open' || r.status === 'in-progress');
    const done = reqs.filter((r) => r.status === 'done').slice(0, 3);
    return h('div.insp-sec', null,
      h('div.section-title', null, 'Requests', h('span.grow')),
      h('div.req-mini', null, [...open, ...done].map((r) => h('div.rq', { onclick: () => this.app.openRequest(r) },
        h(`span.tag.${r.status === 'done' ? 'jade' : r.assignee === 'user' ? 'gold' : 'sky'}`, null, r.status === 'done' ? 'done' : r.assignee === 'user' ? 'you' : 'ai'),
        h('span.t', null, r.title), h('span.dim', { style: { fontSize: '11px' } }, timeAgo(r.updatedAt))))),
      !reqs.length ? h('div.dim', { style: { fontSize: '12px' } }, 'Nothing asked about this asset yet.') : null,
      btn('Ask AI about this frame…', () => this.askAI(), { small: true, kind: 'teal', ico: 'bot' }));
  }

  renderSaveState() {
    const s = this.session;
    if (!s) { mount(this.saveState, h('span.clean', null, '—')); this.saveBtn.disabled = true; return; }
    const dirtyFrames = [...s.frames.values()].filter(frameDirty).length;
    const meta = s.metaDirty || s.removed.size;
    const others = this.dirtySessions().filter((x) => x !== s).length;
    this.saveBtn.disabled = !dirtyFrames && !meta;
    mount(this.saveState, dirtyFrames || meta
      ? h('span.dirty', null, `${dirtyFrames ? `${dirtyFrames} frame${dirtyFrames > 1 ? 's' : ''} changed` : ''}${dirtyFrames && meta ? ' · ' : ''}${meta ? 'timing/frames changed' : ''} — not saved`)
      : h('span.clean', null, `All saved${others ? ` · ${others} other asset${others > 1 ? 's' : ''} unsaved` : ''}`));
  }

  moreMenu(anchor) {
    const s = this.session;
    if (!s) return;
    const fr = this.currentFrame();
    popMenu(anchor, [
      { label: 'Bake this asset…', ico: 'bake', fn: () => this.bakeAsset(), hint: 'lock as final' },
      fr && fr.raw && fr.status === 'baked' ? { label: 'Unbake this frame', ico: 'bake', fn: () => this.unbakeFrame() } : null,
      { label: 'Revert this frame', ico: 'revert', fn: () => this.revertFrame(), disabled: !fr },
      '-',
      { label: 'Reveal edit file', ico: 'folder', disabled: !this.summary[s.asset.id], fn: () => window.studio.shell.open(`${this.project.editsDir}/${s.asset.id}.json`, true).catch((e) => toast(e.message, { kind: 'error' })) },
      { label: 'Copy asset id', ico: 'copy', fn: () => copyText(s.asset.id) },
      '-',
      { label: 'Revert whole asset…', ico: 'trash', danger: true, disabled: !this.summary[s.asset.id], fn: () => this.revertAsset() },
    ].filter(Boolean), { align: 'right' });
  }

  // ================================================================ helpers ===
  thumbCanvas() {
    const fr = this.currentFrame();
    if (!fr) return null;
    const c = h('canvas');
    drawThumb(c, fr.grid, this.session.table, { box: 44 });
    return c;
  }

  frameSnapshot() {
    const fr = this.currentFrame();
    const s = this.session;
    const z = Math.max(2, Math.min(10, Math.floor(320 / Math.max(fr.grid.w, fr.grid.h))));
    const src = gridCanvas(fr.grid, s.table);
    const c = document.createElement('canvas');
    c.width = fr.grid.w * z; c.height = fr.grid.h * z;
    const g = c.getContext('2d');
    g.fillStyle = '#14172b'; g.fillRect(0, 0, c.width, c.height);
    g.imageSmoothingEnabled = false;
    g.drawImage(src, 0, 0, c.width, c.height);
    return c.toDataURL('image/png');
  }

  askAI() {
    const s = this.session;
    if (!s) { openRequestDialog(this.app, { scope: this.project.id }); return; }
    const sel = this.editor.sel;
    openRequestDialog(this.app, {
      scope: this.project.id, kind: 'art',
      target: { asset: s.asset.id, pose: s.pose, anim: s.animSel === '*' ? null : s.animSel, box: sel ? { x: sel.x, y: sel.y, w: sel.w, h: sel.h } : null },
      targetThumb: this.thumbCanvas(),
      attachments: [this.frameSnapshot()],
      body: sel ? `(About the selected area: x ${sel.x}, y ${sel.y}, ${sel.w}×${sel.h}.)\n` : '',
    });
  }

  // ============================================================== keyboard ===
  onKey(e) {
    if (!this.el.classList.contains('on') || isTyping(e) || topModal()) return;
    const k = e.key;
    const ctrl = e.ctrlKey || e.metaKey;
    const ed = this.editor;
    if (ctrl) {
      const lk = k.toLowerCase();
      if (lk === 's') { e.preventDefault(); this.save(); return; }
      if (!this.session) return;
      if (lk === 'z' && !e.shiftKey) { e.preventDefault(); ed.undo(); this.afterHistory(); return; }
      if (lk === 'y' || (lk === 'z' && e.shiftKey)) { e.preventDefault(); ed.redo(); this.afterHistory(); return; }
      if (lk === 'c') { e.preventDefault(); ed.copy(); return; }
      if (lk === 'x') { e.preventDefault(); ed.copy(true); this.frameEdited(); return; }
      if (lk === 'v') { e.preventDefault(); if (ed.paste()) this.setTool('select', true); return; }
      if (lk === 'a') { e.preventDefault(); ed.selectAll(); return; }
      return;
    }
    if (!this.session) return;
    if (e.altKey) return;
    if (k === 'Escape') { ed.deselect(); return; }
    if (k === 'Delete' || k === 'Backspace') { if (ed.sel) { e.preventDefault(); ed.deleteSel(); } return; }
    if (k.startsWith('Arrow')) {
      const d = e.shiftKey ? 8 : 1;
      const [dx, dy] = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[k];
      if (ed.sel) { e.preventDefault(); ed.nudge(dx * d, dy * d); return; }
      if (dx) { e.preventDefault(); this.stepFrame(dx); }
      return;
    }
    if (k === 'Enter') { e.preventDefault(); if (ed.sel && ed.sel.float) { ed.commitFloat(); return; } this.togglePlay(); return; }
    if (k === '[') { this.stepFrame(-1); return; }
    if (k === ']') { this.stepFrame(1); return; }
    if (k === '+' || k === '=') { ed.zoomStep(1); return; }
    if (k === '-' || k === '_') { ed.zoomStep(-1); return; }
    if (k === '0') { ed.fit(); return; }
    if (k >= '1' && k <= '5') { this.setShade(+k - 1); return; }
    if (k === '#') { this.toggleOpt('grid'); return; }
    const lk = k.toLowerCase();
    if (e.shiftKey && lk === 'h') { ed.flip('h'); return; }
    if (e.shiftKey && lk === 'v') { ed.flip('v'); return; }
    if (TOOL_KEYS[lk]) { this.setTool(TOOL_KEYS[lk]); return; }
    if (lk === 'x') { this.toggleOpt('mirror'); return; }
    if (lk === 'p') { this.toggleOpt('pixelPerfect'); toast(`Pixel-perfect strokes ${this.editor.opts.pixelPerfect ? 'on' : 'off'}`, { timeout: 1400 }); return; }
    if (lk === 'o') { this.toggleOpt('onion'); return; }
    if (lk === 'v') { this.toggleOpt('diff'); return; }
    if (lk === 'n') { this.newFrame(); return; }
    if (lk === 'h') { this.holdFrame(1); return; }
    if (lk === 'c' && !e.repeat) { this.compareHeld = true; ed.setOpt('compare', true); this.updateBanner(); }
  }
}

function firstPose(a) {
  const seq = (a.anims && a.anims[a.defaultAnim]) || a.poses;
  return (seq && seq[0]) || a.poses[0];
}
function catLabel(listing, id) {
  const c = (listing.categories || []).find((x) => x.id === id);
  return c ? c.label : id;
}
function shortCat(c) {
  const map = { all: 'All', character: 'Characters', enemy: 'Enemies', tileset: 'Tiles', prop: 'Props', structure: 'Backdrops', vfx: 'Effects', ui: 'UI', audio: 'Audio', grid: 'Grid', environment: 'Scenery', scenery: 'Scenery', icon: 'Icons' };
  return map[c.id] || c.label || c.id;
}
