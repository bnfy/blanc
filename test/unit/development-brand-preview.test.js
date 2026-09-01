'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  HIDE_ISLAND_BRAND_MARK_CSS,
  developmentBrandAssetPath,
  shouldHideIslandBrandMark,
} = require('../../src/main/development-brand-preview');

test('development brand preview redirects only the shared Blanc mark', () => {
  assert.equal(developmentBrandAssetPath({
    name: 'icon.svg',
    defaultPath: '/renderer/pages/icon.svg',
    brandMarkPath: '/preview/mahjong-wind-east.png',
  }), '/preview/mahjong-wind-east.png');

  assert.equal(developmentBrandAssetPath({
    name: 'select-caret.svg',
    defaultPath: '/renderer/pages/select-caret.svg',
    brandMarkPath: '/preview/mahjong-wind-east.png',
  }), '/renderer/pages/select-caret.svg');
});

test('development brand preview replaces every app-icon thumbnail', () => {
  for (const name of ['icon-default.png', 'icon-paper.png', 'icon-midnight.png']) {
    assert.equal(developmentBrandAssetPath({
      name,
      defaultPath: `/renderer/pages/${name}`,
      dockIconPath: '/preview/quiet-horizon-game-flat-master.png',
    }), '/preview/quiet-horizon-game-flat-master.png');
  }
});

test('development brand preview keeps the explicit dark thumbnail dark', () => {
  assert.equal(developmentBrandAssetPath({
    name: 'icon-sunrise-dark.png',
    defaultPath: '/renderer/pages/icon-sunrise-dark.png',
    dockIconPath: '/preview/sunrise.png',
    darkDockIconPath: '/preview/sunrise-dark.png',
  }), '/preview/sunrise-dark.png');

  assert.equal(developmentBrandAssetPath({
    name: 'icon-sunrise.png',
    defaultPath: '/renderer/pages/icon-sunrise.png',
    dockIconPath: '/preview/sunrise.png',
    darkDockIconPath: '/preview/sunrise-dark.png',
  }), '/preview/sunrise.png');
});

test('development brand preview is inert when no preview paths are supplied', () => {
  assert.equal(developmentBrandAssetPath({
    name: 'icon.svg',
    defaultPath: '/renderer/pages/icon.svg',
  }), '/renderer/pages/icon.svg');
  assert.equal(developmentBrandAssetPath({
    name: 'icon-default.png',
    defaultPath: '/renderer/pages/icon-default.png',
  }), '/renderer/pages/icon-default.png');
});

test('Island mark suppression is explicit and unpackaged-only', () => {
  assert.equal(shouldHideIslandBrandMark({ isPackaged: false, value: '1' }), true);
  assert.equal(shouldHideIslandBrandMark({ isPackaged: false, value: '0' }), false);
  assert.equal(shouldHideIslandBrandMark({ isPackaged: true, value: '1' }), false);
  assert.match(HIDE_ISLAND_BRAND_MARK_CSS, /#pillFavicon\.internal/);
  assert.match(HIDE_ISLAND_BRAND_MARK_CSS, /\.dot-peek\.internal::after/);
  assert.doesNotMatch(HIDE_ISLAND_BRAND_MARK_CSS, /vertical-tab-favicon/);
});
