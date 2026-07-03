const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');
const { ElectronChromeExtensions } = require('electron-chrome-extensions');
const {
  installChromeWebStore,
  installExtension,
  uninstallExtension,
} = require('electron-chrome-web-store');

// Electron's extension runtime doesn't ship the chrome.webRequest binding
// modules; an extension whose manifest requests them can crash-loop its
// service worker on a C++-level NOTREACHED (1Password does). Stripping the
// permission from the installed manifest prevents the bindings system from
// ever trying to load the missing module — the extension just sees the API
// as absent, same as it would in Safari.
const UNSUPPORTED_PERMISSIONS = new Set(['webRequest', 'webRequestAuthProvider']);
const extensionsDir = () => path.join(app.getPath('userData'), 'Extensions');

// With the permission stripped, chrome.webRequest is simply absent — but
// some extensions call it unguarded (1Password's worker dies on
// `chrome.webRequest.onAuthRequired.addListener`). We install a no-op shim
// into the extension's own service worker so listeners just never fire, as
// if no requests matched. (A session service-worker preload can't do this —
// it runs isolated from the extension's globals.)
//
// For `"type": "module"` workers the shim must be a module imported on the
// FIRST line: static imports are hoisted, so plain prepended code would run
// only after the extension's own import chunks — 1Password's polyfill
// snapshots chrome.webRequest during those imports.
const SHIM_MARKER = '/* bowser: chrome.webRequest shim */';
const SHIM_FILENAME = '__bowser-webrequest-shim.js';
const WEBREQUEST_SHIM = `(() => {
  if (typeof chrome === 'undefined' || chrome.webRequest) return;
  const makeEvent = () => ({
    addListener() {},
    removeListener() {},
    hasListener() { return false; },
    hasListeners() { return false; },
  });
  chrome.webRequest = {
    onBeforeRequest: makeEvent(),
    onBeforeSendHeaders: makeEvent(),
    onSendHeaders: makeEvent(),
    onHeadersReceived: makeEvent(),
    onAuthRequired: makeEvent(),
    onResponseStarted: makeEvent(),
    onBeforeRedirect: makeEvent(),
    onCompleted: makeEvent(),
    onErrorOccurred: makeEvent(),
    onActionIgnored: makeEvent(),
    handlerBehaviorChanged(callback) { if (callback) callback(); },
    MAX_HANDLER_BEHAVIOR_CHANGED_CALLS_PER_10_MINUTES: 20,
  };

  // Extension polyfills (1Password's included) build their API wrappers
  // from the manifest's permission list. Re-advertise the permissions we
  // stripped so the wrappers get created; only the C++ bindings must not
  // see them.
  const getManifest = chrome.runtime.getManifest.bind(chrome.runtime);
  chrome.runtime.getManifest = () => {
    const manifest = getManifest();
    manifest.permissions = [
      ...new Set([...(manifest.permissions ?? []), 'webRequest', 'webRequestAuthProvider']),
    ];
    return manifest;
  };
})();
`;

const WEBREQUEST_CALLSITE = /\b(browser|chrome)\.webRequest\.(on\w+)\.(addListener|removeListener|hasListener)\(/g;

/** Rewrites `browser.webRequest.onX.addListener(` style call sites to
 * optional chaining in every script of an extension package. */
function guardWebRequestCallSites(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      guardWebRequestCallSites(full);
    } else if (entry.name.endsWith('.js')) {
      const source = fs.readFileSync(full, 'utf8');
      const patched = source.replace(WEBREQUEST_CALLSITE, '$1.webRequest?.$2?.$3?.(');
      if (patched !== source) fs.writeFileSync(full, patched);
    }
  }
}

