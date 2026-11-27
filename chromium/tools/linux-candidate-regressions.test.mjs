import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import YAML from 'yaml';
import {island, relaunchWindowBounds} from '../tests/adapters/island.mjs';
import {tabs} from '../tests/adapters/tabs.mjs';
import * as suite from '../linux/run-suite.mjs';

function linuxHost(t) {
  const descriptor = Object.getOwnPropertyDescriptor(process, 'platform');
  Object.defineProperty(process, 'platform', {...descriptor, value: 'linux'});
  t.after(() => Object.defineProperty(process, 'platform', descriptor));
}

test('Linux measures the laid-out client inside the widget, independently of a window manager', () => {
  const source = fs.readFileSync(new URL('../blanc/browser/ui/blanc_prototype_ui.cc', import.meta.url), 'utf8');
  const hook = source.split('quiet_method == "windowFrameInsets"')[1].split('Reply(id')[0];
  const linux = hook.split('#if BUILDFLAG(IS_LINUX)')[1]?.split('#else')[0] ?? '';
  const flush = linux.indexOf('widget->LayoutRootViewIfNecessary()');
  assert.ok(flush >= 0 && flush < linux.indexOf('GetLocalBounds()'),
    'flush the scheduled restore layout before measuring either view');
  assert.match(linux, /widget->client_view\(\)/);
  assert.match(linux, /ConvertRectToWidget\(/);
  assert.match(hook, /#else[\s\S]*widget->GetClientAreaBoundsInScreen\(\)/);
});

test('the Linux relaunch check reads client bounds before and after reopening a decorated window', async t => {
  linuxHost(t);
  for (const [outer, insets, expected] of [
    [[1008, 704], {left: 4, right: 4, top: 0, bottom: 4}, [1000, 700]],
    [[650, 488], {left: 3, right: 7, top: 2, bottom: 6}, [640, 480]],
  ]) {
    const world = {
      fixture: {browser: {send(method, {targetId}) {
        assert.equal(method, 'Browser.getWindowForTarget');
        assert.equal(targetId, 'active');
        return {windowId: 1, bounds: {left: 10, top: 10, width: outer[0], height: outer[1]}};
      }}},
      async native(method) {
        assert.equal(method, 'windowFrameInsets');
        return insets;
      },
    };
    const {width, height} = await relaunchWindowBounds(world, 'active');
    assert.deepEqual([width, height], expected);
  }
});

test('Linux reads the client in DIPs and waits for restore before adding its current insets', async t => {
  linuxHost(t);
  const restored = {left: 10, top: 10, width: 945, height: 1060, windowState: 'normal'};
  const c2Insets = {left: 4, top: 0, right: 4, bottom: 4};
  const decorated = {left: 12, top: 9, right: 15, bottom: 20};
  let state = restored, insets = c2Insets, restoring = false;
  const sets = [];
  const page = {targetId: 'page', url: () => 'about:blank', isClosed: () => false,
    evalExpression: async expression => expression === 'document.visibilityState' ? 'visible' : {h: 988, dpr: 1}};
  const world = {
    snapshot: () => ({activeTabId: 1, tabs: [{id: 1, url: 'about:blank'}]}),
    app: {refresh() {}, windows: () => [page]},
    hostEval: () => ({w: 937, h: 68, dpr: 1}),
    native(method) { assert.equal(method, 'windowFrameInsets'); return insets; },
    fixture: {browser: {send(method, args) {
      if (method === 'Browser.getWindowForTarget') return {windowId: 1, bounds: state};
      assert.equal(method, 'Browser.setWindowBounds');
      sets.push(args.bounds);
      if (args.bounds.windowState === 'normal') restoring = true;
    }}},
    async waitFor(read, accepts) {
      assert.ok(restoring);
      assert.equal(accepts(await read()), false);
      state = restored;
      insets = decorated;
      const result = await read();
      assert.equal(accepts(result), true);
      return result;
    },
  };
  assert.deepEqual(await island.windowContentBounds(world), {x: 14, y: 10, width: 937, height: 1056});
  state = {...restored, windowState: 'maximized'};
  insets = {top: 0, left: 0, right: 0, bottom: 0};
  await island.setWindowContentSize(world, 900, 600);
  assert.deepEqual(sets, [{windowState: 'normal'}, {width: 927, height: 629}]);
});

test('every Linux suite entry uses a disposable D-Bus session with the calling display and locale', () => {
  const parent = {HOME: '/real-home', DISPLAY: ':87', LANG: 'en_US.UTF-8',
    WAYLAND_DISPLAY: 'wayland-1', XDG_RUNTIME_DIR: '/original-runtime',
    DBUS_SESSION_BUS_ADDRESS: 'unix:path=/real-bus', GNOME_KEYRING_CONTROL: '/real-keyring'};
  const args = ['/candidate with spaces', '/results', '--slice=f0', '--only=sync'];
  let home;
  suite.runSuiteSession(args, parent, (command, child, {env, stdio}) => {
    assert.equal(command, 'dbus-run-session');
    assert.equal(child[0], '--');
    assert.equal(child[1], process.execPath);
    assert.match(child[2], /run-suite\.mjs$/);
    assert.deepEqual(child.slice(4), args);
    assert.equal(stdio, 'inherit');
    home = env.HOME;
    assert.notEqual(home, parent.HOME);
    assert.ok(fs.statSync(home).isDirectory());
    assert.equal(env.XDG_RUNTIME_DIR, path.join(home, 'runtime'));
    assert.equal(env.XDG_CURRENT_DESKTOP, 'GNOME');
    assert.equal(env.XAUTHORITY, path.join(parent.HOME, '.Xauthority'));
    assert.equal(env.DISPLAY, parent.DISPLAY);
    assert.equal(env.WAYLAND_DISPLAY, path.join(parent.XDG_RUNTIME_DIR, parent.WAYLAND_DISPLAY));
    assert.equal(env.LANG, parent.LANG);
    assert.equal(env.LC_ALL, undefined);
    assert.equal(env.DBUS_SESSION_BUS_ADDRESS, undefined);
    assert.equal(env.GNOME_KEYRING_CONTROL, undefined);
  });
  assert.equal(fs.existsSync(home), false);
});

test('the suite verifies a writable unlocked Secret Service before running cases', () => {
  for (const readable of [true, false]) {
    let stored;
    const commands = [];
    function run(command, args, options) {
      commands.push([command, ...args]);
      assert.ok(options.timeout > 0);
      if (command === 'gnome-keyring-daemon' && args.includes('--unlock')) assert.ok(options.input);
      if (command === 'secret-tool' && args[0] === 'store') stored = options.input;
      if (command === 'secret-tool' && args[0] === 'lookup') return readable ? stored + '\n' : '';
    }
    if (readable) suite.unlockSuiteKeyring(run);
    else assert.throws(() => suite.unlockSuiteKeyring(run), /Secret Service/);
    assert.deepEqual(commands.slice(0, 2), [
      ['gnome-keyring-daemon', '--unlock', '--components=secrets'],
      ['gnome-keyring-daemon', '--start', '--components=secrets'],
    ]);
    assert.ok(stored);
    assert.equal(commands[2][1], 'store');
    assert.equal(commands[3][1], 'lookup');
  }
});

test('unpacked F0 and the installed suite both install the keyring and its probe', () => {
  const workflow = YAML.parse(fs.readFileSync(new URL('../../.github/workflows/chromium-linux-candidate.yml', import.meta.url), 'utf8'));
  for (const job of [workflow.jobs.candidate, workflow.jobs.suite]) {
    const install = job.steps.map(step => step.run ?? '').join('\n').split('\n').filter(line => line.includes('apt-get install')).join('\n');
    for (const dependency of ['dbus', 'gnome-keyring', 'libsecret-tools']) assert.ok(install.includes(dependency), dependency);
  }
});

test('quieting a different Linux tab preserves the held loading response', async t => {
  linuxHost(t);
  const closed = [];
  const pages = ['quiet', 'loading'].map(targetId => ({targetId, cdp: {close: () => closed.push(targetId)}}));
  const world = {heldLoadingPages: [pages[1]], app: {refresh() {}, windows: () => pages,
    releasePages() { for (const page of pages) page.cdp.close(); }},
    native: async () => ({42: 'quiet'}), api: async (method, args) => {
      assert.equal(method, 'quietTab');
      assert.deepEqual(args, ['42']);
      return true;
    }};
  assert.equal(await tabs.sleepTab(world, '42'), true);
  assert.deepEqual(closed, ['quiet']);
  assert.equal(pages[0].cdp, null);
});

test('the Linux Spaces color and deletion steps wait for the editor before the next click', async t => {
  linuxHost(t);
  const {WINDOW_LAYOUT_STEPS} = await import('../tests/fork-steps/window-layout.mjs?linux');
  const actions = [];
  const page = {click: s => actions.push(s), waitForSelector: s => actions.push(s),
    fill: (s, hex) => actions.push([s, hex]), evaluate: async () => {}};
  const world = {frame: () => page, call: () => ({items: [{id: 'w', name: 'Work'}]})};
  const editor = ['[data-focus-key="edit:w"]', '#workspaceSwitcher[data-view="edit"]:not(.morphing)'];
  await WINDOW_LAYOUT_STEPS.get('I give {string} the custom color {string}').call(world, 'Work', '#F5E663');
  assert.deepEqual(actions, [...editor, '[data-focus-key="color:custom"]', '.space-picker-hex', ['.space-picker-hex', '#F5E663']]);
  actions.length = 0;
  await WINDOW_LAYOUT_STEPS.get('I delete {string} from its editor').call(world, 'Work');
  assert.deepEqual(actions, [...editor, '[data-focus-key="delete"]', '[data-focus-key="undo"]']);
});
