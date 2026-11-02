// cli/commands/requests.mjs — the inbox between the user and the AI (skill requests).
import { D, out, fail, findRequest, allScopes, requestLine, printRequest, plural } from '../lib.mjs';

export const section = { title: 'Requests (the inbox between the user and the AI)', order: 10 };

const scopeOf = (v) => (v === 'studio' || v === 'pixel-yak' ? '_studio' : D.assertId('project', v || ''));

export const commands = {
  inbox: {
    usage: 'inbox [game|all|studio] [--status open|in-progress|done|wontfix|all] [--for ai|user] [--full]',
    help: 'one line per request (id, game, kind, age, start of the text);\n--full prints every request in full',
    async run({ pos, opt }) {
      const which = pos[0] || 'all';
      const scopes = which === 'all' ? await allScopes() : [scopeOf(which)];
      const st = opt.status || 'open';
      const archived = st === 'done' || st === 'wontfix' || st === 'all';
      const groups = [];
      for (const scope of scopes) {
        let reqs = await D.listRequests(scope, { archived });
        reqs = reqs.filter((r) => (st === 'all' ? true : st === 'open' ? r.status === 'open' || r.status === 'in-progress' : r.status === st));
        if (opt.for) reqs = reqs.filter((r) => r.assignee === opt.for);
        if (reqs.length) groups.push([scope, reqs.reverse()]); // oldest first
      }
      const n = groups.reduce((k, [, reqs]) => k + reqs.length, 0);
      if (!n) { out('Inbox is empty for that filter.'); return; }
      if (opt.full) {
        for (const [scope, reqs] of groups) {
          out(`\n## ${scope === '_studio' ? 'Pixel Yak itself (local/inbox/)' : scope}`);
          for (const r of reqs) printRequest(r, true);
        }
        out(`\n${plural(n, 'request')}.`);
        return;
      }
      for (const [, reqs] of groups) for (const r of reqs) out(requestLine(r));
      const forUser = st === 'open' ? groups.reduce((k, [, reqs]) => k + reqs.filter((r) => r.assignee === 'user').length, 0) : 0;
      out(`\n${plural(n, 'request')}${forUser ? ` (${forUser} waiting on the user)` : ''}. \`show <id>\` for one in full (read it all + its attachments before starting) · \`--full\` prints everything.`);
    },
  },

  show: {
    usage: 'show <requestId>',
    help: 'one request in full (+ attachment paths to look at)',
    async run({ pos }) { printRequest(await findRequest(pos[0]), true); },
  },

  archive: {
    usage: 'archive <game|studio>',
    help: 'move done/wontfix requests (+ attachments) to requests/archive/ —\nstill found by show and --status done',
    async run({ pos }) {
      const scope = scopeOf(pos[0]);
      const moved = await D.archiveRequests(scope);
      const where = scope === '_studio' ? 'local/inbox/archive/' : `games/${scope}/requests/archive/`;
      out(moved.length ? `archived ${plural(moved.length, 'closed request')} to ${where} (still found by show <id> and inbox --status done)` : 'nothing to archive (no done/wontfix requests in the live folder)');
    },
  },

  start: { usage: 'start <requestId> [note]', help: 'mark in progress (the user sees "AI is working")', run: (a) => setStatus(a) },
  done: { usage: 'done <requestId> <what you changed>', help: 'mark done — say which files/assets changed', run: (a) => setStatus(a) },
  reopen: { usage: 'reopen <requestId> [note]', help: 'back to open', run: (a) => setStatus(a) },
  wontfix: { usage: 'wontfix <requestId> <why>', help: 'won\'t or can\'t do it — say why', run: (a) => setStatus(a) },

  'ask-user': {
    usage: 'ask-user <game|studio> "<title>" [--body ..] [--kind review] [--asset id] [--pose p]',
    help: 'ask the user for a review or a decision (shows as "for you")',
    run: (a) => create(a, 'user'),
  },
  request: {
    usage: 'request <game|studio> "<title>" [--body ..] [--kind art] [--tier smart|builder|any] [--asset id]',
    help: 'file follow-up work for the AI',
    run: (a) => create(a, 'ai'),
  },
};

async function setStatus({ cmd, pos }) {
  const r = await findRequest(pos[0]);
  const note = pos.slice(1).join(' ').trim();
  const status = { start: 'in-progress', done: 'done', reopen: 'open', wontfix: 'wontfix' }[cmd];
  if (cmd === 'done' && !note) fail('say what you changed: done <id> "<files/assets changed and why>"');
  if (cmd === 'wontfix' && !note) fail('say why: wontfix <id> "<why>"');
  const patch = { status, note };
  if (cmd === 'done' || cmd === 'wontfix') patch.resolution = note;
  const u = await D.updateRequest(r.scope, r.id, patch, 'ai');
  out(`${u.id} → ${u.status}`);
}

async function create({ cmd, pos, opt }, assignee) {
  const scope = scopeOf(pos[0]);
  const title = pos[1];
  if (!title) fail(`usage: ${cmd} <game> "<title>" [--body ..]`);
  const r = await D.createRequest(scope, {
    title, body: typeof opt.body === 'string' ? opt.body : '',
    kind: opt.kind || (assignee === 'user' ? 'review' : 'other'), tier: opt.tier || 'any', assignee,
    target: opt.asset ? { asset: opt.asset, pose: opt.pose || null, anim: opt.anim || null } : null,
  }, [], 'ai');
  out(`${r.id} created (${r.assignee === 'user' ? 'waiting on the user' : 'for the AI'})`);
}
