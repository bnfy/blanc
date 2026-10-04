'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const overlay = fs.readFileSync(path.join(__dirname, '../../src/renderer/overlay.js'), 'utf8');
const styles = fs.readFileSync(path.join(__dirname, '../../src/renderer/styles.css'), 'utf8');

test('workspace projections share the overlay pointer hold before replacing pressed rows', () => {
  assert.match(overlay, /function applyWorkspacesPayload\(payload\) \{[\s\S]*?if \(pointerHeld\) \{[\s\S]*?pendingWorkspacesPayload = payload;[\s\S]*?renderQueued = true;[\s\S]*?return false;/);
  assert.match(overlay, /function releasePointerHold\(\) \{[\s\S]*?pendingWorkspacesPayload[\s\S]*?commitWorkspacesPayload\(payload\);[\s\S]*?renderList\(\);/);
});

test('the outer backdrop honors a protected workspace decision or editor', () => {
  assert.match(overlay, /backdrop\.addEventListener\('mousedown',[\s\S]*?workspaceSwitcherOpen && closeWorkspaceSwitcher\(\) === false[\s\S]*?event\.preventDefault\(\);[\s\S]*?event\.stopPropagation\(\);[\s\S]*?return;[\s\S]*?window\.browserAPI\.closeOverlay\(\);/);
});

test('compact footer wraps launcher groups without shrinking individual buttons', () => {
  const launchers = styles.match(/^\.footer-launchers \{([\s\S]*?)\}/m)?.[1];
  assert.ok(launchers);
  assert.match(launchers, /flex:\s*0 1 auto;/);
  assert.match(launchers, /min-width:\s*0;/);
  assert.match(launchers, /flex-wrap:\s*wrap;/);
  const button = styles.match(/^\.footer-new \{([\s\S]*?)\}/m)?.[1];
  assert.ok(button);
  assert.match(button, /flex:\s*0 0 auto;/);
  assert.match(button, /height:\s*28px;/);
  assert.match(button, /white-space:\s*nowrap;/);
});
