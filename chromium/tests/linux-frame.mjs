// node chromium/tests/linux-frame.mjs --display=x11|wayland CANDIDATE_DIR RESULTS_DIR
// Wayland needs Weston sockets at 1× (WAYLAND_DISPLAY) and 2× (BLANC_WAYLAND_DISPLAY_2X).
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { runtimeConfig } from '../linux/candidate.mjs';
import { pause, waitFor } from './lib/cdp.mjs';
import { NativeFixture } from './lib/fixture.mjs';
import { click, doubleClick, drag, windowGeometry } from './lib/native-input-linux.mjs';
import { assertNodeRuntime, assertRendering } from './lib/render-guard.mjs';
import { installDriver, nativeCall } from './lib/test-driver.mjs';
import { measureWaylandStrip } from './lib/wayland-strip.mjs';

const [flag, folder, resultDir, ...extra] = process.argv.slice(2);
const display = /^--display=(x11|wayland)$/.exec(flag)?.[1];
if (!display || !folder || !resultDir || extra.length)
  throw new Error('Usage: linux-frame.mjs --display=x11|wayland CANDIDATE_DIR RESULTS_DIR');
assertNodeRuntime();
assert.equal(process.platform, 'linux');
assert.notEqual(process.getuid(), 0);
assert.equal(fs.readFileSync('/proc/sys/kernel/apparmor_restrict_unprivileged_userns', 'utf8').trim(), '1');
if (display === 'wayland') {
  delete process.env.DISPLAY;
  assert.ok(process.env.WAYLAND_DISPLAY);
  assert.ok(process.env.BLANC_WAYLAND_DISPLAY_2X, 'Expected a second Weston socket with output scale 2');
} else {
  assert.ok(process.env.DISPLAY);
}
const candidate = JSON.parse(fs.readFileSync(path.join(folder, 'candidate.json')));
const config = runtimeConfig(path.resolve(folder), candidate);
const out = path.resolve(resultDir, 'frame-' + display);
fs.mkdirSync(out); // A prior run's captures must not become this run's evidence.
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-linux-frame-'));
const layouts = ['close,minimize,maximize:', ':minimize,maximize,close', 'close:maximize', ':close'];
const record = { candidate: candidate.id, display, arch: process.arch, cases: [] };
const run = (tool, args, options = {}) => execFileSync(tool, args,
  { encoding: 'utf8', timeout: 10000, ...options }).trim();

function configureGtk(directory, layout) {
  process.env.XDG_CONFIG_HOME = directory;
  process.env.GDK_BACKEND = display;
  process.env.GSETTINGS_BACKEND = 'keyfile';
  const gtk = path.join(directory, 'gtk-3.0');
  fs.mkdirSync(gtk, { recursive: true });
  fs.writeFileSync(path.join(gtk, 'settings.ini'),
    '[Settings]\ngtk-decoration-layout=' + layout + '\ngtk-titlebar-double-click=toggle-maximize\n');
  // GDK Wayland can supply the setting through GSettings, above the ini file.
  // Both sources are private to this launch. Check GtkSettings itself before
  // comparing Chromium's independently observed button ordering.
  run('gsettings', ['set', 'org.gnome.desktop.wm.preferences', 'button-layout', layout]);
  const actual = run('gtk-query-settings', ['gtk-decoration-layout']);
  assert.equal(actual, 'gtk-decoration-layout: "' + layout + '"');
  return actual;
}

const readStrip = fixture => fixture.host.eval(`(() => {
  const frame = document.getElementById('strip'), doc = frame.contentDocument;
  const style = frame.contentWindow.getComputedStyle(doc.documentElement);
  const box = id => doc.getElementById(id).getBoundingClientRect().toJSON();
  return { payload: window.BlancPrototypeHost.windowButtons(), width: frame.clientWidth,
    scale: frame.contentWindow.devicePixelRatio, height: frame.clientHeight,
    leading: style.getPropertyValue('--window-controls-leading-w').trim(),
    trailing: style.getPropertyValue('--window-controls-w').trim(),
    controls: frame.contentWindow.getComputedStyle(doc.getElementById('windowControls')).display,
    pill: box('islandPill'), menu: box('mainMenuButton') };
})()`);
const intersects = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width &&
  a.y < b.y + b.height && b.y < a.y + a.height;

