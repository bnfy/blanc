# Island at Scale & Action Affordances — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the resting island pill calm at any scale — show only the active group's tabs (capped, with a quiet overflow), move pins/other-groups to the ⌘L list, and add a familiar back/forward/reload/favorite/downloads button set.

**Architecture:** All rendering changes live in the chrome-strip renderer (`src/renderer/renderer.js` + `styles.css` + `index.html`), which reflects `tabs:updated` broadcasts. The action buttons reuse IPC that already exists (`tabs:back/forward/reload/stop/toggle-bookmark`) and per-tab payload fields that already cross the bridge (`canGoBack`, `canGoForward`, `bookmarked`, `isLoading`). The only new plumbing is a downloads-activity push (`chrome:downloads` main→renderer, `chrome:downloads-ack` renderer→main).

**Tech Stack:** Electron (main + preload + renderer), vanilla JS/DOM, CSS custom properties. No build step, no bundler, no test runner.

**Spec of record:** [docs/superpowers/specs/2026-07-06-island-at-scale-design.md](../specs/2026-07-06-island-at-scale-design.md)

## Global Constraints

- **No test suite / no linter** in this repo — do not add one. Verification is **manual** via `npm start`.
- **Chrome-level changes require a full app relaunch**, not `⌘R` (`⌘R` reloads the active tab's `WebContentsView`, not the chrome window, which loads its HTML/CSS once at window creation). Quit and re-run `npm start` after editing `index.html` / `styles.css` / `renderer.js`.
- **Naming:** the favorite control is user-facing "Favorite" but calls the internal `toggleBookmark` bridge — **do not rename internals** (the Favorites/`bookmarks` split is deliberate).
- **Security posture is fixed:** do not change `contextIsolation`/`sandbox`/`nodeIntegration` or widen either preload's surface beyond the two new download methods.
- **Data model unchanged:** pins, groups, and `session.json` are untouched — pins still persist and still render in the ⌘L panel; only their *pill* rendering is removed.
- **New IPC channels (only these):** `chrome:downloads` (main → chrome renderer), `chrome:downloads-ack` (chrome renderer → main).
- **All new pill buttons must `stopPropagation` on click** so they fire without also opening the panel (matches `tabDot` at renderer.js:139).

## File Structure

| File | Responsibility | Change |
|------|----------------|--------|
| `src/renderer/index.html` | Static pill DOM skeleton | Add `#pillNav` (leading) + `#pillActions` (trailing) containers + separator |
| `src/renderer/renderer.js` | Strip render loop + island state | Replace cluster/pinned-shelf rendering with active-group dots; add button factory + nav/reload/favorite/downloads buttons + downloads subscription |
| `src/renderer/styles.css` | Strip + overlay styling | Retire pinned-shelf/folded/dim cluster styles; add `.pill-btn(s)`, `.pill-overflow`, `.pill-sep`, download progress ring; domain ellipsis |
| `src/main/downloads.js` | Download manager | Add `hasRecent`, `acknowledgeDownloads()`, `downloadsActivity()` |
| `src/main/main.js` | Tab/window/IPC owner | Wire `setupDownloads` notify → broadcast `chrome:downloads`; add `chrome:downloads-ack` handler |
| `src/main/preload.js` | `browserAPI` bridge | Add `onDownloadsActivity`, `acknowledgeDownloads` |
| `CLAUDE.md` | Project docs | Update pill description; drop renderer↔overlay `clusterTabs` sync note |

`src/renderer/overlay.js` is intentionally **not** modified — the ⌘L panel already renders a pinned section + group headers (overlay.js:610-614) and remains the index for everything at scale.

---

### Task 1: Pill shows the active group only, capped, with a quiet overflow

Replaces the unbounded pinned-shelf + multi-cluster rendering (the original clipping bug) with a single windowed dot set for the active tab's group.

**Files:**
- Modify: `src/renderer/renderer.js` (remove `clusterTabs` at 116-127; rewrite the dots block in `render()` at 148-191)
- Modify: `src/renderer/styles.css` (retire `.pinned-shelf` / `.pill-cluster.folded` / `.pill-cluster.dim` / `.dot-mini`; add `.pill-overflow`; domain ellipsis)

**Interfaces:**
- Produces: `activeGroupDots()` → `HTMLElement[]`, and module const `DOT_CAP = 8`. Consumed only within `render()`.

- [ ] **Step 1: Remove `clusterTabs` and add `activeGroupDots`**

In `src/renderer/renderer.js`, delete the `clusterTabs` function (lines 116-127) and add, just above `tabDot` (line 129):

```js
const DOT_CAP = 8;

/** Dots for the pill: the ACTIVE tab's group only (null groupId = the
 * ungrouped set), pins excluded except the active tab itself so you always
 * see where you are. Capped at DOT_CAP with a trailing "+k" that opens the
 * panel; the window slides only when needed to keep the active dot visible.
 * The pill deliberately does NOT map other groups — that lives in ⌘L. */
function activeGroupDots() {
  const tab = activeTab();
  if (!tab) return [];
  const g = tab.groupId ?? null;
  const members = state.tabs.filter(
    (t) => (t.groupId ?? null) === g && (!t.pinned || t.id === state.activeTabId)
  );
  if (members.length <= DOT_CAP) return members.map(tabDot);

  const activeIdx = Math.max(0, members.indexOf(tab));
  const start = activeIdx < DOT_CAP ? 0 : Math.min(activeIdx - (DOT_CAP - 1), members.length - DOT_CAP);
  const nodes = members.slice(start, start + DOT_CAP).map(tabDot);

  const hidden = members.length - DOT_CAP;
  const more = document.createElement('button');
  more.className = 'pill-overflow';
  more.textContent = `+${hidden}`;
  more.title = `${hidden} more ${hidden === 1 ? 'tab' : 'tabs'} in this group — open the list`;
  more.setAttribute('aria-label', more.title);
  more.addEventListener('click', (e) => { e.stopPropagation(); window.browserAPI.openIsland(); });
  nodes.push(more);
  return nodes;
}
```

- [ ] **Step 2: Rewrite the dots block in `render()`**

In `render()`, replace the pinned-shelf + clusters block (lines 148-191, from `const pinnedTabs = ...` through the `pillDots.replaceChildren(...)` closing `);`) with:

```js
  pillDots.replaceChildren(...activeGroupDots());
```

Leave the rest of `render()` (from `const activeGroup = ...` at line 193 onward) unchanged.

- [ ] **Step 3: Retire dead cluster CSS and add overflow + domain ellipsis**

In `src/renderer/styles.css`, delete these now-unused rules: `.pill-cluster` (161-166), `.pill-cluster.dim .island-dot` (167), `.pill-cluster.folded` + `:hover` (171-177), `.pill-cluster.pinned-shelf` (182-186), `.dot-mini` + `.dot-mini.accent` (188-195). Keep `#pillDots`, `.island-dot` and its states.

Then add the overflow chip style near `.island-dot`:

```css
.pill-overflow {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-dim);
  background: transparent;
  border: none;
  padding: 0 2px;
  cursor: pointer;
  flex: 0 0 auto;
}
.pill-overflow:hover { color: var(--accent); }
```

And make the domain absorb width pressure — replace the `#pillDomain` rule (223-227) with:

```css
#pillDomain {
  font-family: var(--font-mono);
  font-size: 12.5px;
  color: var(--text);
  flex: 0 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}
```

- [ ] **Step 4: Relaunch and verify**

Run: `npm start`
Then, in the app: open one group and create ~20 tabs in it (⌘T repeatedly stays in… note ⌘T opens *ungrouped* — instead open a group, then use the panel's new-tab within it, or pin nothing and just open many ungrouped tabs to exercise the ungrouped set).
Expected:
- The pill shows at most 8 dots plus a `+N` chip; the favicon, domain and shield stay fully visible (no clipping off the right edge).
- Switching to a different group swaps the dots to that group.
- Pin a couple of tabs → they disappear from the pill (they remain in the ⌘L pinned section). The active tab's dot is always visible even when it's the last of many.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/renderer.js src/renderer/styles.css
git commit -m "Pill shows active group only, capped with quiet overflow

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Back / forward navigation cluster (leading)

**Files:**
- Modify: `src/renderer/index.html` (add `#pillNav` as the first child of `#islandPill`)
- Modify: `src/renderer/renderer.js` (add `PILL_ICONS` + `pillButton()`; create nav buttons; update disabled state in `render()`)
- Modify: `src/renderer/styles.css` (add `.pill-btns` / `.pill-btn`)

**Interfaces:**
- Produces: `pillButton(iconKey, title, onClick) → HTMLButtonElement` and `PILL_ICONS` map — consumed by Tasks 3 and 5.

- [ ] **Step 1: Add the `#pillNav` container**

In `src/renderer/index.html`, make `#pillNav` the first child of `#islandPill` (before `#pillDots` at line 14):

```html
      <div id="islandPill" class="no-drag" role="button" tabindex="0" title="Search, tabs & commands (Ctrl/Cmd+L)">
        <div id="pillNav" class="pill-btns"></div>
        <div id="pillDots"></div>
```

- [ ] **Step 2: Add the button factory and icons**

In `src/renderer/renderer.js`, after the existing `ICONS` object (ends line 35), add:

```js
  const PILL_ICONS = {
    back: '<svg viewBox="0 0 16 16"><path d="M10 3.5 5.5 8l4.5 4.5"/></svg>',
    forward: '<svg viewBox="0 0 16 16"><path d="M6 3.5 10.5 8 6 12.5"/></svg>',
    reload: '<svg viewBox="0 0 16 16"><path d="M12.5 8a4.5 4.5 0 1 1-1.3-3.2M12.5 2.8v2.4h-2.4"/></svg>',
    stop: '<svg viewBox="0 0 16 16"><path d="M4.75 4.75l6.5 6.5M11.25 4.75l-6.5 6.5"/></svg>',
    star: '<svg viewBox="0 0 16 16"><path d="M8 3l1.6 3.2 3.5.5-2.55 2.5.6 3.5L8 11.5 4.85 12.7l.6-3.5L2.9 6.7l3.5-.5z"/></svg>',
    download: '<svg viewBox="0 0 16 16"><path d="M8 2.5v6.5M5.3 6.3 8 9l2.7-2.7M3.5 12.5h9"/></svg>',
  };

  /** A quiet icon button for the pill. stopPropagation keeps a click on the
   * button from bubbling to the pill (which would open the panel). */
  function pillButton(iconKey, title, onClick) {
    const b = document.createElement('button');
    b.className = 'pill-btn';
    b.innerHTML = PILL_ICONS[iconKey];
    b.title = title;
    b.setAttribute('aria-label', title);
    b.addEventListener('click', (e) => { e.stopPropagation(); onClick(); });
    return b;
  }
```

- [ ] **Step 3: Create the nav buttons and wire state**

In `src/renderer/renderer.js`, after the `const pillShield = ...` element lookups (near line 17), add references and creation. First add the element lookup with the others:

```js
  const pillNav = document.getElementById('pillNav');
```

Then, after the element lookups block and before `let state = ...` (line 26), create the buttons once:

```js
  const backBtn = pillButton('back', 'Back', () => state.activeTabId && window.browserAPI.goBack(state.activeTabId));
  const forwardBtn = pillButton('forward', 'Forward', () => state.activeTabId && window.browserAPI.goForward(state.activeTabId));
  pillNav.append(backBtn, forwardBtn);
```

Then, inside `render()`, just after `const tab = activeTab();` (line 146), add the enabled-state update:

```js
    backBtn.disabled = !tab?.canGoBack;
    forwardBtn.disabled = !tab?.canGoForward;
```

- [ ] **Step 4: Style the buttons**

In `src/renderer/styles.css`, add near the island pill rules (after `.island-dot` block):

```css
.pill-btns { display: flex; align-items: center; gap: 1px; flex: 0 0 auto; }
.pill-btn {
  width: 26px; height: 26px;
  display: inline-flex; align-items: center; justify-content: center;
  border: none; border-radius: 50%;
  background: transparent; color: var(--text-dim);
  cursor: pointer;
  position: relative;
}
.pill-btn:hover { background: var(--accent-dim); color: var(--accent); }
.pill-btn:disabled { color: var(--border); cursor: default; background: transparent; }
.pill-btn svg { width: 15px; height: 15px; fill: none; stroke: currentColor; stroke-width: 1.4; stroke-linecap: round; stroke-linejoin: round; }
```

- [ ] **Step 5: Relaunch and verify**

Run: `npm start`
Expected:
- Back/forward icons lead the pill. On a fresh tab both are greyed. After navigating, Back becomes active; clicking it goes back and greys Forward appropriately.
- Clicking Back/Forward does **not** open the command panel.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/index.html src/renderer/renderer.js src/renderer/styles.css
git commit -m "Add back/forward buttons to the island pill

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Reload/stop + favorite action cluster (trailing)

**Files:**
- Modify: `src/renderer/index.html` (add a separator + `#pillActions` after `#pillShield`)
- Modify: `src/renderer/renderer.js` (create reload + favorite buttons; update in `render()`)
- Modify: `src/renderer/styles.css` (separator + favorited-state fill)

**Interfaces:**
- Consumes: `pillButton`, `PILL_ICONS` (Task 2).
- Produces: `#pillActions` container — Task 5 appends the downloads button here.

- [ ] **Step 1: Add the separator and `#pillActions` container**

In `src/renderer/index.html`, after `#pillShield` (line 24), before `</div>` closing `#islandPill`:

```html
        <span id="pillShield" class="shield" hidden>0</span>
        <span class="pill-sep"></span>
        <div id="pillActions" class="pill-btns"></div>
      </div>
```

- [ ] **Step 2: Create reload + favorite buttons**

In `src/renderer/renderer.js`, add the element lookup with the others:

```js
  const pillActions = document.getElementById('pillActions');
```

Then, next to the nav-button creation from Task 2 (before `let state = ...`):

```js
  const reloadBtn = pillButton('reload', 'Reload', () => {
    const t = activeTab();
    if (!t) return;
    if (t.isLoading) window.browserAPI.stop(t.id);
    else window.browserAPI.reload(t.id);
  });
  const favoriteBtn = pillButton('star', 'Favorite this page', () => window.browserAPI.toggleBookmark());
  pillActions.append(reloadBtn, favoriteBtn);
```

- [ ] **Step 3: Update their state in `render()`**

Inside `render()`, alongside the nav-state lines from Task 2:

```js
    reloadBtn.innerHTML = PILL_ICONS[tab?.isLoading ? 'stop' : 'reload'];
    reloadBtn.title = tab?.isLoading ? 'Stop' : 'Reload';
    favoriteBtn.classList.toggle('on', !!tab?.bookmarked);
    favoriteBtn.title = tab?.bookmarked ? 'Remove favorite' : 'Favorite this page';
```

- [ ] **Step 4: Style the separator and filled star**

In `src/renderer/styles.css`, add:

```css
.pill-sep { width: 1px; height: 15px; background: var(--border); flex: 0 0 auto; margin: 0 2px; }
.pill-btn.on { color: var(--accent); }
.pill-btn.on svg { fill: var(--accent); stroke: var(--accent); }
```

- [ ] **Step 5: Relaunch and verify**

Run: `npm start`
Expected:
- Reload sits after the shield behind a hairline separator; while a page loads it becomes a stop (×) and clicking it stops the load.
- The favorite heart fills (accent) when the current page is bookmarked and toggles off/on via click (cross-check `blanc://bookmarks`).
- Neither button opens the panel.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/index.html src/renderer/renderer.js src/renderer/styles.css
git commit -m "Add reload/stop and favorite buttons to the island pill

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Downloads-activity signal (main process)

Pushes a small activity snapshot to the chrome renderer so the pill can show a contextual downloads button. Today `setupDownloads(ses)` is called with no notify callback (main.js:1787), so nothing reaches the chrome UI.

**Files:**
- Modify: `src/main/downloads.js` (track `hasRecent`; add `acknowledgeDownloads()`, `downloadsActivity()`)
- Modify: `src/main/main.js` (import the new fns; pass a notify callback; add `broadcastDownloadsActivity()`; add `chrome:downloads-ack` handler)
- Modify: `src/main/preload.js` (add `onDownloadsActivity`, `acknowledgeDownloads`)

**Interfaces:**
- Produces (downloads.js): `downloadsActivity() → { active: number, hasRecent: boolean, receivedBytes: number, totalBytes: number }`, `acknowledgeDownloads() → void`.
- Produces (preload): `browserAPI.onDownloadsActivity(cb) → unsubscribe`, `browserAPI.acknowledgeDownloads() → void`. Payload shape matches `downloadsActivity()`. Consumed by Task 5.

- [ ] **Step 1: Add `hasRecent`, acknowledge, and snapshot to downloads.js**

In `src/main/downloads.js`, add a module flag near the top (after `const active = new Map();`, line 13):

```js
/** A download finished as `completed` and hasn't been looked at yet — drives
 * the pill's contextual downloads button. Cleared by acknowledgeDownloads(). */
let hasRecent = false;
```

In the `item.once('done', ...)` handler, set it when a download completes (inside the handler, before `broadcast();` at line 67):

```js
      if (state === 'completed') hasRecent = true;
```

Then add two functions (before `module.exports`, line 103):

```js
function acknowledgeDownloads() {
  hasRecent = false;
}

/** Snapshot for the chrome pill: how many are in-flight, whether a finished
 * one is still unacknowledged, and aggregate bytes for a progress ring. */
function downloadsActivity() {
  let receivedBytes = 0;
  let totalBytes = 0;
  for (const { record } of active.values()) {
    receivedBytes += record.receivedBytes;
    totalBytes += record.totalBytes;
  }
  return { active: active.size, hasRecent, receivedBytes, totalBytes };
}
```

And add them to `module.exports` (lines 103-111):

```js
module.exports = {
  setupDownloads,
  listDownloads,
  activeCount,
  acknowledgeDownloads,
  downloadsActivity,
  cancelDownload,
  openDownload,
  showDownloadInFolder,
  clearFinishedDownloads,
};
```

- [ ] **Step 2: Import the new functions in main.js**

In `src/main/main.js`, change the downloads import (line 11) from:

```js
const { setupDownloads } = require('./downloads');
```

to:

```js
const { setupDownloads, downloadsActivity, acknowledgeDownloads } = require('./downloads');
```

- [ ] **Step 3: Broadcast activity and wire the notify callback**

In `src/main/main.js`, add a broadcaster next to `broadcastTabs` (after line 461):

```js
function broadcastDownloadsActivity() {
  if (!win || win.isDestroyed()) return;
  win.webContents.send('chrome:downloads', downloadsActivity());
}
```

Change the `setupDownloads` call (line 1787) to pass it as the notify callback:

```js
  setupDownloads(ses, broadcastDownloadsActivity);
```

- [ ] **Step 4: Add the acknowledge IPC handler**

In `src/main/main.js`, next to the other `chrome:*` `ipcMain.on` handlers (after `overlay:close` at line 1372):

```js
  ipcMain.on('chrome:downloads-ack', () => {
    acknowledgeDownloads();
    broadcastDownloadsActivity();
  });
```

- [ ] **Step 5: Expose the two bridge methods in preload.js**

In `src/main/preload.js`, inside the `browserAPI` object, add next to `onTabsUpdated` (after line 57):

```js
  onDownloadsActivity: (callback) => {
    const listener = (_e, payload) => callback(payload);
    ipcRenderer.on('chrome:downloads', listener);
    return () => ipcRenderer.removeListener('chrome:downloads', listener);
  },
  acknowledgeDownloads: () => ipcRenderer.send('chrome:downloads-ack'),
```

- [ ] **Step 6: Verify the signal fires**

Temporarily add a probe: in `broadcastDownloadsActivity` add `console.log('[dl]', downloadsActivity());` (main-process log shows in the terminal running `npm start`).
Run: `npm start`, then download a file from any site.
Expected: `[dl] { active: 1, ... }` while downloading, then `{ active: 0, hasRecent: true, ... }` on completion.
Remove the `console.log` line before committing.

- [ ] **Step 7: Commit**

```bash
git add src/main/downloads.js src/main/main.js src/main/preload.js
git commit -m "Broadcast a downloads-activity signal to the chrome renderer

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Contextual downloads button in the pill

**Files:**
- Modify: `src/renderer/renderer.js` (create the downloads button; subscribe to activity; render its state)
- Modify: `src/renderer/styles.css` (progress ring)

**Interfaces:**
- Consumes: `pillButton`/`PILL_ICONS` (Task 2), `#pillActions` (Task 3), `browserAPI.onDownloadsActivity`/`acknowledgeDownloads`/`openPage` (Task 4 + existing).

- [ ] **Step 1: Create the downloads button and activity state**

In `src/renderer/renderer.js`, next to the reload/favorite creation (Task 3):

```js
  let downloadState = { active: 0, hasRecent: false, receivedBytes: 0, totalBytes: 0 };
  const downloadsBtn = pillButton('download', 'Downloads', () => {
    window.browserAPI.openPage('downloads');
    window.browserAPI.acknowledgeDownloads();
  });
  downloadsBtn.classList.add('pill-download');
  downloadsBtn.hidden = true;
  pillActions.append(downloadsBtn);

  function renderDownloads() {
    const { active, hasRecent, receivedBytes, totalBytes } = downloadState;
    downloadsBtn.hidden = !(active > 0 || hasRecent);
    downloadsBtn.classList.toggle('active', active > 0);
    const pct = active > 0 && totalBytes > 0 ? Math.min(1, receivedBytes / totalBytes) : 0;
    downloadsBtn.style.setProperty('--dl-progress', String(pct));
    downloadsBtn.title = active > 0 ? `Downloading — ${active} active` : 'Downloads';
  }
```

- [ ] **Step 2: Subscribe to activity**

In `src/renderer/renderer.js`, next to the other `browserAPI.on*` subscriptions near the bottom (after `onIslandState`, ~line 299):

```js
  window.browserAPI.onDownloadsActivity((payload) => {
    downloadState = payload;
    renderDownloads();
  });
```

And call it once for the initial (hidden) state — right after the `pillActions.append(downloadsBtn);` line, add `renderDownloads();` (or leave the button `hidden = true` default; the explicit call keeps the ring var initialized).

- [ ] **Step 3: Style the progress ring**

In `src/renderer/styles.css`, add:

```css
.pill-download.active::before {
  content: '';
  position: absolute;
  inset: 2px;
  border-radius: 50%;
  background: conic-gradient(var(--accent) calc(var(--dl-progress, 0) * 360deg), var(--border) 0);
  -webkit-mask: radial-gradient(circle, transparent 8px, #000 9px);
  mask: radial-gradient(circle, transparent 8px, #000 9px);
}
.pill-download.active { color: var(--accent); }
```

- [ ] **Step 4: Relaunch and verify**

Run: `npm start`
Expected:
- No downloads button at rest.
- Start a download → the tray icon appears in the action cluster with a thin accent ring that fills as bytes arrive.
- On completion the ring clears but the button stays (recent). Click it → `blanc://downloads` opens and the button fades away (acknowledged). A new download re-shows it.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/renderer.js src/renderer/styles.css
git commit -m "Show a contextual downloads button in the island pill

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: Update project docs

**Files:**
- Modify: `CLAUDE.md` (pill description in the Architecture section; remove the renderer↔overlay `clusterTabs` sync note)

- [ ] **Step 1: Update the strip/pill description**

In `CLAUDE.md`, find the sentence describing the strip pill contents (currently: "…a slim (56px) band holding the resting island pill (tab dots, favicon, domain, shield count, private chip), window controls, and permission prompts.") and update the parenthetical to reflect the new anatomy:

> …a slim (56px) band holding the resting island pill (back/forward, the active group's tab dots with a capped overflow, favicon, domain, shield count, private chip, and a reload/favorite/downloads action cluster), window controls, and permission prompts.

- [ ] **Step 2: Update the tab-groups pill sentence**

Find the tab-groups sentence describing per-group dot clusters on the pill (currently: "The pill renders one dot cluster per group plus a trailing ungrouped cluster (non-active clusters dim; a collapsed non-active group folds into a bordered mini-dot capsule…)…") and replace it with the new behavior:

> The pill now renders **only the active tab's group** as dots (capped at 8 with a quiet `+N` that opens the panel) and shows the active group's name before the domain; pins and other groups live in the ⌘L panel (which already has a pinned section and per-group headers), not on the pill.

- [ ] **Step 3: Drop the stale sync note**

`renderer.js` no longer has a `clusterTabs` (removed in Task 1), so remove any "keep `clusterTabs` in sync between renderer.js and overlay.js" phrasing from `CLAUDE.md` if present, and confirm the code comment referencing it is gone from `renderer.js`. `overlay.js` keeps its own `clusterTabs` for the panel — that's fine and now independent.

- [ ] **Step 4: Verify wording**

Re-read the two edited paragraphs in `CLAUDE.md` end-to-end; confirm no dangling references to the pinned shelf, folded capsules, or dimmed clusters on the pill remain.

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md
git commit -m "Docs: describe the calmed island pill and its action cluster

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage (each spec section → task):**
- §3.2 nav → Task 2 ✓ · §3.3 active-group dots + cap/overflow → Task 1 ✓ · §3.4 identity (domain ellipsis) → Task 1 Step 3 ✓ · §3.5 reload/favorite → Task 3; downloads → Tasks 4-5 ✓ · §3.6 removed-from-pill → Task 1 ✓ · §3.7 width behavior (fixed cap + ellipsis, no budget engine) → Task 1 ✓ · §3.8 panel unchanged → no task (correct; already exists) ✓ · §4.2 downloads signal → Task 4 ✓ · §5 files → all covered · §6 edge cases (ungrouped/pinned-active) → Task 1 `activeGroupDots` filter ✓ · CLAUDE.md doc update → Task 6 ✓.
- Note: spec §3.7's *optional* narrow-window dot-cap reduction is intentionally omitted (marked optional/non-core); the domain ellipsis carries width pressure. Not a gap.

**Placeholder scan:** No TBD/TODO/"handle edge cases" — every code step has complete code. The only intentionally deferred verification detail (opening many tabs inside a group in Task 1 Step 4) gives a concrete fallback (exercise the ungrouped set).

**Type/name consistency:** `pillButton(iconKey, title, onClick)` and `PILL_ICONS` defined in Task 2, reused verbatim in Tasks 3 & 5. `downloadsActivity()` payload `{ active, hasRecent, receivedBytes, totalBytes }` is produced in Task 4 Step 1 and consumed with the same field names in Task 5 Step 1. `#pillNav` (Task 2), `#pillActions` (Task 3), `.pill-download` (Task 5) are consistent across HTML/JS/CSS. Channel names `chrome:downloads` / `chrome:downloads-ack` match between main.js (Task 4 Steps 3-4) and preload.js (Task 4 Step 5).
