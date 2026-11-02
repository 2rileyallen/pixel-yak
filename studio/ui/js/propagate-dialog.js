// studio/ui/js/propagate-dialog.js — "do the same to the other frames". Shows every sibling frame of
// the asset with a before → after preview of the user's fix carried over (core/art/propagate.js),
// then applies the chosen ones as the user's own edits (marked as propagated) and saves.
import { h, modal, toast } from './ui.js';
import { propagateEdit, describePropagation } from '../../../engine/art/propagate.js';
import { gridToRefs, Grid, drawThumb } from './pixels.js';
import { openRequestDialog } from './request-dialog.js';

const STATUS = {
  exact: ['exact', 'jade', 'Same pixels in this frame — your fix applies as-is.'],
  adapted: ['adapted', 'teal', 'This frame differs there, so your fix is rebuilt from its own parts.'],
  partial: ['partly', 'fire', 'Some pixels differ here and are left out — check it, or ask the AI.'],
  conflict: ['needs AI', 'red', 'This frame is too different here to carry the fix over safely.'],
  already: ['done', '', 'Already matches.'],
  none: ['—', '', ''],
};

export function openPropagate(view) {
  const s = view.session;
  const src = view.currentFrame();
  if (!s || !src) return;
  if (!src.raw) { toast('Propagate starts from a frame the AI generated (this one was added in the studio).', { kind: 'warn' }); return; }
  view.editor.commitFloat(false);
  const srcRaw = gridToRefs(src.raw, s.table), srcFinal = gridToRefs(src.grid, s.table);
  const changed = src.grid.countDiff(src.raw);
  if (!changed) { toast(`${s.pose} has no changes from the AI version to carry over.`, { kind: 'info' }); return; }
  const { w, h: hh } = src.grid;

  const rows = [];
  for (const pose of s.poses) {
    if (pose === s.pose) continue;
    const fr = s.frames.get(pose);
    if (!fr || fr.grid.w !== w || fr.grid.h !== hh) continue;
    const tgtCurrent = gridToRefs(fr.grid, s.table);
    const tgtRaw = fr.raw ? gridToRefs(fr.raw, s.table) : tgtCurrent;
    const r = propagateEdit({ w, h: hh, srcRaw, srcFinal, tgtRaw, tgtCurrent });
    const out = new Grid(w, hh);
    r.result.forEach((ref, i) => { if (ref) out.data[i] = s.table.idx(ref); });
    rows.push({ pose, fr, r, out, on: r.status === 'exact' || r.status === 'adapted' });
  }
  if (!rows.length) { toast('This asset has no other frames of the same size.', { kind: 'info' }); return; }

  const box = Math.max(64, Math.min(132, Math.round(260 * 56 / Math.max(w, hh))));
  const thumb = (g) => { const c = h('canvas'); drawThumb(c, g, s.table, { box, bg: '#14172b' }); return c; };
  const applyBtnLabel = () => {
    const n = rows.filter((x) => x.on).length;
    return n ? `Apply to ${n} frame${n > 1 ? 's' : ''} & save` : 'Nothing selected';
  };
  let applyBtn = null;
  const list = h('div.col', { style: { gap: '8px' } }, rows.map((row) => {
    const [label, tone, hint] = STATUS[row.r.status] || STATUS.none;
    const usable = row.r.applied > 0;
    const cb = h('input', { type: 'checkbox', checked: row.on, disabled: !usable, onchange: (e) => { row.on = e.target.checked; if (applyBtn) applyBtn.lastChild.textContent = applyBtnLabel(); } });
    return h('label.prop-row', { title: hint },
      cb,
      h('div.prop-pics', null, thumb(row.fr.grid), h('span.dim', null, '→'), thumb(row.out)),
      h('div.col', { style: { gap: '4px', minWidth: 0 } },
        h('div.row', null, h('b.mono', null, row.pose), h(`span.tag${tone ? '.' + tone : ''}`, null, label)),
        h('div.dim', { style: { fontSize: '12px' } }, describePropagation(row.r)),
        hint ? h('div.dim', { style: { fontSize: '11.5px' } }, hint) : null));
  }));
  const needAI = rows.filter((x) => x.r.status === 'partial' || x.r.status === 'conflict');

  const m = modal({
    title: `Do the same to the other frames of ${s.asset.name}`,
    wide: true,
    body: h('div.col', { style: { gap: '12px' } },
      h('p', { style: { margin: 0, color: 'var(--text2)' } }, `Your ${changed} changed pixel${changed > 1 ? 's' : ''} on `, h('b.mono', null, s.pose),
        ' carried to each frame below. Frames that need judgment are left unticked.'),
      list),
    actions: [
      needAI.length ? { label: 'Ask the AI about the rest', ico: 'bot', left: true, fn: () => {
        openRequestDialog(view.app, {
          scope: view.project.id, kind: 'frames', tier: 'builder',
          title: `Carry my ${s.pose} fix over to ${needAI.map((x) => x.pose).join(', ')} (${s.asset.id})`,
          body: `I fixed ${s.asset.id}:${s.pose} (${changed} px). Pixel Yak's Propagate couldn't carry it over cleanly to: ${needAI.map((x) => `${x.pose} (${describePropagation(x.r)})`).join('; ')}.\nRun \`node cli/yak.mjs propagate ${view.project.id} ${s.asset.id} ${s.pose}\` to see the analysis, then make those frames match my fix.`,
          target: { asset: s.asset.id, pose: s.pose, anim: null },
          targetThumb: view.thumbCanvas(),
          attachments: [view.frameSnapshot()],
        });
        return true;
      } } : null,
      { label: 'Cancel' },
      { label: applyBtnLabel(), kind: 'primary', ico: 'check', id: 'apply', fn: async () => {
        const chosen = rows.filter((x) => x.on && x.r.applied > 0);
        if (!chosen.length) return false;
        for (const row of chosen) {
          row.fr.undo.push(row.fr.grid.clone());
          row.fr.redo.length = 0;
          row.fr.grid = row.out;
          row.fr.via = `propagate:${s.pose}`;
          row.fr._pv = null;
          view.updateFrameCard(row.pose);
        }
        view.frameEdited();
        await view.save({ propagated: chosen.map((x) => x.pose), from: s.pose });
        return true;
      } },
    ].filter(Boolean),
  });
  applyBtn = m.el.querySelector('[data-act="apply"]');
}
