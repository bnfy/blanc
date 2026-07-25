# URL bar context menu — design

**Date:** 2026-07-25
**Status:** approved, not yet implemented

## Problem

Right-clicking Blanc's address input does nothing. Electron ships no default
context menu, and `attachContextMenu` (`src/main/context-menu.js`) is wired only
to tab `webContents` (`main.js:1629`) — never to the overlay view that owns
`#addressInput`. Every other browser gives that field a menu; Blanc gives it a
dead click, and the standard Cut/Copy/Paste affordances are reachable only by
keyboard.

## Scope

A native context menu on `#addressInput` only. The find bar (`#findInput`) and
the inline group-name picker keep doing nothing on right-click, exactly as
today. Web content and the utility sheet are out of scope and unchanged.

## Menu

```
Undo
Redo
──────────────
Cut
Copy
Copy Clean Link
Paste
Paste and Go
Delete
──────────────
Select All
```

Enabled state comes from Blink's own `params.editFlags` (`canUndo`, `canRedo`,
`canCut`, `canCopy`, `canPaste`, `canDelete`, `canSelectAll`) — accurate rather
than inferred. Two items add their own condition:

- **Copy Clean Link** — enabled iff `cleanLink()` returns non-null for the
  active tab's URL.
- **Paste and Go** — enabled iff `editFlags.canPaste` **and**
  `clipboard.readText().trim()` is non-empty.

### Two deliberate omissions from Brave's menu

- **"Always Show Full URLs"** — Blanc has no URL elision to toggle.
  `addressDisplayValue()` (`overlay.js:125`) already returns `tab.url`
  verbatim, so the item would be a permanent no-op.
- **"Manage Search Engines and Site Search"** — Blanc offers four fixed engines
  chosen by radio button in Settings, with no custom or site-search engines to
  manage. There is nothing for the item to open that would justify its name.

## Architecture

### Targeting: suppress-by-default in the renderer

`src/renderer/overlay.js` gains one listener:

```js
document.addEventListener('contextmenu', (e) => {
  if (!e.target.closest('#addressInput')) e.preventDefault();
});
```

Cancelling the DOM `contextmenu` event stops Chromium from dispatching the
browser-side `context-menu` event, so only the address input ever reaches main.

This is why the design uses the `webContents` event rather than a bespoke IPC
message from the renderer: the event carries `editFlags` and the cursor
position, and it cannot race a separately-sent IPC message. No new preload
surface and no new IPC channel are needed.

### Module split

Pure logic is separated from the Electron shim so it runs under `node --test`
without Electron, following the `view-source.js` / `tabicons-model.js`
precedent.

| File | Role |
|---|---|
| `src/main/clean-link.js` *(new)* | pure `cleanLink(url)` → cleaned URL string, or `null` if not http(s) |
| `src/main/address-menu-model.js` *(new)* | pure `buildAddressMenu({ editFlags, clipboardText, tabUrl })` → array of `{ id, label, accelerator, enabled }` and `{ type: 'separator' }` descriptors |
| `src/main/address-menu.js` *(new)* | thin Electron layer: binds the `context-menu` event, feeds the model, maps `id` → action, pops the menu |
| `src/renderer/overlay.js` | the suppressing listener above |
| `src/main/main.js` | attach on `overlayView`, inject actions, blur guard, extract `navigateTabToAddress()` |
| `spec/features.md` | extend F19 |
| `spec/divergence-register.md` | new **D20** entry for the desktop-only URL-bar menu |
| `spec/parity-matrix.md` | F19 row: add D20 to its divergences column |

`address-menu.js` takes its actions as injected callbacks and does **not**
require `main.js`, mirroring how `context-menu.js` avoids that cycle.

### Actions

`Undo`, `Redo`, `Cut`, `Copy`, `Paste`, `Delete`, `Select All` call the
corresponding method on the overlay's `webContents` (`wc.undo()`, `wc.cut()`,
…). `Delete` removes the current selection. These are explicit calls rather
than menu roles, so they always target the overlay rather than whatever holds
focus — the same reasoning as `context-menu.js:47`.

