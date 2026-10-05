const assert = require('node:assert/strict');
const { Given, When, Then } = require('@cucumber/cucumber');

Given('I navigate to a site with an untrusted certificate', async function () {
  this.untrustedCertificateTabId = await this.call('openTab', this.untrustedFixtureUrl('bad-cert'));
  await this.waitForState((state) => state.tabs.some((tab) =>
    tab.id === this.untrustedCertificateTabId &&
    tab.loadedUrl.startsWith('blanc://error/') &&
    tab.loadedUrl.includes('kind=certificate')),
  { timeout: 10_000 });
});

Then('Blanc shows a certificate safety interstitial', async function () {
  const dom = await this.call('executeTab', this.untrustedCertificateTabId, `(() => ({
    title: document.getElementById('errorTitle')?.textContent ?? '',
    detail: document.getElementById('errorDetail')?.textContent ?? '',
    safety: document.getElementById('safetyLink')?.textContent ?? '',
  }))()`);
  assert.equal(dom.title, 'Your connection isn’t private');
  assert.match(dom.detail, /certificate|trusted|identity/i);
  assert.equal(dom.safety, 'Back to safety');
});

Then('the site information reports a certificate problem', async function () {
  const payload = await this.call('serializedTabsPayload');
  const tab = payload.find((entry) => entry.id === this.untrustedCertificateTabId);
  assert.equal(tab?.siteInfo?.state, 'certificate-error');
  assert.equal(tab?.siteInfo?.title, 'Certificate problem');
});

Then('no certificate bypass is offered', async function () {
  const links = await this.call('executeTab', this.untrustedCertificateTabId,
    `[...document.querySelectorAll('a,button')].map((node) => node.textContent.trim())`);
  assert.doesNotMatch(links.join(' '), /proceed|continue|advanced|bypass/i);
});

const ctx = require('../support/context');

async function waitForCertificatePage(world, tabId) {
  await world.waitForState((state) => state.tabs.some((tab) =>
    tab.id === tabId && tab.loadedUrl.startsWith('blanc://error/') && tab.loadedUrl.includes('kind=certificate')),
  { timeout: 10_000 });
}
async function waitForSiteState(world, tabId, expected) {
  const deadline = Date.now() + 10_000;
  for (;;) {
    const payload = await world.call('serializedTabsPayload');
    const state = payload.find((entry) => entry.id === tabId)?.siteInfo?.state;
    if (state === expected) return;
    if (Date.now() > deadline) throw new Error(`tab ${tabId} site state ${state}, expected ${expected}`);
    await new Promise((r) => setTimeout(r, 100));
  }
}
async function continueLocal(world, tabId) {
  await waitForCertificatePage(world, tabId);
  const result = await world.call('continueUnsafeInTab', tabId);
  assert.deepEqual(result, { ok: true });
  await waitForSiteState(world, tabId, 'certificate-exception');
}

Given('I navigate to a local address with an untrusted certificate', async function () {
  this.localTabId = await this.call('openTab', this.localFixtureUrl('local', '?probe=1'));
  await waitForCertificatePage(this, this.localTabId);
  this.untrustedCertificateTabId = this.localTabId; // reuse the interstitial step
});

When('I open Advanced and continue to the local address', async function () {
  const clicked = await this.call('executeTab', this.localTabId, `(() => {
    const toggle = document.querySelector('.advanced-toggle');
    if (!toggle) return 'no-toggle';
    toggle.click();
    const proceed = document.getElementById('continueUnsafe');
    if (!proceed || document.getElementById('advancedPanel').hidden) return 'no-panel';
    if (!/^Continue to nas\\.home\\.arpa:\\d+ \\(unsafe\\)$/.test(proceed.textContent)) return proceed.textContent;
    proceed.click();
    return 'clicked';
  })()`);
  assert.equal(clicked, 'clicked');
});

Then('the local page loads with its same-origin script', async function () {
  await waitForSiteState(this, this.localTabId, 'certificate-exception');
  const loaded = await this.call('executeTab', this.localTabId, 'window.__subresourceLoaded === true');
  assert.equal(loaded, true);
});

Then('the site information reports that I continued past a warning', async function () {
  const payload = await this.call('serializedTabsPayload');
  const tab = payload.find((entry) => entry.id === this.localTabId);
  assert.equal(tab?.siteInfo?.state, 'certificate-exception');
  assert.equal(tab?.siteInfo?.title, 'Not secure');
});

Given('I continued past the warning on the local address', async function () {
  this.localTabId = await this.call('openTab', this.localFixtureUrl('local', '?probe=1'));
  await continueLocal(this, this.localTabId);
});

