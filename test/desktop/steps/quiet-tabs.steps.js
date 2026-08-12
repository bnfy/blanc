const assert = require('node:assert/strict');
const { Given, When, Then } = require('@cucumber/cucumber');
const { waitForValue } = require('../support/poll');
const { overlayPage, runSlashCommand } = require('../support/overlay');


async function openQuietable(world, name, opts = {}) {
  const query = [opts.withStorage ? '' : 'nostore=1', opts.extraQuery || '']
    .filter(Boolean).join('&');
  const url = `${world.fixtureUrl(name)}${query ? `?${query}` : ''}`;
  const id = await world.call('openTab', url, opts.private ? { private: true } : {});
  await world.waitForState((state) => {
    const tab = state.tabs.find((candidate) => candidate.id === id);
    return tab && !tab.loading && tab.loadedUrl.includes(`/site/${encodeURIComponent(name)}`);
  });
  return { id, url };
}

// F31 — Quiet Tabs. These steps drive the real sleep/wake implementation.
// The process-count assertions are the falsifiability net: a missing view is
// not enough evidence that Electron released the renderer process.

Given('a background tab on a quietable page', async function () {
  const previouslyActive = (await this.state()).activeTabId;
  // The ordinary fixture writes a load counter to sessionStorage, as real
  // sites routinely do. That site-owned storage is not evidence of unsaved
  // user input and must not make Quiet Tabs a fixture-only feature.
  const url = this.fixtureUrl('quietable');
  this.quietCandidateId = await this.call('openTab', url);
  await this.waitForState((state) =>
    (state.tabs.find((tab) => tab.id === this.quietCandidateId)?.loadedUrl || '')
      .includes('quietable'));
  assert.ok(
    await this.call('executeTab', this.quietCandidateId, 'sessionStorage.length') > 0,
    'the regression fixture must contain ordinary site sessionStorage'
  );
  this.sessionStorageBeforeQuiet = Number(await this.call(
    'executeTab', this.quietCandidateId, `sessionStorage.getItem('acceptance-load-count')`
  ));
  // The active tab is never quietable.
  await this.call('activateTab', previouslyActive);
  await this.waitForState((state) => state.activeTabId === previouslyActive);
  this.previouslyActiveId = previouslyActive;
  this.quietCandidateUrl = url;
  this.quietCandidateTitle = 'quietable';
});

Given('a background tab with restorable history and oversized page state', async function () {
  const previous = (await this.state()).activeTabId;
  const opened = await openQuietable(this, 'quiet-history-a');
  this.quietCandidateId = opened.id;
  await this.call('navigateTab', opened.id, `${this.fixtureUrl('quiet-history-b')}?nostore=1`);
  await this.waitForState((state) =>
    state.tabs.find((tab) => tab.id === opened.id)?.loadedUrl.includes('quiet-history-b'));
  await this.call('executeTab', opened.id,
    `history.pushState({payload:'x'.repeat(600000)},'',location.pathname+'?nostore=1&oversized=1'); true`);
  this.expectedHistoryLength = (await this.call('tabNavigation', opened.id)).entries.length;
  this.previouslyActiveId = previous;
  await this.call('activateTab', previous);
});

Given('a background storage-bearing tab with back history', async function () {
  const previous = (await this.state()).activeTabId;
  const firstUrl = this.fixtureUrl('quiet-storage-history-a');
  const secondUrl = this.fixtureUrl('quiet-storage-history-b');
  const id = await this.call('openTab', firstUrl);
  await this.waitForState((state) =>
    state.tabs.find((tab) => tab.id === id)?.loadedUrl.includes('quiet-storage-history-a'));
  await this.call('navigateTab', id, secondUrl);
  await this.waitForState((state) =>
    state.tabs.find((tab) => tab.id === id)?.loadedUrl.includes('quiet-storage-history-b'));
  const navigation = await this.call('tabNavigation', id);
  this.quietCandidateId = id;
  this.storageHistoryIndex = navigation.activeIndex;
  this.storageHistoryBeforeQuiet = Number(await this.call(
    'executeTab', id, `sessionStorage.getItem('acceptance-load-count')`
  ));
  await this.call('activateTab', previous);
});

