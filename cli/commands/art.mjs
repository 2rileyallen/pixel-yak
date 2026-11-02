// cli/commands/art.mjs — the fast paths for art: everything about an asset in one go, carrying the
// user's fix to sibling frames, reading their edits as text, and contact sheets to look at.
import path from 'node:path';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { buildLegend, diffToPatch, refsInEdit, EDITS_FORMAT } from '../../engine/art/edits.js';
import { D, out, fail, rel, ago, findRequest, printRequest, runTool, findSource, gameArg, plural } from '../lib.mjs';

export const section = { title: 'Art (start here — one command instead of exploring; the user\'s pixels are never overwritten)', order: 20 };

export const commands = {
  context: {
    usage: 'context <requestId> | <game> <asset>',
    help: 'everything about an asset: where its generator lives, the user\'s edits as\ntext grids (AI version vs. theirs, cropped to what changed), notes,\nlessons, open requests, and a picture to look at',
    async run({ pos }) {
      let pid, aid, req = null;
      if (pos[0] && pos[0].startsWith('R-')) {
        req = await findRequest(pos[0]);
        if (req.target && (req.target.song || req.target.sfx)) { await (await import('./sound.mjs')).soundContext(req); return; } // about a song or sound effect
        if (!req.target || !req.target.asset) { printRequest(req, true); out('\n(this request has no target asset: read it, then use context <game> <asset> if needed)'); return; }
        pid = req.scope; aid = req.target.asset;
      } else { pid = (await gameArg(pos[0])).id; aid = D.assertId('asset', pos[1] || ''); }
      const p = await D.getProject(pid);
      if (req) { printRequest(req, true); out(''); }
      const res = runTool({ task: 'context', entry: p.assetsPath, edits: p.editsDir, asset: aid, project: pid }, 'context-' + pid + '-' + aid);
      if (res.data.error) fail(res.data.error);
      const d = res.data;
      out('# ' + d.asset.id + ' — ' + d.asset.name + ' (' + pid + ')');
      out(d.asset.fw + 'x' + d.asset.fh + (d.asset.ax != null ? ' · anchor ' + d.asset.ax + ',' + d.asset.ay : '') + ' · ' + d.asset.category + ' · poses: ' + d.poses.join(', '));
      if (d.asset.description) out(d.asset.description);
      out('generator: ' + (findSource(pid, aid) || '(not found — search games/' + pid + '/game for "' + aid + '")') + (d.asset.gen ? ' · made by ' + d.asset.gen.by + ' with ' + d.asset.gen.style + ' v' + d.asset.gen.v : ''));
      out("\nFrames (status vs. the AI's own output):");
      for (const [pose, f] of Object.entries(d.frames)) out('- ' + pose + ': ' + f.status + (f.changed ? ' · ' + f.changed + ' px differ from the AI' : '') + (f.via ? ' · carried over (' + f.via + ')' : '') + (f.drift ? " · DRIFT: generator changed under the user's patch" : ''));
      if (d.notes.length) out("\nUser's notes: " + d.notes.map((n) => '[' + n.pose + '] ' + n.text).join(' | '));
      if (d.grids) {
        out('\nPixels, cropped to x ' + d.region[0] + '–' + d.region[2] + ', y ' + d.region[1] + '–' + d.region[3] + " (one text row = one pixel row; '.' = transparent):");
        out('legend: ' + Object.entries(d.legend).map(([k, v]) => k + '=' + (Array.isArray(v) ? v.join(' ') : v)).join('  '));
        for (const [pose, g] of Object.entries(d.grids)) {
          if (g.final) { out('\n' + pose + ' — USER (what the game shows):'); g.final.forEach((row, i) => out('  ' + String(d.region[1] + i).padStart(3) + ' ' + row)); }
          if (g.raw) { out(pose + ' — AI generator' + (g.final ? '' : ' (not edited)') + ':'); g.raw.forEach((row, i) => out('  ' + String(d.region[1] + i).padStart(3) + ' ' + row)); }
        }
      }
      if (p.style) {
        const ls = (await D.readLessons(p.style, { limit: 1000, project: pid })).filter((l) => l.asset === aid).slice(0, 5);
        if (ls.length) out('\nLessons (newest first): ' + ls.map((l) => l.pose + ' ' + l.kind + (l.note ? ' "' + l.note + '"' : '') + ' → games/' + pid + '/design/lessons/' + l.card).join(' | '));
      }
      const open = (await D.listRequests(pid)).filter((x) => x.target && x.target.asset === aid && D.isLiveRequest(x) && (!req || x.id !== req.id));
      if (open.length) out('Other open requests on it: ' + open.map((x) => x.id + ' "' + x.title + '"').join(' | '));
      out('\npicture: ' + rel(res.png) + " (open it) — per frame: what the game shows, and below it the AI's own output");
      out('If the user fixed one frame and wants the others to match: node cli/yak.mjs propagate ' + pid + ' ' + aid + ' <thatPose>');
    },
  },

  propagate: {
    usage: 'propagate <game> <asset> <fromPose> [--to p1,p2] [--apply] [--force]',
    help: 'carry the user\'s fix on one frame to the other frames (the studio\'s "Do the\nsame to other frames"); prints a picture + what it would do; --apply writes\nit (skips frames the user already edited unless --force)',
    async run({ pos, opt }) {
      const p = await gameArg(pos[0]);
      const pid = p.id;
      const aid = D.assertId('asset', pos[1] || '');
      const from = D.assertId('asset', pos[2] || '');
      const params = { task: 'propagate', entry: p.assetsPath, edits: p.editsDir, asset: aid, from };
      if (typeof opt.to === 'string') params.to = opt.to;
      const res = runTool(params, 'propagate-' + pid + '-' + aid + '-' + from);
      if (res.data.error) fail(res.data.error);
      const d = res.data;
      out('# Carry ' + from + "'s fix (" + d.changedInSource + ' px) to the other frames of ' + aid);
      if (!d.changedInSource) { out(from + ' has no changes from the AI version — nothing to carry over.'); return; }
      for (const t of d.targets) out('- ' + t.pose + ': ' + t.status.toUpperCase() + ' — ' + t.says + (t.userEdited ? ' · the user already edited this frame' : ''));
      out('picture: ' + rel(res.png) + ' (open it: the source AI → user, then each frame now → after)');
      if (!opt.apply) { out('\nApply with --apply (frames marked EXACT / ADAPTED; PARTIAL only with --force).'); return; }
      const ed = (await D.readEdit(pid, aid)) || { format: EDITS_FORMAT, project: pid, asset: aid, legend: {}, poses: {}, anims: {}, notes: [] };
      const applied = [], skipped = [];
      const decode = (enc) => { const arr = []; for (const row of enc.rows) for (const ch of row) arr.push(ch === '.' ? null : enc.legend[ch]); return arr; };
      for (const t of d.targets) {
        const ok = t.status === 'exact' || t.status === 'adapted' || (opt.force && t.status === 'partial');
        if (!ok || !t.applied) { skipped.push(t.pose + ' (' + t.status + ')'); continue; }
        if (ed.poses[t.pose] && !opt.force) { skipped.push(t.pose + ' (the user already edited it — --force to overwrite)'); continue; }
        if (!t.hasRaw) { skipped.push(t.pose + ' (studio-added frame — edit it in the studio)'); continue; }
        const rawRefs = decode(t.raw), result = decode(t.result);
        const keep = Object.fromEntries(Object.entries(ed.poses).filter(([k]) => k !== t.pose));
        const used = new Map(refsInEdit({ legend: ed.legend, poses: keep }).map((x) => [JSON.stringify(x), x]));
        result.forEach((x, i) => { if (x && JSON.stringify(x) !== JSON.stringify(rawRefs[i])) used.set(JSON.stringify(x), x); });
        const { legend, keyOf } = buildLegend([...used.values()], ed.legend || {});
        ed.legend = legend;
        const patch = diffToPatch(rawRefs, result, d.w, d.h, keyOf);
        if (!patch) { skipped.push(t.pose + ' (already matches)'); continue; }
        ed.poses[t.pose] = { mode: 'patch', base: t.rawHash, at: patch.at, rows: patch.rows, changed: patch.changed, via: 'ai-propagate:' + from, updated: new Date().toISOString() };
        applied.push(t.pose);
      }
      if (applied.length) await D.writeEdit(pid, aid, ed);
      out(applied.length ? '\nApplied to ' + applied.join(', ') + ' — saved in ' + p.editsDir + '/' + aid + '.json (marked "carried over by the AI"); the studio and a running game update live.' : '\nNothing applied.');
      if (skipped.length) out('Skipped: ' + skipped.join('; '));
    },
  },

  edits: {
    usage: 'edits <game> [assetId]',
    help: 'which assets/frames the user edited; with an id, the rows',
    async run({ pos }) {
      const p = await gameArg(pos[0]);
      const all = await D.readAllEdits(p.id);
      if (pos[1]) {
        const ed = all[pos[1]];
        if (!ed) fail(`no edits for ${pos[1]} in ${p.editsDir}`);
        out(`# ${p.id}/${pos[1]} — ${p.editsDir}/${pos[1]}.json`);
        out(`legend: ${Object.entries(ed.legend || {}).map(([k, v]) => `${k}=${Array.isArray(v) ? v.join(' ') : v}`).join('  ')}`);
        out(`patch rows: '.' = generator pixel kept, '-' = erased. baked rows: '.' = transparent.`);
        for (const [pose, pe] of Object.entries(ed.poses || {})) {
          out(`\n## ${pose} — ${pe.mode}${pe.after ? ` (frame added after ${pe.after}, copied from ${pe.from})` : ''} · ${pe.changed ?? '?'} px · ${pe.updated ? ago(pe.updated) : ''}`);
          if (pe.mode === 'patch') out(`at x=${pe.at[0]}, y=${pe.at[1]}`);
          for (const row of pe.rows) out(`  ${row}`);
        }
        if (Object.keys(ed.anims || {}).length) out(`\nanim overrides: ${JSON.stringify(ed.anims)}`);
        if ((ed.notes || []).length) out(`notes: ${ed.notes.map((n) => `[${n.pose}] ${n.text}`).join(' | ')}`);
        return;
      }
      const ids = Object.keys(all);
      if (!ids.length) { out(`No studio edits in ${p.editsDir}.`); return; }
      out(`# User edits in ${p.id} (${p.editsDir})`);
      for (const id of ids.sort()) {
        const ed = all[id];
        const poses = Object.entries(ed.poses || {}).map(([k, pe]) => `${k}:${pe.mode}${pe.changed != null ? `(${pe.changed}px)` : ''}${pe.after ? '+added' : ''}`);
        out(`- ${id}: ${poses.join(', ') || '(timing only)'}${Object.keys(ed.anims || {}).length ? ` · anims ${Object.keys(ed.anims).join(',')}` : ''}`);
      }
      out('\nNever regenerate these frames over the user\'s pixels: patches sit on top of the generator, baked frames bypass it.');
    },
  },

  'edits-index': {
    usage: 'edits-index <game>',
    help: 'rebuild <edits>/index.js after hand-editing edit JSON',
    async run({ pos }) {
      const n = await D.rebuildEditsIndex((await gameArg(pos[0])).id);
      out(`rebuilt edits index (${plural(n, 'asset')})`);
    },
  },

  sheet: {
    usage: 'sheet <game> [idPrefix,…] [--raw] [--edited] [--z 4] [--out file.png] [--page-h 4000]',
    help: 'a contact sheet to look at, in pages of ≤ 4000 px (sheet-1.png …;\n--raw adds the AI version under every edited frame)',
    async run({ pos, opt }) {
      const p = await gameArg(pos[0]);
      const pid = p.id;
      const outFile = path.resolve(typeof opt.out === 'string' ? opt.out : path.join(D.ROOT, 'scratch', 'sheets', `${pid}${pos[1] ? '-' + pos[1].replace(/[^A-Za-z0-9_,.-]/g, '_') : ''}`, 'sheet.png'));
      const base = outFile.replace(/\.png$/i, '');
      fs.mkdirSync(path.dirname(outFile), { recursive: true });
      const stale = new RegExp(`^${path.basename(base).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-\\d+\\.png$`);
      for (const f of fs.readdirSync(path.dirname(outFile))) if (stale.test(f)) fs.rmSync(path.join(path.dirname(outFile), f), { force: true });
      const pageH = Math.max(400, Math.min(16000, Number(opt['page-h']) || 4000));
      const q = new URLSearchParams({ entry: p.assetsPath, project: pid, z: String(opt.z || 3) });
      if (pos[1]) q.set('only', pos[1]);
      if (opt.raw) q.set('raw', '1');
      if (opt.edited) q.set('edited', '1');
      q.set('edits', p.editsDir);
      const electron = createRequire(import.meta.url)('electron');
      const r = spawnSync(electron, [path.join(D.ROOT, 'tools', 'capture.cjs'), `studio/ui/sheet.html?${q}`, `${base}.png`, '1400', '900', '4000', `--pages=${pageH}`], { encoding: 'utf8' });
      const m = /PAGEFILES (\d+)/.exec(r.stdout || '');
      if (r.status !== 0 || !m) fail(`capture failed${r.stderr ? ': ' + r.stderr.trim().slice(-500) : ''} — see ${rel(base + '.console.txt')}`);
      const n = Number(m[1]);
      const files = Array.from({ length: n }, (_, i) => rel(`${base}-${i + 1}.png`));
      out(`sheet: ${plural(n, 'page')} (≤ ${pageH} px tall each; look at them): ${n <= 3 ? files.join(', ') : `${files[0]} … ${files[n - 1]}`}`);
      out(`console: ${rel(base + '.console.txt')}${n > 3 ? ` · narrow it with an id prefix: sheet ${pid} <prefix>[,prefix2]` : ''}`);
    },
  },
};
