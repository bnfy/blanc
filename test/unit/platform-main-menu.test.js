const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

const {
  installPlatformMainMenuShortcut,
  isPlatformMainMenuShortcut,
  popupPlatformMainMenu,
  popupPoint,
  supportsPlatformMainMenu,
} = require('../../src/main/platform-main-menu');

const ROOT = path.resolve(__dirname, '..', '..');

test('the custom main-menu affordance is limited to Windows and Linux', () => {
  assert.equal(supportsPlatformMainMenu('win32'), true);
  assert.equal(supportsPlatformMainMenu('linux'), true);
  assert.equal(supportsPlatformMainMenu('darwin'), false);
});

test('Alt+F is the platform main-menu shortcut on Windows and Linux', () => {
  const input = {
    type: 'keyDown',
    key: 'f',
    alt: true,
    control: false,
    meta: false,
    shift: false,
    isAutoRepeat: false,
  };

  assert.equal(isPlatformMainMenuShortcut(input, 'win32'), true);
  assert.equal(isPlatformMainMenuShortcut({ ...input, key: 'F' }, 'linux'), true);
  assert.equal(isPlatformMainMenuShortcut(input, 'darwin'), false);
  assert.equal(isPlatformMainMenuShortcut({ ...input, type: 'keyUp' }, 'win32'), false);
  assert.equal(isPlatformMainMenuShortcut({ ...input, isAutoRepeat: true }, 'win32'), false);
  assert.equal(isPlatformMainMenuShortcut({ ...input, alt: false }, 'win32'), false);
  assert.equal(isPlatformMainMenuShortcut({ ...input, control: true }, 'win32'), false);
  assert.equal(isPlatformMainMenuShortcut({ ...input, meta: true }, 'win32'), false);
  assert.equal(isPlatformMainMenuShortcut({ ...input, shift: true }, 'win32'), false);
  assert.equal(isPlatformMainMenuShortcut({ ...input, key: 'm' }, 'win32'), false);
});

test('the shortcut opens the menu below the upper-left button', async () => {
  let beforeInput = null;
  let popupOptions = null;
  let prevented = false;
  const webContents = {
    on(eventName, listener) {
      assert.equal(eventName, 'before-input-event');
      beforeInput = listener;
    },
  };
  const window = {
    isDestroyed: () => false,
    getContentBounds: () => ({ width: 640, height: 480 }),
  };
  const Menu = {
    getApplicationMenu: () => ({
      items: [{ label: 'File' }],
      popup(options) {
        popupOptions = options;
        options.callback();
      },
    }),
  };

  installPlatformMainMenuShortcut({
    webContents,
    Menu,
    getWindow: () => window,
    platform: 'win32',
  });
  assert.equal(typeof beforeInput, 'function');

  beforeInput(
    { preventDefault: () => { prevented = true; } },
    {
      type: 'keyDown',
      key: 'f',
      alt: true,
      control: false,
      meta: false,
      shift: false,
      isAutoRepeat: false,
    }
  );
  await Promise.resolve();

  assert.equal(prevented, true);
  assert.equal(popupOptions.window, window);
  assert.equal(popupOptions.x, 8);
  assert.equal(popupOptions.y, 38);

  let registeredOnMac = false;
  installPlatformMainMenuShortcut({
    webContents: { on: () => { registeredOnMac = true; } },
    Menu,
    getWindow: () => window,
    platform: 'darwin',
  });
  assert.equal(registeredOnMac, false);
});

test('popup coordinates are integer content coordinates clamped to the window', () => {
  assert.deepEqual(
    popupPoint({ x: 1250.6, y: 38.2 }, { width: 1280, height: 800 }),
    { x: 1251, y: 38 }
  );
  assert.deepEqual(
    popupPoint({ x: -20, y: Number.NaN }, { width: 1280, height: 800 }),
    { x: 0, y: 0 }
  );
  assert.deepEqual(
    popupPoint({ x: 9000, y: 9000 }, { width: 1280, height: 800 }),
    { x: 1279, y: 799 }
  );
});

