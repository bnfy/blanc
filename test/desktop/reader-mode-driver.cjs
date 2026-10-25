'use strict';
const fs = require('node:fs');
const assert = require('node:assert/strict');
const { app, webContents, BrowserWindow } = require('electron');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function waitFor(read, label, ms = 20000) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    try { const result = await read(); if (result) return result; } catch {}
    await sleep(75);
  }
  throw Error(`Timed out: ${label}`);
}
app.whenReady().then(async () => {
  const checks = [];
  let error;
  let completed = false;
  try {
    const H = await waitFor(() => globalThis.__blanc, 'test hook');
    await waitFor(() => H.startupReady(), 'startup');
    const chrome = await waitFor(() => webContents.getAllWebContents().find(wc => wc.getURL() === 'blanc-chrome://index/'), 'chrome');
    const call = (method, ...args) => chrome.executeJavaScript(`window.browserAPI[${JSON.stringify(method)}](...${JSON.stringify(args)})`);
    const id = H.openTabInWindow('primary', `${process.env.READER_SMOKE_BASE}/article`);
    H.activateTabInWindow('primary', id);
    const source = await waitFor(() => webContents.fromId(H.tabWebContentsId(id)), 'source');
    await waitFor(async () => !source.isLoading() && await source.executeJavaScript('document.querySelectorAll("article p").length > 10'), 'article');
    await source.executeJavaScript('window.readerOriginal = "preserved"; window.scrollTo(0, 300);');
    const before = await source.executeJavaScript('window.scrollY');
    const extraction = await source.executeJavaScriptInIsolatedWorld(1004, [{ code: require('../../src/main/reader-extract').buildReaderExtraction() }]);
    checks.push({ extraction: extraction && { title: extraction.title, length: extraction.textContent.length, images: extraction.images.length } });
    await sleep(200);
    assert.equal(await call('toggleReaderMode', id), true);
    let reader = await waitFor(() => webContents.getAllWebContents().find(wc => wc.getURL().startsWith('blanc-reader:')), 'reader');
    await waitFor(() => reader.executeJavaScript('document.getElementById("article").textContent.length > 200'), 'reader content');
    const sanitized = await reader.executeJavaScript(`({ text: document.getElementById('article').textContent,
      unsafe: document.querySelectorAll('article script, article iframe, article form, article [onclick], article [onerror], article [style]').length,
      api: typeof window.browserAPI, pages: typeof window.bowserPages,
      linksSafe: [...document.querySelectorAll('article a[href]')].every(a => /^(?:https?:|#)/i.test(a.getAttribute('href'))),
      source: document.getElementById('source').textContent, tables: document.querySelectorAll('article table').length })`);
    assert.equal(sanitized.unsafe, 0); assert.equal(sanitized.api, 'undefined'); assert.equal(sanitized.pages, 'undefined');
    assert.equal(sanitized.text.includes('HIDDEN_SECRET'), false); assert.equal(sanitized.source, '127.0.0.1');
    assert.equal(sanitized.tables, 1); assert.equal(sanitized.linksSafe, true);
    checks.push('sanitized article with tables, no hidden content or privileged bridge');
    fs.writeFileSync(process.env.READER_SMOKE_SCREENSHOT, (await reader.capturePage()).toPNG());
    await reader.executeJavaScript(`(() => {
      for (const [id, value] of Object.entries({theme:'sepia',font:'sans',size:'28',width:'wide'})) {
        const control = document.getElementById(id); control.value = value; control.dispatchEvent(new Event('change'));
      }
      window.scrollTo(0,0);
    })()`);
    await waitFor(() => reader.executeJavaScript("getComputedStyle(document.body).backgroundColor === 'rgb(242, 229, 203)'"), 'sepia paint');
    await sleep(100);
    fs.writeFileSync(process.env.READER_SMOKE_SCREENSHOT.replace('.png', '-sepia.png'), (await reader.capturePage()).toPNG());
    await reader.executeJavaScript(`(() => { const control = document.getElementById('theme'); control.value = 'dark'; control.dispatchEvent(new Event('change')); })()`);
    await waitFor(() => reader.executeJavaScript("getComputedStyle(document.body).backgroundColor === 'rgb(32, 32, 31)'"), 'dark paint');
    await sleep(100);
    fs.writeFileSync(process.env.READER_SMOKE_SCREENSHOT.replace('.png', '-dark.png'), (await reader.capturePage()).toPNG());

    const captureWindow = BrowserWindow.getAllWindows().find(item => item.contentView.children.some(view => view.webContents === reader));
    const captureView = captureWindow.contentView.children.find(view => view.webContents === reader);
    const originalBounds = captureView.getBounds();
    captureView.setBounds({ ...originalBounds, width: 390, height: 844 });
    await waitFor(() => reader.executeJavaScript('window.innerWidth === 390'), 'narrow reader layout');
    await sleep(100);
    fs.writeFileSync(process.env.READER_SMOKE_SCREENSHOT.replace('.png', '-narrow.png'), (await reader.capturePage()).toPNG());
    captureView.setBounds(originalBounds);
    assert.ok(Number.isInteger(await call('findInPage', id, 'Reader fixture')));
    const prefs = { theme: 'sepia', font: 'sans', size: 28, width: 'wide' };
    assert.deepEqual(await reader.executeJavaScript(`window.readerAPI.appearance(${JSON.stringify(prefs)})`), prefs);
    await call('goBack', id);
    assert.equal(source.getURL(), `${process.env.READER_SMOKE_BASE}/article`);
    assert.equal(await source.executeJavaScript('window.readerOriginal'), 'preserved');
    assert.equal(await source.executeJavaScript('window.scrollY'), before);
    checks.push('Back exits instantly and preserves source DOM and scroll');
    assert.equal(await call('toggleReaderMode', id), true);
    reader = await waitFor(() => webContents.getAllWebContents().find(wc => wc.getURL().startsWith('blanc-reader:')), 'second reader');
    const data = await reader.executeJavaScript('window.readerAPI.initialize()');
    assert.deepEqual(data.appearance, prefs);
    void reader.executeJavaScript(`window.readerAPI.openLink(${JSON.stringify(process.env.READER_SMOKE_BASE + '/next')}, false)`).catch(() => {});
    await waitFor(() => source.getURL().endsWith('/next') && !source.isLoading(), 'outbound navigation');
    checks.push('appearance persists; links navigate original tab');
    const privateId = H.openTabInWindow('primary', `${process.env.READER_SMOKE_BASE}/article`, { private: true });
    H.activateTabInWindow('primary', privateId);
    const privateSource = await waitFor(() => webContents.fromId(H.tabWebContentsId(privateId)), 'private source');
    await waitFor(() => !privateSource.isLoading(), 'private load');
    assert.equal(await call('toggleReaderMode', privateId), true);
    reader = await waitFor(() => webContents.getAllWebContents().find(wc => wc.getURL().startsWith('blanc-reader:')), 'private reader');
    assert.deepEqual((await reader.executeJavaScript('window.readerAPI.initialize()')).appearance, prefs);
    await reader.executeJavaScript(`window.readerAPI.appearance({theme:'dark',font:'serif',size:16,width:'narrow'})`);
    await call('toggleReaderMode', privateId);
    checks.push('private reader inherits preferences and uses memory-only overrides');
    await call('closeTab', privateId);
    H.activateTabInWindow('primary', id);
    assert.equal(await call('toggleReaderMode', id), true);
    reader = await waitFor(() => webContents.getAllWebContents().find(wc => wc.getURL().startsWith('blanc-reader:')), 'reader for pane checks');
    const otherId = H.openTabInWindow('primary', `${process.env.READER_SMOKE_BASE}/article`);
    await waitFor(() => { const wc = webContents.fromId(H.tabWebContentsId(otherId)); return wc && !wc.isLoading(); }, 'second pane');
    H.makeSplit(id, [otherId]);
    const window = BrowserWindow.getAllWindows().find(item => item.webContents === chrome);
    const readerView = window.contentView.children.find(view => view.webContents === reader);
    assert.ok(readerView);
    assert.ok(readerView.getBounds().width < window.getContentBounds().width);
    assert.equal(readerView.getVisible(), true);
    checks.push('reader uses Split View pane bounds and remains visible');
    await call('removeFromSplit', id);
    H.activateTabInWindow('primary', id);
    await H.setGlance(otherId);
    await waitFor(() => H.state().glanceTabId === otherId, 'Glance role');
    assert.equal(await call('toggleReaderMode', otherId), true);
    const glanceReader = await waitFor(() => webContents.getAllWebContents().find(wc => wc.getURL().startsWith('blanc-reader:') && wc !== reader), 'Glance reader');
    const glanceView = window.contentView.children.find(view => view.webContents === glanceReader);
    assert.ok(glanceView);
    assert.ok(glanceView.getBounds().width < window.getContentBounds().width);
    await call('toggleReaderMode', otherId);
    await call('closeGlance');
    checks.push('Glance reader fits its card and exits independently');
    H.activateTabInWindow('primary', id);
    const newRuntimeId = H.moveTabToNewWindow(id);
    assert.ok(newRuntimeId && newRuntimeId !== 'primary');
    const movedWindow = BrowserWindow.getAllWindows().find(item => item.contentView.children.some(view => view.webContents === reader));
    assert.ok(movedWindow && movedWindow !== window);
    assert.equal(reader.isDestroyed(), false);
    assert.equal(await source.executeJavaScript('window.readerOriginal'), undefined, 'source remains the navigated document');
    checks.push('moving a reader tab transfers its companion and source to the new window');
    completed = true;
  } catch (caught) { error = String(caught.stack || caught); }
  fs.writeFileSync(`${process.env.READER_SMOKE_RESULT}.tmp`, JSON.stringify({ completed, checks, screenshot: process.env.READER_SMOKE_SCREENSHOT, error }, null, 2));
  fs.renameSync(`${process.env.READER_SMOKE_RESULT}.tmp`, process.env.READER_SMOKE_RESULT);
  app.exit(error ? 1 : 0);
});
