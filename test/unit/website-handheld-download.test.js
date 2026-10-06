const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const load = () => import(pathToFileURL(path.resolve(__dirname, '../../site/src/scripts/handheld-download.js')));
const settle = () => new Promise(resolve => setImmediate(resolve));

function fixture({ userAgent = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)', maxTouchPoints = 5, share, clipboard } = {}) {
  const status = { textContent: '' };
  const note = { hidden: true };
  const link = {
    href: 'https://blancbrowser.com/download', textContent: 'Download Blanc', events: {},
    dataset: { handheldShare: 'share-status', handheldLabel: 'Send to my computer', handheldText: 'Blanc is a desktop browser for macOS, Windows and Linux.', track: 'download_click' },
    addEventListener(type, handler) { this.events[type] = handler; },
  };
  const calls = { share: [], copy: [], assign: [] };
  const document = {
    querySelectorAll: selector => selector === 'a[data-handheld-share]' ? [link] : selector === '[data-handheld-note]' ? [note] : [],
    getElementById: id => (id === 'share-status' ? status : null),
  };
  const navigator = { userAgent, maxTouchPoints };
  if (share) navigator.share = async data => { calls.share.push(data); return share(data); };
  navigator.clipboard = { writeText: async text => { calls.copy.push(text); if (clipboard === 'fail') throw new Error('denied'); } };
  const view = { navigator, location: { assign: url => calls.assign.push(url) } };
  let prevented = 0;
  const click = async () => { await link.events.click({ preventDefault() { prevented++; } }); await settle(); };
  return { document, view, link, note, status, calls, click, prevented: () => prevented };
}

test('phones and tablets are recognised, including iPadOS with a desktop user agent', async () => {
  const { isHandheld } = await load();
  const cases = [
    [{ userAgent: 'Mozilla/5.0 (Linux; Android 15; Pixel 9)', maxTouchPoints: 5 }, true],
    [{ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)', maxTouchPoints: 5 }, true],
    [{ userAgent: 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)', maxTouchPoints: 5 }, true],
    [{ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', maxTouchPoints: 5 }, true],
    [{ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', maxTouchPoints: 0 }, false],
    [{ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', maxTouchPoints: 10 }, false],
    [{ userAgent: 'Mozilla/5.0 (X11; Linux x86_64)', maxTouchPoints: 0 }, false],
    [{}, false],
  ];
  for (const [nav, expected] of cases) assert.equal(isHandheld(nav), expected, JSON.stringify(nav));
});

test('desktop pages are left exactly as they are', async () => {
  const { initHandheldDownload } = await load();
  const f = fixture({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', maxTouchPoints: 0 });
  assert.equal(initHandheldDownload(f), false);
  assert.equal(f.link.textContent, 'Download Blanc');
  assert.equal(f.link.dataset.track, 'download_click');
  assert.equal(f.link.events.click, undefined);
  assert.equal(f.note.hidden, true);
});

test('on a phone the link offers the share sheet and is not counted as a download', async () => {
  const { initHandheldDownload } = await load();
  const f = fixture({ share: () => undefined });
  assert.equal(initHandheldDownload(f), true);
  assert.equal(f.link.textContent, 'Send to my computer');
  assert.equal(f.link.dataset.track, undefined);
  assert.equal(f.note.hidden, false);
  await f.click();
  assert.equal(f.prevented(), 1);
  assert.deepEqual(f.calls.share, [{ title: 'Blanc Browser', text: 'Blanc is a desktop browser for macOS, Windows and Linux.', url: 'https://blancbrowser.com/download' }]);
  assert.deepEqual(f.calls.copy, []);
  assert.deepEqual(f.calls.assign, []);
});

test('cancelling the share sheet does nothing else', async () => {
  const { initHandheldDownload } = await load();
  const f = fixture({ share: () => { throw Object.assign(new Error('cancelled'), { name: 'AbortError' }); } });
  initHandheldDownload(f);
  await f.click();
  assert.deepEqual(f.calls.copy, []);
  assert.deepEqual(f.calls.assign, []);
  assert.equal(f.status.textContent, '');
});

test('a failed or missing share sheet copies the link and says so', async () => {
  const { initHandheldDownload } = await load();
  for (const share of [() => { throw new Error('not allowed'); }, undefined]) {
    const f = fixture({ share });
    initHandheldDownload(f);
    await f.click();
    assert.deepEqual(f.calls.copy, ['https://blancbrowser.com/download']);
    assert.equal(f.status.textContent, 'Link copied');
    assert.deepEqual(f.calls.assign, []);
  }
});

test('when copying also fails the visitor still reaches the download page', async () => {
  const { initHandheldDownload } = await load();
  const f = fixture({ clipboard: 'fail' });
  initHandheldDownload(f);
  await f.click();
  assert.deepEqual(f.calls.assign, ['https://blancbrowser.com/download']);
  assert.equal(f.status.textContent, '');
});

const fs = require('node:fs');
const read = file => fs.readFileSync(path.resolve(__dirname, '../..', file), 'utf8');

test('the homepage hero and /download carry the phone markup and load the module', () => {
  const home = read('site/src/pages/index.astro');
  const hero = home.match(/<a class="planned-action"[^>]*data-cta-position="hero"[^>]*>/)[0];
  assert.match(hero, /href="\/download"/);
  assert.match(hero, /data-handheld-share="hero-share-status"/);
  assert.match(hero, /data-handheld-label="Send to my computer"/);
  assert.match(home, /<p class="handheld-note" data-handheld-note hidden>/);
  assert.match(home, /id="hero-share-status" role="status"/);
  assert.match(read('site/src/scripts/home.js'), /import \{ initHandheldDownload \} from "\.\/handheld-download\.js"/);
  assert.match(read('site/src/scripts/home.js'), /initHandheldDownload\(\);/);

  const download = read('site/src/pages/download.astro');
  assert.match(download, /<aside class="download-handheld" data-handheld-note hidden/);
  assert.match(download, /data-handheld-share="download-share-status"/);
  assert.match(download, /id="download-share-status" role="status"/);
  assert.match(download, /import \{ initHandheldDownload \} from '\.\.\/scripts\/handheld-download\.js';/);
});
