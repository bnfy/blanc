// Keeps security/audit-surface-inventory.json in step with the trust-boundary
// files it lists: each entry's sha256 must match the file's bytes and its
// literalChannels must equal the channel literals the file uses, and every
// preload in src/main must be listed.
//
//   node scripts/audit-surface-inventory.mjs --check   # fail on drift
//   node scripts/audit-surface-inventory.mjs --write   # refresh every entry
//
// The inventory is a review aid (docs/security-reviews/2026-10-02-audit-readiness.md).
// A matching hash records which source the entry describes; it is not evidence
// that the source was reviewed.
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(import.meta.dirname, '..');
export const INVENTORY = 'security/audit-surface-inventory.json';

// The first string-literal argument of on, handle, invoke, send and sendSync
// calls (ipcMain.handle, ipcRenderer.invoke, webContents.send, wc.on,
// autoUpdater.on?.() and so on) and of main.js's chromeOn/chromeHandle and
// pages.js's handle/handleEvent helpers. Checked against every source file the
// October 2 inventory hashed, this reproduces its lists apart from DOMException
// messages its looser pattern also caught. A CONSTANT argument counts when the
// same file declares it as `const CONSTANT = '…'`, as the session preloads do.
// It is deliberately literal: once() subscriptions, imported constants and
// computed channels are left for review in context.
const CALLEE = String.raw`(?<![\w$])(?:on|handle|handleEvent|invoke|send|sendSync|chromeOn|chromeHandle)(?:\?\.)?\(\s*`;
const CALL = new RegExp(CALLEE + String.raw`(['"\x60])([^'"\x60]+)\1`, 'g');
const CALL_CONSTANT = new RegExp(CALLEE + String.raw`([A-Z_][A-Z0-9_]*)\s*[,)]`, 'g');
const CONSTANT = /\bconst\s+([A-Z_][A-Z0-9_]*)\s*=\s*(['"])([^'"]+)\2\s*[;,\n]/g;
// Registration-table rows such as ['chrome:workspaces-move', handler] in main.js.
const TABLE_ROW = /\[\s*(['"])([a-z][a-z-]*:[a-z0-9:-]+)\1\s*,/g;

export function extractLiteralChannels(source) {
  const channels = new Set();
  for (const match of source.matchAll(CALL)) {
    if (!match[2].includes('${')) channels.add(match[2]);
  }
  const constants = new Map([...source.matchAll(CONSTANT)].map(match => [match[1], match[3]]));
  for (const match of source.matchAll(CALL_CONSTANT)) {
    if (constants.has(match[1])) channels.add(constants.get(match[1]));
  }
  for (const match of source.matchAll(TABLE_ROW)) channels.add(match[2]);
  return [...channels].sort();
}

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function readBoundary(root, file) {
  if (typeof file !== 'string' || path.isAbsolute(file)
      || file.split('/').some(part => !part || part === '.' || part === '..')) {
    throw new Error(`${INVENTORY}: boundary path is not a plain repository path: ${file}`);
  }
  try {
    return fs.readFileSync(path.join(root, file));
  } catch {
    throw new Error(`${INVENTORY}: boundary file is missing: ${file}`);
  }
}

export function refreshInventory(data, root = ROOT) {
  const next = structuredClone(data);
  for (const entry of next.boundaries) {
    const bytes = readBoundary(root, entry.file);
    entry.sha256 = sha256(bytes);
    entry.literalChannels = extractLiteralChannels(bytes.toString('utf8'));
  }
  return next;
}

export function inventoryDrift(data, root = ROOT) {
  const problems = [];
  for (const entry of data.boundaries) {
    const bytes = readBoundary(root, entry.file);
    if (entry.sha256 !== sha256(bytes)) problems.push(`${entry.file}: sha256 does not match the file`);
    const actual = extractLiteralChannels(bytes.toString('utf8'));
    const recorded = new Set(entry.literalChannels);
    const added = actual.filter(channel => !recorded.has(channel));
    const removed = entry.literalChannels.filter(channel => !actual.includes(channel));
    if (added.length) problems.push(`${entry.file}: unlisted channels ${added.join(', ')}`);
    if (removed.length) problems.push(`${entry.file}: listed channels no longer present ${removed.join(', ')}`);
    if (!added.length && !removed.length && entry.literalChannels.join('\n') !== actual.join('\n')) {
      problems.push(`${entry.file}: literalChannels must be sorted and unique`);
    }
  }
  return problems;
}

// Every preload-named file in src/main needs a boundary entry (the
// scoped-session-preload.js helper is one, as a service), and every listed
// preload must be a boundary entry with the preload role.
export function preloadCoverageProblems(data, root = ROOT) {
  const problems = [];
  const roles = new Map(data.boundaries.map(entry => [entry.file, entry.role]));
  for (const name of fs.readdirSync(path.join(root, 'src/main')).sort()) {
    const file = `src/main/${name}`;
    if (/preload.*\.js$/.test(name) && !roles.has(file)) problems.push(`${file}: preload-named file has no boundary entry`);
  }
  for (const file of data.preloads) {
    if (roles.get(file) !== 'preload') problems.push(`${file}: listed preload needs a boundary entry with role "preload"`);
  }
  for (const entry of data.boundaries) {
    if (entry.role === 'preload' && !data.preloads.includes(entry.file)) problems.push(`${entry.file}: preload boundary is missing from preloads`);
  }
  const sorted = list => list.every((value, index) => !index || list[index - 1] < value);
  if (!sorted(data.preloads)) problems.push('preloads must be sorted and unique');
  if (!sorted(data.boundaries.map(entry => entry.file))) problems.push('boundaries must be sorted by file and unique');
  return problems;
}

export function render(data) {
  return `${JSON.stringify(data, null, 2)}\n`;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const inventoryPath = path.join(ROOT, INVENTORY);
  const data = JSON.parse(fs.readFileSync(inventoryPath, 'utf8'));
  if (process.argv.includes('--write')) {
    fs.writeFileSync(inventoryPath, render(refreshInventory(data)));
  } else if (process.argv.includes('--check')) {
    const problems = [...preloadCoverageProblems(data), ...inventoryDrift(data)];
    if (problems.length) {
      console.error(`${INVENTORY} has drifted from the files it lists:\n  ${problems.join('\n  ')}\n`
        + 'Review the boundary change, then run: npm run audit-inventory:write');
      process.exit(1);
    }
    console.log(`${INVENTORY}: ${data.boundaries.length} boundary entries match their files`);
  } else {
    console.error('usage: audit-surface-inventory.mjs --check | --write');
    process.exit(2);
  }
}
