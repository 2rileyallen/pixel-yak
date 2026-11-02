// studio/ui/js/main.js — Pixel Yak's shell: top bar (project switcher, live indicator, play),
// left rail (Art · Inbox · Lessons · Projects · Ideas), live file-change dispatch, game moments.
import { h, mount, btn, iconBtn, toast, popMenu, copyText, timeAgo, modal } from './ui.js';
import { icon } from './icons.js';
import { ProjectHost } from './host.js';
import { ArtView } from './views/art.js';
import { InboxView } from './views/inbox.js';
import { LessonsView } from './views/lessons.js';
import { ProjectsView } from './views/projects.js';
import { IdeasView } from './views/ideas.js';
import { openRequestDialog } from './request-dialog.js';
import { showHelp } from './help.js';
import { requestPrompt } from './prompts.js';

const api = window.studio;
const ls = {
  get: (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};
const NAV = [
  ['art', 'Art', 'art', 'Paint any asset of this game (1)'],
  ['inbox', 'Inbox', 'inbox', 'Requests between you and the AI (2)'],
  ['lessons', 'Lessons', 'lessons', 'What the AI is learning from your edits (3)'],
  ['projects', 'Games', 'projects', 'All games, their stage, new game (4)'],
  ['ideas', 'Ideas', 'ideas', 'Game ideas backlog (5)'],
];

class App {
  constructor() {
    this.projects = [];
    this.project = null;
    this.host = null;
    this.styles = [];
    this.designs = [];
    this.requests = [];
    this.running = new Set();
    this.view = null;
    this.lastChange = null;
    this.gameErrorsShown = new Set();
    this.activity = []; // newest first: { ts, text, kind }
  }

  logActivity(text, kind = '') {
    this.activity.unshift({ ts: Date.now(), text, kind });
    if (this.activity.length > 150) this.activity.length = 150;
    if (this._activityList) this._activityList.replaceChildren(...this.activityRows());
  }

  activityRows() {
    if (!this.activity.length) return [h('div.dim', { style: { padding: '8px' } }, 'Nothing has changed on disk since the studio started.')];
    return this.activity.map((a) => h(`div.act${a.kind ? '.' + a.kind : ''}`, null,
      h('span.when', null, new Date(a.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })),
      h('span.what', null, a.text)));
  }

  showActivity() {
    this._activityList = h('div.activity', null, this.activityRows());
    modal({
      title: 'Live activity',
      wide: true,
      body: h('div.col', null,
        h('p', { style: { margin: 0, color: 'var(--text2)' } }, 'Every change the studio noticed in games/, designs/, local/ and engine/ — and what it did about it. Changes show up within a second (folders with a change are re-checked right after, and a slow background sweep catches anything else within ~30 s).'),
        this._activityList),
      actions: [
        { label: 'Reload art now', ico: 'refresh', left: true, fn: () => { this.views.art.reloadArt('manual'); return true; } },
        { label: 'Close', kind: 'primary' },
      ],
      onClose: () => { this._activityList = null; },
    });
  }

  async boot() {
    if (!api) {
      document.body.append(h('div.empty', { style: { height: '100vh' } }, icon('warn'), h('h3', null, 'Open Pixel Yak with npm start'), h('p', null, 'This page needs the desktop app (electron .) to reach your game files.')));
      return;
    }
    this.info = await api.info();
    this.stages = this.info.stages;
    this.sizes = this.info.sizes;
    this.buildShell();
    await Promise.all([this.reloadProjects(), this.reloadStyles(), this.reloadDesigns()]);
    this.views = { art: new ArtView(this), inbox: new InboxView(this), lessons: new LessonsView(this), projects: new ProjectsView(this), ideas: new IdeasView(this) };
    mount(this.content, Object.values(this.views).map((v) => v.el));
    await this.reloadRequests();
    for (const id of await api.game.running().catch(() => [])) this.running.add(id);
    const want = ls.get('ps.project', null);
    const first = this.projects.find((p) => p.id === want) || this.projects.find((p) => p.status === 'active') || this.projects[0];
    this.go(ls.get('ps.view', 'art'), { quiet: true });
    if (first) await this.setProject(first.id);
    else this.go('projects');
    this.views[this.view].onShow?.();
    api.onFsChanged((changes) => this.onFs(changes));
    api.onGameStatus(({ projectId, running }) => { if (running) this.running.add(projectId); else this.running.delete(projectId); this.renderPlay(); this.views.projects.render(); });
    api.onGameMoment((m) => this.onMoment(m));
    api.onGameConsole((c) => this.onGameConsole(c));
    setInterval(() => this.renderLive(), 20000);
    window.addEventListener('keydown', (e) => this.onKey(e));
    window.addEventListener('beforeunload', (e) => { if (this.views.art.dirtySessions().length) { e.preventDefault(); e.returnValue = ''; } });
    document.querySelector('.boot')?.classList.add('out');
    window.__studioReady = true;
  }

  // ================================================================ shell ===
  buildShell() {
    const logo = h('canvas', { width: 16, height: 16 });
    drawLogo(logo);
    this.projBtn = h('button.proj-switch', { type: 'button', title: 'Switch game', onclick: (e) => this.projectMenu(e.currentTarget) });
    this.liveEl = h('span.live-pill', { role: 'button', tabIndex: 0, title: 'Live: changes made by you or an AI appear without a restart. Click for the activity log; F5 reloads the art.', onclick: () => this.showActivity(), onkeydown: (e) => { if (e.key === 'Enter') this.showActivity(); } }, h('i.pulse'), h('span', null, 'Live'));
    this.playBtn = h('button.btn.play-btn', { type: 'button', onclick: (e) => this.playClicked(e.currentTarget) });
    this.rail = h('nav.rail', { 'aria-label': 'Views' });
    this.navBtns = {};
    for (const [id, label, ico, title] of NAV) {
      this.navBtns[id] = h('button.rail-item', { type: 'button', title, onclick: () => this.go(id) }, icon(ico), h('span', null, label), h('span.badge.hidden'));
      this.rail.append(this.navBtns[id]);
    }
    this.rail.append(h('div.rail-spacer'), h('button.rail-item', { type: 'button', title: 'How the studio works (F1)', onclick: () => showHelp(this) }, icon('help'), h('span', null, 'Help')));
    this.content = h('main.content');
    const top = h('header.topbar', null,
      h('div.brand', { title: 'Pixel Yak' }, logo),
      h('div.brand-name', null, 'PIXEL ', h('b', null, 'STUDIO')),
      h('span', { style: { width: '1px', height: '22px', background: 'var(--line2)' } }),
      this.projBtn, h('div.grow'), this.liveEl, this.playBtn,
      btn('Ask AI', () => openRequestDialog(this, {}), { kind: 'teal', ico: 'bot', small: true, title: 'New request for the AI about anything' }));
    document.body.append(h('div.app', null, top, this.rail, this.content));
    this.renderPlay();
  }

  renderProjectBtn() {
    const p = this.project;
    if (!p) { mount(this.projBtn, h('span.pname', null, 'No game')); return; }
    const ph = p.stage && this.stages[p.stage];
    mount(this.projBtn, h('span.proj-swatch', { style: { background: swatchColor(p.id) } }, p.name.replace(/[^A-Za-z0-9]/g, '').slice(0, 2).toUpperCase()),
      h('span.pname', null, p.name), ph ? h('span.psub', null, ph.name) : h('span.psub', null, p.status), icon('chevron'));
  }

  projectMenu(anchor) {
    const items = [{ header: 'Games' }];
    const order = { active: 0, paused: 1, archived: 2 };
    for (const p of [...this.projects].sort((a, b) => (order[a.status] - order[b.status]) || a.name.localeCompare(b.name))) {
      const ph = p.stage && this.stages[p.stage];
      items.push({ label: p.name, ico: this.running.has(p.id) ? 'play' : 'projects', active: this.project && p.id === this.project.id, hint: ph ? ph.name : p.status === 'active' ? '' : p.status, fn: () => this.setProject(p.id) });
    }
    items.push('-', { label: 'New game…', ico: 'plus', fn: () => this.views.projects.newGame() }, { label: 'All games', ico: 'projects', fn: () => this.go('projects') });
    popMenu(anchor, items);
  }

  go(view, { quiet = false } = {}) {
    if (!this.views || !this.views[view]) view = 'art';
    this.view = view;
    ls.set('ps.view', view);
    for (const [id, v] of Object.entries(this.views)) v.el.classList.toggle('on', id === view);
    for (const [id, b] of Object.entries(this.navBtns)) b.classList.toggle('on', id === view);
    if (!quiet) this.views[view].onShow?.();
  }

  // ============================================================== projects ===
  async reloadProjects() {
    const prev = new Set(this.projects.map((p) => p.id));
    this.projects = await api.projects.list();
    if (this.project) {
      const cur = this.projects.find((p) => p.id === this.project.id);
      if (cur) { this.project = cur; this.renderProjectBtn(); }
    }
    return this.projects.filter((p) => prev.size && !prev.has(p.id));
  }

  async setProject(id) {
    const p = this.projects.find((x) => x.id === id);
    if (!p) return;
    if (this.project && this.project.id === id && this.host) return;
    const dirty = this.views.art.dirtySessions();
    if (dirty.length && this.project) {
      const { confirmDialog } = await import('./ui.js');
      const ok = await confirmDialog('Leave unsaved edits?', `${dirty.map((s) => s.asset.name).join(', ')} in ${this.project.name} have unsaved changes. Switching games discards them.`, { okLabel: 'Discard & switch', danger: true });
      if (!ok) return;
    }
    if (this.host) this.host.destroyFrame();
    this.project = p;
    ls.set('ps.project', id);
    this.renderProjectBtn();
    this.renderPlay();
    this.host = new ProjectHost(p);
    this.host.start().catch(() => {});
    this.updateCounts();
    await Promise.all([
      this.views.art.setProject(p, this.host),
      this.views.inbox.setProject(p),
      this.views.lessons.setProject(p),
    ]);
    this.views.projects.render();
  }

  styleOf(p) { return p && p.style ? this.styles.find((s) => s.id === p.style) || null : null; }

  async reloadDesigns() { this.designs = await api.designs.list().catch(() => []); }
  async reloadStyles() { this.styles = await api.styles.list().catch(() => []); }

  // ============================================================== requests ===
  async reloadRequests(scope = null) {
    if (!scope) this.requests = await api.requests.list('all').catch(() => []);
    else {
      const fresh = await api.requests.list(scope).catch(() => null);
      if (fresh) this.requests = [...this.requests.filter((r) => r.scope !== scope), ...fresh].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    }
    this.indexRequests();
    this.updateCounts();
  }

  // Requests by scope and by target asset, rebuilt once per change (the asset list asks per asset).
  indexRequests() {
    this.reqByScope = new Map();
    this.reqByAsset = new Map(); // `${scope}\n${asset}` -> { all: [], open: n }
    for (const r of this.requests) {
      let s = this.reqByScope.get(r.scope);
      if (!s) this.reqByScope.set(r.scope, (s = []));
      s.push(r);
      if (!r.target || !r.target.asset) continue;
      const k = `${r.scope}\n${r.target.asset}`;
      let a = this.reqByAsset.get(k);
      if (!a) this.reqByAsset.set(k, (a = { all: [], open: 0 }));
      a.all.push(r);
      if (r.status === 'open' || r.status === 'in-progress') a.open++;
    }
  }

  requestsFor(pid, assetId = null) {
    if (!this.reqByScope) this.indexRequests();
    if (!assetId) return this.reqByScope.get(pid) || [];
    const a = this.reqByAsset.get(`${pid}\n${assetId}`);
    return a ? a.all : [];
  }

  openRequestCount(pid, assetId) {
    if (!this.reqByAsset) this.indexRequests();
    const a = this.reqByAsset.get(`${pid}\n${assetId}`);
    return a ? a.open : 0;
  }

  openRequest(r) { this.go('inbox'); this.views.inbox.open(r); }

  updateCounts() {
    if (!this.navBtns) return;
    const pid = this.project && this.project.id;
    const openHere = this.requests.filter((r) => r.scope === pid && (r.status === 'open' || r.status === 'in-progress')).length;
    const forYou = this.requests.filter((r) => r.assignee === 'user' && r.status === 'open').length;
    setBadge(this.navBtns.inbox, forYou || openHere, forYou ? '' : 'teal', forYou ? `${forYou} waiting on you` : `${openHere} open for the AI`);
    const st = this.styleOf(this.project);
    setBadge(this.navBtns.lessons, st ? st.undistilled : 0, 'orchid', st ? `${st.undistilled} edits the AI hasn't learned from yet` : '');
  }

  async onLessonsAdded(n) {
    if (!n) return;
    await this.reloadStyles();
    this.updateCounts();
    this.views.lessons.refresh();
  }

  // ================================================================== game ===
  gameRunning(pid) { return this.running.has(pid); }

  renderPlay() {
    const p = this.project;
    const run = p && this.running.has(p.id);
    this.playBtn.classList.toggle('running', !!run);
    this.playBtn.disabled = !p || !p.hasGame;
    this.playBtn.title = !p ? '' : !p.hasGame ? `${p.gamePath} does not exist yet` : run ? 'Game running — click for options. In the game: F9 sends the moment to the studio, F5 restarts.' : `Play ${p.name} in its own window (edits apply live)`;
    mount(this.playBtn, icon(run ? 'dot' : 'play'), h('span', null, run ? 'Running' : 'Play'));
  }

  async playClicked(anchor) {
    const p = this.project;
    if (!p) return;
    if (!this.running.has(p.id)) {
      try { await api.game.launch(p.id); this.running.add(p.id); this.renderPlay(); toast(`${p.name} is running. Press F9 in the game to send a moment to the studio.`, { kind: 'ok', timeout: 5000 }); }
      catch (err) { toast(err.message, { kind: 'error' }); }
      return;
    }
    popMenu(anchor, [
      { label: 'Bring game to front', ico: 'game', fn: () => api.game.launch(p.id) },
      { label: 'Restart game', ico: 'refresh', hint: 'F5', fn: () => api.game.reload(p.id) },
      { label: 'Close game', ico: 'close', fn: () => api.game.close(p.id) },
      '-',
      { label: 'Report a bug from the console…', ico: 'bot', fn: async () => { const lines = await api.game.console(p.id).catch(() => []); openRequestDialog(this, { scope: p.id, kind: 'bug', title: '', context: { console: lines } }); } },
    ], { align: 'right' });
  }

  onMoment(m) {
    const p = this.projects.find((x) => x.id === m.projectId);
    openRequestDialog(this, {
      scope: m.projectId, dialogTitle: `Talk about this moment${p ? ` in ${p.name}` : ''}`, kind: 'gameplay',
      attachments: [m.dataUrl], context: { state: m.state, console: m.console },
    });
  }

  onGameConsole(c) {
    if (c.level !== 'error' || this.gameErrorsShown.has(c.projectId)) return;
    this.gameErrorsShown.add(c.projectId);
    const p = this.projects.find((x) => x.id === c.projectId);
    toast(`${p ? p.name : c.projectId} logged an error: ${String(c.message).slice(0, 140)}`, {
      kind: 'error', timeout: 9000,
      action: { label: 'Ask AI', fn: async () => { const lines = await api.game.console(c.projectId).catch(() => []); openRequestDialog(this, { scope: c.projectId, kind: 'bug', title: 'Runtime error in the game', context: { console: lines } }); } },
    });
  }

  // ================================================================== live ===
  async onFs(changes) {
    if (window.__fsLog) window.__fsLog.push(JSON.parse(JSON.stringify(changes)));
    this.lastChange = Date.now();
    const LABEL = { code: 'Code changed', docs: 'Docs changed', edits: 'Pixel edits changed', requests: 'Requests changed', styles: 'A game look / lessons changed', designs: 'Design library changed', ideas: 'Ideas changed', projects: 'Games changed' };
    for (const c of changes) {
      if (!LABEL[c.kind]) continue;
      const files = (c.files && c.files.length ? c.files : [c.file]).filter(Boolean);
      this.logActivity(`${LABEL[c.kind]}: ${files.slice(0, 3).join(', ')}${files.length > 3 ? ` +${files.length - 3} more` : ''}${c.viaPoll ? ' (caught by the safety-net scan)' : ''}`, c.viaPoll ? 'warn' : '');
    }
    this.renderLive(true);
    const kinds = new Set(changes.map((c) => c.kind));
    if (kinds.has('projects')) {
      const added = await this.reloadProjects();
      for (const p of added) toast(`New game: ${p.name}`, { kind: 'live', action: { label: 'Open', fn: () => this.setProject(p.id) } });
      if (this.project && !this.projects.some((p) => p.id === this.project.id)) {
        toast(`${this.project.name} was removed from games/.`, { kind: 'warn' });
        this.project = null; this.host = null;
        const next = this.projects.find((p) => p.status === 'active');
        if (next) await this.setProject(next.id);
      }
      this.views.projects.render();
      this.renderPlay();
    }
    const reqScopes = [...new Set(changes.filter((c) => c.kind === 'requests').map((c) => c.project))];
    for (const s of reqScopes) await this.reloadRequests(s);
    if (reqScopes.length) this.views.inbox.refresh();
    if (kinds.has('styles')) { await this.reloadStyles(); this.updateCounts(); this.views.lessons.refresh(); }
    if (kinds.has('ideas')) this.views.ideas.refresh();
    if (kinds.has('designs')) await this.reloadDesigns();
    await this.views.art.onFsChange(changes);
    if (kinds.has('code') || kinds.has('edits')) this.views.projects.render();
  }

  renderLive(flash = false) {
    const t = this.lastChange;
    this.liveEl.lastChild.textContent = t ? `Live · ${timeAgo(new Date(t).toISOString())}` : 'Live';
    if (flash) { this.liveEl.classList.remove('flash'); void this.liveEl.offsetWidth; this.liveEl.classList.add('flash'); }
  }

  onKey(e) {
    if (e.key === 'F1') { e.preventDefault(); showHelp(this); return; }
    if (e.key === 'F5' && !e.ctrlKey) { e.preventDefault(); this.views.art.reloadArt('manual'); return; }
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    if (this.view !== 'art' || !this.views.art.session) {
      const idx = ['1', '2', '3', '4', '5'].indexOf(e.key);
      if (idx >= 0) this.go(NAV[idx][0]);
    }
  }

  copyPrompt(text, what = 'Prompt') { copyText(text).then(() => toast(`${what} copied — paste it into your AI chat.`, { kind: 'ok' })); }
  requestPrompt(r) { return requestPrompt(r, this.projects.find((p) => p.id === r.scope)); }
}

