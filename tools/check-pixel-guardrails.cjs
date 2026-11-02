#!/usr/bin/env node
/**
 * tools/check-pixel-guardrails.cjs — the pixel-art guardrail linter (a floor, not a judge:
 * "done" still means looked at). Scans every .js/.mjs file under games/<id>/game/,
 * recursively (art, scenes, ui …; skips lib/ vendored code and the generated art/edits/).
 *   node tools/check-pixel-guardrails.cjs [projectId…] [--json]
 * Flags:
 * 1. Canvas 2D vector drawing (arc/ellipse, lineTo/curves/stroke) and smooth gradients — a pixel-art
 *    game is pixel art everywhere, drawn with the engine/art painter or fillRect pixel runs.
 * 2. Math.random() in any art file (art/**, sprites*.js) — the same pose must draw the same pixels,
 *    because the user's edits sit on exact pixel positions (a contract, not taste).
 * 3. A missing games/<id>/assets.js (the studio can't list the art).
 * A line that breaks rule 1 on purpose says why with a "pixel-ok: <why>" comment and is skipped —
 * the rule is a default, and a game may set it aside when it says why.
 * Used by `node cli/yak.mjs check <id>` (lintProject); exits 1 when any ERROR is found.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PROJECTS_DIR = path.join(ROOT, 'games');

const RULES = [
  // receiver = what the method is called on; canvas contexts are instances (ctx, g, this.ctx,
  // getContext('2d')), so a capitalised namespace (SDF.ellipse, Pix.…) is a pixel tool, not canvas
  {
    id: 'NO_VECTOR_ARC', severity: 'ERROR',
    regex: /([\w$\])]*)\s*\.\s*(arc|arcTo|ellipse)\s*\(/g, canvasOnly: true,
    hint: 'Canvas arcs/ellipses are anti-aliased vector shapes. Draw round things with the engine/art painter: Pix.oval / Pix.ball (engine/art/pix.js), or pre-drawn sprites. On purpose? Add a "pixel-ok: <why>" comment on the line.',
  },
  {
    id: 'NO_VECTOR_PATH', severity: 'ERROR',
    regex: /([\w$\])]*)\s*\.\s*(lineTo|quadraticCurveTo|bezierCurveTo|stroke)\s*\(/g, canvasOnly: true,
    hint: 'Canvas paths/strokes are anti-aliased. Use Pix.line / Pix.limb / Pix.poly (engine/art/pix.js) for art, fillRect pixel runs for UI. On purpose? Add a "pixel-ok: <why>" comment on the line.',
  },
  {
    id: 'NO_SMOOTH_GRADIENT', severity: 'ERROR',
    regex: /\.\s*(createLinearGradient|createRadialGradient|createConicGradient)\s*\(/,
    hint: 'Smooth 24-bit gradients break the palette. Use the material ramps (shades 0-4 in Pix calls) or ordered dithering with bayer(x, y) from engine/art/pix.js. On purpose? Add a "pixel-ok: <why>" comment on the line.',
  },
  {
    id: 'NO_MATH_RANDOM_IN_ART', severity: 'ERROR',
    regex: /Math\.random\s*\(\s*\)/,
    artOnly: true,
    hint: 'Art must be deterministic (the user\'s edits sit on exact pixels). Use a seeded hash — hash() from engine/shell/runtime.js, bayer(x, y) from engine/art/pix.js, or the game art kit\'s own hash.',
  },
];

const SKIP_DIRS = new Set(['lib', 'node_modules', 'edits']);
// An art file: anything under game/art/ (any depth) or a sprites*.js file.
const isArtFile = (rel) => rel.startsWith('art/') || /(^|\/)sprites?[\w.-]*\.m?js$/.test(rel);

function walk(dir, rel = '', out = []) {
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    if (e.name.startsWith('.')) continue;
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) walk(path.join(dir, e.name), r, out); }
    else if (/\.m?js$/.test(e.name)) out.push(r);
  }
  return out;
}

// Code without comments, line by line (block comments may span lines; `//` only counts at the
// start or after whitespace/punctuation, so 'http://…' inside a string survives).
function codeLines(text) {
  const out = [];
  let inBlock = false;
  for (const raw of text.split(/\r?\n/)) {
    let line = raw, code = '';
    while (line.length) {
      if (inBlock) {
        const end = line.indexOf('*/');
        if (end < 0) { line = ''; break; }
        line = line.slice(end + 2); inBlock = false;
      } else {
        const start = line.indexOf('/*');
        if (start < 0) { code += line; break; }
        code += line.slice(0, start); line = line.slice(start + 2); inBlock = true;
      }
    }
    out.push(code.replace(/(^|[\s;,(){}])\/\/.*$/, '$1'));
  }
  return out;
}

