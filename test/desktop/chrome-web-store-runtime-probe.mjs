import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { _electron } from 'playwright';
import runtime from '../../scripts/preflight-electron-runtime.js';

const expected = runtime.verifyElectronRuntime().locked;
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-store-runtime-'));
const entry = path.join(scratch, 'probe.cjs');
fs.writeFileSync(entry, `const { app, BrowserWindow } = require('electron');
app.setPath('userData', ${JSON.stringify(scratch)});
app.whenReady().then(() => {
  const window = new BrowserWindow({ webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
  window.loadURL('about:blank');
});`);
const { ELECTRON_RUN_AS_NODE: ignored, ...env } = process.env;
void ignored;
let app;
try {
  app = await _electron.launch({ args: [entry], env, chromiumSandbox: true });
  assert.equal(await app.evaluate(() => process.versions.electron), expected);
  const page = await app.firstWindow();
  for (const url of [
    'https://chromewebstore.google.com/category/extensions',
    'https://chromewebstore.google.com/detail/1password-%E2%80%93-password-manager/aeblfdkhhhdcdjpifhhbdiojplfjncoa',
  ]) {
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    assert.equal(new URL(page.url()).hostname, 'chromewebstore.google.com');
    assert.ok(response?.ok(), `Web Store response ${response?.status()}`);
    assert.equal(await page.evaluate(() => typeof window.chrome?.webstorePrivate), 'undefined');
    assert.ok(await page.title(), 'real Store document has a title');
    console.log(`Loaded safely: ${page.url()}`);
  }
  await new Promise(resolve => setTimeout(resolve, 30_000));
  assert.equal(await app.evaluate(({ app }) => app.isReady()), true);
  assert.equal(await page.evaluate(() => typeof window.chrome?.webstorePrivate), 'undefined');
  console.log(`Web Store runtime PASS: official Electron ${expected}, listing/detail, unsupported API absent, 30s survival`);
} finally {
  if (app) await app.close();
  fs.rmSync(scratch, { recursive: true, force: true });
}
