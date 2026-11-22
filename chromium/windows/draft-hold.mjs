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
//   node chromium/windows/draft-hold.mjs break --confirm [--work DIR]
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
export const draftTag = () => process.env.BLANC_CANDIDATE_DRAFT || 'fork-windows-candidate';
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

// The hold and the API URL of the asset it was read from, or null.
export function readHold(io, draft = draftTag()) {
  const view = JSON.parse(gh(io, ['release', 'view', draft, '--repo', REPO, '--json', 'assets'], 'GitHub did not list the draft\'s assets') || '{}');
  const asset = (view.assets ?? []).find(a => a.name === HOLD_ASSET);
  if (!asset) return null;
  const body = io.exec('gh', ['api', '-H', 'Accept: application/octet-stream', asset.apiUrl]);
  if (body.status !== 0) return null;  // deleted between the listing and the read
  try { return {body: JSON.parse(body.stdout), apiUrl: asset.apiUrl}; } catch { throw new Error('The draft\'s hold is not readable.'); }
}

export function acquireHold(io, kind, note, draft = draftTag()) {
  if (!['nightly', 'release', 'manual'].includes(kind)) throw new Error('Unknown hold kind.');
  assertDraft(io, draft);
  const owner = crypto.randomBytes(16).toString('hex');
  const {dir, file} = tempFile(HOLD_ASSET, JSON.stringify({kind, owner, startedAt: new Date().toISOString(), note}) + '\n');
  try {
    const upload = io.exec('gh', ['release', 'upload', draft, file, '--repo', REPO]);
    const hold = readHold(io, draft);
    if (upload.status !== 0 || hold?.body?.owner !== owner) throw new Error(`The candidate draft is held (${hold?.body?.kind ?? 'unknown'}); not taken.`);
    return {owner, apiUrl: hold.apiUrl};
  } finally {
    fs.rmSync(dir, {recursive: true, force: true});
  }
}

export function uploadUnderHold(io, owner, file, name, draft = draftTag()) {
  assertDraft(io, draft);
  const hold = readHold(io, draft);
  if (!owner || hold?.body?.owner !== owner) throw new Error('The candidate draft is held by another owner, or not held; nothing uploaded.');
  const {dir, file: named} = tempFile(name);
  try {
    fs.copyFileSync(file, named);
    gh(io, ['release', 'upload', draft, named, '--repo', REPO, '--clobber'], 'Could not upload to the candidate draft.');
  } finally {
    fs.rmSync(dir, {recursive: true, force: true});
  }
}

// Deletes the hold only if it still names |owner|, by the URL of the asset
// that was read; a successor's hold has another URL and survives.
export function releaseHold(io, owner, draft = draftTag()) {
  const hold = readHold(io, draft);
  if (!hold || !owner || hold.body.owner !== owner) return false;
  return io.exec('gh', ['api', '-X', 'DELETE', hold.apiUrl]).status === 0;
}

// For a person: removes a hold whose holder is gone. A nightly hold only when
// its night is not running; a release hold only with that release's work
// folder, which is marked abandoned first (windows-release.mjs refuses it).
export function breakHold(io, {nightAlive, work = null, markAbandoned = null}, draft = draftTag()) {
  const hold = readHold(io, draft);
  if (!hold) return null;
  if (hold.body.kind === 'nightly' && nightAlive()) throw new Error('The night is still running on the Mac Studio; its hold stays.');
  if (hold.body.kind === 'release') {
    if (!work || !markAbandoned) throw new Error('A release hold needs that release\'s work folder (--work DIR), which is marked abandoned first.');
    markAbandoned(work);
  }
  if (io.exec('gh', ['api', '-X', 'DELETE', hold.apiUrl]).status !== 0) throw new Error('Could not remove the hold.');
  return hold.body;
}

// Whether the Mac Studio's night lock names a live process.
export function studioNightAlive(io) {
  const read = io.exec('ssh', [...STUDIO_SSH, 'cat ~/Projects/Blanc/records/nightly/windows/RUNNING/owner 2>/dev/null']);
  if (read.status !== 0 || !read.stdout.trim()) return false;
  let pid;
  try { pid = JSON.parse(read.stdout).pid; } catch { return true; }  // unreadable: assume alive
  if (!Number.isInteger(pid)) return true;
  return io.exec('ssh', [...STUDIO_SSH, `kill -0 ${pid}`]).status === 0;
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
  const [command, ...rest] = process.argv.slice(2);
  const io = realIO();
  if (command === 'status') {
    const hold = readHold(io);
    console.log(hold ? JSON.stringify({kind: hold.body.kind, startedAt: hold.body.startedAt, note: hold.body.note}) : 'not held');
  } else if (command === 'acquire-manual' && rest.length === 1) {
    console.log(acquireHold(io, 'manual', rest[0]).owner);
  } else if (command === 'upload' && rest.length === 2) {
    uploadUnderHold(io, process.env.BLANC_DRAFT_HOLD_OWNER, rest[0], rest[1]);
    console.log(`Uploaded ${rest[1]}.`);
  } else if (command === 'release' && rest.length === 1) {
    console.log(releaseHold(io, rest[0]) ? 'released' : 'not released (not held by that owner)');
  } else if (command === 'break' && rest[0] === '--confirm') {
    const workAt = rest.indexOf('--work');
    const work = workAt > 0 ? rest[workAt + 1] : null;
    const {markAbandoned} = await import('../release/windows-release.mjs').catch(() => ({}));
    const broken = breakHold(io, {nightAlive: () => studioNightAlive(io), work, markAbandoned: markAbandoned ?? null});
    console.log(broken ? `Removed a ${broken.kind} hold from ${broken.startedAt}.` : 'not held');
  } else {
    throw new Error('Usage: draft-hold.mjs status | acquire-manual NOTE | upload FILE NAME | release OWNER | break --confirm [--work DIR]');
  }
}
if (process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url))) {
  main().catch(error => { console.error(`draft-hold: ${error.message}`); process.exitCode = 1; });
}
