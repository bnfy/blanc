'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { processRole } = require('../desktop/ecs-linux-sandbox.cjs');
test('Linux process probe recognizes Chromium flattened and native argv titles', () => {
  const args = ['/tmp/Blanc', '--type=utility', '--utility-sub-type=media.mojom.CdmServiceBroker', '--service-sandbox-type=cdm'];
  const expected = { type: 'utility', subtype: 'media.mojom.CdmServiceBroker', sandboxType: 'cdm', noSandboxFlag: false };
  assert.deepEqual(processRole(args.join('\0') + '\0'), expected);
  assert.deepEqual(processRole(args.join(' ') + '\0'), expected);
  assert.equal(processRole(args.join(' ') + ' --no-sandbox').noSandboxFlag, true);
  assert.equal(processRole(args.join(' ') + ' --no-sandbox-helper').noSandboxFlag, false);
  assert.equal(processRole('/tmp/Blanc\0').type, undefined);
});
