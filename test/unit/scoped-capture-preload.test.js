'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { scopedCapturePreload, captureWrapperBytes, captureWrapperPath } = require('../../src/main/scoped-session-preload');
const { captureRuntimeForPlatform } = require('../../src/main/capture-platform');
const ROOT = path.resolve(__dirname, '../..');
const lock = require('../../src/main/capture-runtime-lock.json');
for (const platform of ['darwin', 'win32', 'linux']) {
  test(`${platform} registers the verified capture wrapper inside the app`, () => {
    const relativePath = `src/main/${captureRuntimeForPlatform(platform).preload}`;
    assert.equal(scopedCapturePreload({ sourceRoot: ROOT, relativePath, pin: lock.files[relativePath] }), path.join(ROOT, captureWrapperPath(relativePath)));
    const wrapper = fs.readFileSync(path.join(ROOT, captureWrapperPath(relativePath)), 'utf8');
    // No capture/IPC code may run in an extension document, even if it has
    // mediaDevices. No Node API is needed or exposed by this scope guard.
    vm.runInNewContext(wrapper, { location: { protocol: 'chrome-extension:' }, navigator: { mediaDevices: {} }, require() { throw new Error('extension capture preload ran'); } });
  });
}
test('mutable user-data files cannot supply a capture preload, and damaged app bytes fail verification', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-preload-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const relativePath = 'src/main/capture-preload.js';
  fs.mkdirSync(path.join(root, 'src/main'), { recursive: true });
  fs.copyFileSync(path.join(ROOT, relativePath), path.join(root, relativePath));
  const wrapper = path.join(root, captureWrapperPath(relativePath));
  fs.writeFileSync(wrapper, captureWrapperBytes(fs.readFileSync(path.join(root, relativePath))));
  const mutable = path.join(root, 'user-data/managed-session-preloads/capture-preload');
  fs.mkdirSync(mutable, { recursive: true }); fs.writeFileSync(path.join(mutable, 'preload.js'), 'throw new Error("tampered")');
  const options = { sourceRoot: root, userData: path.join(root, 'user-data'), relativePath, pin: lock.files[relativePath] };
  assert.equal(scopedCapturePreload(options), wrapper);
  fs.appendFileSync(wrapper, '/* changed */');
  assert.throws(() => scopedCapturePreload(options), /capture-wrapper-integrity/);
  fs.appendFileSync(path.join(root, relativePath), '/* changed */');
  assert.throws(() => scopedCapturePreload(options), /capture-preload-integrity/);
  assert.throws(() => captureWrapperPath('../preload.js'), /capture-preload-path/);
});