Given('an active tab on a quietable page', async function () {
  const opened = await openQuietable(this, 'quiet-active');
  this.quietCandidateId = opened.id;
});

Given(/^a background tab protected by (.+)$/, async function (reason) {
  const previous = (await this.state()).activeTabId;
  const name = `protected-${reason.replaceAll(' ', '-')}`;
  let opened;
  if (reason === 'stored beforeunload handler') {
    const url = this.fixtureUrl(name);
    const id = await this.call('openTab', url);
    await this.waitForState((state) => {
      const tab = state.tabs.find((candidate) => candidate.id === id);
      return tab && !tab.loading && tab.loadedUrl.includes(`/site/${encodeURIComponent(name)}`);
    });
    opened = { id, url };
  } else {
    opened = await openQuietable(this, name);
  }
  this.protectedTabId = opened.id;
  this.protectionReason = reason;

  if (reason === 'dirty text') {
    await this.call('executeTab', opened.id,
      `document.getElementById('acceptance-draft').value='unsaved'; true`);
  } else if (reason === 'dirty checkbox') {
    await this.call('executeTab', opened.id,
      `document.getElementById('acceptance-check').checked=true; true`);
  } else if (reason === 'deep scroll') {
    await this.call('executeTab', opened.id, `scrollTo(0, 4000); scrollY`);
  } else if (reason === 'beforeunload objection') {
    assert.equal(await this.call('armBeforeUnloadObjection', opened.id), true);
  } else if (reason === 'stored beforeunload handler') {
    assert.equal(await this.call('executeTab', opened.id,
      `addEventListener('beforeunload',event=>{event.preventDefault();event.returnValue='';});` +
      `sessionStorage.setItem('protected','yes'); true`), true);
  } else if (reason === 'non-refetchable POST') {
    await this.call('executeTab', opened.id,
      `document.getElementById('acceptance-post').requestSubmit(); true`);
    await this.waitForState((state) => {
      const tab = state.tabs.find((candidate) => candidate.id === opened.id);
      return tab && !tab.loading;
    });
  } else {
    assert.equal(await this.call('setQuietProtection', opened.id, reason), true);
  }

  await this.call('activateTab', previous);
  await this.waitForState((state) => state.activeTabId === previous);
});

Given('the tab panel is open', async function () {
  await this.call('openPanel');
  await waitForValue(() => this.call('overlayMode'), (mode) => mode === 'panel', 'panel to open');
});

Given('no background tab can be quieted', async function () {
  const state = await this.state();
  assert.equal(
    state.tabs.filter((tab) => tab.id !== state.activeTabId).length,
    0,
    'the zero-result scenario must begin with no background tabs'
  );
});

Given('two tabs are created through the lazy-restore path', async function () {
  this.restoredIds = [
    await this.call('createQuietTab', `${this.fixtureUrl('restored-a')}?nostore=1`, 'Restored A'),
    await this.call('createQuietTab', `${this.fixtureUrl('restored-b')}?nostore=1`, 'Restored B'),
  ];
  this.savedRestoredId = this.restoredIds[1];
});

Given('a background private tab on a quietable page', async function () {
  const previous = (await this.state()).activeTabId;
  const opened = await openQuietable(this, 'quiet-private', { private: true, withStorage: true });
  this.quietCandidateId = opened.id;
  this.privateStorageBeforeQuiet = Number(await this.call(
    'executeTab', opened.id, `sessionStorage.getItem('acceptance-load-count')`
  ));
  await this.call('activateTab', previous);
});

