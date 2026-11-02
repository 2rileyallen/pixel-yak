// studio/ui/js/prompts.js — short, paste-ready prompts for an AI chat (any harness). They point at
// repo files and the CLI (node cli/yak.mjs) so the model finds everything itself. Kept in the user's
// voice. Requests follow "brief me first" (skill requests): the AI briefs, the user says go, then it works.

const TIER = { smart: 'Use a smart model for this.', builder: 'A cheaper builder model can do this.', any: '' };
const SKILL = '.agents/skills/requests/SKILL.md';
const s = (n) => (n === 1 ? '' : 's');

// Every open request of a game: brief me on each, save the briefs, then wait.
export function inboxPrompt(project, open) {
  return `Pixel Yak has ${open} open request${s(open)} for ${project.name}. Run \`node cli/yak.mjs inbox ${project.id}\`, read each in full, ` +
    `and **brief me before changing anything** — per request: what you think I'm asking, what you'd change, what you're unsure of, ` +
    `its size (S/M/L) — and save each brief with \`plan\`. Then wait for my notes. Follow ${SKILL}.`;
}

// The ones I said go to (in the Inbox, or "just do it" when filing).
export function approvedPrompt(project, n) {
  return `Work the ${project.name} request${s(n)} I approved in Pixel Yak (\`node cli/yak.mjs inbox ${project.id} --approved\`). Follow ${SKILL}.`;
}

// One request: a brief first — unless I already said go (approved, or filed with "just do it").
export function requestPrompt(req, project) {
  const ready = req.status === 'approved' || req.status === 'in-progress';
  const where = req.scope === '_studio' ? 'Pixel Yak itself' : (project ? project.name : req.scope);
  const text = ready
    ? `Work Pixel Yak request ${req.id} for ${where} — I approved it. Run \`node cli/yak.mjs context ${req.id}\` (everything in one go), ` +
      `\`start\` it, do it, look at the result, then \`node cli/yak.mjs done ${req.id} "<what you changed>"\`. Follow ${SKILL}.`
    : `Read request ${req.id} (\`node cli/yak.mjs context ${req.id}\`), brief me in a few lines on what you'd change, save it with \`plan\`, and wait for my go.`;
  return `${text} ${TIER[req.tier] || ''}`.trim();
}

export function distillPrompt(style, count) {
  return `I made ${count} new art edit${s(count)} in ${style.name.replace(/ look$/, '')} (${style.id}). Learn from them: follow ` +
    `.agents/skills/art-learn/SKILL.md — start with \`node cli/yak.mjs lessons ${style.id} --new\`, look at the lesson cards, ` +
    `then update games/${style.id}/design/art.md and the generators. Use a smart model for this.`;
}

export function kickoffPrompt(project, req) {
  return `I just started a new game in Pixel Yak: ${project.name} (${project.id}). Kick it off: follow .agents/skills/new-game/SKILL.md ` +
    `and request ${req.id} (\`node cli/yak.mjs show ${req.id}\`). Talk the pitch through with me before writing code. Use a smart model for this.`;
}

export function fixLoadPrompt(project, error) {
  return `Pixel Yak can't load the art for ${project.name} (${project.id}) — ${project.assetsPath} fails with:\n\n${String(error).slice(0, 1200)}\n\n` +
    `Fix it (read games/${project.id}/AGENTS.md first) and check with \`node cli/yak.mjs check ${project.id}\`.`;
}

export function noArtPrompt(project) {
  return `${project.name} (${project.id}) has no art registered for Pixel Yak yet. Wire its art into the contract ` +
    `(engine/art/registry.js → game/sprites.js → assets.js) so every asset shows up in the studio — follow ` +
    `.agents/skills/art/SKILL.md.`;
}
