'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const overlay = fs.readFileSync(path.join(__dirname, '../../src/renderer/overlay.js'), 'utf8');

test('workspace projections share the overlay pointer hold before replacing pressed rows', () => {
  assert.match(overlay, /function applyWorkspacesPayload\(payload\) \{[\s\S]*?if \(pointerHeld\) \{[\s\S]*?pendingWorkspacesPayload = payload;[\s\S]*?renderQueued = true;[\s\S]*?return false;/);
  assert.match(overlay, /function releasePointerHold\(\) \{[\s\S]*?pendingWorkspacesPayload[\s\S]*?commitWorkspacesPayload\(payload\);[\s\S]*?renderList\(\);/);
});

test('the outer backdrop honors a protected workspace decision or editor', () => {
  assert.match(overlay, /backdrop\.addEventListener\('mousedown',[\s\S]*?workspaceSwitcherOpen && closeWorkspaceSwitcher\(\) === false[\s\S]*?event\.preventDefault\(\);[\s\S]*?event\.stopPropagation\(\);[\s\S]*?return;[\s\S]*?window\.browserAPI\.closeOverlay\(\);/);
});
