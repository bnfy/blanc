'use strict';

const assert = require('node:assert/strict');
const { Given, When, Then } = require('@cucumber/cucumber');
const { waitForValue } = require('../support/poll');

Given('the active page uses plain HTTP', async function () {
  assert.equal(await this.call('setActiveSiteSecurityFixture', 'insecure'), true);
});

Given('the active page uses verified HTTPS', async function () {
  assert.equal(await this.call('setActiveSiteSecurityFixture', 'secure'), true);
});

Then('the resting Island warns that the connection is not secure', async function () {
  const warning = await waitForValue(
    () => this.call('readPillSecurityDom'),
    (value) => value?.hidden === false,
    'resting Island security warning'
  );
  assert.match(warning.title, /not secure/i);
});

When('I open site information', async function () {
  await this.call('openPanel');
  await waitForValue(
    () => this.call('overlayRendererMode'),
    (mode) => mode === 'panel',
    'Island panel to render'
  );
  await waitForValue(
    () => this.call('readSiteInfoDom'),
    (dom) => dom?.buttonHidden === false,
    'site-information button to render'
  );
  assert.equal(await this.call('clickSiteInfoButton'), true);
  await waitForValue(
    () => this.call('readSiteInfoDom'),
    (dom) => dom?.expanded === true && !!dom.title,
    'site-information card to expand'
  );
});

Then('the site-information card explains the unencrypted connection', async function () {
  const dom = await this.call('readSiteInfoDom');
  assert.equal(dom.buttonState, 'insecure');
  assert.equal(dom.title, 'Connection is not secure');
  assert.equal(dom.origin, 'http://plain.example');
  assert.match(dom.summary, /read or changed in transit/);
});

Then('the site-information card identifies an encrypted authenticated connection', async function () {
  const dom = await this.call('readSiteInfoDom');
  assert.equal(dom.buttonState, 'secure');
  assert.equal(dom.title, 'Connection is secure');
  assert.equal(dom.origin, 'https://secure.example');
  assert.match(dom.summary, /Encrypted and authenticated/);
  assert.match(dom.hint, /supplied by Chromium/);
});

Then('it reports Blanc protection activity for that page', async function () {
  const dom = await this.call('readSiteInfoDom');
  assert.equal(dom.protection, 'Blanc blocked 3 requests');
});

Given('the active navigation fails certificate verification', async function () {
  assert.equal(await this.call('showCertificateErrorFixture'), true);
});

Then('Blanc shows a certificate-specific safety interstitial', async function () {
  const dom = await waitForValue(
    () => this.call('readActiveErrorDom'),
    (value) => value?.title === 'Your connection isn’t private',
    'certificate interstitial to render'
  );
  assert.equal(dom.url, 'https://expired.example/');
  assert.match(dom.detail, /expired or not valid yet/);
  assert.match(dom.certificate, /expired\.example/);
  assert.match(dom.certificate, /Acceptance Test Root/);
  assert.ok(dom.links.some((link) => link.text === 'Back to safety'));
});

Then('the interstitial exposes no proceed or visit-anyway action', async function () {
  const dom = await this.call('readActiveErrorDom');
  assert.equal(dom.proceedControls, 0);
  assert.deepEqual(dom.links.map((link) => link.text), ['Try again', 'Back to safety']);
});
