# Site Information in the Shield Popover — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fold connection information into the shipped shield popover so Blanc has one site-controls surface instead of two.

**Architecture:** A pure scheme mapping in `shield-model.js` plus a small `{ url, isLoading }` gate. Main derives `connection` **exactly once** per broadcast from the committed `webContents.getURL()`, serializes it onto the tab, and passes that already-derived value into `shieldPopoverModel()`, which only carries it through. The pill badge, the panel badge, and the new popover row are three renderings of that one value, so they cannot disagree.

**Tech Stack:** Electron 43.3.0, CommonJS main process, vanilla renderer JS, `node:test` unit tests, Cucumber + Playwright-Electron acceptance tests.

**Spec:** `docs/superpowers/specs/2026-08-08-site-info-in-shield-popover-design.md`

## Global Constraints

- Connection enum is exactly `'https' | 'http' | 'local' | null`. Never `'encrypted'` — the enum names schemes because the copy makes only a scheme-level claim.
- Row copy is exactly `Connection · Uses HTTPS`, `Connection · Not encrypted`, `Connection · Local`. Never "Encrypted connection".
- Popover header copy changes from `Protection` to `Ad & tracker blocking`.
- `SHIELD_POPOVER_HEIGHT` **stays 232**. It sizes the transparent overlay hit-test region, not the card. Raising it enlarges the click-swallowing area over the page.
- `connectionState(url)` is pure on the URL alone and returns only a scheme enum. It must never take `isLoading`.
- Connection is derived **once**, in `serializeTabs()`. Any second derivation is a bug.
- Loopback (`localhost`, `*.localhost`, `127.0.0.0/8`, `[::1]`) over HTTP is `'local'`, never `'http'`.
- Test-hook additions stay behind the existing `!app.isPackaged && process.env.BLANC_TEST === '1'` gate.
- Chrome HTML/CSS loads once at window creation — `Cmd+R` will not show chrome changes. Relaunch `npm start` to verify.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/main/shield-model.js` | Pure `connectionState(url)` and `connectionFor({url, isLoading})`; `shieldPopoverModel()` carries `connection` through. |
| `src/main/main.js` | Derive `tab.connection` in `serializeTabs()` from committed `getURL()`; trigger identity, re-anchoring, island-state payload, Escape reason. |
| `src/renderer/index.html` | `#pillInsecure` becomes a `<button>`. |
| `src/renderer/renderer.js` | Badge trigger; render badge from `tab.connection`; `aria-expanded`; Escape focus target. Delete local `connectionInsecure`. |
| `src/renderer/overlay.html` | `#shieldPopConnection` row; header copy. |
| `src/renderer/overlay.js` | Render row; render `panelInsecure` from `tab.connection`. Delete local `connectionInsecure`. |
| `src/renderer/styles.css` | Row styling; badge hit area and focus ring. |
| `src/main/test-hook.js` | Readers for the popover row, active trigger, focused element id. |
| `test/desktop/steps/runnable.steps.js` | Steps for the new scenarios. |
| `spec/acceptance/ad-blocking.feature` | `@F12-7`, `@F12-8`. |

---

## Task 1: Pure connection derivation

**Files:**
- Modify: `src/main/shield-model.js`
- Test: `test/unit/shield-model.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `connectionState(url) -> 'https' | 'http' | 'local' | null` and `connectionFor({ url, isLoading }) -> same`. Both exported from `src/main/shield-model.js`.

- [ ] **Step 1: Write the failing tests**

Append to `test/unit/shield-model.test.js`:

```js
const { connectionState, connectionFor } = require('../../src/main/shield-model');

test('connectionState maps schemes, not security properties', () => {
  assert.equal(connectionState('https://example.com/a'), 'https');
  assert.equal(connectionState('https://www.example.com/'), 'https');
  assert.equal(connectionState('http://neverssl.com/'), 'http');
});

test('connectionState treats loopback HTTP as local', () => {
  for (const url of [
    'http://localhost:3000/',
    'http://sub.localhost/',
    'http://127.0.0.1:8080/',
    'http://127.15.2.9/',
    'http://[::1]:5173/',
  ]) {
    assert.equal(connectionState(url), 'local', url);
  }
});

test('connectionState is null where no scheme claim can be made', () => {
  for (const url of ['blanc://newtab/', 'file:///tmp/a.html', 'not a url', '', null, undefined]) {
    assert.equal(connectionState(url), null, String(url));
  }
});