Accelerators are displayed for the items that have a real keyboard equivalent —
`CmdOrCtrl+Z`, `Shift+CmdOrCtrl+Z`, `CmdOrCtrl+X`, `CmdOrCtrl+C`,
`CmdOrCtrl+V`, `CmdOrCtrl+A` — matching `context-menu.js`. Copy Clean Link,
Paste and Go, and Delete have no shortcut and show none; the menu is their only
entry point.

**Copy Clean Link** writes `cleanLink(activeTabUrl)` to the clipboard.

**Paste and Go** reads `clipboard.readText()` and routes it through the same
path as pressing Enter in the address bar.

### Copy Clean Link operates on the tab URL, not the field text

When the field is untouched the two are identical. When the user has typed a
search query, "cleaning" that string is meaningless — so the menu item reads
the active tab's URL and disables itself whenever that URL is not http(s)
(`blanc://` pages, `file://`, `view-source:`).

`cleanLink(url)`:

1. Returns `null` unless the URL parses and its protocol is `http:` or `https:`.
2. Deletes every query parameter whose lowercased name starts with `utm_`.
3. Deletes these exact parameters: `fbclid`, `gclid`, `dclid`, `gbraid`,
   `wbraid`, `msclkid`, `ttclid`, `twclid`, `igshid`, `yclid`, `mc_eid`,
   `_openstat`, `vero_id`, `s_cid`.
4. Drops a trailing bare `?` when stripping empties the query string.
5. Leaves the fragment untouched — fragments are load-bearing on many sites.

The list is deliberately conservative and curated. Over-stripping silently
breaks links, which is worse than leaving a tracker on one.

### Paste and Go reuses the existing navigation path

The `tabs:navigate` handler (`main.js:2044`) already performs exactly the
required sequence: `handOffToOs(url, { trusted: true })`, then
`normalizeAddressInput()`, then an `isUtilityUrl()` check that routes utility
addresses to the sheet instead of the tab, then `loadURL`. That body is
extracted into `navigateTabToAddress(id, rawText)`; the IPC handler and Paste
and Go both call it. Duplicating the sequence would let the two drift.

`trusted: true` is correct here for the same reason it is correct for typed
text: the navigation originates in an explicit user click on a menu item, not
in page-controlled content.

After navigating, Paste and Go dismisses the overlay — matching Enter.

### The blur guard

The overlay dismisses itself on `blur` in panel and palette modes
(`main.js:683`). A native menu takes OS focus, so without a guard the panel
would vanish the instant the menu opened, leaving the menu floating over
nothing.

`main.js` gains an `addressMenuOpen` flag, set immediately before
`Menu.popup()` and cleared in its `callback`. The `blur` handler returns early
while it is set. The callback also refocuses the overlay — but only if
`overlayMode` is still live, since Paste and Go deliberately closes it.

## Testing

**Unit (`node --test`):**

- `test/unit/clean-link.test.js` — `utm_*` prefix stripping; each exact
  parameter; non-tracking params preserved; fragment preserved; trailing `?`
  dropped; ordering of surviving params preserved; `null` for `blanc://`,
  `file://`, `view-source:`, and unparseable input; a URL with no query
  returned unchanged.
- `test/unit/address-menu-model.test.js` — item order and labels; every
  `editFlags` combination maps to the right enabled state; Copy Clean Link
  disabled for a non-http tab URL; Paste and Go disabled on empty clipboard
  even when `canPaste` is true.

**Manual (chrome changes cannot be verified by reload — the app must be
relaunched):**

- Right-click the address input with and without a selection.
- Right-click the find bar and the group-name picker — both stay dead.
- Confirm the panel stays open while the menu is up, and that the caret and
  selection survive after dismissing it.
- Paste and Go with a URL, with a search phrase, and with a `mailto:` URI.

## Non-goals

- No menu on web content changes (F19's existing tab menu is untouched).
- No menu for the utility sheet's internal pages.
- No search-engine management UI.
- No settings entry — the menu has no configurable behaviour.

## Substrate impact

None. No design tokens, no settings keys or enums, and no slash-command copy
change, so `npm run substrate:check` is unaffected.

## Parity

F19 gains the URL-bar variant, and its parity-matrix row picks up D20. That
entry records that the URL-bar menu is desktop-only: mobile has no pointer
right-click, and its address field
inherits the platform's own text-selection menu, so Cut/Copy/Paste/Select All
arrive for free while Copy Clean Link and Paste and Go have no mobile
equivalent in v1.
