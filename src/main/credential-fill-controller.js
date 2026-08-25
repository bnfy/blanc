'use strict';

const crypto = require('node:crypto');
const {
  FILL_WORLD_ID,
  buildProbeScript,
  buildInspectScript,
  buildFillScript,
  isValidPickIndex,
  parseWebUrl,
} = require('./onepassword-policy');
const { pickCredential } = require('./credential-picker');

const nextTurn = () => new Promise((resolve) => setImmediate(resolve));

const ERROR_COPY = Object.freeze({
  'desktop-unavailable': [
    '1Password isn’t available',
    'Install or open the 1Password desktop app. In 1Password Settings → Developer, turn on Integrate with 1Password SDKs.',
  ],
  'account-not-found': [
    '1Password account not found',
    'Check the account name or account ID in Blanc Settings, then try again.',
  ],
  'not-authorized': [
    '1Password didn’t authorize Blanc',
    'Unlock 1Password and approve the Blanc Browser integration, then try again.',
  ],
  'session-expired': [
    '1Password authorization expired',
    'Try again to authorize a fresh session.',
  ],
  'timed-out': [
    '1Password timed out',
    'No credential data was filled. Try again when the 1Password app is ready.',
  ],
  'broker-unavailable': [
    '1Password helper stopped',
    'No credential data was filled. Try again.',
  ],
  'broker-stopped': [
    '1Password helper stopped',
    'No credential data was filled. Try again.',
  ],
  'sdk-error': [
    '1Password couldn’t complete the request',
    'No credential data was filled. Check 1Password and try again.',
  ],
});