/** Returns the ids of extensions whose manifests were modified. */
function sanitizeManifests() {
  const changed = new Set();
  let entries = [];
  try {
    entries = fs.readdirSync(extensionsDir());
  } catch {
    return changed; // no extensions installed yet
  }
  for (const id of entries) {
    let versions = [];
    try {
      versions = fs.readdirSync(path.join(extensionsDir(), id));
    } catch {
      continue;
    }
    for (const version of versions) {
      const versionDir = path.join(extensionsDir(), id, version);
      try {
        const manifestPath = path.join(versionDir, 'manifest.json');
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

        const perms = manifest.permissions ?? [];
        const filtered = perms.filter((p) => !UNSUPPORTED_PERMISSIONS.has(p));
        if (filtered.length !== perms.length) {
          manifest.permissions = filtered;
          fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 1));
          changed.add(id);
        }

        const workerRel = manifest.background?.service_worker;
        if (workerRel) {
          const workerPath = path.join(versionDir, workerRel);
          const source = fs.readFileSync(workerPath, 'utf8');
          if (!source.startsWith(SHIM_MARKER)) {
            // Some bundles reach webRequest through their own polyfill
            // object, which the chrome.webRequest shim can't cover —
            // rewrite those call sites to optional chaining so they no-op
            // instead of throwing. Applies to every script in the package.
            guardWebRequestCallSites(versionDir);

            const patched = fs.readFileSync(workerPath, 'utf8');
            if (manifest.background.type === 'module') {
              fs.writeFileSync(path.join(path.dirname(workerPath), SHIM_FILENAME), WEBREQUEST_SHIM);
              fs.writeFileSync(workerPath, `${SHIM_MARKER} import "./${SHIM_FILENAME}";\n${patched}`);
            } else {
              fs.writeFileSync(workerPath, `${SHIM_MARKER}\n${WEBREQUEST_SHIM}${patched}`);
            }
            changed.add(id);
          }
        }
      } catch {
        // not a readable extension dir — skip
      }
    }
  }
  return changed;
}

// Extensions preinstalled on first run. Both are MV3 password managers that
// run in "standalone" mode here: their desktop-app integration (biometric
// unlock) uses native messaging with a code-signature allowlist of approved
// browsers, which a custom shell can't join — you sign in inside the
// extension instead.
const PREINSTALLED = [
  { id: 'aeblfdkhhhdcdjpifhhbdiojplfjncoa', name: '1Password' },
  { id: 'fdjamakpfbbddfjaooikfcpapjohcfmg', name: 'Dashlane' },
];

/** @type {ElectronChromeExtensions | null} */
let extensions = null;

/**
 * Creates the chrome.* API host. Synchronous so it can run before the
 * window/tabs exist; extension installs happen later in initWebStore().
 *
 * The delegate maps extension-initiated actions (chrome.tabs.create etc.)
 * onto the app's own tab model.
 */
function createExtensionHost(session, delegate) {
  extensions = new ElectronChromeExtensions({
    license: 'GPL-3.0',
    session,
    createTab: async (details) => delegate.createTab(details),
    selectTab: (wc) => delegate.selectTab(wc),
    removeTab: (wc) => delegate.removeTab(wc),
    createWindow: async (details) => {
      // Extension-created windows (sign-in flows, etc.) get a plain
      // locked-down window rather than a managed tab.
      const popup = new BrowserWindow({
        width: details.width ?? 480,
        height: details.height ?? 640,
        webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false },
      });
      const url = Array.isArray(details.url) ? details.url[0] : details.url;
      if (url) popup.loadURL(url);
      return popup;
    },
  });

  // Serves extension icons to the <browser-action-list> element.
  ElectronChromeExtensions.handleCRXProtocol(session);

  return extensions;
}

/**
 * Enables "Add to Chrome" on chromewebstore.google.com, loads previously
 * installed extensions from disk, auto-updates them, and installs the
 * preconfigured ones on first run. Network-bound — call without awaiting
 * so first-run installs don't block the window.
 */
async function initWebStore(session) {
  // Clean up manifests from previous runs/updates before anything loads.
  sanitizeManifests();

  await installChromeWebStore({ session });

  const loaded = new Set(session.extensions.getAllExtensions().map((e) => e.id));
  for (const { id, name } of PREINSTALLED) {
    if (loaded.has(id)) continue;
    try {
      await installExtension(id, { session });
      console.log(`[extensions] installed ${name}`);
    } catch (err) {
      console.warn(`[extensions] could not install ${name}:`, err.message);
    }
  }

  // Fresh installs (and in-session auto-updates) arrive unsanitized; patch
  // them and reload so the fix applies without a restart.
  for (const id of sanitizeManifests()) {
    const ext = session.extensions.getExtension(id);
    if (!ext) continue;
    try {
      session.extensions.removeExtension(id);
      await session.extensions.loadExtension(ext.path);
      console.log(`[extensions] reloaded ${ext.name} with sanitized manifest`);
    } catch (err) {
      console.warn(`[extensions] could not reload ${id}:`, err.message);
    }
  }
}

function listExtensions(session) {
  return session.extensions.getAllExtensions().map((e) => ({
    id: e.id,
    name: e.name,
    version: e.version,
  }));
}

async function removeExtension(session, id) {
  await uninstallExtension(id, { session });
}

module.exports = { createExtensionHost, initWebStore, listExtensions, removeExtension };
