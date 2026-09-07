const assert = require('node:assert/strict');
const { Given, Then } = require('@cucumber/cucumber');

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
