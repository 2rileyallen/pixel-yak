// studio/ui/js/views/inbox.js — requests between the user and the AI, both directions, with
// "brief me first": the AI reads a request and saves a brief (status planned); the user answers
// here with Go, Add note or Not now; the AI works only what was approved (skill requests). Files
// live in games/<id>/requests/ (and local/inbox/ for Pixel Yak itself); the AI works them through
// the CLI (`node cli/yak.mjs inbox`), and every change shows up here live.
import { h, mount, btn, toast, confirmDialog, timeAgo, field, select, modal } from '../ui.js';
import { icon } from '../icons.js';
import { openRequestDialog, kindOptions } from '../request-dialog.js';
import { inboxPrompt, approvedPrompt } from '../prompts.js';

const live = (r) => r.status !== 'done' && r.status !== 'wontfix' && r.status !== 'parked';
// The status filter: [value, label, test]. "Active" (everything still on someone's plate) is the default.
const FILTERS = [
  ['active', 'Active', live],
  ['open', 'Open', (r) => r.status === 'open'],
  ['planned', 'Briefed', (r) => r.status === 'planned'],
  ['approved', 'Ready', (r) => r.status === 'approved'],
  ['in-progress', 'In progress', (r) => r.status === 'in-progress'],
  ['done', 'Done', (r) => r.status === 'done' || r.status === 'wontfix'],
  ['parked', 'Parked', (r) => r.status === 'parked'],
  ['all', 'All', () => true],
];
const EMPTY = {
  active: 'Nothing on anyone\'s plate. Ask for something with New, Ask AI on any frame, or F9 while playing.',
  open: 'Nothing waiting for a brief.',
  planned: 'No briefs waiting for you. When the AI briefs a request, it shows here with Go, Add note and Not now.',
  approved: 'Nothing approved and waiting. Say Go on a brief, or tick "Just do it" when you file a request.',
  'in-progress': 'The AI isn\'t working on anything right now.',
  done: 'Nothing finished yet.',
  parked: 'Nothing parked. "Not now" puts a request here, out of the way.',
  all: 'No requests yet.',
};
// [label, tag colour] per status, from the user's side of the table.
const STATUS = {
  open: ['to brief', 'sky'], planned: ['briefed — your call', 'fire'], approved: ['ready', 'jade'], 'in-progress': ['AI working', 'teal'],
  done: ['done', 'jade'], wontfix: ['won\'t do', ''], parked: ['parked', ''],
};
// How each status change reads in the history ("AI → briefed", "You → go").
const HIST = { open: 'open', planned: 'briefed', approved: 'go', 'in-progress': 'started', done: 'done', wontfix: "won't do", parked: 'not now' };
const KIND_TAG = { art: 'gold', frames: 'gold', animation: 'gold', audio: 'teal', gameplay: 'sky', level: 'sky', story: 'sky', bug: 'red', style: 'orchid', design: 'orchid', tuning: 'orchid', promo: 'teal', kickoff: 'orchid', review: 'fire', studio: 'teal', other: '' };
// Waiting on the user first, then ready, working, to brief, parked, closed; newest first within each.
const rank = (r) => (r.assignee === 'user' && live(r) ? 0 : { planned: 0, approved: 1, 'in-progress': 2, open: 3, parked: 4 }[r.status] ?? 5);
const saved = (() => { try { return JSON.parse(localStorage.getItem('yak.inbox') || '{}') || {}; } catch { return {}; } })();

export class InboxView {
  constructor(app) {
    this.app = app;
    this.el = h('section.view.split.inbox');
    this.scope = ['project', 'all', 'studio'].includes(saved.scope) ? saved.scope : 'project';
    this.status = FILTERS.some(([v]) => v === saved.status) ? saved.status : 'active';
    this.who = ['all', 'ai', 'user'].includes(saved.who) ? saved.who : 'all';
    this.sel = null;
    this.archived = null; // closed requests moved to requests/archive/, loaded only for Done / All
    this.left = h('div.pane.left');
    this.right = h('div.pane');
    mount(this.el, this.left, this.right);
  }