Given('a quiet tab whose page state contains a unique secret', async function () {
  const previous = (await this.state()).activeTabId;
  const opened = await openQuietable(this, 'quiet-secret');
  this.quietCandidateId = opened.id;
  this.pageStateSecret = `page-state-${Date.now()}-${Math.random()}`;
  await this.call('executeTab', opened.id,
    `history.replaceState({secret:${JSON.stringify(this.pageStateSecret)}},'',location.href); true`);
  await this.call('activateTab', previous);
  assert.equal(await this.call('sleepTab', opened.id), true);
});

Given('the renderer process count is recorded', async function () {
  // Earlier teardown can settle asynchronously. Take a reading only after two
  // matching polls, rather than baking a timing assumption into the assertion.
  let previous = -1;
  this.baselineProcessCount = await waitForValue(
    async () => {
      const now = await this.call('tabProcessCount');
      const stable = now === previous;
      previous = now;
      return stable ? now : null;
    },
    (value) => value !== null,
    'the renderer process count to settle'
  );
});

When('I quiet that background tab', async function () {
  const quieted = await this.call('sleepTab', this.quietCandidateId);
  assert.equal(quieted, true, 'sleepTab refused to quiet the tab');
});

When('I activate that quiet tab', async function () {
  await this.call('activateTab', this.quietCandidateId);
});

When('I quiet it and wake its previous history entry', async function () {
  assert.equal(await this.call('sleepTab', this.quietCandidateId), true);
  assert.equal(await this.call(
    'wakeTabAtIndex', this.quietCandidateId, this.storageHistoryIndex - 1
  ), true);
});

When('I wake it through a redirect and activate it', async function () {
  await this.call('activateTab', this.quietCandidateId);
  await waitForValue(
    () => this.call('sleepState', this.quietCandidateId),
    (state) => state?.asleep === false,
    'plain history wake'
  );
  this.historyAfterWake = await this.call('tabNavigation', this.quietCandidateId);

  await this.call('activateTab', this.previouslyActiveId);
  assert.equal(await this.call('sleepTab', this.quietCandidateId), true);
  const redirect = `${this.fixtureUrl('quiet-redirect')}?nostore=1&redirect-start=1`;
  assert.equal(await this.call('wakeTab', this.quietCandidateId, redirect), true);
  await this.call('activateTab', this.quietCandidateId);
  await this.waitForState((state) =>
    state.tabs.find((tab) => tab.id === this.quietCandidateId)?.loadedUrl.includes('redirected=1'));
});

When('every quiet path is asked to quiet the active tab', async function () {
  this.directActiveSleep = await this.call('sleepTab', this.quietCandidateId);
  this.manualQuieted = await this.call('sleepBackgroundTabsNow');
  await this.call('setSleepThresholdOverride', 0);
  this.sweepResult = await this.call('runSleepSweep');
});

When('I ask Blanc to quiet the protected tab', async function () {
  this.protectedQuieted = await this.call('sleepBackgroundTabsNow');
});

When('I run the manual sleep command', async function () {
  // Type it and press Enter, exactly as a person would. Driving
  // sleepBackgroundTabsNow directly leaves the input empty, which is the one
  // state in which the panel happens to be showing the tab rows.
  await runSlashCommand(this, '/sleep');
  if (this.quietCandidateId) {
    await this.waitForState((state) =>
      state.tabs.find((candidate) => candidate.id === this.quietCandidateId)?.asleep === true);
  }
});

When('I show the vertical tab rail and panel', async function () {
  await this.call('setTabLayout', 'vertical');
  await this.call('openPanel');
  await waitForValue(() => this.call('overlayMode'), (mode) => mode === 'panel', 'panel to open');
});

When('I choose the quiet delay {word}', async function (delay) {
  this.selectedDelay = delay;
  await this.call('setTabSleep', delay);
});

