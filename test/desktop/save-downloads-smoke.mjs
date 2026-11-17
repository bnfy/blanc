import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { _electron } from 'playwright';
import poll from './support/poll.js';
import testHookCall from './support/test-hook-call.js';

// #1591: a clicked download saves straight to the Downloads folder under a
// free name, without Save As. Unit tests use a fake DownloadItem; this proves
// the real one: Chromium writes over the empty file Blanc claims for the name,
// a second download of the same file becomes "report (1).txt", a download the
// page starts without a click still asks, one click lets only one download
// skip Save As (the packaged check found a click followed by a burst), and
// every download asks once "Ask where to save each file" is on. Clicks are
// real mouse events sent to the tab. Downloads go to a temporary folder.

const { waitForValue } = poll;
const { callTestHook } = testHookCall;
const repo = path.resolve('.');
const { ELECTRON_RUN_AS_NODE: ignored, ...env } = process.env;

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-save-downloads-'));
const downloadsDir = path.join(root, 'Downloads');
fs.mkdirSync(downloadsDir);
const userData = path.join(root, 'profile');
fs.mkdirSync(`${userData}-Dev`, { recursive: true });
fs.writeFileSync(path.join(`${userData}-Dev`, 'settings.json'), JSON.stringify({
  onboardingVersion: 1, adblockEnabled: false, usagePing: false, searchSuggestions: false,
}));

const BODY = 'hello from #1591\n';
const server = http.createServer((request, response) => {
  if (request.url === '/report.txt') {
    response.writeHead(200, {
      'content-type': 'application/octet-stream',
      'content-disposition': 'attachment; filename="report.txt"',
    });
    response.end(BODY);
    return;
  }
  response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  response.end('<!doctype html><title>files</title>'
    + '<p id="note" style="padding:20px">notes</p>'
    + '<a id="dl" href="/report.txt" style="display:inline-block;padding:20px">report</a>'
    + '<a id="silent" href="/report.txt" download>report</a>');
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const pageUrl = `${origin}/`;

const files = () => fs.readdirSync(downloadsDir).sort();

let app;
try {
  app = await _electron.launch({
    chromiumSandbox: true,
    args: [repo, `--user-data-dir=${userData}`],
    env: { ...env, BLANC_TEST: '1' },
  });
  await app.firstWindow();
  await waitForValue(() => callTestHook(app, 'startupReady'), Boolean, 'startup', 30_000);

  // Point Downloads at the temporary folder, and record the save path Blanc
  // chose for every download. This listener runs after Blanc's own; a
  // download Blanc left to the dialog is cancelled so no dialog stays open.
  await app.evaluate(({ app: electronApp, session }, dir) => {
    electronApp.setPath('downloads', dir);
    globalThis.__savePaths = [];
    session.defaultSession.on('will-download', (_event, item) => {
      globalThis.__savePaths.push(item.getSavePath());
      if (!item.getSavePath()) item.cancel();
    });
  }, downloadsDir);
  const savePaths = () => app.evaluate(() => globalThis.__savePaths.slice());

  const tabId = await callTestHook(app, 'openTab', [pageUrl]);
  const wcId = await waitForValue(() => callTestHook(app, 'tabWebContentsId', [tabId]), Boolean, 'the tab', 15_000);
  await waitForValue(
    () => app.evaluate(({ webContents }, id) => webContents.fromId(id)?.executeJavaScript('!!document.getElementById("dl")'), wcId),
    Boolean, 'the page', 15_000,
  );
  const run = (code, gesture) => app.evaluate(
    ({ webContents }, [id, source, userGesture]) => webContents.fromId(id).executeJavaScript(source, userGesture),
    [wcId, code, gesture],
  );
  // A real click: mouse down and up at the element's center, sent to the tab.
  const centerOf = {
    dl: '(() => { const r = document.getElementById("dl").getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }; })()',
    note: '(() => { const r = document.getElementById("note").getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }; })()',
  };
  const click = async (id = 'dl') => {
    const point = await run(centerOf[id], false);
    await app.evaluate(({ webContents }, [wcIdArg, at]) => {
      const wc = webContents.fromId(wcIdArg);
      wc.sendInputEvent({ type: 'mouseDown', x: at.x, y: at.y, button: 'left', clickCount: 1 });
      wc.sendInputEvent({ type: 'mouseUp', x: at.x, y: at.y, button: 'left', clickCount: 1 });
    }, [wcId, point]);
  };
  // Finished means exactly these files, each holding the downloaded bytes.
  // Chromium on Windows writes into a temporary "<id>.tmp" in the folder and
  // renames it over the name Blanc claimed when the download ends.
  const read = (name) => {
    try { return fs.readFileSync(path.join(downloadsDir, name), 'utf8'); } catch { return null; }
  };
  const finished = (names) => waitForValue(
    () => ({ files: files(), bodies: names.map(read) }),
    (seen) => JSON.stringify(seen.files) === JSON.stringify(names) && seen.bodies.every((body) => body === BODY),
    `${names.join(' and ')} to finish`, 15_000,
  );

  await click();
  await finished(['report.txt']);
  await click();
  await finished(['report (1).txt', 'report.txt']);

  // A download the page starts by itself, with no click, still asks.
  const before = (await savePaths()).length;
  await run('document.getElementById("silent").click()', false);
  const afterSilent = await waitForValue(savePaths, (seen) => seen.length > before, 'the page-started download', 15_000);
  assert.equal(afterSilent.at(-1), '', 'a download without a click is left to Save As');
  assert.deepEqual(files(), ['report (1).txt', 'report.txt'], 'nothing new was saved');

  // One click elsewhere on the page, then the page starts two downloads: the
  // first may skip Save As, the second asks.
  const beforeBurst = (await savePaths()).length;
  await click('note');
  await run('document.getElementById("silent").click(); document.getElementById("silent").click();', false);
  const burst = await waitForValue(savePaths, (seen) => seen.length >= beforeBurst + 2, 'the two page-started downloads', 15_000);
  assert.equal(path.basename(burst[beforeBurst]), 'report (2).txt', 'the first download after the click is saved');
  assert.equal(burst[beforeBurst + 1], '', 'the second download after one click asks');
  await finished(['report (1).txt', 'report (2).txt', 'report.txt']);

  // With "Ask where to save each file" on, a clicked download asks too.
  await app.evaluate(({}, settingsPath) => {
    process.mainModule.require(settingsPath).setSettings({ askWhereToSave: true });
  }, path.join(repo, 'src/main/settings.js'));
  const beforeAsk = (await savePaths()).length;
  await click();
  const afterAsk = await waitForValue(savePaths, (seen) => seen.length > beforeAsk, 'the asked download', 15_000);
  assert.equal(afterAsk.at(-1), '', 'with the switch on, Blanc leaves the download to Save As');
  assert.deepEqual(files(), ['report (1).txt', 'report (2).txt', 'report.txt']);

  const exited = new Promise((resolve) => app.process().once('exit', resolve));
  await app.evaluate(({ app: electronApp }) => electronApp.quit());
  await exited;
  app = null;
  console.log('ok   clicked downloads save to Downloads as report.txt and report (1).txt');
  console.log('ok   a page-started download and the switch both leave it to Save As');
  console.log('ok   one click lets only one download skip Save As');
} finally {
  if (app) await app.close().catch(() => {});
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  try {
    fs.rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  } catch (error) {
    console.error(`left ${root} behind: ${error.code ?? error.message}`);
  }
}