test('connectionFor withholds any claim while loading', () => {
  assert.equal(connectionFor({ url: 'https://example.com/', isLoading: true }), null);
  assert.equal(connectionFor({ url: 'http://neverssl.com/', isLoading: true }), null);
  assert.equal(connectionFor({ url: 'https://example.com/', isLoading: false }), 'https');
  assert.equal(connectionFor({ url: null, isLoading: false }), null);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm run test:unit`
Expected: FAIL — `connectionState is not a function`.

- [ ] **Step 3: Implement**

In `src/main/shield-model.js`, above `shieldChipState`:

```js
const LOOPBACK_V4 = /^127(?:\.\d{1,3}){3}$/;

function isLoopbackHost(host) {
  const h = String(host ?? '').toLowerCase();
  return h === 'localhost'
    || h.endsWith('.localhost')
    || h === '[::1]'
    || h === '::1'
    || LOOPBACK_V4.test(h);
}

/** Scheme-level connection claim. Pure on the URL: knows nothing about load
 * state. Named for schemes, not security properties — the address is all this
 * can prove, which is why the copy says "Uses HTTPS" and not "Encrypted". */
function connectionState(url) {
  if (typeof url !== 'string' || !url) return null;
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol === 'https:') return 'https';
  if (parsed.protocol !== 'http:') return null;
  return isLoopbackHost(parsed.hostname) ? 'local' : 'http';
}

/** The loading gate lives here, one layer above the pure mapping, so every
 * consumer inherits it from a single derivation. An absent claim beats a
 * stale one. */
function connectionFor({ url, isLoading }) {
  return isLoading ? null : connectionState(url);
}
```

Extend the export:

```js
module.exports = { shieldChipState, shieldPopoverModel, connectionState, connectionFor };
```

- [ ] **Step 4: Run to verify pass**

Run: `npm run test:unit`
Expected: PASS, count rises from 355 to 359.

- [ ] **Step 5: Commit**

```bash
git add src/main/shield-model.js test/unit/shield-model.test.js
git commit -m "feat(shield): pure connection derivation with a loading gate"
```

---

## Task 2: The popover model carries connection through

**Files:**
- Modify: `src/main/shield-model.js`
- Test: `test/unit/shield-model.test.js`

**Interfaces:**
- Consumes: `connectionFor` from Task 1 (not called here — the value arrives pre-derived).
- Produces: `shieldPopoverModel({ url, blockedCount, excepted, adblockEnabled, connection })` returns the existing shape plus `connection`, unmodified.

- [ ] **Step 1: Write the failing tests**

```js
test('popover model carries a supplied connection through unmodified', () => {
  for (const connection of ['https', 'http', 'local', null]) {
    const model = shieldPopoverModel({
      url: 'https://www.example.com/x', blockedCount: 3,
      excepted: false, adblockEnabled: true, connection,
    });
    assert.equal(model.connection, connection, String(connection));
  }
});

test('popover model does not re-derive connection from the url', () => {
  // http url, but main supplied https — the model must not "correct" it.
  const model = shieldPopoverModel({
    url: 'http://neverssl.com/', blockedCount: 0,
    excepted: false, adblockEnabled: true, connection: 'https',
  });
  assert.equal(model.connection, 'https');
});

test('popover model still normalizes the host', () => {
  const model = shieldPopoverModel({
    url: 'https://www.example.com/x', blockedCount: 0,
    excepted: false, adblockEnabled: true, connection: 'https',
  });
  assert.equal(model.host, 'example.com');
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm run test:unit`
Expected: FAIL — `model.connection` is `undefined`.

- [ ] **Step 3: Implement**

In `shieldPopoverModel`, accept `connection` and add it to all three returns:

```js
function shieldPopoverModel({ url, blockedCount, excepted, adblockEnabled, connection = null }) {
  const host = blockableHostname(url);
  if (!host) return null;
  if (excepted) {
    return { variant: 'site', host, on: false, countLine: 'Ads allowed on this site', connection };
  }
  if (!adblockEnabled) {
    return { variant: 'global-off', host, on: false, countLine: 'Ad blocking is off everywhere', connection };
  }
  const blocked = blockedCount ?? 0;
  const countLine = blocked === 0
    ? 'Nothing blocked on this page yet'
    : `${countPhrase(blocked)} blocked on this page`;
  return { variant: 'site', host, on: true, countLine, connection };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm run test:unit`
Expected: PASS, 362 tests.

- [ ] **Step 5: Commit**

```bash
git add src/main/shield-model.js test/unit/shield-model.test.js
git commit -m "feat(shield): carry connection through the popover model"
```

---

## Task 3: Derive tab.connection once, from the committed URL

**Files:**
- Modify: `src/main/main.js` (`serializeTabs`, `activeShieldPopover`)

**Interfaces:**
- Consumes: `connectionFor` from Task 1, `shieldPopoverModel` from Task 2.
- Produces: `tab.connection` on every `tabs:updated` payload entry; `shieldPopover.connection`.

**Why `getURL()` and not `rest.url`:** a tab is created carrying the *requested* URL (`main.js:1630`), and `main.js:639` warns the live url "may already read as the NEW site when did-start-navigation" fires. Deriving from stored state can assert HTTPS for a load that never committed.

- [ ] **Step 1: Add the import**

In `src/main/main.js` line 13, extend the existing require:

```js
const { shieldChipState, shieldPopoverModel, connectionFor } = require('./shield-model');
```

- [ ] **Step 2: Derive in `serializeTabs`**

`serializeTabs()` destructures `{ view, ...rest }`, so `view` is in scope. Inside the `.map()`, after the `shield` const:

```js
      // Connection is derived exactly once, here, from the COMMITTED url —
      // rest.url is the requested url at tab creation and can run ahead of a
      // navigation that has not landed. A destroyed or unattached view has no
      // committed url, which is null, which renders as no claim at all.
      let committedUrl = null;
      try {
        committedUrl = view?.webContents?.isDestroyed?.() ? null : view.webContents.getURL();
      } catch {
        committedUrl = null;
      }
      const connection = connectionFor({ url: committedUrl, isLoading: rest.isLoading });
```

Then add `connection` to **both** returns in that map:

```js
        return { ...rest, favicon: null, excepted, shield, connection };
      }
      return { ...rest, excepted, shield, connection };
```

- [ ] **Step 3: Pass it into the popover model**

Replace the body of `activeShieldPopover()` (`main.js:1049`):

```js
function activeShieldPopover() {
  const tab = activeTabId ? tabs.get(activeTabId) : null;
  if (!tab) return null;
  let committedUrl = null;
  try {
    committedUrl = tab.view?.webContents?.isDestroyed?.() ? null : tab.view.webContents.getURL();
  } catch {
    committedUrl = null;
  }
  return shieldPopoverModel({
    url: tab.url,
    blockedCount: tab.blockedCount,
    excepted: isHostnameExcepted(tab.url),
    adblockEnabled: settings.getSettings().adblockEnabled,
    connection: connectionFor({ url: committedUrl, isLoading: tab.isLoading }),
  });
}
```

- [ ] **Step 4: Verify nothing regressed**

Run: `npm run test:unit`
Expected: PASS, 362 tests. No behaviour is observable yet — nothing renders `connection`.

- [ ] **Step 5: Commit**

```bash
git add src/main/main.js
git commit -m "feat(shield): derive tab.connection once from the committed url"
```

---

## Task 4: Render the row and change the header copy

**Files:**
- Modify: `src/renderer/overlay.html`, `src/renderer/overlay.js`, `src/renderer/styles.css`

**Interfaces:**
- Consumes: `state.shieldPopover.connection` from Task 3.
- Produces: `#shieldPopConnection` in the DOM, hidden when `connection` is null.

- [ ] **Step 1: Add the row and change the header**

In `src/renderer/overlay.html`, inside `#shieldPop`, change the header text and add the row above `#shieldPopCount`:

```html
        <div class="shield-pop-state">Ad &amp; tracker blocking <strong id="shieldPopOnOff">on</strong></div>
```

```html
    <div id="shieldPopConnection" hidden></div>
    <div id="shieldPopCount"></div>
```

- [ ] **Step 2: Render it**

In `src/renderer/overlay.js`, next to the other shield element lookups:

```js
  const shieldPopConnection = document.getElementById('shieldPopConnection');
```

Add the label map near the top of the shield rendering code:

```js
  // Scheme-level labels. "Uses HTTPS", never "Encrypted connection" — the
  // scheme proves the address, not a negotiated and verified session.
  const CONNECTION_LABEL = {
    https: 'Connection · Uses HTTPS',
    http: 'Connection · Not encrypted',
    local: 'Connection · Local',
  };
```

Where the popover renders, set it:

```js
    const label = CONNECTION_LABEL[popover.connection] ?? null;
    shieldPopConnection.textContent = label ?? '';
    shieldPopConnection.hidden = !label;
    shieldPopConnection.classList.toggle('insecure', popover.connection === 'http');
```

- [ ] **Step 3: Style it**

In `src/renderer/styles.css`, after the `#shieldPopCount` rule:

```css
#shieldPopConnection {
  margin-top: 10px;
  color: var(--text-dim);
}
#shieldPopConnection.insecure { color: var(--danger); }
#shieldPopConnection[hidden] { display: none; }
```

- [ ] **Step 4: Verify visually — the 232 no-clipping condition**

Relaunch (`npm start` — `Cmd+R` will not reload chrome). Open an HTTPS page, click the shield.

Expected: the card shows `Connection · Uses HTTPS` above the count line, and **the card is not clipped**. `SHIELD_POPOVER_HEIGHT` stays 232; only raise it if the rendered card actually clips, and then by the measured overflow. Check light and dark.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/overlay.html src/renderer/overlay.js src/renderer/styles.css
git commit -m "feat(shield): show the connection row and name the toggle blocking-specific"
```

---

## Task 5: The insecure badge becomes a trigger

**Files:**
- Modify: `src/renderer/index.html`, `src/renderer/styles.css`

**Interfaces:**
- Produces: `#pillInsecure` as a `<button type="button">` with `aria-expanded`.

- [ ] **Step 1: Convert the element**

In `src/renderer/index.html:30`, replace the `<span>` with a button:

```html
        <button id="pillInsecure" class="insecure-badge" type="button" aria-expanded="false" aria-label="Not secure — this site uses an unencrypted connection. Open site controls." title="Not secure — this site uses an unencrypted connection (HTTP)" hidden>
          <svg viewBox="0 0 16 16"><rect x="3.25" y="7.25" width="9.5" height="6" rx="1.75"/><path d="M5.5 7.25V4.9a2.6 2.6 0 0 1 5.1-.72"/></svg>
        </button>
```

- [ ] **Step 2: Give it a real hit target without moving the layout**

The glyph is 13×13 (`styles.css:906`). Pad to ≥24×24 and pull the padding back out with negative margin so the resting pill does not shift:

```css
button.insecure-badge {
  appearance: none;
  background: none;
  border: 0;
  padding: 6px;
  margin: -6px;
  cursor: pointer;
  border-radius: 6px;
}
button.insecure-badge:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 1px;
}
```

- [ ] **Step 3: Verify**

Relaunch, visit `http://neverssl.com`. Expected: the badge looks unchanged and the pill layout is identical to before; tabbing to it shows a focus ring; the clickable area is visibly larger than the glyph.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/index.html src/renderer/styles.css
git commit -m "feat(shield): make the not-secure badge a real button with a 24px target"
```

---

## Task 6: Trigger identity and re-anchoring

**Files:**
- Modify: `src/main/main.js`, `src/renderer/renderer.js`

**Interfaces:**
- Consumes: `#pillInsecure` from Task 5.
- Produces: `chrome:open-shield` accepts `{ right, trigger }` where `trigger` is `'shield' | 'insecure'`; main tracks `shieldTrigger`.

**The trap:** updating only the stored trigger passes state assertions while leaving the card visually unmoved. Re-anchoring **must** move the overlay bounds.

- [ ] **Step 1: Track the trigger and re-anchor in main**

Beside `let shieldPopoverHost = null;` (`main.js:641`):

```js
let shieldTrigger = null;
```

Replace the `chrome:open-shield` handler (`main.js:2572`):

```js
  chromeOn('chrome:open-shield', (_e, anchor) => {
    const trigger = anchor?.trigger === 'insecure' ? 'insecure' : 'shield';
    if (overlayMode === 'shield') {
      // Same control toggles shut. A DIFFERENT control re-anchors instead —
      // closing there would read as the button being broken.
      if (trigger === shieldTrigger) return hideOverlay({ refocusContent: false });
      shieldAnchorRight = Number.isFinite(anchor?.right) ? anchor.right : null;
      shieldTrigger = trigger;
      // Bounds must move now; updating stored state alone leaves the card put.
      overlayView.setBounds(overlayBounds());
      win.webContents.send('chrome:island-state', { mode: 'shield', trigger });
      return;
    }
    const popover = activeShieldPopover();
    if (!popover) return;
    shieldPopoverHost = popover.host;
    shieldAnchorRight = Number.isFinite(anchor?.right) ? anchor.right : null;
    shieldTrigger = trigger;
    broadcastTabs();
    showOverlay('shield');
  });
```

Clear it wherever the other shield state is cleared, in `hideOverlay()` (`main.js:805`):

```js
  shieldPopoverHost = null;
  shieldTrigger = null;
```

- [ ] **Step 2: Send the trigger from both controls**

In `src/renderer/renderer.js`, alongside the existing `pillShield` click handler, pass a trigger and add the badge:

```js
  pillShield.addEventListener('click', (e) => {
    e.stopPropagation();
    const r = pillShield.getBoundingClientRect();
    window.browserAPI.openShieldPopover({ right: r.right, trigger: 'shield' });
  });

  pillInsecure.addEventListener('click', (e) => {
    // Without this the click also reaches the pill and opens the panel.
    e.stopPropagation();
    const r = pillInsecure.getBoundingClientRect();
    window.browserAPI.openShieldPopover({ right: r.right, trigger: 'insecure' });
  });
```

- [ ] **Step 3: Verify re-anchoring moves the card**

Relaunch, visit `http://neverssl.com`. Click the shield — the card opens right-aligned to the shield. Now click the "Not secure" badge **without closing**.

Expected: the card **moves** left, under the badge. It must not close, and it must not stay where it was.

- [ ] **Step 4: Commit**

```bash
git add src/main/main.js src/renderer/renderer.js
git commit -m "feat(shield): two triggers, with re-anchoring that actually moves the card"
```

---

## Task 7: aria-expanded on both controls

**Files:**
- Modify: `src/main/main.js`, `src/renderer/renderer.js`

**Interfaces:**
- Consumes: `shieldTrigger` from Task 6.
- Produces: `chrome:island-state` payload becomes `{ mode, trigger }`.

- [ ] **Step 1: Put the trigger on the island-state payload**

In `showOverlay()` (`main.js:798`):

```js
  win.webContents.send('chrome:island-state', { mode, trigger: mode === 'shield' ? shieldTrigger : null });
```

In `hideOverlay()` (`main.js:813`):

```js
    win.webContents.send('chrome:island-state', { mode: null, trigger: null });
```

- [ ] **Step 2: Reflect it in the strip**

In `src/renderer/renderer.js`, where `chrome:island-state` is handled:

```js
    const shieldOpen = mode === 'shield';
    pillShield.setAttribute('aria-expanded', String(shieldOpen && trigger === 'shield'));
    pillInsecure.setAttribute('aria-expanded', String(shieldOpen && trigger === 'insecure'));
```

- [ ] **Step 3: Verify**

Relaunch, open an HTTP page, click the shield. In the chrome devtools inspector, expect `#pillShield[aria-expanded="true"]` and `#pillInsecure[aria-expanded="false"]`. Click the badge; expect them to swap. Close; expect both `false`.

- [ ] **Step 4: Commit**

```bash
git add src/main/main.js src/renderer/renderer.js
git commit -m "feat(shield): report the active trigger so aria-expanded is correct"
```

---

## Task 8: Escape returns focus to the trigger

**Files:**
- Modify: `src/main/main.js`, `src/renderer/renderer.js`

**Interfaces:**
- Consumes: `shieldTrigger` from Task 6, island-state payload from Task 7.
- Produces: `hideOverlay({ reason })`; island-state gains `reason`.

**Ordering trap:** the strip's `.focus()` call runs in the chrome document. If the chrome `webContents` is not itself focused — the overlay had focus and was just removed — a DOM focus call lands in an unfocused document and the user sees no focus ring. **Main must focus the chrome `webContents` first.**

- [ ] **Step 1: Give hideOverlay a reason and focus the chrome first**

Change the signature and the send in `hideOverlay()`:

```js
function hideOverlay({ refocusContent = true, reason = null } = {}) {
  if (!overlayMode) return;
  const closingMode = overlayMode;
  const closingTrigger = shieldTrigger;
  overlayMode = null;
  shieldAnchorRight = null;
  shieldPopoverHost = null;
  shieldTrigger = null;
  if (activeTabId) tabsWantingAddressBarFocus.delete(activeTabId);
  if (hasLiveWindow() && overlayView) {
    win.contentView.removeChildView(overlayView);
    overlayView.webContents.send('overlay:hide');
    const restoreTrigger = reason === 'escape' && closingMode === 'shield' ? closingTrigger : null;
    if (restoreTrigger) {
      // The chrome document must hold focus before it can move focus within
      // itself; the overlay had it until the line above.
      win.webContents.focus();
    }
    win.webContents.send('chrome:island-state', { mode: null, trigger: null, reason, restoreTrigger });
    if (refocusContent && !restoreTrigger) tabs.get(activeTabId)?.view.webContents.focus();
  }
}
```

- [ ] **Step 2: Pass the reason from the Escape handler**

At `main.js:716`:

```js
    if (overlayMode && input.type === 'keyDown' && input.key === 'Escape') {
```

Change its `hideOverlay(...)` call to include the reason, e.g. `hideOverlay({ refocusContent: true, reason: 'escape' })`.

- [ ] **Step 3: Restore focus in the strip**

In the `chrome:island-state` handler in `renderer.js`, after the `aria-expanded` updates:

```js
    if (restoreTrigger === 'shield') pillShield.focus();
    else if (restoreTrigger === 'insecure') pillInsecure.focus();
```

- [ ] **Step 4: Verify**

Relaunch, open `http://neverssl.com`. Tab to the badge, press Enter to open, press Escape.

Expected: the popover closes and the **badge** has a visible focus ring. Repeat from the shield; focus returns to the shield. Confirm Escape from the ⌘L panel still behaves exactly as before.

- [ ] **Step 5: Commit**

```bash
git add src/main/main.js src/renderer/renderer.js
git commit -m "feat(shield): Escape returns focus to the trigger that opened the popover"
```

---

## Task 9: Delete the duplicated predicate

**Files:**
- Modify: `src/renderer/renderer.js`, `src/renderer/overlay.js`

**Interfaces:**
- Consumes: `tab.connection` from Task 3.

`connectionInsecure()` exists twice — `renderer.js:175` and `overlay.js:166` — the second literally commented "(Keep in sync with renderer.js.)". Both go.

- [ ] **Step 1: Render both badges from the shipped value**

`renderer.js:396`:

```js
    pillInsecure.hidden = tab?.connection !== 'http';
```

`overlay.js:231`:

```js
    panelInsecure.hidden = tab?.connection !== 'http';
```

The `isLoading` guard is inherited: `connection` is null while loading.

- [ ] **Step 2: Delete both function definitions**

Remove `function connectionInsecure(url) { ... }` from `renderer.js` and from `overlay.js`, including the "(Keep in sync…)" comment.

- [ ] **Step 3: Verify no references survive**

Run: `grep -rn "connectionInsecure" src/`
Expected: no output.

- [ ] **Step 4: Verify behaviour**

Relaunch. `http://neverssl.com` → badge on pill and in the ⌘L panel. `https://example.com` → no badge. `http://localhost:PORT` → **no badge**. Reload a slow page → no badge flicker mid-load.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/renderer.js src/renderer/overlay.js
git commit -m "refactor(shield): one connection value feeds all three render sites"
```

---

## Task 10: Acceptance harness

**Files:**
- Modify: `src/main/test-hook.js`, `test/desktop/steps/runnable.steps.js`

**Interfaces:**
- Produces: `__blanc.shieldPopoverDom()`, `__blanc.clickInsecureBadge()`, `__blanc.chromeFocusedId()`.

All additions sit inside the existing `install(refs)` body, which is only reachable behind `!app.isPackaged && process.env.BLANC_TEST === '1'`.

- [ ] **Step 1: Add the readers**

In `src/main/test-hook.js`, in the returned object:

```js
    shieldPopoverDom() {
      const wc = getOverlayWebContents();
      if (!wc) return null;
      return wc.executeJavaScript(`(() => {
        const row = document.getElementById('shieldPopConnection');
        return {
          hidden: document.getElementById('shieldPop')?.hidden ?? true,
          connection: row?.hidden ? null : (row?.textContent ?? null),
          header: document.querySelector('.shield-pop-state')?.textContent ?? '',
        };
      })()`);
    },
    clickInsecureBadge() {
      return win.webContents.executeJavaScript(`(() => {
        const b = document.getElementById('pillInsecure');
        if (!b || b.hidden) return false;
        b.click();
        return true;
      })()`);
    },
    chromeFocusedId() {
      return win.webContents.executeJavaScript(
        `(() => document.activeElement?.id ?? null)()`
      );
    },
    shieldAriaExpanded() {
      return win.webContents.executeJavaScript(`(() => ({
        shield: document.getElementById('pillShield')?.getAttribute('aria-expanded') ?? null,
        insecure: document.getElementById('pillInsecure')?.getAttribute('aria-expanded') ?? null,
      }))()`);
    },
```

If `getOverlayWebContents` does not already exist in the hook, add it next to `getUtilitySheetWebContents` using the same pattern, returning the overlay view's `webContents`.

- [ ] **Step 2: Verify the gate is intact**

Run: `grep -n "BLANC_TEST" src/main/main.js`
Expected: the `!app.isPackaged && process.env.BLANC_TEST === '1'` install condition is unchanged.

- [ ] **Step 3: Commit**

```bash
git add src/main/test-hook.js
git commit -m "test(shield): harness readers for the connection row and trigger focus"
```

---

## Task 11: The two contract scenarios

**Files:**
- Modify: `spec/acceptance/ad-blocking.feature`, `test/desktop/steps/runnable.steps.js`, `test/desktop/cucumber.mjs`, `spec/acceptance/index.md`

- [ ] **Step 1: Write the scenarios**

Append to `spec/acceptance/ad-blocking.feature`:

```gherkin
  @F12-7 @F12 @desktop
  Scenario: The HTTP warning badge opens site controls
    Given I am on an unencrypted page
    When I open site controls from the warning badge
    Then site controls report the connection is not encrypted

  @F12-8 @F12 @all
  Scenario: Site controls report an HTTPS connection
    Given I am on an encrypted page
    When I open site controls
    Then site controls report the connection uses HTTPS
```

`@F12-8` is phrased "open site controls", not "via the shield", so mobile can meet the same contract through its own affordance later.

- [ ] **Step 2: Add the tags**

`test/desktop/cucumber.mjs`, in `RUNNABLE` after `'@F12-3', '@F12-4', '@F12-5', '@F12-6',`:

```js
  '@F12-7', '@F12-8',
```

Add both rows to `spec/acceptance/index.md` with `D2` in the divergence column, matching the neighbouring F12 rows.

- [ ] **Step 3: Write the steps**

In `test/desktop/steps/runnable.steps.js`:

```js
Given('I am on an unencrypted page', async function () {
  await this.call('openUrl', this.fixtureUrl('/plain.html').replace('https://', 'http://'));
  await waitForValue(() => this.call('shieldAriaExpanded'), (v) => v?.insecure === 'false',
    'the not-secure badge to render');
});

Given('I am on an encrypted page', async function () {
  await this.call('openUrl', this.fixtureUrl('/plain.html'));
});

When('I open site controls from the warning badge', async function () {
  assert.equal(await this.call('clickInsecureBadge'), true);
});

When('I open site controls', async function () {
  await this.call('openShieldPopover');
});

Then('site controls report the connection is not encrypted', async function () {
  const dom = await waitForValue(() => this.call('shieldPopoverDom'),
    (v) => v && v.hidden === false, 'the shield popover to render');
  assert.equal(dom.connection, 'Connection · Not encrypted');
  assert.match(dom.header, /Ad & tracker blocking/);
});

Then('site controls report the connection uses HTTPS', async function () {
  const dom = await waitForValue(() => this.call('shieldPopoverDom'),
    (v) => v && v.hidden === false, 'the shield popover to render');
  assert.equal(dom.connection, 'Connection · Uses HTTPS');
});
```

Reuse the existing fixtures server and `openUrl`/`openShieldPopover` helpers already used by `@F12-6`; if `openShieldPopover` is not yet a hook method, add it in Task 10's style, clicking `#pillShield`.

- [ ] **Step 4: Run**

Run: `npm run test:acceptance:dry`
Expected: 63 scenarios, 0 undefined.

Run: `npx cucumber-js -c test/desktop/cucumber.mjs -p runnable --tags "@F12-7 or @F12-8"`
Expected: 2 scenarios passing.

- [ ] **Step 5: Commit**

```bash
git add spec/acceptance/ad-blocking.feature spec/acceptance/index.md test/desktop/cucumber.mjs test/desktop/steps/runnable.steps.js
git commit -m "test(shield): F12-7/F12-8 connection contract scenarios"
```

---

## Task 12: Interaction coverage

**Files:**
- Modify: `spec/acceptance/ad-blocking.feature`, `test/desktop/steps/runnable.steps.js`, `test/desktop/cucumber.mjs`, `spec/acceptance/index.md`

None of re-anchoring, Escape focus, or `aria-expanded` is observable from unit tests.

- [ ] **Step 1: Write the scenario**

```gherkin
  @F12-9 @F12 @desktop
  Scenario: Site controls follow the control that opened them
    Given I am on an unencrypted page
    When I open site controls
    Then only the shield reports itself expanded
    When I open site controls from the warning badge
    Then site controls stay open and move to the warning badge
    And only the warning badge reports itself expanded
    When I dismiss site controls with Escape
    Then focus returns to the warning badge
```

- [ ] **Step 2: Write the steps**

```js
Then('only the shield reports itself expanded', async function () {
  const v = await waitForValue(() => this.call('shieldAriaExpanded'),
    (x) => x?.shield === 'true', 'the shield to report expanded');
  assert.equal(v.insecure, 'false');
});

Then('site controls stay open and move to the warning badge', async function () {
  const before = this.shieldBoundsBefore;
  const after = await waitForValue(() => this.call('overlayBounds'),
    (b) => b && b.x !== before?.x, 'the popover to re-anchor');
  assert.ok(after.x < before.x, 'popover should move toward the badge');
});

Then('only the warning badge reports itself expanded', async function () {
  const v = await waitForValue(() => this.call('shieldAriaExpanded'),
    (x) => x?.insecure === 'true', 'the badge to report expanded');
  assert.equal(v.shield, 'false');
});

When('I dismiss site controls with Escape', async function () {
  await this.call('pressEscape');
});

Then('focus returns to the warning badge', async function () {
  await waitForValue(() => this.call('chromeFocusedId'),
    (id) => id === 'pillInsecure', 'focus to return to the badge');
});
```

Capture `this.shieldBoundsBefore = await this.call('overlayBounds')` inside the "When I open site controls" step. Add an `overlayBounds()` hook reader returning `overlayView.getBounds()`, and a `pressEscape()` reader sending an Escape `keyDown` via `sendInputEvent`, both in Task 10's style.

- [ ] **Step 3: Add the tag and index row**

Add `'@F12-9',` to `RUNNABLE` and a row to `spec/acceptance/index.md`.

- [ ] **Step 4: Run**

Run: `npx cucumber-js -c test/desktop/cucumber.mjs -p runnable --tags "@F12-9"`
Expected: 1 scenario passing. The re-anchor assertion is the one that catches "stored trigger updated but bounds never moved".

- [ ] **Step 5: Commit**

```bash
git add spec/acceptance/ad-blocking.feature spec/acceptance/index.md test/desktop/cucumber.mjs test/desktop/steps/runnable.steps.js src/main/test-hook.js
git commit -m "test(shield): cover re-anchoring, aria-expanded, and Escape focus return"
```

---

## Task 13: Spec text and full verification

**Files:**
- Modify: `spec/features.md`

- [ ] **Step 1: Describe the row in F12**

In `spec/features.md` under F12, add:

```markdown
- The popover also states the connection at scheme level — `Uses HTTPS`,
  `Not encrypted`, or `Local` — and says nothing at all while a load is
  uncommitted. It does not inspect certificates, so it cannot distinguish a
  public CA from a locally-trusted proxy, and mixed content is not reflected.
```

**No divergence-register entry.** `parity-matrix.md:17` (F1) and `:28` (F12) already record the popover as desktop. Add a `D#` only when mobile's alternative interaction is deliberately chosen.

- [ ] **Step 2: Run every gate**

```bash
npm run test:unit
npm run substrate:check
npm run test:acceptance:dry
npm run test:acceptance:desktop
```

Expected: unit 362+ passing; substrate 4/4 OK; dry 64 scenarios / 0 undefined; desktop all passing. The suite carries `retry: 1`, so a scenario that fails once and passes on retry is a pre-existing flake — re-run the full suite to confirm it is not yours.

- [ ] **Step 3: Confirm the height decision held**

If `SHIELD_POPOVER_HEIGHT` is still 232, state that in the PR. If Task 4's visual check forced a raise, state the measured overflow and the new value, and explain why the card could not fit.

- [ ] **Step 4: Commit and open the PR**

```bash
git add spec/features.md
git commit -m "docs(shield): record the connection row in the F12 contract"
```

PR body must cover: the scheme-level claim and why the copy is not "Encrypted"; the single-derivation guarantee; the header rename as necessary disambiguation; the `232` decision and its page-clickability rationale; and the mixed-content and certificate-identity limitations.

---

## Self-Review

**Spec coverage.** Connection enum → Task 1. Copy → Tasks 1, 4. Header rename → Task 4. Single derivation → Tasks 2, 3. Committed URL + unavailable `getURL()` → Task 3. Loading gate → Tasks 1, 3. Three render sites and duplicate deletion → Task 9. Badge button, hit area, focus ring → Task 5. Trigger identity and re-anchoring → Task 6. `aria-expanded` → Task 7. Escape focus with chrome-first ordering → Task 8. Height held at 232 with visual condition → Tasks 4, 13. `@F12-7 @desktop` / `@F12-8 @all` → Task 11. Interaction coverage → Task 12. Harness files named → Tasks 10, 12. No divergence entry → Task 13. Limitations → Task 13.

**Placeholders.** None. Every code step carries real code.

**Type consistency.** `connectionState(url)` and `connectionFor({url, isLoading})` are used with those exact signatures in Tasks 1, 2, 3. `connection` is the property name throughout main, the model, the payload, and both renderers. `trigger` values are `'shield' | 'insecure'` in Tasks 6, 7, 8, 12. `restoreTrigger` appears only in Task 8, produced by main and consumed by the strip in the same task.
