#!/usr/bin/env node
// One exclusive hold on the Windows candidate draft (docs/superpowers/plans/
// 2026-11-21-windows-nightly.md, Task 3). A night, a release and a hand upload
// each take it before writing to the draft, so none replaces another's
// candidate. The hold is the asset draft-hold.json: GitHub refuses an upload
// whose name exists (without --clobber), which makes taking it exclusive, and
// it is deleted by its own asset URL only while it still names its owner.
//
//   node chromium/windows/draft-hold.mjs status
//   node chromium/windows/draft-hold.mjs acquire-manual "<note>"   (prints the owner token)
//   BLANC_DRAFT_HOLD_OWNER=<token> node chromium/windows/draft-hold.mjs upload FILE NAME
//   node chromium/windows/draft-hold.mjs release <token>
//   node chromium/windows/draft-hold.mjs break --confirm [--work DIR] [--records ~/DIR]
//
// Every command takes --draft TAG (the rehearsal's draft; default
// $BLANC_CANDIDATE_DRAFT or fork-windows-candidate). break's --records names
// the Mac Studio's night records whose lock it checks (default production).
//
// Failures print fixed messages; the owner token is printed only by
// acquire-manual, to the person who asked for it.
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

export const REPO = 'bnfy/blanc';
export const HOLD_ASSET = 'draft-hold.json';
// The only names uploaded under a hold: the two candidate zips and the rerun list.
export const UPLOAD_NAMES = Object.freeze(['blanc-windows-candidate.zip', 'blanc-windows-prototype.zip', 'nightly-rerun.json']);
export const draftTag = () => process.env.BLANC_CANDIDATE_DRAFT || 'fork-windows-candidate';
export const DRAFTS = Object.freeze(['fork-windows-candidate', 'fork-windows-candidate-rehearsal']);
export const STUDIO_RECORDS = '~/Projects/Blanc/records/nightly/windows';
const studioRecords = records => {
  if (!/^~\/[\w./-]+$/.test(records) || records.split('/').includes('..')) throw new Error('The night records must be a plain path under ~/ on the Mac Studio.');
  return records;
};
const STUDIO_SSH = ['-i', path.join(os.homedir(), '.ssh/id_ed25519_macmini'), '-o', 'IdentitiesOnly=yes', '-o', 'BatchMode=yes',
  '-o', 'ConnectTimeout=15', 'anthonyjloria@Mac-Studio.local'];

function gh(io, args, message) {
  const result = io.exec('gh', args);
  if (result.status !== 0) throw new Error(message);
  return result.stdout;
}
function tempFile(name, contents) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-draft-hold-'));
  const file = path.join(dir, name);
  if (contents !== undefined) fs.writeFileSync(file, contents, {mode: 0o600});
  return {dir, file};
}

export function assertDraft(io, draft = draftTag()) {
  const isDraft = gh(io, ['release', 'view', draft, '--repo', REPO, '--json', 'isDraft', '--jq', '.isDraft'], 'GitHub did not show the candidate draft').trim();
  if (isDraft !== 'true') throw new Error('The candidate release is not an unpublished draft; nothing is written to it.');
}

// The hold and the API URL of the asset it was read from, or null when a
// successful listing shows no hold. An asset that can't be read is an error,
// never a free draft.
export function readHold(io, draft = draftTag()) {
  const view = JSON.parse(gh(io, ['release', 'view', draft, '--repo', REPO, '--json', 'assets'], 'GitHub did not list the draft\'s assets') || '{}');
  const asset = (view.assets ?? []).find(a => a.name === HOLD_ASSET);
  if (!asset) return null;
  const body = io.exec('gh', ['api', '-H', 'Accept: application/octet-stream', asset.apiUrl]);
  if (body.status !== 0) throw new Error('The draft\'s hold is not readable.');
  try { return {body: JSON.parse(body.stdout), apiUrl: asset.apiUrl}; } catch { throw new Error('The draft\'s hold is not readable.'); }
}

