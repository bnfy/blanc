'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const {
  evaluateAdmission,
  evaluateDocumentVisible,
} = require('../../src/main/display-capture-admission');

const ok = {
  userActivationActive: true,
  displayCaptureAllowed: true,
  documentFocused: true,
  documentVisible: true,
  frameAlive: true,
};

test('all facts true admits', () => {
  assert.deepEqual(evaluateAdmission(ok), { ok: true, reason: null });
});

test('truthy non-true facts fail closed', () => {
  assert.equal(evaluateAdmission({ ...ok, userActivationActive: 1 }).reason, 'activation');
  assert.equal(evaluateAdmission({ ...ok, displayCaptureAllowed: 'true' }).reason, 'policy');
});

test('missing policy API fails closed', () => {
  assert.equal(evaluateAdmission({ ...ok, displayCaptureAllowed: null }).ok, false);
  assert.equal(evaluateAdmission({ ...ok, displayCaptureAllowed: null }).reason, 'policy');
});

test('no transient activation is denied', () => {
  assert.equal(evaluateAdmission({ ...ok, userActivationActive: false }).reason, 'activation');
});

test('background or unfocused document is denied before picker', () => {
  assert.equal(evaluateAdmission({ ...ok, documentFocused: false }).reason, 'focus');
  assert.equal(evaluateAdmission({ ...ok, documentVisible: false }).reason, 'visible');
});

test('dead frame is denied', () => {
  assert.equal(evaluateAdmission({ ...ok, frameAlive: false }).reason, 'frame');
});

test('documentVisible requires an unminimized visible window and attached view', () => {
  assert.equal(evaluateDocumentVisible({
    windowVisible: true,
    windowMinimized: false,
    tabAttached: true,
    frameVisible: true,
  }), true);
  assert.equal(evaluateDocumentVisible({
    windowVisible: false,
    windowMinimized: false,
    tabAttached: true,
    frameVisible: true,
  }), false);
  assert.equal(evaluateDocumentVisible({
    windowVisible: true,
    windowMinimized: true,
    tabAttached: true,
    frameVisible: true,
  }), false);
  assert.equal(evaluateDocumentVisible({
    windowVisible: true,
    windowMinimized: false,
    tabAttached: false,
    frameVisible: true,
  }), false);
  assert.equal(evaluateDocumentVisible({
    windowVisible: true,
    windowMinimized: false,
    tabAttached: true,
    frameVisible: false,
  }), false);
  assert.equal(evaluateDocumentVisible({
    windowVisible: true,
    windowMinimized: false,
    tabAttached: true,
    frameVisible: null,
  }), false);
});
