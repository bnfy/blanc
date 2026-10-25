'use strict';

const { WebContentsView, session, nativeImage } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { JsonStore } = require('./store');
const { withLocalProfile } = require('./local-profile-context');
const { READER_WORLD_ID, READER_SCHEME, DEFAULT_APPEARANCE, normalizeAppearance, eligible, validArticle, webUrl } = require('./reader-model');
const { buildReaderProbe, buildReaderExtraction } = require('./reader-extract');
const { createReaderImageBroker, rasterDimensions, MAX_IMAGE_PIXELS } = require('./reader-images');
const { attachContextMenu } = require('./context-menu');

function bounded(promise, ms, fallback = null) {
  let timer;
  return Promise.race([promise, new Promise(resolve => { timer = setTimeout(() => resolve(fallback), ms); })])
    .finally(() => clearTimeout(timer));
}

function createReaderMode(hooks) {
  const records = new Map();
  const probes = new Map();
  const attempts = new Map();
  const privateAppearance = new Map();
  const preferences = new JsonStore('reader-appearance', DEFAULT_APPEARANCE, { scope: 'profile' });
  let readerSession;
  const source = tab => tab?.view?.webContents;
  const appearance = tab => withLocalProfile(tab.profileId, () => normalizeAppearance(
    tab.private && privateAppearance.has(tab.profileId) ? privateAppearance.get(tab.profileId) : preferences.data));
  const current = (tab, wc, epoch) => hooks.tab(tab.id) === tab && source(tab) === wc
    && !!wc && !wc.isDestroyed() && tab.navEpoch === epoch;
  const image = createReaderImageBroker({
    allowImage: hooks.allowImage,
    lookupImage: (tab, host) => hooks.resolveImageHost?.(tab, host) ?? Promise.resolve([]),
    decode: bytes => {
      const dimensions = rasterDimensions(bytes);
      if (!dimensions?.width || !dimensions.height || dimensions.width * dimensions.height > MAX_IMAGE_PIXELS) return null;
      const raster = nativeImage.createFromBuffer(bytes);
      if (raster.isEmpty()) return null;
      const size = raster.getSize();
      if (!size.width || !size.height || size.width * size.height > MAX_IMAGE_PIXELS) return null;
      return raster.toPNG();
    },
  });
  const assets = new Map([
    ['reader.html', path.join(__dirname, '../renderer/pages/reader.html')],
    ['reader.js', path.join(__dirname, '../renderer/pages/reader.js')],
    ['reader.css', path.join(__dirname, '../renderer/pages/reader.css')],
    ['reader-content.js', path.join(__dirname, '../renderer/pages/reader-content.js')],
    ['purify.js', path.join(path.dirname(require.resolve('dompurify')), 'purify.js')],
    ['instrument.woff2', path.join(__dirname, '../renderer/pages/instrument-sans-latin-wdth-normal.woff2')],
    ['inter.woff2', path.join(__dirname, '../renderer/pages/inter-latin.woff2')],
    ['mono.woff2', path.join(__dirname, '../renderer/pages/jetbrains-mono-latin.woff2')],
    ['serif.woff2', path.join(__dirname, '../renderer/pages/source-serif-4-regular.woff2')],
    ['i18n.js', path.join(__dirname, '../renderer/pages/i18n.js')],
  ]);
  function getSession() {
    if (readerSession) return readerSession;
    readerSession = session.fromPartition('blanc-reader');
    readerSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
    readerSession.setPermissionCheckHandler(() => false);
    readerSession.on('will-download', event => event.preventDefault());
    readerSession.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*', 'file://*/*', 'ftp://*/*'] }, (_details, callback) => callback({ cancel: true }));
    readerSession.protocol.handle(READER_SCHEME, async request => {
      const url = new URL(request.url);
      const record = [...records.values()].find(item => item.token === url.hostname && !item.closed);
      if (!record || url.username || url.password || url.port || url.search || request.method !== 'GET') return new Response('', { status: 404 });
      const name = url.pathname === '/' ? 'reader.html' : url.pathname.slice(1);
      const headers = { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' };
      const match = /^image\/(0|[1-9]\d?)$/.exec(name);
      if (match) {
        const bytes = await image(record, Number(match[1]));
        return bytes ? new Response(bytes, { headers: { ...headers, 'content-type': 'image/png' } }) : new Response('', { status: 404 });
      }
      if (name === 'strings.js') return new Response(hooks.stringsScript(), { headers: { ...headers, 'content-type': 'text/javascript; charset=utf-8' } });
      const file = assets.get(name);
      if (!file) return new Response('', { status: 404 });
      const type = name.endsWith('.js') ? 'text/javascript' : name.endsWith('.css') ? 'text/css'
        : name.endsWith('.woff2') ? 'font/woff2' : 'text/html';
      return new Response(fs.readFileSync(file), { headers: { ...headers, 'content-type': `${type}${type.startsWith('text/') ? '; charset=utf-8' : ''}` } });
    });
    return readerSession;
  }
  function clearProbe(tab) {
    const probe = probes.get(tab.id);
    if (probe) clearTimeout(probe.timer);
    probes.delete(tab.id);
    tab.readerAvailable = false;
  }
  function exit(tab, { update = true } = {}) {
    if (!tab) return false;
    attempts.delete(tab.id);
    const record = records.get(tab.id);
    if (!record) return false;
    record.closed = true;
    records.delete(tab.id);
    tab.readerActive = false;
    for (const controller of record.imageControllers) controller.abort();
    record.imageCache.clear();
    record.article = null;
    record.view.setVisible(false);
    hooks.detach(tab, record.view);
    const wc = record.view.webContents;
    if (wc && !wc.isDestroyed()) wc.close();
    if (update) hooks.changed(tab);
    return true;
  }
  function invalidate(tab) {
    clearProbe(tab);
    attempts.delete(tab.id);
    exit(tab);
    hooks.broadcast(tab);
  }
  function probe(tab) {
    const wc = source(tab);
    if (!eligible(tab, wc) || !hooks.visible(tab) || records.has(tab.id)) return;
    const old = probes.get(tab.id);
    if (old && old.wc === wc && old.epoch === tab.navEpoch) return;
    clearProbe(tab);
    const state = { wc, epoch: tab.navEpoch, timer: null };
    probes.set(tab.id, state);
    const run = async retry => {
      if (probes.get(tab.id) !== state || !current(tab, wc, state.epoch) || !hooks.visible(tab)) {
        if (probes.get(tab.id) === state) probes.delete(tab.id);
        return;
      }
      let found = false;
      try { found = await bounded(wc.executeJavaScriptInIsolatedWorld(READER_WORLD_ID, [{ code: buildReaderProbe() }]), 1500, false); } catch {}
      if (probes.get(tab.id) !== state || !current(tab, wc, state.epoch)) return;
      tab.readerAvailable = found === true;
      hooks.broadcast(tab);
      if (!found && !retry) state.timer = setTimeout(() => { void run(true); }, 2500);
    };
    void run(false);
  }
  async function toggle(tab) {
    if (!tab) return false;
    if (records.has(tab.id)) { exit(tab); return true; }
    if (attempts.has(tab.id)) return true;
    const wc = source(tab);
    if (!eligible(tab, wc)) return false;
    const epoch = tab.navEpoch;
    const attempt = {};
    attempts.set(tab.id, attempt);
    try {
      const article = await bounded(wc.executeJavaScriptInIsolatedWorld(READER_WORLD_ID, [{ code: buildReaderExtraction() }]), 3000);
      if (attempts.get(tab.id) !== attempt || !current(tab, wc, epoch)) return false;
      if (!validArticle(article) || !hooks.visible(tab)) return false;
      const view = new WebContentsView({ webPreferences: {
        session: getSession(), contextIsolation: true, sandbox: true, nodeIntegration: false,
        preload: path.join(__dirname, 'reader-preload.js'),
      } });
      view.setVisible(false);
      const record = { tab, view, article, sourceUrl: wc.getURL(), epoch, token: randomUUID(), ready: false, closed: false,
        imageActive: 0, imageCount: 0, imageBytes: 0, imageCache: new Map(), imageControllers: new Set() };
      records.set(tab.id, record);
      const contents = view.webContents;
      const owner = () => hooks.owner(tab);
      hooks.wire(tab, contents, owner);
      contents.setWindowOpenHandler(details => { hooks.openLink(tab, details.url, details.disposition === 'background-tab'); return { action: 'deny' }; });
      contents.on('will-navigate', (event, url) => {
        event.preventDefault();
        if (webUrl(url)) hooks.openLink(tab, url, false);
      });
      contents.on('will-redirect', event => event.preventDefault());
      contents.on('will-attach-webview', event => event.preventDefault());
      contents.on('render-process-gone', () => exit(tab));
      contents.on('destroyed', () => { if (records.get(tab.id) === record) exit(tab); });
      contents.on('focus', () => hooks.focused(tab));
      contents.on('found-in-page', (_event, result) => hooks.findResult(tab, result));
      attachContextMenu(contents, {
        t: hooks.t, readerAction: () => ({ active: true, click: () => exit(tab) }),
        canGoBack: () => true, goBack: () => exit(tab),
        canGoForward: () => source(tab)?.navigationHistory.canGoForward() === true,
        goForward: () => { exit(tab); const nav = source(tab)?.navigationHistory; if (nav?.canGoForward()) nav.goForward(); },
        reload: () => { exit(tab); source(tab)?.reload(); },
        openBackgroundTab: url => hooks.openLink(tab, url, true),
        openTab: url => hooks.openLink(tab, url, false),
      });
      const domReady = new Promise(resolve => contents.once('dom-ready', () => resolve(true)));
      void contents.loadURL(`${READER_SCHEME}://${record.token}/`).catch(() => {
        if (records.get(tab.id) === record) exit(tab);
      });
      // Images may take up to their fetch deadline. Present the article when
      // its document is ready rather than waiting for every image to finish.
      const loaded = await bounded(domReady, 5000, false);
      if (!loaded || !current(tab, wc, epoch) || records.get(tab.id) !== record || record.closed) {
        if (records.get(tab.id) === record) exit(tab);
        return false;
      }
      record.ready = true;
      tab.readerActive = true;
      hooks.changed(tab);
      return true;
    } catch {
      if (attempts.get(tab.id) === attempt) exit(tab);
      return false;
    } finally { if (attempts.get(tab.id) === attempt) attempts.delete(tab.id); }
  }
  const trusted = event => {
    if (event.senderFrame !== event.sender.mainFrame) return null;
    const record = [...records.values()].find(item => item.view.webContents === event.sender && !item.closed);
    return record && event.sender.session === readerSession
      && event.sender.getURL().split('#')[0] === `${READER_SCHEME}://${record.token}/`
      && event.senderFrame.url === event.sender.getURL()
      && current(record.tab, source(record.tab), record.epoch) ? record : null;
  };
  hooks.ipcMain.handle('reader:initialize', event => {
    const record = trusted(event);
    return record ? { article: record.article, sourceUrl: record.sourceUrl, appearance: appearance(record.tab) } : null;
  });
  hooks.ipcMain.handle('reader:exit', event => {
    const record = trusted(event);
    if (record) exit(record.tab);
  });
  hooks.ipcMain.handle('reader:appearance', (event, value) => {
    const record = trusted(event);
    if (!record) return null;
    const next = normalizeAppearance(value);
    if (record.tab.private) privateAppearance.set(record.tab.profileId, next);
    else withLocalProfile(record.tab.profileId, () => preferences.update(data => Object.assign(data, next)));
    return next;
  });
  hooks.ipcMain.handle('reader:open-link', (event, url, background) => {
    const record = trusted(event);
    if (record && webUrl(url)) hooks.openLink(record.tab, url, background === true);
  });
  return {
    toggle, exit, probe, invalidate,
    view: tab => records.get(tab?.id)?.ready ? records.get(tab.id).view : tab?.view,
    active: tab => records.get(tab?.id)?.ready === true,
    forget: tab => { clearProbe(tab); exit(tab, { update: false }); },
    forgetPrivate: profileId => privateAppearance.delete(profileId),
  };
}
module.exports = { createReaderMode, bounded };