// |owner| may be chosen (and saved) by the caller first, so a take whose
// readback is lost can still be undone by that owner.
export function newOwner() { return crypto.randomBytes(16).toString('hex'); }
export function acquireHold(io, kind, note, draft = draftTag(), owner = newOwner()) {
  if (!['nightly', 'release', 'manual'].includes(kind)) throw new Error('Unknown hold kind.');
  if (!/^[0-9a-f]{32}$/.test(owner)) throw new Error('A hold owner is 32 hex digits.');
  assertDraft(io, draft);
  const {dir, file} = tempFile(HOLD_ASSET, JSON.stringify({kind, owner, startedAt: new Date().toISOString(), note}) + '\n');
  try {
    // GitHub refuses an existing name, so only one upload can succeed. The
    // readback decides: a lost response still holds if the hold is ours.
    io.exec('gh', ['release', 'upload', draft, file, '--repo', REPO]);
    const hold = readHold(io, draft);
    if (hold?.body?.owner !== owner) throw new Error('The candidate draft is held by another owner; not taken.');
    return {owner, apiUrl: hold.apiUrl};
  } finally {
    fs.rmSync(dir, {recursive: true, force: true});
  }
}

export function uploadUnderHold(io, owner, file, name, draft = draftTag()) {
  if (!UPLOAD_NAMES.includes(name)) throw new Error('That is not a name the candidate draft takes under a hold.');
  const {dir, file: named} = tempFile(name);
  try {
    (io.copyFile ?? fs.copyFileSync)(file, named);
    // Staged first; the draft and the hold are checked just before writing.
    assertDraft(io, draft);
    const hold = readHold(io, draft);
    if (!owner || hold?.body?.owner !== owner) throw new Error('The candidate draft is held by another owner, or not held; nothing uploaded.');
    gh(io, ['release', 'upload', draft, named, '--repo', REPO, '--clobber'], 'Could not upload to the candidate draft.');
  } finally {
    fs.rmSync(dir, {recursive: true, force: true});
  }
}

// Deletes one of the night's own assets (the rerun list) while the hold is
// still its owner's, by that asset's URL, and checks it is gone.
export function deleteUnderHold(io, owner, name, draft = draftTag()) {
  if (!UPLOAD_NAMES.includes(name)) throw new Error('That is not a name the candidate draft takes under a hold.');
  assertDraft(io, draft);
  const hold = readHold(io, draft);
  if (!owner || hold?.body?.owner !== owner) throw new Error('The candidate draft is held by another owner, or not held; nothing deleted.');
  const list = () => JSON.parse(gh(io, ['release', 'view', draft, '--repo', REPO, '--json', 'assets'], 'GitHub did not list the draft\'s assets') || '{}').assets ?? [];
  const asset = list().find(a => a.name === name);
  if (!asset) return;
  if (io.exec('gh', ['api', '-X', 'DELETE', asset.apiUrl]).status !== 0 || list().some(a => a.name === name)) throw new Error('Could not delete the asset; try again.');
}

// Deletes the hold only if it still names |owner|, by the URL of the asset
// that was read; a successor's hold has another URL and survives.
export function releaseHold(io, owner, draft = draftTag()) {
  assertDraft(io, draft);
  const hold = readHold(io, draft);
  if (!hold || !owner || hold.body.owner !== owner) return false;
  if (io.exec('gh', ['api', '-X', 'DELETE', hold.apiUrl]).status !== 0) throw new Error('Could not remove the hold; try again.');
  return true;
}

// For a person: removes a hold whose holder is gone. A nightly hold only when
// its night is not running; a release hold only with that release's work
// folder, which is marked abandoned first (windows-release.mjs refuses it).
export function breakHold(io, {nightAlive, work = null, markAbandoned = null, clearNightLock = null}, draft = draftTag()) {
  assertDraft(io, draft);
  const hold = readHold(io, draft);
  if (!hold) {
    // A launcher that died before taking the hold still leaves its lock: clear it once it is positively dead.
    if (clearNightLock && !nightAlive()) clearNightLock();
    return null;
  }
  if (hold.body.kind === 'nightly' && nightAlive()) throw new Error('The night is still running on the Mac Studio; its hold stays.');
  if (hold.body.kind === 'nightly' && clearNightLock) clearNightLock();
  if (hold.body.kind === 'release') {
    if (!work || !markAbandoned) throw new Error('A release hold needs that release\'s work folder (--work DIR), which is marked abandoned first.');
    markAbandoned(work, hold.body);
  }
  if (io.exec('gh', ['api', '-X', 'DELETE', hold.apiUrl]).status !== 0) throw new Error('Could not remove the hold.');
  return hold.body;
}

