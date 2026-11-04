// engine/shell/systems.js — a game as a list of systems, each owning one slice of the state, so
// one system (combat, crafting, the economy…) can be rewritten or removed without touching the
// others, and saves keep loading while that happens.
//
// A system is a plain object, one file each (game/systems/<id>.js or game/systems/<id>/index.js):
//   export default {
//     id: 'combat', version: 1,
//     init(world) { return { hp: 10 }; },        // its slice of a new game
//     step(slice, tick) {},                     // once per fixed step; tick = { n, input, tune, world, emit }
//     save(slice) { return slice; },            // optional: what goes into a save (default: the slice)
//     load(data, world) { return data; },       // optional: a saved section back into a slice (default: data)
//     migrations: { 1: (data) => data2 },       // optional: an older section brought forward ONE version
//     resetBelow: 0,                            // optional: sections older than this restart from init —
//   };                                          //   only when the person agreed that progress may reset
//
// Rules (they are what keep a rewrite contained):
// - A system writes only its own slice (world.state[id]). Reading another's goes through that
//   system's exported functions where it has them; `tick.world.state` is there for reading.
// - Systems talk through events: tick.emit('hit', { dmg: 3 }) → every later system this step, and
//   the scenes (sound, effects), see it in tick.events / the array stepWorld returns.
// - No Math.random, no DOM, no clock in a system: randomness comes from rng/hash with a seed in the
//   slice, so a world steps the same way in a test as in the game.
//
//   const world = createWorld(SYSTEMS, { seed })               → { tick: 0, seed, state: { combat: {...} } }
//   const events = stepWorld(SYSTEMS, world, { input, tune })  → this step's events
//   const data = saveWorld(SYSTEMS, world)                     → { tick, seed, systems: { combat: { v: 1, data } } }
//   const { world, report } = loadWorld(SYSTEMS, data)         → report: one line per system (below)
//
// loadWorld's report, per system: 'ok' (same version) · 'migrated' (from → to through migrations) ·
// 'new' (no section: the system is newer than the save, so it starts from init) · 'reset' (too old
// and resetBelow allows a restart) · 'failed' (too old with no way forward, a newer save, or a
// migration that threw — the world is NOT made; never overwrite that save) · 'dropped' (a section
// for a system the game no longer has; kept in world.dropped so nothing is lost if it comes back).

export const SYSTEMS_FORMAT = 'pixel-yak-world@1';

export function checkSystems(systems) {
  const seen = new Set();
  for (const s of systems) {
    if (!s || typeof s.id !== 'string' || !/^[a-z][a-z0-9-]*$/.test(s.id)) throw new Error(`a system needs an id like 'combat' (got ${JSON.stringify(s && s.id)})`);
    if (seen.has(s.id)) throw new Error(`two systems are called '${s.id}'`);
    seen.add(s.id);
    if (!Number.isInteger(s.version) || s.version < 1) throw new Error(`system '${s.id}' needs a whole-number version ≥ 1`);
    if (typeof s.init !== 'function') throw new Error(`system '${s.id}' needs init(world)`);
    if (s.step !== undefined && typeof s.step !== 'function') throw new Error(`system '${s.id}': step must be a function`);
  }
  return systems;
}

export function createWorld(systems, { seed = 1 } = {}) {
  checkSystems(systems);
  const world = { format: SYSTEMS_FORMAT, tick: 0, seed, state: {}, dropped: {} };
  for (const s of systems) world.state[s.id] = s.init(world);
  return world;
}

export function stepWorld(systems, world, { input = null, tune = {} } = {}) {
  const events = [];
  let by = '';
  const tick = { n: world.tick, input, tune, world, events, emit: (type, payload = {}) => { events.push({ ...payload, type, by }); } };
  for (const s of systems) {
    if (!s.step) continue;
    by = s.id;
    s.step(world.state[s.id], tick);
  }
  world.tick++;
  return events;
}

export function saveWorld(systems, world) {
  const out = { format: SYSTEMS_FORMAT, tick: world.tick, seed: world.seed, systems: {} };
  for (const s of systems) out.systems[s.id] = { v: s.version, data: s.save ? s.save(world.state[s.id]) : world.state[s.id] };
  // sections of systems the game dropped stay in the save, so bringing a system back loses nothing
  for (const [id, sec] of Object.entries(world.dropped || {})) if (!(id in out.systems)) out.systems[id] = sec;
  return out;
}

// Bring one saved section forward to the system's version. → { status, data, from, to, error }
export function bringSection(s, sec) {
  const from = sec && Number.isInteger(sec.v) ? sec.v : 0;
  const to = s.version;
  if (from === to) return { status: 'ok', data: sec.data, from, to };
  if (from > to) return { status: 'failed', from, to, error: `the save's ${s.id} is version ${from}, newer than this build's ${to}` };
  let v = from, data = sec.data;
  try {
    while (v < to) {
      const m = s.migrations && s.migrations[v];
      if (typeof m !== 'function') break;
      data = m(data);
      v++;
    }
  } catch (e) {
    return { status: 'failed', from, to, error: `${s.id}: migration from version ${v} threw: ${e && e.message}` };
  }
  if (v === to) return { status: 'migrated', data, from, to };
  if (from < (s.resetBelow || 0)) return { status: 'reset', from, to };
  return { status: 'failed', from, to, error: `${s.id}: no migration from version ${v} (add migrations[${v}], or resetBelow if the person agreed this may restart)` };
}

export function loadWorld(systems, saved) {
  checkSystems(systems);
  if (!saved || typeof saved !== 'object' || !saved.systems) {
    return { world: null, report: [{ id: '*', status: 'failed', error: 'not a world save (no systems)' }] };
  }
  const world = { format: SYSTEMS_FORMAT, tick: saved.tick | 0, seed: saved.seed ?? 1, state: {}, dropped: {} };
  const report = [];
  for (const s of systems) {
    const sec = saved.systems[s.id];
    if (!sec) { world.state[s.id] = s.init(world); report.push({ id: s.id, status: 'new', to: s.version }); continue; }
    const r = bringSection(s, sec);
    if (r.status === 'failed') { report.push({ id: s.id, status: 'failed', from: r.from, to: r.to, error: r.error }); continue; }
    if (r.status === 'reset') { world.state[s.id] = s.init(world); report.push({ id: s.id, status: 'reset', from: r.from, to: r.to }); continue; }
    try { world.state[s.id] = s.load ? s.load(r.data, world) : r.data; } catch (e) {
      report.push({ id: s.id, status: 'failed', from: r.from, to: r.to, error: `${s.id}: load threw: ${e && e.message}` });
      continue;
    }
    report.push({ id: s.id, status: r.status, from: r.from, to: r.to });
  }
  const known = new Set(systems.map((s) => s.id));
  for (const [id, sec] of Object.entries(saved.systems)) {
    if (known.has(id)) continue;
    world.dropped[id] = sec;
    report.push({ id, status: 'dropped', from: sec && sec.v });
  }
  return report.some((r) => r.status === 'failed') ? { world: null, report } : { world, report };
}

// One line for a person or a log: "combat migrated 1→2 · inventory new · economy ok".
export function describeLoad(report) {
  return report.map((r) => `${r.id} ${r.status}${r.status === 'migrated' || r.status === 'reset' ? ` ${r.from}→${r.to}` : ''}${r.error ? ` (${r.error})` : ''}`).join(' · ');
}
