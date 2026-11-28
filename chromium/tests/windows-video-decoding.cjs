// Run on Windows: node chromium/tests/windows-video-decoding.cjs PATH_TO_CHROME_EXE
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright');

async function openSystemSheet(page, profile, connect, waitFor) {
  const url = 'chrome://settings/system';
  // Blanc redirects Settings to a native sheet with its own WebContents.
  await page.goto(url).catch(error => {
    if (!error.message.includes('net::ERR_ABORTED')) throw error;
  });
  const port = +fs.readFileSync(path.join(profile, 'DevToolsActivePort'), 'utf8').split(/\r?\n/)[0];
  if (!(Number.isInteger(port) && port > 0 && port < 65536)) throw Error('DevToolsActivePort holds no port');
  const target = await waitFor(async () => {
    const targets = await (await fetch('http://127.0.0.1:' + port + '/json/list')).json();
    return targets.find(t => t.type === 'page' && t.url === url);
  }, Boolean, 'System settings sheet');
  return connect(target);
}

function readControls() {
  function find(root, selector) {
    const match = root.querySelector(selector);
    if (match) return match;
    for (const el of root.querySelectorAll('*')) {
      if (el.shadowRoot) {
        const child = find(el.shadowRoot, selector);
        if (child) return child;
      }
    }
  }
  const control = find(document, '#blancVideoDecoding');
  const graphics = find(document, '#hardwareAcceleration');
  if (!control || control.disabled || !graphics) return null;
  control.focus();
  return {decoding: control.checked, graphics: graphics.checked};
}

async function run(executablePath) {
  assert.equal(process.platform, 'win32');
  const {connect, waitFor} = await import('./lib/cdp.mjs');
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-video-decode-'));
  const flag = 'disable-accelerated-video-decode';
  let originalGraphicsChoice;
  try {
    for (const [launch, enabled] of [true, false, true].entries()) {
      const browser = await chromium.launchPersistentContext(profile, {
        executablePath, headless: false, args: ['--remote-debugging-port=0'],
      });
      let sheet;
      try {
        const page = await browser.newPage();
        await page.goto('chrome://version/');
        assert.equal((await page.locator('#command_line').innerText()).includes('--' + flag), !enabled);

        const flags = await browser.newPage();
        await flags.goto('chrome://flags/#' + flag);
        const select = flags.locator('#' + flag + ' select');
        const flagsChoice = async () => (await select.locator('option:checked').innerText()).trim();
        assert.equal(await flagsChoice(), enabled ? 'Enabled' : 'Disabled');

        sheet = await openSystemSheet(page, profile, connect, waitFor);
        const waitForChoice = on => waitFor(
          () => sheet.eval('(' + readControls + ')()'), state => state?.decoding === on,
          'video decoding ' + (on ? 'enabled' : 'disabled'));
        const pressToggle = async () => {
          await sheet.send('Input.dispatchKeyEvent', {type: 'keyDown', key: ' ', code: 'Space', windowsVirtualKeyCode: 32});
          await sheet.send('Input.dispatchKeyEvent', {type: 'keyUp', key: ' ', code: 'Space', windowsVirtualKeyCode: 32});
        };
        const state = await waitForChoice(enabled);
        assert.equal(typeof state.graphics, 'boolean');
        if (launch === 0) originalGraphicsChoice = state.graphics;
        assert.equal(state.graphics, originalGraphicsChoice);
        if (launch === 0) {
          await select.selectOption({label: 'Disabled'});
          await waitForChoice(false);
          await pressToggle();
          await waitForChoice(true);
        }
        if (launch < 2) {
          await pressToggle();
          await waitForChoice(!enabled);
          await flags.reload();
          assert.equal(await flagsChoice(), enabled ? 'Disabled' : 'Enabled');
        }
        console.log('Passed Windows video decoding launch', launch + 1);
      } finally {
        sheet?.close();
        await browser.close();
      }
    }
  } finally {
    fs.rmSync(profile, {recursive: true, force: true, maxRetries: 5, retryDelay: 200});
  }
}

run(path.resolve(process.argv[2])).catch(error => { console.error(error); process.exitCode = 1; });
