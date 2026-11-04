// game/systems/clock.js — the placeholder's only system: it counts steps, and the gallery animates
// from it. Replace it with the game's first real system (and its page in design/systems/).
// A system is pure: no DOM, no Math.random, no Date — so dev/systems.test.mjs can play it in Node.
export default {
  id: 'clock',
  version: 1,
  init: () => ({ ticks: 0 }),
  step(s) { s.ticks++; },
};