When('I activate the saved restored tab', async function () {
  await this.call('activateTab', this.savedRestoredId);
  await this.waitForState((state) =>
    state.activeTabId === this.savedRestoredId &&
    state.tabs.find((tab) => tab.id === this.savedRestoredId)?.webContentsId !== null &&
    state.tabs.find((tab) => tab.id === this.savedRestoredId)?.asleep === false);
});

Then('that tab is quiet', async function () {
  const state = await this.call('sleepState', this.quietCandidateId);
  assert.ok(state, 'no sleep state for the tab');
  assert.equal(state.asleep, true);
  assert.equal(state.hasSnapshot, true, 'a quiet tab must retain its snapshot');
  assert.ok(state.entryCount >= 1, `expected a retained entry, got ${state.entryCount}`);
});

Then('that tab is quiet with oversized page state dropped', async function () {
  const state = await this.call('sleepState', this.quietCandidateId);
  assert.equal(state?.asleep, true);
  assert.equal(state?.droppedPageState, true);
});

Then('the same tab is functional with its address and back history intact', async function () {
  assert.ok(this.historyAfterWake.entries.length >= this.expectedHistoryLength,
    `history shrank from ${this.expectedHistoryLength} to ${this.historyAfterWake.entries.length}`);
  const state = await this.state();
  const tab = state.tabs.find((candidate) => candidate.id === this.quietCandidateId);
  assert.ok(tab.loadedUrl.includes('redirected=1'));
  assert.equal(await this.call('executeTab', this.quietCandidateId, '6 * 7'), 42);
});

Then('the previous page and session storage are intact', async function () {
  const state = await this.waitForState((snapshot) => {
    const tab = snapshot.tabs.find((candidate) => candidate.id === this.quietCandidateId);
    return tab?.asleep === false && tab.loadedUrl.includes('quiet-storage-history-a');
  });
  assert.ok(state.tabs.find((tab) => tab.id === this.quietCandidateId));
  const after = Number(await this.call(
    'executeTab', this.quietCandidateId, `sessionStorage.getItem('acceptance-load-count')`
  ));
  assert.equal(after, this.storageHistoryBeforeQuiet + 1);
});

Then('the active tab remains awake', async function () {
  assert.equal(this.directActiveSleep, false);
  assert.equal(this.manualQuieted.includes(this.quietCandidateId), false);
  assert.equal(this.sweepResult.quieted.includes(this.quietCandidateId), false);
  assert.equal((await this.call('sleepState', this.quietCandidateId)).asleep, false);
});

Then('the protected tab remains awake and functional', async function () {
  assert.equal(this.protectedQuieted.includes(this.protectedTabId), false, this.protectionReason);
  assert.equal((await this.call('sleepState', this.protectedTabId)).asleep, false);
  if (this.protectionReason === 'beforeunload objection') {
    // The Playwright CDP transport auto-handles beforeunload dialogs and can
    // race Electron's will-prevent-unload event. Verify product functionality
    // without touching that transport: the ordinary listener set must have
    // been rewired onto the same live webContents after the aborted close.
    const listeners = await this.call('tabListenerState', this.protectedTabId);
    const probe = await this.call('beforeUnloadProbe', this.protectedTabId);
    assert.equal(probe?.fired, true, 'will-prevent-unload was not observed');
    assert.equal(probe?.prevented, false,
      'calling preventDefault would override the page objection and destroy it');
    assert.ok(listeners?.didNavigate > 0, 'navigation listeners were not restored');
    assert.ok(listeners?.title > 0, 'title listeners were not restored');
    assert.ok(listeners?.input > 0, 'shortcut listeners were not restored');
    return;
  }
  assert.equal(await this.call('executeTab', this.protectedTabId, '20 + 22'), 42,
    `${this.protectionReason} left the tab unwired`);
});

