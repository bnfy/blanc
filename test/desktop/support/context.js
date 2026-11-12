// Mutable state shared across hooks, the World, and step definitions:
// the launched Electron app handle, the local fixtures base URL, and the
// per-scenario map of logical page names -> tab ids (reset in a Before hook).
module.exports = {
  app: null,
  // The profile directory the current app runs on, so a relaunch that heals
  // a broken app brings it back on the same one.
  profileDir: null,
  // The app the current scenario's steps ran on, so an After hook can tell a
  // failure on that app from one on an app a tagged After already replaced.
  // (A suspicion itself lives on the app handle, as app.__blancSuspect.)
  scenarioApp: null,
  // Main-process exception text collected when an app was closed, reported as
  // the scenario's failure by the last After hook.
  pendingMainProcessException: '',
  // Every relaunch the harness made to heal the app (app-health.js).
  healing: null,
  relaunch: null,
  crashAndRelaunch: null,
  quitAndRelaunch: null,
  launchPeerApp: null,
  closePeerApp: null,
  fixturesBase: null,
  secureFixturesBase: null,
  untrustedFixturesBase: null,
  localFixturesBase: null,
  localFixturesPort: null,
  localFixtures: null,
  // F45: the synthetic browser home Arc discovery reads in test runs.
  browserHomeDir: null,
  tabByName: {},
  activeExpectedUrl: null,
  lastNewTabId: null,
  addressMenuItems: null,
  addressMenuFieldText: null,
};
