import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { launchPackagedOverCdp } from '../test/desktop/support/packaged-cdp.mjs';

if (process.platform !== 'darwin') throw new Error('The installed-public capture helper currently requires macOS.');

const run = promisify(execFile);
const executablePath = path.resolve(process.env.BLANC_PACKAGED_EXECUTABLE
  || '/Applications/Blanc.app/Contents/MacOS/Blanc');
const appPath = executablePath.slice(0, executablePath.lastIndexOf('.app/') + 4);
const expectedVersion = process.env.BLANC_CAPTURE_VERSION || '1.21.0';
const outputPath = path.resolve(process.env.BLANC_CAPTURE_OUTPUT
  || `output/playwright/mahjong-installed-v${expectedVersion}.png`);

assert.ok(fs.existsSync(executablePath) && appPath.endsWith('.app'), 'An installed Blanc.app executable is required.');
const plist = path.join(appPath, 'Contents/Info.plist');
const version = (await run('/usr/libexec/PlistBuddy', ['-c', 'Print :CFBundleShortVersionString', plist])).stdout.trim();
const build = (await run('/usr/libexec/PlistBuddy', ['-c', 'Print :CFBundleVersion', plist])).stdout.trim();
assert.equal(version, expectedVersion, `Installed Blanc must be ${expectedVersion}; found ${version}`);

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-installed-mahjong-'));
fs.writeFileSync(path.join(profile, 'settings.json'), JSON.stringify({
  onboardingVersion: 1,
  adblockEnabled: false,
  searchSuggestions: false,
  usagePing: false,
  newtabLayout: 'billboard',
}));

const poll = async (read, accept, label) => {
  const deadline = Date.now() + 30_000;
  let value;
  while (Date.now() < deadline) {
    value = await read();
    if (accept(value)) return value;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`${label}; last observation: ${String(value)}`);
};

let app;
try {
  app = await launchPackagedOverCdp({
    executablePath,
    args: [`--user-data-dir=${profile}`],
    env: { ...process.env, BLANC_TEST: '0' },
    launchViaOpen: true,
  });
  const startPage = await poll(
    async () => app.pages().find((page) => page.url().startsWith('blanc://newtab/')),
    Boolean,
    'installed Start Page did not appear',
  );
  await startPage.locator('#mahjongLink').click();
  const mahjong = await poll(
    async () => app.pages().find((page) => page.url().startsWith('blanc://mahjong/')),
    Boolean,
    'standalone Mahjong did not open',
  );
  await mahjong.locator('#mjBoard .mj-tile').first().waitFor({ state: 'visible' });
  await mahjong.setViewportSize({ width: 1440, height: 900 });
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  await mahjong.screenshot({ path: outputPath, animations: 'disabled' });
  process.stdout.write(`Captured installed Blanc ${version} (${build}) Mahjong to ${outputPath}\n`);
} finally {
  await app?.close().catch(() => {});
  fs.rmSync(profile, { recursive: true, force: true });
}
