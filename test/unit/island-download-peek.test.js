'use strict';

// A clicked download saves without Save As (#1591), and the Island's downloads
// button is its only sign. With Auto-hide on that button was never seen: a
// click on blanc.day's download button "did nothing" (2026-11-21). A download
// now shows the hidden Island for a moment.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {
  DOWNLOAD_PEEK_MS,
  DOWNLOAD_PEEK_DONE_MS,
  DOWNLOAD_PEEK_MAX_MS,
  downloadPeekStep,
  islandPinned,
  stripHidden,
} = require('../../src/main/island-autohide');

const main = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'main', 'main.js'), 'utf8');
const hidden = { autoHide: true, revealed: false, now: 1000 };

test('a download starting under a hidden Island peeks it', () => {
  assert.deepEqual(downloadPeekStep(null, 'started', hidden), { startedAt: 1000, until: 1000 + DOWNLOAD_PEEK_MS });
  assert.equal(islandPinned({ peeking: true }), true);
  assert.equal(stripHidden({ autoHide: true, revealed: true, pinned: islandPinned({ peeking: true }) }), false);
});

test('nothing changes with auto-hide off or the Island already up', () => {
  assert.equal(downloadPeekStep(null, 'started', { ...hidden, autoHide: false }), null);
  assert.equal(downloadPeekStep(null, 'started', { ...hidden, revealed: true }), null);
  // A completion with no peek under way shows nothing: the start already had its chance.
  assert.equal(downloadPeekStep(null, 'completed', hidden), null);
  assert.equal(downloadPeekStep({ startedAt: 1000, until: 4000 }, 'completed', { ...hidden, autoHide: false }), null);
});

test('finishing during the peek keeps it up for the check', () => {
  const peek = downloadPeekStep(null, 'started', hidden);
  const done = downloadPeekStep(peek, 'completed', { ...hidden, revealed: true, now: 3000 });
  assert.deepEqual(done, { startedAt: 1000, until: 3000 + DOWNLOAD_PEEK_DONE_MS });
  // Finishing at once never shortens the peek.
  const quick = downloadPeekStep(peek, 'completed', { ...hidden, revealed: true, now: 1000 });
  assert.equal(quick.until, peek.until);
});

test('more downloads extend a peek, never past its cap', () => {
  let peek = downloadPeekStep(null, 'started', hidden);
  for (let now = 2000; now < 20_000; now += 1000) {
    peek = downloadPeekStep(peek, now % 2000 ? 'completed' : 'started', { ...hidden, revealed: true, now });
  }
  assert.equal(peek.startedAt, 1000);
  assert.equal(peek.until, 1000 + DOWNLOAD_PEEK_MAX_MS);
});

test('main pins the Island for the peek and drops it with the setting or the window', () => {
  assert.match(main, /peeking: !!runtime\.islandDownloadPeek,/);
  assert.match(main, /setDownloadActivityObserver\(peekIslandForDownload\);/);
  const apply = main.slice(main.indexOf('function applyIslandAutoHide(next)'), main.indexOf('function setIslandAutoHide('));
  assert.match(apply, /endIslandDownloadPeek\(runtime\);/);
  const closed = main.slice(main.indexOf("rt().window.on('closed'"), main.indexOf('destroyIslandFloatViews(runtime);', main.indexOf("rt().window.on('closed'")));
  assert.match(closed, /endIslandDownloadPeek\(runtime\);/);
});
