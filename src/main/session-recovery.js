const { PRIMARY_WINDOW_ID, normalizeWindowState } = require('./session-workspace');
const RECOVERY_WINDOW_ID = 'recovery';

function summarizeRecoveryWindows(windows, { newTabUrl = 'blanc://newtab/' } = {}) {
  const normalized = Array.isArray(windows)
    ? windows.map((windowState, index) => normalizeWindowState(
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
  return normalizeWindowState({ id: PRIMARY_WINDOW_ID }, PRIMARY_WINDOW_ID);
}

function recoveryHostWindow() {
  return normalizeWindowState({ id: RECOVERY_WINDOW_ID }, RECOVERY_WINDOW_ID);
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
