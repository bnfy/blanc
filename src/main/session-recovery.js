const { PRIMARY_WINDOW_ID, entryFrom } = require('./session-workspace');

const RECOVERY_WINDOW_ID = 'recovery';

function summarizeRecoveryWindows(windows, { newTabUrl = 'blanc://newtab/' } = {}) {
  const normalized = Array.isArray(windows)
    ? windows.map((windowState, index) => entryFrom(
      windowState,
      index === 0 ? PRIMARY_WINDOW_ID : `window-${index + 1}`
    ))
    : [];
  const tabCount = normalized.reduce((total, windowState) => total + windowState.urls.length, 0);
  const meaningfulTabCount = normalized.reduce(
    (total, windowState) => total + windowState.urls.filter((url) => url !== newTabUrl).length,
    0
  );
  return {
    tabCount,
    windowCount: normalized.length,
    hasRecoverableContent: meaningfulTabCount > 0 || normalized.length > 1,
  };
}

function freshRecoveryWindow() {
  return entryFrom({ id: PRIMARY_WINDOW_ID }, PRIMARY_WINDOW_ID);
}

function recoveryHostWindow() {
  return entryFrom({ id: RECOVERY_WINDOW_ID }, RECOVERY_WINDOW_ID);
}

function validRecoveryChoice(value) {
  return value === 'restore' || value === 'fresh';
}

module.exports = {
  RECOVERY_WINDOW_ID,
  freshRecoveryWindow,
  recoveryHostWindow,
  summarizeRecoveryWindows,
  validRecoveryChoice,
};
