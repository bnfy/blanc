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
test('a cleanup marker inserted between check and write is not overwritten', t => {
  const dir = fixture(t);
  const errors = run(dir, { ...fs, writeFileSync(file, data, options) {
    fs.writeFileSync(file, 'concurrent marker');
    fs.writeFileSync(file, data, options);
  } });
  assert.equal(errors.length, 1);
  assert.equal(fs.readFileSync(path.join(dir, 'legacy-extension-cleanup-v1'), 'utf8'), 'concurrent marker');
});
test('a symlink inserted at the cleanup marker cannot overwrite its target', { skip: process.platform === 'win32' }, t => {
  const dir = fixture(t);
  const target = path.join(dir, 'keep');
  fs.writeFileSync(target, 'unchanged');
  const errors = run(dir, { ...fs, writeFileSync(file, data, options) {
    fs.symlinkSync(target, file);
    fs.writeFileSync(file, data, options);
  } });
  assert.equal(errors.length, 1);
  assert.equal(fs.readFileSync(target, 'utf8'), 'unchanged');
});
