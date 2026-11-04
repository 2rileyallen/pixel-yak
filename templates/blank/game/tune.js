// game/tune.js — the F8 knobs and variants (docs/contracts/TUNING.md). In a game launched from Pixel
// Yak the person slides them live and keeps what feels right; everywhere else (tests included) each is
// its default. Systems read them as tick.tune.<name>. Building a kept choice in: the value becomes a
// constant where it's used and its line here goes (skill explore).
import { studio } from '../engine/link/studio.js';

const KNOBS = {
  frameTicks: studio.knob('Animation frame ticks', 10, { min: 2, max: 30, step: 1 }),
};

// The knobs' values right now, as one plain object.
export const tuneNow = () => Object.fromEntries(Object.entries(KNOBS).map(([k, f]) => [k, f()]));
