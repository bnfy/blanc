import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from 'playwright';
import { watchStep } from './smoke-watch.mjs';

// Diagnostic, not proof of working capture. It exercises denial only and
// fails if the runtime cannot distinguish standard and legacy requests.
const fixture = fileURLToPath(new URL('./fixtures/display-capture-routing/main.cjs', import.meta.url));
const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-display-routing-'));
const observations = [];
const patched = process.env.BLANC_PROBE_POLICY === 'patched';
try {
  for (const useSystemPicker of process.platform === 'darwin' && !patched ? [false, true] : [false]) {
    const app = await electron.launch({
      ...(process.env.BLANC_PROBE_EXECUTABLE ? { executablePath: process.env.BLANC_PROBE_EXECUTABLE } : {}),
      args: [fixture, `--user-data-dir=${userData}`],
      env: { ...process.env, BLANC_PROBE_SYSTEM_PICKER: useSystemPicker ? '1' : '0' },
    });
    try {
      const page = await app.firstWindow();
      await page.locator('#display').waitFor();
      // Mixed legacy requests are a patched-runtime regression gate. The
      // stock diagnostic remains bounded to its original deny-only cases.
      for (const mode of patched ? ['display', 'legacy', 'mixed', 'camera'] : ['display', 'legacy', 'camera']) {
        await app.evaluate(() => {
          globalThis.__displayRouting.requests = [];
          globalThis.__displayRouting.checks = [];
          globalThis.__displayRouting.selections = [];
          globalThis.__displayRouting.prompts = [];
          globalThis.__displayRouting.grants = [];
        });
        await watchStep(app, `${mode} permission check (system picker ${useSystemPicker ? 'on' : 'off'})`);
        await page.locator(`#${mode}`).click();
        await page.waitForFunction(() => !['idle', 'pending'].includes(document.querySelector('#result').textContent), null, { timeout: 10_000 })
          .catch((error) => { throw new Error(`${mode} request did not settle (system picker: ${useSystemPicker})`, { cause: error }); });
        const result = await page.locator('#result').textContent();
        await watchStep(app, `${mode}: ${result} — capture denied`);
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
  const policy = patched ? 'patched' : process.env.BLANC_PROBE_POLICY === 'blanc' ? 'blanc' : 'deny-all';
  const report = JSON.stringify({ policy, platform: process.platform, arch: process.arch, osRelease: os.release(), observations }, null, 2);
  console.log(report);
  if (process.env.BLANC_PROBE_REPORT) fs.writeFileSync(process.env.BLANC_PROBE_REPORT, report + '\n');
  for (const useSystemPicker of new Set(observations.map((row) => row.useSystemPicker))) {
    const display = observations.find((row) => row.useSystemPicker === useSystemPicker && row.mode === 'display');
    const legacy = observations.find((row) => row.useSystemPicker === useSystemPicker && row.mode === 'legacy');
    const mixed = observations.find((row) => row.useSystemPicker === useSystemPicker && row.mode === 'mixed');
    assert.ok(display.requests.length, 'display request must reach the permission handler before any native picker');
    if (policy === 'blanc' || patched) {
      const camera = observations.find((row) => row.useSystemPicker === useSystemPicker && row.mode === 'camera');
      for (const row of [display, legacy]) {
        assert.equal(row.prompts.length, 0, 'unscoped capture must not show a device permission prompt');
        if (!patched || row !== display) assert.equal(row.selections.length, 0, 'denied capture must not reach source selection');
      }
      assert.equal(camera.prompts.length, 1, 'real device requests must still reach the device permission prompter');
      if (patched) {
        assert.deepEqual(display.grants, [['display']], 'native frame-bound controller must grant standard display intent');
        assert.equal(display.selections.length, 1, 'standard request must reach source selection exactly once');
        assert.equal(display.selections[0].controllerAuthorized, true);
        assert.equal(display.selections[0].audioIncluded, false, 'declined computer audio must remain absent');
        for (const row of [legacy, mixed]) {
          assert.equal(row.prompts.length, 0);
          assert.equal(row.selections.length, 0);
          assert.equal(row.grants.length, 0);
          assert.ok(row.requests.length > 0);
          assert.ok(row.requests.every((entry) => entry.details.captureApi === 'legacy-display'));
        }
      }
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