  setProject() { this.sel = null; this.render(); }
  onShow() { this.render(); }
  refresh() { this.archived = null; this.render(); }
  remember() { try { localStorage.setItem('yak.inbox', JSON.stringify({ scope: this.scope, status: this.status, who: this.who })); } catch { /* private mode */ } }

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

  // Requests in the chosen scope and "who", before the status filter (the chips count these).
  scoped() {
    const pid = this.app.project && this.app.project.id;
    if (this.wantsArchive() && !this.archived) this.loadArchive();
    return this.pool().filter((r) => {
      if (this.scope === 'project' && r.scope !== pid) return false;
      if (this.scope === 'studio' && r.scope !== '_studio') return false;
      if (this.who !== 'all' && r.assignee !== this.who) return false;
      return true;
    });
  }

  open(r) {
    if (r.scope !== (this.app.project && this.app.project.id)) this.scope = r.scope === '_studio' ? 'studio' : 'all';
    if (!FILTERS.find(([v]) => v === this.status)[2](r)) this.status = live(r) ? 'active' : 'all';
    this.sel = r.id;
    this.remember();
    this.render();
  }

  render() {
    const scoped = this.scoped();
    const test = FILTERS.find(([v]) => v === this.status)[2];
    const items = scoped.filter(test).sort((a, b) => rank(a) - rank(b) || b.createdAt.localeCompare(a.createdAt));
    const pid = this.app.project && this.app.project.id;
    const pname = this.app.project ? this.app.project.name : 'This game';
    const seg = (opts, cur, set) => h('div.seg', null, opts.map(([v, l]) => h(`button${cur === v ? '.on' : ''}`, { type: 'button', onclick: () => { set(v); this.remember(); this.render(); } }, l)));
    const mine = this.app.requests.filter((r) => r.scope === pid && r.assignee === 'ai');
    const toBrief = mine.filter((r) => r.status === 'open').length;
    const ready = mine.filter((r) => r.status === 'approved').length;
    const chips = h('div.inbox-filters', { role: 'tablist', 'aria-label': 'Filter by status' }, FILTERS.map(([v, label, t]) => {
      const n = v === 'all' || (v === 'done' && !this.archived) ? 0 : scoped.filter(t).length;
      const attn = v === 'planned' && n > 0;
      return h(`button.fchip${this.status === v ? '.on' : ''}${attn ? '.attn' : ''}`, { type: 'button', role: 'tab', 'aria-selected': String(this.status === v), onclick: () => { this.status = v; this.remember(); this.render(); } },
        label, n ? h('span.n', null, String(n)) : null);
    }));
    mount(this.left,
      h('div.pane-head', null,
        h('h1', null, icon('inbox'), 'Inbox', h('div.grow'), btn('New', () => openRequestDialog(this.app, { onSaved: (r) => { this.sel = r.id; } }), { kind: 'primary', ico: 'plus', small: true })),
        h('p', null, 'The AI briefs you on each request before it changes anything. Say Go, add a note, or Not now.'),
        h('div.row.inbox-scope', null, seg([['project', pname], ['all', 'All games'], ['studio', 'Pixel Yak']], this.scope, (v) => { this.scope = v; }), h('div.grow'),
          seg([['all', 'Everyone'], ['ai', 'AI'], ['user', 'You']], this.who, (v) => { this.who = v; })),
        chips,
        this.scope === 'project' && (toBrief || ready) ? h('div.row.inbox-prompts', null,
          toBrief ? btn(`Brief me on ${toBrief} open`, () => this.app.copyPrompt(inboxPrompt(this.app.project, toBrief)), { kind: 'teal', ico: 'send', small: true, title: 'Copies a prompt for your AI chat: it reads each open request and briefs you before changing anything' }) : null,
          ready ? btn(`Work ${ready} approved`, () => this.app.copyPrompt(approvedPrompt(this.app.project, ready)), { kind: 'teal', ico: 'play', small: true, title: 'Copies a prompt for your AI chat: it works the requests you said Go to' }) : null) : null),
      h('div.pane-scroll', null, items.length ? items.map((r) => this.card(r))
        : h('div.empty', null, icon('inbox'), h('h3', null, 'Nothing here'), h('p', null, EMPTY[this.status]))));
    const cur = this.pool().find((r) => r.id === this.sel);
    mount(this.right, cur ? this.detail(cur) : this.placeholder());
  }

