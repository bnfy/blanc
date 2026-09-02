'use strict';

const crypto = require('node:crypto');
const {
  FILL_WORLD_ID,
  buildProbeScript,
  buildInspectScript,
  buildFillScript,
  buildFieldRectScript,
  isValidPickIndex,
  parseWebUrl,
} = require('./onepassword-policy');
const { kindForErrorCode } = require('./fill-status-kinds');
const { pickCredential } = require('./credential-picker');

const nextTurn = () => new Promise((resolve) => setImmediate(resolve));

/** Every message kind this controller can emit through notify()/confirm().
 * The kind-registry test walks this list, so a new emission without copy
 * fails loudly instead of rendering an empty capsule. */
const FILL_REASONS = Object.freeze([
  'busy',
  'setup-enable',
  'setup-account',
  'unsupported-page',
  'page-changed',
  'no-form',
  'confirm-heuristic',
  'no-match',
  'empty-login',
  'nothing-filled',
  'unexpected',
  'filled',
  // Broker/SDK error codes, post kindForErrorCode mapping:
  'desktop-unavailable',
  'account-not-found',
  'not-authorized',
  'session-expired',
  'timed-out',
  'broker-stopped',
  'sdk-error',
  'selection-changed',
]);

function createCredentialFillController({
  broker,
  Menu,
  getSettings,
  captureTarget,
  isTargetCurrent,
  surfaceChanged,
  prepareTarget,
  openSettings,
  notify,
  confirm,
  toWindowPoint,
} = {}) {
  let activeFlow = false;

  /** A rejected await can land AFTER a surface change or navigation — the
   * broker error must never surface under the successor surface or page.
   * Revalidate first: a stale target aborts through currentOrExplain
   * (silent for surface changes, page-changed otherwise); only a current
   * target shows the broker error. Returns the flow's result either way. */
  const failWithError = async (target, error) => {
    if (!isTargetCurrent(target)) {
      await currentOrExplain(target);
      return { ok: false, reason: 'page-changed' };
    }
    await notify(target, kindForErrorCode(error?.code));
    return { ok: false, reason: error?.code ?? 'sdk-error' };
  };

  /** Setup nudges: a decision capsule whose primary verb opens Settings. */
  const setupPrompt = async (target, kind) => {
    if (await confirm(target, kind) === 'primary') openSettings?.();
    return false;
  };

  const currentOrExplain = async (target) => {
    if (isTargetCurrent(target)) return true;
    // Surface-transition aborts are silent — the user chose to leave
    // (⌘L, a sheet, Glance, a tab switch, a permission prompt). Genuine
    // page changes keep their notice.
    if (!surfaceChanged?.(target)) await notify(target, 'page-changed');
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
      await notify(initial, 'busy');
      return { ok: false, reason: 'busy' };
    }
    activeFlow = true;
    try {
      const configured = getSettings();
      if (!configured.onePasswordEnabled) {
        await setupPrompt(initial, 'setup-enable');
        return { ok: false, reason: 'disabled' };
      }
      const account = typeof configured.onePasswordAccount === 'string'
        ? configured.onePasswordAccount.trim()
        : '';
      if (!account) {
        await setupPrompt(initial, 'setup-account');
        return { ok: false, reason: 'missing-account' };
      }
      if (!parseWebUrl(initial.url)) {
        await notify(initial, 'unsupported-page');
        return { ok: false, reason: 'unsupported-page' };
      }

      await prepareTarget(initial);
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
        await notify(initial, 'no-form');
        return { ok: false, reason: 'no-form' };
      }

      // A heuristic password target depends partly on English wording. Ask
      // before authenticating or decrypting anything; authoritative
      // autocomplete=current-password fields need no extra prompt.
      if (inspect.passwordBasis === 'heuristic') {
        if (await confirm(initial, 'confirm-heuristic') !== 'primary') {
          return { ok: false, reason: 'cancelled' };
        }
        if (!await focusAndCheck(initial)) {
          await currentOrExplain(initial);
          return { ok: false, reason: 'page-changed' };
        }
      }

      let found;
      try {
        found = await broker.findLogins(account, initial.url);
      } catch (error) {
        return failWithError(initial, error);
      }
      if (!await focusAndCheck(initial)) {
        await currentOrExplain(initial);
        return { ok: false, reason: 'page-changed' };
      }
      const candidates = Array.isArray(found?.candidates) ? found.candidates : [];
      if (!candidates.length) {
        await notify(initial, 'no-match');
        return { ok: false, reason: 'no-match' };
      }

      let selectedIndex = 0;
      if (candidates.length > 1) {
        // SDK 0.5.0 has no field-projection API. The isolated broker opens only
        // this bounded set and projects each built-in username so repeated,
        // generic item titles remain distinguishable; passwords stay there.
        const rows = candidates.map((candidate) => ({
          title: candidate.title,
          vaultName: candidate.vaultName,
          username: candidate.username,
        }));
        // Geometry has exactly one channel: a live read immediately before
        // the popup — the broker await above can sit in DesktopAuth for many
        // seconds, during which the user may scroll or reflow the page.
        let anchor = initial.pickerPoint ?? { x: 16, y: 68 };
        let geo = null;
        try {
          geo = await initial.webContents.executeJavaScriptInIsolatedWorld(
            FILL_WORLD_ID,
            [{ code: buildFieldRectScript({
              expectedURL: initial.url,
              expectedTimeOrigin: probe.timeOrigin,
              nonce,
            }) }]
          );
        } catch { /* anchor falls back to the island pill — flow unaffected */ }
        // The geometry read is a new await: a navigation or successor
        // surface can land inside it. Re-check before converting or popping,
        // preserving the silent-vs-page-changed classification — never pop a
        // picker over content the user has left.
        if (!await focusAndCheck(initial)) {
          await currentOrExplain(initial);
          return { ok: false, reason: 'page-changed' };
        }
        if (geo?.ok) anchor = toWindowPoint?.(initial, geo.rect) ?? anchor;
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
          itemVersion: selected.itemVersion,
        }, {
          username: inspect.hasUsername,
          password: inspect.hasPassword,
        });
      } catch (error) {
        return failWithError(initial, error);
      }
      if (!await focusAndCheck(initial)) {
        await currentOrExplain(initial);
        return { ok: false, reason: 'page-changed' };
      }
      const username = typeof credential?.username === 'string' ? credential.username : null;
      const password = typeof credential?.password === 'string' ? credential.password : null;
      if (username === null && password === null) {
        await notify(initial, 'empty-login');
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
        await notify(initial, 'nothing-filled');
        return { ok: false, reason: 'nothing-filled' };
      }
      await notify(initial, 'filled');
      return { ok: true, filledUser: !!result.filledUser, filledPass: !!result.filledPass };
    } catch {
      // Same revalidation as the broker catches: an unexpected throw after
      // a surface change or navigation stays silent / page-changed.
      if (!isTargetCurrent(initial)) {
        await currentOrExplain(initial);
        return { ok: false, reason: 'page-changed' };
      }
      await notify(initial, 'unexpected');
      return { ok: false, reason: 'unexpected' };
    } finally {
      activeFlow = false;
    }
  };

  return { fill, isBusy: () => activeFlow };
}

module.exports = { FILL_REASONS, createCredentialFillController };
