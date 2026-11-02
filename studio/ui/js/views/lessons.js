// studio/ui/js/views/lessons.js — what the AI is learning. Every save in the Art view appends a
// lesson to the game's games/<id>/design/lessons/log.jsonl (+ a card image). A smart model distills
// them into the game's design/art.md, palette and generators (skill art-learn) and bumps the version.
// The scoreboard shows the point of it all: how much of each AI frame you had to repaint,
// grouped by the style version the frame was generated with — that number should fall.
import { h, mount, btn, toast, timeAgo, markdown } from '../ui.js';
import { icon } from '../icons.js';
import { distillPrompt } from '../prompts.js';

export class LessonsView {
  constructor(app) {
    this.app = app;
    this.el = h('section.view.page');
    this.styleId = null;
    this.data = null;
    this.lessons = [];
  }

  setProject(p) { this.styleId = (p && p.style) || null; this.data = null; this.lessons = []; this.error = null; this.refresh(); }
  onShow() { this.refresh(); }

  async refresh() {
    if (!this.styleId) { this.render(); return; }
    try {
      [this.data, this.lessons] = await Promise.all([window.studio.styles.read(this.styleId), window.studio.lessons.read(this.styleId, { limit: 400 })]);
    } catch (err) { this.data = null; this.lessons = []; this.error = err.message; }
    this.render();
  }

  render() {
    const st = this.data;
    const head = h('div.page-head', null,
      h('div.grow', null, h('h1', null, icon('lessons'), 'Lessons'), h('p', null, 'Every save teaches this game\'s look. When enough lessons pile up, ask a smart model to distill them into its art design file and better generators.')),
      st ? btn(st.undistilled ? `Distill ${st.undistilled} new lesson${st.undistilled > 1 ? 's' : ''}` : 'Nothing new to distill', () => this.app.copyPrompt(distillPrompt(st, st.undistilled), 'Distill prompt'), { kind: st.undistilled ? 'orchid' : '', ico: 'send', disabled: !st.undistilled, title: 'Copies a prompt for your AI chat (use a smart model)' }) : null);
    if (!st) {
      mount(this.el, h('div.page-inner', null, head, h('div.empty', null, icon('lessons'), h('h3', null, 'No look of its own yet'), h('p', null, this.error || 'A game\'s look lives in its design/ folder (art.md + palette.js), copied from the design library when the game was made. Once it has one, every edit you save lands here.'))));
      return;
    }
    const scored = this.scoreboard();
    mount(this.el, h('div.page-inner', null, head,
      h('div.statline', null,
        stat(st.lessons, 'lessons recorded', ''),
        stat(st.undistilled, 'not learned yet', st.undistilled ? 'orchid' : ''),
        stat(`v${st.version}`, 'style version', 'gold'),
        stat(scored.recent == null ? '—' : `${scored.recent}%`, 'avg repaint, last 10 frames', 'teal')),
      h('div.lessons-grid', null,
        h('div.col', { style: { gap: '18px', minWidth: 0 } },
          this.scorePanel(scored),
          this.feedPanel()),
        h('div.col', { style: { gap: '18px', minWidth: 0 } },
          this.rulesPanel(st),
          this.historyPanel(st)))));
  }

  // latest cumulative repaint (vs. the AI's generator) per frame, in order of first edit
  scoreboard() {
    const byFrame = new Map();
    for (const l of [...this.lessons].reverse()) {
      if (!l.total) continue;
      const k = `${l.project}/${l.asset}/${l.pose}`;
      const cur = byFrame.get(k);
      byFrame.set(k, { key: k, first: cur ? cur.first : l.ts, pct: l.total.repaintPct, v: l.gen && l.gen.v ? `v${l.gen.v}` : 'unstamped', asset: l.asset, pose: l.pose });
    }
    const frames = [...byFrame.values()].sort((a, b) => a.first.localeCompare(b.first));
    const byV = new Map();
    for (const f of frames) { const o = byV.get(f.v) || { n: 0, sum: 0 }; o.n++; o.sum += f.pct; byV.set(f.v, o); }
    const last = frames.slice(-10);
    return {
      frames,
      versions: [...byV.entries()].map(([v, o]) => ({ v, n: o.n, avg: Math.round((o.sum / o.n) * 10) / 10 })),
      recent: last.length ? Math.round((last.reduce((s, f) => s + f.pct, 0) / last.length) * 10) / 10 : null,
    };
  }

  scorePanel(sc) {
    const c = h('canvas.chart');
    requestAnimationFrame(() => drawChart(c, sc.frames));
    return h('div.panel', null,
      h('div.panel-head', null, icon('lessons'), h('h3', null, 'Repaint scoreboard'), h('div.grow'), h('span.dim', { style: { fontSize: '12px' } }, 'lower = the AI got closer to your style')),
      h('div.panel-body', null,
        sc.frames.length ? c : h('div.dim', null, 'No edited frames yet. Paint over an AI frame in Art and save — its repaint % appears here.'),
        sc.versions.length ? h('div.row', { style: { flexWrap: 'wrap', gap: '6px' } }, sc.versions.map((v) => h('span.chip', { title: 'Average repaint for frames the AI generated with this style version' }, `${v.v}: ${v.avg}% avg`, h('span.n', null, `${v.n} frame${v.n === 1 ? '' : 's'}`)))) : null));
  }

