// studio/ui/js/link.js — the studio's half of engine/link: a toast when the user keeps an F8
// tuning choice in a game, and the request dialog an F9 moment opens (screenshot, the last
// seconds as one picture, state, console; the save-state is written next to the request once
// it's saved). docs/contracts/TUNING.md, docs/contracts/MOMENTS.md.
import { toast, copyText } from './ui.js';
import { openRequestDialog } from './request-dialog.js';

const api = window.studio;
const BODY_MAX = 20000;  // a request's body (studio/data/requests.mjs)
const ROOM_FOR_WORDS = 2500; // what the user types in the dialog

const show = (v) => (typeof v === 'string' ? v : JSON.stringify(v));

export function tuningPrompt(p) {
  return `In ${p.name} I kept tuning choices with F8. Run \`node cli/yak.mjs tuning ${p.id}\`, build each winner into the code `
    + `(and remove the losers and the knob), then mark each one built in with \`node cli/yak.mjs tuning ${p.id} --done <slug>\`. `
    + 'Follow .agents/skills/explore/SKILL.md.';
}

export function initLink(app) {
  api.onLinkKept((k) => {
    const p = app.projects.find((x) => x.id === k.projectId);
    toast(`Kept ${k.label} for ${k.name}${k.note ? ` — “${k.note}”` : ''}`, {
      kind: 'ok', timeout: 6000,
      action: p ? { label: 'Copy prompt', fn: () => copyText(tuningPrompt(p)).then(() => toast('Prompt copied — paste it into your AI chat.', { kind: 'ok' })) } : null,
    });
  });
}

// m: the moment from studio/main (main.mjs captureMoment + ipc-link.mjs)
export function openMoment(app, m) {
  const p = app.projects.find((x) => x.id === m.projectId);
  const pics = [m.dataUrl, m.strip].filter(Boolean);
  const head = [
    `Moment: ${m.at} (F9 in ${p ? p.name : m.projectId}).`,
    `Attached: ${m.strip ? `1 = the screen at F9, 2 = the last ${m.seconds} s as ${m.frames} frames (oldest first, left to right)` : 'the screen at F9'}`
      + `${m.momentId ? '; the save-state (the *-save.json attachment): load it in the game instead of reading it (docs/contracts/MOMENTS.md)' : ''}.`,
    m.tuning && m.tuning.length ? `F8 values at this moment: ${m.tuning.map((t) => `${t.name} = ${show(t.value)} (code ${show(t.default)})`).join('; ')}.` : '',
    m.gameError ? `The game said: ${m.gameError}` : '',
  ].filter(Boolean).join('\n');
  // as much of the state as the request's body can hold; the save-state file has all of it
  const consoleLen = (m.console || []).slice(-25).join('\n').length;
  const room = Math.max(1000, BODY_MAX - ROOM_FOR_WORDS - head.length - consoleLen - 200);
  let state = m.state;
  if (state && state.length > room) state = `${state.slice(0, room)}… (cut here: the whole state is in the save-state file)`;
  else if (state && m.stateCut) state += '… (cut here: the whole state is in the save-state file)';
  openRequestDialog(app, {
    scope: m.projectId, dialogTitle: `Talk about this moment${p ? ` in ${p.name}` : ''}`, kind: 'gameplay',
    attachments: pics, context: { head, state, console: m.console },
    onSaved: (r) => {
      if (!m.momentId) return;
      api.link.attachMoment(m.momentId, r.scope, r.id)
        .catch((err) => toast(`The save-state was not attached: ${err.message}`, { kind: 'error', timeout: 8000 }));
    },
  });
}
