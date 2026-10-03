'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { readVerifiedPackage, adaptPackage, installVerifiedFiles, readHostSources } = require('../../src/main/ublock-package');
const root = path.resolve(__dirname, '../..');
const hosts = readHostSources(root);
test('adaptation preserves upstream filtering engine and rejects another source revision', () => {
  const { files } = readVerifiedPackage(path.join(root, 'ublock'));
  const result = adaptPackage(files, hosts);
  for (const [name, bytes] of files) if (name.includes('filtering') || name.startsWith('js/resources/')) assert(result.get(name).equals(bytes), name);
  const bad = new Map(files); bad.set('js/start.js', Buffer.from('unsupported version'));
  assert.throws(() => adaptPackage(bad, hosts), /ubo-patch-version/);
  const storage = result.get('js/storage.js').toString();
  assert(storage.includes("const userResourcesLocation = 'unset'"));
  assert(storage.includes('const success = false'));
  assert(result.get('js/messaging.js').toString().includes('delete hiddenSettings.userResourcesLocation'));
});
test('atomic managed install repairs corruption and interruption without changing identity', t => {
  const temporary = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ubo-package-test-')));
  t.after(() => fs.rmSync(temporary, { recursive: true, force: true }));
  const destination = path.join(temporary, 'extension');
  const bytes = new Map([['manifest.json', Buffer.from('{}')], ['js/script.js', Buffer.from('verified')]]);
  installVerifiedFiles(bytes, destination);
  fs.writeFileSync(path.join(destination, 'js/script.js'), 'corrupted');
  fs.writeFileSync(path.join(destination, 'unlisted.js'), 'bad');
  fs.mkdirSync(path.join(temporary, '.extension.staging-interrupted'));
  assert.equal(installVerifiedFiles(bytes, destination), destination);
  assert.equal(fs.readFileSync(path.join(destination, 'js/script.js'), 'utf8'), 'verified');
  assert(!fs.existsSync(path.join(destination, 'unlisted.js')));
  assert(!fs.existsSync(path.join(temporary, '.extension.staging-interrupted')));
  fs.renameSync(destination, path.join(temporary, '.extension.previous'));
  installVerifiedFiles(bytes, destination);
  assert(fs.existsSync(path.join(destination, 'manifest.json')));
});
test('managed writes reject path traversal and symlink parents', t => {
  const temporary = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ubo-package-test-')));
  t.after(() => fs.rmSync(temporary, { recursive: true, force: true }));
  assert.throws(() => installVerifiedFiles(new Map([['../escape', Buffer.from('bad')]]), path.join(temporary, 'extension')), /ubo-package-path/);
  fs.symlinkSync(temporary, path.join(temporary, 'link'), process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => installVerifiedFiles(new Map([['x', Buffer.from('bad')]]), path.join(temporary, 'link', 'extension')), /ubo-package-symlink/);
});

test('corrupt executable or source bytes fail verification before an extension can load', t => {
  const temporary = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ubo-corruption-test-')));
  t.after(() => fs.rmSync(temporary, { recursive: true, force: true }));
  const { hash } = require('../../src/main/ublock-package');
  fs.mkdirSync(path.join(temporary, 'upstream'));
  const script = Buffer.from('pinned executable');
  const source = Buffer.from('pinned source');
  fs.writeFileSync(path.join(temporary, 'upstream/script.js'), script);
  fs.writeFileSync(path.join(temporary, 'source.txt'), source);
  fs.writeFileSync(path.join(temporary, 'pinned.json'), JSON.stringify({ format: 1, version: '1.75.0',
    files: [{ path: 'script.js', size: script.length, sha256: hash(script) }],
    sources: [{ path: 'source.txt', sha256: hash(source) }],
  }));
  readVerifiedPackage(temporary);
  fs.writeFileSync(path.join(temporary, 'upstream/script.js'), 'altered');
  assert.throws(() => readVerifiedPackage(temporary), /ubo-package-integrity/);
  fs.writeFileSync(path.join(temporary, 'upstream/script.js'), script);
  fs.writeFileSync(path.join(temporary, 'source.txt'), 'altered');
  assert.throws(() => readVerifiedPackage(temporary), /ubo-source-integrity/);
});
