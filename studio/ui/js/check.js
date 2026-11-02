// studio/ui/js/check.js — headless art check for `node cli/yak.mjs check <project>`. Loads the
// project's art (assets.js → its registry, with the user's edits), renders every id/pose and
// reports what doesn't resolve: throws, draws nothing, wrong size for its contract, anims that
// name missing poses, and the registry's own warnings (edit drift, edits for unknown ids …).
// Prints TOOLRESULT <json>. Loaded via file:// by tools/capture.cjs.
import { effectivePoses, effectiveAnims } from '../../../engine/art/edits.js';
import { unwrapCanvas } from './canvas-unwrap.js';

const q = new URLSearchParams(location.search);
const root = document.getElementById('root');
const warnings = [];
const warn = console.warn.bind(console);
console.warn = (...a) => { warnings.push(a.map(String).join(' ')); warn(...a); };
const done = (obj) => {
  console.log('TOOLRESULT ' + JSON.stringify(obj));
  root.textContent = obj.error ? obj.error : `${obj.assets} assets, ${obj.poses} poses, ${obj.problems.length} problem(s)\n${obj.problems.map((p) => `${p.level} ${p.asset ? p.asset + (p.pose ? ':' + p.pose : '') + ' ' : ''}${p.msg}`).join('\n')}`;
  window.__ready = true;
};

try {
  const t0 = performance.now();
  const mod = await import(`../../../${q.get('entry')}`);
  const loadMs = performance.now() - t0;
  let EDITS = {};
  if (q.get('edits')) { try { EDITS = (await import(`../../../${q.get('edits')}/index.js`)).EDITS || {}; } catch { /* no edits yet */ } }
  const problems = [];
  const bad = (level, asset, pose, msg) => problems.push({ level, asset, pose, msg });
  const ids = new Set();
  const timing = [];
  let assets = 0, poses = 0;
  const t1 = performance.now();
  for (const a of mod.ASSETS || []) {
    if (!a || typeof a.id !== 'string') { bad('ERROR', null, null, 'an ASSETS entry has no id'); continue; }
    if (ids.has(a.id)) bad('ERROR', a.id, null, 'listed twice in ASSETS');
    ids.add(a.id);
    if (a.kind === 'audio') continue;
    assets++;
    const ed = EDITS[a.id];
    const list = Array.isArray(a.poses) && a.poses.length ? effectivePoses(a.poses.map(String), ed) : ['default'];
    const ta = performance.now();
    list.forEach((pose, i) => {
      poses++;
      let c;
      try {
        const res = typeof a.getCanvas === 'function' ? a.getCanvas(pose) : (a.frames && a.frames[pose]) || a.canvas;
        c = unwrapCanvas(res, i);
      } catch (err) { bad('ERROR', a.id, pose, `throws: ${err.message}`); return; }
      if (!c) { bad('ERROR', a.id, pose, 'draws nothing (no canvas)'); return; }
      if (a.fw && a.fh && (c.width !== a.fw || c.height !== a.fh)) bad('ERROR', a.id, pose, `is ${c.width}x${c.height}, contract says ${a.fw}x${a.fh}`);
    });
    timing.push([a.id, performance.now() - ta, list.length]);
    const anims = effectiveAnims(a.anims, ed);
    for (const [k, seq] of Object.entries(anims)) {
      const missing = (Array.isArray(seq) ? seq : [seq]).filter((p) => !list.includes(String(p)));
      if (missing.length) bad('ERROR', a.id, null, `anim "${k}" uses missing pose${missing.length > 1 ? 's' : ''} ${[...new Set(missing)].join(', ')}`);
    }
    if (a.defaultAnim && Object.keys(anims).length && !anims[a.defaultAnim]) bad('WARN', a.id, null, `defaultAnim "${a.defaultAnim}" is not one of its anims`);
  }
  const renderMs = performance.now() - t1;
  const registry = mod.STUDIO && mod.STUDIO.runtime;
  if (!registry) for (const id of Object.keys(EDITS)) if (!ids.has(id)) bad('WARN', id, null, 'has studio edits but no such asset');
  for (const w of warnings) if (!/ is \d+x\d+, contract says /.test(w)) bad('WARN', null, null, w); // sizes are reported above
  timing.sort((x, y) => y[1] - x[1]);
  done({
    runtime: registry || null, assets, poses, loadMs: Math.round(loadMs), renderMs: Math.round(renderMs),
    slowest: timing.slice(0, 3).map(([id, ms, n]) => ({ id, ms: Math.round(ms), poses: n })), problems,
  });
} catch (err) {
  done({ error: String(err.stack || err.message || err) });
}