async function observeLayout(fixture, layout, scale) {
  return waitFor(async () => {
    const state = await readStrip(fixture);
    const { buttons, leading, trailing } = state.payload;
    assert.equal(state.scale, scale);
    assert.equal(state.controls, 'none');
    assert.equal(state.leading, leading + 'px');
    assert.equal(state.trailing, trailing + 'px');
    assert.ok(state.pill.width && state.pill.height && state.menu.width && state.menu.height);
    const sorted = buttons.toSorted((a, b) => a.x - b.x);
    const left = sorted.filter(b => b.x + b.width / 2 < state.width / 2);
    const right = sorted.slice(left.length);
    const observed = [left, right].map(side => side.map(b => b.kind).join(',')).join(':');
    assert.equal(observed, layout);
    assert.equal(leading, Math.max(0, ...left.map(b => b.x + b.width)));
    assert.equal(trailing, Math.max(0, ...right.map(b => state.width - b.x)));
    for (const b of buttons) {
      assert.ok(b.width > 0 && b.height > 0 && b.y < state.height && b.y + b.height > 0);
      assert.ok(!intersects(b, state.pill) && !intersects(b, state.menu), JSON.stringify({ b, state }));
    }
    return { ...state, observed };
  }, Boolean, 'native button order and strip clearance ' + layout);
}

// Wayland has no global window positions. Paint a marker over the WebUI, then
// locate it on Weston's actual output. A native button above the WebUI leaves
// visible ink at the center of its rect. A button covered by the WebView does not.
async function waylandPixels(fixture, state, name) {
  const pictures = path.join(scratch, name + '-capture');
  fs.mkdirSync(pictures);
  await fixture.host.eval(`(() => {
    const doc = document.getElementById('strip').contentDocument;
    const marker = doc.createElement('div');
    marker.id = 'frame-pixel-probe';
    marker.style.cssText = 'position:fixed;inset:0;background:rgb(16,240,123);z-index:2147483647;pointer-events:none';
    doc.body.append(marker);
  })()`);
  try {
    const image = path.join(out, name + '.png');
    // A renderer animation frame doesn't acknowledge presentation by Weston.
    // Keep the last capture as evidence even if the probe never appears.
    const deadline = Date.now() + 5000;
    do {
      run('weston-screenshooter', [], { cwd: pictures, env: { ...process.env, XDG_PICTURES_DIR: pictures } });
      const files = fs.readdirSync(pictures).filter(file => file.endsWith('.png'));
      assert.equal(files.length, 1);
      const capture = path.join(pictures, files[0]);
      fs.copyFileSync(capture, image);
      fs.unlinkSync(capture);
      const pixels = await sharp(image).removeAlpha().raw().toBuffer({ resolveWithObject: true });
      const measurement = measureWaylandStrip(pixels, state);
      if (measurement) return { image: path.basename(image), ...measurement };
      await pause(100);
    } while (Date.now() < deadline);
    assert.fail('Weston did not present any strip probe pixels in ' + image);
  } finally {
    await fixture.host.eval("document.getElementById('strip').contentDocument.getElementById('frame-pixel-probe')?.remove()");
  }
}

async function activeWindow(fixture) {
  return waitFor(() => {
    const id = run('xdotool', ['getactivewindow']);
    return Number(run('xdotool', ['getwindowpid', id])) === fixture.process.pid && id;
  }, Boolean, 'managed browser window');
}

const nativeGeometry = fixture => nativeCall(fixture.host, 'linuxFrameGeometry');
const xState = id => run('xprop', ['-id', id, '_NET_WM_STATE', 'WM_STATE']);
const maximized = state => ['HORZ', 'VERT'].every(axis => state.includes('_NET_WM_STATE_MAXIMIZED_' + axis));
const iconic = state => /window state: Iconic|_NET_WM_STATE_HIDDEN/.test(state);
const center = rect => ({ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 });

async function zoomedControls(fixture, scale) {
  const zoom = 0.75;
  await nativeCall(fixture.host, 'setIslandZoomFactor', [zoom]);
  try {
    return await waitFor(async () => {
      const state = await readStrip(fixture);
      assert.ok(Math.abs(state.scale - scale * zoom) < 0.001);
      const { leading, trailing, buttons } = state.payload;
      assert.ok(buttons.length > 0);
      assert.ok(Math.abs(parseFloat(state.leading) * zoom - leading) < 0.01);
      assert.ok(Math.abs(parseFloat(state.trailing) * zoom - trailing) < 0.01);
      assert.ok(state.menu.width > 0 && state.menu.left * zoom >= leading);
      const { x, y } = center(state.menu);
      assert.equal(await nativeCall(fixture.host, 'captionAt', [Math.round(x * zoom), Math.round(y * zoom)]), false);
      return state;
    }, Boolean, '75% WebUI clears the native buttons and the menu accepts clicks');
  } finally {
    await nativeCall(fixture.host, 'setIslandZoomFactor', [1]);
  }
}

