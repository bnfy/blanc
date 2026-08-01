'use strict';

const assert = require('node:assert/strict');
const { Given, When, Then } = require('@cucumber/cucumber');
const { waitForValue } = require('../support/poll');

async function startChooser(world) {
  await world.call('closeOverlay');
  await waitForValue(
    () => world.call('overlayRendererMode'),
    (mode) => mode == null,
    'overlay renderer to leave its previous mode'
  );
  await world.call('startDisplaySharePick', 'https://meet.example');
  await waitForValue(
    async () => ({
      mode: await world.call('overlayRendererMode'),
      dom: await world.call('readDisplayShareDom'),
    }),
    (value) => value.mode === 'display-share-picker'
      && value.dom?.names?.length === 2,
    'display-sharing chooser to render'
  );
}

Given('a visible tab on a site that can request display capture', async function () {
  await this.call('openTab', this.fixtureUrl('display-share-site'));
});

When('the site requests display capture', async function () {
  await startChooser(this);
});

Then('the Blanc display-sharing chooser names the requesting origin', async function () {
  const dom = await this.call('readDisplayShareDom');
  assert.ok(dom, 'the trusted display-sharing chooser must render');
  assert.match(dom.heading, /https:\/\/meet\.example/);
  assert.deepEqual(dom.names, ['Acceptance Screen', 'Acceptance Window']);
  assert.equal(dom.audioOffered, false, 'audio is not implicitly offered by the fixture');
  assert.equal(dom.confirmVisible, true, 'the Share action must be visible');
  assert.equal(dom.panelFitsViewport, true, 'the chooser must fit the overlay viewport');
});

When('I choose a display source', async function () {
  assert.equal(await this.call('chooseDisplayShareSource', 1), true);
});

Then('only that display source is granted', async function () {
  const result = await this.call('awaitDisplaySharePick');
  assert.equal(result.reason, 'selected');
  assert.equal(result.source?.id, 'window:acceptance-2');
  assert.equal(result.shareAudio, false);
});

Given('a visible tab with the Blanc display-sharing chooser open', async function () {
  await this.call('openTab', this.fixtureUrl('display-share-navigation'));
  await startChooser(this);
});

When('the requesting tab starts a main-frame navigation', async function () {
  assert.equal(
    await this.call('navigateActiveTab', this.fixtureUrl('display-share-navigated')),
    true
  );
});

Then('the display-sharing request is denied', async function () {
  this.displayShareResult = await this.call('awaitDisplaySharePick');
  assert.equal(this.displayShareResult.reason, 'navigation');
});

Then('no display source is granted', function () {
  assert.equal(this.displayShareResult?.source, null);
  assert.equal(this.displayShareResult?.shareAudio, false);
});
