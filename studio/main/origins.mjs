// studio/main/origins.mjs — what each studio:// origin may load, and the headers it's served with.
// Pure (no Electron), so tests/origins.test.mjs can pin it.
//
// The studio's own origin (studio://app) holds the bridge to the disk (window.studio): every game,
// the person's edits, their tickets, local/. A game's code runs in origins of its own
// (studio://host-<id> for the Art view, sound-<id> for the Sound view, play-<id> for its window), and
// two of those are frames inside the studio's window. A page of the studio's origin framed there would
// be same-origin with the studio, and could use window.studio. So:
// - no page of the studio's origin can be framed at all (frame-ancestors 'none'; the studio itself
//   never frames its own pages), and
// - the studio's origin runs code only from Pixel Yak itself (studio/, engine/) and the design library
//   (designs/, local/designs/). A game's files reach it only as data — pictures, sound, video, JSON,
//   text — never as a page or a script.

export const GAME_ORIGIN = /^(?:host|play|sound)-([a-z0-9][a-z0-9-]{0,47})$/;

// Files a browser can run as a page or a script (by extension, before any content type is picked).
export const RUNNABLE = /\.(?:html?|xhtml?|xht|m?js|cjs|svgz?|xml|xslt?)$/i;
// Where the studio's origin may run code from.
const APP_CODE = ['studio/', 'engine/', 'designs/', 'local/designs/', 'node_modules/three/'];

// rel: the request's path, decoded, relative to the repo (a leading / is fine). servePath has already
// refused dot segments, so `..` can't be used to step out of an allowed folder.
export function originMay(host, rel) {
  const p = String(rel).replace(/^\/+/, '');
  if (host === 'app') return !RUNNABLE.test(p) || APP_CODE.some((d) => p.startsWith(d));
  const m = GAME_ORIGIN.exec(host);
  if (!m) return false;
  // a game reads only its own folder, the shared engine (games without their own copy still import
  // it), the studio's frame pages and three.js — never another game, local/ or the design library
  return p.startsWith(`games/${m[1]}/`) || p.startsWith('engine/') || p.startsWith('studio/ui/') || p.startsWith('node_modules/three/');
}

// Headers every answer carries: no guessing a type from the bytes (a game's data must never be read
// as a page), and no framing of any studio page.
export function securityHeaders(host) {
  const h = { 'x-content-type-options': 'nosniff' };
  if (host === 'app') h['content-security-policy'] = "frame-ancestors 'none'";
  return h;
}
