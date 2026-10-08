// Measures the shield count installed public Blanc shows for each page, for
// release-backed website copy (docs/website-blocking-count-v1.30.1.json).
//
//   node scripts/measure-installed-blocked-count.mjs https://www.nytimes.com/ [...]
//
// Each page gets three runs, each in a fresh disposable profile with the
// default Blanc Blocker. The count is read from the strip's shield chip 10 s
// after the page appears: some pages retry blocked requests and never settle,
// so only a fixed moment is comparable. Nothing is clicked or changed.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { launchPackagedOverCdp } from '../test/desktop/support/packaged-cdp.mjs';

const expectedVersion = process.env.BLANC_CAPTURE_VERSION || '1.30.1';
const urls = process.argv.slice(2);
assert.ok(urls.length, 'Pass at least one page URL.');
assert.equal(process.platform, 'darwin', 'This measurement reads the installed macOS app.');
const executablePath = process.env.BLANC_PACKAGED_EXECUTABLE || '/Applications/Blanc.app/Contents/MacOS/Blanc';
const plist = path.join(executablePath, '../../Info.plist');
const plistValue = key => execFileSync('/usr/libexec/PlistBuddy', ['-c', `Print :${key}`, plist], { encoding: 'utf8' }).trim();
const version = plistValue('CFBundleShortVersionString'), build = plistValue('CFBundleVersion');
assert.equal(version, expectedVersion, `Installed Blanc must be ${expectedVersion}; found ${version}`);

const writeJson = (profile, name, value) => fs.writeFileSync(path.join(profile, `${name}.json`), JSON.stringify(value));
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function poll(read, label, timeoutMs = 60_000) {
  for (const deadline = Date.now() + timeoutMs; Date.now() < deadline; await wait(200)) {
    const value = await read();
    if (value) return value;
  }
  throw new Error(label);
}

const runs = [];
for (const url of urls) for (let run = 1; run <= 3; run++) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-measure-'));
  const tab = { urls: [url], activeIndex: 0, groups: [], groupIds: [null], pinned: [false] };
  writeJson(profile, 'settings', { onboardingVersion: 1, migrationChecklistDismissed: true, searchSuggestions: false, usagePing: false, presentationDefaultsResetVersion: 1 });
  writeJson(profile, 'session', { version: 2, activeWindowId: 'w', windows: [{ id: 'w', profileId: 'default', workspaceId: null, ...tab, meta: [{ title: '', favicon: null }] }], ...tab });
  let app;
  try {
    app = await launchPackagedOverCdp({ executablePath, args: [`--user-data-dir=${profile}`], env: { ...process.env, BLANC_TEST: '0' }, launchViaOpen: true });
    const chrome = await poll(async () => {
      for (const page of app.pages()) {
        if (page.url().startsWith('blanc-chrome://') && await page.evaluate(() => !!document.getElementById('pillShield')).catch(() => false)) return page;
      }
      return null;
    }, 'Blanc chrome document did not appear');
    const page = await poll(async () => app.pages().find(candidate => candidate.url().includes(new URL(url).hostname)) || null, `${url} did not open`);
    await wait(10_000);
    const { text, title } = await chrome.evaluate(() => {
      const shield = document.getElementById('pillShield');
      return { text: document.getElementById('pillShieldCount').textContent.trim(), title: shield.title || shield.getAttribute('aria-label') };
    });
    // Record only a plain count that the chip's own title confirms; anything
    // else (an empty, abbreviated or restarting chip) fails the run.
    const count = Number(title.match(/— (\d+) (?:ads? & trackers?|ad or tracker|requests?) blocked/)?.[1]);
    assert.ok(/^\d+$/.test(text) && Number(text) === count, `${url} run ${run}: unreadable shield count ${JSON.stringify({ text, title })}`);
    const chip = { count, title };
    runs.push({ url, run, finalUrl: page.url(), ...chip });
    process.stdout.write(`${url} run ${run}: ${chip.count}\n`);
  } finally {
    await app?.close().catch(() => {});
    fs.rmSync(profile, { recursive: true, force: true });
  }
}
process.stdout.write(`${JSON.stringify({
  measuredAt: new Date().toISOString(), version, build,
  method: 'Fresh disposable profile per run with the default Blanc Blocker; shield chip count read 10 s after the page target appears; no scrolling or interaction.',
  runs,
}, null, 2)}\n`);