function createCredentialFillController({
  broker,
  Menu,
  dialog,
  getSettings,
  captureTarget,
  isTargetCurrent,
  prepareTarget,
  openSettings,
} = {}) {
  let activeFlow = false;

  const message = async (target, title, body, type = 'info') => {
    if (!target?.window || target.window.isDestroyed?.()) return;
    await dialog.showMessageBox(target.window, {
      type,
      title,
      message: title,
      detail: body,
      buttons: ['OK'],
      defaultId: 0,
      cancelId: 0,
      noLink: true,
    });
  };

  const setupPrompt = async (target, body) => {
    if (!target?.window || target.window.isDestroyed?.()) return false;
    const { response } = await dialog.showMessageBox(target.window, {
      type: 'info',
      title: 'Set up 1Password',
      message: 'Set up 1Password in Blanc',
      detail: body,
      buttons: ['Open Settings', 'Cancel'],
      defaultId: 0,
      cancelId: 1,
      noLink: true,
    });
    if (response === 0) openSettings?.();
    return false;
  };

  const showFixedError = async (target, error) => {
    const [title, body] = ERROR_COPY[error?.code] ?? ERROR_COPY['sdk-error'];
    await message(target, title, body, 'warning');
  };

  const currentOrExplain = async (target) => {
    if (isTargetCurrent(target)) return true;
    await message(target, 'The page changed',
      'Blanc stopped before filling anything. Return to the login form and try again.');
    return false;
  };

  const focusAndCheck = async (target) => {
    if (!isTargetCurrent(target)) return false;
    target.webContents.focus();
    await nextTurn();
    return isTargetCurrent(target);
  };

  const fill = async (runtime) => {
    const initial = captureTarget(runtime);
    if (!initial) return { ok: false, reason: 'no-active-page' };
    if (activeFlow) {
      await message(initial, '1Password is already open',
        'Finish or cancel the current 1Password request before starting another.');
      return { ok: false, reason: 'busy' };
    }
    activeFlow = true;
    try {
      const configured = getSettings();
      if (!configured.onePasswordEnabled) {
        await setupPrompt(initial,
          'Turn on “Fill logins from 1Password” under Privacy & Security. Blanc only reads a matching login when you invoke Fill.');
        return { ok: false, reason: 'disabled' };
      }
      const account = typeof configured.onePasswordAccount === 'string'
        ? configured.onePasswordAccount.trim()
        : '';
      if (!account) {
        await setupPrompt(initial,
          'Add the 1Password account name shown at the top of the 1Password sidebar, or its account ID.');
        return { ok: false, reason: 'missing-account' };
      }
      if (!parseWebUrl(initial.url)) {
        await message(initial, 'Open a website first',
          '1Password login fill is available only on HTTP or HTTPS pages.');
        return { ok: false, reason: 'unsupported-page' };
      }

      await prepareTarget(runtime);
      if (!await focusAndCheck(initial)) {
        await currentOrExplain(initial);
        return { ok: false, reason: 'page-changed' };
      }

      const probe = await initial.webContents.executeJavaScriptInIsolatedWorld(
        FILL_WORLD_ID, [{ code: buildProbeScript() }]
      );
      if (!isTargetCurrent(initial) || probe?.url !== initial.url || !probe?.focused
          || !Number.isFinite(probe?.timeOrigin)) {
        await currentOrExplain(initial);
        return { ok: false, reason: 'page-changed' };
      }
      const nonce = crypto.randomBytes(24).toString('base64url');
      const inspect = await initial.webContents.executeJavaScriptInIsolatedWorld(
        FILL_WORLD_ID,
        [{ code: buildInspectScript({
          expectedURL: initial.url,
          expectedTimeOrigin: probe.timeOrigin,
          nonce,
        }) }]
      );
      if (!isTargetCurrent(initial) || inspect?.originMismatch) {
        await currentOrExplain(initial);
        return { ok: false, reason: 'page-changed' };
      }
      if (!inspect?.hasPassword && !inspect?.hasUsername) {
        await message(initial, 'No login form found',
          'Blanc couldn’t identify a safe username or current-password field on this page.');
        return { ok: false, reason: 'no-form' };
      }

      // A heuristic password target depends partly on English wording. Ask
      // before authenticating or decrypting anything; authoritative
      // autocomplete=current-password fields need no extra prompt.
      if (inspect.passwordBasis === 'heuristic') {
        const { response } = await dialog.showMessageBox(initial.window, {
          type: 'question',
          title: 'Confirm login form',
          message: 'Fill the detected login form?',
          detail: 'This page did not explicitly identify its current-password field. Blanc will re-check the exact fields before filling.',
          buttons: ['Fill Login', 'Cancel'],
          defaultId: 1,
          cancelId: 1,
          noLink: true,
        });
        if (response !== 0) return { ok: false, reason: 'cancelled' };
        if (!await focusAndCheck(initial)) {
          await currentOrExplain(initial);
          return { ok: false, reason: 'page-changed' };
        }
      }

      let found;
      try {
        found = await broker.findLogins(account, initial.url);
      } catch (error) {
        await showFixedError(initial, error);
        return { ok: false, reason: error?.code ?? 'sdk-error' };
      }
      if (!await focusAndCheck(initial)) {
        await currentOrExplain(initial);
        return { ok: false, reason: 'page-changed' };
      }
      const candidates = Array.isArray(found?.candidates) ? found.candidates : [];
      if (!candidates.length) {
        await message(initial, 'No matching login',
          '1Password has no Login item whose saved website permits filling on this page.');
        return { ok: false, reason: 'no-match' };
      }

      let selectedIndex = 0;
      if (candidates.length > 1) {
        // v0.5.0 has no field-projection API: items.get() materializes the
        // complete item. Keep candidate selection metadata-only and decrypt
        // exactly one item after the user chooses it.
        const rows = candidates.map((candidate) => ({
          title: candidate.title,
          vaultName: candidate.vaultName,
        }));
        const anchor = initial.pickerPoint ?? { x: 16, y: 64 };
        selectedIndex = await pickCredential({
          Menu, window: initial.window, rows, point: anchor,
        });
        if (!isValidPickIndex(selectedIndex, candidates.length)) selectedIndex = null;
        if (selectedIndex === null) return { ok: false, reason: 'cancelled' };
        if (!await focusAndCheck(initial)) {
          await currentOrExplain(initial);
          return { ok: false, reason: 'page-changed' };
        }
      }

      const selected = candidates[selectedIndex];
      let credential;
      try {
        credential = await broker.revealCredential(account, {
          vaultId: selected.vaultId,
          itemId: selected.itemId,
        }, {
          username: inspect.hasUsername,
          password: inspect.hasPassword,
        });
      } catch (error) {
        await showFixedError(initial, error);
        return { ok: false, reason: error?.code ?? 'sdk-error' };
      }
      if (!await focusAndCheck(initial)) {
        await currentOrExplain(initial);
        return { ok: false, reason: 'page-changed' };
      }
      const username = typeof credential?.username === 'string' ? credential.username : null;
      const password = typeof credential?.password === 'string' ? credential.password : null;
      if (username === null && password === null) {
        await message(initial, 'Login has no fillable fields',
          'The selected item has no built-in username or password value.');
        return { ok: false, reason: 'empty-login' };
      }

      const result = await initial.webContents.executeJavaScriptInIsolatedWorld(
        FILL_WORLD_ID,
        [{ code: buildFillScript({
          expectedURL: initial.url,
          expectedTimeOrigin: probe.timeOrigin,
          username: inspect.hasUsername ? username : null,
          password: inspect.hasPassword ? password : null,
          nonce,
        }) }],
        true
      );
      credential = null;
      if (!isTargetCurrent(initial) || result?.originMismatch || result?.selectionChanged) {
        await currentOrExplain(initial);
        return { ok: false, reason: 'page-changed' };
      }
      if (!result?.filledUser && !result?.filledPass) {
        await message(initial, 'Nothing was filled',
          'The selected login did not contain a value for the safe fields Blanc found.');
        return { ok: false, reason: 'nothing-filled' };
      }
      return { ok: true, filledUser: !!result.filledUser, filledPass: !!result.filledPass };
    } catch {
      await message(initial, '1Password fill stopped',
        'No credential data was filled. Return to the login form and try again.', 'warning');
      return { ok: false, reason: 'unexpected' };
    } finally {
      activeFlow = false;
    }
  };

  return { fill, isBusy: () => activeFlow };
}

module.exports = { ERROR_COPY, createCredentialFillController };
