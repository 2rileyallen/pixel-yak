// studio/ui/js/request-dialog.js — "ask the AI" dialog. Used from the Art view (about an asset or
// frame, with a snapshot attached), the Inbox, and F9 moments captured in a running game.
import { h, modal, field, select, toast, copyText } from './ui.js';
import { icon } from './icons.js';
import { requestPrompt } from './prompts.js';

const KIND_LABEL = {
  art: 'Art — fix or redraw', frames: 'Frames — add / in-betweens', animation: 'Animation — timing or motion', audio: 'Audio / music',
  gameplay: 'Gameplay / feel', level: 'Level / map layout', story: 'Story / dialogue', bug: 'Bug', style: 'Art style (whole style)',
  review: 'Review / approval', studio: 'Pixel Yak itself', other: 'Other',
};

// opts: { scope, kind, tier, title, body, target: { asset, pose, anim, box }, targetThumb: canvas,
//         attachments: [dataUrl], context: { state, console: [] }, assignee }
export function openRequestDialog(app, opts = {}) {
  const projects = app.projects.filter((p) => p.status !== 'archived');
  let scope = opts.scope || (app.project && app.project.id) || '_studio';
  let attachments = [...(opts.attachments || [])];
  let target = opts.target || null;

  const title = h('input.input', { value: opts.title || '', placeholder: 'e.g. Give the slash two more wind-up frames', maxlength: 200, autofocus: true });
  const body = h('textarea.input', { rows: 6, placeholder: 'What should change, and why? The more specific, the better the AI does.' }, opts.body || '');
  const kind = select(Object.entries(KIND_LABEL), opts.kind || (target ? 'art' : 'gameplay'), null);
  const tier = select([['any', 'Any model'], ['builder', 'Builder (cheaper) model'], ['smart', 'Smart model']], opts.tier || 'any', null);
  const who = select([['ai', 'The AI'], ['user', 'Me (a reminder)']], opts.assignee || 'ai', null);
  const scopeSel = select([...projects.map((p) => [p.id, p.name]), ['_studio', 'Pixel Yak (the tool)']], scope, (v) => { scope = v; });

  const targetBox = h('div');
  const renderTarget = () => {
    targetBox.replaceChildren();
    if (!target || !target.asset) return;
    targetBox.append(h('div.target-pill', null,
      opts.targetThumb || icon('art'),
      h('div.grow', null, h('div', null, h('b', null, target.asset), target.pose ? h('span.dim', null, ` · ${target.pose}`) : null, target.anim ? h('span.dim', null, ` · anim ${target.anim}`) : null),
        h('div.dim', { style: { fontSize: '12px' } }, 'The AI gets the asset id, frame, and a zoomed snapshot.')),
      h('button.icon-btn', { type: 'button', title: 'Remove target', onclick: () => { target = null; opts.targetThumb = null; renderTarget(); } }, icon('close'))));
  };
  renderTarget();

  const shots = h('div.attachments');
  const renderShots = () => {
    shots.replaceChildren(...attachments.map((d, i) => h('div', { style: { position: 'relative' } },
      h('img.shot-preview', { src: d, alt: 'attachment', style: { maxHeight: '170px' } }),
      h('button.icon-btn', { type: 'button', title: 'Remove image', style: { position: 'absolute', top: '4px', right: '4px', background: 'rgba(8,9,19,.8)' }, onclick: () => { attachments.splice(i, 1); renderShots(); } }, icon('close')))));
  };
  renderShots();

  const ctx = opts.context || null;
  const ctxText = ctx ? [ctx.state ? `Game state: ${ctx.state}` : '', ctx.console && ctx.console.length ? `Recent game console:\n${ctx.console.slice(-25).join('\n')}` : ''].filter(Boolean).join('\n\n') : '';
  const includeCtx = h('input', { type: 'checkbox', checked: true });

  const m = modal({
    title: opts.dialogTitle || 'Ask the AI',
    wide: true,
    body: h('div.col', { style: { gap: '14px' } },
      field('Title', title),
      field('Details', body),
      h('div.form-grid', null, field('Game', scopeSel), field('Kind', kind), field('Who does it', who), field('Model', tier, 'Smart: new rigs, style learning, design. Builder: frames from a pose table, data, fixes.')),
      targetBox,
      attachments.length ? field('Attached', shots) : null,
      ctxText ? h('label.check', null, includeCtx, 'Attach the game state and console lines the studio captured') : null),
    actions: [
      { label: 'Cancel' },
      {
        label: 'Save request', kind: 'primary', ico: 'send',
        fn: async (api) => {
          if (!title.value.trim()) { title.focus(); toast('Give it a short title', { kind: 'warn' }); return false; }
          api.setBusy(true);
          const req = {
            title: title.value.trim(),
            body: body.value.trim() + (ctxText && includeCtx.checked ? `\n\n---\n${ctxText}` : ''),
            kind: kind.value, tier: tier.value, assignee: who.value, target,
          };
          try {
            const r = await window.studio.requests.create(scope, req, attachments.map((dataUrl, i) => ({ name: `a${i}.png`, dataUrl })));
            const proj = app.projects.find((p) => p.id === scope) || null;
            toast(r.assignee === 'ai' ? 'Request saved — the AI will see it in the inbox.' : 'Reminder saved.', {
              kind: 'ok',
              action: r.assignee === 'ai' ? { label: 'Copy prompt', fn: () => copyText(requestPrompt(r, proj)).then(() => toast('Prompt copied — paste it into your AI chat.', { kind: 'ok' })) } : null,
            });
            opts.onSaved?.(r);
            return true;
          } catch (err) {
            api.setBusy(false);
            toast(err.message, { kind: 'error' });
            return false;
          }
        },
      },
    ],
  });
  return m;
}

export { KIND_LABEL };
