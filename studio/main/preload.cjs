// studio/main/preload.cjs — the only bridge between the studio UI and the disk (sandboxed).
// Every call goes to electron/main.mjs, which validates ids and keeps paths inside the repo.
const { contextBridge, ipcRenderer } = require('electron');

async function call(channel, ...args) {
  const r = await ipcRenderer.invoke(channel, ...args);
  if (!r || !r.ok) throw new Error((r && r.error) || `${channel} failed`);
  return r.data;
}
const on = (channel) => (cb) => {
  const f = (e, data) => cb(data);
  ipcRenderer.on(channel, f);
  return () => ipcRenderer.removeListener(channel, f);
};

contextBridge.exposeInMainWorld('studio', {
  info: () => call('app:info'),
  projects: {
    list: () => call('projects:list'),
    update: (id, patch) => call('projects:update', id, patch),
    create: (opts) => call('projects:create', opts),
    check: (id) => call('projects:check', id),
    artFiles: (id) => call('art:files', id),
  },
  edits: {
    list: (pid) => call('edits:list', pid),
    read: (pid, aid) => call('edits:read', pid, aid),
    write: (pid, aid, edit) => call('edits:write', pid, aid, edit),
    remove: (pid, aid) => call('edits:delete', pid, aid),
  },
  requests: {
    list: (scope, opts) => call('requests:list', scope, opts || {}),
    create: (scope, req, attachments) => call('requests:create', scope, req, attachments || []),
    update: (scope, id, patch) => call('requests:update', scope, id, patch),
    remove: (scope, id) => call('requests:delete', scope, id),
  },
  ideas: {
    list: () => call('ideas:list'),
    save: (idea) => call('ideas:save', idea),
    remove: (id) => call('ideas:delete', id),
  },
  designs: {
    list: (opts) => call('designs:list', opts || {}),
    read: (shelf, id) => call('designs:read', shelf, id),
  },
  styles: {
    list: () => call('styles:list'),
    read: (id) => call('styles:read', id),
  },
  lessons: {
    append: (styleId, lesson, card) => call('lessons:append', styleId, lesson, card || null),
    read: (styleId, opts) => call('lessons:read', styleId, opts || {}),
  },
  game: {
    launch: (pid) => call('game:launch', pid),
    close: (pid) => call('game:close', pid),
    reload: (pid) => call('game:reload', pid),
    running: () => call('game:running'),
    console: (pid) => call('game:console', pid),
  },
  shell: { open: (rel, reveal) => call('shell:open', rel, !!reveal) },
  // engine/link: an F9 moment's save-state goes next to the request it opened (studio/main/ipc-link.mjs)
  link: { attachMoment: (momentId, scope, requestId) => call('link:attach-moment', momentId, scope, requestId) },
  onFsChanged: on('fs:changed'),
  onGameStatus: on('game:status'),
  onGameMoment: on('game:moment'),
  onGameConsole: on('game:console'),
  onLinkKept: on('link:kept'),
});
