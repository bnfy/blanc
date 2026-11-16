import { _electron } from 'playwright';
import { inMainTurn } from './support/main-turn.js';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-mahjong-standalone-'));
const { ELECTRON_RUN_AS_NODE: _ignored, ...cleanEnv } = process.env;
void _ignored;
const app = await _electron.launch({ chromiumSandbox: true,
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
  await inMainTurn(app, async ({ webContents }) => {
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
  if (process.env.BLANC_CAPTURE_MAHJONG) {
    await waitFor(
      () => app.evaluate(async ({ webContents }) => {
        const wc = webContents.getAllWebContents().find((candidate) => candidate.getURL().startsWith('blanc://mahjong/'));
        return wc?.executeJavaScript(`document.querySelectorAll('.mj-tile').length`) || 0;
      }),
      (count) => count > 0,
      'a rendered Mahjong board for capture',
    );
    await new Promise((resolve) => setTimeout(resolve, 450));
    const png = await app.evaluate(async ({ webContents }) => {
      const state = globalThis.__blanc.state();
      const wc = webContents.fromId(state.tabs.find((tab) => tab.id === state.activeTabId)?.webContentsId);
      return (await wc.capturePage()).toPNG().toString('base64');
    });
    fs.mkdirSync('output/playwright', { recursive: true });
    fs.writeFileSync('output/playwright/mahjong-sunrise.png', Buffer.from(png, 'base64'));
  }
  const played = await waitFor(
    () => inMainTurn(app, async ({ webContents }) => {
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
          return document.querySelectorAll('.mj-trail, .mj-match-mark').length > 0 ? 'trail' : 'no trail';
        }
        return false;
      })()`);
    }),
    Boolean,
    'a playable standalone Mahjong pair',
  );
  assert.equal(played, 'trail', 'a matched pair draws a trail');
  const trailCleared = await waitFor(
    () => app.evaluate(async ({ webContents }) => {
      const wc = webContents.getAllWebContents()
        .find((candidate) => candidate.getURL().startsWith('blanc://mahjong/'));
      return wc.executeJavaScript(`(() => {
        const free = [...document.querySelectorAll('.mj-tile:not([data-blocked]):not([hidden])')];
        for (let first = 0; first < free.length; first += 1) {
          const name = free[first].getAttribute('aria-label')?.split(',')[0];
          const match = free.slice(first + 1).find((tile) => tile.getAttribute('aria-label')?.split(',')[0] === name);
          if (!name || !match) continue;
          free[first].click();
          match.click();
          const drawn = document.querySelectorAll('.mj-trail, .mj-match-mark').length;
          document.getElementById('mjUndo').click();
          return drawn > 0 && document.querySelectorAll('.mj-trail, .mj-match-mark').length === 0;
        }
        return false;
      })()`);
    }),
    Boolean,
    'undo clearing an in-flight trail',
  );
  assert.equal(trailCleared, true);
  // A fresh win plays the celebration; a key skips to the results card, and
  // Undo during the celebration cancels it with no card left behind.
  const winToLastPair = `(async () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    startGame({ layoutId: 'peaks', mode: 'classic', seed: 7 }, { soundCue: false, rememberPreferences: false });
    await wait(300);
    while (game.removed.filter((r) => !r).length > 2) {
      const [a, b] = E.availableMoves(game)[0];
      E.selectTile(game, a);
      E.selectTile(game, b);
    }
    refreshTiles();
    const [a, b] = E.availableMoves(game)[0];
    activateTile(a);
    activateTile(b);
    const layer = document.getElementById('mjCelebrate');
    for (let i = 0; i < 40 && layer.hidden; i++) await wait(25);
    return { celebrating: !layer.hidden, card: !document.getElementById('mjWin').hidden };
  })()`;
  const mahjongJs = (js) => app.evaluate(async ({ webContents }, source) => webContents.getAllWebContents()
    .find((candidate) => candidate.getURL().startsWith('blanc://mahjong/')).executeJavaScript(source), js);
  assert.deepEqual(await mahjongJs(winToLastPair), { celebrating: true, card: false }, 'a fresh win celebrates before the card');
  assert.deepEqual(await mahjongJs(`(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Shift' }));
    return { celebrating: !document.getElementById('mjCelebrate').hidden, card: !document.getElementById('mjWin').hidden,
      leftover: document.body.classList.contains('is-celebrating') };
  })()`), { celebrating: false, card: true, leftover: false }, 'a key skips straight to the card');
  assert.deepEqual(await mahjongJs(winToLastPair), { celebrating: true, card: false });
  assert.deepEqual(await mahjongJs(`(async () => {
    document.getElementById('mjUndo').click();
    await new Promise((r) => setTimeout(r, 1700));
    return { celebrating: !document.getElementById('mjCelebrate').hidden, card: !document.getElementById('mjWin').hidden,
      leftover: document.body.classList.contains('is-celebrating') };
  })()`), { celebrating: false, card: false, leftover: false }, 'undo mid-celebration leaves no card or overlay');

  // Boards cleared one after another in the same tab each count toward the
  // streak (the tab keeps one game id across deals), the fourth deal moves to
  // the next tile set, replacing an untouched deal keeps the streak, and
  // walking away from a touched board ends it.
  const streak = await mahjongJs(`(async () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const clearStreak = () => S.createProgressStore({ storage: localStorage }).read().clearStreak;
    const deal = () => startGame({ layoutId: 'peaks', mode: 'classic', seed: 7 }, { soundCue: false, rememberPreferences: false });
    const counts = [];
    for (let board = 0; board < 3; board++) {
      deal();
      await wait(300);
      while (game.removed.filter((r) => !r).length > 2) {
        const [a, b] = E.availableMoves(game)[0];
        E.selectTile(game, a);
        E.selectTile(game, b);
      }
      refreshTiles();
      const [a, b] = E.availableMoves(game)[0];
      activateTile(a);
      activateTile(b);
      const layer = document.getElementById('mjCelebrate');
      for (let i = 0; i < 80 && layer.hidden && document.getElementById('mjWin').hidden; i++) await wait(25);
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Shift' }));
      await wait(400);
      counts.push(clearStreak());
    }
    deal();
    const theme = document.body.dataset.tileTheme;
    deal();
    const afterUntouched = clearStreak();
    await wait(400);
    activateTile(E.availableMoves(game)[0][0]);
    deal();
    const result = { counts, theme, afterUntouched, afterAbandon: clearStreak(), themeAfterAbandon: document.body.dataset.tileTheme };
    // Leave a started, unfinished board for the Continue prompt below.
    await wait(400);
    const [a, b] = E.availableMoves(game)[0];
    activateTile(a);
    activateTile(b);
    await wait(800);
    return result;
  })()`);
  assert.deepEqual(streak, {
    counts: [1, 2, 3], theme: 'carved', afterUntouched: 3, afterAbandon: 0, themeAfterAbandon: 'porcelain',
  }, 'clear streak across deals in one tab');

  // The board-cleared title names a notable moment, else rotates without
  // repeating itself.
  const titles = await mahjongJs(`(() => {
    const saved = { ...game };
    const pick = (fields) => {
      Object.assign(game, { zen: false, _outcome: 'none', _clearStreak: 1, dailyKey: null, _winTitleIndex: undefined }, fields);
      return winTitle();
    };
    const today = S.dailyDeal(new Date()).dailyKey;
    const result = {
      record: pick({ _outcome: 'record', _clearStreak: 3 }),
      first: pick({ _outcome: 'first', layoutId: 'arch' }),
      streak: pick({ _clearStreak: 3, dailyKey: today }),
      streakNine: pick({ _clearStreak: 9 }),
      daily: pick({ dailyKey: today }),
      zen: pick({ zen: true, _outcome: 'record' }),
    };
    const rotations = Array.from({ length: 12 }, () => pick({}));
    result.repeats = rotations.some((title, i) => i > 0 && title === rotations[i - 1]);
    result.rotating = new Set(rotations).size > 1 && rotations.every((title) => WIN_TITLES.includes(title));
    Object.assign(game, saved);
    return result;
  })()`);
  assert.deepEqual(titles, {
    record: 'A new personal best.',
    first: 'First time clearing Arch.',
    streak: 'Three in a row. New tiles next.',
    streakNine: 'Nine in a row. New tiles next.',
    daily: 'Today\u2019s Daily, done.',
    zen: 'A quiet finish.',
    repeats: false,
    rotating: true,
  }, 'board-cleared titles');

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
    () => inMainTurn(app, async ({ webContents }) => {
      const state = globalThis.__blanc.state();
      const wc = webContents.fromId(state.tabs.find((tab) => tab.id === state.activeTabId)?.webContentsId);
      return wc?.executeJavaScript(`!document.getElementById('mjResumeNotice')?.hidden`) ?? false;
    }),
    Boolean,
    'Continue prompt for the unfinished saved game',
  );
  assert.equal(resumeOffered, true);
} finally {
  await app.close().catch(() => {});
  fs.rmSync(profile, { recursive: true, force: true });
}
