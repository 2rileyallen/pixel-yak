// studio/data/moments.mjs — files an F9 moment leaves next to its request (docs/contracts/MOMENTS.md):
//   games/<id>/requests/<R-id>-save.json   the game's state and save-state at that moment
// The file is listed with the request's attachments, so archiving or deleting the request takes
// it along (studio/data/requests.mjs moves and removes every attachment).
import { assertId, relRepo, readJson, writeJsonMarked, writeTextMarked } from './core.mjs';
import { getRequest, attachmentPath } from './requests.mjs';

export const MOMENT_FORMAT = 'pixel-yak-moment@1';
const MAX_BYTES = 20_000_000;

// Write obj as <R-id>-<name>.json beside request <requestId> and list it as an attachment.
// Returns the file's repo-relative path.
export async function attachJson(scope, requestId, name, obj) {
  assertId('request', requestId);
  if (!/^[a-z0-9][a-z0-9-]{0,23}$/.test(String(name))) throw new Error(`invalid attachment name: ${JSON.stringify(name)}`);
  const r = await getRequest(scope, requestId);
  if (!r) throw new Error(`request ${requestId} not found`);
  const fileName = `${requestId}-${name}.json`;
  const file = attachmentPath(scope, fileName, !!r.archived);
  const textOut = JSON.stringify(obj, null, 1);
  if (textOut === undefined) throw new Error('nothing to attach');
  if (textOut.length > MAX_BYTES) throw new Error(`the ${name} file would be ${Math.round(textOut.length / 1e6)} MB — over the ${MAX_BYTES / 1e6} MB limit`);
  await writeTextMarked(file, textOut + '\n');
  const reqFile = attachmentPath(scope, `${requestId}.json`, !!r.archived);
  const raw = await readJson(reqFile);
  if (raw && !(raw.attachments || []).includes(fileName)) {
    raw.attachments = [...(raw.attachments || []), fileName];
    await writeJsonMarked(reqFile, raw);
  }
  return relRepo(file);
}

// The moment file: what an AI loads to reproduce the moment (?moment=../requests/<R-id>-save.json).
export function momentFile({ game, request, at, state, save, tuning, console: lines }) {
  return { format: MOMENT_FORMAT, game, request, at, state: state ?? null, save: save ?? null, tuning: tuning || [], console: lines || [] };
}
