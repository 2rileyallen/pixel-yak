// studio/ui/js/views/inbox.js — requests between the user and the AI, both directions. Files live
// in games/<id>/requests/ (and local/inbox/ for requests about Pixel Yak itself); the AI works them through the
// CLI (`node cli/yak.mjs inbox`), and status changes show up here live.
import { h, mount, btn, toast, confirmDialog, timeAgo, field, select } from '../ui.js';
import { icon } from '../icons.js';
import { openRequestDialog, KIND_LABEL } from '../request-dialog.js';
import { inboxPrompt } from '../prompts.js';

const STATUS = [['open', 'Open'], ['in-progress', 'In progress'], ['done', 'Done'], ['all', 'All']];
const KIND_TAG = { art: 'gold', frames: 'gold', animation: 'gold', audio: 'teal', gameplay: 'sky', level: 'sky', story: 'sky', bug: 'red', style: 'orchid', kickoff: 'orchid', review: 'fire', studio: 'teal', other: '' };
const STATUS_TAG = { open: 'sky', 'in-progress': 'fire', done: 'jade', wontfix: '' };

export class InboxView {
  constructor(app) {
    this.app = app;
    this.el = h('section.view.split');
    this.scope = 'project';
    this.status = 'open';
    this.who = 'all';
    this.sel = null;
    this.archived = null; // closed requests moved to requests/archive/, loaded only for Done / All
    this.left = h('div.pane.left');
    this.right = h('div.pane');
    mount(this.el, this.left, this.right);
  }

  setProject() { this.sel = null; this.render(); }
  onShow() { this.render(); }
  refresh() { this.archived = null; this.render(); }

  wantsArchive() { return this.status === 'done' || this.status === 'all'; }

  async loadArchive() {
    if (this._loadingArchive) return;
    this._loadingArchive = true;
    try {
      const all = await window.studio.requests.list('all', { archived: true });
      this.archived = all.filter((r) => r.archived);
    } catch { this.archived = []; }
    this._loadingArchive = false;
    this.render();
  }

  pool() { return this.wantsArchive() && this.archived ? [...this.app.requests, ...this.archived] : this.app.requests; }

  items() {
    const pid = this.app.project && this.app.project.id;
    if (this.wantsArchive() && !this.archived) this.loadArchive();
    return this.pool().filter((r) => {
      if (this.scope === 'project' && r.scope !== pid) return false;
      if (this.scope === 'studio' && r.scope !== '_studio') return false;
      if (this.status !== 'all' && r.status !== this.status) return false;
      if (this.who !== 'all' && r.assignee !== this.who) return false;
      return true;
    });
  }

  open(r) {
    if (r.scope !== (this.app.project && this.app.project.id)) this.scope = r.scope === '_studio' ? 'studio' : 'all';
    this.status = 'all';
    this.sel = r.id;
    this.render();
  }

  render() {
    const items = this.items();
    const pname = this.app.project ? this.app.project.name : 'this game';
    const seg = (opts, cur, set) => h('div.seg', null, opts.map(([v, l]) => h(`button${cur === v ? '.on' : ''}`, { type: 'button', onclick: () => { set(v); this.render(); } }, l)));
    const openAi = this.app.requests.filter((r) => r.scope === (this.app.project && this.app.project.id) && r.assignee === 'ai' && (r.status === 'open' || r.status === 'in-progress')).length;
    mount(this.left,
      h('div.pane-head', null,
        h('h1', null, icon('inbox'), 'Inbox', h('div.grow'), btn('New', () => openRequestDialog(this.app, { onSaved: (r) => { this.sel = r.id; } }), { kind: 'primary', ico: 'plus', small: true })),
        h('p', null, 'Requests for the AI and things it asks you. Paste the prompt into your AI chat; it updates these as it works.'),
        seg([['project', pname], ['all', 'All games'], ['studio', 'Studio']], this.scope, (v) => { this.scope = v; }),
        h('div.row', { style: { flexWrap: 'wrap' } }, seg(STATUS, this.status, (v) => { this.status = v; }), seg([['all', 'Everyone'], ['ai', 'AI'], ['user', 'You']], this.who, (v) => { this.who = v; })),
        openAi && this.scope === 'project' ? btn(`Copy prompt: ${openAi} open for the AI`, () => this.app.copyPrompt(inboxPrompt(this.app.project, openAi)), { kind: 'teal', ico: 'send', small: true }) : null),
      h('div.pane-scroll', null, items.length ? items.map((r) => this.card(r)) : h('div.empty', null, icon('inbox'), h('h3', null, 'Nothing here'), h('p', null, this.status === 'open' ? 'No open requests. Use Ask AI on any frame, or press F9 while playing.' : 'No requests match these filters.'))));
    const cur = this.pool().find((r) => r.id === this.sel);
    mount(this.right, cur ? this.detail(cur) : this.placeholder());
  }