// → { project, files, findings: [{ rule, severity, file, line, code }], errors, warnings }
function lintProject(projectId) {
  const projDir = path.join(PROJECTS_DIR, projectId);
  const res = { project: projectId, files: 0, findings: [], errors: 0, warnings: 0 };
  const add = (f) => { res.findings.push(f); if (f.severity === 'ERROR') res.errors++; else res.warnings++; };
  if (!fs.existsSync(projDir) || !fs.statSync(projDir).isDirectory()) {
    add({ rule: 'NO_PROJECT', severity: 'ERROR', file: `games/${projectId}`, line: 0, code: 'project folder not found' });
    return res;
  }
  if (!fs.existsSync(path.join(projDir, 'assets.js'))) {
    add({ rule: 'NO_ASSETS_REGISTRY', severity: 'ERROR', file: `games/${projectId}/assets.js`, line: 0, code: 'missing — Pixel Yak cannot list this game\'s art' });
  }
  // the game's code folder: next to game.json's entry (game-relative)
  let gameDir = path.join(projDir, 'game');
  try {
    const entry = JSON.parse(fs.readFileSync(path.join(projDir, 'game.json'), 'utf8')).entry;
    const d = typeof entry === 'string' && path.dirname(path.resolve(projDir, entry));
    if (d && !path.relative(projDir, d).startsWith('..') && fs.existsSync(d)) gameDir = d;
  } catch { /* no game.json: the default folder */ }
  const gameRel = path.relative(ROOT, gameDir).split(path.sep).join('/');
  for (const rel of walk(gameDir)) {
    res.files++;
    const text = fs.readFileSync(path.join(gameDir, rel), 'utf8');
    const rawLines = text.split(/\r?\n/);
    const lines = codeLines(text);
    const art = isArtFile(rel);
    const base = path.basename(rel);
    lines.forEach((code, i) => {
      for (const rule of RULES) {
        if (rule.onlyFiles && !rule.onlyFiles.includes(base)) continue;
        if (rule.artOnly && !art) continue;
        if (rule.canvasOnly && /pixel-ok:/.test(rawLines[i] || '')) continue; // set aside on purpose, with a reason
        if (rule.canvasOnly) {
          rule.regex.lastIndex = 0;
          let m, hit = false;
          while (!hit && (m = rule.regex.exec(code))) hit = !/^[A-Z]/.test(m[1]);
          if (!hit) continue;
        } else if (!rule.regex.test(code)) continue;
        add({ rule: rule.id, severity: rule.severity, file: `${gameRel}/${rel}`, line: i + 1, code: code.trim().slice(0, 140) });
      }
    });
  }
  return res;
}

function printReport(res) {
  console.log(`\n== games/${res.project} — ${res.files} game file${res.files === 1 ? '' : 's'} scanned`);
  for (const f of res.findings) console.log(`  [${f.severity}] ${f.rule}  ${f.file}${f.line ? ':' + f.line : ''}  ${f.code}`);
  const used = [...new Set(res.findings.map((f) => f.rule))].map((id) => RULES.find((r) => r.id === id)).filter(Boolean);
  for (const r of used) console.log(`  fix ${r.id}: ${r.hint}`);
  console.log(`  ${res.project}: ${res.errors} error(s), ${res.warnings} warning(s)`);
}

module.exports = { lintProject, RULES };

if (require.main === module) {
  const args = process.argv.slice(2);
  const json = args.includes('--json');
  const ids = args.filter((a) => !a.startsWith('--'));
  const projectIds = ids.length ? ids : fs.readdirSync(PROJECTS_DIR).filter((f) => fs.existsSync(path.join(PROJECTS_DIR, f, 'game.json')));
  const results = projectIds.map(lintProject);
  if (json) console.log(JSON.stringify(results, null, 2));
  else {
    results.forEach(printReport);
    if (results.length > 1) {
      console.log('\nSummary');
      for (const r of results) {
        const by = {};
        for (const f of r.findings) by[f.rule] = (by[f.rule] || 0) + 1;
        console.log(`  ${r.project.padEnd(18)} ${String(r.errors).padStart(4)} errors ${String(r.warnings).padStart(4)} warnings  ${Object.entries(by).map(([k, n]) => `${k}×${n}`).join(' ')}`);
      }
    }
  }
  process.exit(results.some((r) => r.errors) ? 1 : 0);
}
