// A4c's emulator checks: Spaces over Chromium's real tabs. A switch keeps every tab, its Back and
// Forward, its group and its pin, leaves private tabs alone, and survives Android ending the app.
// Fails closed: a missing control or state fails.
//
//   node chromium/tests/android/spaces.mjs --apk <ChromePublic.apk> --evidence <dir> [--only <text>]
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {Device, PACKAGE, adb, sleep, startFixtures} from './acceptance/support/device.mjs';

const url = name => `https://${name}.example/`;
const titles = state => state.tabs.filter(t => !t.private).map(t => t.title);

async function main(argv) {
  const option = name => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
  const apk = option('--apk'), evidence = option('--evidence'), only = option('--only');
  if (!apk || !evidence) throw Error('Usage: spaces.mjs --apk <path> --evidence <dir> [--only <text>]');
  fs.mkdirSync(evidence, {recursive: true});
  adb('install', '-r', apk);
  const stop = startFixtures();
  const d = new Device();
  const results = [];
  const check = async (name, body) => {
    if (only && !name.includes(only)) return;
    try {
      await d.reset();
      results.push({case: name, problems: (await body()) ?? []});
    } catch (error) {
      results.push({case: name, problems: [error.message]});
    }
    const last = results.at(-1);
    console.log(`${last.problems.length ? 'FAIL' : 'pass'} ${last.case}${last.problems.length ? ': ' + last.problems.join('; ') : ''}`);
  };
  // A new Space through /space and the editor; it opens on a Start Page.
  const create = name => {
    d.runInPalette(`/space ${name}`);
    sleep(1);
    d.tap({text: 'Create space'});
    sleep(2);
  };
  const show = name => { d.runInPalette(`/space ${name}`); sleep(3); };
  try {
    await check('a new Space opens empty and This phone comes back whole', async () => {
      await d.view(url('one'));
      await d.view(url('two'));
      const before = titles(d.grid());
      create('Work');
      const inWork = titles(d.grid());
      if (inWork.some(t => t.includes('.example'))) return [`Work holds ${inWork}`];
      show('This phone');
      const after = titles(d.grid());
      return JSON.stringify(after) === JSON.stringify(before) ? [] : [`before ${before}, after ${after}`];
    });

    await check('Back still works on a tab that came back from a switch', async () => {
      await d.view(url('first'));
      d.runInPalette(url('second'));
      await d.waitForUrl(url('second'));
      create('Work');
      show('This phone');
      await d.waitForUrl(url('second'));
      adb('shell', 'input', 'keyevent', 'KEYCODE_BACK');
      await d.waitForUrl(url('first'));
      return [];
    });

    await check('each Space keeps its own tabs through two switches', async () => {
      await d.view(url('phone'));
      create('Work');
      await d.view(url('work'));
      show('This phone');
      if (titles(d.grid()).some(t => t.startsWith('work'))) return ['Work\'s tab came along'];
      show('Work');
      const work = titles(d.grid());
      return work.includes('work.example') && !work.includes('phone.example') ? [] : [String(work)];
    });

    await check('groups and pins come back', async () => {
      await d.view(url('a-one'));
      d.runInPalette('/group Keep');
      sleep(1);
      create('Work');
      show('This phone');
      const state = d.grid();
      const tab = state.tabs.find(t => t.title === 'a-one.example');
      return tab?.group === 'Keep' ? [] : [JSON.stringify(state).slice(0, 300)];
    });

    await check('a private tab stays through a switch and belongs to no Space', async () => {
      await d.view(url('open'));
      d.menu('New Private Tab');
      sleep(2);
      create('Work');
      const state = d.grid();
      return state.tabs.filter(t => t.private).length === 1 ? [] : [JSON.stringify(state).slice(0, 300)];
    });

    await check('a restart keeps the Space on show and the others', async () => {
      await d.view(url('phone'));
      create('Work');
      await d.view(url('work'));
      adb('shell', 'input', 'keyevent', 'KEYCODE_HOME');
      sleep(3);
      adb('shell', 'am', 'force-stop', PACKAGE);
      await d.launch();
      sleep(3);
      const work = titles(d.grid());
      if (!work.includes('work.example')) return [`after restart: ${work}`];
      show('This phone');
      const phone = titles(d.grid());
      return phone.includes('phone.example') && !phone.includes('work.example') ? [] : [String(phone)];
    });

    await check('moving a tab sends it to the Space and leaves this set', async () => {
      await d.view(url('stays'));
      await d.view(url('goes'));
      create('Work');
      show('This phone');
      d.openGrid();
      d.longPressAt(d.find(d.card('goes.example')));
      d.tap({text: 'Move to Space'});
      d.tap({text: 'Work'});
      sleep(2);
      if (titles(d.grid()).includes('goes.example')) return ['still here'];
      show('Work');
      return titles(d.grid()).includes('goes.example') ? [] : ['not in Work'];
    });

    await check('a tab in a Space moves to This phone', async () => {
      await d.view(url('home'));
      create('Work');
      await d.view(url('back'));
      await d.view(url('other'));
      d.openGrid();
      d.longPressAt(d.find(d.card('back.example')));
      d.tap({text: 'Move to Space'});
      d.tap({text: 'This phone'});
      sleep(2);
      if (titles(d.grid()).includes('back.example')) return ['still here'];
      show('This phone');
      return titles(d.grid()).includes('back.example') ? [] : ['not on This phone'];
    });

    // Opens the Spaces card's editor for a Space.
    const editSpace = name => {
      d.runInPalette('/space');
      sleep(1);
      d.tap({text: 'Edit'});
      d.tap({desc: new RegExp(`^Edit ${name}$`)});
      sleep(1);
    };

    await check('Undo brings a deleted Space back on show', async () => {
      await d.view(url('home'));
      create('Work');
      await d.view(url('kept'));
      editSpace('Work');
      d.tap({text: 'Delete space'});
      // One dump for both: a dump takes seconds, and the banner lasts five.
      const banner = d.dump();
      if (!d.has({text: 'Work deleted'}, banner)) return ['no banner naming Work'];
      d.tapAt(d.find({text: 'Undo'}, banner));
      sleep(3);
      return titles(d.grid()).includes('kept.example') ? [] : ['Work did not come back on show'];
    });

    await check('Recently deleted restores a Space after Undo ends', async () => {
      await d.view(url('home'));
      create('Work');
      await d.view(url('kept'));
      show('This phone');
      editSpace('Work');
      d.tap({text: 'Delete space'});
      sleep(6);
      if (d.has({text: 'Undo'})) return ['the banner outlived its five seconds'];
      d.runInPalette('/space');
      sleep(1);
      d.tap({text: 'Edit'});
      if (!d.has({text: 'Recently Deleted (1)'})) return ['no Recently deleted heading'];
      d.tap({text: 'Restore'});
      d.back();
      show('Work');
      return titles(d.grid()).includes('kept.example') ? [] : ['the restored Space lost its tab'];
    });

    await check('the editor renames a Space and the arrows reorder', async () => {
      await d.view(url('home'));
      create('Work');
      show('This phone');
      create('Play');
      show('This phone');
      editSpace('Play');
      d.tap({text: 'Play'});
      adb('shell', 'input', 'keyevent', 'KEYCODE_MOVE_END');
      d.type('ful');
      d.back(); // the keyboard covers Done
      d.tap({text: 'Done'});
      sleep(1);
      if (!d.has({desc: /^Edit Playful$/})) return ['no rename'];
      const top = name => d.find({desc: new RegExp(`^Edit ${name}$`)}).top;
      if (top('Work') > top('Playful')) return ['Work should start first'];
      d.tap({desc: /^Move down$/});
      sleep(1);
      return top('Playful') < top('Work') ? [] : ['Move down did nothing'];
    });

    await check('the Island shows the mark once a Space exists', async () => {
      if (d.has({id: 'blanc_island_space'})) return ['a mark before any Space'];
      create('Work');
      return d.has({id: 'blanc_island_space'}) ? [] : ['no mark'];
    });
  } finally {
    stop();
  }
  fs.writeFileSync(path.join(evidence, 'spaces.json'), JSON.stringify({results, checkedAt: new Date().toISOString()}, null, 2) + '\n');
  if (!results.length || results.some(r => r.problems.length)) process.exitCode = 1;
  process.exit();
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch(error => { console.error(`Spaces: ${error.message}`); process.exit(1); });
}
