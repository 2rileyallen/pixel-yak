// studio/ui/js/views/ideas.js — game ideas backlog (ideas/<slug>.md). Capture fast, sort into
// lanes, and start a game from an idea when it's time. AIs check here before pitching.
import { h, mount, btn, toast, modal, field, select, confirmDialog, timeAgo } from '../ui.js';
import { icon } from '../icons.js';

const LANES = [['seed', 'Seeds', 'Raw ideas'], ['exploring', 'Exploring', 'Worth a closer look'], ['parked', 'Parked', 'Not now'], ['started', 'Started', 'Became a game']];

export class IdeasView {
  constructor(app) {
    this.app = app;
    this.el = h('section.view.page');
    this.ideas = [];
    this.loaded = false;
  }

  onShow() { this.refresh(); }
  async refresh() {
    this.ideas = await window.studio.ideas.list().catch(() => []);
    this.loaded = true;
    this.render();
  }

  render() {
    const title = h('input.input', { placeholder: 'Capture an idea… (e.g. "Grid battler where talismans are recipes")', maxlength: 160 });
    const genre = h('input.input', { placeholder: 'Genre (optional)', maxlength: 120, style: { maxWidth: '240px' } });
    const add = async () => {
      if (!title.value.trim()) { title.focus(); return; }
      try { await window.studio.ideas.save({ title: title.value.trim(), genre: genre.value.trim(), status: 'seed', body: '' }); title.value = ''; genre.value = ''; await this.refresh(); toast('Idea saved', { kind: 'ok', timeout: 1500 }); }
      catch (err) { toast(err.message, { kind: 'error' }); }
    };
    title.addEventListener('keydown', (e) => { if (e.key === 'Enter') add(); });
    mount(this.el, h('div.page-inner', null,
      h('div.page-head', null, h('div.grow', null, h('h1', null, icon('ideas'), 'Ideas'), h('p', null, 'Stories you love, mechanics you want to try, games to remix. Kept in ideas/ as plain notes the AI reads before pitching anything new.'))),
      h('div.capture', null, title, genre, btn('Add idea', add, { kind: 'primary', ico: 'plus' })),
      h('div.board', null, LANES.map(([k, label, sub]) => {
        const items = this.ideas.filter((i) => i.status === k);
        return h('div.lane', null,
          h('div.lane-head', null, label, h('span.dim', { style: { fontWeight: 400, textTransform: 'none', letterSpacing: 0 } }, sub), h('div.grow'), h('span.chip', null, items.length)),
          h('div.lane-body', null, items.length ? items.map((i) => h('div.icard', { onclick: () => this.edit(i) },
            h('div.it', null, i.title),
            i.genre ? h('div', null, h('span.tag.sky', null, i.genre.slice(0, 32))) : null,
            i.body ? h('div.ib', null, i.body.slice(0, 220)) : null,
            h('div.dim', { style: { fontSize: '11px' } }, i.project ? `→ ${i.project}` : timeAgo(i.updated || i.created))))
            : h('div.dim', { style: { padding: '10px', fontSize: '12px' } }, k === 'seed' && !this.ideas.length ? (this.loaded ? 'No ideas yet — type one above.' : 'Loading…') : '—')));
      }))));
  }

  edit(idea) {
    const title = h('input.input', { value: idea.title, maxlength: 160 });
    const genre = h('input.input', { value: idea.genre, maxlength: 120 });
    const style = select([['', '—'], ...this.app.designs.filter((d) => d.shelf === 'art').map((d) => [d.id, d.title || d.id])], idea.style || '', null);
    const source = h('input.input', { value: idea.source, maxlength: 300, placeholder: 'Novel, link, game it riffs on…' });
    const status = select(LANES.map(([k, l]) => [k, l]), idea.status, null);
    const body = h('textarea.input', { rows: 12, placeholder: 'Story dump, characters, mechanics, the feeling you want…' }, idea.body);
    modal({
      title: idea.title,
      wide: true,
      body: h('div.col', null,
        h('div.form-grid', null, field('Title', title), field('Genre', genre), field('Art design', style), field('Lane', status), h('div.full', null, field('Source', source))),
        field('Notes', body),
        h('div.dim', { style: { fontSize: '12px' } }, `local/ideas/${idea.id}.md`)),
      actions: [
        { label: 'Delete', kind: 'danger', ico: 'trash', left: true, fn: async () => { if (!(await confirmDialog('Delete idea?', `"${idea.title}" will be deleted.`, { okLabel: 'Delete', danger: true }))) return false; await window.studio.ideas.remove(idea.id); await this.refresh(); return true; } },
        idea.status !== 'started' ? { label: 'Start a game from this', ico: 'projects', fn: async () => { await save(); this.app.go('projects'); this.app.views.projects.newGame({ title: title.value, genre: genre.value, art: style.value, body: `${body.value}${source.value ? `\n\nSource: ${source.value}` : ''}`, idea: idea.id }); return true; } } : null,
        { label: 'Save', kind: 'primary', fn: async () => { await save(); return true; } },
      ].filter(Boolean),
    });
    const save = async () => {
      try { await window.studio.ideas.save({ ...idea, title: title.value.trim() || idea.title, genre: genre.value.trim(), style: style.value, source: source.value.trim(), status: status.value, body: body.value }); await this.refresh(); }
      catch (err) { toast(err.message, { kind: 'error' }); }
    };
  }
}
