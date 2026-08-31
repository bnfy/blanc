import { _electron } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-mahjong-relay-'));
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
  await app.evaluate(({ webContents }) => {
    const wc = webContents.getAllWebContents()
      .find((candidate) => candidate.getURL().startsWith('blanc://newtab/'));
    return wc.executeJavaScript(`
      window.__mahjongRelay = null;
      window.addEventListener('message', (event) => {
        const frame = document.getElementById('mahjongFrame');
        window.__mahjongRelay = {
          origin: event.origin,
          sourceMatches: event.source === frame.contentWindow,
          data: event.data,
        };
      });
    `);
  });
  await app.evaluate(() => globalThis.__blanc.setNewtabLayout('mahjong'));
  await waitFor(
    () => app.evaluate(({ webContents }) => {
      const wc = webContents.getAllWebContents()
        .find((candidate) => candidate.getURL().startsWith('blanc://newtab/'));
      return wc?.mainFrame.frames.some((frame) => frame.url.startsWith('blanc://mahjong/'));
    }),
    Boolean,
    'embedded Mahjong frame',
  );
  await waitFor(
    () => app.evaluate(async ({ webContents }) => {
      const wc = webContents.getAllWebContents()
        .find((candidate) => candidate.getURL().startsWith('blanc://newtab/'));
      const frame = wc?.mainFrame.frames
        .find((candidate) => candidate.url.startsWith('blanc://mahjong/'));
      return frame ? frame.executeJavaScript(
        `!!document.querySelector('.mj-tile:not([aria-disabled])')`,
      ) : false;
    }),
    Boolean,
    'playable Mahjong tile',
  );
  await app.evaluate(async ({ webContents }) => {
    const wc = webContents.getAllWebContents()
      .find((candidate) => candidate.getURL().startsWith('blanc://newtab/'));
    const frame = wc.mainFrame.frames
      .find((candidate) => candidate.url.startsWith('blanc://mahjong/'));
    await frame.executeJavaScript(`
      document.querySelector('.mj-tile:not([aria-disabled])').click();
    `);
  });
  const relay = await waitFor(
    () => app.evaluate(({ webContents }) => {
      const wc = webContents.getAllWebContents()
        .find((candidate) => candidate.getURL().startsWith('blanc://newtab/'));
      return wc.executeJavaScript('window.__mahjongRelay');
    }),
    Boolean,
    'Mahjong play relay',
  );
  assert.deepEqual(relay, {
    origin: 'blanc://mahjong',
    sourceMatches: true,
    data: 'blanc:mahjong-played',
  });
} finally {
  await app.close().catch(() => {});
  fs.rmSync(profile, { recursive: true, force: true });
}
