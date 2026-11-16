// A2's final review on the emulator: Blanc's group and session rules over Chromium's tab model,
// where the fake store in Robolectric can't follow Chromium.
//   - Moving one tab of a group to another group moves only that tab.
//   - /group New on a grouped tab moves it to New and leaves its old group as it was.
//   - Ungroup keeps the group's tabs in their order.
//   - /group in a private tab changes nothing (private tabs are never grouped), and Blanc runs on.
//   - A link from another app on a cold start shows that link, not the tab active before.
// Fails closed: a missing control or state fails.
//
//   node chromium/tests/android/tab-store.mjs --apk <ChromePublic.apk> --evidence <dir>
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {Device, PACKAGE, adb, sleep, startFixtures} from './acceptance/support/device.mjs';
import {gridState} from './acceptance/support/parse.mjs';

// The bounds of the first node whose content-desc matches `pattern`, after the node whose
// content-desc matches `after`; or null.
export function boundsAfter(xml, after, pattern) {
  const start = xml.search(after);
  if (start < 0) return null;
  const m = new RegExp(`<node[^>]*content-desc="${pattern.source}"[^>]*bounds="\\[(\\d+),(\\d+)\\]\\[(\\d+),(\\d+)\\]"`).exec(xml.slice(start));
  return m ? {left: +m[1], top: +m[2], right: +m[3], bottom: +m[4]} : null;
}

const url = name => `https://${name}.example/`;
const order = state => state.tabs.filter(t => !t.private).map(t => `${t.title}:${t.group ?? '-'}`);

async function group(d, name, members) {
  for (const member of members) {
    await d.view(url(member));
    d.runInPalette(`/group ${name}`);
  }
}

async function main(argv) {
  const option = name => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
  const apk = option('--apk'), evidence = option('--evidence');
  if (!apk || !evidence) throw Error('Usage: tab-store.mjs --apk <path> --evidence <dir>');
  fs.mkdirSync(evidence, {recursive: true});
  adb('install', '-r', apk);
  adb('shell', 'wm', 'density', '320');
  const stop = startFixtures();
  const d = new Device();
  const results = [];
  const check = async (name, body) => {
    try {
      await d.reset();
      const problems = await body();
      results.push({case: name, problems});
    } catch (error) {
      results.push({case: name, problems: [error.message]});
    }
  };
  try {
    await check('moving one tab of a group moves only that tab', async () => {
      await group(d, 'Alpha', ['a-1', 'a-2']);
      await group(d, 'Beta', ['b-1']);
      d.openGrid();
      d.longPressAt(d.find(d.card('a-1.example')));
      d.tap({text: 'Move to Group'});
      d.tap({text: 'Beta'});
      const state = gridState(d.dump());
      const groupOf = title => state.tabs.find(t => t.title === title)?.group;
      return groupOf('a-1.example') === 'Beta' && groupOf('a-2.example') === 'Alpha' && groupOf('b-1.example') === 'Beta'
        ? [] : [order(state).join(', ')];
    });

    await check('/group New on a grouped tab moves it and keeps its old group', async () => {
      await group(d, 'Gamma', ['c-1', 'c-2']);
      d.runInPalette('/group New');
      const state = d.grid();
      const names = state.groups.map(g => `${g.name}:${g.count}`).sort();
      return JSON.stringify(names) === JSON.stringify(['Gamma:1', 'New:1'])
        && state.tabs.find(t => t.title === 'c-2.example')?.group === 'New' ? [] : [names.join(', '), order(state).join(', ')];
    });

    await check('ungroup keeps the tabs in their order', async () => {
      await group(d, 'Upsilon', ['u-1', 'u-2', 'u-3']);
      d.openGrid();
      d.tapAt(boundsAfter(d.dump(), /content-desc="Upsilon, 3 tabs, Fold group"/, /Group options/) ?? d.find({desc: /^Group options$/}));
      d.tap({text: 'Ungroup'});
      const titles = gridState(d.dump()).tabs.filter(t => /^u-/.test(t.title));
      return titles.map(t => t.title).join(',') === 'u-1.example,u-2.example,u-3.example' && titles.every(t => !t.group)
        ? [] : [titles.map(t => `${t.title}:${t.group ?? '-'}`).join(', ')];
    });

    await check('/group in a private tab changes nothing', async () => {
      d.menu('New Private Tab');
      sleep(2);
      d.runInPalette('/group Secret');
      sleep(2);
      const alive = adb('shell', 'pidof', PACKAGE).trim() !== '';
      const state = alive ? d.grid() : {tabs: [], groups: []};
      return alive && state.groups.length === 0 && state.tabs.filter(t => t.private).length === 1
        ? [] : [`alive ${alive}, groups ${JSON.stringify(state.groups)}`];
    });

    await check('a link on a cold start shows that link', async () => {
      await d.view(url('one'));
      await d.view(url('two'));
      d.openGrid();
      d.tap(d.card('one.example'));
      await d.waitForUrl(url('one'));
      adb('shell', 'input', 'keyevent', 'KEYCODE_HOME');
      sleep(2);
      adb('shell', 'am', 'force-stop', PACKAGE);
      adb('shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', `'${url('cold')}'`, '-p', PACKAGE);
      await d.waitForUrl(url('cold'), 30);
      // Past the restore of the active tab, which runs once Chromium's tabs have loaded.
      sleep(5);
      await d.waitForUrl(url('cold'), 10);
      return [];
    });
  } finally {
    stop();
    adb('shell', 'wm', 'density', 'reset');
  }
  fs.writeFileSync(path.join(evidence, 'tab-store.json'), JSON.stringify({results, checkedAt: new Date().toISOString()}, null, 2) + '\n');
  for (const r of results) console.log(`${r.problems.length ? 'FAIL' : 'pass'} ${r.case}${r.problems.length ? ': ' + r.problems.join('; ') : ''}`);
  if (results.some(r => r.problems.length)) process.exitCode = 1;
  // The fixture server's sockets can keep Node alive.
  process.exit();
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch(error => { console.error(`Tab store: ${error.message}`); process.exit(1); });
}
