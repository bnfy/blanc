const path = require('node:path');

const ABOUT_APPLICATION_NAME = 'Blanc';
const ABOUT_WEBSITE = 'https://blanc.day';
const ABOUT_COPYRIGHT = '© 2026 Bananify';

// `t` is the interface translator; the name and copyright are fixed.
function aboutPanelOptions({ app, iconPath, t } = {}) {
  return {
    applicationName: ABOUT_APPLICATION_NAME,
    applicationVersion: app.getVersion(),
    copyright: ABOUT_COPYRIGHT,
    credits: t('about.credits'),
    authors: ['Bananify'],
    website: ABOUT_WEBSITE,
    iconPath: iconPath ?? path.join(__dirname, '../renderer/pages/icon-sunrise.png'),
  };
}

function showAboutPanel({ app, iconPath, t } = {}) {
  app.setAboutPanelOptions(aboutPanelOptions({ app, iconPath, t }));
  app.showAboutPanel();
}

module.exports = {
  ABOUT_APPLICATION_NAME,
  ABOUT_COPYRIGHT,
  ABOUT_WEBSITE,
  aboutPanelOptions,
  showAboutPanel,
};