  card(r) {
    const proj = this.app.projects.find((p) => p.id === r.scope);
    return h(`div.card${r.id === this.sel ? '.on' : ''}`, { onclick: () => { this.sel = r.id; this.render(); } },
      h('div.grow', null,
        h('div.ct', null, r.title),
        h('div.cm', null,
          h(`span.tag.${STATUS_TAG[r.status] || ''}`, null, r.status === 'in-progress' ? 'working' : r.status),
          r.archived ? h('span.tag', { title: 'Moved to requests/archive/ (node cli/yak.mjs archive)' }, 'archived') : null,
          r.assignee === 'user' ? h('span.tag.fire', null, 'for you') : null,
          h(`span.tag.${KIND_TAG[r.kind] || ''}`, null, r.kind),
          r.tier !== 'any' ? h('span.tag', null, r.tier) : null,
          r.target && r.target.asset ? h('span.mono', null, `${r.target.asset}${r.target.pose ? ':' + r.target.pose : ''}`) : null,
          this.scope !== 'project' ? h('span', null, proj ? proj.name : r.scope === '_studio' ? 'Studio' : r.scope) : null,
          h('span', null, `· ${timeAgo(r.updatedAt)}`),
          r.createdBy === 'ai' ? h('span', { title: 'Created by the AI' }, icon('bot')) : null)),
      r.attachments.length ? h('div.thumb-s', null, h('img', { src: this.attUrl(r, r.attachments[0]), alt: '', style: { maxWidth: '100%', maxHeight: '100%', imageRendering: 'pixelated' } })) : null);
  }

  attUrl(r, name) {
    const base = r.scope === '_studio' ? 'local/inbox' : `games/${r.scope}/requests`;
    return `/${base}${r.archived ? '/archive' : ''}/${encodeURIComponent(name)}`;
  }

  placeholder() {
    return h('div.detail', null, h('div.empty', { style: { flex: 1 } }, icon('bot'), h('h3', null, 'How requests work'),
      h('p', null, 'Ask for anything — more frames, a fix, a new enemy, a level change. Each request is a small file the AI reads with the studio CLI. When it finishes, it marks the request done with what it changed, and you see it here instantly.'),
      h('p', null, 'The AI can also send requests to you: art reviews, and the gate questions from the playbook ("Is this the game?").')));
  }

