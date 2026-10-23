'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../../scripts/ecs-full-bootstrap.cjs'), 'utf8');
test('candidate applies production Linux sandbox guard before native component access', () => {
  for (const allowed of [false, true]) {
    let guarded = false, componentRead = false;
    const electron = { app: {}, dialog: {}, shell: {}, clipboard: {} };
    Object.defineProperty(electron, 'components', { get() {
      assert.equal(guarded, true); componentRead = true; throw Error('stop after guarded component access');
    } });
    const load = vm.runInNewContext(`(function(require, module, exports) {${source}\n})`);
    const requireStub = name => {
      if (name === 'electron') return electron;
      assert.equal(name, './linux-sandbox-launch');
      return { enforceLinuxSandbox: () => { guarded = true; return allowed; } };
    };
    if (allowed) assert.throws(() => load(requireStub, {}, {}), /stop after guarded component access/);
    else load(requireStub, {}, {});
    assert.equal(guarded, true);
    assert.equal(componentRead, allowed, 'refused launches never initialize the CDM');
  }
});
