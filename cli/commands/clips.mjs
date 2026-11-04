// cli/commands/clips.mjs — promo clips (docs/contracts/CLIPS.md, skill promo): list a game's clips,
// render or probe one with the recorder (tools/clip.cjs), start a new recipe from the starter.
import { spawn } from 'node:child_process';
import { D, out, fail, gameArg, ago, plural, electronPath } from '../lib.mjs';

export const section = { title: 'Clips (promo videos)', order: 60 };

const mb = (n) => (n < 1048576 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1048576).toFixed(1)} MB`);
const span = (s) => `${s.from}–${s.to} s`;

export const commands = {
  clips: {
    usage: 'clips <game>',
    help: 'the game\'s clips: recipe, words, music, last render and probe',
    async run({ pos }) {
      const p = await gameArg(pos[0]);
      const list = await D.listClips(p.id);
      if (!list.length) { out(`No clips yet in games/${p.id}/clips/. Start one: node cli/yak.mjs clip-new ${p.id} <name>`); return; }
      for (const c of list) {
        const k = c.clip;
        out(`- ${c.name} — ${k.aspect} · ${k.length} s · ${k.fps} fps · music ${k.music ? k.music.song : 'none'}${c.valid ? '' : ' · RECIPE IS NOT VALID JSON'}`);
        out(`  recipe ${c.file}${k.setup ? ` · setup ${k.setup}` : ''}${k.shot ? ` · shot ${k.shot}` : ''}`);
        if (k.titleCard) out(`  title card ${span(k.titleCard)}: "${k.titleCard.text}"${k.titleCard.sub ? ` / "${k.titleCard.sub}"` : ''}`);
        for (const cap of k.captions) out(`  caption ${span(cap)} (${cap.pos}): "${cap.text}"`);
        if (k.endCard) out(`  end card ${span(k.endCard)}: "${k.endCard.text}"${k.endCard.sub ? ` / "${k.endCard.sub}"` : ''}`);
        out(c.render ? `  rendered ${ago(c.render.at)}: ${c.render.mp4} (${mb(c.render.bytes)}${c.render.info && c.render.info.game ? `, game commit ${c.render.info.game.commit}` : ''})` : '  not rendered yet');
        if (c.probe) out(`  probe stills (${c.probe.stills.length}): ${c.probe.stills[0].replace(/[^/]+$/, '')}`);
      }
    },
  },

  clip: {
    usage: 'clip <game> <name> [--probe] [--ref <rev>] [--music-file <wav>]',
    help: 'film a clip from its recipe (a committed copy, offscreen) into clips/out/<name>.mp4;\n--probe takes a few stills instead (look at them before rendering); --ref films\nanother commit or branch; needs ffmpeg (PATH or the FFMPEG environment variable)',
    async run({ pos, opt }) {
      const p = await gameArg(pos[0]);
      const name = pos[1];
      if (!D.isClipName(name || '')) fail('usage: clip <game> <name> [--probe] — `clips <game>` lists them');
      await D.readClip(p.id, name).catch((err) => fail(err.message));
      const electron = electronPath();
      const args = D.recorderArgs(p.id, name, { probe: !!opt.probe, ref: typeof opt.ref === 'string' ? opt.ref : null, musicFile: typeof opt['music-file'] === 'string' ? opt['music-file'] : null });
      const child = spawn(electron, args, { stdio: ['ignore', 'pipe', 'pipe'] });
      let done = null, error = null, lastPct = -1, buf = '', errText = '';
      child.stderr.on('data', (d) => { errText += d; });
      child.stdout.on('data', (d) => {
        buf += d;
        let i;
        while ((i = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, i); buf = buf.slice(i + 1);
          const m = D.parseClipLine(line);
          if (!m) continue;
          if (m.error) error = m;
          else if (m.done) done = m;
          else if (m.note) out(`  note: ${m.note}`);
          else if (m.text) out(`${m.text}…`);
          else if (m.stage === 'film' && m.of) {
            const pct = Math.floor((m.frame / m.of) * 4) * 25;
            if (pct > lastPct && pct < 100) { lastPct = pct; out(`  ${pct}% (${m.frame}/${m.of})`); }
          }
        }
      });
      const code = await new Promise((r) => child.on('close', r));
      if (error || code !== 0 || !done) {
        if (error && error.console && error.console.length) out(`page console:\n  ${error.console.join('\n  ')}`);
        fail(error ? error.error : (errText.trim() || `the recorder exited ${code}`));
      }
      if (done.probe) {
        out(`${plural(done.stills.length, 'still')} in ${done.dir}/ — look at them before rendering:`);
        for (const s of done.stills) out(`  ${s}`);
        if (done.consoleErrors) out(`  the page logged ${plural(done.consoleErrors, 'error')}: ${done.dir}/console.txt`);
        return;
      }
      const pr = done.media || {};
      out(`${done.out} — ${pr.width || done.frame[0]}x${pr.height || done.frame[1]}, ${pr.duration ?? done.seconds} s, ${pr.fps ?? done.fps} fps, ${mb(done.bytes)}, ${pr.audio ? `music ${done.music.song}` : 'no music'}`);
      out(`  filmed games/${p.id} at commit ${done.game.commit} "${done.game.subject}"${done.copiedTo ? ` · copied to ${done.copiedTo}` : ''}`);
      if (done.consoleErrors) out(`  the page logged ${plural(done.consoleErrors, 'error')} while filming`);
      out('Look at it: pull a few stills from the MP4 (skill promo) before you hand it over.');
    },
  },

  'clip-new': {
    usage: 'clip-new <game> <name> [--aspect 9:16|16:9|1:1] [--length 15]',
    help: 'a starter recipe (title card, one caption, end card) + an empty shot script\nin games/<game>/clips/ — then edit them, probe, render',
    async run({ pos, opt }) {
      const p = await gameArg(pos[0]);
      const name = pos[1];
      if (!D.isClipName(name || '')) fail('usage: clip-new <game> <name> (lowercase letters, digits and dashes) [--aspect 9:16] [--length 15]');
      if (opt.aspect && !D.CLIP_ASPECTS[opt.aspect]) fail(`--aspect is one of ${Object.keys(D.CLIP_ASPECTS).join(', ')}`);
      const r = await D.createClip(p.id, name, { aspect: opt.aspect || '9:16', length: Number(opt.length) || 15 });
      out(`created ${r.file} and ${r.shot} (${r.clip.aspect}, ${r.clip.length} s).`);
      out(`Next: set the words and the shot, then node cli/yak.mjs clip ${p.id} ${name} --probe and look at the stills.`);
    },
  },
};
