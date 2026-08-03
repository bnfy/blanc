const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

const {
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

  assert.match(html, /id="mainMenuButton"[\s\S]*aria-haspopup="menu"[\s\S]*hidden/);
  assert.match(renderer, /if \(!isMac\) \{[\s\S]*mainMenuButton\.hidden = false/);
  assert.match(renderer, /getBoundingClientRect\(\)/);
  assert.match(renderer, /window\.browserAPI\.openMainMenu/);
  assert.match(preload, /ipcRenderer\.invoke\('chrome:open-main-menu', point\)/);
  assert.match(main, /event\.sender !== win\?\.webContents/);
  assert.match(main, /popupPlatformMainMenu\(\{ Menu, window: win, point \}\)/);
  assert.match(
    fs.readFileSync(path.join(ROOT, 'src/main/platform-main-menu.js'), 'utf8'),
    /Menu\.getApplicationMenu\(\)/
  );
});
