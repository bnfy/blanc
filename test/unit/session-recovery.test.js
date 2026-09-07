const assert = require('node:assert/strict');
const test = require('node:test');
const {
  freshRecoveryWindow, recoveryHostWindow, summarizeRecoveryWindows, validRecoveryChoice,
} = require('../../src/main/session-recovery');

test('a lone new tab is disposable but meaningful content and multiple windows recover', () => {
  assert.equal(summarizeRecoveryWindows([{ id: 'primary', urls: ['blanc://newtab/'] }]).hasRecoverableContent, false);
  assert.equal(summarizeRecoveryWindows([{ id: 'primary', urls: ['https://recover.example/'] }]).hasRecoverableContent, true);
  const multiple = summarizeRecoveryWindows([
    { id: 'primary', urls: ['blanc://newtab/'] },
    { id: 'secondary', urls: ['blanc://newtab/'] },
  ]);
  assert.deepEqual(multiple, { tabCount: 2, windowCount: 2, hasRecoverableContent: true });
});

test('fresh and host recovery windows use Personal and distinct ids', () => {
  assert.equal(freshRecoveryWindow().id, 'primary');
  assert.equal(freshRecoveryWindow().profileId, 'default');
  assert.deepEqual(freshRecoveryWindow().urls, []);
  assert.equal(recoveryHostWindow().id, 'recovery');
  assert.equal(validRecoveryChoice('restore'), true);
  assert.equal(validRecoveryChoice('fresh'), true);
  assert.equal(validRecoveryChoice('later'), false);
});
