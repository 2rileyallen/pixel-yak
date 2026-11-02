// engine/art/widget-art.js — default art for the engine's UI widgets (engine/shell/widgets.js):
// a 9-slice panel (raised, sunken, a focus reticle), a progress bar, a scrollbar and a checkbox, all
// small pixel-art sources the widgets cut and tile to any size. Register them in one line and the
// user can repaint every frame, bar and box in Pixel Yak:
//   entries: { ...widgetArt({ M, fin: FIN }) }                  (game/sprites.js)
// Colours come from the game's palette by role. Each role is a material id; left out, it is picked
// from common material names (so it works with any library palette), or pass your own:
//   widgetArt({ M, fin, roles: { face: M.WOOD, accent: M.GOLD } })
// Roles: edge (outline) · face (panel body) · rim (bevel light) · accent (focus, ticks) ·
// fill (a full bar) · well (empty insides).
import { Pix } from './pix.js';

const pick = (M, ...names) => names.map((n) => M[n]).find((v) => v != null);

function rolesFor(M, roles = {}) {
  const any = Object.values(M)[0];
  const r = {
    edge: pick(M, 'INK', 'NAVY', 'PANEL') ?? any,
    face: pick(M, 'NAVY', 'CLOTH', 'PANEL', 'INK') ?? any,
    rim: pick(M, 'WHITE', 'SILVER', 'METAL', 'CLOUD') ?? any,
    accent: pick(M, 'GOLD', 'HAIR', 'GLOW', 'SOUL') ?? any,
    fill: pick(M, 'LEAF', 'JADE', 'MOSS', 'GLOW', 'SOUL') ?? any,
    well: pick(M, 'INK', 'PANEL', 'NAVY') ?? any,
  };
  return { ...r, ...roles };
}

// A rectangle's 1-px edge with the four corner pixels left out (rounded look).
function roundRect(p, x, y, w, h, m, s) {
  p.rect(x + 1, y, w - 2, 1, m, s); p.rect(x + 1, y + h - 1, w - 2, 1, m, s);
  p.rect(x, y + 1, 1, h - 2, m, s); p.rect(x + w - 1, y + 1, 1, h - 2, m, s);
}

function panel(pose, R) {
  const p = new Pix(24, 24);
  if (pose === 'focus') {
    // corner brackets only: tiled edges stay see-through, so it frames whatever is under it
    for (const [cx, cy, dx, dy] of [[0, 0, 1, 1], [23, 0, -1, 1], [0, 23, 1, -1], [23, 23, -1, -1]]) {
      for (let i = 0; i < 6; i++) {
        p.set(cx + dx * i, cy, R.accent, i ? 4 : 3); p.set(cx, cy + dy * i, R.accent, i ? 4 : 3);
        p.set(cx + dx * i, cy + dy, R.accent, 2); p.set(cx + dx, cy + dy * i, R.accent, 2);
      }
    }
    return p;
  }
  const sunk = pose === 'inset';
  p.rect(1, 1, 22, 22, R.face, sunk ? 1 : 2);
  roundRect(p, 0, 0, 24, 24, R.edge, 1);
  // bevel: light on top/left, dark on bottom/right (swapped when sunken)
  const hi = sunk ? [R.face, 0] : [R.rim, 4], lo = sunk ? [R.rim, 3] : [R.face, 1];
  p.rect(1, 1, 22, 1, ...hi); p.rect(1, 2, 1, 21, ...hi);
  p.rect(2, 22, 21, 1, ...lo); p.rect(22, 2, 1, 20, ...lo);
  if (!sunk) {
    p.rect(2, 2, 20, 1, R.face, 3); // a soft second light row under the bevel
    for (const [x, y] of [[3, 3], [20, 3], [3, 20], [20, 20]]) { p.set(x, y, R.accent, 3); } // corner studs
  }
  return p;
}

function bar(pose, R) {
  const p = new Pix(12, 8);
  roundRect(p, 0, 0, 12, 8, R.edge, 1);
  if (pose === 'full') {
    p.rect(1, 1, 10, 6, R.fill, 3);
    p.rect(1, 1, 10, 1, R.fill, 4);
    p.rect(1, 6, 10, 1, R.fill, 2);
    p.set(2, 2, R.rim, 4);
  } else {
    p.rect(1, 1, 10, 6, R.well, 2);
    p.rect(1, 1, 10, 1, R.well, 1);
  }
  return p;
}

function scrollbar(pose, R) {
  const p = new Pix(8, 12);
  roundRect(p, 0, 0, 8, 12, R.edge, 1);
  if (pose === 'thumb') {
    p.rect(1, 1, 6, 10, R.rim, 3);
    p.rect(1, 1, 1, 10, R.rim, 4);
    p.rect(6, 1, 1, 10, R.rim, 2);
    p.rect(3, 5, 2, 1, R.rim, 2); p.rect(3, 7, 2, 1, R.rim, 2); // grip
  } else {
    p.rect(1, 1, 6, 10, R.well, 2);
    p.rect(1, 1, 1, 10, R.well, 1);
  }
  return p;
}

function checkbox(pose, R) {
  const p = new Pix(9, 9);
  roundRect(p, 0, 0, 9, 9, R.edge, 1);
  p.rect(1, 1, 7, 7, R.well, 2);
  p.rect(1, 1, 7, 1, R.well, 1);
  if (pose === 'on') { // a tick
    ['.....##', '....##.', '##.##..', '.###...', '..#....'].forEach((row, j) => {
      for (let i = 0; i < row.length; i++) if (row[i] === '#') p.set(1 + i, 2 + j, R.accent, j < 3 ? 4 : 3);
    });
  }
  return p;
}

const SPECS = {
  ui_panel: { name: 'UI panel (9-slice)', fw: 24, fh: 24, poses: ['panel', 'inset', 'focus'], draw: panel,
    description: 'Every box and menu, cut into 9 pieces: the corners stay, the edges and middle repeat. Keep corner details inside the outer 8 px.' },
  ui_bar: { name: 'UI bar', fw: 12, fh: 8, poses: ['empty', 'full'], draw: bar,
    description: 'Progress bars: "empty" is the whole bar, "full" is shown over it up to the amount. Ends are the outer 4 px; the middle repeats.' },
  ui_scrollbar: { name: 'UI scrollbar', fw: 8, fh: 12, poses: ['track', 'thumb'], draw: scrollbar,
    description: 'A scroll track and its thumb. The top and bottom 4 px stay; the middle repeats to any length.' },
  ui_checkbox: { name: 'UI checkbox', fw: 9, fh: 9, poses: ['off', 'on'], draw: checkbox,
    description: 'An option that is off or on.' },
};

// M: the game's materials · fin: its finish options (ramps) · roles: material per role (optional).
export function widgetArt({ M, fin, roles = {}, gen = null } = {}) {
  if (!M || !fin || !fin.ramps) throw new Error('widgetArt needs { M, fin: { ramps } }');
  const R = rolesFor(M, roles);
  const out = {};
  for (const [id, s] of Object.entries(SPECS)) {
    out[id] = {
      name: s.name, category: 'ui', tags: ['ui', 'widget'], fw: s.fw, fh: s.fh, ax: 0, ay: 0,
      poses: [...s.poses], anims: { all: [...s.poses] }, defaultAnim: 'all', description: s.description, gen,
      draw: (pose) => s.draw(pose, R).finish({ ramps: fin.ramps, glow: fin.glow, outline: null, rim: false, crease: false }),
    };
  }
  return out;
}
