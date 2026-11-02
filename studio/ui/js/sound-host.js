// studio/ui/js/sound-host.js — runs inside a hidden frame on the game's own origin
// (studio://sound-<game>/). Imports the game's sound module, takes its SOUND.base (the AI's songs,
// sound effects and instruments, before the user's edits) and posts it to the studio as plain
// data: { type: 'sound-data', v, ok, base, runtime, errors }. The studio applies the user's edits
// and plays everything with the engine itself, so a game's code never runs in the studio page.
const STUDIO_ORIGIN = 'studio://app';
const q = new URLSearchParams(location.search);
const errors = [];
addEventListener('error', (e) => errors.push(`${e.message}${e.filename ? ` (${e.filename.replace(/^studio:\/\/[^/]+\//, '')}:${e.lineno})` : ''}`));
addEventListener('unhandledrejection', (e) => errors.push(String((e.reason && (e.reason.stack || e.reason.message)) || e.reason)));
const warn = console.warn.bind(console);
// the engine's own [sound] notes (drift, edits for removed songs) are worked out by the studio itself
console.warn = (...a) => { const m = a.map(String).join(' '); if (!m.startsWith('[sound]')) errors.push(m); warn(...a); };

async function load() {
  const module = q.get('module') || '';
  if (!/^games\/[a-z0-9][a-z0-9-]{0,47}\/[A-Za-z0-9_./-]+\.m?js$/.test(module) || module.includes('..')) return { ok: false, errors: ['bad module path'] };
  let mod;
  try { mod = await import(`/${module}`); } catch (err) { return { ok: false, errors: [String(err && (err.stack || err.message) || err), ...errors] }; }
  const S = mod.SOUND;
  if (!S || !S.base) return { ok: false, errors: [`${module} doesn't export SOUND = defineSound({…}) (docs/contracts/SOUND.md)`, ...errors] };
  try {
    return { ok: true, runtime: S.runtime || null, base: JSON.parse(JSON.stringify(S.base)), errors: [...errors] };
  } catch (err) {
    return { ok: false, errors: [`the sound data isn't plain data (functions or cycles?): ${err.message}`, ...errors] };
  }
}

load().then((res) => parent.postMessage({ type: 'sound-data', v: q.get('v'), ...res }, STUDIO_ORIGIN));
