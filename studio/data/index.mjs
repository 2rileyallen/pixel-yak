// studio/data/index.mjs — Pixel Yak's file-backed data layer, one module per concern. Pure Node
// (no Electron): the desktop app (studio/main) and the AI's CLI (cli/yak.mjs) both import this.
export * from './core.mjs';
export * from './games.mjs';
export * from './edits.mjs';
export * from './requests.mjs';
export * from './ideas.mjs';
export * from './lessons.mjs';
export * from './designs.mjs';
export * from './scaffold.mjs';
export * from './clips.mjs';
