// Real X11 input. Each case launches its own process so a posted key or an
// earlier accelerator cannot install the watcher for the first Ctrl+Tab.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pause, waitFor} from './lib/cdp.mjs';
import {NativeFixture} from './lib/fixture.mjs';
import {click, windowGeometry} from './lib/native-input-linux.mjs';
import {assertNodeRuntime} from './lib/render-guard.mjs';
import {installDriver} from './lib/test-driver.mjs';
import {createWorld} from './world.mjs';

const [configFile, out, ...extra] = process.argv.slice(2);
if (!configFile || !out || extra.length)
  throw Error('Usage: linux-tab-switch-keys.mjs CONFIG.json NEW_RESULTS_DIRECTORY');
assertNodeRuntime();
assert.equal(process.platform, 'linux');
assert.notEqual(process.getuid(), 0);
assert.ok(process.env.DISPLAY);
assert.equal(fs.readFileSync('/proc/sys/kernel/apparmor_restrict_unprivileged_userns', 'utf8').trim(), '1');
const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
fs.mkdirSync(out);
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-x11-keys-'));
const report = {candidate:config.candidate, arch:process.arch, display:'x11', cases:[]};
const idle = {pick:null, order:null, card:false};
const xdo = (...args) => execFileSync('xdotool', args, {encoding:'utf8', timeout:5000}).trim();
const tap = key => xdo('keydown', key, 'sleep', '0.04', 'keyup', key);

async function runCase(name, gesture) {
  const f = new NativeFixture(), w = createWorld(f);
  const entry = {name, passed:false}, diagnostics = {};
  report.cases.push(entry);
  try {
    f.extraArgs = ['--ozone-platform=x11'];
    await f.launch(config, path.join(scratch, name), {testHooks:true, diskAssets:false});
    await installDriver(f.host);
    await w.reset();
    const setting = name === 'list' ? 'list' : 'recent';
    assert.equal(await w.native('setTabSwitchOrder', [setting]), setting);
    const active = async () => String((await w.snapshot()).activeTabId);
    const ids = {a:await active()};
    for (const label of ['b', 'c', 'd']) ids[label] = String(await w.call('openTab', f.base + '/' + label));
    assert.deepEqual((await w.snapshot()).tabs.map(t => String(t.id)), [ids.a, ids.b, ids.c, ids.d]);
    for (const label of ['a', 'c', 'b', 'd']) {
      await w.call('activateTab', ids[label]);
      await waitFor(active, id => id === ids[label], 'activate ' + label);
    }
    // The window manager must have given focus to this browser. A real click
    // focuses its page before any real keyboard input is sent.
    const windowId = await waitFor(() => {
      const id = xdo('getactivewindow');
      return Number(xdo('getwindowpid', id)) === f.process.pid && id;
    }, Boolean, 'active window owned by this browser');
    const {x, y, width, height} = windowGeometry(windowId);
    click(x + width / 2, y + height * 0.7);
    assert.equal(xdo('getactivewindow'), windowId);

    // Count the commands dispatched to the host as well as checking which tab
    // activates. A second release would otherwise be invisible once idle.
    await w.hostEval(`(() => {
      const host = window.BlancPrototypeHost, original = host.tabSwitch;
      window.testTabSwitchActions = [];
      host.tabSwitch = (...args) => { window.testTabSwitchActions.push(args); return original(...args); };
    })()`);
    const state = () => w.hostEval('window.BlancPrototypeHost.tabSwitchState()');
    const picked = async expected => {
      const actual = await waitFor(state, s => s.pick === expected, 'held pick ' + expected, 5000);
      assert.deepEqual(actual.order, [ids.d, ids.b, ids.c, ids.a]);
      assert.equal(await active(), ids.d, 'Ctrl is still held');
    };
    const {land, actions, closed} = await gesture({ids, picked, active, state, w, f, windowId, diagnostics});
    if (closed) { entry.passed = true; return; }
    await waitFor(active, id => id === land, 'active tab after gesture', 5000);
    await pause(250);
    assert.equal(await active(), land);
    assert.deepEqual(await state(), idle);
    const readActions = () => w.hostEval('window.testTabSwitchActions');
    entry.actions = actions?.length
      ? await waitFor(readActions, seen => seen.length >= actions.length, 'native switch actions', 5000)
      : await readActions();
    if (actions) assert.deepEqual(entry.actions, actions);
    entry.passed = true;
  } catch (error) {
    entry.error = String(error.stack || error);
    if (Object.keys(diagnostics).length) {
      for (const [key, expr] of [['tileEvents', 'window.testTileEvents'], ['actions', 'window.testTabSwitchActions'],
        ['state', 'window.BlancPrototypeHost.tabSwitchState()'], ['snapshot', 'null']]) {
        try { diagnostics[key] = await diagnostics.w?.hostEval(expr); } catch (e) { diagnostics[key] = 'unreadable: ' + e.message; }
      }
      delete diagnostics.w;
      entry.diagnostics = diagnostics;
    }
  } finally {
    try {
      xdo('keyup', 'Tab', 'Escape', 'w', 'Shift_L', 'Control_L');
    } catch (error) { entry.inputCleanupError = error.message; entry.passed = false; }
    try {
      entry.exit = await f.close();
      assert.equal(entry.exit?.code, 0);
    } catch (error) { entry.closeError = error.message; entry.passed = false; }
    if (f.directory && fs.existsSync(path.join(f.directory, 'browser.log')))
      fs.copyFileSync(path.join(f.directory, 'browser.log'), path.join(out, name + '.log'));
  }
}

