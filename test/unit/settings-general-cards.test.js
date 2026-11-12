'use strict';

// General reads as titled cards, Island first, instead of one long card where
// the Island's settings sat between unrelated rows. Every id settings.js reads
// survives the move.
const assert = require('node:assert/strict');
const { withoutInterfaceKeys } = require('../support/without-interface-keys');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const html = withoutInterfaceKeys(fs.readFileSync(path.join(__dirname, '../../src/renderer/pages/settings.html'), 'utf8'));
const general = html.match(/<section class="settings-group" id="group-general">([\s\S]*?)<\/section>/)[1];
const cards = general.split(/<div class="settings-card[^"]*">/).slice(1);
const titleOf = (card) => card.match(/<h3 class="card-title">([^<]+)<\/h3>/)?.[1];

test('General is five titled cards, Island first', () => {
  assert.deepEqual(cards.map(titleOf), ['Island', 'Appearance', 'Start Page', 'Search', 'Browsing']);
});

test('every Island setting lives in the Island card', () => {
  const island = cards[0];
  for (const id of ['tabLayout', 'islandHoverOpen', 'islandSiteColors']) {
    assert.match(island, new RegExp(`id="${id}"`), id);
  }
  assert.equal((general.match(/id="(tabLayout|islandHoverOpen|islandSiteColors)"/g) || []).length, 3);
});

test('every General control id the page script uses is still present', () => {
  for (const id of ['theme', 'islandSiteColors', 'darkWebsites', 'darkExceptionInput', 'darkExceptionAdd',
    'darkExceptionList', 'newtabLayout', 'newtabDynamicWallpaper', 'newtabCustomWallpaper',
    'customWallpaperChoose', 'customWallpaperRemove', 'tabLayout', 'islandHoverOpen', 'tabSleep',
    'uiLanguage', 'uiLanguageRelaunch', 'mouseGesturesEnabled', 'mouseGestureEditor', 'appIconGrid',
    'defaultBrowserBtn', 'defaultBrowserState', 'showWelcomeTour', 'searchEngine', 'searchEngineCustomRow',
    'searchEngineTemplate', 'bangsEnabled', 'customBangsBlock', 'customBangAdd', 'searchSuggestions',
    'homePage']) {
    assert.match(general, new RegExp(`id="${id}"`), id);
  }
});

test('a General card emptied for an unsupported platform is removed, title and all', () => {
  const js = fs.readFileSync(path.join(__dirname, '../../src/renderer/pages/settings.js'), 'utf8');
  assert.match(js, /querySelectorAll\('#group-general \.settings-card, #group-privacy \.settings-card'\)/);
});
