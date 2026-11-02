// studio/ui/js/views/projects.js — every game in games/ (any folder with a game.json shows up by
// itself), its stage and size, and the "New game" flow: a copy of templates/blank with the design
// files it starts from (art, sound, game — from the library) and a kickoff request for the AI.
import { h, mount, btn, iconBtn, toast, modal, popMenu, field, select, copyText, timeAgo } from '../ui.js';
import { icon } from '../icons.js';
import { kickoffPrompt } from '../prompts.js';

const GENRES = ['Grid battler', 'Turn-based RPG', 'Top-down action RPG', 'Side-scrolling platformer', 'Tactics (grid strategy)', 'Wave arena / action', 'Visual novel + battles', 'Roguelike deckbuilder'];
const RESOLUTIONS = [['320x180x3', '320 × 180 (GBA widescreen) ×3'], ['240x160x4', '240 × 160 (GBA) ×4'], ['480x270x3', '480 × 270 ×3'], ['640x360x2', '640 × 360 (HD-2D) ×2']];

export class ProjectsView {
  constructor(app) {
    this.app = app;
    this.el = h('section.view.page');
    this.editCounts = {};
  }

  onShow() { this.loadCounts(); this.render(); }

  async loadCounts() {
    for (const p of this.app.projects) {
      try { const s = await window.studio.edits.list(p.id); this.editCounts[p.id] = Object.keys(s).length; } catch { this.editCounts[p.id] = null; }
    }
    this.render();
  }

  render() {
    if (!this.app.projects) return;
    const order = { active: 0, paused: 1, archived: 2 };
    const ps = [...this.app.projects].sort((a, b) => (order[a.status] - order[b.status]) || (b.updatedAt || '').localeCompare(a.updatedAt || ''));
    mount(this.el, h('div.page-inner', null,
      h('div.page-head', null,
        h('div.grow', null, h('h1', null, icon('projects'), 'Games'), h('p', null, 'Each game keeps its own folder — art, design files, edits, requests — and can be its own git repo. Any folder in games/ with a game.json appears here on its own.')),
        btn('New game', () => this.newGame(), { kind: 'primary', ico: 'plus' })),
      h('div.grid-cards', null, ps.map((p) => this.card(p)))));
  }

  card(p) {
    const app = this.app;
    const active = app.project && app.project.id === p.id;
    const ph = p.stage && app.stages[p.stage];
    const openReq = app.requests.filter((r) => r.scope === p.id && (r.status === 'open' || r.status === 'in-progress')).length;
    const forYou = app.requests.filter((r) => r.scope === p.id && r.assignee === 'user' && r.status === 'open').length;
    const running = app.running.has(p.id);
    return h(`div.pcard${active ? '.active' : ''}${p.status === 'archived' ? '.faded' : ''}`, null,
      h('div.row', { style: { alignItems: 'flex-start' } },
        h('div.grow', null, h('h3', null, p.name), p.subtitle ? h('div.sub', null, p.subtitle) : null),
        iconBtn('chevron', 'Stage, size, status, details', (e) => this.menu(e.currentTarget, p))),
      h('div.row', { style: { flexWrap: 'wrap', gap: '5px' } },
        active ? h('span.tag.gold', null, 'open') : null,
        running ? h('span.tag.jade', null, 'running') : null,
        p.status !== 'active' ? h('span.tag', null, p.status) : null,
        h('span.tag', { title: 'How big it is meant to grow (toy · demo · big)' }, p.size),
        p.designs.art ? h('span.tag.orchid', { title: 'The art design it started from (its own copy lives in design/art.md)' }, p.designs.art) : null,
        p.designs.sound ? h('span.tag.teal', { title: 'The sound design it started from' }, p.designs.sound) : null,
        p.genre ? h('span.tag.sky', null, p.genre.slice(0, 40)) : null),
      p.description ? h('div.desc', null, p.description) : null,
      h('div.col', { style: { gap: '5px' } },
        h('div.phase-track', { title: 'Stage: idea → prototype → production → polish → released' }, app.stages.filter(Boolean).map((s) => h(`i${p.stage && s.n < p.stage ? '.done' : ''}${p.stage === s.n ? '.now' : ''}`))),
        h('div.phase-label', null, ph ? h('span', null, h('b', null, ph.name), h('span.dim', null, ` — “${ph.gate}”`)) : h('span.dim', null, 'Stage not set'))),
      h('div.stats', null,
        h('span', null, h('b', null, this.editCounts[p.id] ?? '…'), 'edited assets'),
        h('span', null, h('b', null, openReq), 'open requests'),
        forYou ? h('span', { style: { color: 'var(--fire)' } }, h('b', null, forYou), 'for you') : null,
        p.updatedAt ? h('span', null, timeAgo(p.updatedAt)) : null),
      h('div.acts', null,
        active ? btn('Open art', () => app.go('art'), { small: true, ico: 'art' }) : btn('Open', async () => { await app.setProject(p.id); app.go('art'); }, { small: true, kind: 'primary', ico: 'open' }),
        btn(running ? 'Running' : 'Play', async () => { try { await window.studio.game.launch(p.id); } catch (err) { toast(err.message, { kind: 'error' }); } }, { small: true, ico: running ? 'dot' : 'play', disabled: !p.hasGame, title: p.hasGame ? 'Play in its own window' : `${p.gamePath} does not exist yet` }),
        btn('Folder', () => window.studio.shell.open(`games/${p.id}`, false).catch((err) => toast(err.message, { kind: 'error' })), { small: true, ico: 'folder', kind: 'ghost' })));
  }