async function dragBandRows(fixture) {
  await nativeCall(fixture.host, 'setIslandAutoHideStyle', ['float']);
  await nativeCall(fixture.host, 'setIslandAutoHide', [true]);
  try {
    await waitFor(() => nativeCall(fixture.host, 'autoHideState'), s => s.floating && !s.sliding, 'floating strip');
    const { client } = await nativeGeometry(fixture);
    const rows = [];
    for (const y of [5, 6, 9])
      rows.push(await nativeCall(fixture.host, 'captionAt', [Math.floor(client.width / 2), y]));
    assert.deepEqual(rows, [true, false, false]);
    return rows;
  } finally {
    await nativeCall(fixture.host, 'setIslandAutoHide', [false]);
  }
}

async function x11Input(fixture, layout, scale, result) {
  const id = await activeWindow(fixture);
  const pointer = async point => {
    const { strip } = await nativeGeometry(fixture);
    return [(strip.x + point.x) * scale, (strip.y + point.y) * scale];
  };
  const press = async kind => {
    const state = await observeLayout(fixture, layout, scale);
    const button = state.payload.buttons.find(b => b.kind === kind);
    assert.ok(button, kind + ' must be present for this click');
    click(...await pointer(center(button)));
  };
  const stateIs = (predicate, label) => waitFor(() => xState(id), predicate, label);
  if (layout.includes('minimize')) {
    await press('minimize');
    result.minimized = await stateIs(iconic, 'minimized by native button');
    run('xdotool', ['windowactivate', '--sync', id]);
    await stateIs(s => !iconic(s), 'restored from icon');
  }
  if (layout.includes('maximize')) {
    await press('maximize');
    result.maximized = await stateIs(maximized, 'maximized by native button');
    await press('maximize'); // The same payload kind now locates Restore.
    await stateIs(s => !maximized(s), 'restored by native button');
  }
  const resting = await observeLayout(fixture, layout, scale);
  // Grab a real gap on the strip, choosing the larger side of the pill.
  const gaps = [[Math.max(resting.payload.leading, resting.menu.right), resting.pill.left],
    [resting.pill.right, resting.width - resting.payload.trailing]];
  const [start, end] = gaps.sort((a, b) => (b[1] - b[0]) - (a[1] - a[0]))[0];
  assert.ok(end - start > 12);
  const grab = { x: (start + end) / 2, y: 24 };
  let [x, y] = await pointer(grab);
  const initial = windowGeometry(id);
  drag(x, y, x + 64 * scale, y + 42 * scale);
  result.moved = await waitFor(() => windowGeometry(id), r => r.x > initial.x + 20 * scale &&
    r.y > initial.y + 10 * scale && r.width === initial.width && r.height === initial.height, 'strip drag moves window');
  [x, y] = await pointer(grab);
  await pause(500);
  doubleClick(x, y);
  await stateIs(maximized, 'strip double-click maximizes');
  const full = await observeLayout(fixture, layout, scale);
  doubleClick(...await pointer({ x: (full.menu.right + full.pill.left) / 2, y: 24 }));
  await stateIs(s => !maximized(s), 'strip double-click restores');

  const { client } = await nativeGeometry(fixture);
  // Just outside the client, inside the frame's live resize border (including
  // on a composited desktop whose outermost window pixels are a shadow).
  x = (client.x + client.width) * scale;
  y = (client.y + client.height) * scale;
  const before = windowGeometry(id);
  drag(x, y, x + 52 * scale, y + 34 * scale);
  result.resized = await waitFor(() => windowGeometry(id), r =>
    r.width > before.width + 20 * scale && r.height > before.height + 10 * scale &&
    r.x === before.x && r.y === before.y, 'bottom-right border resizes window');

  const { menu } = await observeLayout(fixture, layout, scale);
  const anchor = await pointer({ x: menu.left, y: menu.bottom });
  click(...await pointer(center(menu)));
  result.menu = await waitFor(async () => (await nativeGeometry(fixture)).menu, b => b &&
    b.width > 0 && b.height > 0 && Math.abs(b.x - anchor[0] / scale) <= 16 &&
    Math.abs(b.y - anchor[1] / scale) <= 16, 'Chromium app menu at the strip button');
  run('xdotool', ['key', 'Escape']);
  await waitFor(nativeGeometry.bind(null, fixture), g => !g.menu, 'menu dismissed');

  await press('close');
  await waitFor(() => run('xprop', ['-root', '_NET_CLIENT_LIST']), listing =>
    ![...listing.matchAll(/0x[\da-f]+/gi)].some(m => Number(m[0]) === Number(id)), 'Close removes the window');
  await waitFor(() => fixture.exit, Boolean, 'last window closes the browser');
  assert.equal(fixture.exit.code, 0);
  result.close = true;
}

