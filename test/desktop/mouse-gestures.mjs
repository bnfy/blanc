// Native input must preserve ordinary right-clicks while suppressing page
// context menus during right drags, including moves without modifier flags.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { _electron } from 'playwright';

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-mouse-gestures-'));
const { ELECTRON_RUN_AS_NODE: _ignored, ...cleanEnv } = process.env;
void _ignored;
let electronApp;
try {
  electronApp = await _electron.launch({
    args: [process.cwd(), `--user-data-dir=${profile}`],
    env: { ...cleanEnv, BLANC_TEST: '1' },
  });
  await electronApp.evaluate(() => new Promise((resolve) => {
    const timer = setInterval(() => {
      if (globalThis.__blanc?.startupReady?.()) { clearInterval(timer); resolve(); }
    }, 50);
  }));
  const result = await electronApp.evaluate(async () => {
    const hook = globalThis.__blanc;
    hook.setMouseGestures(true, { R: 'newTab' });
    const initial = hook.state();
    const id = initial.activeTabId;
    await hook.workspacePageScript(id, `
      window.__gestureContextMenus = 0;
      document.addEventListener('contextmenu', (event) => {
        window.__gestureContextMenus += 1;
        event.preventDefault();
      });
    `);
    hook.sendMouseInput(id, { type: 'mouseDown', x: 300, y: 300, button: 'right', clickCount: 1 });
    hook.sendMouseInput(id, { type: 'mouseUp', x: 300, y: 300, button: 'right', clickCount: 1 });
    await new Promise((resolve) => setTimeout(resolve, 150));
    const ordinaryClickMenus = await hook.workspacePageScript(id, 'window.__gestureContextMenus');
    hook.groupActiveByName('Gesture source');
    const sent = [
      hook.sendMouseInput(id, { type: 'mouseDown', x: 300, y: 300, button: 'right', clickCount: 1 }),
      hook.sendMouseInput(id, { type: 'mouseMove', x: 340, y: 300, button: 'right' }),
      hook.sendMouseInput(id, { type: 'mouseUp', x: 340, y: 300, button: 'right', clickCount: 1 }),
    ];
    await new Promise((resolve) => setTimeout(resolve, 350));
    const after = hook.state();
    return {
      sent,
      before: initial.tabs.length,
      after: after.tabs.length,
      ordinaryClickMenus,
      gestureContextMenus: await hook.workspacePageScript(id, 'window.__gestureContextMenus'),
      newTab: after.tabs.find((tab) => tab.id === after.activeTabId),
    };
  });
  assert.deepEqual(result.sent, [true, true, true]);
  assert.equal(result.after, result.before + 1, 'right drag should open exactly one tab');
  assert.equal(result.ordinaryClickMenus, 1, 'ordinary right-click should reach the page');
  assert.equal(result.gestureContextMenus, 1, 'right drag should not open a page context menu');
  assert.equal(result.newTab.groupId, null, 'gesture new tab should not inherit its source group');
  const trackpadResult = await electronApp.evaluate(async () => {
    const hook = globalThis.__blanc;
    const before = hook.state();
    const id = before.activeTabId;
    await hook.workspacePageScript(id, `
      window.__gestureAltClicks = 0;
      document.addEventListener('click', (event) => {
        if (event.altKey) window.__gestureAltClicks += 1;
      });
    `);
    hook.sendMouseInput(id, { type: 'keyDown', keyCode: 'Alt', modifiers: ['alt'] });
    hook.sendMouseInput(id, { type: 'mouseDown', x: 300, y: 300, button: 'left', modifiers: ['alt'], clickCount: 1 });
    hook.sendMouseInput(id, { type: 'mouseUp', x: 300, y: 300, button: 'left', modifiers: ['alt'], clickCount: 1 });
    await new Promise((resolve) => setTimeout(resolve, 150));
    const ordinaryAltClicks = await hook.workspacePageScript(id, 'window.__gestureAltClicks');
    hook.sendMouseInput(id, { type: 'mouseDown', x: 300, y: 300, button: 'left', modifiers: ['alt'], clickCount: 1 });
    hook.sendMouseInput(id, { type: 'mouseMove', x: 340, y: 300, button: 'left', modifiers: ['alt', 'leftbuttondown'] });
    hook.sendMouseInput(id, { type: 'mouseUp', x: 340, y: 300, button: 'left', modifiers: ['alt'], clickCount: 1 });
    hook.sendMouseInput(id, { type: 'keyUp', keyCode: 'Alt' });
    await new Promise((resolve) => setTimeout(resolve, 350));
    return {
      before: before.tabs.length,
      after: hook.state().tabs.length,
      ordinaryAltClicks,
      afterAltClicks: await hook.workspacePageScript(id, 'window.__gestureAltClicks'),
    };
  });
  assert.equal(trackpadResult.ordinaryAltClicks, 1, 'Option-click without a drag should reach the page');
  assert.equal(trackpadResult.after, trackpadResult.before + 1, 'Option-drag should open exactly one tab');
  assert.equal(trackpadResult.afterAltClicks, 1, 'Option-drag should not click the page');
  const privateResult = await electronApp.evaluate(async () => {
    const hook = globalThis.__blanc;
    const id = hook.openTab('blanc://newtab/?private=1', { private: true });
    hook.sendMouseInput(id, { type: 'mouseDown', x: 300, y: 300, button: 'right', clickCount: 1 });
    hook.sendMouseInput(id, { type: 'mouseMove', x: 340, y: 300, button: 'right' });
    hook.sendMouseInput(id, { type: 'mouseUp', x: 340, y: 300, button: 'right', clickCount: 1 });
    await new Promise((resolve) => setTimeout(resolve, 350));
    return hook.state().tabs.find((tab) => tab.id === hook.state().activeTabId);
  });
  assert.equal(privateResult.private, true, 'gesture new tab should retain private mode');
  assert.equal(privateResult.url, 'blanc://newtab/?private=1', 'private gesture new tab should use the private start page');
  console.log('Mouse gesture native-input smoke passed.');
} finally {
  if (electronApp) await electronApp.close();
  fs.rmSync(profile, { recursive: true, force: true });
}
