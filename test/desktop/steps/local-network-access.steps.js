'use strict';

// F13 — Local Network Access (spec docs/superpowers/specs/2026-11-17-local-network-access-design.md).
// "An app on this device" is a CORS-open server on 127.0.0.1 that counts the
// requests it receives: a refused request must never reach it, and an allowed
// one must (the positive control). The public site is the fixture page served
// through insecure.test, a name the harness maps to loopback at the resolver,
// so Blanc classifies it as public while it loads offline. Every scenario
// starts on a fresh profile, so no decision carries between them.
const assert = require('node:assert/strict');
const http = require('node:http');
const { Given, When, Then, After } = require('@cucumber/cucumber');
const ctx = require('../support/context');
const { waitForValue } = require('../support/poll');

const PROMPT_URL = 'blanc-chrome://permission/';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function startDeviceApp() {
  const hits = [];
  const server = http.createServer((req, res) => {
    hits.push(req.url);
    res.writeHead(200, { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'text/plain' });
    res.end('device-app');
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({
    hits,
    url: (path) => `http://127.0.0.1:${server.address().port}${path}`,
    close: () => new Promise((r) => server.close(r)),
  })));
}

const findWindow = (url) => Promise.resolve(
  ctx.app.windows().find((page) => !page.isClosed() && page.url() === url)
);
const promptView = () => findWindow(PROMPT_URL);

async function promptVisible() {
  const view = await promptView();
  if (!view) return false;
  return view.locator('#permBlockBtn').isVisible().catch(() => false);
}

async function openSite(world, url, { private: isPrivate = false } = {}) {
  world.lnaTabId = await world.call('openTab', url, isPrivate ? { private: true } : {});
  await world.waitForState((state) => {
    const tab = state.tabs.find((candidate) => candidate.id === world.lnaTabId);
    return tab && !tab.loading && tab.loadedUrl === url;
  });
  world.lnaPage = await waitForValue(() => findWindow(url), Boolean, `the page ${url}`);
  world.lnaSiteUrl = url;
}

// Starts a fetch in the page and leaves it pending (it may be held while the
// prompt is open); the outcome is read later.
async function startFetch(world, frame, path) {
  const target = world.deviceApp.url(path);
  await frame.evaluate((url) => {
    window.__lna = window.__lna || {};
    window.__lna[url] = fetch(url).then((r) => r.text()).then((text) => `ok:${text}`, (error) => `refused:${error.name}`);
  }, target);
  return target;
}
const fetchOutcome = (frame, target) => frame.evaluate((url) => window.__lna[url], target);
const queryState = (frame, name) => frame.evaluate((n) => navigator.permissions.query({ name: n }).then((s) => s.state), name);

async function answerPrompt(button) {
  const view = await waitForValue(promptView, Boolean, 'the Blanc permission prompt');
  await view.locator(button).waitFor({ state: 'visible' });
  await view.locator(button).click();
  await waitForValue(() => promptVisible().then((visible) => !visible), Boolean, 'the prompt to close');
}

async function settingsPage(world) {
  await world.call('openSettings');
  await waitForValue(
    () => world.call('utilitySurface'),
    (surface) => surface?.visible && surface.ready && surface.url === 'blanc://settings/',
    'the settings sheet'
  );
  return waitForValue(() => findWindow('blanc://settings/'), Boolean, 'the settings page');
}

After({ tags: '@F13-lna' }, async function () {
  await this.deviceApp?.close();
});

Given('a fresh profile and an app listening on this device', async function () {
  await ctx.relaunch({}, { freshProfile: true });
  this.deviceApp = await startDeviceApp();
});

Given('a public website is open', async function () {
  await openSite(this, this.insecureFixtureUrl('lna-public'));
});

Given('a public website is open in a private tab', async function () {
  await openSite(this, this.insecureFixtureUrl('lna-private'), { private: true });
});

Given('a localhost page is open', async function () {
  await openSite(this, this.fixtureUrl('lna-local'));
});

When('the site asks whether it may reach apps on this device', async function () {
  this.lnaInitialState = await queryState(this.lnaPage, 'loopback-network');
});

Then('Blanc answers {string}', function (expected) {
  assert.equal(this.lnaInitialState, expected);
});

