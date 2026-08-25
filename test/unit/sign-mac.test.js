'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const { withPluginEntitlements } = require('../../scripts/sign-mac');
const {
  derArrayContainsFromLines,
  derBooleanTrueFromLines,
} = require('../../scripts/after-sign-verify');

test('mac signer overrides only Electron Helper (Plugin)', () => {
  const root = '/repo';
  const options = withPluginEntitlements({
    identity: 'identity',
    optionsForFile: () => ({ entitlements: '/repo/build/entitlements.mac.inherit.plist' }),
  }, root);
  assert.equal(options.optionsForFile('/app/Blanc Helper.app').entitlements,
    '/repo/build/entitlements.mac.inherit.plist');
  assert.equal(options.optionsForFile('/app/Blanc Helper (Renderer).app').entitlements,
    '/repo/build/entitlements.mac.inherit.plist');
  assert.equal(options.optionsForFile('/app/Blanc Helper (Plugin).app').entitlements,
    path.join(root, 'build', 'entitlements.mac.plugin.plist'));
  assert.equal(options.identity, 'identity');
});

test('post-sign DER checks require typed true values and the exact WebAuthn group', () => {
  const lines = [
    '  11:d=3  hl=2 l=31 prim: UTF8STRING :com.apple.security.cs.allow-jit',
    '  44:d=3  hl=2 l=1 prim: BOOLEAN :255',
    '  47:d=2  hl=2 l=53 cons: SEQUENCE',
    '  49:d=3  hl=2 l=22 prim: UTF8STRING :keychain-access-groups',
    '  73:d=3  hl=2 l=27 cons: SEQUENCE',
    '  75:d=4  hl=2 l=25 prim: UTF8STRING :XYGUCY4498.me.bnfy.bowser',
  ];
  assert.equal(derBooleanTrueFromLines(lines, 'com.apple.security.cs.allow-jit'), true);
  assert.equal(derBooleanTrueFromLines(lines, 'com.apple.security.cs.disable-library-validation'), false);
  assert.equal(derArrayContainsFromLines(
    lines, 'keychain-access-groups', 'XYGUCY4498.me.bnfy.bowser'
  ), true);
  assert.equal(derArrayContainsFromLines(
    lines, 'keychain-access-groups', 'ATTACKER.example'
  ), false);
  assert.equal(derBooleanTrueFromLines([
    '  11:d=3  hl=2 l=31 prim: UTF8STRING :com.apple.security.cs.allow-jit',
    '  44:d=3  hl=2 l=1 prim: BOOLEAN :0',
  ], 'com.apple.security.cs.allow-jit'), false);
});
