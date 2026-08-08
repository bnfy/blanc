// Real Electron smoke for the post-1.0 scroll-away Island experiment. It
// drives a root-page scroll through the test-only hook, so the session preload
// and its main-process sender checks participate exactly as they do in Blanc.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from 'playwright';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-scroll-away-'));

async function waitFor(read, predicate, label) {
  const deadline = Date.now() + 8_000;
  let value;
  do {
    value = await read();
    if (predicate(value)) return value;
    await new Promise((resolve) => setTimeout(resolve, 25));
  } while (Date.now() < deadline);
  throw new Error(`${label}: ${JSON.stringify(value)}`);
}

const app = await electron.launch({
  args: [REPO_ROOT, `--user-data-dir=${userDataDir}`],
  env: { ...process.env, BLANC_TEST: '1' },
});

try {
  await waitFor(
    () => app.evaluate(() => !!globalThis.__blanc),
    Boolean,
    'Blanc test hook'
  );
  await app.evaluate(() => globalThis.__blanc.setWindowContentSize(1280, 800));

  const normalBounds = await waitFor(
    () => app.evaluate(() => globalThis.__blanc.activeGuestBounds()),
    (bounds) => bounds?.x === 0 && bounds?.y === 64 && bounds?.width === 1280 && bounds?.height === 736,
    'initial Island landing-zone bounds'
  );
  assert.deepEqual(normalBounds, { x: 0, y: 64, width: 1280, height: 736 });

  assert.equal(await app.evaluate(
    () => globalThis.__blanc.prepareActivePageScrollFixture()
  ), true, 'the smoke page must be scrollable');
  assert.ok(await app.evaluate(
    () => globalThis.__blanc.programmaticScrollActivePageTo(240)
  ) > 0, 'the fixture should accept a programmatic scroll');
  await new Promise((resolve) => setTimeout(resolve, 500));
  assert.deepEqual(
    await app.evaluate(() => globalThis.__blanc.activeGuestBounds()),
    normalBounds,
    'a page script must not hide browser chrome'
  );
  assert.equal(await app.evaluate(
    () => globalThis.__blanc.scrollActivePageWheel(240)
  ), true, 'the smoke must send a downward wheel gesture');
  const expandedBounds = await waitFor(
    () => app.evaluate(() => globalThis.__blanc.activeGuestBounds()),
    (bounds) => bounds?.x === 0 && bounds?.y === 0 && bounds?.width === 1280 && bounds?.height === 800,
    'page bounds after a downward scroll'
  );
  assert.deepEqual(expandedBounds, { x: 0, y: 0, width: 1280, height: 800 });
  if (process.platform === 'darwin') {
    const trafficLightIsland = await waitFor(
      () => app.evaluate(() => globalThis.__blanc.trafficLightIslandState()),
      (state) => state?.visible && state.bounds?.x === 10 && state.bounds?.y === 6,
      'Traffic-light Island after a downward scroll'
    );
    assert.deepEqual(trafficLightIsland, {
      visible: true,
      bounds: { x: 10, y: 6, width: 116, height: 42 },
    });
    if (process.env.BLANC_CAPTURE_TRAFFIC_LIGHT_ISLAND) {
      await app.evaluate(async (target) => {
        const { BrowserWindow } = require('electron');
        const image = await BrowserWindow.getFocusedWindow().capturePage();
        require('node:fs').writeFileSync(target, image.toPNG());
      }, process.env.BLANC_CAPTURE_TRAFFIC_LIGHT_ISLAND);
    }
  }

  assert.equal(await app.evaluate(
    () => globalThis.__blanc.scrollActivePageWheel(-240)
  ), true, 'the smoke must send an upward wheel gesture');
  const restoredBounds = await waitFor(
    () => app.evaluate(() => globalThis.__blanc.activeGuestBounds()),
    (bounds) => bounds?.x === 0 && bounds?.y === 64 && bounds?.width === 1280 && bounds?.height === 736,
    'page bounds after an upward scroll'
  );
  assert.deepEqual(restoredBounds, normalBounds);
  if (process.platform === 'darwin') {
    assert.deepEqual(
      await app.evaluate(() => globalThis.__blanc.trafficLightIslandState()),
      { visible: false, bounds: null },
      'Traffic-light Island should merge away when the main Island returns'
    );
  }
  console.log('scroll-away Island smoke passed');
} finally {
  await app.close();
  fs.rmSync(userDataDir, { recursive: true, force: true });
}
