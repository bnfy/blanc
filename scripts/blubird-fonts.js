'use strict';

// Blubird (Rajesh Rajput) is commercially licensed for Blanc's official builds
// and must never be committed: this repository is public. This tool installs
// the licensed files (today only Medium Display, for the Billboard clock), flat and git-ignored, into
// src/renderer/pages/ (pages.js serves no subfolders) and verifies them, in a
// checkout or inside a packaged app.asar, against fonts/blubird/pinned.json.
// Without them every Blubird stack falls back to Inter; public releases run
// the checks with --require and fail closed.
//
//   node scripts/blubird-fonts.js install <Blubird.zip | folder>
//   node scripts/blubird-fonts.js install-env [--require]   (CI: base64 secrets)
//   node scripts/blubird-fonts.js check [--require] [--asar <app.asar>]

const { execFileSync } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const PAGES_DIR = path.join(ROOT, 'src/renderer/pages');
const ASAR_PAGES = 'src/renderer/pages';
const INSTALL_HINT = 'Install the licensed files: npm run fonts:install -- /path/to/Blubird.zip';

function readPinned(root = ROOT) {
  return JSON.parse(fs.readFileSync(path.join(root, 'fonts/blubird/pinned.json'), 'utf8'));
}

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function verifyBytes(entry, bytes) {
  const actual = sha256(bytes);
  if (bytes.length !== entry.bytes || actual !== entry.sha256) {
    throw new Error(`${entry.name}: ${bytes.length} bytes, SHA-256 ${actual}; pinned ${entry.bytes} bytes, ${entry.sha256}`);
  }
}

// Where an entry sits inside the zip: its own path, or the shared web folder.
function sourcePath(entry, pinned) {
  return entry.source || `${pinned.sourceFolder}/${entry.name}`;
}

function readSource(source, entry, pinned) {
  if (fs.statSync(source).isDirectory()) {
    const flat = path.join(source, entry.name);
    return fs.readFileSync(fs.existsSync(flat) ? flat : path.join(source, sourcePath(entry, pinned)));
  }
  return execFileSync('unzip', ['-p', source, sourcePath(entry, pinned)], { maxBuffer: 8 * 1024 * 1024 });
}

function installFromSource(source, { pinned = readPinned(), targetDir = PAGES_DIR } = {}) {
  // Verify every file before writing any, so a bad source never half-installs.
  const verified = pinned.files.map((entry) => {
    const bytes = readSource(source, entry, pinned);
    verifyBytes(entry, bytes);
    return [entry, bytes];
  });
  for (const [entry, bytes] of verified) fs.writeFileSync(path.join(targetDir, entry.name), bytes);
  return verified.map(([entry]) => entry.name);
}

function installFromEnv(env, { pinned = readPinned(), targetDir = PAGES_DIR } = {}) {
  const installed = [];
  const missing = [];
  for (const entry of pinned.files) {
    // GitHub caps one Actions secret at 48 KB, so a larger file arrives as
    // numbered parts (NAME_1 … NAME_n) that join back into one base64 string.
    const names = entry.parts > 1
      ? Array.from({ length: entry.parts }, (_, index) => `${entry.env}_${index + 1}`)
      : [entry.env];
    const chunks = names.map((name) => String(env[name] || '').replace(/\s+/g, ''));
    const encoded = chunks.every(Boolean) ? chunks.join('') : '';
    if (!encoded) {
      missing.push(entry.name);
      continue;
    }
    const bytes = Buffer.from(encoded, 'base64');
    verifyBytes(entry, bytes);
    fs.writeFileSync(path.join(targetDir, entry.name), bytes);
    installed.push(entry.name);
  }
  return { installed, missing };
}

function checkFiles(readFile, pinned) {
  const present = [];
  const missing = [];
  for (const entry of pinned.files) {
    const bytes = readFile(entry.name);
    if (!bytes) {
      missing.push(entry.name);
      continue;
    }
    verifyBytes(entry, bytes);
    present.push(entry.name);
  }
  return { present, missing };
}

function checkDirectory(dir = PAGES_DIR, { pinned = readPinned() } = {}) {
  return checkFiles((name) => {
    const file = path.join(dir, name);
    return fs.existsSync(file) ? fs.readFileSync(file) : null;
  }, pinned);
}

// @electron/asar resolves archive paths with the host separator, so a
// forward-slash path is "not found" on Windows (as in verify-packaged-ublock).
function asarInnerPath(name, sep = path.sep) {
  return `${ASAR_PAGES}/${name}`.split('/').join(sep);
}

function checkAsar(asarPath, { pinned = readPinned() } = {}) {
  const asar = require('@electron/asar');
  const listed = new Set(asar.listPackage(asarPath).map((entry) => entry.replace(/\\/g, '/').replace(/^\//, '')));
  return checkFiles((name) => (
    listed.has(`${ASAR_PAGES}/${name}`) ? asar.extractFile(asarPath, asarInnerPath(name)) : null
  ), pinned);
}

function main(argv, options = {}) {
  const {
    env = process.env, pinned = readPinned(), pagesDir = PAGES_DIR,
    log = console.log, warn = console.warn, error = console.error,
  } = options;
  const [command, ...rest] = argv;
  const requireAll = rest.includes('--require');
  try {
    if (command === 'install' && rest[0]) {
      for (const name of installFromSource(rest[0], { pinned, targetDir: pagesDir })) log(`Installed src/renderer/pages/${name}`);
      return 0;
    }
    if (command === 'install-env') {
      const { installed, missing } = installFromEnv(env, { pinned, targetDir: pagesDir });
      for (const name of installed) log(`Installed src/renderer/pages/${name}`);
      if (missing.length) {
        (requireAll ? error : warn)(`Blubird secrets missing for: ${missing.join(', ')}. Internal pages would fall back to Inter.`);
        return requireAll ? 1 : 0;
      }
      return 0;
    }
    if (command === 'check') {
      const asarIndex = rest.indexOf('--asar');
      const where = asarIndex >= 0 ? rest[asarIndex + 1] : pagesDir;
      const { missing } = asarIndex >= 0 ? checkAsar(where, { pinned }) : checkDirectory(where, { pinned });
      if (missing.length) {
        (requireAll ? error : warn)(`Blubird is missing from ${where}: ${missing.join(', ')}. Internal pages fall back to Inter. ${INSTALL_HINT}`);
        return requireAll ? 1 : 0;
      }
      log(`Blubird fonts present and verified in ${where}.`);
      return 0;
    }
  } catch (failure) {
    error(failure.message);
    return 1;
  }
  error('Usage: blubird-fonts.js install <zip|dir> | install-env [--require] | check [--require] [--asar <path>]');
  return 1;
}

if (require.main === module) process.exitCode = main(process.argv.slice(2));

module.exports = {
  readPinned, sha256, verifyBytes, sourcePath, installFromSource, installFromEnv, checkDirectory, asarInnerPath, checkAsar, main,
};
