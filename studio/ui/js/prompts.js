// studio/ui/js/prompts.js — short, paste-ready prompts for an AI chat (any harness). They point at
// repo files and the studio CLI so the model finds everything itself. Kept in the user's voice.

const TIER = { smart: 'Use a smart model for this.', builder: 'A cheaper builder model can do this.', any: '' };

export function inboxPrompt(project, open) {
  return `Pixel Yak has ${open} open request${open === 1 ? '' : 's'} for ${project.name} (${project.id}). ` +
    `Run \`node cli/yak.mjs inbox ${project.id}\` and work through them (\`context <id>\` gives everything for one) — follow .agents/skills/requests/SKILL.md, ` +
    `and mark each one done with what you changed.`;
}

export function requestPrompt(req, project) {
  const where = req.scope === '_studio' ? 'the studio itself' : `${project ? project.name : req.scope} (${req.scope})`;
  return `Handle Pixel Yak request ${req.id} for ${where}: run \`node cli/yak.mjs context ${req.id}\` (everything you need in one go), do it, ` +
    `then \`node cli/yak.mjs done ${req.id} "<what you changed>"\`. Follow .agents/skills/requests/SKILL.md. ${TIER[req.tier] || ''}`.trim();
}

export function distillPrompt(style, count) {
  return `I made ${count} new art edit${count === 1 ? '' : 's'} in the ${style.name} style (${style.id}). Learn from them: follow ` +
    `.agents/skills/art-learn/SKILL.md — start with \`node cli/yak.mjs lessons ${style.id} --new\`, look at the lesson cards, ` +
    `then update styles/${style.id}/STYLE.md and the generators. Use a smart model for this.`;
}

export function kickoffPrompt(project, req) {
  return `I just started a new game in Pixel Yak: ${project.name} (${project.id}). Kick it off: follow .agents/skills/new-game/SKILL.md ` +
    `and request ${req.id} (\`node cli/yak.mjs show ${req.id}\`). Talk the pitch through with me before writing code. Use a smart model for this.`;
}

export function fixLoadPrompt(project, error) {
  return `Pixel Yak can't load the art for ${project.name} (${project.id}) — ${project.assetsPath} fails with:\n\n${String(error).slice(0, 1200)}\n\n` +
    `Fix it (read projects/${project.id}/INTENT.md first) and check with \`node cli/yak.mjs check ${project.id}\`.`;
}

export function noArtPrompt(project) {
  return `${project.name} (${project.id}) has no art registered for Pixel Yak yet. Wire its art into the contract ` +
    `(core/art/registry.js → game/sprites.js → assets.js) so every asset shows up in the studio — follow ` +
    `.agents/skills/pixel-art-guardrails/SKILL.md.`;
}
