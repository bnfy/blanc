import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { _electron } from 'playwright';
import testHookCall from './support/test-hook-call.js';
import poll from './support/poll.js';
const { callTestHook } = testHookCall;
const { waitForValue } = poll;
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-wallpaper-'));
const profile = path.join(root, 'profile');
fs.mkdirSync(`${profile}-Dev`);
fs.writeFileSync(path.join(`${profile}-Dev`, 'settings.json'), JSON.stringify({
  onboardingVersion: 1, presentationDefaultsResetVersion: 1,
  adblockEnabled: false, usagePing: false, searchSuggestions: false,
  newtabWallpaperCity: '5128581', // Retired dev preference must be removed.
}));
const output = process.env.BLANC_WALLPAPER_REVIEW_DIR;
if (output) fs.mkdirSync(output, { recursive: true });
const { ELECTRON_RUN_AS_NODE: ignored, ...env } = process.env;
const uncaught = path.join(root, 'uncaught.log');
let app;
try {
  app = await _electron.launch({ args: [path.resolve('.'), `--user-data-dir=${profile}`], env: { ...env, BLANC_TEST: '1', BLANC_TEST_UNCAUGHT_LOG: uncaught } });
  const page = await waitForValue(async () => (await app.windows()).find((p) => p.url() === 'blanc://newtab/'), Boolean, 'new tab');
  const footerToggle = page.getByRole('button', { name: 'Time-of-day wallpaper', exact: true });
  await page.waitForFunction(() => !document.getElementById('dynamicWallpaperToggle').disabled);
  const data = await page.evaluate(() => window.bowserPages.start.data());
  assert.equal(data.patronActive, false);
  assert.equal(data.dynamicWallpaperEnabled, false, 'wallpaper remains opt-in');
  assert.equal('newtabWallpaperCity' in JSON.parse(fs.readFileSync(path.join(`${profile}-Dev`, 'settings.json'))), false);
  assert.equal(await footerToggle.getAttribute('aria-pressed'), 'false');
  for (const value of ['true', 1, null, { newtabDynamicWallpaper: true, usagePing: true }]) {
    assert.equal(await page.evaluate((value) => window.bowserPages.start.setDynamicWallpaper(value), value), false,
      'malformed footer writes cannot enable wallpaper or change other settings');
  }
  await footerToggle.click();
  await page.waitForFunction(() => document.body.dataset.wallpaperPhase);
  assert.equal(await footerToggle.getAttribute('aria-pressed'), 'true');
  assert.equal((await page.evaluate(() => window.bowserPages.start.data())).dynamicWallpaperEnabled, true,
    'footer enables the free setting without Patron');
  assert.equal(JSON.parse(fs.readFileSync(path.join(`${profile}-Dev`, 'settings.json'))).usagePing, false);
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1200, 820));
  const privateId = await callTestHook(app, 'openTab', ['blanc://newtab/?private=1', { private: true }]);
  const privatePage = await waitForValue(async () => (await app.windows()).find((p) => p.url() === 'blanc://newtab/?private=1'), Boolean, 'private start page');
  await privatePage.waitForFunction(() => document.body.dataset.wallpaperPhase);
  await page.waitForFunction(() => document.body.dataset.wallpaperVisible === 'false');
  const publicId = (await callTestHook(app, 'state')).tabs.find((tab) => tab.url === 'blanc://newtab/').id;
  for (const style of ['light', 'dark', 'private']) {
    const current = style === 'private' ? privatePage : page;
    await callTestHook(app, 'activateTab', [style === 'private' ? privateId : publicId, true]);
    await callTestHook(app, 'setAppearance', [style === 'private' ? 'dark' : style]);
    await current.emulateMedia({ reducedMotion: 'reduce', colorScheme: style === 'light' ? 'light' : 'dark' });
    assert.equal(await current.evaluate(() => matchMedia('(prefers-color-scheme: dark)').matches), style !== 'light');
    for (const layout of ['ledger', 'billboard', 'shelf', 'tally']) {
      await callTestHook(app, 'setNewtabLayout', [layout]);
      await current.waitForFunction((layout) => document.body.dataset.layout === layout, layout);
      for (const [phase, hour] of [['dawn',6],['day',12],['dusk',18],['night',23]]) {
        await current.evaluate((hour) => {
          Date.prototype.getHours = () => hour;
          // Global lexical binding belongs to the shipped start-page script.
          wallpaper.refresh();
        }, hour);
        await current.waitForFunction((phase) => document.body.dataset.wallpaperPhase === phase, phase);
        // Theme/layout image updates settle independently of wallpaper loading.
        // Wait for those resources before checking for broken assets.
        await current.waitForFunction(() => [...document.querySelectorAll('img')]
          .every((img) => img.complete && img.naturalWidth > 0));
        const check = await current.evaluate(() => ({
          visible: [...document.querySelectorAll('.start-wallpaper-layer')].filter((el) => el.classList.contains('is-visible')).length,
          images: [...document.querySelectorAll('img')].filter((img) => !img.complete || img.naturalWidth === 0).map((img) => img.src),
          private: document.documentElement.dataset.theme === 'private',
        }));
        assert.equal(check.visible, 1); assert.deepEqual(check.images, []);
        assert.equal(check.private, style === 'private');
        if (output) await current.screenshot({ path: path.join(output, `${phase}-${layout}-${style}.png`) });
      }
      // Use the visible footer in every layout and styling combination.
      const switcher = current.getByRole('button', { name: 'Time-of-day wallpaper', exact: true });
      for (const width of [640, 800, 1040, 1041, 1200]) {
        await app.evaluate(({ BrowserWindow }, width) => BrowserWindow.getAllWindows()[0].setContentSize(width, 820), width);
        await current.waitForFunction((width) => innerWidth === width, width);
        const boxes = await current.evaluate(() => {
          const rect = (selector) => {
            const { x, y, right, bottom, width, height } = document.querySelector(selector).getBoundingClientRect();
            return { x, y, right, bottom, width, height };
          };
          return {
            footer: rect('#layoutFooter'), toggle: rect('#dynamicWallpaperToggle'),
            layout: rect('#layoutSwitcher'), appearance: rect('.footer-appearance'),
            left: rect('.footer-left'), right: rect('.footer-right'),
            viewport: { width: innerWidth, height: innerHeight },
          };
        });
        assert.ok(boxes.toggle.width > 0 && boxes.toggle.height >= 24);
        assert.ok(boxes.toggle.x >= 0 && boxes.toggle.right <= boxes.viewport.width);
        assert.ok(boxes.toggle.y >= boxes.footer.y && boxes.toggle.bottom <= boxes.viewport.height);
        assert.ok(Math.abs((boxes.layout.y + boxes.layout.height / 2)
          - (boxes.toggle.y + boxes.toggle.height / 2)) < 1, 'appearance controls share a vertical center');
        assert.ok(boxes.toggle.x - boxes.layout.right >= 10 && boxes.toggle.x - boxes.layout.right <= 20,
          'wallpaper switch sits beside the layout picker');
        for (const other of [boxes.appearance, boxes.left]) {
          assert.ok(boxes.right.x >= other.right || boxes.right.right <= other.x
            || boxes.right.y >= other.bottom || boxes.right.bottom <= other.y,
          `footer controls do not overlap at ${width}px in ${layout}/${style}`);
        }
        if (output && [640, 1200].includes(width)) {
          await current.screenshot({ path: path.join(output, `footer-${width}-${layout}-${style}.png`) });
        }
      }
      await switcher.click();
      await current.waitForFunction(() => document.getElementById('dynamicWallpaperToggle').getAttribute('aria-pressed') === 'false'
        && !document.body.dataset.wallpaperPhase);
      await (current === page ? privatePage : page).waitForFunction(() =>
        document.getElementById('dynamicWallpaperToggle').getAttribute('aria-pressed') === 'false');
      await waitForValue(() => JSON.parse(fs.readFileSync(path.join(`${profile}-Dev`, 'settings.json'))).newtabDynamicWallpaper,
        (enabled) => enabled === false, 'footer preference persisted');
      await switcher.focus();
      await switcher.press('Space');
      await current.waitForFunction(() => document.getElementById('dynamicWallpaperToggle').getAttribute('aria-pressed') === 'true'
        && document.body.dataset.wallpaperPhase === 'night');
    }
  }
  // Actual compositor opacity must fade both ways, including a fast reversal.
  await privatePage.emulateMedia({ reducedMotion: 'no-preference', colorScheme: 'dark' });
  await privatePage.evaluate(() => { Date.prototype.getHours = () => 12; wallpaper.refresh(); });
  await privatePage.waitForFunction(() => document.body.dataset.wallpaperPhase === 'day'
    && !document.querySelector('.start-wallpaper-layer.is-fading'));
  const privateSwitch = privatePage.getByRole('button', { name: 'Time-of-day wallpaper', exact: true });
  await privateSwitch.click();
  await privatePage.waitForFunction(() => !document.body.dataset.wallpaperPhase
    && [...document.querySelectorAll('.start-wallpaper-layer')].some((layer) => {
      const opacity = Number(getComputedStyle(layer).opacity);
      // Reverse partway through the fade. Reversing its first few frames can
      // finish before the automation receives the click acknowledgement.
      return opacity > 0.2 && opacity < 0.6;
    }));
  assert.equal(await privatePage.locator('.start-wallpaper-layer.is-fading').count(), 2);
  assert.equal(await privatePage.locator('.start-wallpaper-layer.is-fading').first().evaluate((layer) =>
    getComputedStyle(layer).transitionDuration), '2s');
  // Resume broadcasts repeat the preference; they must leave this fade intact.
  await app.evaluate(({ powerMonitor }) => powerMonitor.emit('resume'));
  await privatePage.evaluate(() => window.bowserPages.start.data());
  assert.equal(await privatePage.locator('.start-wallpaper-layer.is-fading').count(), 2);
  await privateSwitch.click();
  await privatePage.waitForFunction(() => document.body.dataset.wallpaperPhase === 'day'
    && [...document.querySelectorAll('.start-wallpaper-layer.is-visible')].some((layer) => {
      const opacity = Number(getComputedStyle(layer).opacity);
      return opacity > 0.1 && opacity < 0.95;
    }));
  await privatePage.waitForFunction(() => !document.querySelector('.start-wallpaper-layer.is-fading'));
  assert.equal(await privatePage.locator('.start-wallpaper-layer.is-visible').count(), 1);
  await privateSwitch.click();
  await privatePage.waitForFunction(() => !document.body.dataset.wallpaperPhase
    && !document.querySelector('.start-wallpaper-layer.is-fading'));
  assert.equal(await privatePage.locator('.start-wallpaper-layer.is-visible').count(), 0);
  await privateSwitch.click();
  await privatePage.waitForFunction(() => document.body.dataset.wallpaperPhase === 'day'
    && [...document.querySelectorAll('.start-wallpaper-layer.is-visible')].some((layer) => {
      const opacity = Number(getComputedStyle(layer).opacity);
      return opacity > 0.1 && opacity < 0.95;
    }));
  await privatePage.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'dark' });
  await privatePage.waitForFunction(() => !document.querySelector('.start-wallpaper-layer.is-fading'));
  assert.equal(await privatePage.locator('.start-wallpaper-layer.is-visible').evaluate((layer) =>
    getComputedStyle(layer).opacity), '1', 'reduced motion settles immediately at the target opacity');
  await privatePage.evaluate(() => { Date.prototype.getHours = () => 23; wallpaper.refresh(); });
  await privatePage.waitForFunction(() => document.body.dataset.wallpaperPhase === 'night');
  // Reload and normal/private tab activation must reflect the saved choice.
  await callTestHook(app, 'activateTab', [publicId, true]);
  await page.reload();
  await page.waitForFunction(() => document.getElementById('dynamicWallpaperToggle').getAttribute('aria-pressed') === 'true'
    && document.body.dataset.wallpaperPhase);
  await callTestHook(app, 'activateTab', [privateId, true]);
  await callTestHook(app, 'openSettings');
  const sheet = await waitForValue(async () => (await app.windows()).find((p) => p.url() === 'blanc://settings/'), Boolean, 'settings sheet');
  const toggle = sheet.locator('#newtabDynamicWallpaper');
  await toggle.waitFor({ state: 'visible' });
  assert.equal(await toggle.isEnabled(), true, 'free setting is enabled without Patron');
  await sheet.waitForFunction(() => document.getElementById('newtabDynamicWallpaper').checked);
  assert.equal(await sheet.getByLabel('Wallpaper city', { exact: true }).count(), 0, 'scheduling has no separate city control');
  assert.equal(await toggle.isChecked(), true);
  await toggle.uncheck();
  await privatePage.waitForFunction(() => !document.body.dataset.wallpaperPhase
    && document.getElementById('dynamicWallpaperToggle').getAttribute('aria-pressed') === 'false');
  await page.waitForFunction(() => document.getElementById('dynamicWallpaperToggle').getAttribute('aria-pressed') === 'false');
  assert.equal(await privatePage.locator('.start-wallpaper-layer.is-visible').count(), 0);
  await toggle.check();
  await callTestHook(app, 'closeUtilitySurface');
  await privatePage.waitForFunction(() => document.body.dataset.wallpaperPhase === 'night'
    && document.getElementById('dynamicWallpaperToggle').getAttribute('aria-pressed') === 'true');
  // Start from dusk so the 7 PM check cannot accept the previous night frame
  // while the controller is still loading the newly requested artwork.
  await privatePage.evaluate(() => { Date.prototype.getHours = () => 18; wallpaper.refresh(); });
  await privatePage.waitForFunction(() => document.body.dataset.wallpaperPhase === 'dusk');
  await privatePage.evaluate(() => { Date.prototype.getHours = () => 19; wallpaper.refresh(); });
  await privatePage.waitForFunction(() => document.body.dataset.wallpaperPhase === 'night');
  // Observe the mounted controller's actual minute timeout, not only its
  // visibility attribute. Native detached views can still report visible.
  await privatePage.evaluate(() => {
    window.wallpaperMinuteTimers = new Set();
    const schedule = window.setTimeout.bind(window);
    const cancel = window.clearTimeout.bind(window);
    window.setTimeout = (fn, delay, ...args) => {
      let id;
      id = schedule(() => { wallpaperMinuteTimers.delete(id); fn(...args); }, delay);
      if (fn.name === 'refresh') wallpaperMinuteTimers.add(id);
      return id;
    };
    window.clearTimeout = (id) => { wallpaperMinuteTimers.delete(id); cancel(id); };
    wallpaper.refresh();
  });
  assert.equal(await privatePage.evaluate(() => wallpaperMinuteTimers.size), 1);
  // CI's bare Xvfb has no window manager to honor X11 minimization. Exercise
  // real hide/show events there; native desktop runners retain minimize/restore.
  const hiddenAction = process.platform === 'linux' ? 'hide' : 'minimize';
  const visibleAction = process.platform === 'linux' ? 'show' : 'restore';
  await app.evaluate(({ BrowserWindow }, action) => BrowserWindow.getAllWindows()[0][action](), hiddenAction);
  await privatePage.waitForFunction(() => document.body.dataset.wallpaperVisible === 'false');
  assert.equal(await privatePage.evaluate(() => wallpaperMinuteTimers.size), 0);
  await app.evaluate(({ BrowserWindow }, action) => BrowserWindow.getAllWindows()[0][action](), visibleAction);
  await privatePage.waitForFunction(() => document.body.dataset.wallpaperVisible === 'true');
  assert.equal(await privatePage.evaluate(() => wallpaperMinuteTimers.size), 1);
  await app.evaluate(({ powerMonitor }) => powerMonitor.emit('resume'));
  assert.equal((await privatePage.evaluate(() => window.bowserPages.start.data())).dynamicWallpaperEnabled, true);
  if (process.platform === 'darwin') {
    const contentsId = await app.evaluate(({ webContents }) => webContents.getAllWebContents()
      .find((wc) => wc.getURL() === 'blanc://newtab/?private=1').id);
    const closedWindowId = await app.evaluate(({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0];
      const id = window.id;
      window.close();
      return id;
    });
    await waitForValue(() => app.evaluate(({ BrowserWindow }, id) => BrowserWindow.fromId(id) === null, closedWindowId), Boolean, 'window closed');
    await waitForValue(() => privatePage.evaluate(() => document.body.dataset.wallpaperVisible),
      (value) => value === 'false', 'retained start page hidden');
    assert.equal(await privatePage.evaluate(() => wallpaperMinuteTimers.size), 0, 'Dock close cancels the minute timer');
    await privatePage.evaluate(() => { Date.prototype.getHours = () => 6; });
    await app.evaluate(({ powerMonitor }) => powerMonitor.emit('resume'));
    // An acknowledged data request follows the resume status on the same IPC
    // connection, so the assertion observes that status handler's effect.
    await privatePage.evaluate(() => window.bowserPages.start.data());
    assert.deepEqual(await privatePage.evaluate(() => ({
      phase: document.body.dataset.wallpaperPhase, timers: wallpaperMinuteTimers.size,
    })), { phase: 'night', timers: 0 }, 'resume must not restart a closed window’s wallpaper');
    await app.evaluate(({ app }) => app.emit('activate'));
    await privatePage.waitForFunction(() => document.body.dataset.wallpaperVisible === 'true'
      && document.body.dataset.wallpaperPhase === 'dawn');
    assert.equal(await privatePage.evaluate(() => wallpaperMinuteTimers.size), 1, 'Dock reopen refreshes time and starts one timer');
    assert.equal(await app.evaluate(({ webContents }, id) => webContents.fromId(id)?.getURL(), contentsId),
      'blanc://newtab/?private=1', 'Dock reopen preserves the same start-page WebContents');
  }
  console.log(`newtab-wallpaper-smoke PASS: free entitlement, 48 rendered combinations, footer mouse/keyboard toggles in all layouts and styles, 60 responsive footer placement checks, on/off opacity fades and rapid reversal, reduced-motion settlement, persistence and Settings parity, strict footer IPC, main-owned hidden-tab visibility, live opt-in/out and resume status${process.platform === 'darwin' ? ', Dock close/reopen timer suspension' : ''}`);
} finally {
  if (app) await app.close();
  const errors = fs.existsSync(uncaught) ? fs.readFileSync(uncaught, 'utf8').trim() : '';
  fs.rmSync(root, { recursive: true, force: true });
  assert.equal(errors, '', 'No uncaught main-process exceptions');
}