Then('the panel stays open and names the row quiet', async function () {
  assert.equal(await this.call('overlayMode'), 'panel');
  // The rows must be what the panel is actually showing. If the command left
  // its own text in the input, this list is slash commands and the candidate
  // is absent — which is precisely the bug this scenario now catches.
  const rows = await this.call('addressResultRows');
  const row = rows.find((candidate) => candidate.title === this.quietCandidateTitle);
  assert.ok(row, 'quiet candidate missing from panel');
  assert.equal(row.quiet, true);
  assert.match(row.label.toLowerCase(), /quiet/);
});

Then('the panel stays open and explains that no tab can be quieted', async function () {
  assert.equal(await this.call('overlayMode'), 'panel');
  const notice = await waitForValue(
    () => this.call('addressCommandNotice'),
    (value) => value?.text === 'No background tabs can be quieted right now.',
    'the zero-result sleep notice'
  );
  assert.equal(notice.role, 'status');
});

Then('the panel and rail expose a distinct quiet state', async function () {
  const chrome = await this.call('quietChromeState', this.quietCandidateTitle, this.quietCandidateId);
  // The state is appended to an accessible name as ", quiet". Match THAT, not a
  // bare /quiet/ — the fixture tab is titled "quietable", whose substring would
  // give a false positive/negative on the bare pattern.
  // The pill dot deliberately carries NO quiet state — neither the visual nor
  // the accessible name. Quiet lives only on the row-level dim.
  assert.equal(chrome.dotQuiet, false);
  assert.doesNotMatch(chrome.dotLabel.toLowerCase(), /,\s*quiet/);
  // Rail: the quiet class (which carries the dim) and the ", quiet" suffix.
  assert.equal(chrome.railQuiet, true);
  assert.equal(chrome.railPrivate, false);
  assert.match(chrome.railLabel.toLowerCase(), /,\s*quiet/);
  // Panel row: the quiet class and the accessible name says ", quiet".
  const rows = await this.call('addressResultRows');
  const row = rows.find((candidate) => candidate.title === this.quietCandidateTitle);
  assert.equal(row?.quiet, true);
  assert.match(row?.label.toLowerCase(), /,\s*quiet/);
});

Then('both quiet rows are dimmed at rest and render identically', async function () {
  // Park the pointer clear before reading. The suite shares one Electron
  // instance across scenarios (BeforeAll), and earlier scenarios move the OS
  // pointer with Playwright hover/mouse actions — so a tab row could still be
  // under the pointer from a prior scenario, faking or masking :hover (which
  // now RESTORES full opacity and would hide the dim under test). Hovering
  // #addressInput (in .panel-row, never a tab row) establishes the at-rest
  // state deterministically. .hover() only moves the mouse; it does not click,
  // so it neither steals focus from the address input nor dismisses the panel.
  const page = await overlayPage();
  await page.hover('#addressInput');

  const result = await this.call('quietRowDimStyles', this.quietCandidateId);

  // A missing row / missing .quiet class / display:none / visibility:hidden
  // anywhere up EITHER chain comes back as an { error }.
  assert.ok(!result.panel.error, `panel row: ${result.panel.error}`);
  assert.ok(!result.rail.error, `rail row: ${result.rail.error}`);

  // The panel row is at rest — not hovered, not focused — so the value read is
  // the resting dim, not the hover-restored full strength.
  assert.equal(result.panel.hovered, false, 'panel row must not be hovered');
  assert.equal(result.panel.focused, false, 'panel row must not be focused');

  // The dim is real on both surfaces: visibly reduced, never invisible.
  const panelDim = parseFloat(result.panel.rowOpacity);
  const railDim = parseFloat(result.rail.rowOpacity);
  assert.ok(panelDim > 0 && panelDim < 1, `panel row opacity must dim (got ${result.panel.rowOpacity})`);
  assert.ok(railDim > 0 && railDim < 1, `rail row opacity must dim (got ${result.rail.rowOpacity})`);

  // No transparent ancestor fakes or hides the dim.
  assert.ok(result.panel.ancestorOpacity > 0, 'panel row ancestors must not be transparent');
  assert.ok(result.rail.ancestorOpacity > 0, 'rail row ancestors must not be transparent');

  // Both have a real laid-out box.
  assert.ok(result.panel.rectWidth > 0 && result.panel.rectHeight > 0, 'panel row must have a non-zero box');
  assert.ok(result.rail.rectWidth > 0 && result.rail.rectHeight > 0, 'rail row must have a non-zero box');

  // They agree: one dim strength across both surfaces.
  assert.equal(result.panel.rowOpacity, result.rail.rowOpacity, 'dim strengths must match');
});