function setBadge(btnEl, n, cls, title) {
  const b = btnEl.querySelector('.badge');
  b.className = `badge${cls ? ' ' + cls : ''}${n ? '' : ' hidden'}`;
  b.textContent = n > 99 ? '99+' : String(n);
  b.title = title || '';
}

const SW = ['#f4c443', '#3acbc9', '#da63c3', '#ff9d20', '#6c8ee0', '#31cb7b', '#e8705a', '#a46cf0'];
function swatchColor(id) { let h2 = 0; for (const c of id) h2 = (h2 * 31 + c.charCodeAt(0)) >>> 0; return SW[h2 % SW.length]; }

// 16x16 pixel logo: a tiny gold-ramp gem, drawn like everything else — in code.
function drawLogo(c) {
  const g = c.getContext('2d');
  const rows = [
    '................', '......kkkk......', '....kkddddkk....', '...kdbbccddek...', '..kdbaabccddek..', '..kbaaabbccdek..', '.kdbaabbbccddek.', '.kdbbbbbcccddek.',
    '.kddbbccccddeek.', '.kdddccccddeeek.', '..kdddddddeeek..', '..kkeddddeeekk..', '....kkeeeekk....', '......kkkk......', '................', '................',
  ];
  const pal = { k: '#0c1024', a: '#fff2a6', b: '#f4c443', c: '#c98b1d', d: '#7c4a10', e: '#3d1f07' };
  rows.forEach((r, y) => [...r].forEach((ch, x) => { if (pal[ch]) { g.fillStyle = pal[ch]; g.fillRect(x, y, 1, 1); } }));
}

const app = new App();
window.__studio = app;
app.boot().catch((err) => {
  console.error(err);
  document.body.append(h('div.err-box', { style: { position: 'fixed', inset: '20px', zIndex: 200 } }, `Pixel Yak failed to start:\n\n${err.stack || err.message}`));
});
