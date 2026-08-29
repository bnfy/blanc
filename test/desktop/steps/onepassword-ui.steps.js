'use strict';

// F38-2..F38-7 — the 1Password fill UX surfaces (ambient hint + fill-status
// capsule), drivable offline: the hint probe never contacts the broker, and
// the capsule scenarios force kinds through the test hook against the REAL
// surface (view creation, replay, reply IPC). macOS-only like the feature
// itself; other platforms skip.

const assert = require('node:assert/strict');
const { Given, When, Then } = require('@cucumber/cucumber');
const ctx = require('../support/context');

const DARWIN = process.platform === 'darwin';
const SUCCESS_DISMISS_MS = 4000; // fill-status.js's timer; waits use +25%

const readCapsule = (world, script) => world.call('readFillStatusDom', script);

async function capsulePage() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const page = ctx.app.windows().find((candidate) =>
      !candidate.isClosed() && candidate.url() === 'blanc-chrome://fill-status/');
    if (page) return page;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('fill-status capsule page never appeared');
}

async function waitForCapsule(world, selector) {
  const deadline = Date.now() + 5000;
  for (;;) {
    const visible = await readCapsule(world,
      `!document.querySelector('${selector}').hidden`);
    if (visible === true) return;
    if (Date.now() > deadline) throw new Error(`${selector} never became visible`);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

async function activeFillHint(world) {
  const payload = await world.call('serializedTabsPayload');
  const state = await world.state();
  return payload.find((tab) => tab.id === state.activeTabId)?.fillHint === true;
}

async function waitForHint(world, expected) {
  const deadline = Date.now() + 8000;
  for (;;) {
    if (await activeFillHint(world) === expected) return;
    if (Date.now() > deadline) throw new Error(`fill hint never became ${expected}`);
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
}

Given('filling logins from 1Password is configured on this device', async function () {
  if (!DARWIN) return 'skipped';
  await this.call('setOnePasswordConfig', true, 'Acceptance Team');
  return undefined;
});

When('I open a page whose login form authoritatively declares a current-password field', async function () {
  this.hintTabId = await this.call('openTab', `${this.fixtureUrl('login-page')}?loginform=authoritative`);
});

When('I navigate that tab to a page with no login form', async function () {
  await this.call('navigateTab', this.hintTabId, this.fixtureUrl('plain-page'));
});

When('I open a page whose only password field also declares new-password', async function () {
  await this.call('navigateTab', this.hintTabId, `${this.fixtureUrl('signup-page')}?loginform=contradicted`);
});

When('I open a page whose login field is invisible', async function () {
  await this.call('navigateTab', this.hintTabId, `${this.fixtureUrl('hidden-page')}?loginform=invisible`);
});

Then('the island shows the fill hint', async function () {
  await waitForHint(this, true);
});

Then('the fill hint disappears', async function () {
  await waitForHint(this, false);
});

Then('the island never shows the fill hint', async function () {
  // Wait past the load AND the delayed recheck (2.5 s) before concluding.
  await new Promise((resolve) => setTimeout(resolve, 3500));
  assert.equal(await activeFillHint(this), false);
});

// Keyword-agnostic: F38-3 reaches this via When, F38-6 via Given.
When('a fill confirmation question is presented', async function () {
  // Native focus lands on the capsule at presentation; in a long suite run
  // the app window may be backgrounded, so front it FIRST (same rule as the
  // pointer-driven steps) or isFocused() reads false for the whole window.
  await this.call('focusWindow');
  assert.deepEqual(await this.call('showFillStatus', 'confirm-heuristic'), { mode: 'decision' });
  await waitForCapsule(this, '#fillDecision');
});

Then('the capsule is a dialog with initial focus on Cancel', async function () {
  const dom = await readCapsule(this, `(() => ({
    role: document.getElementById('fillDecision').getAttribute('role'),
    focused: document.activeElement?.id ?? null,
  }))()`);
  assert.equal(dom.role, 'dialog');
  assert.equal(dom.focused, 'fillCancelBtn');
  // WebContentsView focus settles asynchronously (the address-bar reclaim
  // dance exists for the same reason) — poll briefly instead of one read.
  const deadline = Date.now() + 3000;
  for (;;) {
    const state = await this.call('fillStatusState');
    if (state.viewFocused === true) return;
    if (Date.now() > deadline) {
      throw new Error('the capsule WebContents never took native focus');
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
});

Then('Tab cycles focus between Cancel and Fill Login', async function () {
  const page = await capsulePage();
  await page.keyboard.press('Tab');
  assert.equal(await readCapsule(this, 'document.activeElement?.id'), 'fillPrimaryBtn');
  await page.keyboard.press('Tab');
  assert.equal(await readCapsule(this, 'document.activeElement?.id'), 'fillCancelBtn');
  await page.keyboard.press('Shift+Tab');
  assert.equal(await readCapsule(this, 'document.activeElement?.id'), 'fillPrimaryBtn');
  await page.keyboard.press('Shift+Tab');
  assert.equal(await readCapsule(this, 'document.activeElement?.id'), 'fillCancelBtn');
});

async function waitForOutcome(world, expected) {
  const deadline = Date.now() + 5000;
  for (;;) {
    const state = await world.call('fillStatusState');
    if (state.lastOutcome === expected && !state.showing && !state.attached) return;
    if (Date.now() > deadline) {
      throw new Error(`decision never resolved as ${expected}; last: ${JSON.stringify(state)}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

Then('pressing Enter with Cancel focused resolves the question as cancelled', async function () {
  // Tab-cycling above ended back on Cancel; a real Enter must activate ONLY
  // the focused button — the safe default, never Fill Login.
  assert.equal(await readCapsule(this, 'document.activeElement?.id'), 'fillCancelBtn');
  const page = await capsulePage();
  await page.keyboard.press('Enter');
  await waitForOutcome(this, 'cancel');
});

Then('pressing Space with Fill Login focused resolves the question as confirmed', async function () {
  const page = await capsulePage();
  await page.keyboard.press('Tab'); // Cancel → Fill Login
  assert.equal(await readCapsule(this, 'document.activeElement?.id'), 'fillPrimaryBtn');
  await page.keyboard.press('Space');
  await waitForOutcome(this, 'primary');
});

Then('pressing Escape cancels the question', async function () {
  const page = await capsulePage();
  await page.keyboard.press('Escape');
  const deadline = Date.now() + 5000;
  for (;;) {
    const state = await this.call('fillStatusState');
    if (!state.showing && !state.attached) return;
    if (Date.now() > deadline) throw new Error('Escape never cancelled the decision');
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
});

When('a no-matching-login notice is presented', async function () {
  assert.deepEqual(await this.call('showFillStatus', 'no-match'), { mode: 'notice' });
  await waitForCapsule(this, '#fillNotice');
});

Then('the notice is announced assertively', async function () {
  const dom = await readCapsule(this, `(() => ({
    role: document.getElementById('fillLive').getAttribute('role'),
    text: document.getElementById('fillLive').textContent,
  }))()`);
  assert.equal(dom.role, 'alert');
  assert.match(dom.text, /No matching login/);
});

Then('the notice is still visible past the auto-dismiss interval', async function () {
  await new Promise((resolve) => setTimeout(resolve, SUCCESS_DISMISS_MS + 1000));
  assert.equal(await readCapsule(this, `!document.getElementById('fillNotice').hidden`), true);
});

When('I dismiss the notice', async function () {
  await readCapsule(this, `document.getElementById('fillNoticeDismiss').click()`);
});

Then('the capsule is gone', async function () {
  const deadline = Date.now() + 5000;
  for (;;) {
    const state = await this.call('fillStatusState');
    if (!state.showing && !state.attached) return;
    if (Date.now() > deadline) throw new Error('capsule never went away');
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
});

Then('the announcement is not retracted', async function () {
  const text = await readCapsule(this, `document.getElementById('fillLive').textContent`);
  assert.match(String(text), /No matching login/,
    'an early dismissal must not retract an unconsumed announcement');
});

When('a filled confirmation is presented', async function () {
  assert.deepEqual(await this.call('showFillStatus', 'filled'), { mode: 'notice' });
  await waitForCapsule(this, '#fillNotice');
});

Then('the confirmation is announced politely', async function () {
  const dom = await readCapsule(this, `(() => ({
    role: document.getElementById('fillLive').getAttribute('role'),
    text: document.getElementById('fillLive').textContent,
  }))()`);
  assert.equal(dom.role, 'status');
  assert.match(dom.text, /Filled from 1Password/,
    'the success announcement must carry the confirmation title');
});

Then('the capsule dismisses itself without any interaction', async function () {
  const deadline = Date.now() + SUCCESS_DISMISS_MS + 3000;
  for (;;) {
    const state = await this.call('fillStatusState');
    if (!state.showing) return;
    if (Date.now() > deadline) throw new Error('success notice never auto-dismissed');
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
});

When('I switch to another tab', async function () {
  const otherId = await this.call('openTab', this.fixtureUrl('other-tab'));
  await this.call('activateTab', otherId, false);
});

When('I hold focus on its dismiss control while hovering and then move the pointer away', async function () {
  // Hover + focus pause independently; releasing only the pointer must not
  // resume the timer while focus still holds (checkpoint-A regression).
  await readCapsule(this, `(() => {
    const notice = document.getElementById('fillNotice');
    notice.dispatchEvent(new Event('mouseenter'));
    document.getElementById('fillNoticeDismiss').focus();
    notice.dispatchEvent(new Event('mouseleave'));
    return true;
  })()`);
});

Then('the confirmation stays visible past the auto-dismiss interval', async function () {
  await new Promise((resolve) => setTimeout(resolve, SUCCESS_DISMISS_MS + 1500));
  assert.equal(await readCapsule(this, `!document.getElementById('fillNotice').hidden`), true,
    'held focus must keep pausing the timer after the pointer leaves');
});
