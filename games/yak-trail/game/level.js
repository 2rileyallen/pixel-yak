// game/level.js — the trail up the mountain, as data, and the builder that turns it into what the
// sim and the renderer read. Pure: no DOM, no randomness, so tests import it directly.
//
// The course is a list of steps a cursor walks from left to right (x in pixels, ground height in
// pixels, up = positive rise). To change the trail, edit COURSE; everything else follows.
//   ['zone', 'meadow']     the look from here on: meadow · rocky · snow
//   ['flat', 96]           level ground, 96 px long
//   ['slope', 64, 32]      64 px long, rising 32 (falling when negative); keep to 1:1 or 1:2
//   ['ledge', 16]          a step straight up (or down): taller than a stride, so the yak hops it
//   ['gap', 40]            no ground: a drop to nowhere (a fall goes back to the last cairn)
//   ['rock', 'small']      a rock to hop over: small · mid · big (the cursor moves past it)
//   ['tuft']               a grass tuft to munch, at the cursor
//   ['bird']               a bird perched on the ground, at the cursor
//   ['cairn']              a checkpoint: a fall comes back here
//   ['summit']             the top: reach it to finish (put it on flat ground)

export const ROCKS = {
  small: { w: 16, h: 10 },
  mid: { w: 20, h: 16 },
  big: { w: 26, h: 22 },
};
export const GAP = 32767; // ground height of a column with no ground

export const COURSE = [
  ['zone', 'meadow'],
  ['flat', 176], ['tuft'], ['flat', 72], ['rock', 'small'], ['flat', 56], ['tuft'], ['flat', 48],
  ['slope', 64, 32], ['flat', 80], ['bird'], ['flat', 40], ['tuft'], ['flat', 48], ['rock', 'small'],
  ['flat', 64], ['ledge', 16], ['flat', 48], ['tuft'], ['flat', 24], ['tuft'], ['flat', 72],
  ['slope', 96, 48], ['flat', 40], ['cairn'], ['flat', 72], ['rock', 'mid'], ['flat', 48], ['tuft'], ['flat', 40],
  ['gap', 32], ['flat', 64], ['bird'], ['flat', 32], ['slope', 32, 16], ['flat', 56], ['tuft'], ['flat', 48],
  ['rock', 'small'], ['flat', 24], ['rock', 'small'], ['flat', 56], ['slope', 64, -32], ['flat', 48], ['tuft'],
  ['flat', 40], ['gap', 36], ['flat', 40], ['slope', 96, 48], ['flat', 48], ['tuft'], ['flat', 32], ['ledge', 16],
  ['zone', 'rocky'],
  ['flat', 64], ['cairn'], ['flat', 48], ['rock', 'mid'], ['flat', 40], ['slope', 64, 64], ['flat', 48], ['tuft'],
  ['flat', 40], ['gap', 40], ['flat', 48], ['ledge', 24], ['flat', 40], ['rock', 'small'], ['flat', 48],
  ['slope', 48, 24], ['flat', 32], ['rock', 'big'], ['flat', 48], ['tuft'], ['flat', 32],
  ['ledge', -24], ['flat', 48], ['bird'], ['flat', 32], ['gap', 44], ['flat', 40], ['ledge', 24], ['flat', 32],
  ['cairn'], ['flat', 40], ['ledge', 16], ['flat', 32], ['ledge', 16], ['flat', 32], ['ledge', 16], ['flat', 48], ['tuft'],
  ['flat', 40], ['slope', 64, 32], ['flat', 48], ['rock', 'mid'], ['flat', 40], ['tuft'], ['flat', 48], ['ledge', 16],
  ['flat', 40], ['slope', 32, 32],
  ['zone', 'snow'],
  ['flat', 64], ['cairn'], ['flat', 56], ['rock', 'small'], ['flat', 48], ['gap', 40], ['flat', 56], ['tuft'],
  ['flat', 40], ['slope', 64, 32], ['flat', 40], ['rock', 'big'], ['flat', 56], ['ledge', 24], ['flat', 48],
  ['bird'], ['flat', 40], ['gap', 48], ['flat', 48], ['tuft'], ['flat', 32], ['slope', 96, 48], ['flat', 40],
  ['cairn'], ['flat', 48], ['rock', 'mid'], ['flat', 40], ['ledge', 16], ['flat', 32], ['rock', 'small'],
  ['flat', 48], ['gap', 36], ['flat', 40], ['tuft'], ['flat', 40], ['rock', 'small'], ['flat', 24], ['rock', 'mid'],
  ['flat', 48], ['slope', 64, 64], ['flat', 72], ['summit'], ['flat', 160],
];

// Build the level: per-column heights, the things on the trail, and the zones.
// → { width, ground (terrain surface y per column, GAP = none), top (what the yak stands on: ground or
//    rock), zones [{ x, zone }], rocks [{ x, y, kind, w, h }], tufts [{ x, y }], birds, cairns [{ x, y }],
//    summit { x, y }, start { x, y }, bottom (below this the yak has fallen) }
export function buildLevel(course = COURSE) {
  const cols = [];
  const out = { zones: [], rocks: [], tufts: [], birds: [], cairns: [], summit: null };
  let x = 0, y = 0;
  const run = (n, yAt) => { for (let i = 0; i < n; i++) cols[x + i] = yAt(i); x += n; };
  for (const [kind, a, b] of course) {
    if (kind === 'zone') out.zones.push({ x, zone: a });
    else if (kind === 'flat') run(a, () => y);
    else if (kind === 'slope') { const y0 = y; run(a, (i) => y0 - Math.round(((i + 1) * b) / a)); y = y0 - b; }
    else if (kind === 'ledge') y -= a;
    else if (kind === 'gap') run(a, () => GAP);
    else if (kind === 'rock') { const r = ROCKS[a]; out.rocks.push({ x: x + r.w / 2, y, kind: a, w: r.w, h: r.h }); run(r.w, () => y); }
    else if (kind === 'tuft') out.tufts.push({ x, y });
    else if (kind === 'bird') out.birds.push({ x, y });
    else if (kind === 'cairn') out.cairns.push({ x, y });
    else if (kind === 'summit') out.summit = { x, y };
    else throw new Error(`level: unknown step "${kind}"`);
  }
  const width = cols.length;
  const ground = Int16Array.from(cols);
  const top = Int16Array.from(cols);
  for (const r of out.rocks) for (let i = r.x - r.w / 2 + 2; i < r.x + r.w / 2 - 2; i++) top[i] = r.y - r.h;
  let lowest = -GAP;
  for (const v of ground) if (v !== GAP && v > lowest) lowest = v;
  return { width, ground, top, ...out, start: { x: 40, y: ground[40] }, bottom: lowest + 160 };
}

// The zone a column belongs to.
export function zoneAt(level, x) {
  let z = level.zones[0] ? level.zones[0].zone : 'meadow';
  for (const s of level.zones) { if (s.x > x) break; z = s.zone; }
  return z;
}
