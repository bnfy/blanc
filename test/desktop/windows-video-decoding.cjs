// Exercises the Settings switch and Chromium's startup flag across real quits.
// Run on Windows with the development app or a staged ECS app directory.
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { _electron } = require('playwright');
const { waitForValue } = require('./support/poll');

async function run() {
  const [directory = path.resolve(__dirname, '../..'), executablePath] = process.argv.slice(2);
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-video-decoding-'));
  const profile = path.join(scratch, 'profile');
  try {
    // On the third launch the preference has been restored to its default.
    for (const [launch, hardware] of [true, false, true].entries()) {
      const app = await _electron.launch({ executablePath, args: [directory, '--user-data-dir=' + profile] });
      try {
        await app.firstWindow();
        const disabled = await app.evaluate(({ app }) => app.commandLine.hasSwitch('disable-accelerated-video-decode'));
        assert.equal(disabled, !hardware, 'startup must honor the saved preference');
        await app.evaluate(({ Menu }) => {
          const flatten = menu => menu.items.flatMap(item => [item, ...(item.submenu ? flatten(item.submenu) : [])]);
          const settings = flatten(Menu.getApplicationMenu()).find(item => item.label.startsWith('Settings'));
          settings.click();
        });
        const page = await waitForValue(() => app.windows().find(tab => tab.url().startsWith('blanc://settings/')),
          Boolean, 'Settings page', 15000);
        const toggle = page.getByRole('checkbox', { name: 'Use hardware video decoding' });
        await toggle.waitFor();
        assert.equal(await toggle.isChecked(), hardware);
        console.log(`Windows launch ${launch + 1}: hardware decoding preference ${hardware}, disable switch ${disabled}`);
        if (launch < 2) {
          await toggle.press('Space');
          await page.waitForFunction(async expected => {
            const { settings } = await window.bowserPages.settings.get();
            return settings.hardwareVideoDecoding === expected;
          }, !hardware, { polling: 50 });
        }
      } finally {
        await app.close();
      }
    }
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
}
if (process.platform === 'win32') {
  run().catch(error => { console.error(error); process.exitCode = 1; });
}
