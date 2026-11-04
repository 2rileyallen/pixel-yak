// studio/ui/js/views/designs.js — the design library (designs/ + local/designs/): the art, sound and
// game design files games start from. Browse a shelf as cards; an entry shows its palette swatches
// and sample sprites (art), its instruments and an example to play (sound, when the sound engine is
// there), or its sections (game), the games that started from it, and its DESIGN.md. Nothing is
// changed from here: the buttons copy a prompt for the AI (use, pull, promote — skill design).
import { h, mount, btn, toast, popMenu, markdown } from '../ui.js';
import { icon } from '../icons.js';

const api = window.studio;
const ls = {
  get: (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};
const SHELVES = [
  ['art', 'Art', 'How a game looks: palette, shapes, light, motion, UI'],
  ['sound', 'Sound', 'How a game sounds: instruments, tempo, song form, mix'],
  ['game', 'Game', 'How a kind of game plays: loop, pacing, screen, controls'],
  ['systems', 'Systems', 'Game code a game copies in: a camera, menus, an inventory, dialogue — its own copy from then on'],
];
const WHAT = { art: 'look', sound: 'sound', game: 'game design', systems: 'system' };
// Which library entry a game started from on a shelf (systems: a game copies in several).
const started = (p, shelf, id = null) => (shelf === 'systems' ? ((p.systemsFrom || []).includes(id) ? id : null) : p.designs && p.designs[shelf]);

export class DesignsView {
  constructor(app) {
    this.app = app;
    this.el = h('section.view.page.designs-view');
    this.shelf = ls.get('ps.designs.shelf', 'art');
    this.sel = ls.get('ps.designs.sel', {}); // shelf -> `${source}:${id}`
    this.stamp = Date.now(); // cache-buster for the entries' code twins
    this.mods = new Map(); // `${path}/${file}?${stamp}` -> module promise
    this.md = new Map(); // `${shelf}/${id}` -> DESIGN.md text
    this.timer = null;
    this.sound = null; // { stop } of the example playing
  }

  onShow() { this.render(); }
  async refresh() { this.stamp = Date.now(); this.mods.clear(); this.md.clear(); if (this.el.classList.contains('on')) this.render(); }

  list(shelf = this.shelf) { return this.app.designs.filter((d) => d.shelf === shelf); }
  key(d) { return `${d.source}:${d.id}`; }
  usedBy(d) { return d.source === 'library' || !this.list(d.shelf).some((x) => x.id === d.id && x.source === 'library') ? this.app.projects.filter((p) => started(p, d.shelf, d.id) === d.id) : []; }
  current() {
    const list = this.list();
    return list.find((d) => this.key(d) === this.sel[this.shelf]) || list[0] || null;
  }
  mod(d, file) {
    const k = `${d.path}/${file}?v=${this.stamp}`;
    if (!this.mods.has(k)) this.mods.set(k, import(`/${k}`));
    return this.mods.get(k);
  }

  setShelf(s) { this.shelf = s; ls.set('ps.designs.shelf', s); this.render(); }
  select(d) { this.sel[d.shelf] = this.key(d); ls.set('ps.designs.sel', this.sel); this.render(); }

  render() {
    clearInterval(this.timer);
    const cur = this.current();
    mount(this.el, h('div.page-inner', null,
      h('div.page-head', null,
        h('div.grow', null, h('h1', null, icon('designs'), 'Designs'),
          h('p', null, 'The library your games start from. A new game copies one entry from each shelf into its own design/ folder and makes it its own; when a game\'s look, sound or design is good, it comes back here as a new entry.'))),
      h('div.dz-bar', null,
        h('div.dz-tabs', { role: 'tablist' }, SHELVES.map(([id, label, sub]) => h(`button.dz-tab${id === this.shelf ? '.on' : ''}`, { type: 'button', role: 'tab', title: sub, onclick: () => this.setShelf(id) },
          h('span', null, label), h('span.n', null, this.list(id).length)))),
        h('div.grow'),
        btn(`Promote a game's ${WHAT[this.shelf]}…`, (e) => this.promoteMenu(e.currentTarget), { small: true, kind: 'ghost', ico: 'plus', title: `Copy a prompt: the AI turns a game's own ${WHAT[this.shelf]} into a new library entry` })),
      h('div.dz-layout', null,
        h('div.dz-cards', null, this.list().length ? this.list().map((d) => this.card(d, cur && this.key(cur) === this.key(d))) : h('div.empty.dz-empty', null, icon('designs'), h('h3', null, 'Nothing on this shelf yet'), h('p', null, `Entries live in designs/${this.shelf}/<id>/DESIGN.md (yours in local/designs/${this.shelf}/).`))),
        cur ? this.detail(cur) : h('div'))));
  }

  // ------------------------------------------------------------------ cards ---
  card(d, on) {
    const used = this.usedBy(d);
    const strip = d.shelf === 'art' ? h('div.dz-strip') : null;
    if (strip) this.fillStrip(strip, d);
    return h(`button.dz-card${on ? '.on' : ''}`, { type: 'button', onclick: () => this.select(d), 'aria-pressed': on ? 'true' : 'false' },
      h('div.dz-card-top', null, h('span.dz-title', null, d.title || d.id), h(`span.tag${d.source === 'local' ? '.orchid' : ''}`, { title: d.source === 'local' ? `Yours: ${d.path}` : d.path }, d.source === 'local' ? 'yours' : 'library')),
      strip,
      h('div.dz-sum', null, d.summary || '—'),
      h('div.dz-used', null, used.length ? [icon('projects'), h('span', null, used.map((p) => p.name).join(', '))] : h('span.dim', null, 'No game uses it yet')));
  }

  async fillStrip(el, d) {
    if (!d.files.includes('palette.js')) return;
    try {
      const pal = await this.mod(d, 'palette.js');
      const mats = Object.entries(pal.M || {}).slice(0, 28);
      mount(el, mats.map(([, id]) => h('i', { style: { background: pal.HEXRAMPS[id][3] } })));
    } catch { el.remove(); }
  }

  // ----------------------------------------------------------------- detail ---
  detail(d) {
    const used = this.usedBy(d);
    const body = h('div.dz-md', null, h('div.dim', null, 'Loading…'));
    const extra = h('div.dz-extra');
    const el = h('div.dz-detail', null,
      h('div.dz-head', null,
        h('div.grow', null,
          h('h2', null, d.title || d.id),
          h('div.dz-path', null, h('code', null, `${d.path}/`), ' · ', d.files.filter((f) => f !== 'DESIGN.md').join(' · ') || 'DESIGN.md only')),
        h(`span.tag${d.source === 'local' ? '.orchid' : ''}`, null, d.source === 'local' ? 'yours' : 'library')),
      h('div.dz-acts', null,
        btn('Use in a game…', (e) => this.useMenu(e.currentTarget, d), { kind: 'primary', small: true, ico: 'copy', title: 'Copy a prompt: the AI copies this entry into a game that has none of its own yet' }),
        btn('Pull into a game…', (e) => this.pullMenu(e.currentTarget, d), { small: true, ico: 'diff', title: 'Copy a prompt: the AI compares a game\'s own copy with this entry and brings over only what you pick' }),
        btn('Folder', () => api.shell.open(d.path, false).catch((err) => toast(err.message, { kind: 'error' })), { small: true, kind: 'ghost', ico: 'folder' })),
      h('div.dz-usedby', null,
        h('span.section-title', null, 'Used by'),
        used.length ? used.map((p) => h('button.chip', { type: 'button', title: `${p.name} started from this entry; its own copy lives in games/${p.id}/design/`, onclick: (e) => this.gameMenu(e.currentTarget, d, p) }, icon('projects'), p.name))
          : h('span.dim', null, 'No game started from it yet.')),
      extra, body);
    this.loadDetail(d, body, extra);
    return el;
  }

  async loadDetail(d, body, extra) {
    const k = `${d.shelf}/${d.source}/${d.id}`;
    let md = this.md.get(k);
    if (md == null) {
      try { md = (await api.designs.read(d.shelf, d.id)).md; this.md.set(k, md); } catch (err) { mount(body, h('div.err-box', null, err.message)); return; }
    }
    // the title is already the heading above; the rest is the file
    const rendered = markdown(md.replace(/^#\s+.*\n/, ''));
    mount(body, rendered);
    if (d.shelf === 'art') await this.artExtra(d, extra);
    else if (d.shelf === 'sound') await this.soundExtra(d, extra, md);
    else this.gameExtra(extra, rendered);
  }

  // art: every material's ramp, glow marked, and the entry's sample sprites (animated)
  async artExtra(d, extra) {
    if (!d.files.includes('palette.js')) { mount(extra, h('div.note-box', null, 'No palette.js in this entry — an art design\'s palette is its code.')); return; }
    let pal;
    try { pal = await this.mod(d, 'palette.js'); } catch (err) { mount(extra, h('div.err-box', null, `palette.js failed to load: ${err.message}`)); return; }
    const glow = new Set(pal.GLOW || []);
    const sw = h('div.dz-swatches', null, Object.entries(pal.M || {}).map(([name, id]) => h(`div.dz-ramp${glow.has(id) ? '.glow' : ''}`, { title: `${name} (material ${id})${glow.has(id) ? ' — emissive' : ''}` },
      h('span.dz-ramp-name', null, name),
      h('span.dz-ramp-stops', null, (pal.HEXRAMPS[id] || []).map((hex, s) => h('i', { title: `${name} ${s} · ${hex}`, style: { background: hex } }))))));
    const samples = h('div.dz-samples');
    mount(extra, h('div.dz-block', null, h('div.section-title', null, 'Sample', h('span.dim', { style: { textTransform: 'none', letterSpacing: 0, fontWeight: 400 } }, d.files.includes('sample.js') ? ' — sample.js, drawn with this palette' : ' — a generic shape in this palette (the entry has no sample.js)')), samples),
      h('div.dz-block', null, h('div.section-title', null, `Palette · ${Object.keys(pal.M || {}).length} materials`, h('span.dim', { style: { textTransform: 'none', letterSpacing: 0, fontWeight: 400 } }, ' — stops 0 → 4; ✦ emissive')), sw));
    try { await this.drawSamples(d, pal, samples); } catch (err) { mount(samples, h('div.dim', null, `The sample didn't draw: ${err.message}`)); }
  }

  async drawSamples(d, pal, box) {
    let entries;
    if (d.files.includes('sample.js')) entries = Object.values((await this.mod(d, 'sample.js')).SAMPLE_ART || {});
    else {
      const { Pix } = await import('/engine/art/pix.js');
      const ids = Object.values(pal.M || {});
      const pick = (...names) => names.map((n) => pal.M[n]).find((v) => v != null) ?? ids[1] ?? ids[0];
      entries = [{ name: 'Generic shapes', fw: 24, fh: 20, poses: ['still'], draw: () => {
        const p = new Pix(24, 20);
        p.ball(7, 9, 6, 6, pick('CLOTH', 'SKIN', 'TUNIC'));
        p.layer();
        p.rect(13, 8, 9, 10, pick('WOOD', 'STONE', 'METAL', 'GOLD'), 2); p.rect(13, 8, 9, 2, pick('WOOD', 'STONE', 'METAL', 'GOLD'), 3);
        return p.finish(pal.FIN || { ramps: pal.RAMPS, glow: pal.GLOW });
      } }];
    }
    const tiles = [];
    for (const e of entries) {
      const frames = (e.anims && e.defaultAnim && e.anims[e.defaultAnim]) || e.poses || [];
      const cvs = frames.map((pose) => e.draw(pose));
      const z = Math.max(2, Math.min(6, Math.floor(192 / Math.max(e.fw, e.fh))));
      const c = h('canvas', { width: e.fw * z, height: e.fh * z, title: `${e.name}${e.description ? ' — ' + e.description : ''}` });
      const g = c.getContext('2d');
      g.imageSmoothingEnabled = false;
      const show = (i) => { g.clearRect(0, 0, c.width, c.height); const f = cvs[i % cvs.length]; if (f) g.drawImage(f, 0, 0, c.width, c.height); };
      show(0);
      tiles.push({ show, n: cvs.length });
      box.append(h('figure.dz-sample', null, c, h('figcaption', null, e.name.replace(/\s*\(.*\)\s*$/, ''))));
    }
    let t = 0;
    clearInterval(this.timer);
    if (tiles.some((x) => x.n > 1)) this.timer = setInterval(() => { if (!box.isConnected) { clearInterval(this.timer); return; } t++; for (const x of tiles) x.show(t); }, 125); // 8 fps
  }

  // sound: the instruments (instruments.js) and, when the sound engine is there, a play button
  async soundExtra(d, extra, md) {
    let names = [];
    if (d.files.includes('instruments.js')) {
      try { const m = await this.mod(d, 'instruments.js'); const inst = m.INSTRUMENTS || m.default || {}; names = Array.isArray(inst) ? inst.map((x, i) => x.name || `#${i + 1}`) : Object.keys(inst); } catch { /* fall back to the text */ }
    }
    if (!names.length) {
      const sec = /^##\s+Instruments[^\n]*\n([\s\S]*?)(?=^##\s|(?![\s\S]))/m.exec(md);
      if (sec) names = [...sec[1].matchAll(/^\s*[-*]\s+\**([^*:—–\n]+)/gm)].map((x) => x[1].trim()).slice(0, 24);
    }
    const play = h('div.dz-play');
    mount(extra, h('div.dz-block', null, h('div.section-title', null, 'Instruments'),
      names.length ? h('div.chips', null, names.map((n) => h('span.chip', null, n))) : h('span.dim', null, 'No instruments listed.'), play));
    if (!d.files.includes('example-song.js')) return;
    let snd, ex, inst;
    try { [snd, ex, inst] = await Promise.all([import('/engine/sound/index.js'), this.mod(d, 'example-song.js'), this.mod(d, 'instruments.js')]); } catch { mount(play, h('span.dim', null, 'Playing the example needs the sound engine (engine/sound/).')); return; }
    const songs = Object.keys(ex.SONGS || {});
    if (!songs.length || typeof snd.defineSound !== 'function') return;
    mount(play, songs.slice(0, 4).map((name) => btn(`Play ${ex.SONGS[name].name || name}`, async (e) => {
      const b = e.currentTarget;
      if (this.sound && this.sound.name === `${d.path}/${name}`) { this.stopSound(); b.classList.remove('on'); return; }
      this.stopSound();
      try {
        const S = snd.defineSound({ game: 'designs-view', instruments: inst.INSTRUMENTS || {}, songs: ex.SONGS || {}, sfx: ex.SFX || {} });
        await S.unlock();
        S.music(name);
        this.sound = { name: `${d.path}/${name}`, stop: () => S.music(null), btn: b };
        b.classList.add('on');
      } catch (err) { toast(`Couldn't play it: ${err.message}`, { kind: 'error' }); }
    }, { small: true, ico: 'play' })));
  }

  stopSound() { if (this.sound) { try { this.sound.stop(); } catch {} this.sound.btn?.classList.remove('on'); this.sound = null; } }

  // game: its sections as chips that jump to them
  gameExtra(extra, rendered) {
    const heads = [...rendered.querySelectorAll('h3')];
    mount(extra, h('div.dz-block', null, h('div.section-title', null, 'Sections'),
      h('div.chips', null, heads.map((el) => h('button.chip', { type: 'button', onclick: () => el.scrollIntoView({ behavior: 'smooth', block: 'start' }) }, el.textContent)))));
  }

  // ---------------------------------------------------------------- prompts ---
  games() { return [...this.app.projects].sort((a, b) => a.name.localeCompare(b.name)); }

  useMenu(anchor, d) {
    const gs = this.games();
    if (!gs.length) { toast('No games yet — make one in Games.', { kind: 'warn' }); return; }
    popMenu(anchor, [{ header: `Use ${d.title || d.id} in…` }, ...gs.map((p) => {
      const has = started(p, d.shelf, d.id);
      return { label: p.name, ico: 'projects', hint: has ? `has its own (from ${has})` : '', fn: () => this.app.copyPrompt(has ? pullPrompt(p, d) : usePrompt(p, d), has ? 'Pull prompt' : 'Use prompt') };
    })]);
  }

  pullMenu(anchor, d) {
    const gs = this.games().filter((p) => started(p, d.shelf, d.id));
    if (!gs.length) { toast(`No game has its own ${WHAT[d.shelf]} yet — use "Use in a game…".`, { kind: 'warn' }); return; }
    popMenu(anchor, [{ header: `Pull from ${d.title || d.id} into…` }, ...gs.map((p) => ({ label: p.name, ico: 'diff', hint: started(p, d.shelf, d.id) === d.id ? 'started here' : `from ${started(p, d.shelf, d.id)}`, fn: () => this.app.copyPrompt(pullPrompt(p, d), 'Pull prompt') }))]);
  }

  promoteMenu(anchor) {
    const gs = this.games();
    if (!gs.length) { toast('No games yet.', { kind: 'warn' }); return; }
    popMenu(anchor, [{ header: `Promote whose ${WHAT[this.shelf]}?` }, ...gs.map((p) => ({ label: p.name, ico: 'plus', hint: this.shelf !== 'systems' && started(p, this.shelf) ? `from ${started(p, this.shelf)}` : '', fn: () => this.app.copyPrompt(promotePrompt(p, this.shelf), 'Promote prompt') }))]);
  }

  gameMenu(anchor, d, p) {
    popMenu(anchor, [{ header: p.name },
      { label: 'Open this game', ico: 'open', fn: async () => { await this.app.setProject(p.id); this.app.go('art'); } },
      { label: `Pull from ${d.title || d.id} into it…`, ico: 'diff', fn: () => this.app.copyPrompt(pullPrompt(p, d), 'Pull prompt') },
      { label: `Promote its ${WHAT[d.shelf]} as a new entry…`, ico: 'plus', fn: () => this.app.copyPrompt(promotePrompt(p, d.shelf), 'Promote prompt') },
    ]);
  }
}

function usePrompt(p, d) {
  return `Use the ${d.shelf} design "${d.title || d.id}" (${d.shelf}/${d.id}) in ${p.name}: run \`node cli/yak.mjs design-use ${p.id} ${d.shelf} ${d.id}\`. ` +
    `If it says the game already has its own ${d.shelf} design, stop and tell me what differs (\`node cli/yak.mjs design-diff ${p.id} ${d.shelf} --from ${d.id}\`) — don't replace it unless I say so. ` +
    `Then run \`node cli/yak.mjs check ${p.id}\`, look at the game, and tell me in a few lines what changed. Follow skill design.`;
}

function pullPrompt(p, d) {
  return `Compare ${p.name}'s ${WHAT[d.shelf]} with the library's "${d.title || d.id}" (\`node cli/yak.mjs design-diff ${p.id} ${d.shelf} --from ${d.id}\`). ` +
    `Brief me first: in a few lines, what the library has that the game doesn't, and what you'd bring over. Wait for my pick, then bring over only that, by hand — ` +
    `keep the game's own rules, never touch my pixel or sound edits — and note it in the game's CHANGELOG.md. Follow skill design.`;
}

function promotePrompt(p, shelf) {
  if (shelf === 'systems') {
    return `One of ${p.name}'s systems is worth reusing in other games: promote it to the design library's systems shelf. ` +
      `Ask me which system (its file in game/systems/ and its page in design/systems/), suggest an id and a title, and ask whether it stays mine (local/designs/, the default) or goes in the public library that ships with Pixel Yak (designs/, --library). ` +
      `Then run \`node cli/yak.mjs design-promote ${p.id} systems <id> --system <its id in the game> [--library] --title "<title>"\`. ` +
      `Make it general before any other game uses it: whatever it imports from the game (data, other systems) is passed in or included — the command lists those — and its page says how a game wires it in, with no names or story from ${p.name}. Follow skill design.`;
  }
  return `${p.name}'s ${WHAT[shelf]} is worth keeping: promote it to the design library as a new ${shelf} entry. ` +
    `Suggest an id and a title, and ask me whether it stays mine (local/designs/, the default) or goes in the public library that ships with Pixel Yak (designs/, --library). ` +
    `Then run \`node cli/yak.mjs design-promote ${p.id} ${shelf} <id> [--library] --title "<title>"\` and rewrite the new DESIGN.md as a general entry: ` +
    `the ${WHAT[shelf]} in general words, no names, story or characters from the game, and how to ask for things in it. Follow skill design.`;
}
