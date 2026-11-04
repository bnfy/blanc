// Window snapshots for the owner, without Screen Recording permission: the
// active page, the Island host and native views (the settings sheet) are
// captured separately over DevTools and composited at their window
// positions (lib/compose-png.swift). Runs only in an isolated fixture.
//   node chromium/tests/window-snapshot.mjs runtime-config.json out-dir [scene ...]
// Scenes: page, palette, settings, settings-<section> such as settings-privacy
// (default: page, palette, settings).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {NativeFixture} from './lib/fixture.mjs';
import {waitFor, pause} from './lib/cdp.mjs';
import {installDriver, nativeCall} from './lib/test-driver.mjs';
import {shippingPageUrl} from './lib/page-shim.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
// The settings sheet shows chrome://settings, Blanc's sections inside it.
const SETTINGS = /^chrome:\/\/settings\//;

async function capture(connection, file, {transparent = false} = {}) {
  if (transparent) await connection.send('Emulation.setDefaultBackgroundColorOverride', {color: {r: 0, g: 0, b: 0, a: 0}});
  const {data} = await connection.send('Page.captureScreenshot', {format: 'png'});
  if (transparent) await connection.send('Emulation.setDefaultBackgroundColorOverride', {});
  fs.writeFileSync(file, Buffer.from(data, 'base64'));
}

// One composited PNG of the window as it is now.
export async function snapshotWindow(fixture, file) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-snapshot-'));
  try {
    const host = fixture.host;
    // The active page fills the window below (or beside) the Island; its
    // target names the window (the Island host's doesn't).
    const snapshot = await fixture.snapshot();
    const active = snapshot.tabs.find(t => String(t.id) === String(snapshot.activeTabId));
    const pageTarget = (await fixture.targets()).find(t => t.type === 'page' && (t.url === active?.url || shippingPageUrl(t.url) === active?.url));
    if (!pageTarget) throw Error('No target for the active page ' + active?.url);
    const {windowId} = await fixture.browser.send('Browser.getWindowForTarget', {targetId: pageTarget.id});
    const {bounds} = await fixture.browser.send('Browser.getWindowBounds', {windowId});
    const scale = await host.eval('devicePixelRatio');
    const hostSize = await host.eval('({w: innerWidth, h: innerHeight})');
    const layers = [];
    if (pageTarget) {
      const page = await fixture.connectTarget(pageTarget);
      const size = await page.eval('({w: innerWidth, h: innerHeight})');
      await capture(page, path.join(dir, 'page.png'));
      page.close();
      layers.push(['page.png', bounds.width - size.w, bounds.height - size.h, size.w, size.h]);
    }
    await capture(host, path.join(dir, 'host.png'), {transparent: true});
    layers.push(['host.png', 0, 0, hostSize.w, hostSize.h]);
    const sheet = await nativeCall(host, 'settingsSheetState').catch(() => null);
    if (sheet?.attached) {
      const target = (await fixture.targets()).find(t => t.type === 'page' && SETTINGS.test(t.url));
      if (target) {
        const settings = await fixture.connectTarget(target);
        await capture(settings, path.join(dir, 'settings.png'));
        settings.close();
        const b = sheet.bounds;
        layers.push(['settings.png', b.x, b.y, b.width, b.height]);
      }
    }
    const px = v => String(Math.round(v * scale));
    execFileSync('swift', [path.join(here, 'lib/compose-png.swift'), file, px(bounds.width), px(bounds.height),
      ...layers.flatMap(([name, x, y, w, h]) => [path.join(dir, name), px(x), px(y), px(w), px(h)])]);
    return file;
  } finally {
    fs.rmSync(dir, {recursive: true, force: true});
  }
}

const SCENES = {
  page: async () => {},
  palette: async fixture => {
    await fixture.host.eval('window.BlancPrototypeHost.open(false)');
    await pause(800);
  },
  settings: fixture => openSettings(fixture, ''),
};
// settings-<section> opens that section in the same sheet (settings-privacy);
// island-<size> picks that Island size in Settings and shows the window.
const scene = name => SCENES[name] ?? (name.startsWith('settings-') ? fixture => openSettings(fixture, name.slice(9))
  : /^island-(default|large|extra-large)$/.test(name) ? fixture => setIslandSize(fixture, name.slice(7))
  : /^newtab(-(de|es|fr|it|pt-BR))?$/.test(name) ? fixture => openStartPage(fixture, name.slice(7) || null) : null);
// newtab[-<language>] shows the Start Page, after relaunching with that
// interface language chosen in Settings when one is named.
async function openStartPage(fixture, language) {
  if (language) {
    await nativeCall(fixture.host, 'setStoredUiLanguage', [language]);
    await fixture.stop();
    await fixture.start();
    await installDriver(fixture.host);
  }
  await nativeCall(fixture.host, 'createTab', ['chrome://newtab/']);
  await pause(2500);
}
export async function setIslandSize(fixture, size) {
  const settings = await openSettings(fixture, 'appearance', true);
  const set = await settings.eval(`(() => {
    const find = (root, sel) => { const hit = root.querySelector(sel); if (hit) return hit;
      for (const el of root.querySelectorAll('*')) { const r = el.shadowRoot && find(el.shadowRoot, sel); if (r) return r; } return null; };
    const select = find(document, '#blancIslandSize')?.shadowRoot?.querySelector('select');
    if (!select) return false;
    select.value = ${JSON.stringify(size)}; select.dispatchEvent(new Event('change', {bubbles: true})); return true;
  })()`);
  settings.close();
  if (set !== true) throw Error('Settings has no Island size control');
  await fixture.host.eval('window.BlancPrototypeHost.closeSheet()');
  await pause(1500);
}
async function openSettings(fixture, section, keep = false) {
  await fixture.host.eval(`window.BlancPrototypeHost.api.openPage('settings', ${JSON.stringify(section)})`);
  await waitFor(() => nativeCall(fixture.host, 'settingsSheetState'), s => s.attached, 'settings sheet');
  const target = await waitFor(async () => (await fixture.targets()).find(t => t.type === 'page' && SETTINGS.test(t.url)), Boolean, 'settings page');
  const settings = await fixture.connectTarget(target);
  await waitFor(() => settings.eval('document.readyState'), s => s === 'complete', 'settings loaded');
  await pause(1500);
  if (keep) return settings;
  settings.close();
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [configPath, outDir, ...asked] = process.argv.slice(2);
  if (!configPath || !outDir) throw Error('Usage: window-snapshot.mjs runtime-config.json out-dir [scene ...]');
  const scenes = asked.length ? asked : Object.keys(SCENES);
  for (const name of scenes) if (!scene(name)) throw Error('Unknown scene: ' + name);
  const config = JSON.parse(fs.readFileSync(configPath));
  fs.mkdirSync(outDir, {recursive: true});
  for (const name of scenes) {
    const fixture = new NativeFixture();
    try {
      await fixture.launch(config, fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-snapshot-run-')) + '/case', {diskAssets: false, testHooks: true});
      await installDriver(fixture.host);
      await scene(name)(fixture);
      console.log(await snapshotWindow(fixture, path.join(outDir, `${name}.png`)));
    } finally {
      await fixture.close();
    }
  }
}
