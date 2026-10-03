'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const main = fs.readFileSync(path.join(__dirname, '../../src/main/main.js'), 'utf8');
const start = main.indexOf('  const staleExtensionState = [');
const end = main.indexOf('\n}\n\n// URLs and declared HTML documents', start);
assert(start > 0 && end > start);
const cleanup = main.slice(start, end);
function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-cleanup-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}
function run(dir, fileSystem = fs) {
  const errors = [];
  vm.runInNewContext(cleanup, { fs: fileSystem, path, app: { getPath: () => dir }, console: { warn: (...args) => errors.push(args) } });
  return errors;
}
test('legacy migration preserves managed uBO and ordinary website service workers', t => {
  const dir = fixture(t);
  for (const name of ['managed-ublock', 'Extensions', 'Service Worker']) fs.mkdirSync(path.join(dir, name));
  assert.equal(run(dir).length, 0);
  assert(fs.existsSync(path.join(dir, 'Extensions')));
  fs.rmdirSync(path.join(dir, 'managed-ublock'));
  assert.equal(run(dir).length, 0);
  assert(!fs.existsSync(path.join(dir, 'Extensions')));
  assert(fs.existsSync(path.join(dir, 'Service Worker')));
  assert.equal(fs.readFileSync(path.join(dir, 'legacy-extension-cleanup-v1'), 'utf8'), '1\n');
});
test('the marker is claimed by exclusive create, with no separate existence check', () => {
  assert.match(cleanup, /fs\.openSync\(migration, 'wx', 0o600\)/);
  assert.doesNotMatch(cleanup, /existsSync\(migration\)/);
});
test('a marker created concurrently before the claim is not overwritten and skips cleanup', t => {
  const dir = fixture(t);
  fs.mkdirSync(path.join(dir, 'Extensions'));
  const marker = path.join(dir, 'legacy-extension-cleanup-v1');
  const errors = run(dir, { ...fs, openSync(file, flags, mode) {
    if (file === marker) fs.writeFileSync(file, 'concurrent marker');
    return fs.openSync(file, flags, mode);
  } });
  assert.equal(errors.length, 0);
  assert.equal(fs.readFileSync(marker, 'utf8'), 'concurrent marker');
  assert(fs.existsSync(path.join(dir, 'Extensions')));
});
test('a symlink inserted at the cleanup marker cannot overwrite its target', { skip: process.platform === 'win32' }, t => {
  const dir = fixture(t);
  const target = path.join(dir, 'keep');
  fs.writeFileSync(target, 'unchanged');
  const marker = path.join(dir, 'legacy-extension-cleanup-v1');
  const errors = run(dir, { ...fs, openSync(file, flags, mode) {
    if (file === marker) fs.symlinkSync(target, file);
    return fs.openSync(file, flags, mode);
  } });
  assert.equal(errors.length, 0);
  assert.equal(fs.readFileSync(target, 'utf8'), 'unchanged');
});
test('a failed cleanup releases its marker so the next launch retries', t => {
  const dir = fixture(t);
  fs.mkdirSync(path.join(dir, 'Extensions'));
  const marker = path.join(dir, 'legacy-extension-cleanup-v1');
  const errors = run(dir, { ...fs, rmSync(file, options) {
    if (file === path.join(dir, 'Extensions')) throw new Error('busy');
    return fs.rmSync(file, options);
  } });
  assert.equal(errors.length, 1);
  assert(!fs.existsSync(marker));
  assert.equal(run(dir).length, 0);
  assert(!fs.existsSync(path.join(dir, 'Extensions')));
  assert.equal(fs.readFileSync(marker, 'utf8'), '1\n');
});