  feedPanel() {
    const items = this.lessons.slice(0, 60);
    const proj = this.app.project;
    return h('div.panel', null,
      h('div.panel-head', null, icon('film'), h('h3', null, 'Recent lessons'), h('div.grow'), h('span.dim', { style: { fontSize: '12px' } }, `${this.lessons.length} total`)),
      h('div.panel-body', null, items.length ? items.map((l) => h('div.lesson', null,
        h('div.pics', null, h('img', { src: `/games/${this.styleId}/design/lessons/${l.card}`, alt: 'lesson card', style: { maxHeight: '110px', maxWidth: '360px', imageRendering: 'pixelated', borderRadius: '4px', border: '1px solid var(--line)' }, onerror: (e) => { e.target.replaceWith(h('span.dim', null, 'no card')); } })),
        h('div', { style: { minWidth: 0 } },
          h('div.lt', null, h('span.mono', null, `${l.asset} · ${l.pose}`), h(`span.tag.${l.kind === 'bake' ? 'orchid' : l.kind === 'add-frame' ? 'teal' : 'gold'}`, null, l.kind), h('span.dim', { style: { fontWeight: 400, fontSize: '12px' } }, `${l.project} · ${timeAgo(l.ts)}`)),
          h('div.lm', null,
            l.note ? h('span.note', null, `“${l.note}”`) : null,
            h('span', null, `This save: ${describeMetrics(l.save)}`),
            l.total ? h('span', null, `vs. AI: ${l.total.repaintPct}% repainted`) : null,
            l.save && l.save.transitions && l.save.transitions.length ? h('span.dim', { style: { fontFamily: 'var(--mono)', fontSize: '11px' } }, l.save.transitions.slice(0, 4).map(([k, n]) => `${k} ×${n}`).join('  ')) : null,
            proj && l.project === proj.id ? h('a', { href: '#', style: { color: 'var(--gold)', fontSize: '12px' }, onclick: (e) => { e.preventDefault(); this.app.go('art'); this.app.views.art.selectAsset(l.asset, { pose: l.pose }); } }, 'Open in Art →') : null))))
        : h('div.dim', null, 'Nothing yet. Every Save in the Art view adds a lesson here.')));
  }

  rulesPanel(st) {
    return h('div.panel', null,
      h('div.panel-head', null, icon('art'), h('h3', null, `${st.name} — design/art.md`), h('div.grow'),
        btn('Reveal', () => window.studio.shell.open(st.styleFile, true).catch((e) => toast(e.message, { kind: 'error' })), { small: true, kind: 'ghost', ico: 'folder' })),
      h('div.panel-body', { style: { maxHeight: '560px', overflowY: 'auto' } }, st.styleMd ? markdown(st.styleMd) : h('div.dim', null, 'No design/art.md yet — the first distillation writes it.')));
  }

  historyPanel(st) {
    const d = (st.distilled || []).slice().reverse();
    return h('div.panel', null,
      h('div.panel-head', null, icon('refresh'), h('h3', null, 'Distillations')),
      h('div.panel-body', null, d.length ? d.map((x) => h('div.note-box.orchid', null, h('b', null, `v${x.version || '?'} · ${timeAgo(x.ts)}`), h('div', null, x.summary)))
        : h('div.dim', null, 'The AI has not distilled any lessons yet. Use the Distill button above when a few edits have piled up (3–5 is a good batch).')));
  }
}

function stat(v, l, cls) { return h(`div.stat${cls ? '.' + cls : ''}`, null, h('span.v', null, String(v)), h('span.l', null, l)); }

function describeMetrics(m) {
  if (!m || !m.changed) return 'no pixel changes';
  const parts = [`${m.changed} px`];
  if (m.added) parts.push(`+${m.added} silhouette`);
  if (m.removed) parts.push(`−${m.removed} silhouette`);
  if (m.lighter) parts.push(`${m.lighter} lighter`);
  if (m.darker) parts.push(`${m.darker} darker`);
  return parts.join(' · ');
}

const VCOL = ['#6c8ee0', '#f4c443', '#3acbc9', '#da63c3', '#31cb7b', '#ff9d20'];
function drawChart(c, frames) {
  const dpr = window.devicePixelRatio || 1;
  const W = Math.round(c.clientWidth * dpr), H = Math.round(c.clientHeight * dpr);
  if (!W || !H) return;
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.clearRect(0, 0, W, H);
  const padL = 34 * dpr, padB = 16 * dpr, padT = 8 * dpr;
  const max = Math.max(20, ...frames.map((f) => f.pct));
  g.font = `${10 * dpr}px Segoe UI`;
  g.fillStyle = '#6d739a';
  for (const t of [0, 0.5, 1]) {
    const y = Math.round(padT + (H - padT - padB) * (1 - t));
    g.fillRect(padL, y, W - padL, 1);
    g.fillText(`${Math.round(max * t)}%`, 2 * dpr, y + 3 * dpr);
  }
  const vs = [...new Set(frames.map((f) => f.v))];
  const n = frames.length;
  const bw = Math.max(2 * dpr, Math.min(18 * dpr, (W - padL - 4 * dpr) / Math.max(n, 1) - 2 * dpr));
  frames.forEach((f, i) => {
    const x = padL + 4 * dpr + i * (bw + 2 * dpr);
    const hgt = Math.max(1, Math.round((H - padT - padB) * (f.pct / max)));
    g.fillStyle = VCOL[vs.indexOf(f.v) % VCOL.length];
    g.fillRect(Math.round(x), H - padB - hgt, Math.round(bw), hgt);
  });
  g.fillStyle = '#6d739a';
  g.fillText('frames, oldest → newest (color = style version they were generated with)', padL, H - 3 * dpr);
}
