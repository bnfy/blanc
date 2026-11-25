// The Linux beta checkout guard: nothing outside the lane's map may differ from the pin,
// except an untracked file a gclient hook writes that no build reads (checkout-status.mjs).
import assert from 'node:assert/strict';
import test from 'node:test';
import {checkoutStatusProblem, GCLIENT_HOOK_OUTPUTS} from './checkout-status.mjs';

const current = {upstreamFiles: {'chrome/browser/ui/browser.cc': 'a'}, canonicalSha256: {'blanc/ui.gni': 'b'}};
const outside = /outside the lane's map/;

// git status prints `XY path`; every other git call (a gitlink lookup) finds nothing.
function io(...lines) {
  return {
    exists: () => false,
    read: () => '',
    exec: (cmd, args) => args.includes('status')
      ? {status: 0, stdout: lines.map(line => line + '\n').join('')}
      : {status: 1, stdout: ''},
  };
}

test('the hook outputs are exact paths', () => {
  assert.deepEqual([...GCLIENT_HOOK_OUTPUTS], ['buildtools/reclient_cfgs/reproxy.cfg']);
});

test('an untracked reproxy.cfg from the sync hook passes, with mapped changes and outputs', () => {
  assert.equal(checkoutStatusProblem('/src', current, io(
    '?? buildtools/reclient_cfgs/reproxy.cfg',
    ' M chrome/browser/ui/browser.cc',
    '?? blanc/ui.gni',
    '?? out/BlancLinuxBeta/args.gn')), null);
});

test('reproxy.cfg passes only while untracked', () => {
  for (const state of [' M', 'M ', ' D', 'A '])
    assert.match(checkoutStatusProblem('/src', current, io(`${state} buildtools/reclient_cfgs/reproxy.cfg`)), outside, state);
});

test('anything else outside the map still stops the build', () => {
  for (const line of [
    '?? buildtools/reclient_cfgs/rewrapper.cfg',
    '?? buildtools/reclient_cfgs/reproxy.cfg.bak',
    '?? third_party/buildtools/reclient_cfgs/reproxy.cfg',
    '?? third_party/wayland-protocols/kde/README.md',
    ' M chrome/browser/ui/unmapped.cc',
  ]) assert.match(checkoutStatusProblem('/src', current, io(line)), outside, line);
});