// Whether the Mac Studio's night lock names a live process. Only a positive
// "absent" or "dead" from the Studio counts as gone; an SSH failure, an empty
// or unreadable owner, or anything else counts as alive.
export function studioNightAlive(io, records = STUDIO_RECORDS) {
  const probe = `d=${studioRecords(records)}/RUNNING; ` + 'if [ ! -e "$d" ]; then echo absent; exit 0; fi; ' +
    'p=$(/usr/bin/sed -n \'s/.*"pid":[[:space:]]*\\([0-9][0-9]*\\).*/\\1/p\' "$d/owner" 2>/dev/null); ' +
    'if [ -z "$p" ]; then echo unknown; elif kill -0 "$p" 2>/dev/null; then echo alive; else echo dead; fi';
  const answer = io.exec('ssh', [...STUDIO_SSH, probe]);
  if (answer.status !== 0) return true;
  const word = answer.stdout.trim();
  return !(word === 'absent' || word === 'dead');
}

// Removes the Mac Studio's night lock, only when it names a dead process.
export function clearStudioNightLock(io, records = STUDIO_RECORDS) {
  const remove = `d=${studioRecords(records)}/RUNNING; ` + '[ -e "$d" ] || exit 0; ' +
    'p=$(/usr/bin/sed -n \'s/.*"pid":[[:space:]]*\\([0-9][0-9]*\\).*/\\1/p\' "$d/owner" 2>/dev/null); ' +
    '[ -n "$p" ] && ! kill -0 "$p" 2>/dev/null && rm -rf "$d"';
  if (io.exec('ssh', [...STUDIO_SSH, remove]).status !== 0) throw new Error('Could not clear the dead night\'s lock on the Mac Studio.');
}

export function realIO() {
  return {
    exec(command, args) {
      const result = spawnSync(command, args, {encoding: 'utf8', maxBuffer: 16 * 1024 * 1024});
      return {status: result.error ? -1 : result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? ''};
    },
  };
}

async function main() {
  const argv = process.argv.slice(2);
  const option = name => { const at = argv.indexOf(name); if (at < 0) return null; const value = argv[at + 1]; argv.splice(at, 2); return value; };
  const draft = option('--draft') ?? draftTag();
  if (!DRAFTS.includes(draft)) throw new Error(`--draft must be one of ${DRAFTS.join(', ')}.`);
  const records = option('--records') ?? STUDIO_RECORDS;
  const work = option('--work');
  const [command, ...rest] = argv;
  const io = realIO();
  if (command === 'status' && rest.length === 0) {
    const hold = readHold(io, draft);
    console.log(hold ? JSON.stringify({kind: hold.body.kind, startedAt: hold.body.startedAt, note: hold.body.note}) : 'not held');
  } else if (command === 'acquire-manual' && rest.length === 1) {
    const note = rest[0];
    console.log(acquireHold(io, 'manual', note, draft).owner);
  } else if (command === 'upload' && rest.length === 2) {
    uploadUnderHold(io, process.env.BLANC_DRAFT_HOLD_OWNER, rest[0], rest[1], draft);
    console.log(`Uploaded ${rest[1]}.`);
  } else if (command === 'release' && rest.length === 1) {
    const owner = rest[0];
    if (!releaseHold(io, owner, draft)) throw new Error('Not released: the draft is not held by that owner.');
    console.log('released');
  } else if (command === 'break' && rest.length === 1 && rest[0] === '--confirm') {
    const {markAbandoned} = await import('../release/windows-release.mjs').catch(() => ({}));
    const broken = breakHold(io, {nightAlive: () => studioNightAlive(io, records), clearNightLock: () => clearStudioNightLock(io, records),
      work, markAbandoned: markAbandoned ?? null}, draft);
    console.log(broken ? `Removed: ${JSON.stringify({kind: broken.kind, startedAt: broken.startedAt, note: broken.note})}` : 'not held');
  } else {
    throw new Error('Usage: draft-hold.mjs [--draft TAG] status | acquire-manual NOTE | upload FILE NAME | release OWNER | break --confirm [--work DIR] [--records ~/DIR]');
  }
}
if (process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url))) {
  main().catch(error => { console.error(`draft-hold: ${error.message}`); process.exitCode = 1; });
}
