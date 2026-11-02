// studio/ui/js/ui.js — small DOM toolkit for the studio: h() element builder, toasts, modals,
// popup menus, a safe markdown renderer (no raw HTML), and formatting helpers.
import { icon } from './icons.js';

export function h(tag, attrs = null, ...children) {
  const [name, ...classes] = tag.split('.');
  const el = document.createElement(name || 'div');
  if (classes.length) el.className = classes.join(' ');
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = [el.className, v].filter(Boolean).join(' ');
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'html') el.innerHTML = v; // only ever used with trusted, studio-built strings
      else if (k in el && typeof v !== 'string') el[k] = v;
      else el.setAttribute(k, v === true ? '' : String(v));
    }
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const c of children) {
    if (c == null || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

export function mount(el, ...children) { el.replaceChildren(); append(el, children); return el; }

export function btn(label, onClick, { kind = '', ico = null, title = null, disabled = false, small = false, cls = '' } = {}) {
  return h(`button.btn${kind ? '.' + kind : ''}${small ? '.sm' : ''}${cls ? '.' + cls : ''}`, { type: 'button', title, disabled, onclick: onClick },
    ico ? icon(ico) : null, label ? h('span', null, label) : null);
}

export function iconBtn(ico, title, onClick, { active = false, cls = '', disabled = false } = {}) {
  return h(`button.icon-btn${active ? '.on' : ''}${cls ? '.' + cls : ''}`, { type: 'button', title, 'aria-label': title, disabled, onclick: onClick }, icon(ico));
}

// ------------------------------------------------------------------ toasts ---
let toastHost = null;
export function toast(message, { kind = 'info', action = null, timeout = 4200 } = {}) {
  if (!toastHost) toastHost = document.body.appendChild(h('div.toasts', { role: 'status', 'aria-live': 'polite' }));
  const ico = { info: 'dot', ok: 'check', warn: 'warn', error: 'warn', live: 'refresh' }[kind] || 'dot';
  const el = h(`div.toast.${kind}`, null, icon(ico), h('div.toast-msg', null, message),
    action ? h('button.toast-act', { type: 'button', onclick: () => { action.fn(); dismiss(); } }, action.label) : null,
    h('button.toast-x', { type: 'button', 'aria-label': 'Dismiss', onclick: () => dismiss() }, icon('close')));
  toastHost.append(el);
  requestAnimationFrame(() => el.classList.add('in'));
  let t = timeout ? setTimeout(dismiss, timeout) : null;
  el.addEventListener('mouseenter', () => clearTimeout(t));
  el.addEventListener('mouseleave', () => { if (timeout) t = setTimeout(dismiss, 1600); });
  function dismiss() { el.classList.remove('in'); setTimeout(() => el.remove(), 180); }
  return dismiss;
}

// ------------------------------------------------------------------ modals ---
const openModals = [];
export function modal({ title, body, actions = [], wide = false, onClose = null, cls = '' }) {
  const prevFocus = document.activeElement;
  const box = h(`div.modal${wide ? '.wide' : ''}${cls ? '.' + cls : ''}`, { role: 'dialog', 'aria-modal': 'true', 'aria-label': title });
  const back = h('div.modal-back', { onmousedown: (e) => { if (e.target === back) close(); } }, box);
  const foot = h('div.modal-foot');
  const api = { close, el: box, setBusy };
  for (const a of actions) {
    const b = btn(a.label, async () => {
      if (a.fn) {
        const keep = await a.fn(api);
        if (keep === false) return;
      }
      close();
    }, { kind: a.kind || '', ico: a.ico });
    if (a.id) b.dataset.act = a.id;
    if (a.left) b.classList.add('left');
    foot.append(b);
  }
  mount(box, h('div.modal-head', null, h('h2', null, title), iconBtn('close', 'Close (Esc)', () => close())), h('div.modal-body', null, body), actions.length ? foot : null);
  document.body.append(back);
  openModals.push(api);
  requestAnimationFrame(() => {
    back.classList.add('in');
    const f = box.querySelector('[autofocus], input:not([type=hidden]), textarea, select');
    (f || box.querySelector('.btn.primary') || box).focus?.();
  });
  function setBusy(on) { box.classList.toggle('busy', !!on); foot.querySelectorAll('button').forEach((b) => { b.disabled = !!on; }); }
  function close() {
    const i = openModals.indexOf(api);
    if (i < 0) return;
    openModals.splice(i, 1);
    back.classList.remove('in');
    setTimeout(() => back.remove(), 160);
    onClose?.();
    prevFocus?.focus?.();
  }
  return api;
}
export const topModal = () => openModals[openModals.length - 1] || null;

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && openModals.length) { e.preventDefault(); e.stopPropagation(); topModal().close(); }
}, true);

export function confirmDialog(title, text, { okLabel = 'OK', danger = false } = {}) {
  return new Promise((resolve) => {
    let answered = false;
    modal({
      title,
      body: h('p.confirm-text', null, text),
      actions: [
        { label: 'Cancel', fn: () => { answered = true; resolve(false); } },
        { label: okLabel, kind: danger ? 'danger' : 'primary', fn: () => { answered = true; resolve(true); } },
      ],
      onClose: () => { if (!answered) resolve(false); },
    });
  });
}