Then('the quiet delay reads back as {word}', async function (delay) {
  assert.equal(await this.call('tabSleep'), delay);
});

Then('choosing Off has not woken the quiet tab', async function () {
  assert.equal((await this.call('sleepState', this.quietCandidateId)).asleep, true);
});

Then('both restored tabs are quiet and viewless', async function () {
  const state = await this.state();
  for (const id of this.restoredIds) {
    const tab = state.tabs.find((candidate) => candidate.id === id);
    assert.equal(tab?.asleep, true);
    assert.equal(tab?.webContentsId, null);
  }
});

Then('only the selected restored tab has a live web contents', async function () {
  const state = await this.state();
  const selected = state.tabs.find((tab) => tab.id === this.savedRestoredId);
  const other = state.tabs.find((tab) => tab.id === this.restoredIds[0]);
  assert.equal(selected.asleep, false);
  assert.ok(selected.webContentsId);
  assert.equal(other.asleep, true);
  assert.equal(other.webContentsId, null);
});

Then('the private tab is awake in the private session', async function () {
  const state = await this.waitForState((snapshot) => {
    const tab = snapshot.tabs.find((candidate) => candidate.id === this.quietCandidateId);
    return tab?.asleep === false && tab.loadedUrl.includes('quiet-private');
  });
  const tab = state.tabs.find((candidate) => candidate.id === this.quietCandidateId);
  assert.equal(tab.sessionKind, 'private');
  assert.equal(tab.sessionPersistent, false);
  const after = Number(await this.call(
    'executeTab', this.quietCandidateId, `sessionStorage.getItem('acceptance-load-count')`
  ));
  assert.equal(after, this.privateStorageBeforeQuiet + 1,
    'private sessionStorage must survive without entering a snapshot');
});

Then('the secret is absent from session persistence, tab sync, and tabs updated', async function () {
  const surfaces = [
    await this.call('persistedSessionData'),
    await this.call('sessionSyncSnapshot'),
    await this.call('serializedTabsPayload'),
  ];
  for (const surface of surfaces) {
    assert.equal(JSON.stringify(surface).includes(this.pageStateSecret), false);
  }
  assert.equal((await this.call('sleepState', this.quietCandidateId)).hasSnapshot, true,
    'the secret-bearing recovery snapshot must still exist only in main memory');
});

Then('that tab is awake', async function () {
  await waitForValue(
    () => this.call('sleepState', this.quietCandidateId),
    (state) => state && state.asleep === false && state.hasSnapshot === false,
    'the tab to finish waking and release its snapshot'
  );
});

Then('its session storage survived the quiet reload', async function () {
  const after = Number(await this.call(
    'executeTab', this.quietCandidateId, `sessionStorage.getItem('acceptance-load-count')`
  ));
  assert.equal(after, this.sessionStorageBeforeQuiet + 1,
    'a fresh namespace would restart the load counter at 1');
});

Then('the renderer process count has dropped by {int}', async function (count) {
  await waitForValue(
    () => this.call('tabProcessCount'),
    (now) => now === this.baselineProcessCount - count,
    `the renderer process count to drop from ${this.baselineProcessCount} by ${count}`
  );
});

Then('the renderer process count has returned to what it was', async function () {
  await waitForValue(
    () => this.call('tabProcessCount'),
    (now) => now === this.baselineProcessCount,
    `the renderer process count to return to ${this.baselineProcessCount}`
  );
});
