const path = require('node:path');

const ABOUT_APPLICATION_NAME = 'Blanc';
const ABOUT_WEBSITE = 'https://blanc.day';
const ABOUT_COPYRIGHT = '© 2026 Bananify';

// "Chromium 152.0.7977.167": the engine's full MAJOR.MINOR.BUILD.PATCH, read
// from the running binary rather than package.json so it can never drift.
function chromiumLine({ t, versions = process.versions } = {}) {
  return t('about.chromium', { version: versions.chrome });
}

// `t` is the interface translator; the name and copyright are fixed.
//
// Each platform draws a different native panel from these options:
// - macOS uses the bundle's Info.plist for the name, "Version 1.35.0 (1350)"
//   and copyright whenever a key is absent, so only the engine line is passed
//   (as credits, drawn under the copyright).
// - Windows shows a message box of name, version, copyright and credits.
// - Linux's GTK dialog has no credits field, so the engine line goes on its
//   own line under the version.
function aboutPanelOptions({ app, iconPath, t, platform = process.platform, versions = process.versions } = {}) {
  const engine = chromiumLine({ t, versions });
  if (platform === 'darwin') return { credits: engine };
  const version = app.getVersion();
  return {
    applicationName: ABOUT_APPLICATION_NAME,
    applicationVersion: platform === 'linux' ? `${version}\n${engine}` : version,
    copyright: ABOUT_COPYRIGHT,
    credits: platform === 'linux' ? t('about.credits') : `${t('about.credits')}\n${engine}`,
    authors: ['Bananify'],
    website: ABOUT_WEBSITE,
    iconPath: iconPath ?? path.join(__dirname, '../renderer/pages/icon-sunrise.png'),
  };
}

function showAboutPanel({ app, iconPath, t, platform, versions } = {}) {
  app.setAboutPanelOptions(aboutPanelOptions({ app, iconPath, t, platform, versions }));
  app.showAboutPanel();
}

module.exports = {
  ABOUT_APPLICATION_NAME,
  ABOUT_COPYRIGHT,
  ABOUT_WEBSITE,
  aboutPanelOptions,
  chromiumLine,
  showAboutPanel,
};
