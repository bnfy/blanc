// A5c on the emulator: the first minute and the rest of Settings.
//   - A fresh install shows the walkthrough over the Start Page: Welcome, pairing on the Sync screen
//     (Back returns to Welcome), the privacy choice, then the default-browser offer through Android's
//     role dialog, which makes Blanc the default.
//   - Nothing about Measure usage is saved before Continue on the privacy step; Continue saves it.
//   - A card closed on Welcome saves no choice, and doesn't come back on the next launch.
//   - Settings has Default browser (says Blanc), Measure usage (the saved choice) and Language.
//   - Language offers System and the six languages; Deutsch restarts Blanc in German (Settings and
//     the Start Page), and System brings English back. Android's App languages screen offers the six.
//   - Show the welcome again brings the card back.
//   - Offline, pairing says it needs a connection instead of spinning (Review Focus 5).
// Fails closed: a step it can't find fails. Every other emulator check keeps the card away with
// /data/local/tmp/blanc-walkthrough-off (FirstMinute.SKIP_FILE); this one removes it and puts it back.
//
//   node chromium/tests/android/walkthrough.mjs --apk <ChromePublic.apk> --evidence <dir>
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';

const PACKAGE = 'me.bnfy.blanc.dev';
const SETTINGS = `${PACKAGE}/org.chromium.chrome.browser.settings.SettingsActivity`;
const SKIP_FILE = '/data/local/tmp/blanc-walkthrough-off';
const PREFS = `shared_prefs/${PACKAGE}_preferences.xml`;
const LANGUAGES = ['English', 'Deutsch', 'Español', 'Français', 'Italiano', 'Português do Brasil'];

const decode = s => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#10;/g, '\n');
const bounds = (xml, text) => {
  const escaped = text.replace(/&/g, '&amp;').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = new RegExp(`<node[^>]*text="${escaped}"[^>]*bounds="\\[(\\d+),(\\d+)\\]\\[(\\d+),(\\d+)\\]"`).exec(xml);
  return m ? {left: +m[1], top: +m[2], right: +m[3], bottom: +m[4]} : null;
};
const texts = xml => [...xml.matchAll(/ text="([^"]+)"/g)].map(m => decode(m[1]));

