import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from 'playwright';

// Diagnostic, not proof of working capture. It exercises denial only and
// fails if the runtime cannot distinguish standard and legacy requests.
const fixture = fileURLToPath(new URL('./fixtures/display-capture-routing/main.cjs', import.meta.url));
const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-display-routing-'));
const observations = [];
try {
  for (const useSystemPicker of process.platform === 'darwin' ? [false, true] : [false]) {
    const app = await electron.launch({
      ...(process.env.BLANC_PROBE_EXECUTABLE ? { executablePath: process.env.BLANC_PROBE_EXECUTABLE } : {}),
      args: [fixture, `--user-data-dir=${userData}`],
      env: { ...process.env, BLANC_PROBE_SYSTEM_PICKER: useSystemPicker ? '1' : '0' },
    });
    try {
      const page = await app.firstWindow();
      await page.locator('#display').waitFor();
      for (const mode of ['display', 'legacy', 'camera']) {
        await app.evaluate(() => {
          globalThis.__displayRouting.requests = [];
          globalThis.__displayRouting.checks = [];
          globalThis.__displayRouting.selections = [];
          globalThis.__displayRouting.prompts = [];
        });
        await page.locator(`#${mode}`).click();
        await page.waitForFunction(() => !['idle', 'pending'].includes(document.querySelector('#result').textContent), null, { timeout: 10_000 });
        const result = await page.locator('#result').textContent();
        assert.notEqual(result, 'unexpected-grant', 'deny-all policy must prevent capture');
        const evidence = await app.evaluate(() => ({
          electron: process.versions.electron,
          chrome: process.versions.chrome,
          ...globalThis.__displayRouting,
        }));
        // The random loopback origin is not useful in the durable evidence.
        for (const row of [...evidence.requests, ...evidence.checks]) {
          if (row.origin) row.origin = '<probe-origin>';
          for (const key of ['requestingUrl', 'securityOrigin']) {
            if (row.details?.[key]) row.details[key] = '<probe-origin>';
          }
        }
        observations.push({ useSystemPicker, mode, result, ...evidence });
      }
    } finally {
      await app.close();
    }
  }
  const policy = process.env.BLANC_PROBE_POLICY === 'blanc' ? 'blanc' : 'deny-all';
  const report = JSON.stringify({ policy, platform: process.platform, arch: process.arch, osRelease: os.release(), observations }, null, 2);
  console.log(report);
  if (process.env.BLANC_PROBE_REPORT) fs.writeFileSync(process.env.BLANC_PROBE_REPORT, report + '\n');
  for (const useSystemPicker of new Set(observations.map((row) => row.useSystemPicker))) {
    const display = observations.find((row) => row.useSystemPicker === useSystemPicker && row.mode === 'display');
    const legacy = observations.find((row) => row.useSystemPicker === useSystemPicker && row.mode === 'legacy');
    assert.ok(display.requests.length, 'display request must reach the permission handler before any native picker');
    if (policy === 'blanc') {
      const camera = observations.find((row) => row.useSystemPicker === useSystemPicker && row.mode === 'camera');
      for (const row of [display, legacy]) {
        assert.equal(row.prompts.length, 0, 'unscoped capture must not show a device permission prompt');
        assert.equal(row.selections.length, 0, 'denied capture must not reach source selection');
      }
      assert.equal(camera.prompts.length, 1, 'real device requests must still reach the device permission prompter');
      continue;
    }
    assert.notDeepEqual(display.requests, legacy.requests,
      'BLOCKED: standard and legacy desktop capture have identical permission requests; do not grant generic media');
    assert.ok(display.requests.every((row) => row.details.captureApi === 'get-display-media'),
      'BLOCKED: require the proposed browser-derived API discriminator, not incidental payload differences');
    assert.ok(legacy.requests.every((row) => row.details.captureApi === 'legacy-display'),
      'BLOCKED: legacy capture must be identifiable or rejected before requesting permission');
  }
} finally {
  fs.rmSync(userData, { recursive: true, force: true });
}
