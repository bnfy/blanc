const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const {
  ABOUT_APPLICATION_NAME,
  ABOUT_COPYRIGHT,
  ABOUT_WEBSITE,
  aboutPanelOptions,
  showAboutPanel,
} = require('../../src/main/about-panel');

test('about panel metadata comes from the running Blanc build', () => {
  const options = aboutPanelOptions({ app: { getVersion: () => '1.0.2-dev.3' } });

  assert.deepEqual(options, {
    applicationName: ABOUT_APPLICATION_NAME,
    applicationVersion: '1.0.2-dev.3',
    copyright: ABOUT_COPYRIGHT,
    credits: 'Independent browser by Bananify.',
    authors: ['Bananify'],
    website: ABOUT_WEBSITE,
    iconPath: path.join(__dirname, '../../src/renderer/pages/icon-sunrise.png'),
  });
});

test('showAboutPanel configures metadata before opening the native dialog', () => {
  const calls = [];
  const app = {
    getVersion: () => '1.0.2',
    setAboutPanelOptions: (options) => calls.push(['options', options]),
    showAboutPanel: () => calls.push(['show']),
  };

  showAboutPanel({ app, iconPath: '/tmp/blanc-about.png' });

  assert.equal(calls[0][0], 'options');
  assert.equal(calls[0][1].applicationVersion, '1.0.2');
  assert.equal(calls[0][1].iconPath, '/tmp/blanc-about.png');
  assert.deepEqual(calls[1], ['show']);
});
