const { app, protocol, net, ipcMain, session, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');
const bookmarks = require('./bookmarks');
const { parseNetscapeBookmarks } = require('./bookmark-import');
const { createBrowserDataImportService } = require('./browser-data-import');

const MAX_IMPORT_BYTES = 20 * 1024 * 1024; // 20 MiB
const history = require('./history');
const downloads = require('./downloads');
const settings = require('./settings');
const supporter = require('./supporter');
const patron = require('./patron');
const sync = require('./sync');
const telemetry = require('./telemetry');
const { listDecisions, removeDecision } = require('./permissions');
const { UTILITY_PAGES } = require('./utility-pages');
const { isTrustedPagesEvent } = require('./pages-ipc-trust');

// Internal chrome pages (bookmarks, history, downloads, settings, the new
// tab page) are served over a dedicated `blanc://` scheme instead of
// file:// so they get a real origin, and so ordinary web content can never
// link into arbitrary local files.
const PAGES_DIR = path.join(__dirname, '../renderer/pages');
const KNOWN_PAGES = new Set(['newtab', 'bookmarks', 'history', 'downloads', 'settings', 'error', 'auth', 'shortcuts', 'tab-import']);

/** Must run before app 'ready'. */
function registerPagesScheme() {
  protocol.registerSchemesAsPrivileged([
    { scheme: 'blanc', privileges: { standard: true, secure: true } },
    // The privileged strip + overlay cannot remain on file:// when the
    // GrantFileProtocolExtraPrivileges fuse is disabled. Their handler is a
    // separate, exact allowlist in chrome-protocol.js.
    { scheme: 'blanc-chrome', privileges: { standard: true, secure: true } },
  ]);
}

/** Call after app 'ready'. `hooks.onDataChanged` re-broadcasts tab state
 * (e.g. so the star button updates when a bookmark is deleted from the
 * bookmarks page). */
function setupPages(hooks = {}) {
  // Test runs may point discovery at a throwaway synthetic home, but only in
  // an unpackaged BLANC_TEST process. Production always uses the real OS home.
  const testBrowserHome =
    !app.isPackaged && process.env.BLANC_TEST === '1'
      ? process.env.BLANC_TEST_BROWSER_HOME
      : undefined;
  const browserImport = hooks.browserImport ?? createBrowserDataImportService({
    homeDir: testBrowserHome,
    env: testBrowserHome && process.platform === 'win32'
      ? { ...process.env, LOCALAPPDATA: testBrowserHome }
      : process.env,
  });

  const serveBlanc = (request) => {
    const { host, pathname } = new URL(request.url);
    if (!KNOWN_PAGES.has(host)) return new Response('Not found', { status: 404 });

    // `blanc://bookmarks/` serves the page itself; any deeper path is a
    // shared asset (pages.css, pages.js) resolved inside PAGES_DIR only.
    const name = pathname === '/' ? `${host}.html` : path.basename(pathname);
    if (!/^[\w.-]+$/.test(name)) return new Response('Bad request', { status: 400 });
    return net.fetch(pathToFileURL(path.join(PAGES_DIR, name)).toString());
  };

  // The top-level `protocol` module binds only to the default session, so a
  // tab in any other session gets no `blanc://` handler and loads blank —
  // which is exactly what happened to private new tabs once private browsing
  // moved to its own isolated `session.fromPartition`. Register the handler
  // on every browsing session passed in. (The privileged-scheme registration
  // in registerPagesScheme is process-global and needs no per-session repeat.)
  const sessions = hooks.sessions?.length ? hooks.sessions : [session.defaultSession];
  const expectedSessions = new Set();
  const addSessions = (additional) => {
    for (const ses of additional ?? []) {
      if (!ses || expectedSessions.has(ses)) continue;
      ses.protocol.handle('blanc', serveBlanc);
      expectedSessions.add(ses);
    }
  };
  addSessions(sessions);
  // Every channel declares the exact internal host(s) that need it. The
  // ownership hook then binds that host to the live utility sheet or new-tab
  // WebContents; a URL-bearing renderer alone never gains authority.
  const handle = (channel, hosts, fn) => {
    const expectedHosts = new Set(Array.isArray(hosts) ? hosts : [hosts]);
    ipcMain.handle(channel, (event, ...args) => {
      const trusted = isTrustedPagesEvent(event, {
        hosts: expectedHosts,
        sessions: expectedSessions,
        ownsSender: hooks.pageSurfaces?.owns ?? (() => false),
      });
      if (!trusted) {
        throw new Error(`${channel}: denied for ${event.senderFrame?.url ?? event.sender.getURL()}`);
      }
      const run = hooks.runInPageRuntime ?? ((_event, work) => work());
      return run(event, () => fn(...args));
    });
  };

  handle('pages:surface:close', [...UTILITY_PAGES], () => hooks.utilitySheet.close());
  // Settings opaque pickers arm Escape so main forwards it into the sheet
  // instead of dismissing the sheet (see createUtilitySheet before-input-event).
  handle('pages:surface:escape-arm', [...UTILITY_PAGES], (armed) => {
    hooks.utilitySheet.setEscapeArmed?.(!!armed);
  });

  handle('pages:bookmarks:list', ['bookmarks', 'newtab'], () => bookmarks.listBookmarks());
  handle('pages:bookmarks:remove', 'bookmarks', (id) => {
    bookmarks.removeBookmark(id);
    hooks.onDataChanged?.();
  });
  // The start page reports a stored favicon URL that failed to load, so
  // it's cleared and stops being retried on future loads.
  handle('pages:bookmarks:clear-favicon', ['bookmarks', 'newtab'], (url) => bookmarks.updateFavicon(url, null));

  // newtab: the onboarding import step's "From a bookmarks file (HTML)…" row.
  handle('pages:bookmarks:import', ['bookmarks', 'newtab'], async () => {
    const parent = hooks.getMainWindow?.();
    const picked = await dialog.showOpenDialog(parent ?? undefined, {
      title: 'Import favorites',
      filters: [{ name: 'Bookmarks', extensions: ['html', 'htm'] }],
      properties: ['openFile'],
    });
    if (picked.canceled || !picked.filePaths.length) return { cancelled: true };
    try {
      const stat = await fs.promises.stat(picked.filePaths[0]);
      if (stat.size > MAX_IMPORT_BYTES) return { error: 'too-large' };
      const html = await fs.promises.readFile(picked.filePaths[0], 'utf8');
      const entries = parseNetscapeBookmarks(html);
      if (!entries.length) return { error: 'empty' };
      const { added, skipped } = bookmarks.importBookmarks(entries);
      hooks.onDataChanged?.();
      return { added, skipped };
    } catch {
      return { error: 'unreadable' };
    }
  });
  handle('pages:bookmarks:browser-sources', ['bookmarks', 'newtab'], () => browserImport.listSources());
  handle('pages:bookmarks:import-browser', ['bookmarks', 'newtab'], async (id) => {
    const read = await browserImport.readSource(String(id ?? ''));
    if (read.error) return { error: read.error };
    const { added, skipped } = bookmarks.importBookmarks(read.entries);
    hooks.onDataChanged?.();
    return { added, skipped, source: read.source };
  });
  handle('pages:bookmarks:set-folder', 'bookmarks', (id, folder) => {
    bookmarks.setBookmarkFolder(id, folder);
    hooks.onDataChanged?.();
  });
  handle('pages:bookmarks:rename-folder', 'bookmarks', (oldName, newName) => {
    bookmarks.renameFolder(oldName, newName);
    hooks.onDataChanged?.();
  });
  handle('pages:bookmarks:remove-folder', 'bookmarks', (name) => {
    bookmarks.removeFolder(name);
    hooks.onDataChanged?.();
  });

  handle('pages:history:list', 'history', (opts) => history.listHistory(opts ?? {}));
  handle('pages:history:remove', 'history', (url, visitedAt) => history.removeVisit(url, visitedAt));
  handle('pages:history:clear', 'history', () => {
    history.clearHistory();
    hooks.onHistoryCleared?.();
    // session.json's meta column holds the same titles; clearHistory() only
    // owns history.json, so the main-process hook drops the persisted copy.
  });

  handle('pages:downloads:list', 'downloads', () => downloads.listDownloads());
  handle('pages:downloads:cancel', 'downloads', (id) => downloads.cancelDownload(id));
  handle('pages:downloads:open', 'downloads', (id) => downloads.openDownload(id));
  handle('pages:downloads:show', 'downloads', (id) => downloads.showDownloadInFolder(id));
  handle('pages:downloads:clear-finished', 'downloads', () => downloads.clearFinishedDownloads());

  // The renderer never sees the license key or activation id — only the
  // derived booleans. Internal pages are privileged, but least-privilege
  // anyway (same reasoning as the preload's protocol re-check).
  const clientSettings = () => {
    // Strip both entitlement records out of `rest` (the renderer sees only
    // derived booleans). `patron:` is aliased to `_patron` so it does not
    // shadow the module-level `patron` (the network module) inside this scope.
    const { supporter: record, patron: _patron, _syncMeta, ...rest } = settings.getSettings();
    return {
      ...rest,
      patronActive: settings.isPatronActive(),
      supporterActive: settings.isPatronActive(), // temporary alias until Phase 4 renames renderer refs
      supporterActivatedAt: record?.activatedAt ?? null,
    };
  };

  handle('pages:settings:get', 'settings', () => ({
    settings: clientSettings(),
    searchEngines: Object.fromEntries(
      Object.entries(settings.SEARCH_ENGINES).map(([key, { label }]) => [key, label])
    ),
    appIcons: settings.APP_ICON_LABELS,
    supporterIcons: settings.SUPPORTER_ICON_LABELS,
  }));
  handle('pages:settings:set', 'settings', (partial) => {
    settings.setSettings(partial ?? {});
    // Echo the persisted non-secret projection so the renderer can reflect the
    // actual stored state (e.g. a rejected strict-custom DNS transition). Never
    // raw getSettings() — that includes the supporter key.
    return clientSettings();
  });
  handle('pages:settings:supporter-activate', 'settings', (key) => patron.activate(key));

  // Local-profile identity and destructive confirmation stay in main. The
  // renderer receives only opaque ids, display names, and result messages.
  handle('pages:profiles:list', 'settings', () => hooks.profiles?.list() ?? {
    currentId: 'default',
    profiles: [{ id: 'default', name: 'Personal', createdAt: 0 }],
  });
  handle('pages:profiles:create', 'settings', (name) =>
    hooks.profiles?.create(String(name ?? '')) ?? null);
  handle('pages:profiles:open', 'settings', (id) =>
    hooks.profiles?.open(String(id ?? '')) ?? { ok: false });
  handle('pages:profiles:rename', 'settings', (id, name) =>
    hooks.profiles?.rename(String(id ?? ''), String(name ?? '')) ?? { ok: false });
  handle('pages:profiles:remove', 'settings', (id, confirmation) =>
    hooks.profiles?.remove(String(id ?? ''), String(confirmation ?? '')) ?? { ok: false });

  // Sync: the passphrase arrives once on enable and never leaves main; every
  // response is status-only (enabled/handle/lastSyncedAt/lastError) — no keys.
  handle('pages:settings:sync-get', 'settings', () => sync.status());
  handle('pages:settings:sync-enable', 'settings', (payload) => sync.enable(payload ?? {}));
  handle('pages:settings:sync-disable', 'settings', (opts) => sync.disable(opts ?? {}));
  handle('pages:settings:sync-now', 'settings', () => sync.syncNow().then(() => sync.status()));
  // Per-device consent for publishing this device's open tabs (spec §3) —
  // lives in sync.json, never settings.json, so it cannot cross sync.
  handle('pages:settings:sync-tabs-set', 'settings', (on) => sync.setSyncTabs(!!on));

  handle('pages:app-version', 'newtab', () => app.getVersion());

  // Help → Keyboard Shortcuts: the list is introspected from the live
  // application menu in main.js, reached through a hook like startPage.
  handle('pages:shortcuts:list', 'shortcuts', () => hooks.shortcuts?.list() ?? []);

  // Start page (the ledger new tab): tab groups + the weekly blocked
  // counter live in main.js, reached through hooks rather than a module.
  handle('pages:start:data', 'newtab', () => ({
    groups: hooks.startPage?.groups() ?? [],
    blockedThisWeek: hooks.startPage?.blockedThisWeek() ?? 0,
    // Raw per-day counts drive the tally caption ("busiest day friday");
    // the bar heights are normalized in main so the rule stays unit-tested.
    blockedByDay: hooks.startPage?.blockedByDay?.() ?? [0, 0, 0, 0, 0, 0, 0],
    blockedBarHeights: hooks.startPage?.blockedBarHeights?.() ?? [0, 0, 0, 0, 0, 0, 0],
    remoteDevices: hooks.startPage?.remoteDevices() ?? [],
    // Least-privilege projection for the onboarding dialog: only the two
    // settings it can change, so a replay shows what is actually saved.
    onboarding: hooks.startPage?.onboardingState?.() ?? null,
    // patronActive (for the start-page Patron callout) comes from the spread
    // below: startPageStatus() supplies it, and the same function feeds the
    // later pages:start:status push, so initial load and live updates agree.
    ...hooks.startPage?.status?.(),
  }));
  // The footer layout switcher. The value is enum-validated by setSettings,
  // so an unknown name is a no-op rather than an error.
  handle(
    'pages:start:set-layout',
    'newtab',
    (name) => hooks.startPage?.setLayout?.(String(name ?? '')),
  );
  handle(
    'pages:start:focus-group',
    'newtab',
    (id) => hooks.startPage?.focusGroup(String(id)),
  );
  // Type-to-open from the start page. Main re-validates the character in
  // openIslandTyping — the renderer's own gate is not trusted alone.
  //
  // Deliberately NOT String(char ?? '') like the neighbouring handlers: those
  // coerce because their validators take strings by contract, but coercing
  // here would turn a numeric 7 into a valid '7' and make the validator's own
  // typeof check dead code. The payload is passed through untouched so the
  // one validator sees what the renderer actually sent.
  handle(
    'pages:start:open-island',
    'newtab',
    (char) => hooks.startPage?.openIsland?.(char),
  );
  handle(
    'pages:start:startup-retry',
    'newtab',
    () => hooks.startPage?.retryAdblock?.(),
  );
  handle(
    'pages:start:startup-continue',
    'newtab',
    () => hooks.startPage?.continueWithoutAdblock?.(),
  );
  handle(
    'pages:start:privacy-complete',
    'newtab',
    (choices) => hooks.startPage?.completePrivacy?.(choices ?? {}),
  );

  // Default-browser state lives in LaunchServices/the OS, not settings.json.
  // canSet: a dev run must never register the bare Electron binary as a
  // browser, and Linux has no default-protocol-client API in Electron.
  const defaultBrowserStatus = () => ({
    isDefault: app.isDefaultProtocolClient('http'),
    canSet: app.isPackaged && process.platform !== 'linux',
  });
  // newtab joined the allowlist for the onboarding dialog's first step; the
  // canSet guard is identical for both senders.
  handle('pages:default-browser:get', ['settings', 'newtab'], () => defaultBrowserStatus());
  handle('pages:default-browser:set', ['settings', 'newtab'], () => {
    if (defaultBrowserStatus().canSet) {
      app.setAsDefaultProtocolClient('http');
      // macOS raises its "change your default web browser?" prompt PER CALL,
      // and answering it assigns the browser role — http and https together —
      // so a second call only stacks a second identical dialog. Windows
      // registers each scheme silently, so it keeps the explicit https call.
      if (process.platform !== 'darwin') app.setAsDefaultProtocolClient('https');
    }
    return defaultBrowserStatus();
  });

  // Onboarding may change exactly these two settings, live — never the whole
  // settings surface. Values still pass setSettings' own validation.
  handle('pages:start:onboarding-set', 'newtab', (partial) => {
    const clean = {};
    if (partial && typeof partial.adblockEnabled === 'boolean') clean.adblockEnabled = partial.adblockEnabled;
    if (partial && typeof partial.theme === 'string') clean.theme = partial.theme;
    if (Object.keys(clean).length) hooks.startPage?.applySettings?.(clean);
  });

  // Replays the first-run walkthrough. Main creates and activates the tour
  // tab — the sheet's own navigation is default-deny for blanc:// URLs, so a
  // renderer-side location.href could never open it.
  handle('pages:settings:welcome-tour', 'settings', () => hooks.startPage?.openWelcomeTour?.());

  handle('pages:permissions:list', 'settings', () => listDecisions());
  handle('pages:permissions:remove', 'settings', (key) => removeDecision(String(key)));

  // Privacy reset for the usage ping's per-install id (see telemetry.js) —
  // from the next ping on, this install counts as brand new.
  handle('pages:telemetry:reset-install-id', 'settings', () => telemetry.resetInstallId());

  // The settings page promises "cookies, cache & site data" — clear both.
  handle('pages:clear-browsing-data', 'settings', () => {
    const browsingSessions = hooks.sessionsForCurrentRuntime?.()
      ?? hooks.sessions
      ?? [session.defaultSession];
    return Promise.all(browsingSessions.flatMap((browsingSession) => [
      browsingSession.clearStorageData(),
      browsingSession.clearCache(),
    ]));
  });

  return { addSessions };
}

module.exports = { registerPagesScheme, setupPages };
