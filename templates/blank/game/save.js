// game/save.js — {{NAME}}'s saves. A save is the world: each system's slice under that system's own
// version (engine/shell/systems.js), so rewriting one system means bumping its version and adding a
// migration — the rest of the save, and every player's progress, stays as it was.
// Slots live in IndexedDB, one database for this game, with a backup of the save before
// (engine/shell/saves.js). A save that can't be loaded is never written over silently: the engine
// keeps it aside (kept), and loadFrom says what went wrong so the game can tell the player.
import { openSlots } from '../engine/shell/saves.js';
import { saveWorld, loadWorld, describeLoad } from '../engine/shell/systems.js';
import { SYSTEMS } from './systems/index.js';

// The whole save's shape. Systems version themselves, so this changes only if the outer shape does.
export const SAVE_FORMAT = 1;

export const snapshot = (world) => saveWorld(SYSTEMS, world);

// A save (or an F9 moment's) back into a world, or null when it can't load (the console says why).
export function restore(data) {
  const { world, report } = loadWorld(SYSTEMS, data);
  if (!world) console.warn(`[save] can't load: ${describeLoad(report)}`);
  return world;
}

let slots = null;
export async function saves() {
  return slots || (slots = await openSlots('{{ID}}', { version: SAVE_FORMAT, summary: (d) => ({ tick: d.tick }) }));
}

// await saveTo(1, world) → true, or false (then (await saves()).failed says why: tell the player)
export async function saveTo(n, world) { return (await saves()).write(n, snapshot(world)); }

// await loadFrom(1) → null (empty) or { world, report, backup, damaged, error }. world is null when
// neither the save nor its backup loads; the slot's raw text is kept (saves().kept(n)), so offer
// "start fresh" without deleting anything.
export async function loadFrom(n) {
  const r = await (await saves()).load(n, (data) => {
    const res = loadWorld(SYSTEMS, data);
    if (!res.world) throw new Error(describeLoad(res.report));
    return res;
  });
  if (!r) return null;
  return { world: r.value ? r.value.world : null, report: r.value ? r.value.report : [], backup: r.backup, damaged: r.damaged, error: r.error || '' };
}