  menu(anchor, p) {
    const set = async (patch, msg) => {
      try { await window.studio.projects.update(p.id, patch); await this.app.reloadProjects(); this.render(); toast(msg, { kind: 'ok', timeout: 1800 }); } catch (err) { toast(err.message, { kind: 'error' }); }
    };
    popMenu(anchor, [
      { header: 'Stage' },
      ...this.app.stages.filter(Boolean).map((s) => ({ label: s.name, active: p.stage === s.n, fn: () => set({ stage: s.n }, `${p.name} → ${s.name}`) })),
      '-',
      { header: 'Size' },
      ...this.app.sizes.map((s) => ({ label: s, active: p.size === s, fn: () => set({ size: s }, `${p.name} is a ${s} game`) })),
      '-',
      { header: 'Status' },
      ...['active', 'paused', 'archived'].map((s) => ({ label: s, active: p.status === s, fn: () => set({ status: s }, `${p.name} is ${s}`) })),
      '-',
      { label: 'Edit details…', ico: 'pencil', fn: () => this.editDetails(p) },
      { label: 'Run checks', ico: 'check', fn: async () => { const out = await window.studio.projects.check(p.id).catch((e) => [`ERROR ${e.message}`]); modal({ title: `Checks · ${p.name}`, body: out.length ? h('div.err-box', { style: { color: 'var(--text2)', background: 'var(--bg0)', borderColor: 'var(--line2)' } }, out.join('\n')) : h('div.note-box.teal', null, 'All checks pass.'), actions: [{ label: 'Close' }] }); } },
    ], { align: 'right' });
  }

  editDetails(p) {
    const name = h('input.input', { value: p.name, maxlength: 120 });
    const sub = h('input.input', { value: p.subtitle || '', maxlength: 200 });
    const genre = h('input.input', { value: p.genre || '', maxlength: 120 });
    const desc = h('textarea.input', { rows: 5 }, p.description || '');
    modal({
      title: `Edit ${p.name}`,
      body: h('div.col', null, field('Name', name), field('Subtitle', sub), field('Genre', genre), field('Description', desc)),
      actions: [{ label: 'Cancel' }, {
        label: 'Save', kind: 'primary', fn: async () => {
          try { await window.studio.projects.update(p.id, { name: name.value, subtitle: sub.value, genre: genre.value, description: desc.value }); await this.app.reloadProjects(); this.render(); return true; }
          catch (err) { toast(err.message, { kind: 'error' }); return false; }
        },
      }],
    });
  }