try {
  await runCase('two-tabs', async ({ids, picked}) => {
    xdo('keydown', 'Control_L');
    tap('Tab'); await picked(ids.b);
    tap('Tab'); await picked(ids.c);
    xdo('keyup', 'Control_L');
    return {land:ids.c, actions:[['step', 1], ['step', 1], ['release']]};
  });
  await runCase('reverse', async ({ids, picked}) => {
    xdo('keydown', 'Control_L', 'keydown', 'Shift_L');
    tap('Tab'); await picked(ids.a);
    xdo('keyup', 'Shift_L', 'keyup', 'Control_L');
    return {land:ids.a, actions:[['step', -1], ['release']]};
  });
  await runCase('control-up-first', async ({ids}) => {
    xdo('keydown', 'Control_L', 'keydown', 'Tab', 'sleep', '0.05',
        'keyup', 'Control_L', 'sleep', '0.05', 'keyup', 'Tab');
    return {land:ids.b, actions:[['step', 1], ['release']]};
  });
  await runCase('escape', async ({ids, picked, state}) => {
    xdo('keydown', 'Control_L');
    tap('Tab'); await picked(ids.b);
    tap('Escape');
    await waitFor(state, s => s.pick === null && !s.card, 'Escape cancels before Control comes up');
    xdo('keyup', 'Control_L');
    return {land:ids.d, actions:[['step', 1], ['cancel']]};
  });
  for (const key of ['Escape', 'a']) {
    await runCase('close-tab-after-' + key, async ({ids, picked, state, w, active}) => {
      xdo('keydown', 'Control_L'); tap('Tab'); await picked(ids.b);
      tap(key);
      await waitFor(state, s => s.pick === null, 'keyboard cancellation');
      tap('w');
      const remaining = await waitFor(async () => (await w.snapshot()).tabs.map(t => String(t.id)),
        tabs => !tabs.includes(ids.d), 'ordinary Ctrl+W closes the active tab');
      assert.deepEqual(remaining, [ids.a, ids.b, ids.c]);
      xdo('keyup', 'Control_L');
      return {land:await active(), actions:[['step', 1], ['cancel']]};
    });
  }
  await runCase('held-w', async ({ids, picked, state, w}) => {
    xdo('keydown', 'Control_L'); tap('Tab'); await picked(ids.b);
    xdo('keydown', 'w', 'sleep', '1.5', 'keyup', 'w');
    await waitFor(state, s => s.pick === ids.c, 'one close across W autorepeat');
    assert.deepEqual((await w.snapshot()).tabs.map(t => String(t.id)), [ids.a, ids.c, ids.d]);
    xdo('keyup', 'Control_L');
    return {land:ids.c, actions:[['step', 1], ['closePick'], ['release']]};
  });
  await runCase('close-window', async ({ids, picked, f, windowId}) => {
    const original = (await f.targets()).find(t => t.url === f.base + '/d');
    const {targetId} = await f.browser.send('Target.createTarget', {url:f.base + '/survivor', newWindow:true});
    await f.browser.send('Target.activateTarget', {targetId:original.id});
    await waitFor(() => xdo('getactivewindow'), id => id === windowId, 'original window active');
    xdo('keydown', 'Control_L', 'keydown', 'Shift_L'); tap('Tab'); await picked(ids.a);
    tap('w');
    xdo('keyup', 'Shift_L', 'Control_L');
    await waitFor(f.targets, targets => !targets.some(t => t.id === original.id || t.id === f.hostTargetId) &&
      targets.some(t => t.id === targetId), 'Ctrl+Shift+W closes the switcher window');
    return {closed:true};
  });
  await runCase('click-release', async ({ids, picked, state}) => {
    xdo('keydown', 'Control_L'); tap('Tab'); await picked(ids.b);
    // The pointer is still over the page, outside the Island.
    xdo('mousedown', '1', 'keyup', 'Control_L', 'mouseup', '1');
    await waitFor(state, s => s.pick === null, 'outside click cancelled');
    return {land:ids.d, actions:[['step', 1], ['cancel']]};
  });
  await runCase('click-tile', async ({ids, picked, w, diagnostics}) => {
    diagnostics.w = w;
    xdo('keydown', 'Control_L'); tap('Tab'); await picked(ids.b);
    // The card is placed after it first lays out: an early reading put the
    // tile at the window's top edge (y 2) though it settles near y 109. Take
    // the tile only when two readings 100 ms apart agree and it lies inside
    // the overlay frame.
    const measure = () => w.hostEval(`(() => {
      const frame = document.getElementById('overlay');
      const tile = frame.contentDocument?.querySelector('#switcher-tile-3');
      if (!tile || frame.hidden) return null;
      const card = frame.getBoundingClientRect(), r = tile.getBoundingClientRect();
      const x = card.x + r.x + r.width / 2, y = card.y + r.y + r.height / 2;
      const inside = r.width && x > card.x && x < card.x + card.width && y > card.y && y < card.y + card.height;
      return inside ? {x, y, scale:devicePixelRatio} : null;
    })()`);
    const tile = await waitFor(async () => {
      const first = await measure();
      if (!first) return null;
      await pause(100);
      const second = await measure();
      return second && second.x === first.x && second.y === first.y ? second : null;
    }, Boolean, 'last tile settled');
    const {strip} = await w.native('linuxFrameGeometry');
    // Diagnostics for this case: did the tile see the press, and where was it?
    await w.hostEval(`(() => {
      const doc = document.getElementById('overlay').contentDocument;
      window.testTileEvents = [];
      doc.addEventListener('mousedown', e => window.testTileEvents.push({target: e.target.closest('li')?.id ?? e.target.tagName, x: e.clientX, y: e.clientY}), true);
      document.addEventListener('mousedown', e => window.testTileEvents.push({host: e.target.id || e.target.tagName, x: e.clientX, y: e.clientY}), true);
    })()`);
    diagnostics.tile = {tile, strip};
    diagnostics.layout = await w.hostEval(`(() => {
      const frame = document.getElementById('overlay'), doc = frame.contentDocument;
      const rect = el => el && (({x, y, width, height}) => ({x, y, width, height}))(el.getBoundingClientRect());
      return {hostScroll: [scrollX, scrollY], hostSize: [innerWidth, innerHeight], frame: rect(frame), frameStyle: frame.getAttribute('style'),
        overlayScroll: [doc.scrollingElement.scrollLeft, doc.scrollingElement.scrollTop], overlaySize: [doc.defaultView.innerWidth, doc.defaultView.innerHeight],
        card: rect(doc.getElementById('switcherCard')), tiles: rect(doc.getElementById('switcherTiles')), tile3: rect(doc.getElementById('switcher-tile-3'))};
    })()`);
    xdo('mousemove', String(Math.round((strip.x + tile.x) * tile.scale)),
        String(Math.round((strip.y + tile.y) * tile.scale)),
        'mousedown', '1', 'keyup', 'Control_L', 'mouseup', '1');
    return {land:ids.a, actions:[['step', 1], ['cancel']]};
  });
  await runCase('click-new-gesture', async ({ids, picked}) => {
    xdo('keydown', 'Control_L'); tap('Tab'); await picked(ids.b);
    xdo('mousedown', '1', 'mouseup', '1', 'keyup', 'Control_L', 'keydown', 'Control_L'); tap('Tab');
    await pause(350);
    await picked(ids.b);
    xdo('keyup', 'Control_L');
    return {land:ids.b, actions:[['step', 1], ['cancel'], ['step', 1], ['release']]};
  });
  for (const ending of ['hold', 'tap', 'click', 'escape']) {
    await runCase('fullscreen-' + ending, async ({ids, picked, state, f, windowId}) => {
      tap('F11');
      await waitFor(() => execFileSync('xprop', ['-id', windowId, '_NET_WM_STATE'], {encoding:'utf8'}),
        value => value.includes('_NET_WM_STATE_FULLSCREEN'), 'browser entered fullscreen');
      const page = await f.connectTarget((await f.targets()).find(t => t.url === f.base + '/d'));
      // Keep the second keydown in the page until the desired native input
      // has been sent, independent of runner speed.
      let heldResponse;
      const [servePage] = f.server.listeners('request');
      f.server.off('request', servePage);
      f.server.on('request', (req, res) => {
        if (req.url === '/held-ctrl-tab') heldResponse = res;
        else servePage(req, res);
      });
      await page.eval(`window.tabsSeen = 0; document.addEventListener('keydown', event => {
        if (event.key !== 'Tab' || !event.ctrlKey) return;
        if (++window.tabsSeen === 1) event.preventDefault();
        else { const xhr = new XMLHttpRequest(); xhr.open('GET', '/held-ctrl-tab', false); xhr.send(); }
      }); true`);
      xdo('keydown', 'Control_L'); tap('Tab');
      await waitFor(() => page.eval('window.tabsSeen'), n => n === 1, 'fullscreen page received the first chord');
      assert.deepEqual(await state(), idle, 'page consumed the first chord');
      tap('Tab');
      await waitFor(() => Boolean(heldResponse), Boolean, 'page is handling the second chord');
      try {
        if (ending === 'click') xdo('mousedown', '1', 'mouseup', '1');
        if (ending === 'escape') tap('Escape');
        if (ending !== 'hold') xdo('keyup', 'Control_L');
      } finally {
        heldResponse.end('ok');
      }
      if (ending === 'click' || ending === 'escape') {
        await waitFor(() => page.eval('window.tabsSeen'), n => n === 2, 'page returned the second chord');
        return {land:ids.d, actions:[]};
      }
      if (ending === 'hold') {
        await picked(ids.b);
        xdo('keyup', 'Control_L');
      }
      return {land:ids.b, actions:[['step', 1], ['release']]};
    });
  }
  await runCase('list', async ({ids, active, state}) => {
    xdo('keydown', 'Control_L');
    tap('Tab');
    await waitFor(active, id => id === ids.a, 'positional neighbor activates while Control is held');
    assert.deepEqual(await state(), idle);
    xdo('keyup', 'Control_L');
    return {land:ids.a, actions:[]};
  });
} finally {
  fs.rmSync(scratch, {recursive:true, force:true});
  report.passed = report.cases.length === 16 && report.cases.every(c => c.passed);
  fs.writeFileSync(path.join(out, 'keys-' + process.arch + '.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
  if (!report.passed) process.exitCode = 1;
}