When('the site connects to the app', async function () {
  this.lnaTarget = await startFetch(this, this.lnaPage, '/probe');
});

Then('the Blanc permission prompt asks to connect to apps on this device', async function () {
  const view = await waitForValue(promptView, Boolean, 'the Blanc permission prompt');
  await view.locator('#permBlockBtn').waitFor({ state: 'visible' });
  const text = await view.locator('#permissionText').innerText();
  assert.match(text, /wants to connect to apps on this device/);
  assert.match(text, /insecure\.test/);
  assert.deepEqual(this.deviceApp.hits, [], 'the request waits for the answer');
});

When('I allow it', async function () {
  await answerPrompt('#permAllowBtn');
});

When('I block it', async function () {
  await answerPrompt('#permBlockBtn');
});

Then('the app receives the request', async function () {
  assert.equal(await fetchOutcome(this.lnaPage, this.lnaTarget), 'ok:device-app');
  assert.deepEqual(this.deviceApp.hits, ['/probe']);
});

Then('the app never receives the request', async function () {
  assert.match(await fetchOutcome(this.lnaPage, this.lnaTarget), /^refused:/);
  assert.deepEqual(this.deviceApp.hits, []);
});

Then('the site reads the permission as {string}', async function (expected) {
  assert.equal(await queryState(this.lnaPage, 'loopback-network'), expected);
});

Then('connecting again is refused without a prompt', async function () {
  const target = await startFetch(this, this.lnaPage, '/again');
  assert.match(await fetchOutcome(this.lnaPage, target), /^refused:/);
  assert.equal(await promptVisible(), false);
  assert.deepEqual(this.deviceApp.hits, []);
});

Then('Settings lists the site as blocked for apps on this device', async function () {
  const page = await settingsPage(this);
  const decisions = await page.evaluate(() => window.bowserPages.permissions.list());
  const origin = new URL(this.lnaSiteUrl).origin;
  assert.equal(decisions[`${origin}|loopback-network`], 'deny');
  this.lnaSettings = page;
});

When('I remove that decision in Settings', async function () {
  const origin = new URL(this.lnaSiteUrl).origin;
  await this.lnaSettings.evaluate((key) => window.bowserPages.permissions.remove(key), `${origin}|loopback-network`);
  await this.call('closeUtilitySurface').catch(() => {});
});

Then('connecting again asks first', async function () {
  this.lnaTarget = await startFetch(this, this.lnaPage, '/after-removal');
  await waitForValue(promptVisible, Boolean, 'the prompt to return');
  await answerPrompt('#permAllowBtn');
  assert.equal(await fetchOutcome(this.lnaPage, this.lnaTarget), 'ok:device-app');
});

Then('nothing is saved to the profile', async function () {
  const page = await settingsPage(this);
  const decisions = await page.evaluate(() => window.bowserPages.permissions.list());
  assert.deepEqual(Object.keys(decisions).filter((key) => key.includes('network')), []);
});

When('a frame from another site on the page connects to the app', async function () {
  const frameUrl = this.secureFixtureUrl('lna-frame');
  await this.lnaPage.evaluate((src) => new Promise((resolve) => {
    const iframe = document.createElement('iframe');
    iframe.src = src;
    iframe.allow = 'loopback-network; local-network';
    iframe.onload = resolve;
    document.body.append(iframe);
  }), frameUrl);
  const frame = await waitForValue(
    () => Promise.resolve(this.lnaPage.frames().find((candidate) => candidate.url() === frameUrl)),
    Boolean,
    'the cross-origin frame'
  );
  this.lnaFrame = frame;
  this.lnaFrameTarget = await startFetch(this, frame, '/from-frame');
});

Then('the frame\'s request is refused without a prompt', async function () {
  assert.match(await fetchOutcome(this.lnaFrame, this.lnaFrameTarget), /^refused:/);
  await sleep(300);
  assert.equal(await promptVisible(), false);
  assert.deepEqual(this.deviceApp.hits, []);
});

Then('the request reaches the app without a prompt', async function () {
  assert.equal(await fetchOutcome(this.lnaPage, this.lnaTarget), 'ok:device-app');
  assert.equal(await promptVisible(), false);
  assert.deepEqual(this.deviceApp.hits, ['/probe']);
});
