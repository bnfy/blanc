# Bowser → Blanc Rebrand Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename the shipped product from "Bowser" to "Blanc" across the app, its infra, and its docs, without losing existing users' history/favorites/settings or breaking their auto-update chain.

**Architecture:** This is a name-and-mascot swap, not a redesign — `build.appId` in `package.json` stays `me.bnfy.bowser` (macOS Gatekeeper/notarization/update-chain identity is invisible to users and must not move), while `name`/`productName` change to `blanc`/`Blanc`. A one-time startup migration copies the old `~/Library/Application Support/Bowser` userData directory forward to the new `Blanc`-named one. The `bowser://` internal URL scheme becomes `blanc://`. The pixel-doberman mascot is deleted, not renamed.

**Tech Stack:** Electron 43, electron-builder, electron-updater, vanilla JS/HTML/CSS (no framework, no bundler), Cloudflare Workers (`wrangler`) for the ping collector, GitHub Releases for distribution.

## Global Constraints

- No test suite or linter exists in this repo (confirmed in `CLAUDE.md`) — every task's verification step is a targeted `grep` (expect zero matches for the old string in the touched scope) plus, where noted, a manual `npm start` smoke check. Do not introduce a test framework as part of this rename.
- `build.appId` in `package.json` MUST stay `me.bnfy.bowser` — do not rename it. This is the one thing in this plan that deliberately does *not* say "Blanc" anywhere.
- The `window.bowserPages` / `window.bowserAuth` contextBridge global names, and the `pages:*` IPC channel prefix, stay as-is. They're internal-only identifiers (same precedent as `CLAUDE.md`'s "Favorites" vs. `bookmarks` internals) and were not called out for renaming in the approved spec (`docs/superpowers/specs/2026-07-05-blanc-rebrand-design.md`) — only the `bowser://` scheme string itself changes, everywhere it appears as a literal scheme/URL.
- Every commit is scoped to one task; use `git add <specific files>`, never `git add -A`.
- Known limitation, not to be engineered around here: macOS auto-update (Squirrel.Mac) replaces the running app bundle's *contents* in place but does not rename the `.app` file on disk — existing users who auto-update will have a Finder item still named `Bowser.app` that now runs Blanc (correct `CFBundleDisplayName`/Dock label, cosmetically stale filename) until they manually rename it or do a fresh install. This is inherent to keeping `appId` stable for update continuity; do not try to "fix" it in this plan.

---

### Task 1: `package.json` identity fields

**Files:**
- Modify: `package.json:2-3,31`

**Interfaces:**
- Produces: `name: "blanc"`, `productName: "Blanc"`, `build.publish.repo: "blanc"` — every later task that reads these values (release script, README) must match.

- [ ] **Step 1: Edit the three fields**

```diff
-  "name": "bowser",
-  "productName": "Bowser",
+  "name": "blanc",
+  "productName": "Blanc",
```

and further down:

```diff
     "publish": {
       "provider": "github",
       "owner": "bnfy",
-      "repo": "bowser",
+      "repo": "blanc",
       "releaseType": "release"
     },
```

Leave `"appId": "me.bnfy.bowser"` untouched — this is deliberate (see Global Constraints).

- [ ] **Step 2: Regenerate the lockfile's name field**

Run: `npm install`
Expected: `package-lock.json`'s top-level `"name"` field updates to `"blanc"` (version/deps unchanged). If it doesn't change on its own, edit it by hand to match.

- [ ] **Step 3: Verify**

Run: `node -p "require('./package.json').productName + ' / ' + require('./package.json').build.appId"`
Expected: `Blanc / me.bnfy.bowser`

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "Rename package identity to Blanc, keep appId stable for update continuity"
```

---

### Task 2: userData migration + scheme rename in `src/main/main.js`

**Files:**
- Modify: `src/main/main.js:19,22,66,102,127,143,387,637,735,740,751,768,809-810,820-822,955,1135,1238-1239,1262-1263`

**Interfaces:**
- Consumes: `app.getPath`, `app.isPackaged` (Electron built-ins).
- Produces: nothing new consumed elsewhere — this task only changes an internal constant's value (`bowser://` → `blanc://`) and adds one self-contained startup block.

- [ ] **Step 1: Add the one-time userData migration**

Insert this new block between the existing dev-suffix block and the single-instance-lock block (i.e. right after line 31's closing `}`, before line 33's comment):

```js
// One-time migration for existing installs: userData's location is
// derived from productName, so the Bowser -> Blanc rename would otherwise
// start every existing user on an empty profile. Copy the old directory
// forward exactly once, before anything (JsonStores, adblock cache,
// single-instance lock) touches the new one.
if (app.isPackaged) {
  const oldUserDataDir = path.join(app.getPath('appData'), 'Bowser');
  const newUserDataDir = app.getPath('userData');
  if (!fs.existsSync(newUserDataDir) && fs.existsSync(oldUserDataDir)) {
    fs.cpSync(oldUserDataDir, newUserDataDir, { recursive: true });
  }
}
```

`path` and `fs` are already imported at the top of the file (lines 2-3) — no new requires needed.

- [ ] **Step 2: Rename the scheme constants**

```diff
-const NEW_TAB_URL = 'bowser://newtab/';
+const NEW_TAB_URL = 'blanc://newtab/';
 const newTabUrl = () => settings.getSettings().homePage || NEW_TAB_URL;
 // The query flag tells the newtab page to show private copy + theme.
-const PRIVATE_NEW_TAB_URL = 'bowser://newtab/?private=1';
+const PRIVATE_NEW_TAB_URL = 'blanc://newtab/?private=1';
```

- [ ] **Step 3: Rename every remaining `bowser://`/`bowser:` literal and comment**

