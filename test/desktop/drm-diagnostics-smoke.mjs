import { _electron } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { withDiagnosticProfile } from '../../scripts/drm-diagnostics.cjs';

const output = path.resolve('output/playwright/drm-diagnostics');
await fs.mkdir(output, { recursive: true });
const { ELECTRON_RUN_AS_NODE: ignored, ...env } = process.env;
void ignored;
let profile;
const errors = [];
const requests = [];
const report = {};
await withDiagnosticProfile(async ownedProfile => {
const app = await _electron.launch({ chromiumSandbox: true,
  args: [path.resolve('scripts/drm-diagnostics/main.cjs')],
  env: { ...env, BLANC_DRM_DIAGNOSTIC_PROFILE: ownedProfile } });
try {
  const page = await app.firstWindow();
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (/^https?:/.test(request.url())) requests.push(request.url()); });
  await page.getByRole('heading', { name: 'DRM diagnostics' }).waitFor();
  report.runtime = await app.evaluate(({ app, components }) => ({
    electron: process.versions.electron, componentsPresent: Boolean(components),
    profile: app.getPath('userData'),
  }));
  profile = report.runtime.profile;
  assert.equal(report.runtime.componentsPresent, false, 'This smoke is for official Electron');
  assert.match(profile, /blanc-drm-diagnostics-/);
  const result = page.getByRole('status');
  for (const operation of ['Inspect runtime', 'Prepare Widevine']) {
    await page.getByRole('button', { name: operation }).click();
    await page.waitForFunction(() => document.getElementById('result').textContent.includes('unsupported'));
    const value = JSON.parse(await result.innerText());
    assert.deepEqual(value, { state: 'unsupported', supported: false, playbackVerified: false });
    assert.equal(await page.getByRole('button', { name: operation }).isEnabled(), true);
    report[operation] = value;
  }
  await page.screenshot({ path: path.join(output, 'unsupported.png') });
  await page.getByRole('button', { name: 'Check encrypted-media support' }).click();
  await page.waitForFunction(() => !document.getElementById('probe').disabled, { timeout: 15_000 });
  report.encryptedMedia = await result.innerText();
  if (report.encryptedMedia.startsWith('[')) {
    assert(JSON.parse(report.encryptedMedia).every(item => item.keySystemAccess === false));
  } else {
    assert.equal(report.encryptedMedia, 'Encrypted-media API unavailable in this document.');
  }
  assert.equal(await page.evaluate(() => typeof window.require), 'undefined');
  report.preferences = await app.evaluate(({ BrowserWindow }) => {
    const prefs = BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences();
    return { sandbox: prefs.sandbox, contextIsolation: prefs.contextIsolation, nodeIntegration: prefs.nodeIntegration };
  });
  assert.deepEqual(report.preferences, { sandbox: true, contextIsolation: true, nodeIntegration: false });
  assert.deepEqual(errors, []);
  assert.deepEqual(requests, []);
  await page.screenshot({ path: path.join(output, 'encrypted-media.png') });
  report.errors = errors;
  report.rendererNetworkRequests = requests;
  const exited = new Promise(resolve => app.process().once('exit', resolve));
  const closed = app.waitForEvent('close');
  await page.close();
  await closed;
  await exited;
} finally {
  await app.close().catch(() => {});
}
assert(profile);
});
report.profileRemoved = !await fs.stat(profile).then(() => true, () => false);
assert.equal(report.profileRemoved, true, 'Supervisor removes profile after Electron exit');
await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
