// studio/ui/js/host.js — one ProjectHost per open project: a hidden iframe on its own origin
// (studio://host-<id>) that runs the project's art code (host-runtime.js). Reloading the
// iframe re-imports the project's modules, which is how code an AI just wrote shows up.

const HOST_TIMEOUT = 25000;
let seq = 0;
const pendingCalls = new Map(); // id -> { resolve, reject, timer }
const hostsBySource = new Map(); // contentWindow -> ProjectHost

window.addEventListener('message', (e) => {
  const host = hostsBySource.get(e.source);
  if (!host || e.origin !== host.origin || !e.data || typeof e.data !== 'object') return;
  if (e.data.type === 'host-ready') { host._ready(String(e.data.v)); return; }
  const p = pendingCalls.get(e.data.id);
  if (!p) return;
  pendingCalls.delete(e.data.id);
  clearTimeout(p.timer);
  if (e.data.ok) p.resolve(e.data.data); else p.reject(new Error(e.data.error));
});

export class ProjectHost {
  constructor(project) {
    this.project = project;
    this.origin = `studio://host-${project.id}`;
    this.version = 0;
    this.frame = null;
    this.readyPromise = null;
    this.listing = null;
  }

  start() {
    this.destroyFrame();
    this.version++;
    this.listing = null;
    const f = document.createElement('iframe');
    f.className = 'host-frame';
    f.setAttribute('aria-hidden', 'true');
    f.tabIndex = -1;
    const qs = new URLSearchParams({ entry: this.project.assetsPath, project: this.project.id, v: String(this.version) });
    f.src = `${this.origin}/studio/ui/host.html?${qs}`;
    let done;
    this.readyPromise = new Promise((resolve, reject) => {
      done = { resolve, reject };
      setTimeout(() => reject(new Error(`${this.project.id}: art code did not load within ${HOST_TIMEOUT / 1000}s`)), HOST_TIMEOUT);
    });
    this.readyPromise.catch(() => {});
    this._done = done;
    this._version = String(this.version);
    document.body.append(f);
    this.frame = f;
    hostsBySource.set(f.contentWindow, this);
    return this.readyPromise;
  }

  _ready(v) { if (v === this._version && this._done) this._done.resolve(true); }

  async call(type, args, timeout = HOST_TIMEOUT) {
    await this.readyPromise;
    const id = ++seq;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { pendingCalls.delete(id); reject(new Error(`${type} timed out`)); }, timeout);
      pendingCalls.set(id, { resolve, reject, timer });
      this.frame.contentWindow.postMessage({ id, type, args }, this.origin);
    });
  }

  async list() {
    if (!this.listing) this.listing = await this.call('list');
    return this.listing;
  }

  // → Map(pose → { w, h, rgba: Uint8ClampedArray } | { error })
  async raw(asset, poses) {
    const out = new Map();
    const res = await this.call('raw', { asset, poses });
    for (const r of res) out.set(r.pose, r.rgba ? { w: r.w, h: r.h, rgba: new Uint8ClampedArray(r.rgba) } : { error: r.error || 'failed' });
    return out;
  }

  play(asset) { return this.call('play', { asset }); }
  stop(asset) { return this.call('stop', { asset }); }

  destroyFrame() {
    if (this.frame) {
      hostsBySource.delete(this.frame.contentWindow);
      this.frame.remove();
      this.frame = null;
    }
  }
}