Line 143 — the user-agent strip regex must match the new `name` field from Task 1 (the token Electron/Chromium append to the UA string comes from `package.json`'s `name`, which is now `blanc`):

```diff
 app.userAgentFallback = app.userAgentFallback
-  .replace(/\sbowser\/[\d.]+/i, '')
+  .replace(/\sblanc\/[\d.]+/i, '')
   .replace(/\sElectron\/[\d.]+/, '');
```

Line 387:
```diff
-        if (url?.startsWith('bowser://error')) {
+        if (url?.startsWith('blanc://error')) {
```

Line 637 comment:
```diff
-  // Exposes a data API to our own bowser:// pages ONLY — see the
+  // Exposes a data API to our own blanc:// pages ONLY — see the
```

Lines 739-741:
```diff
-  // Web content must never navigate a tab into the privileged bowser://
+  // Web content must never navigate a tab into the privileged blanc://
   // scheme (Chrome blocks web → chrome:// identically). Main-initiated
   // loads (address bar, commands, error pages) go through loadURL, which
   // doesn't fire will-navigate, so only page-initiated hops are caught.
   wc.on('will-navigate', (event, targetUrl) => {
-    if (/^bowser:/i.test(targetUrl) && !wc.getURL().startsWith('bowser://')) {
+    if (/^blanc:/i.test(targetUrl) && !wc.getURL().startsWith('blanc://')) {
```

Line 751 and line 768 (both identical):
```diff
-    wc.loadURL(`bowser://error/?${q}`).catch(() => {});
+    wc.loadURL(`blanc://error/?${q}`).catch(() => {});
```

Lines 809-810 and 819-822:
```diff
-  // matters on bowser:// pages, and the guards below keep web content
-  // from opening or navigating into bowser:// at all.
+  // matters on blanc:// pages, and the guards below keep web content
+  // from opening or navigating into blanc:// at all.
```
```diff
       // Web content must not mint privileged internal pages (Chrome blocks
-      // web → chrome:// the same way). Only bowser:// pages themselves may
-      // open bowser:// children.
-      if (/^bowser:/i.test(targetUrl) && !targetWc.getURL().startsWith('bowser://')) {
+      // web → chrome:// the same way). Only blanc:// pages themselves may
+      // open blanc:// children.
+      if (/^blanc:/i.test(targetUrl) && !targetWc.getURL().startsWith('blanc://')) {
```

Line 955:
```diff
-  if (tab.url && !tab.private && !tab.url.startsWith('bowser://newtab')) {
+  if (tab.url && !tab.private && !tab.url.startsWith('blanc://newtab')) {
```

Line 1135:
```diff
-      openInternalPage(`bowser://${name}/`);
+      openInternalPage(`blanc://${name}/`);
```

Lines 1238-1239, 1262-1263:
```diff
-        { label: 'Downloads', accelerator: 'CmdOrCtrl+Shift+J', click: () => openInternalPage('bowser://downloads/') },
-        { label: 'Settings', accelerator: 'CmdOrCtrl+,', click: () => openInternalPage('bowser://settings/') },
+        { label: 'Downloads', accelerator: 'CmdOrCtrl+Shift+J', click: () => openInternalPage('blanc://downloads/') },
+        { label: 'Settings', accelerator: 'CmdOrCtrl+,', click: () => openInternalPage('blanc://settings/') },
```
```diff
-        { label: 'Show Favorites', accelerator: isMac ? 'Cmd+Alt+B' : 'Ctrl+Shift+O', click: () => openInternalPage('bowser://bookmarks/') },
-        { label: 'Show History', accelerator: 'CmdOrCtrl+Y', click: () => openInternalPage('bowser://history/') },
+        { label: 'Show Favorites', accelerator: isMac ? 'Cmd+Alt+B' : 'Ctrl+Shift+O', click: () => openInternalPage('blanc://bookmarks/') },
+        { label: 'Show History', accelerator: 'CmdOrCtrl+Y', click: () => openInternalPage('blanc://history/') },
```

Also update the three comments that just narrate behavior (lines 66, 102, 127) — cosmetic, no functional string:
```diff
-// URLs handed over by the OS when Bowser is the default browser. macOS
+// URLs handed over by the OS when Blanc is the default browser. macOS
```
```diff
-// associations and `bowser file.html` pass a bare path on the command
+// associations and `blanc file.html` pass a bare path on the command
```
```diff
-// Double-clicked local files (Bowser is declared as an HTML viewer via
+// Double-clicked local files (Blanc is declared as an HTML viewer via
```

- [ ] **Step 2: Verify no stray literal scheme references remain**

Run: `grep -n "bowser://" src/main/main.js`
Expected: no output.

Run: `grep -in "bowser" src/main/main.js`
Expected: no output (every occurrence — code and comments — was one of the ones above).

- [ ] **Step 3: Commit**

```bash
git add src/main/main.js
git commit -m "Rename bowser:// scheme to blanc:// and add userData migration"
```

---

### Task 3: `src/main/pages.js` scheme registration + IPC guard

**Files:**
- Modify: `src/main/pages.js:11,20,28,32,40,45-46`

- [ ] **Step 1: Rename the scheme and its guards**

```diff
-// Internal chrome pages (bookmarks, history, downloads, settings, the new
-// tab page) are served over a dedicated `bowser://` scheme instead of
+// Internal chrome pages (bookmarks, history, downloads, settings, the new
+// tab page) are served over a dedicated `blanc://` scheme instead of
 // file:// so they get a real origin, and so ordinary web content can never
 // link into arbitrary local files.
```
```diff
   protocol.registerSchemesAsPrivileged([
-    { scheme: 'bowser', privileges: { standard: true, secure: true } },
+    { scheme: 'blanc', privileges: { standard: true, secure: true } },
   ]);
```
```diff
-  protocol.handle('bowser', (request) => {
+  protocol.handle('blanc', (request) => {
     const { host, pathname } = new URL(request.url);
     if (!KNOWN_PAGES.has(host)) return new Response('Not found', { status: 404 });

-    // `bowser://bookmarks/` serves the page itself; any deeper path is a
+    // `blanc://bookmarks/` serves the page itself; any deeper path is a
     // shared asset (pages.css, pages.js) resolved inside PAGES_DIR only.
```
```diff
   // Every handler below double-checks the sender really is an internal
-  // page — the preload only exposes the API on bowser:// documents, but
+  // page — the preload only exposes the API on blanc:// documents, but
   // IPC channels are reachable by name, so the main process must not
   // trust that alone.
   const handle = (channel, fn) => {
     ipcMain.handle(channel, (event, ...args) => {
-      if (!event.sender.getURL().startsWith('bowser://')) {
+      if (!event.sender.getURL().startsWith('blanc://')) {
```

- [ ] **Step 2: Verify**

Run: `grep -in "bowser" src/main/pages.js`
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add src/main/pages.js
git commit -m "Register blanc:// scheme instead of bowser://"
```

---

### Task 4: Preload/auth scheme checks — `tab-preload.js`, `auth-preload.js`, `auth-dialog.js`

**Files:**
- Modify: `src/main/tab-preload.js:3,8`
- Modify: `src/main/auth-preload.js:2,5`
- Modify: `src/main/auth-dialog.js:43,53`

**Interfaces:**
- Produces: nothing new — `window.bowserPages`/`window.bowserAuth` global names are unchanged (see Global Constraints), only the `location.protocol`/URL checks that gate them move to `blanc:`.

- [ ] **Step 1: `src/main/tab-preload.js`**

```diff
 // Preload attached to every tab WebContentsView. Web content gets NOTHING
 // from it: the bridge is only exposed when the document is one of our own
-// bowser:// internal pages (the check re-runs on every navigation, so a
+// blanc:// internal pages (the check re-runs on every navigation, so a
 // tab that leaves an internal page loses the API). The main process
 // additionally verifies the sender URL on every pages:* IPC call.
 const { contextBridge, ipcRenderer } = require('electron');

-if (window.location.protocol === 'bowser:') {
+if (window.location.protocol === 'blanc:') {
   contextBridge.exposeInMainWorld('bowserPages', {
```

(Note: `bowserPages` on this last line stays exactly as-is — only the protocol string above it changes.)

- [ ] **Step 2: `src/main/auth-preload.js`**

```diff
 // Preload for the basic-auth dialog window only. Exposed solely on the
-// bowser://auth page; the main-process listener re-checks the sender URL.
+// blanc://auth page; the main-process listener re-checks the sender URL.
 const { contextBridge, ipcRenderer } = require('electron');

-if (window.location.protocol === 'bowser:' && window.location.host === 'auth') {
+if (window.location.protocol === 'blanc:' && window.location.host === 'auth') {
   contextBridge.exposeInMainWorld('bowserAuth', {
```

(Again, `bowserAuth` stays as-is.)

- [ ] **Step 3: `src/main/auth-dialog.js`**

```diff
       ipcMain.once(`auth:submit:${id}`, (event, creds) => {
-        if (!event.sender.getURL().startsWith('bowser://auth')) return;
+        if (!event.sender.getURL().startsWith('blanc://auth')) return;
```
```diff
       const q = new URLSearchParams({ id: String(id), host: authInfo.host ?? '', realm: authInfo.realm ?? '' });
-      dialogWin.loadURL(`bowser://auth/?${q}`);
+      dialogWin.loadURL(`blanc://auth/?${q}`);
```

- [ ] **Step 4: Verify**

Run: `grep -n "bowser:" src/main/tab-preload.js src/main/auth-preload.js src/main/auth-dialog.js`
Expected: no output (the surviving `bowserPages`/`bowserAuth` identifiers don't contain a `bowser:` colon-suffixed match, so this grep correctly targets only scheme literals).

- [ ] **Step 5: Commit**

```bash
git add src/main/tab-preload.js src/main/auth-preload.js src/main/auth-dialog.js
git commit -m "Update preload/auth scheme checks to blanc://"
```

---

### Task 5: `settings.js` comment, `telemetry.js` endpoint, `updater.js` dialog text

**Files:**
- Modify: `src/main/settings.js:18`
- Modify: `src/main/telemetry.js:5`
- Modify: `src/main/updater.js:60`

- [ ] **Step 1: `src/main/settings.js`**

```diff
-  // Empty string = the built-in bowser://newtab page.
+  // Empty string = the built-in blanc://newtab page.
   homePage: '',
```

- [ ] **Step 2: `src/main/telemetry.js`**

```diff
 // The collector Worker in cloudflare/ping-worker — accepts a JSON POST,
 // returns 204.
-const PING_ENDPOINT = 'https://bowser-ping.bnfy-441.workers.dev/ping';
+const PING_ENDPOINT = 'https://blanc-ping.bnfy-441.workers.dev/ping';
```

This must land in the same release as Task 8's Worker rename/redeploy below — an app build published before the Worker is redeployed under the new name would ping a hostname that doesn't exist yet.

- [ ] **Step 3: `src/main/updater.js`**

```diff
       showDialog({
         type: 'info',
         message: 'You’re up to date',
-        detail: `Bowser ${app.getVersion()} is the latest version.`,
+        detail: `Blanc ${app.getVersion()} is the latest version.`,
       });
```

- [ ] **Step 4: Verify**

Run: `grep -in "bowser" src/main/settings.js src/main/telemetry.js src/main/updater.js`
Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add src/main/settings.js src/main/telemetry.js src/main/updater.js
git commit -m "Rename ping endpoint and update copy for Blanc"
```

---

### Task 6: Chrome renderer — `index.html`, `overlay.html`, `renderer.js`, `overlay.js`

**Files:**
- Modify: `src/renderer/index.html:5-6`
- Modify: `src/renderer/overlay.html:5-6`
- Modify: `src/renderer/renderer.js:59,65,68,75,94,96`
- Modify: `src/renderer/overlay.js:94,97,108,123,126,139,141,192`

- [ ] **Step 1: `src/renderer/index.html`**

```diff
-  <meta http-equiv="Content-Security-Policy" content="default-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; script-src 'self'; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https: http: bowser:;" />
-  <title>Bowser</title>
+  <meta http-equiv="Content-Security-Policy" content="default-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; script-src 'self'; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https: http: blanc:;" />
+  <title>Blanc</title>
```

- [ ] **Step 2: `src/renderer/overlay.html`**

```diff
-  <meta http-equiv="Content-Security-Policy" content="default-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; script-src 'self'; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https: http: bowser:;" />
-  <title>Bowser Overlay</title>
+  <meta http-equiv="Content-Security-Policy" content="default-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; script-src 'self'; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https: http: blanc:;" />
+  <title>Blanc Overlay</title>
```

- [ ] **Step 3: `src/renderer/renderer.js`**

```diff
   function shieldTooltip(blocked) {
-    return `Bowser blocked ${blocked} ${blocked === 1 ? 'ad or tracker' : 'ads & trackers'} on this page`;
+    return `Blanc blocked ${blocked} ${blocked === 1 ? 'ad or tracker' : 'ads & trackers'} on this page`;
   }

   /** Short label for a tab's location: host for web pages, page name for
    * internal ones, empty for a blank new tab. */
   function tabDomain(tab) {
-    if (!tab?.url || tab.url.startsWith('bowser://newtab')) return '';
+    if (!tab?.url || tab.url.startsWith('blanc://newtab')) return '';
     try {
       const u = new URL(tab.url);
-      return u.protocol === 'bowser:' ? `bowser://${u.host}` : u.host;
+      return u.protocol === 'blanc:' ? `blanc://${u.host}` : u.host;
```

```diff
-   * host — https, bowser:, file:, and local dev servers show no indicator.
+   * host — https, blanc:, file:, and local dev servers show no indicator.
```

```diff
-    } else if (tab.url.startsWith('bowser://')) {
+    } else if (tab.url.startsWith('blanc://')) {
       el.classList.add('favicon-internal');
-      el.style.backgroundImage = 'url("pages/icon.svg")'; // Bowser mark
+      el.style.backgroundImage = 'url("pages/icon.svg")'; // Blanc mark
```

- [ ] **Step 4: `src/renderer/overlay.js`**

```diff
-    if (tab.url.startsWith('bowser://newtab') || tab.url.startsWith('file://')) return '';
+    if (tab.url.startsWith('blanc://newtab') || tab.url.startsWith('file://')) return '';
```
```diff
-    if (tab.url.startsWith('bowser://error')) {
+    if (tab.url.startsWith('blanc://error')) {
```
```diff
-   * host — https, bowser:, file:, and local dev servers show no indicator.
+   * host — https, blanc:, file:, and local dev servers show no indicator.
```
```diff
-    if (!tab?.url || tab.url.startsWith('bowser://newtab')) return '';
+    if (!tab?.url || tab.url.startsWith('blanc://newtab')) return '';
     try {
       const u = new URL(tab.url);
-      return u.protocol === 'bowser:' ? `bowser://${u.host}` : u.host;
+      return u.protocol === 'blanc:' ? `blanc://${u.host}` : u.host;
```
```diff
-    } else if (tab.url.startsWith('bowser://')) {
+    } else if (tab.url.startsWith('blanc://')) {
       el.classList.add('favicon-internal');
-      el.style.backgroundImage = 'url("pages/icon.svg")'; // Bowser mark
+      el.style.backgroundImage = 'url("pages/icon.svg")'; // Blanc mark
```
```diff
       shield.textContent = String(tab.blockedCount);
-      shield.title = `Bowser blocked ${tab.blockedCount} ${tab.blockedCount === 1 ? 'ad or tracker' : 'ads & trackers'} on this page`;
+      shield.title = `Blanc blocked ${tab.blockedCount} ${tab.blockedCount === 1 ? 'ad or tracker' : 'ads & trackers'} on this page`;
```

- [ ] **Step 5: Verify**

Run: `grep -in "bowser" src/renderer/index.html src/renderer/overlay.html src/renderer/renderer.js src/renderer/overlay.js`
Expected: no output.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/index.html src/renderer/overlay.html src/renderer/renderer.js src/renderer/overlay.js
git commit -m "Rename chrome UI copy and scheme checks to Blanc"
```

---

### Task 7: Internal pages — nav links and settings copy

**Files:**
- Modify: `src/renderer/pages/bookmarks.html:14-17`
- Modify: `src/renderer/pages/downloads.html:14-17`
- Modify: `src/renderer/pages/history.html:14-17`
- Modify: `src/renderer/pages/settings.html:14-17,44,47,74,79-80`
- Modify: `src/renderer/pages/error.html:18-19`
- Modify: `src/renderer/pages/newtab.html:17`

- [ ] **Step 1: Nav links — identical block in `bookmarks.html`, `downloads.html`, `history.html`, `settings.html`**

Each file has this four-link nav (only the `class="current"` marker differs per page — keep whichever page already has it):

```diff
-      <a href="bowser://bookmarks/">Favorites</a>
-      <a href="bowser://history/">History</a>
-      <a href="bowser://downloads/">Downloads</a>
-      <a href="bowser://settings/">Settings</a>
+      <a href="blanc://bookmarks/">Favorites</a>
+      <a href="blanc://history/">History</a>
+      <a href="blanc://downloads/">Downloads</a>
+      <a href="blanc://settings/">Settings</a>
```

(Apply this same four-line swap in all four files, preserving each file's existing `class="current"` on its own nav link.)

- [ ] **Step 2: `src/renderer/pages/error.html`**

```diff
-      <a id="retryLink" href="bowser://newtab/">Try again</a>
-      <a href="bowser://newtab/">New tab</a>
+      <a id="retryLink" href="blanc://newtab/">Try again</a>
+      <a href="blanc://newtab/">New tab</a>
```

- [ ] **Step 3: `src/renderer/pages/newtab.html`** (nav link only — the `<bowser-sprite>` element on line 27 and its script tag on line 36 are removed in Task 9, not renamed here)

```diff
-      <a class="ledger-label" href="bowser://bookmarks/">favorites</a>
+      <a class="ledger-label" href="blanc://bookmarks/">favorites</a>
```

- [ ] **Step 4: `src/renderer/pages/settings.html` copy**

```diff
       <select id="theme">
```
Nav block (line 14-17, same swap as Step 1):
```diff
-      <a href="bowser://bookmarks/">Favorites</a>
-      <a href="bowser://history/">History</a>
-      <a href="bowser://downloads/">Downloads</a>
-      <a href="bowser://settings/" class="current">Settings</a>
+      <a href="blanc://bookmarks/">Favorites</a>
+      <a href="blanc://history/">History</a>
+      <a href="blanc://downloads/">Downloads</a>
+      <a href="blanc://settings/" class="current">Settings</a>
```
Default-browser copy:
```diff
-        <span class="hint" id="defaultBrowserHint">Open web links from other apps in Bowser</span>
+        <span class="hint" id="defaultBrowserHint">Open web links from other apps in Blanc</span>
       </div>
       <button id="defaultBrowserBtn">Make default…</button>
-      <span id="defaultBrowserState" hidden>Bowser is your default browser</span>
+      <span id="defaultBrowserState" hidden>Blanc is your default browser</span>
```
Home page placeholder:
```diff
-      <input id="homePage" type="url" placeholder="bowser://newtab/" />
+      <input id="homePage" type="url" placeholder="blanc://newtab/" />
```
Usage ping copy:
```diff
-        <span>Help improve Bowser</span>
+        <span>Help improve Blanc</span>
       </div>
       <div class="label">
-        <span class="hint">Sends an anonymous ping (app version, OS) when Bowser launches. No browsing data, no id.</span>
+        <span class="hint">Sends an anonymous ping (app version, OS) when Blanc launches. No browsing data, no id.</span>
```

- [ ] **Step 5: Verify**

Run: `grep -in "bowser" src/renderer/pages/bookmarks.html src/renderer/pages/downloads.html src/renderer/pages/history.html src/renderer/pages/settings.html src/renderer/pages/error.html src/renderer/pages/newtab.html`
Expected: three remaining matches, all in `newtab.html` — the `<bowser-sprite>` element (line 27) and its `<script src="bowser-sprite.js">` (line 36), both removed in Task 9. Everything else: no output.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/pages/bookmarks.html src/renderer/pages/downloads.html src/renderer/pages/history.html src/renderer/pages/settings.html src/renderer/pages/error.html src/renderer/pages/newtab.html
git commit -m "Rename internal-page nav links and settings copy to blanc://"
```

---

### Task 8: `pages.css` comments

**Files:**
- Modify: `src/renderer/pages/pages.css:219,302,457`

- [ ] **Step 1: Edit the three comments**

```diff
-/* Default-browser row: quiet confirmation once Bowser holds the role. */
+/* Default-browser row: quiet confirmation once Blanc holds the role. */
```

Since Task 9 deletes the mascot entirely, drop this comment's sprite reference at the same time rather than leaving a stale mention:

```diff
 /* ---------- new tab: "ledger" start page ----------
    From the Start Page exploration (1a) in the Bowser Design System: one
    left-aligned column that reads like a well-kept notebook — date,
-   "Where to?", favorites, tab groups — with the sprite denned bottom-right
-   and a quiet margin-note footer. */
+   "Where to?", favorites, tab groups — with a quiet margin-note footer. */
```

(The "Bowser Design System" name is the design-source project name, a proper noun for a separate Claude Design project the user maintains — leave that phrase as-is; it refers to the design doc, not the app.)

```diff
-/* ---------- Basic-auth dialog (bowser://auth) ---------- */
+/* ---------- Basic-auth dialog (blanc://auth) ---------- */
```

- [ ] **Step 2: Verify**

Run: `grep -n "bowser://\|Bowser holds\|sprite denned" src/renderer/pages/pages.css`
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/pages/pages.css
git commit -m "Update pages.css comments for Blanc, drop stale sprite reference"
```

---

### Task 9: Remove the mascot

**Files:**
- Delete: `src/renderer/pages/bowser-sprite.js`
- Delete: `src/renderer/pages/bowser-sprite-sheet.png`
- Modify: `src/renderer/pages/newtab.html:27,36`
- Modify: `src/renderer/pages/pages.css:394-400,419` (the `.ledger-dog` rule and its two references)

- [ ] **Step 1: Delete the sprite files**

```bash
git rm src/renderer/pages/bowser-sprite.js src/renderer/pages/bowser-sprite-sheet.png
```

- [ ] **Step 2: Remove the element and script tag from `newtab.html`**

```diff
   </main>

-  <bowser-sprite class="ledger-dog" scale="5"></bowser-sprite>
-
   <footer class="ledger-footer">
     <span id="footerLeft"></span>
     <span id="version" class="ledger-version"></span>
     <span id="goAnywhere"></span>
   </footer>

   <script src="newtab.js"></script>
-  <script src="bowser-sprite.js"></script>
 </body>
```

- [ ] **Step 3: Remove the now-unused `.ledger-dog` rule from `pages.css`**

```diff
 .ledger-empty { font-family: var(--font-mono); font-size: 11.5px; color: var(--text-dim); }

-/* The sprite renders a fixed-palette pixel-art doberman (black + rust) —
-   no theme hook needed, unlike the earlier hand-drawn grid sprite. */
-.ledger-dog {
-  position: fixed;
-  right: 110px;
-  bottom: 96px;
-}
-
 .ledger-footer {
```

```diff
-@media (max-width: 900px) { .ledger-dog { display: none; } }
 @media (max-width: 720px) {
```

- [ ] **Step 4: Verify**

Run: `git status --short | grep bowser-sprite`
Expected: two `D ` (deleted) lines for the sprite JS and PNG.

Run: `grep -in "bowser\|sprite" src/renderer/pages/newtab.html src/renderer/pages/pages.css`
Expected: no output.

Run: `npm start`, open the new tab page, confirm the layout reads cleanly with no gap/blank space where the dog used to sit (bottom-right of the ledger). Close the app.

- [ ] **Step 5: Commit**

```bash
git add -u src/renderer/pages/bowser-sprite.js src/renderer/pages/bowser-sprite-sheet.png src/renderer/pages/newtab.html src/renderer/pages/pages.css
git commit -m "Remove the pixel-doberman mascot"
```

---

### Task 10: `scripts/release.sh`

**Files:**
- Modify: `scripts/release.sh:15,22,47-50`

- [ ] **Step 1: Edit the repo variable, log line, and asset filenames**

```diff
-REPO="bnfy/bowser"
+REPO="bnfy/blanc"
 VERSION=$(node -p "require('./package.json').version")
 TAG="v$VERSION"
```
```diff
-echo "==> Releasing Bowser $VERSION ($TAG)"
+echo "==> Releasing Blanc $VERSION ($TAG)"
```
```diff
 ASSETS=(
-  "dist/Bowser-$VERSION-arm64-mac.zip"
-  "dist/Bowser-$VERSION-arm64-mac.zip.blockmap"
-  "dist/Bowser-$VERSION-arm64.dmg"
-  "dist/Bowser-$VERSION-arm64.dmg.blockmap"
+  "dist/Blanc-$VERSION-arm64-mac.zip"
+  "dist/Blanc-$VERSION-arm64-mac.zip.blockmap"
+  "dist/Blanc-$VERSION-arm64.dmg"
+  "dist/Blanc-$VERSION-arm64.dmg.blockmap"
   "dist/latest-mac.yml"
 )
```

- [ ] **Step 2: Verify**

Run: `grep -in "bowser" scripts/release.sh`
Expected: no output.

Run: `bash -n scripts/release.sh` (syntax check only, doesn't execute)
Expected: no output (exit 0).

- [ ] **Step 3: Commit**

```bash
git add scripts/release.sh
git commit -m "Point release script at Blanc artifacts and bnfy/blanc"
```

Do not run this script as part of this task — Task 1's `package.json` `build.publish.repo` change means a real release now requires the GitHub repo to actually be renamed first (see the Manual Steps section at the end of this plan).

---

### Task 11: Cloudflare Worker rename — `cloudflare/ping-worker/`

**Files:**
- Modify: `cloudflare/ping-worker/wrangler.toml:1`
- Modify: `cloudflare/ping-worker/README.md:1,3-4,23,27,29-30`
- Modify: `cloudflare/ping-worker/src/index.js:1`

- [ ] **Step 1: `wrangler.toml`**

```diff
-name = "bowser-ping"
+name = "blanc-ping"
 main = "src/index.js"
```

- [ ] **Step 2: `src/index.js`** (comment only, no behavior change)

```diff
-// Collector for Bowser's opt-in launch ping (see src/main/telemetry.js in
+// Collector for Blanc's opt-in launch ping (see src/main/telemetry.js in
 // the main repo). Tallies anonymous counts in Workers KV — no IPs, no
 // persistent ids, no browsing data are ever stored.
```

- [ ] **Step 3: `README.md`**

```diff
-# bowser-ping
+# blanc-ping

-Collector for Bowser's opt-in, anonymous launch ping (Settings → "Help
-improve Bowser"). Receives `POST /ping` with `{version, platform, arch}`
+Collector for Blanc's opt-in, anonymous launch ping (Settings → "Help
+improve Blanc"). Receives `POST /ping` with `{version, platform, arch}`
 and tallies counts in Workers KV. `GET /stats` (bearer-token gated) returns
 the current totals.
```
```diff
 `wrangler deploy` prints the live URL, something like
-`https://bowser-ping.<your-subdomain>.workers.dev`. Update
+`https://blanc-ping.<your-subdomain>.workers.dev`. Update
 `PING_ENDPOINT` in `src/main/telemetry.js` (in the repo root) to
 `<that-url>/ping`.

-To attach it to `api.getbowser.com` instead of the `workers.dev`
+To attach it to `api.blancbrowser.com` instead of the `workers.dev`
 subdomain, add a route in the Cloudflare dashboard (Workers & Pages →
-bowser-ping → Settings → Triggers → Custom Domains) once
-`getbowser.com`'s DNS is on Cloudflare.
+blanc-ping → Settings → Triggers → Custom Domains) once
+`blancbrowser.com`'s DNS is on Cloudflare.
```

- [ ] **Step 4: Verify**

Run: `grep -in "bowser" cloudflare/ping-worker/wrangler.toml cloudflare/ping-worker/README.md cloudflare/ping-worker/src/index.js`
Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add cloudflare/ping-worker/wrangler.toml cloudflare/ping-worker/README.md cloudflare/ping-worker/src/index.js
git commit -m "Rename Cloudflare ping worker to blanc-ping"
```

Renaming `name` in `wrangler.toml` does not rename the *already-deployed* Worker — that requires an actual `wrangler deploy`, which creates a new Worker under the new name (the old `bowser-ping` Worker keeps running under its old name until separately deleted). This redeploy is a real production infra change; it's called out in the Manual Steps section at the end of this plan, not run automatically here.

---

### Task 12: Marketing site — `site/index.html`

**Files:**
- Modify: `site/index.html:6-7,16,509,526,683,688,712,759,775,785,796,822(via id),826-827,875,1033-1034,1096,1132,1183`

- [ ] **Step 1: Title, meta description, design-token comment**

```diff
-<title>Bowser — zero bloat | fast focus</title>
-<meta name="description" content="Bowser is a minimal browser: one small pill of controls, built-in ad blocking, private tabs, and slash commands. Everything else is the page you came for.">
+<title>Blanc — zero bloat | fast focus</title>
+<meta name="description" content="Blanc is a minimal browser: one small pill of controls, built-in ad blocking, private tabs, and slash commands. Everything else is the page you came for.">
```
```diff
-    /* Bowser Design System tokens (from the design project's styles.css) */
+    /* Blanc Design System tokens (from the design project's styles.css) */
```

- [ ] **Step 2: RAM chart CSS classes/ids** (rename the class from `bowser` to `blanc` — this must stay in sync with the HTML/JS in Steps 4 and 6 below)

```diff
   .ram-bar.chrome { background: #5a3030; }
   .ram-bar.safari { background: var(--border); }
-  .ram-bar.bowser { background: var(--accent); box-shadow: 0 0 10px var(--accent); }
+  .ram-bar.blanc { background: var(--accent); box-shadow: 0 0 10px var(--accent); }
```
```diff
-  .ram-bar.bowser + .ram-value-overlay {
+  .ram-bar.blanc + .ram-value-overlay {
     color: var(--text);
     left: 8px;
     transition: left 1.8s cubic-bezier(0.16, 1, 0.3, 1);
```

- [ ] **Step 3: Hero SVG `aria-label` and pill domain**

```diff
-  <svg class="mark" viewBox="0 0 178.51 193.42" aria-label="Bowser"><path fill="currentColor" ...
+  <svg class="mark" viewBox="0 0 178.51 193.42" aria-label="Blanc"><path fill="currentColor" ...
```
(Keep the rest of the `<path>` data — the mark's artwork — exactly as-is; only `aria-label` changes. The user is producing new logo art separately, per the approved spec — this is just the accessible label on the current artwork until that's swapped in.)

```diff
-      <span class="domain">getbowser.com</span>
+      <span class="domain">blancbrowser.com</span>
```

- [ ] **Step 4: CTA and mock content copy**

```diff
-  <a class="cta" href="#download">download bowser <span class="kbd-hint dev-only" style="color: var(--bg); border-color: var(--bg); background: transparent;">⌘⇧D</span></a>
+  <a class="cta" href="#download">download blanc <span class="kbd-hint dev-only" style="color: var(--bg); border-color: var(--bg); background: transparent;">⌘⇧D</span></a>
```
```diff
-          <span class="mock-url">bowser://private</span>
+          <span class="mock-url">blanc://private</span>
```
```diff
-      <p>Start typing anything and Bowser finds the page you mean from a few letters, running with zero latency.</p>
+      <p>Start typing anything and Blanc finds the page you mean from a few letters, running with zero latency.</p>
```
```diff
-          <div style="color: var(--accent); margin-bottom: 8px;">$ bowser --commands</div>
+          <div style="color: var(--accent); margin-bottom: 8px;">$ blanc --commands</div>
```
```diff
-      <p>Bowser runs on a fraction of the RAM of bloated commercial browsers, giving your machine its raw power back.</p>
+      <p>Blanc runs on a fraction of the RAM of bloated commercial browsers, giving your machine its raw power back.</p>
```

- [ ] **Step 5: RAM chart markup (label + the two ids that Step 2's CSS and Step 6's JS both depend on)**

```diff
-            <span>Bowser</span>
+            <span>Blanc</span>
```
```diff
-            <div class="ram-bar bowser" id="bowserRamBar" style="width: 0%;"></div>
-            <span class="ram-value-overlay" id="bowserRamOverlay" style="left: 8px;">45 MB</span>
+            <div class="ram-bar blanc" id="blancRamBar" style="width: 0%;"></div>
+            <span class="ram-value-overlay" id="blancRamOverlay" style="left: 8px;">45 MB</span>
```

- [ ] **Step 6: Download links + JS references to the renamed ids**

```diff
-    <a class="primary" id="mac-dl" href="https://github.com/bnfy/bowser/releases/latest">macOS ↓</a>
+    <a class="primary" id="mac-dl" href="https://github.com/bnfy/blanc/releases/latest">macOS ↓</a>
```
```diff
         if (entry.target.id === 'ramCard') {
           setTimeout(() => {
-            bowserRamBar.style.width = '3.75%'; // 45MB is 3.75% of 1.2GB
-            const overlay = document.getElementById('bowserRamOverlay');
+            blancRamBar.style.width = '3.75%'; // 45MB is 3.75% of 1.2GB
+            const overlay = document.getElementById('blancRamOverlay');
```
```diff
-    { cmd: '/settings', result: 'Opening bowser://settings' }
+    { cmd: '/settings', result: 'Opening blanc://settings' }
```
```diff
-  const bowserRamBar = document.getElementById('bowserRamBar');
+  const blancRamBar = document.getElementById('blancRamBar');
```
```diff
   // ---------- Dynamic Download Handler ----------
-  fetch('https://api.github.com/repos/bnfy/bowser/releases/latest')
+  fetch('https://api.github.com/repos/bnfy/blanc/releases/latest')
```

- [ ] **Step 7: Verify**

Run: `grep -in "bowser" site/index.html`
Expected: no output.

Open `site/index.html` directly in a browser (or `open site/index.html` on macOS) and confirm: the RAM chart still animates (its bar-width JS still targets the renamed `blancRamBar`/`blancRamOverlay` ids), the hero pill shows "blancbrowser.com", and the CTA reads "download blanc".

- [ ] **Step 8: Commit**

```bash
git add site/index.html
git commit -m "Rebrand marketing site copy to Blanc"
```

Deploying this to `blancbrowser.com` is a real infra action, covered in the Manual Steps section at the end of this plan, not run automatically here.

---

### Task 13: `README.md`

**Files:**
- Modify: `README.md:1,3,19,94,105,123-124,128,144,154,157,199`

- [ ] **Step 1: Title and hero image alt text**

```diff
-# Bowser
+# Blanc

-![Bowser's Island chrome floating over github.com — tab dots, the current domain, and the ad-block counter in a single pill](docs/island-chrome.png)
+![Blanc's Island chrome floating over github.com — tab dots, the current domain, and the ad-block counter in a single pill](docs/island-chrome.png)
```

- [ ] **Step 2: Releases link**

```diff
 Grab the latest signed and notarized build from
-[Releases](https://github.com/bnfy/bowser/releases/latest) (macOS dmg/zip,
+[Releases](https://github.com/bnfy/blanc/releases/latest) (macOS dmg/zip,
 arm64). Installed copies keep themselves current via auto-update.
```

- [ ] **Step 3: Architecture table and prose — scheme references**

```diff
-src/main/pages.js        bowser:// scheme for internal pages + their guarded IPC API
+src/main/pages.js        blanc:// scheme for internal pages + their guarded IPC API
```
```diff
-src/main/tab-preload.js  contextBridge API for bowser:// internal pages only
+src/main/tab-preload.js  contextBridge API for blanc:// internal pages only
```
```diff
 **Security posture:** the chrome strip, the overlay, and every tab run
 with `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`.
 Tabs carry `tab-preload.js`, but it exposes its `bowserPages` bridge only
-when the document is one of our own `bowser://` pages (re-checked on every
+when the document is one of our own `blanc://` pages (re-checked on every
 navigation), and the main process re-verifies the sender URL on every
 `pages:*` IPC call — so ordinary web content still gets zero access to
 Node, Electron internals, or browser data. The richer `browserAPI` bridge
-is only ever attached to Bowser's own chrome documents.
+is only ever attached to Blanc's own chrome documents.
```
(Note: `bowserPages` in the sentence above stays as-is — same internal-identifier rule as Task 4.)
```diff
-**Internal pages** (`bowser://newtab`, `bookmarks`, `history`,
+**Internal pages** (`blanc://newtab`, `bookmarks`, `history`,
 `downloads`, `settings`) are served over a privileged custom scheme by
 `pages.js` — a real origin, so web content can't link into arbitrary local
 files. The user-facing name for bookmarks is **Favorites** (heart icon);
 the identifiers keep the classic name.
```

- [ ] **Step 4: Password-manager paragraph**

```diff
 against vendor allowlists. (Bowser is now in Apple's allowlist source
 data via
 [apple/password-manager-resources#1137](https://github.com/apple/password-manager-resources/pull/1137);
 meanwhile, the macOS Passwords menu-bar app works well alongside Bowser.)
```

Leave this paragraph's two "Bowser" mentions **as-is** — they're a historical/factual record of a specific, already-merged GitHub PR under the old name (`apple/password-manager-resources#1137`, merged 2026-07-04 per project memory). Rewriting them to "Blanc" would misrepresent what that PR actually says. Add one clarifying sentence instead:

```diff
 against vendor allowlists. (Bowser is now in Apple's allowlist source
 data via
 [apple/password-manager-resources#1137](https://github.com/apple/password-manager-resources/pull/1137);
-meanwhile, the macOS Passwords menu-bar app works well alongside Bowser.)
+meanwhile, the macOS Passwords menu-bar app works well alongside it. The
+PR predates this app's rename to Blanc and refers to it by its former
+name — a follow-up PR to Apple's allowlist under the new name is a
+later, separate task.)
```

- [ ] **Step 5: "What's still left" section**

```diff
-- **Multi-window** — Bowser is deliberately single-window for now.
+- **Multi-window** — Blanc is deliberately single-window for now.
```

- [ ] **Step 6: Verify**

Run: `grep -in "bowser" README.md`
Expected: exactly two matches, both inside the password-manager paragraph's historical PR reference from Step 4 — everything else renamed.

- [ ] **Step 7: Commit**

```bash
git add README.md
git commit -m "Rebrand README to Blanc, preserve historical PR reference"
```

---

### Task 14: Full-repo sweep

**Files:** none specific — this is a final net, not new ground.

- [ ] **Step 1: Confirm nothing was missed**

Run:
```bash
grep -rn "bowser\|Bowser\|BOWSER" --include="*.js" --include="*.html" --include="*.css" --include="*.json" --include="*.md" --include="*.toml" --include="*.sh" src/ site/ README.md scripts/ cloudflare/ package.json 2>/dev/null | grep -v node_modules
```

Expected output: only the two intentional survivors —
1. `README.md`'s historical PR-reference sentence (Task 13, Step 4).
2. `package-lock.json` may still show old nested dependency metadata unrelated to the app name (e.g. third-party packages that happen to contain the substring "bowser" in an unrelated context) — inspect any hit here individually; if it's inside `node_modules`-derived lockfile data for an unrelated package, leave it. If it's anything else, it's a miss — go fix it in the relevant task above.

- [ ] **Step 2: Manual smoke test**

Run: `npm start`
Expected: app launches, window title bar / Dock show "Blanc", new tab page loads without the mascot and without a layout gap, Settings page reads "Blanc" throughout, `Cmd+L` → typing `/settings` still opens Settings (confirms the renamed `blanc://` scheme resolves correctly end-to-end).

No commit for this task — it's a verification-only checkpoint.

---

## Manual / Infra Steps (require your own credentials — not run automatically)

These are real, one-shot changes to shared/production systems (a public GitHub repo, live DNS/CDN, a deployed Worker). Confirm each before running.

1. **Rename the GitHub repo:** `gh repo rename blanc --repo bnfy/bowser` (or via github.com Settings). GitHub preserves a redirect from `bnfy/bowser` to `bnfy/blanc` indefinitely, so existing clones, the old `README.md` Releases link (now already pointing at the new name per Task 13), and old installed clients' baked-in update feed URLs keep resolving.
2. **Update your local remote:** `git remote set-url origin https://github.com/bnfy/blanc.git`
3. **Deploy the renamed Cloudflare Worker:** `cd cloudflare/ping-worker && npx wrangler deploy` — creates `blanc-ping` as a new Worker. Afterward, delete the old `bowser-ping` Worker from the Cloudflare dashboard (Workers & Pages → bowser-ping → Settings → Delete) once you've confirmed `blanc-ping` is receiving pings from a build using the new endpoint.
4. **Deploy the marketing site** to your purchased domain: `npx wrangler pages deploy site --project-name blancbrowser` (new project name — don't reuse `getbowser`, which stays live at the old domain unless you separately retire it), then point `blancbrowser.com`'s DNS at the new Pages project.
5. **Cut the first Blanc release** once the above are live: bump `version` in `package.json`, then `npm run release` (uses Task 1 and Task 10's updated config).

## Deferred (not part of this plan)

- **`CLAUDE.md` rewrite** — this file documents the *current* architecture for future Claude Code sessions; it should be updated to describe "Blanc" throughout once this plan's code changes have actually landed, so the rewrite reflects real, merged state rather than an in-flight rename. Do this as its own pass after Task 14 is verified.
- **New icon/logo art** — the user is producing this separately (per the approved spec); swap `build/icon.png` in whenever it's ready.
