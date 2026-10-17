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
  assert.match(button, /height:\s*30px;/);
  assert.match(button, /white-space:\s*nowrap;/);
});

test('the Private pill keeps its shortcut in the tooltip, not inline', () => {
  const html = require('node:fs').readFileSync(require('node:path').join(__dirname, '../../src/renderer/overlay.html'), 'utf8');
  const privateButton = html.match(/<button id="footerNewPrivate"[\s\S]*?<\/button>/)?.[0] ?? '';
  assert.ok(privateButton, 'footerNewPrivate exists');
  assert.doesNotMatch(privateButton, /footer-kbd/);
  assert.match(overlay, /footerNewPrivate\.title = blancI18n\.t\('footer\.newPrivate\.title'/);
  const pill = styles.match(/^\.footer-new \{([\s\S]*?)\}/m)?.[1] ?? '';
  assert.match(pill, /font-weight:\s*550;/);
  assert.match(pill, /font-size:\s*12\.5px;/);
  const hover = styles.match(/^\.footer-new:hover \{([\s\S]*?)\}/m)?.[1] ?? '';
  assert.doesNotMatch(hover, /opacity/, 'hover changes the fill, never fades the button');
});

test('Other devices is a plain text toggle, not a pill', () => {
  const html = require('node:fs').readFileSync(require('node:path').join(__dirname, '../../src/renderer/overlay.html'), 'utf8');
  const button = html.match(/<button id="footerDevices"[\s\S]*?<\/button>/)?.[0] ?? '';
  assert.match(button, /class="devices-caret"/, 'a chevron shows whether the drawer is open');
  const base = styles.match(/^\.footer-new\.devices \{([\s\S]*?)\}/m)?.[1] ?? '';
  assert.match(base, /background:\s*none;/);
  assert.match(base, /border-radius:\s*var\(--radius-sm\);/);
  const states = styles.match(/^\.footer-new\.devices:hover,[\s\S]*?\{([\s\S]*?)\}/m)?.[1] ?? '';
  assert.ok(states, 'hover/open rule exists');
  assert.match(states, /background:\s*none;/, 'no fill on hover, focus or open');
  assert.doesNotMatch(states, /accent-dim/);
  assert.match(styles, /\.footer-new\.devices\[aria-expanded="true"\] \.devices-caret \{[^}]*rotate\(180deg\)/);
});