function main(argv) {
  const option = name => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
  const apk = option('--apk'), evidence = option('--evidence');
  if (!apk || !evidence) throw Error('Usage: walkthrough.mjs --apk <path> --evidence <dir>');
  fs.mkdirSync(evidence, {recursive: true});
  const adb = (...args) => execFileSync('adb', args, {encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe']});
  const sleep = s => execFileSync('sleep', [String(s)]);
  const dump = () => {
    for (let i = 0; i < 3; i++) {
      try {
        adb('shell', 'uiautomator', 'dump', '/sdcard/blanc-ui.xml');
        return adb('shell', 'cat', '/sdcard/blanc-ui.xml');
      } catch (e) {
        sleep(1);
      }
    }
    return '';
  };
  const shot = name => fs.writeFileSync(path.join(evidence, `${name}.png`), execFileSync('adb', ['exec-out', 'screencap', '-p'], {maxBuffer: 64 * 1024 * 1024}));
  const results = [];
  const fatalCount = () => (adb('logcat', '-d', '-b', 'crash').match(/FATAL EXCEPTION/g) || []).length;
  let crashesSeen = 0;
  const check = (name, problems) => {
    const now = fatalCount();
    if (now > crashesSeen) problems = [...problems, 'Blanc crashed during this check'];
    crashesSeen = now;
    results.push({case: name, problems});
    console.log(`${problems.length ? 'FAIL' : 'pass'} ${name}${problems.length ? ': ' + problems.join('; ') : ''}`);
  };
  const tapAt = b => { adb('shell', 'input', 'tap', String(Math.round((b.left + b.right) / 2)), String(Math.round((b.top + b.bottom) / 2))); sleep(1.5); };
  // Waits up to `seconds` for `text`; returns the screen's XML, or null.
  const waitFor = (text, seconds = 10) => {
    for (let i = 0; i < seconds; i++) {
      const xml = dump();
      if (bounds(xml, text)) return xml;
      sleep(1);
    }
    return null;
  };
  const tapText = (text, seconds = 10) => { const xml = waitFor(text, seconds); if (!xml) return false; tapAt(bounds(xml, text)); return true; };
  const size = adb('shell', 'wm', 'size').match(/(\d+)x(\d+)/);
  const [width, height] = [+size[1], +size[2]];
  const scroll = () => { adb('shell', 'input', 'swipe', String(width / 2), String(height * 0.75), String(width / 2), String(height * 0.3), '300'); sleep(0.8); };
  const find = text => { for (let i = 0; i < 10; i++) { const xml = dump(); if (bounds(xml, text)) return xml; scroll(); } return null; };
  const tapRow = text => { const xml = find(text); if (!xml) return false; tapAt(bounds(xml, text)); return true; };
  const summary = row => { const xml = find(row); if (!xml) return null; const all = texts(xml); return all[all.indexOf(row) + 1] ?? null; };
  const launch = () => { adb('shell', 'monkey', '-p', PACKAGE, '-c', 'android.intent.category.LAUNCHER', '1'); sleep(6); };
  const stop = () => { adb('shell', 'input', 'keyevent', 'HOME'); sleep(1.5); adb('shell', 'am', 'force-stop', PACKAGE); };
  const openSettings = () => { adb('shell', 'am', 'start', '-n', SETTINGS); sleep(4); };
  const prefs = () => { try { return adb('shell', 'run-as', PACKAGE, 'cat', PREFS); } catch { return ''; } };
  const prefValue = (xml, key) => {
    const m = new RegExp(`<(boolean|int) name="${key.replace(/\./g, '\\.')}" value="([^"]+)"`).exec(xml);
    return m ? m[2] : null;
  };
  const fresh = () => { stop(); adb('shell', 'pm', 'clear', PACKAGE); adb('shell', 'cmd', 'role', 'remove-role-holder', 'android.app.role.BROWSER', PACKAGE); };

  adb('install', '-r', apk);
  adb('root');
  adb('wait-for-device');
  adb('shell', 'cmd', 'uimode', 'night', 'no');
  adb('shell', 'cmd', 'locale', 'set-app-locales', PACKAGE, '--locales', '""');
  adb('logcat', '-b', 'crash', '-c');
  adb('shell', 'rm', '-f', SKIP_FILE);
  try {
    // A fresh install: Welcome over the Start Page.
    fresh();
    launch();
    let xml = waitFor('Your Blanc, in your pocket.', 15);
    shot('welcome');
    check('a fresh install shows Welcome', xml ? ['Pair with your Blanc', 'Browse without pairing'].filter(t => !bounds(xml, t)).map(t => `no "${t}"`) : ['no Welcome card']);

    // Pairing is the Sync screen; Back comes back to Welcome.
    let problems = [];
    if (!tapText('Pair with your Blanc')) problems.push('no Pair button');
    else {
      xml = waitFor('Other ways to join');
      shot('pair');
      if (!xml) problems.push('the Sync screen did not open');
      adb('shell', 'input', 'keyevent', 'BACK');
      sleep(2);
      if (!waitFor('Browse without pairing')) problems.push('Back did not return to Welcome');
    }
    check('pairing opens the Sync screen and Back returns to Welcome', problems);

    // The privacy step: nothing saved until Continue.
    problems = [];
    if (!tapText('Browse without pairing')) problems.push('no Browse without pairing');
    xml = waitFor('Measure usage');
    shot('privacy');
    if (!xml) problems.push('no privacy step');
    else {
      if (!texts(xml).some(t => t.includes('the Android version'))) problems.push('no Android help under the switch');
      if (prefValue(prefs(), 'blanc.usage_ping') !== null) problems.push('a choice was saved before Continue');
      if (!tapText('Continue')) problems.push('no Continue');
      if (prefValue(prefs(), 'blanc.usage_ping') !== 'true') problems.push(`saved ${prefValue(prefs(), 'blanc.usage_ping')}`);
    }
    check('the privacy choice is saved only by Continue', problems);

    // The default-browser offer, through Android's role dialog.
    problems = [];
    xml = waitFor('Open links in Blanc');
    shot('default-browser');
    if (!xml) problems.push('no default-browser step');
    else if (!tapText('Set as default')) problems.push('no Set as default');
    else {
      // Android's own dialog: Blanc is one of the browsers it lists.
      xml = waitFor('Blanc', 8);
      shot('role-dialog');
      const dialog = xml ? texts(xml) : [];
      if (!xml) problems.push('Android showed no role dialog');
      else {
        if (!tapText('Blanc', 3)) problems.push('Blanc is not in Android\'s list');
        if (!tapText('Set as default', 5)) problems.push(`no Set as default in Android's dialog (${dialog.join(' | ')})`);
      }
      const holders = adb('shell', 'cmd', 'role', 'get-role-holders', 'android.app.role.BROWSER').trim();
      if (holders !== PACKAGE) problems.push(`browser role holder: "${holders}"`);
      xml = waitFor('Blanc is your default browser');
      shot('default-done');
      if (!xml) problems.push('the card did not say Blanc is the default');
      else if (!tapText('Done')) problems.push('no Done');
      sleep(1);
      if (bounds(dump(), 'Blanc is your default browser')) problems.push('Done left the card up');
    }
    check('Set as default makes Blanc the default browser', problems);
    const finished = prefValue(prefs(), 'blanc.walkthrough_completed_version');
    check('finishing the card records it', finished === '1' ? [] : [`version ${finished}`]);

    stop();
    launch();
    check('a finished card does not come back', bounds(dump(), 'Your Blanc, in your pocket.') ? ['Welcome showed again'] : []);

    // Settings: the three rows.
    openSettings();
    shot('settings-top');
    problems = [];
    if (summary('Default browser') !== 'Blanc') problems.push(`Default browser says ${summary('Default browser')}`);
    if (!find('Measure usage')) problems.push('no Measure usage row');
    else {
      const usage = new RegExp('text="Measure usage"[\\s\\S]*?checked="(true|false)"[^>]*class="android.widget.Switch"|class="android.widget.Switch"[^>]*checked="(true|false)"').exec(dump());
      if (!usage) problems.push('no Measure usage switch');
    }
    if (summary('Language') !== 'System (English)') problems.push(`Language says ${summary('Language')}`);
    shot('settings-rows');
    check('Settings has Default browser, Measure usage and Language', problems);

    // Language: the six, German at once, then System.
    problems = [];
    if (!tapRow('Language')) problems.push('no Language row');
    else {
      xml = waitFor('Deutsch');
      shot('language-list');
      const offered = xml ? texts(xml) : [];
      for (const name of ['System (English)', ...LANGUAGES]) if (!offered.includes(name)) problems.push(`no ${name}`);
      if (!tapText('Deutsch')) problems.push('no Deutsch');
      sleep(6);
      const locales = adb('shell', 'cmd', 'locale', 'get-app-locales', PACKAGE);
      if (!/\[de\]/.test(locales)) problems.push(`app locales: ${locales.trim()}`);
      // Blanc restarted itself: its Start Page is German.
      xml = waitFor('Suche oder URL eingeben', 15) ?? waitFor('Anpassen', 5);
      shot('german-start-page');
      if (!xml) problems.push('Blanc did not come back in German');
      stop();
      openSettings();
      if (!find('Suchmaschine')) problems.push('Settings is not in German');
      if (summary('Sprache') !== 'Deutsch') problems.push(`Sprache says ${summary('Sprache')}`);
      shot('german-settings');
      if (!tapRow('Sprache') || !tapText('System (English)')) problems.push('could not choose System');
      sleep(6);
      if (!/\[\]/.test(adb('shell', 'cmd', 'locale', 'get-app-locales', PACKAGE))) problems.push('System left an app locale');
      stop();
      openSettings();
      if (!find('Search engine')) problems.push('System did not bring English back');
    }
    check('Language switches Blanc to German and back', problems);

    // Android's own App languages screen offers the six.
    stop();
    adb('shell', 'am', 'start', '-a', 'android.settings.APP_LOCALE_SETTINGS', '-d', `package:${PACKAGE}`);
    sleep(4);
    const androidList = [];
    for (let i = 0; i < 4; i++) { androidList.push(...texts(dump())); scroll(); }
    shot('android-app-languages');
    const offeredByAndroid = LANGUAGES.filter(name => !androidList.some(t => t.startsWith(name.split(' ')[0])));
    check('Android\'s App languages screen offers the six', [
      ...offeredByAndroid.map(name => `no ${name}`),
      ...(androidList.some(t => /日本語|中文|Русский/.test(t)) ? ['offers languages Blanc does not have'] : [])]);
    adb('shell', 'input', 'keyevent', 'HOME');

    // Show the welcome again: Settings is reached from the browser, which the card rises over.
    problems = [];
    stop();
    launch();
    openSettings();
    if (!tapRow('Show the welcome again')) problems.push('no Show the welcome again');
    else if (!waitFor('Your Blanc, in your pocket.', 10)) problems.push('the card did not come back');
    shot('welcome-again');
    adb('shell', 'input', 'keyevent', 'BACK');
    sleep(1.5);
    check('Show the welcome again brings the card back', problems);

    // Closing on Welcome saves no choice.
    problems = [];
    fresh();
    launch();
    if (!waitFor('Your Blanc, in your pocket.', 15)) problems.push('no Welcome');
    adb('shell', 'input', 'keyevent', 'BACK');
    sleep(2);
    if (bounds(dump(), 'Your Blanc, in your pocket.')) problems.push('Back left the card up');
    const saved = prefs();
    if (prefValue(saved, 'blanc.usage_ping') !== null) problems.push('a Measure usage choice was saved');
    if (prefValue(saved, 'blanc.walkthrough_completed_version') !== '1') problems.push('the card was not recorded as seen');
    stop();
    launch();
    if (bounds(dump(), 'Your Blanc, in your pocket.')) problems.push('Welcome came back');
    stop();
    openSettings();
    if (!find('Measure usage')) problems.push('no Measure usage row');
    else if (/text="Measure usage"[\s\S]{0,1500}?class="android\.widget\.Switch"[^>]*checked="true"/.test(dump())) problems.push('the row reads on with no choice saved');
    check('a card closed on Welcome saves no choice and stays closed', problems);

    // Offline: pairing says it needs a connection (Review Focus 5).
    problems = [];
    fresh();
    adb('shell', 'cmd', 'connectivity', 'airplane-mode', 'enable');
    sleep(3);
    launch();
    if (!tapText('Pair with your Blanc', 15)) problems.push('no Pair button');
    else {
      if (!tapText('Other ways to join')) problems.push('no Other ways to join');
      xml = waitFor('Pairing or recovery code');
      if (!xml) problems.push('no code field');
      else {
        tapAt(bounds(xml, 'Pairing or recovery code'));
        // A code in the right shape (SyncCode: eight of its letters and digits), so the join reaches the network.
        adb('shell', 'input', 'text', 'ABCD2345');
        adb('shell', 'input', 'keyevent', 'BACK');
        sleep(1);
        if (!tapRow('Connect')) problems.push('no Connect');
        // The answer shows under the last card; the Sync screen is secure, so screenshots are black.
        let explained = null;
        for (let i = 0; i < 4 && !explained; i++) { sleep(4); explained = find('Couldn’t reach sync — check your connection.'); }
        if (!explained) problems.push('no offline explanation within 16 s');
        else if (bounds(explained, 'Working')) problems.push('still says Working beside the explanation');
      }
      shot('offline-pairing');
    }
    adb('shell', 'cmd', 'connectivity', 'airplane-mode', 'disable');
    check('offline pairing explains that it needs a connection', problems);
  } finally {
    adb('shell', 'cmd', 'connectivity', 'airplane-mode', 'disable');
    adb('shell', 'cmd', 'locale', 'set-app-locales', PACKAGE, '--locales', '""');
    adb('shell', 'touch', SKIP_FILE);
    adb('shell', 'chmod', '644', SKIP_FILE);
    stop();
  }
  fs.writeFileSync(path.join(evidence, 'walkthrough.json'), JSON.stringify(results, null, 2) + '\n');
  const failed = results.filter(r => r.problems.length);
  console.log(`walkthrough: ${results.length - failed.length} of ${results.length} pass`);
  if (failed.length) process.exitCode = 1;
}

main(process.argv.slice(2));
