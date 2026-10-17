'use strict';
// Main-process driver for pdf-viewer-smoke.mjs, loaded with `electron -r`.
//
// Chromium's built-in PDF viewer loads each document into a child frame of its
// own page (chrome-extension://<viewer>/index.html) from its own origin. When
// a Blanc guard refuses that frame, or the viewer page itself, the tab shows
// an empty viewer and nothing fails: Blanc's external-protocol guard and the
// uBO provider both did this until the PDF viewer fix. A document counts as
// shown when that child frame commits the document's own URL and the tab
// takes the viewer's title (the last path segment), which the viewer sets
// only once the document has loaded.
const fs = require('node:fs');
const { app, webContents } = require('electron');

const RESULT = process.env.PDF_SMOKE_RESULT;
const BASE = process.env.PDF_SMOKE_BASE;
const PROVIDER = process.env.PDF_SMOKE_PROVIDER;
const VIEWER_PAGE = 'chrome-extension://mhjfbmdgcfjbbpaeojofohoefgiehjai/index.html';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(read, label, ms = 20000) {
  const deadline = Date.now() + ms;
  for (;;) {
    try { const value = await read(); if (value) return value; } catch {}
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${label}`);
    await sleep(100);
  }
}

const results = [];

// What the tab shows: the viewer page, its document frame and the title.
function observe(wc) {
  const frames = wc.mainFrame.framesInSubtree;
  const viewer = frames.find((frame) => frame.url === VIEWER_PAGE);
  const document = viewer && frames.find((frame) => frame.parent?.frameTreeNodeId === viewer.frameTreeNodeId);
  return { viewer: !!viewer, documentFrame: document?.url ?? null, title: wc.getTitle() };
}

async function expectShown(H, name, id, documentUrl) {
  const result = { name, shown: false };
  try {
    const wc = await waitFor(() => webContents.fromId(H.tabWebContentsId(id)), `${name} tab`);
    const title = decodeURIComponent(new URL(documentUrl).pathname.split('/').pop());
    try {
      await waitFor(() => {
        const seen = observe(wc);
        return seen.documentFrame === documentUrl && seen.title === title;
      }, `${name} to show its document`, 15000);
      result.shown = true;
    } finally {
      result.seen = observe(wc);
    }
  } catch (error) {
    result.error = String(error?.message ?? error);
  }
  results.push(result);
}

app.whenReady().then(async () => {
  let error = null;
  try {
    const H = await waitFor(() => globalThis.__blanc, 'the test hook', 30000);
    await waitFor(() => H.startupReady(), 'startup', 30000);
    // Unbound hook calls act on the focused window, so every call names it.
    const WINDOW = 'primary';
    const open = (url, options) => H.openTabInWindow(WINDOW, url, options);
    // Real blocking must be on, with the blocker under test.
    const status = await waitFor(() => {
      const state = H.blockingStatusInWindow(WINDOW);
      return state?.phase === 'ready' || state?.phase === 'failed' ? state : null;
    }, `${PROVIDER} to be ready`, 100000);
    if (status.phase !== 'ready' || status.active !== PROVIDER) {
      throw new Error(`expected ${PROVIDER} blocking, got ${JSON.stringify(status)}`);
    }
    const state = (id) => H.state().tabs.find((tab) => tab.id === id);
    const loaded = (id) => waitFor(() => { const tab = state(id); return tab && !tab.loading && !tab.isLoading; }, `tab ${id} to load`);
    const openedBy = async (wc, script) => {
      const before = new Set(H.state().tabs.map((tab) => tab.id));
      await wc.executeJavaScript(script, true);
      return waitFor(() => H.state().tabs.find((tab) => !before.has(tab.id))?.id, 'the opened tab');
    };

    // Typed or linked: the PDF is the page.
    const direct = `${BASE}/invoice/13/pdf`;
    await expectShown(H, 'opened directly', open(direct), direct);

    // A page opens the PDF in a new tab (how Found exports an invoice).
    const opener = open(`${BASE}/opener`);
    await loaded(opener);
    const page = webContents.fromId(H.tabWebContentsId(opener));
    const popup = `${BASE}/invoice/14/pdf`;
    await expectShown(H, 'opened by a page in a new tab',
      await openedBy(page, `window.open(${JSON.stringify(popup)}); 1`), popup);

    // A page builds the PDF itself and opens it as a blob.
    const blobTab = await openedBy(page, `(async () => {
      const bytes = new Uint8Array(await (await fetch('/invoice/15/pdf')).arrayBuffer());
      window.open(URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' })));
      return 1;
    })()`);
    const blobUrl = await waitFor(() => /^blob:/.test(state(blobTab)?.url ?? '') && state(blobTab).url, 'the blob URL');
    await expectShown(H, 'opened by a page as a blob', blobTab, blobUrl);

    // Private tabs have their own session and always use Blanc Blocker.
    const privateUrl = `${BASE}/invoice/16/pdf`;
    await expectShown(H, 'opened in a private tab', open(privateUrl, { private: true }), privateUrl);
  } catch (caught) {
    error = String(caught?.stack ?? caught);
  }
  fs.writeFileSync(`${RESULT}.tmp`, JSON.stringify({ results, error }, null, 2));
  fs.renameSync(`${RESULT}.tmp`, RESULT);
  // Linux test apps can hang on quit; the launcher stops the process tree.
  app.exit(0);
});