async function systemTitlebar(fixture, scale) {
  // Read the same profile again with Chromium's actual Settings preference
  // changed on disk while stopped. Openbox supplies the independent proof.
  await fixture.stop();
  const file = path.join(fixture.profile, 'Default', 'Preferences');
  const prefs = JSON.parse(fs.readFileSync(file));
  (prefs.browser ??= {}).custom_chrome_frame = false;
  fs.writeFileSync(file, JSON.stringify(prefs));
  await fixture.start(fixture.base + '/initial');
  await installDriver(fixture.host);
  const state = await observeLayout(fixture, ':', scale);
  assert.deepEqual(state.payload, { leading: 0, trailing: 0, buttons: [], deviceScaleFactor: scale });
  const id = await activeWindow(fixture);
  const extents = await waitFor(() => run('xprop', ['-id', id, '_NET_FRAME_EXTENTS']),
    value => / = \d+, \d+, \d+, \d+$/.test(value), 'window manager frame extents');
  const [, , top, bottom] = extents.split(' = ')[1].split(', ').map(Number);
  assert.ok(top > bottom + 5, 'Openbox must supply a title bar above the client');
  const info = run('xwininfo', ['-id', id]);
  const y = Number(/Absolute upper-left Y:\s*(-?\d+)/.exec(info)?.[1]);
  const { strip } = await nativeGeometry(fixture);
  assert.ok(Math.abs(strip.y * scale - y) <= 5 * scale, 'strip starts directly inside system decorations');
  return { extents, clientTop: y, stripTop: strip.y };
}

try {
  for (const scale of [1, 2]) {
    if (display === 'wayland' && scale === 2) process.env.WAYLAND_DISPLAY = process.env.BLANC_WAYLAND_DISPLAY_2X;
    for (const [i, layout] of layouts.entries()) {
      const name = 'layout-' + (i + 1) + '-' + scale + 'x';
      const result = { layout, scale };
      record.cases.push(result);
      const fixture = new NativeFixture();
      try {
        result.gtk = configureGtk(path.join(scratch, name + '-config'), layout);
        fixture.extraArgs = ['--ozone-platform=' + display, '--gtk-version=3', '--window-size=900,560'];
        if (display === 'x11') fixture.extraArgs.push('--force-device-scale-factor=' + scale, '--window-position=80,80');
        await fixture.launch(config, path.join(scratch, name), { testHooks: true, diskAssets: config.diskAssets });
        await installDriver(fixture.host);
        await assertRendering(expr => fixture.host.eval(expr));
        result.zoomed = await zoomedControls(fixture, scale);
        if (i === 0) result.dragBand = await dragBandRows(fixture);
        result.strip = await observeLayout(fixture, layout, scale);
        if (display === 'x11') {
          await x11Input(fixture, layout, scale, result);
          result.systemTitlebar = await systemTitlebar(fixture, scale);
        } else {
          result.compositor = await waylandPixels(fixture, result.strip, name);
        }
      } catch (error) {
        result.error = error.stack;
      } finally {
        try {
          const exit = await fixture.close();
          if (exit) assert.equal(exit.code, 0, 'frame fixture exits cleanly');
        } catch (error) { result.closeError = error.stack; }
        if (fixture.directory) {
          const log = path.join(fixture.directory, 'browser.log');
          if (fs.existsSync(log)) fs.copyFileSync(log, path.join(out, name + '.log'));
        }
      }
    }
  }
  record.pass = record.cases.every(result => !result.error && !result.closeError);
  if (!record.pass) process.exitCode = 1;
} catch (error) {
  record.error = error.stack;
  record.pass = false;
  process.exitCode = 1;
} finally {
  fs.rmSync(scratch, { recursive: true, force: true });
  fs.writeFileSync(path.join(out, 'frame.json'), JSON.stringify(record, null, 2) + '\n');
  console.log(JSON.stringify(record));
}
