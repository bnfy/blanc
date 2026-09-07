import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from 'playwright';
import { watchStep } from './smoke-watch.mjs';
const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-picker-ui-'));
const app = await electron.launch({
  ...(process.env.BLANC_PROBE_EXECUTABLE ? { executablePath: process.env.BLANC_PROBE_EXECUTABLE } : {}),
  args: [fileURLToPath(new URL('./fixtures/display-picker/main.cjs', import.meta.url)), `--user-data-dir=${userData}`],
});
try {
  const parent = await app.firstWindow();
  await parent.waitForFunction(() => window.fixtureReady === true);
  async function open(native) {
    const appearing = app.waitForEvent('window');
    await app.evaluate((_electron, value) => globalThis.__pickerTest.open(value), native);
    const page = await appearing;
    await page.locator('#origin').waitFor();
    await page.waitForFunction(() => document.visibilityState === 'visible');
    assert.equal(await page.locator('#origin').textContent(), 'https://meeting.example');
    const placement = await app.evaluate(({ BrowserWindow, screen }) => {
      const win = BrowserWindow.getAllWindows().find((window) => window.webContents.getURL() === 'blanc-chrome://display/');
      return { bounds: win.getBounds(), area: screen.getDisplayMatching(win.getParentWindow().getBounds()).workArea,
        ownerEnabled: win.getParentWindow().isEnabled() };
    });
    const { bounds, area } = placement;
    assert.ok(Math.abs(bounds.x + bounds.width / 2 - (area.x + area.width / 2)) <= 1, 'dialog is horizontally centered on its display');
    assert.ok(Math.abs(bounds.y + bounds.height / 2 - (area.y + area.height / 2)) <= 1, 'dialog is vertically centered on its display');
    if (process.platform === 'darwin') assert.equal(placement.ownerEnabled, false);
    assert.equal(await page.locator('#cancel').evaluate((button) => getComputedStyle(button).outlineStyle), 'none');
    return page;
  }
  let page = await open(false);
  await watchStep(app, '1/5: No source selected; computer audio is off');
  assert.equal(await page.locator('#share').isDisabled(), true);
  assert.equal(await page.locator('#audio').isChecked(), false);
  const footer = await page.locator('footer').boundingBox();
  assert.ok(footer.y + footer.height <= await page.evaluate(() => innerHeight), 'picker footer remains in view with many sources');
  await page.screenshot({ path: path.join(os.tmpdir(), 'blanc-display-picker-ui.png') });
  await page.getByRole('radio', { name: 'Test window' }).click();
  await watchStep(app, '2/5: Select the synthetic test window');
  await page.locator('#audio').check();
  await watchStep(app, '3/5: Explicitly opt in to computer audio');
  await page.locator('#share').click();
  await app.evaluate(() => new Promise((resolve) => setTimeout(resolve, 50)));
  assert.deepEqual(await app.evaluate(() => globalThis.__pickerTest.result), { video: 'window:fixture', audio: true, native: undefined });
  page = await open(true);
  await watchStep(app, '4/5: macOS consent copy — then Cancel');
  assert.equal(await page.locator('#audioLabel').isVisible(), false);
  assert.equal(await page.locator('#share').textContent(), 'Continue with audio');
  await page.locator('#cancel').click();
  await app.evaluate(() => new Promise((resolve) => setTimeout(resolve, 50)));
  assert.equal(await app.evaluate(() => globalThis.__pickerTest.result), null);
  assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isEnabled()), true, 'cancellation restores the owner');
  page = await open(false);
  await watchStep(app, '5/5: Requester cancellation closes the picker');
  await app.evaluate(() => globalThis.__pickerTest.abort.abort());
  await app.evaluate(() => new Promise((resolve) => setTimeout(resolve, 50)));
  assert.equal(await app.evaluate(() => globalThis.__pickerTest.result), null);
  assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isEnabled()), true, 'abort restores the owner');
  console.log('Picker UI passed: display-centered placement, no button focus rings, explicit source/audio selection, cancellation and owner abort. Synthetic sources only.');
} finally {
  await app.close();
  fs.rmSync(userData, { recursive: true, force: true });
}