  detail(r) {
    const proj = this.app.projects.find((p) => p.id === r.scope);
    const title = h('input.input', { value: r.title, maxlength: 200, style: { fontSize: '17px', fontWeight: 600 } });
    const body = h('textarea.input', { rows: Math.min(18, Math.max(6, r.body.split('\n').length + 2)) }, r.body);
    const kind = select(Object.entries(KIND_LABEL), r.kind, null);
    const tier = select([['any', 'Any model'], ['builder', 'Builder model'], ['smart', 'Smart model']], r.tier, null);
    const who = select([['ai', 'The AI'], ['user', 'Me']], r.assignee, null);
    const saveEdits = btn('Save changes', async () => {
      try {
        await window.studio.requests.update(r.scope, r.id, { title: title.value.trim() || r.title, body: body.value, kind: kind.value, tier: tier.value, assignee: who.value, note: 'edited' });
        await this.app.reloadRequests(r.scope); this.archived = null;
        this.render();
        toast('Request updated', { kind: 'ok', timeout: 1600 });
      } catch (err) { toast(err.message, { kind: 'error' }); }
    }, { kind: 'primary', ico: 'save', small: true });
    saveEdits.classList.add('hidden');
    for (const el of [title, body, kind, tier, who]) el.addEventListener('input', () => saveEdits.classList.remove('hidden'));
    const setStatus = async (status, note) => {
      try {
        await window.studio.requests.update(r.scope, r.id, { status, note });
        await this.app.reloadRequests(r.scope); this.archived = null;
        this.render();
      } catch (err) { toast(err.message, { kind: 'error' }); }
    };
    const t = r.target;
    const openTarget = async () => {
      if (r.scope !== (this.app.project && this.app.project.id)) await this.app.setProject(r.scope);
      this.app.go('art');
      await this.app.views.art.selectAsset(t.asset, { pose: t.pose, anim: t.anim });
    };
    return h('div.detail', null,
      h('div.head-row', null, h('div.grow', null, title),
        h('div.row', null,
          r.assignee === 'ai' && r.status !== 'done' ? btn('Copy prompt for AI', () => this.app.copyPrompt(this.app.requestPrompt(r)), { kind: 'teal', ico: 'send', small: true }) : null)),
      h('div.row', { style: { flexWrap: 'wrap' } },
        h(`span.tag.${STATUS_TAG[r.status] || ''}`, null, r.status === 'in-progress' ? 'AI is working' : r.status),
        h(`span.tag.${KIND_TAG[r.kind] || ''}`, null, r.kind),
        h('span.dim', null, `${proj ? proj.name : r.scope === '_studio' ? 'Pixel Yak' : r.scope} · created ${timeAgo(r.createdAt)} by ${r.createdBy === 'ai' ? 'the AI' : 'you'} · ${r.id}`)),
      t && t.asset ? h('div.target-pill', null, icon('art'), h('div.grow', null, h('b.mono', null, t.asset), t.pose ? h('span.dim', null, ` · ${t.pose}`) : null, t.anim ? h('span.dim', null, ` · anim ${t.anim}`) : null, t.box ? h('span.dim', null, ` · area ${t.box.x},${t.box.y} ${t.box.w}×${t.box.h}`) : null),
        btn('Open in Art', openTarget, { small: true, ico: 'open' })) : null,
      r.resolution ? h('div.note-box.teal', null, h('b', null, 'What the AI did: '), r.resolution) : null,
      field('Details', body),
      h('div.form-grid', { style: { gridTemplateColumns: 'repeat(3, 1fr)' } }, field('Kind', kind), field('Model', tier), field('Who does it', who)),
      h('div.row', null, saveEdits),
      r.attachments.length ? field('Attachments', h('div.attachments', null, r.attachments.map((a) => h('img', { src: this.attUrl(r, a), alt: a, title: 'Click to enlarge', onclick: (e) => lightbox(e.target.src) })))) : null,
      r.history.length ? field('History', h('div.history', null, r.history.slice().reverse().map((x) => h(`div.hi${x.by === 'ai' ? '.ai' : ''}`, null,
        h('b', null, x.by === 'ai' ? 'AI' : 'You'), x.status ? ` → ${x.status}` : '', x.note ? h('span', null, ` — ${x.note}`) : null, h('span.when', null, timeAgo(x.ts)))))) : null,
      h('div.row', { style: { borderTop: '1px solid var(--line)', paddingTop: '14px', flexWrap: 'wrap' } },
        r.status !== 'done' ? btn(r.assignee === 'user' ? 'Done' : 'Mark done', () => setStatus('done', 'closed by you'), { kind: 'primary', ico: 'check', small: true }) : btn('Reopen', () => setStatus('open', 'reopened'), { ico: 'revert', small: true }),
        r.status === 'open' ? btn('Won\'t do', () => setStatus('wontfix', 'dropped'), { small: true, kind: 'ghost' }) : null,
        h('div.grow'),
        btn('Delete', async () => {
          if (!(await confirmDialog('Delete request?', `"${r.title}" and its attachments will be deleted.`, { okLabel: 'Delete', danger: true }))) return;
          try { await window.studio.requests.remove(r.scope, r.id); this.sel = null; await this.app.reloadRequests(r.scope); this.archived = null; this.render(); } catch (err) { toast(err.message, { kind: 'error' }); }
        }, { kind: 'danger', ico: 'trash', small: true })));
  }
}

function lightbox(src) {
  const el = h('div.lightbox', { onclick: () => el.remove() }, h('img', { src, alt: '' }));
  document.body.append(el);
}
