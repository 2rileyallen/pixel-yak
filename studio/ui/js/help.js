// studio/ui/js/help.js — the studio's own help sheet (F1). Tool help is fine here; the games
// themselves keep the user's rule of no on-screen tutorials.
import { h, modal } from './ui.js';

const KEYS = [
  ['B E G I', 'pencil · eraser · fill · pick color'], ['P', 'pixel-perfect strokes on/off'], ['L U D M', 'line · rectangle · shade ± · select'],
  ['Alt+click', 'pick a color with any tool'], ['Right-click', 'pencil erases · shade darkens'],
  ['1 – 5', 'shade of the current material'], ['X', 'mirror painting'],
  ['C (hold)', 'see the AI version'], ['V', 'highlight your changes'], ['O  #', 'onion skin · pixel grid'],
  ['[  ]  ← →', 'previous / next frame'], ['Enter', 'play / pause the preview'], ['N  H', 'new frame (copy) · hold frame'],
  ['Ctrl+Z / Y', 'undo / redo (per frame)'], ['Ctrl+C X V A', 'copy · cut · paste · select all'], ['Shift+H / V', 'flip selection or frame'],
  ['Wheel · Space-drag', 'zoom at cursor · pan'], ['0  +  −', 'fit · zoom'], ['Ctrl+S', 'save (the game updates live)'], ['F5', 'reload the art from disk (normally automatic)'],
];

export function showHelp() {
  modal({
    title: 'How Pixel Yak works',
    wide: true,
    body: h('div.col', { style: { gap: '18px' } },
      h('div.loop-steps', null,
        h('div', null, h('b', null, '1 · AI makes art'), 'Every sprite is code (a generator). New games and assets appear here by themselves — no restart.'),
        h('div', null, h('b', null, '2 · You paint over it'), 'Fix any pixel, add frames, change timing. Save and the running game updates live.'),
        h('div', null, h('b', null, '3 · Edits become lessons'), 'Each save logs what you changed for the game\'s art style, with a before/after card.'),
        h('div', null, h('b', null, '4 · The AI learns'), 'Lessons → Copy distill prompt. The AI updates the style rules and generators, so the next asset needs fewer fixes.')),
      h('div.help-grid', null,
        h('div', null,
          h('h4', null, 'Talking to the AI'),
          h('ul', null,
            h('li', null, h('b', null, 'Ask AI'), ' anywhere files a request (with a snapshot of the frame). It waits in the Inbox.'),
            h('li', null, h('b', null, 'Copy prompt'), ' and paste it into Claude Code (or any AI chat in this folder). The AI reads the inbox with the studio CLI and marks requests done.'),
            h('li', null, 'Requests the AI sends back to you (reviews, gate questions) show up as ', h('b', null, 'for you'), '.'),
            h('li', null, 'Pick the model: ', h('b', null, 'smart'), ' for new rigs, style learning and design; ', h('b', null, 'builder'), ' for frames from a pose table, content data and fixes.'),
            h('li', null, 'While playing: ', h('span.kbd', null, 'F8'), ' opens the tuning panel (feel the AI\'s alternatives live, Keep the one you like), ', h('span.kbd', null, 'F9'), ' sends the current moment (screenshot, the last few seconds, state, console and a save-state) to the studio, ', h('span.kbd', null, 'F5'), ' restarts the game.'))),
        h('div', null,
          h('h4', null, 'Frames & final art'),
          h('ul', null,
            h('li', null, h('b', null, 'Patch'), ' — your pixels on top of the AI generator. If the AI later changes that generator, the frame is flagged so you can check it.'),
            h('li', null, h('b', null, 'New frame'), ' copies the current frame; paint it into an in-between. ', h('b', null, 'Hold'), ' repeats a frame to slow a moment down. ', h('b', null, 'In-betweens…'), ' asks the AI to generate them.'),
            h('li', null, h('b', null, 'Do the same to other frames…'), ' (Frame panel, or the toast after you save) carries your fix to the asset\'s other frames with a preview — instant, no AI needed.'),
            h('li', null, h('b', null, 'Bake'), ' locks an asset as your pixel data — the generator can no longer change it. That\'s how final art is stored.'),
            h('li', null, 'Everything is plain files: your pixels in ', h('code', null, 'games/<game>/game/art/edits/'), ', requests in ', h('code', null, 'games/<game>/requests/'), ', what the AI learns in ', h('code', null, 'games/<game>/design/'), '.')))),
      h('div', null, h('h4', { style: { margin: '0 0 8px' } }, 'Keys (Art)'),
        h('div.keys', { style: { gridTemplateColumns: 'auto 1fr auto 1fr', columnGap: '14px' } }, KEYS.flatMap(([k, d]) => [h('span.kbd', null, k), h('span', null, d)])))),
    actions: [{ label: 'Got it', kind: 'primary' }],
  });
}
