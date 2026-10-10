// Electron 41.5+ can back WebAuthn platform-authenticator requests with the
// Mac's Secure Enclave. The configured group — even the app's own
// TeamID.BundleID — must also appear in the app's keychain-access-groups
// code-signing entitlement (no implicit exemption: Electron's TouchId docs
// say "must", and hardware testing confirms AMFI SIGKILLs at spawn without
// it). That's a restricted entitlement, so packaged builds embed a Developer
// ID provisioning profile that authorizes it (build/embedded.provisionprofile,
// wired via build.mac.provisioningProfile). Main app only: helpers can't
// carry a profile, so the inherit entitlements must never list the group.
const { APP_ID: BUNDLE_ID } = require('./app-identity');

const APPLE_TEAM_ID = 'XYGUCY4498';
const WEBAUTHN_KEYCHAIN_ACCESS_GROUP = `${APPLE_TEAM_ID}.${BUNDLE_ID}`;

function accountLabel(account, index, t) {
  const label = account?.displayName || account?.name;
  return typeof label === 'string' && label.trim() ? label.trim() : t('passkey.fallbackLabel', { number: index + 1 });
}

// `t` is the interface translator for the picker.
async function chooseWebAuthnAccount({ dialog, getParentWindow, details, t }) {
  const accounts = Array.isArray(details?.accounts) ? details.accounts : [];
  if (!accounts.length) return undefined;

  const relyingPartyId = typeof details?.relyingPartyId === 'string' && details.relyingPartyId
    ? details.relyingPartyId
    : '';
  const buttons = accounts.map((account, index) => accountLabel(account, index, t));
  const cancelId = buttons.length;
  buttons.push(t('common.cancel'));

  const options = {
    type: 'question',
    title: t('passkey.title'),
    message: relyingPartyId ? t('passkey.message', { site: relyingPartyId }) : t('passkey.messageNoSite'),
    detail: t('passkey.detail'),
    buttons,
    cancelId,
    noLink: true,
  };
  const parent = getParentWindow?.() || null;
  const { response } = parent
    ? await dialog.showMessageBox(parent, options)
    : await dialog.showMessageBox(options);

  return response >= 0 && response < accounts.length
    ? accounts[response].credentialId
    : undefined;
}

/**
 * Enables Electron's native macOS Touch ID platform authenticator and supplies
 * the required account chooser for discoverable credentials.
 *
 * This deliberately does not request Apple's browser passkey entitlement: that
 * separate managed capability is required for iCloud/credential-provider
 * passkeys, while this feature stores device-bound passkeys in Blanc's own
 * Secure Enclave access group.
 *
 * Electron seals credential metadata with a per-session secret kept in the
 * session's prefs, so the in-memory private session mints a fresh secret every
 * launch: passkeys created in private tabs become unusable once Blanc quits,
 * and normal-profile passkeys stay invisible to private tabs (spec D16).
 * The access group itself is app-global — Electron offers no per-session
 * opt-out, so private-tab ceremonies can't be selectively disabled.
 */
function setupWebAuthn({ app, session, dialog, getParentWindow, t, platform = process.platform }) {
  if (platform !== 'darwin' || typeof app?.configureWebAuthn !== 'function') return false;

  try {
    app.configureWebAuthn({
      touchID: { keychainAccessGroup: WEBAUTHN_KEYCHAIN_ACCESS_GROUP },
    });
  } catch (error) {
    // An unsigned dev build has no keychain-access-groups entitlement. Keep
    // normal browser startup working there; signed releases surface the API.
    console.warn('Unable to enable Touch ID WebAuthn:', error.message);
    return false;
  }

  const sessions = Array.isArray(session) ? session : [session];
  for (const targetSession of sessions) {
    targetSession.on('select-webauthn-account', (_event, details, callback) => {
      let resolved = false;
      const finish = (credentialId) => {
        if (resolved) return;
        resolved = true;
        if (typeof credentialId === 'string' && credentialId) callback(credentialId);
        else callback(); // No argument cancels the request with NotAllowedError.
      };

      chooseWebAuthnAccount({ dialog, getParentWindow, details, t })
        .then(finish)
        .catch((error) => {
          console.warn('Unable to choose a WebAuthn account:', error.message);
          finish();
        });
    });
  }

  return true;
}

module.exports = {
  WEBAUTHN_KEYCHAIN_ACCESS_GROUP,
  accountLabel,
  chooseWebAuthnAccount,
  setupWebAuthn,
};