  // ------------------------------------------------------------- new game ---
  newGame(prefill = {}) {
    const app = this.app;
    const name = h('input.input', { value: prefill.title || '', placeholder: 'e.g. River Spirits', maxlength: 120, autofocus: true });
    const id = h('input.input', { value: '', placeholder: 'river-spirits', maxlength: 48, class: 'mono' });
    let idTouched = false;
    const slug = (s) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9\s-]/g, '').trim().replace(/\s+/g, '-').replace(/-+/g, '-').slice(0, 48).replace(/^-|-$/g, '');
    name.addEventListener('input', () => { if (!idTouched) id.value = slug(name.value); });
    id.addEventListener('input', () => { idTouched = true; });
    if (prefill.title) id.value = slug(prefill.title);
    const genre = h('input.input', { value: prefill.genre || '', placeholder: 'Grid battler, turn-based RPG…', list: 'genre-list', style: { width: '100%' } });
    const genreList = h('datalist', { id: 'genre-list' }, GENRES.map((g) => h('option', { value: g })));
    const shelf = (name, fallback) => {
      const list = app.designs.filter((d) => d.shelf === name);
      const want = prefill[name] || (list.some((d) => d.id === fallback) ? fallback : '');
      return select([...list.map((d) => [d.id, `${d.title || d.id}${d.source === 'local' ? ' (yours)' : ''}`]), ['', 'None yet — decide with the AI']], want, null);
    };
    const artD = shelf('art', 'gba-bright'), soundD = shelf('sound', ''), gameD = shelf('game', 'basics');
    const size = select([['toy', 'Toy — a quick test, throwaway'], ['demo', 'Demo — a small finished slice'], ['big', 'Big — built to grow for years']], 'toy', null);
    const res = select(RESOLUTIONS, '320x180x3', null);
    const ideas = h('select.input');
    const pitch = h('textarea.input', { rows: 7, placeholder: 'Paste the story, the idea, characters, games it should feel like… The kickoff model turns this into a one-page pitch with you.' }, prefill.body || '');
    window.studio.ideas.list().then((list) => {
      mount(ideas, h('option', { value: '' }, '— none —'), list.filter((i) => i.status !== 'started').map((i) => h('option', { value: i.id, selected: prefill.idea === i.id }, i.title)));
    }).catch(() => {});
    modal({
      title: 'New game',
      wide: true,
      body: h('div.col', { style: { gap: '14px' } },
        h('div.note-box', null, 'This creates ', h('code', null, 'games/<id>/'), ' from the blank template with the art pipeline wired (it shows up in Art right away), copies the design files you pick into its ', h('code', null, 'design/'), ' (its own copies from now on), and files a kickoff request. The AI asks only what blocks it, then briefs you on the first playable before writing code.'),
        h('div.form-grid', null, field('Name', name), field('Folder id', id, 'lowercase-with-dashes'), field('Genre', h('div', null, genre, genreList)), field('Size', size), field('Art design', artD), field('Sound design', soundD), field('Game design', gameD), field('Resolution', res), field('From idea', ideas)),
        field('Pitch, story, notes', pitch)),
      actions: [{ label: 'Cancel' }, {
        label: 'Create game', kind: 'primary', ico: 'plus',
        fn: async (m) => {
          if (!name.value.trim()) { name.focus(); toast('Give the game a name', { kind: 'warn' }); return false; }
          if (!/^[a-z0-9][a-z0-9-]{0,47}$/.test(id.value)) { id.focus(); toast('Folder id: lowercase letters, numbers and dashes', { kind: 'warn' }); return false; }
          const [w, hh, sc] = res.value.split('x').map(Number);
          m.setBusy(true);
          try {
            const r = await window.studio.projects.create({ id: id.value, name: name.value.trim(), genre: genre.value.trim(), size: size.value, designs: { art: artD.value || null, sound: soundD.value || null, game: gameD.value || null }, resolution: { width: w, height: hh, pixelScale: sc }, pitch: pitch.value, idea: ideas.value || null });
            if (ideas.value) {
              const idea = (await window.studio.ideas.list()).find((i) => i.id === ideas.value);
              if (idea) await window.studio.ideas.save({ ...idea, status: 'started', project: r.project.id });
            }
            await app.reloadProjects();
            await app.reloadRequests(r.project.id);
            await app.setProject(r.project.id);
            this.render();
            showKickoff(app, r.project, r.kickoff);
            return true;
          } catch (err) { m.setBusy(false); toast(err.message, { kind: 'error' }); return false; }
        },
      }],
    });
  }
}

function showKickoff(app, project, req) {
  const text = kickoffPrompt(project, req);
  modal({
    title: `${project.name} is ready for its kickoff`,
    body: h('div.col', null,
      h('p', { style: { margin: 0, color: 'var(--text2)' } }, 'Paste this into your AI chat (any harness, opened in the Pixel Yak folder). It reads your notes, asks only what blocks it, and briefs you on the first playable before writing code.'),
      h('div.prompt-box', null, text)),
    actions: [{ label: 'Later' }, { label: 'Copy prompt', kind: 'primary', ico: 'copy', fn: () => { copyText(text); toast('Kickoff prompt copied.', { kind: 'ok' }); } }],
  });
}