When('the local address starts presenting a different certificate', function () {
  ctx.localFixtures.handle.setCertificate(ctx.localFixtures.certB);
});

When('I reload the local tab', async function () {
  await this.call('executeTab', this.localTabId, 'location.reload()');
});

Then('Blanc shows a certificate safety interstitial for the local tab', async function () {
  await waitForCertificatePage(this, this.localTabId);
});

Given('two tabs continued past the warning on the local address', async function () {
  this.localTabId = await this.call('openTab', this.localFixtureUrl('one'));
  await continueLocal(this, this.localTabId);
  this.secondLocalTabId = await this.call('openTab', this.localFixtureUrl('two'));
  await waitForSiteState(this, this.secondLocalTabId, 'certificate-exception');
});

When('I stop allowing the local address from the first tab', async function () {
  assert.equal(await this.call('forgetCertificateExceptionInTab', this.localTabId), true);
});

Then('the first tab shows the certificate safety interstitial', async function () {
  await waitForCertificatePage(this, this.localTabId);
});

Then('the second tab still reports that I continued past a warning', async function () {
  const payload = await this.call('serializedTabsPayload');
  assert.equal(payload.find((entry) => entry.id === this.secondLocalTabId)?.siteInfo?.state, 'certificate-exception');
});

When('I reload the second tab', async function () {
  await this.call('executeTab', this.secondLocalTabId, 'location.reload()');
});

Then('the second tab shows the certificate safety interstitial', async function () {
  await waitForCertificatePage(this, this.secondLocalTabId);
});

When('I open the local address in a private tab', async function () {
  this.privateLocalTabId = await this.call('openTab', this.localFixtureUrl('private'), { private: true });
});

Then('the private tab shows the certificate safety interstitial', async function () {
  await waitForCertificatePage(this, this.privateLocalTabId);
});

When('I close the local tab and reopen it straight away', async function () {
  this.closedWebContentsId = await this.call('tabWebContentsId', this.localTabId);
  const closedId = this.localTabId;
  // Loading tabs are never parked (closed-tabs.js holdEligibility); wait
  // for the page to settle so the close exercises the live-view tier.
  await this.waitForState((state) => state.tabs.some((tab) => tab.id === closedId && !tab.isLoading),
    { timeout: 10_000 });
  await this.call('closeTab', closedId);
  const [entry] = await this.call('closedEntriesSummary');
  assert.equal(entry?.held, true, 'the closed tab must be parked as a live view');
  await this.call('reopenClosed');
  // The reopened tab is a new record; find it by its page, not by focus
  // (closing focuses a neighbour before the reopen lands).
  await this.waitForState((state) => state.tabs.some((tab) =>
    tab.id !== closedId && tab.loadedUrl.includes('/site/local')), { timeout: 5_000 });
  const state = await this.call('state');
  this.localTabId = state.tabs.find((tab) => tab.id !== closedId && tab.loadedUrl.includes('/site/local')).id;
});

Then('the reopened tab shows the same page without loading it again', async function () {
  assert.equal(await this.call('tabWebContentsId', this.localTabId), this.closedWebContentsId);
});

Then('the reopened tab still reports that I continued past a warning', async function () {
  await waitForSiteState(this, this.localTabId, 'certificate-exception');
});

When("the local address's choice is evicted", async function () {
  await this.call('setCertificateExceptionCap', 0);
});

Given('I continued past the warning on the lab address', async function () {
  this.labTabId = await this.call('openTab', this.localFixtureUrl('lab-one', '', 'lab.home.arpa'));
  await continueLocal(this, this.labTabId);
});

When('the lab address starts presenting a trusted certificate', function () {
  ctx.localFixtures.handle.setCertificate(ctx.localFixtures.certTrusted);
});

When('I stop allowing the lab address without reloading', async function () {
  assert.equal(await this.call('forgetCertificateExceptionOnly', this.labTabId), true);
});

When('I navigate the lab tab to another page on the same address', async function () {
  const target = this.localFixtureUrl('lab-two', '', 'lab.home.arpa');
  await this.call('executeTab', this.labTabId, `location.href = ${JSON.stringify(target)}`);
});

Then('the lab tab reports a secure connection', async function () {
  await waitForSiteState(this, this.labTabId, 'secure');
});

When('I go back in the lab tab', async function () {
  await this.call('executeTab', this.labTabId, 'history.back()');
});

When('I go forward in the lab tab', async function () {
  await this.call('executeTab', this.labTabId, 'history.forward()');
});

Then('the lab tab still reports that I continued past a warning', async function () {
  await waitForSiteState(this, this.labTabId, 'certificate-exception');
});
