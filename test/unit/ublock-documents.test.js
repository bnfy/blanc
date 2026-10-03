'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { captureDocuments, currentDocuments, guardScript } = require('../../src/main/ublock-documents');
function fixture() {
  const frame = { detached: false, isDestroyed: () => false };
  const wc = { mainFrame: { framesInSubtree: [frame] }, isDestroyed: () => false };
  const tab = { navEpoch: 1 };
  const policy = { liveContents: () => wc, isHeld: () => false, registered: () => true, generationFor: () => 1 };
  return { wc, tab, frame, policy, snapshot: captureDocuments(tab, wc, [frame], policy.generationFor) };
}
test('document authorization refuses navigation, replacement views, held tabs and foreign registries', () => {
  const f = fixture(); assert(currentDocuments(f.snapshot, f.policy));
  f.tab.navEpoch++; assert(!currentDocuments(f.snapshot, f.policy)); f.tab.navEpoch--;
  assert(!currentDocuments(f.snapshot, { ...f.policy, liveContents: () => ({}) }));
  assert(!currentDocuments(f.snapshot, { ...f.policy, isHeld: () => true }));
  assert(!currentDocuments(f.snapshot, { ...f.policy, registered: () => false }));
  f.wc.isDestroyed = () => true; assert(!currentDocuments(f.snapshot, f.policy));
});
test('subframe authorization refuses same-URL commits, detached frames and recycled frame IDs', () => {
  const f = fixture();
  assert(!currentDocuments(f.snapshot, { ...f.policy, generationFor: () => 2 }));
  f.frame.url = 'chrome-extension://owned/epicker-ui.html'; assert(!currentDocuments(f.snapshot, f.policy)); f.frame.url = undefined;
  f.frame.detached = true; assert(!currentDocuments(f.snapshot, f.policy)); f.frame.detached = false;
  f.wc.mainFrame.framesInSubtree = [{ ...f.frame }]; assert(!currentDocuments(f.snapshot, f.policy));
});
test('native injection cannot execute in a replacement document and preserves upstream expression results', () => {
  const token = '11111111-1111-4111-8111-111111111111';
  const code = guardScript('self.injected = true; 42;', [token]);
  const self = { __blancUboDocumentV1: token };
  assert.equal(vm.runInNewContext(code, { self }), 42); assert(self.injected);
  const replacement = {};
  vm.runInNewContext(code, { self: replacement }); assert.equal(replacement.injected, undefined);
  assert.throws(() => guardScript('x', ['"; injected=true; //']), /token-invalid/);
});
