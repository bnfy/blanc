'use strict';
// Single source of every fill-capsule string. Served to the capsule renderer
// over blanc-chrome:// AND required by main for the native dialog fallback —
// no other file may define fill-flow copy. Fixed strings only: nothing here
// may ever embed page-, vault-, or account-derived data.
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.blancFillCopy = api;
})(typeof self !== 'undefined' ? self : this, function () {
  const FILL_COPY = Object.freeze({
    'setup-enable': {
      title: 'Set up 1Password',
      body: 'Turn on “Fill logins from 1Password” in Settings. Blanc only reads a matching login when you ask.',
      primaryLabel: 'Open Settings',
      cancelLabel: 'Cancel',
    },
    'setup-account': {
      title: 'Add your 1Password account',
      body: 'Add the email address you sign in to 1Password with, in Settings.',
      primaryLabel: 'Open Settings',
      cancelLabel: 'Cancel',
    },
    'confirm-heuristic': {
      title: 'Fill this login form?',
      body: 'This page didn’t clearly mark its password field. Blanc re-checks the exact fields before filling.',
      primaryLabel: 'Fill Login',
      cancelLabel: 'Cancel',
    },
    busy: { title: '1Password is already open', body: 'Finish or cancel the current request first.' },
    'unsupported-page': { title: 'Open a website first', body: '1Password fill works on HTTP and HTTPS pages.' },
    'page-changed': { title: 'The page changed', body: 'Nothing was filled. Return to the login form and try again.' },
    'no-form': { title: 'No login form found', body: 'Blanc couldn’t find a safe username or password field here.' },
    'no-match': { title: 'No matching login', body: '1Password has no Login item saved for this site.' },
    'empty-login': { title: 'Login has no fillable fields', body: 'The selected item has no username or password value.' },
    'nothing-filled': { title: 'Nothing was filled', body: 'The selected login had no value for the fields Blanc found.' },
    unexpected: { title: '1Password fill stopped', body: 'Nothing was filled. Try again from the login form.' },
    'desktop-unavailable': { title: '1Password isn’t available', body: 'Open the 1Password app and turn on Settings → Developer → Integrate with 1Password SDKs.' },
    'account-not-found': { title: 'Account not found', body: 'Check your 1Password email address in Blanc Settings, then try again.' },
    'not-authorized': { title: '1Password didn’t authorize Blanc', body: 'Unlock 1Password and approve Blanc Browser, then try again.' },
    'session-expired': { title: 'Authorization expired', body: 'Try again to authorize a fresh session.' },
    'timed-out': { title: '1Password timed out', body: 'Nothing was filled. Try again when 1Password is ready.' },
    'broker-stopped': { title: '1Password helper stopped', body: 'Nothing was filled. Try again.' },
    'sdk-error': { title: '1Password couldn’t finish', body: 'Nothing was filled. Check 1Password and try again.' },
    'selection-changed': { title: 'Login changed', body: 'The item changed while the list was open. Nothing was filled.' },
    filled: { title: 'Filled from 1Password', body: '' },
  });
  return { FILL_COPY };
});
