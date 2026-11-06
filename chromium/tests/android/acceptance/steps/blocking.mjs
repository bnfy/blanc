// F12 ad and tracker blocking on Android. A phone's site controls are the Sunrise menu's blocking
// row, as on the iPhone, so that's where these read and act (D2, D13).
import {Given, When, Then} from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import {sleep} from '../support/device.mjs';
import {START_PAGE} from '../support/scenario.mjs';

const ALLOWED = 'Ads allowed on this site';
const OFF_EVERYWHERE = 'Ad blocking is off everywhere';
const COUNT = /\d+ ads? (&amp; trackers|or tracker) blocked on this page/;

// The menu's text while open, then closed again.
function menuText(device) {
  device.tap({id: 'blanc_island_menu'});
  // The popup can take a moment to draw; every entry here includes the blocking row.
  let xml = device.dump();
  for (let i = 0; i < 10 && !xml.includes('Ad &amp; tracker blocking'); i++) {
    sleep(0.5);
    xml = device.dump();
  }
  device.back();
  return xml;
}

async function settled(device) {
  await device.waitFor(async () => (await device.page('document.readyState')) === 'complete', 'the page to load', 30);
  sleep(2);
}

// Blanc's own pages have no blocking row; the Start Page's bridge reports the setting.
async function blockingOn(device) {
  await settled(device);
  if (START_PAGE.test((await device.visibleUrl()) || '')) {
    return device.page('window.bowserPages.start.data().then(x=>x.mobileAdblockEnabled)');
  }
  return !menuText(device).includes(OFF_EVERYWHERE);
}

async function loadTrackers(world, name) {
  await world.open(name, '/ads');
  await settled(world.device);
}

async function allowed(device) {
  await settled(device);
  return menuText(device).includes(ALLOWED);
}

Given('ad\\/tracker blocking is enabled', async function () {
  assert.equal(await blockingOn(this.device), true);
});

Then('ad\\/tracker blocking is disabled', async function () {
  assert.equal(await blockingOn(this.device), false);
});

When('I load a page that requests known trackers', async function () { await loadTrackers(this, 'trackers'); });

Then('the shield count for the tab is greater than 0', function () {
  assert.match(menuText(this.device), COUNT);
});

Given('the active tab is on {string} with a shield count greater than 0', async function (name) {
  await loadTrackers(this, name);
  assert.match(menuText(this.device), COUNT);
});

Then('the shield count for {string} becomes 0', async function (_name) {
  await settled(this.device);
  assert.doesNotMatch(menuText(this.device), COUNT);
});

Then('{string} is in the ad-block exceptions', async function (_name) {
  assert.ok(await allowed(this.device), 'the site is not allowed');
});

When('I reload {string}', async function (_name) {
  this.device.tap({id: 'blanc_island_reload'});
  await settled(this.device);
});

Then('ads are still allowed on {string}', async function (_name) {
  assert.ok(await allowed(this.device), 'the site is not allowed');
});

Then('the ad-block exceptions contain the active site', async function () {
  assert.ok(await allowed(this.device), 'the site is not allowed');
});

Then('the ad-block exceptions do not contain the active site', async function () {
  assert.ok(!(await allowed(this.device)), 'the site is still allowed');
});

Then('the pill shows that ads are allowed here', async function () {
  assert.ok(await allowed(this.device), 'nothing says ads are allowed');
});

Then('the pill no longer shows that ads are allowed here', async function () {
  assert.ok(!(await allowed(this.device)), 'it still says ads are allowed');
});

When('I open the shield popover from the pill', function () {
  this.device.tap({id: 'blanc_island_menu'});
  this.device.back();
});

Then('the shield popover shows protection on for the active site', async function () {
  assert.ok(!(await allowed(this.device)), 'protection is off');
});

Then('the shield popover shows protection off for the active site', async function () {
  assert.ok(await allowed(this.device), 'protection is on');
});

When('I flip the shield popover toggle', async function () {
  this.device.menu('Ad & tracker blocking');
  await settled(this.device);
});
