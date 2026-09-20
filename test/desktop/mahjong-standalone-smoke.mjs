import { _electron } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-mahjong-standalone-'));
const { ELECTRON_RUN_AS_NODE: _ignored, ...cleanEnv } = process.env;
void _ignored;
const app = await _electron.launch({
  args: [path.resolve('.'), `--user-data-dir=${profile}`],
  env: { ...cleanEnv, BLANC_TEST: '1' },
});

const waitFor = async (read, accept, label) => {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const value = await read();
    if (accept(value)) return value;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`timed out waiting for ${label}`);
};

try {
  await app.firstWindow();
  await waitFor(
    () => app.evaluate(() => !!globalThis.__blanc?.startupReady?.()),
    Boolean,
    'startup',
  );
  const before = await app.evaluate(() => globalThis.__blanc.state());
  const sourceId = before.activeTabId;
  await app.evaluate(async ({ webContents }) => {
    const wc = webContents.getAllWebContents()
      .find((candidate) => candidate.getURL().startsWith('blanc://newtab/'));
    if (!wc) throw new Error('a start page should exist');
    await wc.executeJavaScript(`(() => {
      const link = document.getElementById('mahjongLink');
      if (!link || document.querySelector('iframe')) return false;
      link.click();
      return true;
    })()`);
  });
  const launched = await waitFor(
    () => app.evaluate(() => globalThis.__blanc.state()),
    (state) => state.tabs.length === before.tabs.length + 1 &&
      state.tabs.find((tab) => tab.id === state.activeTabId)?.loadedUrl?.startsWith('blanc://mahjong/'),
    'a standalone managed Mahjong tab',
  );
  assert.ok(launched.tabs.find((tab) => tab.id === sourceId)?.loadedUrl?.startsWith('blanc://newtab/'));
  const played = await waitFor(
    () => app.evaluate(async ({ webContents }) => {
      const wc = webContents.getAllWebContents()
        .find((candidate) => candidate.getURL().startsWith('blanc://mahjong/'));
      if (!wc) return false;
      return wc.executeJavaScript(`(() => {
        const free = [...document.querySelectorAll('.mj-tile:not([data-blocked]):not([hidden])')];
        for (let first = 0; first < free.length; first += 1) {
          const name = free[first].getAttribute('aria-label')?.split(',')[0];
          const match = free.slice(first + 1).find((tile) => tile.getAttribute('aria-label')?.split(',')[0] === name);
          if (!name || !match) continue;
          free[first].click();
          match.click();
          return true;
        }
        return false;
      })()`);
    }),
    Boolean,
    'a playable standalone Mahjong pair',
  );
  assert.equal(played, true);
  const savedGameUrl = (await app.evaluate(() => globalThis.__blanc.state()))
    .tabs.find((tab) => tab.id === launched.activeTabId)?.loadedUrl;
  assert.ok(savedGameUrl?.startsWith('blanc://mahjong/'));
  const directId = await app.evaluate(() => globalThis.__blanc.openTab('blanc://mahjong/'));
  await waitFor(
    () => app.evaluate(() => globalThis.__blanc.state()),
    (state) => state.activeTabId === directId &&
      state.tabs.find((tab) => tab.id === directId)?.loadedUrl?.startsWith('blanc://mahjong/'),
    'direct game URL in a new managed tab',
  );
  const resumeOffered = await waitFor(
    () => app.evaluate(async ({ webContents }) => {
      const state = globalThis.__blanc.state();
      const wc = webContents.fromId(state.tabs.find((tab) => tab.id === state.activeTabId)?.webContentsId);
      return wc?.executeJavaScript(`!document.getElementById('mjResumeNotice')?.hidden`) ?? false;
    }),
    Boolean,
    'Continue prompt for the unfinished saved game',
  );
  assert.equal(resumeOffered, true);
  if (process.env.BLANC_CAPTURE_MAHJONG) {
    const png = await app.evaluate(async ({ webContents }) => {
      const state = globalThis.__blanc.state();
      const wc = webContents.fromId(state.tabs.find((tab) => tab.id === state.activeTabId)?.webContentsId);
      return (await wc.capturePage()).toPNG().toString('base64');
    });
    fs.mkdirSync('output/playwright', { recursive: true });
    fs.writeFileSync('output/playwright/mahjong-lacquer.png', Buffer.from(png, 'base64'));
  }
} finally {
  await app.close().catch(() => {});
  fs.rmSync(profile, { recursive: true, force: true });
}
