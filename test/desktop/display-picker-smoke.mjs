import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from 'playwright';
const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-picker-ui-'));
const app = await electron.launch({
  ...(process.env.BLANC_PROBE_EXECUTABLE ? { executablePath: process.env.BLANC_PROBE_EXECUTABLE } : {}),
  args: [fileURLToPath(new URL('./fixtures/display-picker/main.cjs', import.meta.url)), `--user-data-dir=${userData}`],
});
try {
  await app.firstWindow();
  async function open(native) {
    const appearing = app.waitForEvent('window');
    await app.evaluate((_electron, value) => globalThis.__pickerTest.open(value), native);
    const page = await appearing;
    await page.locator('#origin').waitFor();
    assert.equal(await page.locator('#origin').textContent(), 'https://meeting.example');
    return page;
  }
  let page = await open(false);
  assert.equal(await page.locator('#share').isDisabled(), true);
  assert.equal(await page.locator('#audio').isChecked(), false);
  const footer = await page.locator('footer').boundingBox();
  assert.ok(footer.y + footer.height <= await page.evaluate(() => innerHeight), 'picker footer remains in view with many sources');
  await page.screenshot({ path: path.join(os.tmpdir(), 'blanc-display-picker-ui.png') });
  await page.getByRole('radio', { name: 'Test window' }).click();
  await page.locator('#audio').check();
  await page.locator('#share').click();
  await app.evaluate(() => new Promise((resolve) => setTimeout(resolve, 50)));
  assert.deepEqual(await app.evaluate(() => globalThis.__pickerTest.result), { video: 'window:fixture', audio: true, native: undefined });
  page = await open(true);
  assert.equal(await page.locator('#audioLabel').isVisible(), false);
  assert.equal(await page.locator('#share').textContent(), 'Continue with audio');
  await page.locator('#cancel').click();
  await app.evaluate(() => new Promise((resolve) => setTimeout(resolve, 50)));
  assert.equal(await app.evaluate(() => globalThis.__pickerTest.result), null);
  page = await open(false);
  await app.evaluate(() => globalThis.__pickerTest.abort.abort());
  await app.evaluate(() => new Promise((resolve) => setTimeout(resolve, 50)));
  assert.equal(await app.evaluate(() => globalThis.__pickerTest.result), null);
  console.log('Picker UI passed: no default source/audio, explicit selection, native consent, cancellation and owner abort. Synthetic sources only.');
} finally {
  await app.close();
  fs.rmSync(userData, { recursive: true, force: true });
}
