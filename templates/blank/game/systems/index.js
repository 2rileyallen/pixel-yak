// game/systems/index.js — {{NAME}}'s systems, in the order they step (engine/shell/systems.js).
// Each owns one slice of the world (world.state[id]), writes only that slice, talks to the others
// through events (tick.emit) or their exported functions, and has its own page:
// design/systems/<id>.md. This list is the whole game's shape, so keep it readable.
//   Add a system:     a new file here, one line below, its page, and a line in design/game.md.
//   Remove one:       delete its line (saves keep its section, so bringing it back loses nothing).
//   Rewrite one:      bump its version and add migrations[old] (dev/saves/ proves old saves load).
import clock from './clock.js';

export const SYSTEMS = [clock];
