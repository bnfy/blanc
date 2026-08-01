const assert = require('node:assert/strict');
const test = require('node:test');
const {
  freshRecoveryWindow,
  recoveryHostWindow,
  summarizeRecoveryWindows,
  validRecoveryChoice,
} = require('../../src/main/session-recovery');

test('recovery summary counts saved tabs and treats a lone new tab as disposable', () => {
  assert.deepEqual(summarizeRecoveryWindows([{
    id: 'primary',
    urls: ['blanc://newtab/'],
  }]), {
    tabCount: 1,
    windowCount: 1,
    hasRecoverableContent: false,
  });

  assert.deepEqual(summarizeRecoveryWindows([{
    id: 'primary',
    urls: ['blanc://newtab/', 'https://recover.example/'],
  }]), {
    tabCount: 2,
    windowCount: 1,
    hasRecoverableContent: true,
  });
});

test('multiple saved windows are recoverable even when they contain only new tabs', () => {
  const summary = summarizeRecoveryWindows([
    { id: 'primary', urls: ['blanc://newtab/'] },
    { id: 'secondary', urls: ['blanc://newtab/'] },
  ]);

  assert.equal(summary.windowCount, 2);
  assert.equal(summary.tabCount, 2);
  assert.equal(summary.hasRecoverableContent, true);
});

test('fresh recovery always resolves to an empty Personal primary workspace', () => {
  assert.deepEqual(freshRecoveryWindow(), {
    id: 'primary',
    profileId: 'default',
    urls: [],
    activeIndex: 0,
    groups: [],
    groupIds: [],
    pinned: [],
  });
  assert.equal(validRecoveryChoice('restore'), true);
  assert.equal(validRecoveryChoice('fresh'), true);
  assert.equal(validRecoveryChoice('later'), false);
});

test('the recovery UI uses a neutral ephemeral runtime id', () => {
  assert.deepEqual(recoveryHostWindow(), {
    id: 'recovery',
    profileId: 'default',
    urls: [],
    activeIndex: 0,
    groups: [],
    groupIds: [],
    pinned: [],
  });
});