// ------------------------------------------------------------------- menus ---
let openMenu = null;
export function popMenu(anchor, items, { align = 'left' } = {}) {
  closeMenu();
  const m = h('div.menu', { role: 'menu' });
  for (const it of items) {
    if (it === '-') { m.append(h('div.menu-sep')); continue; }
    if (it.header) { m.append(h('div.menu-head', null, it.header)); continue; }
    m.append(h(`button.menu-item${it.active ? '.on' : ''}${it.danger ? '.danger' : ''}`, {
      type: 'button', role: 'menuitem', disabled: it.disabled,
      onclick: () => { closeMenu(); it.fn?.(); },
    }, it.ico ? icon(it.ico) : h('span.icon'), h('span.menu-label', null, it.label), it.hint ? h('span.menu-hint', null, it.hint) : null));
  }
  document.body.append(m);
  const r = anchor.getBoundingClientRect();
  const mw = m.offsetWidth, mh = m.offsetHeight;
  let x = align === 'right' ? r.right - mw : r.left;
  let y = r.bottom + 4;
  if (y + mh > innerHeight - 8) y = Math.max(8, r.top - mh - 4);
  x = Math.max(8, Math.min(x, innerWidth - mw - 8));
  m.style.left = `${x}px`; m.style.top = `${y}px`;
  openMenu = m;
  setTimeout(() => document.addEventListener('mousedown', outside, true));
  function outside(e) { if (!m.contains(e.target)) closeMenu(); }
  m._outside = outside;
  return m;
}
export function closeMenu() {
  if (!openMenu) return;
  document.removeEventListener('mousedown', openMenu._outside, true);
  openMenu.remove();
  openMenu = null;
}
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenu(); });

// ---------------------------------------------------------------- markdown ---
// Safe subset: headings, paragraphs, lists, code fences, quotes, tables (as text), inline
// code/bold/italic. Everything is text nodes — markdown from files can never inject HTML.
export function markdown(src) {
  const root = h('div.md');
  const lines = String(src || '').replace(/\r/g, '').split('\n');
  let i = 0;
  let list = null;
  const flushList = () => { list = null; };
  while (i < lines.length) {
    const line = lines[i];
    if (/^```/.test(line)) {
      flushList();
      const buf = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++]);
      i++;
      root.append(h('pre', null, h('code', null, buf.join('\n'))));
      continue;
    }
    const hm = /^(#{1,4})\s+(.*)$/.exec(line);
    if (hm) { flushList(); root.append(inline(h(`h${Math.min(6, hm[1].length + 1)}`), hm[2])); i++; continue; }
    const lm = /^(\s*)([-*]|\d+\.)\s+(.*)$/.exec(line);
    if (lm) {
      const ordered = /\d/.test(lm[2]);
      if (!list || list.ordered !== ordered) { list = { el: h(ordered ? 'ol' : 'ul'), ordered }; root.append(list.el); }
      list.el.append(inline(h('li', lm[1].length >= 2 ? { class: 'sub' } : null), lm[3]));
      i++;
      continue;
    }
    if (/^>\s?/.test(line)) { flushList(); root.append(inline(h('blockquote'), line.replace(/^>\s?/, ''))); i++; continue; }
    if (/^\s*\|/.test(line)) {
      flushList();
      const rows = [];
      while (i < lines.length && /^\s*\|/.test(lines[i])) rows.push(lines[i++]);
      const t = h('table');
      for (const r of rows) {
        if (/^\s*\|[\s:|-]+\|\s*$/.test(r)) continue;
        const tr = h('tr');
        r.trim().replace(/^\||\|$/g, '').split('|').forEach((c) => tr.append(inline(h('td'), c.trim())));
        t.append(tr);
      }
      root.append(h('div.md-table', null, t));
      continue;
    }
    if (/^\s*(---|\*\*\*)\s*$/.test(line)) { flushList(); root.append(h('hr')); i++; continue; }
    if (!line.trim()) { flushList(); i++; continue; }
    flushList();
    const para = [line];
    i++;
    while (i < lines.length && lines[i].trim() && !/^(#{1,4}\s|```|\s*([-*]|\d+\.)\s|>|\s*\|)/.test(lines[i])) para.push(lines[i++]);
    root.append(inline(h('p'), para.join(' ')));
  }
  return root;
}

function inline(el, text) {
  const re = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*\s][^*]*\*|_[^_\s][^_]*_)/g;
  let last = 0, m;
  while ((m = re.exec(text))) {
    if (m.index > last) el.append(text.slice(last, m.index));
    const t = m[0];
    if (t.startsWith('`')) el.append(h('code', null, t.slice(1, -1)));
    else if (t.startsWith('**')) el.append(h('strong', null, t.slice(2, -2)));
    else el.append(h('em', null, t.slice(1, -1)));
    last = m.index + t.length;
  }
  if (last < text.length) el.append(text.slice(last));
  return el;
}

// ----------------------------------------------------------------- helpers ---
export function timeAgo(iso) {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return '';
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 45) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  if (s < 86400 * 30) return `${Math.round(s / 86400)}d ago`;
  return new Date(iso).toLocaleDateString();
}

export const isTyping = (e) => {
  const t = e.target;
  return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
};

export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch {
    const ta = h('textarea', { style: { position: 'fixed', opacity: '0' } }, text);
    document.body.append(ta); ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}

export function debounce(fn, ms) {
  let t = null;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

export const pct = (n, d) => (d ? Math.round((n / d) * 1000) / 10 : 0);

export function field(label, control, hint = null) {
  return h('label.field', null, h('span.field-label', null, label), control, hint ? h('span.field-hint', null, hint) : null);
}

export function select(options, value, onChange, attrs = {}) {
  const s = h('select.input', { ...attrs, onchange: (e) => onChange?.(e.target.value) },
    options.map((o) => {
      const [v, l] = Array.isArray(o) ? o : [o, o];
      return h('option', { value: v, selected: v === value }, l);
    }));
  return s;
}
