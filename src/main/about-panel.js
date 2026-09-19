const path = require('node:path');

const ABOUT_APPLICATION_NAME = 'Blanc';
const ABOUT_WEBSITE = 'https://blancbrowser.com';
const ABOUT_COPYRIGHT = '© 2026 Bananify';

function aboutPanelOptions({ app, iconPath } = {}) {
  return {
    applicationName: ABOUT_APPLICATION_NAME,
    applicationVersion: app.getVersion(),
    copyright: ABOUT_COPYRIGHT,
    credits: 'Independent browser by Bananify.',
    authors: ['Bananify'],
    website: ABOUT_WEBSITE,
    iconPath: iconPath ?? path.join(__dirname, '../renderer/pages/icon-sunrise.png'),
  };
}

function showAboutPanel({ app, iconPath } = {}) {
  app.setAboutPanelOptions(aboutPanelOptions({ app, iconPath }));
  app.showAboutPanel();
}

module.exports = {
  ABOUT_APPLICATION_NAME,
  ABOUT_COPYRIGHT,
  ABOUT_WEBSITE,
  aboutPanelOptions,
  showAboutPanel,
};
