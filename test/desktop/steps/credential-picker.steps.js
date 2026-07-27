'use strict';
const { Given, When, Then } = require('@cucumber/cucumber');
const assert = require('node:assert/strict');
const { waitForValue } = require('../support/poll');

const HOSTILE_TITLE = '<img src=x onerror="window.__pwned=1">';
const HOSTILE_USER = '"><script>alert(1)</script>';
const HOSTILE_HOST = '</span><b>x';
const HOSTILE_VAULT = '<img src=y onerror="window.__pwnedVault=1">';

async function startAndRender(world, rows, truncated = 0) {
  await world.call('startCredentialPick', rows, truncated);
  // showOverlay sends overlay:show asynchronously — poll until the rows render.
  await waitForValue(() => world.call('readPickerDom'), (d) => d !== null, 'picker rows to render');
}

When('the credential picker is requested with two rows', async function () {
  await startAndRender(this, [
    { username: 'first@example.test', title: 'Example', host: 'example.test', vaultName: 'Personal' },
    { username: 'second@example.test', title: 'Example', host: 'example.test', vaultName: 'Personal' },
  ]);
});

When('the credential picker is requested with hostile vault strings', async function () {
  // TWO distinct vaults so the .cred-vault element renders and the hostile
  // vaultName is exercised; the hostile strings are on the FIRST row.
  await startAndRender(this, [
    { username: HOSTILE_USER, title: HOSTILE_TITLE, host: HOSTILE_HOST, vaultName: HOSTILE_VAULT },
    { username: 'second@example.test', title: 'Second', host: 'example.test', vaultName: 'Work' },
  ]);
});

Given('the window is 640 by 480', async function () {
  await this.call('setWindowContentSize', 640, 480);
});

When('the credential picker is requested with ten rows', async function () {
  const rows = Array.from({ length: 10 }, (_, i) => ({
    username: `user${i}@example.test`, title: 'Example',
    host: 'secure.example.test', vaultName: 'Personal',
  }));
  // truncated = 8 is the live worst case (accounts.google.com: 18 tier-1 matches,
  // 10 kept, 8 truncated) — so the .cred-more line renders and adds to the height
  // this scenario must keep scrollable.
  await startAndRender(this, rows, 8);
});

When('the second row is clicked', async function () {
  await this.call('clickPickerRow', 1);
});

When('Enter is pressed while the Cancel button has focus', async function () {
  await this.call('pressEnterOnPickerCancel');
});

When('a hidden panel control is clicked while the picker is up', async function () {
  this.guardResult = await this.call('clickHiddenControlInPicker', '#footerSettings');
});

Then('the pick resolves as selected index 1', async function () {
  // The REAL requestPick promise — this only resolves if handleReply accepted
  // the sender and settled. Against the bare-overlayView wiring bug it would
  // hang here and time out.
  const result = await this.call('awaitCredentialPick');
  assert.deepEqual(result, { index: 1, reason: 'selected' });
});

Then('the pick resolves as dismissed', async function () {
  const result = await this.call('awaitCredentialPick');
  assert.deepEqual(result, { index: null, reason: 'dismissed' });
});

Then('the picker row shows them as literal text', async function () {
  const dom = await this.call('readPickerDom');
  assert.ok(dom, 'the picker row must render');
  assert.ok(dom.text.includes(HOSTILE_TITLE), 'the raw markup must appear as visible characters');
  assert.ok(dom.text.includes(HOSTILE_USER));
  this.pickerDom = dom;
});

Then('the hostile vault name renders as literal text', function () {
  assert.ok(this.pickerDom.vaults >= 1, 'the vault element must render (two distinct vaults)');
  assert.ok(this.pickerDom.text.includes(HOSTILE_VAULT), 'the hostile vault name must be literal');
  assert.equal(this.pickerDom.pwnedVault, 'undefined', 'no handler from a hostile vault name may run');
});

Then('the picker row contains no injected elements', function () {
  assert.equal(this.pickerDom.injected, 0, 'no element may be created from vault data');
  assert.equal(this.pickerDom.pwned, 'undefined', 'no injected handler may run');
});

Then('the address bar, footer, and Settings are hidden and unfocusable', async function () {
  const iso = await this.call('readPickerIsolation');
  assert.ok(iso, 'the isolation probe must return');
  for (const key of ['address', 'footer', 'settings']) {
    assert.ok(iso[key].present, `#${key} must exist in the panel`);
    assert.equal(iso[key].shown, false, `${key} must not be displayed in picker mode`);
    assert.equal(iso[key].focusable, false, `${key} must not be focusable in picker mode`);
  }
});

Then('the Cancel button is available', async function () {
  const iso = await this.call('readPickerIsolation');
  assert.ok(iso.cancel.present, 'the picker must render its own Cancel');
  assert.equal(iso.cancel.shown, true, 'Cancel must be visible');
});

Then('the click never reaches the control', function () {
  assert.ok(this.guardResult, 'the guard probe must return');
  assert.equal(this.guardResult.reached, false,
    'the capture-phase guard must stop the click before the target');
});

Then('the last row and Cancel are reachable', async function () {
  const r = await this.call('readPickerReachability');
  assert.ok(r, 'the reachability probe must return');
  assert.equal(r.rows, 10, 'all ten rows must render');
  assert.equal(r.truncationShown, true, 'the truncation line must render (truncated = 8)');
  assert.equal(r.listScrolls, true, 'the content must exceed the cap — otherwise this proves nothing');
  assert.equal(r.cardFitsViewport, true, 'the card must not overflow the 480px viewport');
  assert.equal(r.lastRowReachable, true, 'the last row must be reachable (scrolled into the list)');
  assert.equal(r.cancelReachable, true, 'Cancel must be reachable');
});
