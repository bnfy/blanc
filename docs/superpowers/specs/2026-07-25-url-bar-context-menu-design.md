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
  field's current text.
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

### Reading the field value

`params` does not carry the input's value, and Copy Clean Link operates on it
(below). The handler reads it on demand:

```js
const fieldText = await wc.executeJavaScript(
  'document.getElementById("addressInput")?.value ?? ""');
```

One awaited round-trip into Blanc's own chrome document, then the menu is
built and popped. This keeps the no-new-preload/no-race property above: a
renderer-side "report value on contextmenu" send would travel a different pipe
than the `context-menu` event with no ordering guarantee between them.

### Placement — mouse and keyboard

The menu pops at explicit coordinates rather than Electron's default
cursor position:

```js
menu.popup({ window: win, x: overlayBounds.x + params.x, y: overlayBounds.y + params.y });
```

`params.x/y` are overlay-webContents-relative, so they are offset by the
overlay view's bounds origin (popup coordinates are window-relative). This
makes keyboard invocation correct for free: Shift+F10 / the menu key fires the
same DOM `contextmenu` → browser `context-menu` chain with Chromium's
caret-anchored coordinates, so the menu lands at the field's caret instead of
wherever the mouse happens to be.

### Module split

Pure logic is separated from the Electron shim so it runs under `node --test`
without Electron, following the `view-source.js` / `tabicons-model.js`
precedent.

| File | Role |
|---|---|
| `src/main/clean-link.js` *(new)* | pure `cleanLink(text)` → cleaned URL string, or `null` if the text isn't an http(s) URL |
| `src/main/address-menu-model.js` *(new)* | pure `buildAddressMenu({ editFlags, clipboardText, fieldText })` → array of `{ id, label, accelerator, enabled }` and `{ type: 'separator' }` descriptors |
| `src/main/address-menu.js` *(new)* | thin Electron layer: binds the `context-menu` event, feeds the model, maps `id` → action, pops the menu |
| `src/renderer/overlay.js` | the suppressing listener above |
| `src/main/main.js` | attach on `overlayView`, inject actions, blur guard, extract `navigateTabToAddress()` |
| `spec/features.md` | extend F19 |
| `spec/divergence-register.md` | new **D20** entry for the desktop-only URL-bar menu |
| `spec/parity-matrix.md` | F19 row: add D20 to its divergences column |
| `spec/acceptance/navigation-and-context-menu.feature` | new `@F19-2`/`@F19-3` scenarios (below) |
| `spec/acceptance/index.md` | scenario rows for F19-2/F19-3, tagged D20 |

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

**Copy Clean Link** writes `cleanLink(fieldText)` to the clipboard.

**Paste and Go** reads `clipboard.readText()` and routes it through the same
path as pressing Enter in the address bar.

### Copy Clean Link operates on the visible field text

The item cleans what the user is looking at. When the field is untouched that
is the active tab's URL (`addressDisplayValue()` returns `tab.url` verbatim);
once the user has edited or typed, copying anything other than the visible
value would silently act on a different object than the one on screen.

`cleanLink(text)`:

1. Returns `null` unless the trimmed text parses as a URL with protocol
   `http:` or `https:` — so a typed search query, a scheme-less fragment of an
   address, a `blanc://` page, `file://`, and `view-source:` all disable the
   item rather than "cleaning" a non-link.
2. Deletes every query parameter whose name starts with `utm_` and each of
   these exact names: `fbclid`, `gclid`, `dclid`, `gbraid`, `wbraid`,
   `msclkid`, `ttclid`, `twclid`, `igshid`, `yclid`, `mc_eid`, `_openstat`,
   `vero_id`, `s_cid`. **All name matching is case-insensitive**
   (`UTM_SOURCE` and `FBCLID` are stripped too).
3. **Surviving parameters keep their original order and their original
   encoding.** The implementation splits the raw query string on `&` and
   filters segments — it must not round-trip through `URLSearchParams`, which
   re-encodes values (`%20`↔`+`, unreserved-character normalization) and would
   corrupt signed or encoding-sensitive URLs.
4. Drops a trailing bare `?` when stripping empties the query string.
5. Leaves the fragment untouched — fragments are load-bearing on many sites.

The list is deliberately conservative and curated, consistent with Brave's own
clean-link guidelines: a cleaned URL must retain functionality, and generic
parameters must not be stripped globally (Brave's larger production list leans
on domain scopes and exclusions to stay safe — machinery a v1 doesn't need).
Over-stripping silently breaks links, which is worse than leaving a tracker on
one.

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
`Menu.popup()` and cleared in its close `callback`. The `blur` handler returns
early while it is set.

The close callback must not blindly refocus Blanc — if the user switched apps
while the menu was open, stealing focus back would be hostile. On close:

- `!win.isFocused()` → `hideOverlay({ refocusContent: false })`: the window
  lost focus while the guard was suppressing the normal blur dismissal, so
  the callback performs the dismissal the guard swallowed, without touching
  focus.
- window still focused and `overlayMode` still live → refocus the overlay's
  `webContents` (the popup took focus from it).
- `overlayMode` gone (Paste and Go closed it) → nothing.

## Testing

**Unit (`node --test`):**

- `test/unit/clean-link.test.js` — `utm_*` prefix stripping; each exact
  parameter; case-insensitive matching (`UTM_SOURCE`, `FBCLID`); non-tracking
  params preserved in original order **with original encoding** (a `%20` /
  `+` / percent-encoded value survives byte-for-byte); fragment preserved;
  trailing `?` dropped; `null` for search-query text, `blanc://`, `file://`,
  `view-source:`, and unparseable input; a URL with no query returned
  unchanged.
- `test/unit/address-menu-model.test.js` — item order and labels; every
  `editFlags` combination maps to the right enabled state; Copy Clean Link
  disabled when `fieldText` isn't an http(s) URL; Paste and Go disabled on
  empty/whitespace clipboard even when `canPaste` is true.

**Acceptance (parity substrate):** two scenarios in
`spec/acceptance/navigation-and-context-menu.feature`, tagged `@desktop`
(never `@all` — the surface is desktop-only per D20) plus `@D20`:

- `@F19-2` — right-clicking the command bar over a URL with tracking
  parameters offers Copy Clean Link, and choosing it puts the URL minus
  `utm_*`/click-id parameters on the clipboard, other parameters intact.
- `@F19-3` — with a URL on the clipboard, Paste and Go navigates the active
  tab to it and closes the island.

Both get rows in `spec/acceptance/index.md` (✅ desktop only; the mobile
columns stay ⬜ n/a per D20). A native `Menu.popup()` cannot be driven by the
Playwright harness, so the desktop step definitions bind through the pure
layer — `buildAddressMenu()` + `cleanLink()` for F19-2's menu contents and
clipboard result, and the extracted `navigateTabToAddress()` via the test hook
for F19-3 — asserting the same observable outcomes the menu produces.

**Manual (chrome changes cannot be verified by reload — the app must be
relaunched):**

- Right-click the address input with and without a selection.
- Invoke via keyboard (Shift+F10 / menu key) — menu appears at the field's
  caret, not at the mouse position.
- Right-click the find bar and the group-name picker — both stay dead.
- Confirm the panel stays open while the menu is up, and that the caret and
  selection survive after dismissing it.
- Cmd-Tab to another app while the menu is open — Blanc must not steal focus
  back when the menu closes; the panel is dismissed.
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
