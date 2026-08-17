'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.join(__dirname, '../..');
const newtabJs = fs.readFileSync(path.join(ROOT, 'src/renderer/pages/newtab.js'), 'utf8');
const newtabHtml = fs.readFileSync(path.join(ROOT, 'src/renderer/pages/newtab.html'), 'utf8');

test('the start page loads the shared gate before its own script', () => {
  const gate = newtabHtml.indexOf('type-to-open.js');
  const own = newtabHtml.indexOf('newtab.js');
  assert.ok(gate !== -1, 'newtab.html must load type-to-open.js');
  assert.ok(gate < own, 'the gate must load before newtab.js reads it');
});

test('typing on the start page opens the island', () => {
  const handler = newtabJs.match(
    /document\.addEventListener\('keydown',[\s\S]*?\n\}\);/,
  )?.[0];
  assert.ok(handler, 'no document keydown handler found in newtab.js');
  assert.match(handler, /isTypeToOpenKey/);
  assert.match(handler, /start\.openIsland/);
  assert.match(handler, /preventDefault/);
});

// The onboarding dialog, the footer layout switcher, and any future control
// live in this document. Only keystrokes that reached the body unclaimed are
// ours; anything with a focused control as its target belongs to that control.
test('keystrokes aimed at a control are left alone', () => {
  const handler = newtabJs.match(
    /document\.addEventListener\('keydown',[\s\S]*?\n\}\);/,
  )?.[0];
  assert.match(handler, /e(?:vent)?\.target !== document\.body/);
});

// The target check alone is not enough. The onboarding dialog focuses its
// Continue button on open, so target is that button — but clicking any
// non-focusable part of the dialog puts activeElement back on <body>, and
// typing would then open the island behind the modal.
test('an open modal suppresses type-to-open', () => {
  const handler = newtabJs.match(
    /document\.addEventListener\('keydown',[\s\S]*?\n\}\);/,
  )?.[0];
  assert.match(
    handler,
    /\[role="dialog"\]\[aria-modal="true"\]:not\(\[hidden\]\)/,
    'type-to-open must bail while a modal dialog is open',
  );
  // Matched by role, not by #onboardDialog, so a future modal is covered.
  assert.doesNotMatch(handler, /onboardDialog/);
});

// The markup the guard depends on. If the dialog ever loses aria-modal or
// role, the selector above silently stops matching and the guard is dead.
test('the onboarding dialog still carries the attributes the guard matches', () => {
  assert.match(newtabHtml, /id="onboardDialog"[^>]*role="dialog"/);
  assert.match(newtabHtml, /id="onboardDialog"[^>]*aria-modal="true"/);
});