test('the platform button pops up the existing live application menu', async () => {
  let popupOptions = null;
  const applicationMenu = {
    items: [{ label: 'File' }],
    popup(options) {
      popupOptions = options;
      options.callback();
    },
  };
  const Menu = { getApplicationMenu: () => applicationMenu };
  const window = {
    isDestroyed: () => false,
    getContentBounds: () => ({ width: 640, height: 480 }),
  };

  assert.equal(
    await popupPlatformMainMenu({
      Menu,
      window,
      point: { x: 610, y: 38 },
      platform: 'win32',
    }),
    true
  );
  assert.equal(popupOptions.window, window);
  assert.equal(popupOptions.x, 610);
  assert.equal(popupOptions.y, 38);
  assert.equal(typeof popupOptions.callback, 'function');
});

test('macOS and missing window/menu state never open a popup', async () => {
  let popupCalls = 0;
  const menu = { items: [{ label: 'File' }], popup: () => { popupCalls += 1; } };
  const Menu = { getApplicationMenu: () => menu };
  const window = {
    isDestroyed: () => false,
    getContentBounds: () => ({ width: 640, height: 480 }),
  };

  assert.equal(await popupPlatformMainMenu({ Menu, window, platform: 'darwin' }), false);
  assert.equal(await popupPlatformMainMenu({ Menu, window: null, platform: 'linux' }), false);
  assert.equal(
    await popupPlatformMainMenu({
      Menu: { getApplicationMenu: () => null },
      window,
      platform: 'linux',
    }),
    false
  );
  assert.equal(popupCalls, 0);
});

test('chrome markup and IPC keep one native menu definition', () => {
  const html = fs.readFileSync(path.join(ROOT, 'src/renderer/index.html'), 'utf8');
  const renderer = fs.readFileSync(path.join(ROOT, 'src/renderer/renderer.js'), 'utf8');
  const preload = fs.readFileSync(path.join(ROOT, 'src/main/preload.js'), 'utf8');
  const main = fs.readFileSync(path.join(ROOT, 'src/main/main.js'), 'utf8');
  const styles = fs.readFileSync(path.join(ROOT, 'src/renderer/styles.css'), 'utf8');

  assert.match(html, /<div id="strip">\s*<button\s+id="mainMenuButton"[\s\S]*aria-haspopup="menu"[\s\S]*hidden/);
  assert.match(html, /<path d="M3 4\.5h10M3 8h10M3 11\.5h10"\/?>/);
  assert.doesNotMatch(html, /<circle cx="8"/);
  assert.match(html, /<div id="windowControls" class="no-drag"><\/div>/);
  assert.match(styles, /#mainMenuButton \{[\s\S]*position: absolute;[\s\S]*top: 8px;[\s\S]*left: 8px;[\s\S]*width: 34px;[\s\S]*height: 30px/);
  assert.match(styles, /#mainMenuButton:hover,[\s\S]*#mainMenuButton:focus-visible,[\s\S]*background: var\(--accent-dim\)/);
  assert.match(styles, /#strip\.tint-dark #mainMenuButton:focus-visible[\s\S]*background: rgba\(255, 255, 255, 0\.14\);[\s\S]*color: #f5f5f5/);
  assert.match(styles, /#mainMenuButton:focus-visible \{ outline: none; \}/);
  assert.match(renderer, /if \(!isMac\) \{[\s\S]*mainMenuButton\.hidden = false/);
  assert.match(renderer, /getBoundingClientRect\(\)/);
  assert.match(renderer, /window\.browserAPI\.openMainMenu/);
  assert.match(preload, /ipcRenderer\.invoke\('chrome:open-main-menu', point\)/);
  assert.match(main, /event\.sender !== rt\(\)\.window\?\.webContents/);
  assert.match(main, /popupPlatformMainMenu\(\{ Menu, window: rt\(\)\.window, point \}\)/);
  assert.match(main, /label: 'Help'[\s\S]*isMac \? \[\] : \[[\s\S]*label: 'About Blanc'[\s\S]*showAboutPanel\(\{ app \}\)/);
  assert.match(main, /function installChromeShortcuts\(webContents, owner = rt\(\)\) \{[\s\S]*installVerticalTabsShortcut\(webContents, owner\);[\s\S]*installPlatformMainMenuShortcut/);
  // [^)]* can't span a nested-paren argument like rt().window.webContents, so
  // this stops at the next statement boundary (;) instead of the next ')'.
  assert.equal((main.match(/installChromeShortcuts\([^;]*webContents\)/g) ?? []).length >= 2, true);
  assert.match(
    fs.readFileSync(path.join(ROOT, 'src/main/platform-main-menu.js'), 'utf8'),
    /Menu\.getApplicationMenu\(\)/
  );
});