  statusTag(r) {
    if (r.assignee === 'user' && live(r)) return h('span.tag.fire', null, 'for you');
    const [label, cls] = STATUS[r.status] || [r.status, ''];
    return h(`span.tag${cls ? '.' + cls : ''}`, null, r.status === 'in-progress' && r.claimedBy && r.claimedBy !== 'ai' ? `${r.claimedBy} working` : label);
  }

  card(r) {
    const proj = this.app.projects.find((p) => p.id === r.scope);
    const attn = r.status === 'planned' || (r.assignee === 'user' && live(r));
    const firstPlan = r.status === 'planned' && r.plan ? planLines(r.plan).find((l) => /^i'?d change|^i would change/i.test(l)) || planLines(r.plan)[0] : null;
    return h(`div.card.req${r.id === this.sel ? '.on' : ''}${attn ? '.attn' : ''}${r.status === 'approved' ? '.ready' : ''}`, { onclick: () => { this.sel = r.id; this.render(); } },
      h('div.grow', null,
        h('div.ct', null, r.title),
        firstPlan ? h('div.plan-line', null, icon('bot'), h('span', null, firstPlan)) : null,
        h('div.cm', null,
          this.statusTag(r),
          r.createdBy === 'web' ? h('span.tag.orchid', { title: 'Filed by a player of the online build' }, 'from a player') : null,
          r.goNow ? h('span.tag.gold', { title: 'Filed with "Just do it": no brief' }, 'just do it') : null,
          r.archived ? h('span.tag', { title: 'Moved to requests/archive/ (node cli/yak.mjs archive)' }, 'archived') : null,
          h(`span.tag.${KIND_TAG[r.kind] || ''}`, null, r.kind),
          r.tier !== 'any' ? h('span.tag', null, r.tier) : null,
          r.target && r.target.asset ? h('span.mono', null, `${r.target.asset}${r.target.pose ? ':' + r.target.pose : ''}`) : null,
          this.scope !== 'project' ? h('span', null, proj ? proj.name : r.scope === '_studio' ? 'Pixel Yak' : r.scope) : null,
          r.notes.length ? h('span', { title: `${r.notes.length} note${r.notes.length === 1 ? '' : 's'} from you` }, icon('pencil'), String(r.notes.length)) : null,
          h('span', null, `· ${timeAgo(r.updatedAt)}`),
          r.createdBy === 'ai' ? h('span', { title: 'Created by the AI' }, icon('bot')) : null)),
      r.attachments.length ? h('div.thumb-s', null, /\.png$/.test(r.attachments[0]) ? h('img', { src: this.attUrl(r, r.attachments[0]), alt: '', style: { maxWidth: '100%', maxHeight: '100%', imageRendering: 'pixelated' } }) : icon('sound')) : null);
  }

  attUrl(r, name) {
    const base = r.scope === '_studio' ? 'local/inbox' : `games/${r.scope}/requests`;
    return `/${base}${r.archived ? '/archive' : ''}/${encodeURIComponent(name)}`;
  }

  placeholder() {
    return h('div.detail', null, h('div.empty', { style: { flex: 1 } }, icon('bot'), h('h3', null, 'How requests work'),
      h('ol.how', null,
        h('li', null, h('b', null, 'You ask'), ' for anything — more frames, a fix, a new enemy, a level change.'),
        h('li', null, h('b', null, 'The AI briefs you'), ': what it thinks you\'re asking, what it would change, what it\'s unsure of, and how big it is.'),
        h('li', null, h('b', null, 'You answer'), ' with Go, a note, or Not now. Nothing changes before your Go.'),
        h('li', null, h('b', null, 'The AI works it'), ' and marks it done with what it changed — you see it here instantly.')),
      h('p', null, 'In a hurry? Tick "Just do it" when you file a request and the AI skips the brief. Players\' tickets from an online build are always briefed.')));
  }

  async update(r, patch, msg = null) {
    try {
      await window.studio.requests.update(r.scope, r.id, patch);
      await this.app.reloadRequests(r.scope); this.archived = null;
      this.render();
      if (msg) toast(msg.text, { kind: 'ok', timeout: msg.timeout || 4200, action: msg.action || null });
      return true;
    } catch (err) { toast(err.message, { kind: 'error' }); return false; }
  }

  go(r) {
    const proj = this.app.projects.find((p) => p.id === r.scope);
    return this.update(r, { status: 'approved', note: 'go' }, {
      text: 'Go — the AI can start on it.', timeout: 6000,
      action: proj ? { label: 'Copy prompt', fn: () => this.app.copyPrompt(approvedPrompt(proj, this.app.requests.filter((x) => x.scope === proj.id && x.assignee === 'ai' && x.status === 'approved').length || 1)) } : null,
    });
  }

  notNow(r) {
    const was = r.status;
    return this.update(r, { status: 'parked', note: 'not now' }, { text: 'Parked — it waits in Parked until you bring it back.', action: { label: 'Undo', fn: () => this.update(r, { status: was, note: 'undo not now' }) } });
  }

  noteDialog(r) {
    const text = h('textarea.input', { rows: 5, placeholder: r.status === 'planned' ? 'e.g. Yes, but keep the old colour on the roof.' : 'Anything the AI should know before or while it works on this.', autofocus: true });
    const save = async (status) => {
      const t = text.value.trim();
      if (!t) { text.focus(); toast('Write the note first', { kind: 'warn' }); return false; }
      const patch = { addNote: t };
      if (status === 'approved') Object.assign(patch, { status, note: 'go, with a note' });
      if (status === 'open') Object.assign(patch, { status, note: 'asked for a new brief' });
      return (await this.update(r, patch, { text: status === 'approved' ? 'Go — with your note.' : status === 'open' ? 'Sent back: the AI will read your note and brief you again.' : 'Note added.' })) ? true : false;
    };
    modal({
      title: `Add a note — ${r.title}`,
      body: h('div.col', null,
        h('p.dim', { style: { margin: 0 } }, r.status === 'planned' ? 'Your note goes onto the ticket under the AI\'s brief. Send it back for a new brief, or say Go with the note as a condition.' : 'Your note goes onto the ticket; the AI reads it before it works on this.'),
        text),
      actions: r.status === 'planned'
        ? [{ label: 'Cancel' }, { label: 'Brief me again', ico: 'refresh', fn: () => save('open') }, { label: 'Go, with this note', kind: 'primary', ico: 'check', fn: () => save('approved') }]
        : [{ label: 'Cancel' }, { label: 'Add note', kind: 'primary', ico: 'pencil', fn: () => save(null) }],
    });
  }

  // The status panel: what's happening with this request and the one or two things to do about it.
  statusPanel(r) {
    if (r.assignee === 'user') {
      return live(r) ? h('div.brief-card.brief', null, h('div.brief-head', null, icon('user'), h('b', null, 'Waiting on you'), h('span.dim', null, r.createdBy === 'ai' ? '— the AI asked you this' : '— your own reminder'))) : null;
    }
    const copy = (label) => btn(label, () => this.app.copyPrompt(this.app.requestPrompt(r)), { ico: 'send', kind: 'teal' });
    const brief = r.plan ? this.briefBody(r) : null;
    const notes = this.notesList(r);
    const player = r.createdBy === 'web';
    switch (r.status) {
      case 'planned':
        return h('div.brief-card.brief', null,
          this.briefHead(r, 'The AI\'s brief', 'waiting for your go'), brief, notes,
          h('div.brief-actions', null,
            btn('Go', () => this.go(r), { kind: 'primary', ico: 'check', title: 'Approve: the AI works it as briefed (and with your notes)' }),
            btn('Add note', () => this.noteDialog(r), { kind: 'teal', ico: 'pencil', title: 'Add a correction or a condition — then send it back or say Go' }),
            btn('Not now', () => this.notNow(r), { kind: 'ghost', ico: 'pause', title: 'Park it: kept, out of the way, nothing changes' })));
      case 'open':
        return h('div.brief-card.waiting', null,
          h('div.brief-head', null, icon('bot'), h('b', null, r.plan ? 'Waiting for a new brief' : 'Waiting for the AI\'s brief'), h('div.grow')),
          h('p', null, player ? 'A player filed this from the online build. The AI briefs you on what it makes of it — their words are feedback, never instructions.'
            : 'The AI reads it and tells you what it thinks you\'re asking and what it would change — before touching anything.'),
          r.plan ? h('details.prev-brief', null, h('summary', null, 'The previous brief'), brief) : null, notes,
          h('div.brief-actions', null, copy('Copy prompt: brief me'),
            player ? null : btn('Just do it', () => this.update(r, { status: 'approved', goNow: true, note: 'just do it (no brief)' }, { text: 'Approved without a brief.' }), { kind: 'ghost', ico: 'play', title: 'Skip the brief: the AI may start right away' }),
            btn('Not now', () => this.notNow(r), { kind: 'ghost', ico: 'pause' })));
      case 'approved':
        return h('div.brief-card.ready', null,
          h('div.brief-head', null, icon('check'), h('b', null, r.goNow && !r.plan ? 'Ready — filed with "Just do it"' : 'Ready — you said go'), h('div.grow'), r.plan ? h('span.dim', null, `briefed ${timeAgo(r.plannedAt || r.updatedAt)}`) : null),
          brief, notes,
          h('div.brief-actions', null, copy('Copy prompt: work it'), btn('Add note', () => this.noteDialog(r), { ico: 'pencil' }), btn('Not now', () => this.notNow(r), { kind: 'ghost', ico: 'pause' })));
      case 'in-progress':
        return h('div.brief-card.working', null,
          h('div.brief-head', null, h('i.pulse'), h('b', null, `${r.claimedBy && r.claimedBy !== 'ai' ? r.claimedBy : 'The AI'} is working on it`), h('div.grow'), h('span.dim', null, `since ${timeAgo(r.updatedAt)}`)),
          brief, notes,
          h('div.brief-actions', null, btn('Add note', () => this.noteDialog(r), { ico: 'pencil' })));
      case 'parked':
        return h('div.brief-card.parked', null,
          h('div.brief-head', null, icon('pause'), h('b', null, 'Parked — you said not now'), h('div.grow')),
          brief, notes,
          h('div.brief-actions', null,
            r.plan || !player ? btn('Go', () => this.go(r), { kind: 'primary', ico: 'check' }) : null,
            btn(r.plan ? 'Brief me again' : 'Back to the inbox', () => this.update(r, { status: 'open', note: 'brought back' }, { text: 'Back in the inbox — the AI will brief it.' }), { ico: 'refresh' })));
      default: // done, wontfix
        return h('div.col', null,
          r.resolution ? h('div.note-box.teal', null, h('b', null, r.status === 'wontfix' ? 'Why the AI didn\'t: ' : 'What the AI did: '), r.resolution) : null,
          r.plan ? h('details.prev-brief', null, h('summary', null, 'The brief it worked from'), brief, notes) : notes);
    }
  }

  briefHead(r, title, sub) {
    const size = /\bsize\s*:\s*\**\s*([SML])\b/i.exec(r.plan || '');
    return h('div.brief-head', null, icon('bot'), h('b', null, title),
      size ? h('span.size', { title: 'Size: S small · M medium · L large' }, size[1].toUpperCase()) : null,
      h('div.grow'), h('span.dim', null, `${timeAgo(r.plannedAt || r.updatedAt)} · ${sub}`));
  }

  // The brief, one line per part, with "You asked:" / "I'd change:" / "Unsure:" / "Size:" in bold.
  briefBody(r) {
    return h('div.brief-body', null, planLines(r.plan).map((line) => {
      const m = /^([-*•]\s*)?(\*\*)?((?:you asked|i'?d change|i would change|unsure|size|risk|touches|decision)[^:]{0,24}):(\*\*)?\s*(.*)$/i.exec(line);
      return m ? h('div.bl', null, h('b', null, m[3] + ':'), ' ', m[5]) : h('div.bl', null, line);
    }));
  }

  notesList(r) {
    if (!r.notes.length) return null;
    const since = r.plannedAt || '';
    return h('div.brief-notes', null, h('div.field-label', null, 'Your notes'),
      r.notes.map((n) => h(`div.bn${since && n.ts > since && r.status === 'planned' ? '.new' : ''}`, null,
        h('span.who', null, n.by === 'ai' ? 'AI' : n.by === 'web' ? 'Player' : 'You'), h('span.txt', null, n.text), h('span.when', null, timeAgo(n.ts)))));
  }

  detail(r) {
    const proj = this.app.projects.find((p) => p.id === r.scope);
    const title = h('input.input', { value: r.title, maxlength: 200, style: { fontSize: '17px', fontWeight: 600 }, 'aria-label': 'Title' });
    const body = h('textarea.input', { rows: Math.min(18, Math.max(5, r.body.split('\n').length + 2)) }, r.body);
    const kind = select(kindOptions(this.app, r.kind), r.kind, null);
    const tier = select([['any', 'Any model'], ['builder', 'Builder model'], ['smart', 'Smart model']], r.tier, null);
    const who = select([['ai', 'The AI'], ['user', 'Me']], r.assignee, null);
    const saveEdits = btn('Save changes', () => this.update(r, { title: title.value.trim() || r.title, body: body.value, kind: kind.value, tier: tier.value, assignee: who.value, note: 'edited' }, { text: 'Request updated', timeout: 1600 }),
      { kind: 'primary', ico: 'save', small: true });
    saveEdits.classList.add('hidden');
    for (const el of [title, body, kind, tier, who]) el.addEventListener('input', () => saveEdits.classList.remove('hidden'));
    const t = r.target;
    const openTarget = async () => {
      if (r.scope !== (this.app.project && this.app.project.id)) await this.app.setProject(r.scope);
      this.app.go('art');
      await this.app.views.art.selectAsset(t.asset, { pose: t.pose, anim: t.anim });
    };
    const by = r.createdBy === 'ai' ? 'the AI' : r.createdBy === 'web' ? 'a player' : 'you';
    return h('div.detail.req-detail', null,
      h('div.head-row', null, h('div.grow', null, title)),
      h('div.row', { style: { flexWrap: 'wrap' } },
        this.statusTag(r),
        r.createdBy === 'web' ? h('span.tag.orchid', null, 'from a player') : null,
        r.goNow ? h('span.tag.gold', null, 'just do it') : null,
        h(`span.tag.${KIND_TAG[r.kind] || ''}`, null, r.kind),
        h('span.dim', null, `${proj ? proj.name : r.scope === '_studio' ? 'Pixel Yak' : r.scope} · created ${timeAgo(r.createdAt)} by ${by} · ${r.id}`)),
      this.statusPanel(r),
      t && t.asset ? h('div.target-pill', null, icon('art'), h('div.grow', null, h('b.mono', null, t.asset), t.pose ? h('span.dim', null, ` · ${t.pose}`) : null, t.anim ? h('span.dim', null, ` · anim ${t.anim}`) : null, t.box ? h('span.dim', null, ` · area ${t.box.x},${t.box.y} ${t.box.w}×${t.box.h}`) : null),
        btn('Open in Art', openTarget, { small: true, ico: 'open' })) : null,
      field(r.createdBy === 'web' ? 'What the player wrote' : r.createdBy === 'ai' ? (r.assignee === 'user' ? 'What the AI asks' : 'Details (filed by the AI)') : 'What you asked', body),
      h('div.form-grid', { style: { gridTemplateColumns: 'repeat(3, 1fr)' } }, field('Kind', kind), field('Model', tier), field('Who does it', who)),
      h('div.row', null, saveEdits),
      r.attachments.length ? field('Attachments', h('div.attachments', null, r.attachments.map((a) => (/\.png$/.test(a)
        ? h('img', { src: this.attUrl(r, a), alt: a, title: 'Click to enlarge', onclick: (e) => lightbox(e.target.src) })
        : h('div.col', null, h('span.dim', null, a), /\.mid$/.test(a) ? null : h('audio', { src: this.attUrl(r, a), controls: true, preload: 'none' })))))) : null,
      r.history.length ? field('History', h('div.history', null, r.history.slice().reverse().map((x) => h(`div.hi${x.by === 'ai' ? '.ai' : ''}`, null,
        h('b', null, x.by === 'ai' ? (x.who && x.who !== 'ai' ? `AI (${x.who})` : 'AI') : x.by === 'web' ? 'Player' : 'You'), x.status ? ` → ${HIST[x.status] || x.status}` : '',
        x.note && !(x.status && (x.note.toLowerCase() === HIST[x.status] || /^claimed by /.test(x.note))) ? h('span', null, ` — ${x.note}`) : null, h('span.when', null, timeAgo(x.ts)))))) : null,
      h('div.row', { style: { borderTop: '1px solid var(--line)', paddingTop: '14px', flexWrap: 'wrap' } },
        r.status === 'done' || r.status === 'wontfix' ? btn('Reopen', () => this.update(r, { status: 'open', note: 'reopened' }), { ico: 'revert', small: true })
          : btn(r.assignee === 'user' ? 'Done' : 'Mark done', () => this.update(r, { status: 'done', note: 'closed by you' }), { ico: 'check', small: true, kind: r.assignee === 'user' ? 'primary' : '' }),
        live(r) ? btn('Won\'t do', () => this.update(r, { status: 'wontfix', note: 'dropped' }), { small: true, kind: 'ghost' }) : null,
        h('div.grow'),
        btn('Delete', async () => {
          if (!(await confirmDialog('Delete request?', `"${r.title}" and its attachments will be deleted.`, { okLabel: 'Delete', danger: true }))) return;
          try { await window.studio.requests.remove(r.scope, r.id); this.sel = null; await this.app.reloadRequests(r.scope); this.archived = null; this.render(); } catch (err) { toast(err.message, { kind: 'error' }); }
        }, { kind: 'danger', ico: 'trash', small: true })));
  }
}

// A brief split into lines; a one-line "You asked: … · I'd change: … · Size: S" becomes one part per line.
function planLines(plan) {
  return String(plan || '').replace(/\s+[·|]\s+(?=(?:you asked|i'?d change|i would change|unsure|size)\s*:)/gi, '\n')
    .split('\n').map((l) => l.trim()).filter(Boolean);
}

function lightbox(src) {
  const el = h('div.lightbox', { onclick: () => el.remove() }, h('img', { src, alt: '' }));
  document.body.append(el);
}
