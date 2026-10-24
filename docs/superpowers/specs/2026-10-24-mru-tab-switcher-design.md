# Ctrl-Tab by most recent use

**Date:** 2026-10-24
**Status:** draft for the owner's review. Not yet implemented; nothing here has been seen by the owner. The decisions it needs are in §11.
**Builds on:** the per-window activation history (`src/main/tab-activation.js`, which already powers ⌥⌘Z and the close-tab survivor rule), the overlay view (`src/renderer/overlay.js`), the shared browser-command table (`src/main/browser-shortcuts.js`) and the Windows/Linux shortcut router (`installBrowserShortcuts`).
**Reference:** Arc, Firefox (*Ctrl+Tab cycles through tabs in recently used order*, on by default since Firefox 61) and every desktop window switcher (⌘-Tab, Alt-Tab). Chrome and Safari switch by position. The request came from r/ArcBrowser on 2026-10-24 (*"Ctrl-Tab for Most Recently Used tab switcher. This is probably the most irritating. Remembering the exact location of the last used tab is such a bad UX."*), asked of people who left Arc for Chrome.

## 1. Problem

Ctrl+Tab in Blanc moves to the next tab by position (`cycleTab` in `main.js`). After a dozen tabs that is a tab the person has not thought about, not the one they were just reading. The habit people bring from Arc, Firefox and the OS is the other one: press once to go back to the last tab, press again to go further back, let go to land. Blanc keeps everything needed for that already: each window records its tabs in activation order, most recent last, and ⌥⌘Z (macOS only) uses it to swap between the last two. It stops at two, and only on the Mac.

## 2. The model in one paragraph

Holding **Ctrl** and pressing **Tab** steps back through the window's tabs in the order they were last used: once for the previous tab, again for the one before that. While Ctrl is held, a small **switcher** card shows the candidates with the current pick marked. **Shift+Tab** steps the other way. **Letting go of Ctrl** switches to the pick; **Esc** cancels and stays put. The pick is made when Ctrl is released, not on each Tab, so stepping past three tabs costs nothing and renders nothing but the card. A single tap of Ctrl+Tab (press and release at once) therefore goes to the previous tab, which is the ⌥⌘Z swap on every platform, and tapping it again comes back.

## 3. Behavior contract

### 3.1 Keys

| Key | While the card is closed | While the card is open |
|---|---|---|
| Ctrl+Tab | opens the card on the previous tab | moves the pick one step older |
| Ctrl+Shift+Tab | opens the card on the oldest tab | moves the pick one step newer |
| Ctrl released | — | switches to the pick, closes the card |
| Esc | — | closes the card, nothing changes |
| Ctrl+W (Ctrl held) | — | closes the picked tab, the pick moves one step older (as ⌘-Tab's Q does) |
| Ctrl+1–9, ⌘1–9 | unchanged | ignored |
| Ctrl+PageDown / PageUp | next / previous tab **by position** | ignored |
| click on a card entry | — | switches to it at once |
| click anywhere else | — | cancels |

- Ctrl+PageDown and Ctrl+PageUp keep positional cycling on every platform, so the order of the tab list stays reachable from the keyboard; today they are silent aliases of Ctrl+Tab, and under this design they stop being aliases (§5).
- On macOS the Tab menu's **Next Tab** / **Previous Tab** items take the new meaning with their existing Ctrl+Tab / Ctrl+Shift+Tab accelerators. Their labels change to **Previous Used Tab** / **Next Used Tab**? No: the labels stay, the behaviour note moves to the Shortcuts page (D2 in §11 asks which labels the owner prefers).
- ⌥⌘Z stays as it is. A person who only ever taps Ctrl+Tab gets the same result from either.

### 3.2 Order

- The order is the window runtime's `activationHistory` (most recent last), read backwards, with the current tab first and then every live tab of the window that the history names, followed by tabs the history has never seen (restored tabs that were never selected) in tab-order. Tabs no longer in the window are skipped; the history is already pruned on close and on move.
- **One window.** The card never lists another window's tabs. Each window has its own history, and Ctrl+Tab in Chrome, Firefox and Arc is a window-local key.
- **One space.** Tabs parked in another space are not in `tabs` for this window, so they never appear.
- **Splits are one entry** (F53): a split appears once, at the position of its most recently focused pane, drawn as its panes' favicons; landing on it shows the split with that pane focused. Switching between panes of a visible split is pane focus (Split View's own keys), not Ctrl+Tab.
- **Glance** (F34): the Glance tab is in the window's tab list and appears in the order like any tab; landing on it does what selecting it in the panel does (ends the Glance and makes that page current). Opening the card does not close an open Glance; landing anywhere else does, as every tab switch does.
- **Collapsed groups** hide nothing from the order. Landing in a collapsed group unfolds it, as ⌘1–9 does (`focusGroup`).
- Pinned tabs are ordinary entries. Private tabs are ordinary entries and keep their private chip in the card.
- **Quiet tabs** (F31) appear with their remembered title and icon. Stepping over a quiet tab in the card never wakes it; only landing on it does, through the ordinary `setActiveTab` wake. A tab marked for inherited document policy appears and lands inert as it would from the panel.

### 3.3 The card

- A single row of up to 8 favicon tiles with the picked tile raised and its title and host beneath, in the overlay view, anchored under the Island where the panel opens (the same anchor as `'panel'`/`'palette'`; no scrim). Beyond 8 entries the row scrolls so the pick stays in view; a `+N` is not needed since the pick is always shown.
- It opens on the second step, not the first: a quick tap must not flash a card. Concretely, the card is shown when Ctrl is still held 150 ms after the first Tab, or at once on the second Tab, whichever is first. Reduce Motion drops its fade.
- The card never takes keyboard focus from the page while it is open: every key is read in the main process (`before-input-event`), as the shortcuts already are, and the page's own focus stays where it was. On landing, focus goes to the new tab's content as a click in the panel would give it; on cancel nothing moves.
- Auto-hide (F-floating Island): the card is an Island surface, so it pins the Island open while shown, like the panel.

### 3.4 Detecting the release

This is the part that decides whether the feature exists.

- Windows and Linux already route Ctrl+Tab through `installBrowserShortcuts` on every chrome, overlay, sheet, permission and tab webContents (`before-input-event`). The same listeners receive `keyUp` for `Control` (tab-view.js tracks held modifiers this way for gestures). The switcher is a small state machine in main: *closed → stepping (Ctrl held) → landed or cancelled*. It arms on the first Ctrl+Tab and listens for `Control` `keyUp` on **every** webContents of the window, not only the one that saw the Tab, because Electron's menu accelerator path (macOS) delivers the Tab without an input event and the release arrives at whichever surface has focus.
- macOS: Ctrl+Tab is a menu accelerator (`command('next-tab')`), so the Tab press arrives as a menu `click`, not as a key event. The release is still a `keyUp` on the focused webContents' `before-input-event`. The window's `before-input-event` listeners are installed on every surface already (`installChromeShortcuts`), so the state machine subscribes there for `Control` up while armed.
- **Focus outside any webContents** (a native dialog, the menu bar opened with the mouse, a popup window): no `keyUp` arrives. The card then stays open until Esc, a click, or the next Ctrl+Tab, and `powerMonitor`/window `blur` cancels it. It never lands on its own by timer; a timer would switch tabs under a person who is still reading the card.
- **Repeat.** Holding Tab auto-repeats; repeats step the pick (unlike Ctrl+W, where repeats are swallowed). Holding Ctrl alone does nothing.
- **Held firewall.** A parked (Recently closed) guest already consumes these accelerators without acting (`installHeldFirewall`); unchanged.
- The spike in §10 proves release delivery on all three platforms before any UI is built. If a platform cannot deliver `Control` `keyUp` reliably, that platform keeps positional Ctrl+Tab and says so in D-register, and the design does not ship a timer there.

### 3.5 Setting

- **Settings → General → Switch tabs with Ctrl+Tab:** *In the order you used them* (default) / *In the order of the tab list*. Device-local like the Island's auto-hide (not in `SYNCED_KEYS`): it is a habit of the keyboard in front of the person.
- With the positional choice, Ctrl+Tab behaves exactly as today and the card never appears; Ctrl+PageDown/PageUp are positional either way.
- Default on is the choice to make (D1): Firefox's default, Arc's only behaviour, and the point of the feature. People who want the tab-strip order have the setting and the PageDown keys.

## 4. Interactions with existing features

- **⌘1–9 / cluster keys** (`clusterSlots`, `lastActiveByCluster`): untouched. Landing through the card records the activation like any switch, so cluster memory stays right.
- **Vertical tabs** (F28): the card draws under the Island regardless of the tab list's position; the list highlights the landed tab as it does for any switch.
- **Tab sync / Spaces / session:** nothing persists. `activationHistory` is in-memory today and stays so; after a relaunch the order starts from the restored selection (the card lists unseen tabs in tab-order, §3.2).
- **Quick Switcher (⌘L typing):** unchanged. Ctrl+Tab while the ⌘L panel is open steps the card over the panel; landing dismisses the panel (as a tab switch does).
- **Find bar:** Ctrl+Tab while Find is open is a tab switch today; the card behaves the same and Find closes on landing as it does now.

## 5. Data and code shape

- `src/main/tab-switcher.js` (pure, no Electron): `switcherOrder(history, tabOrder, isLive, splitOf)`, `step(state, direction, order)`, `onClose(state, closedId)`. Unit-tested.
- `src/main/main.js`: the state machine and its listeners; `cycleTab` stays for the positional setting and PageDown/PageUp. `'next-tab'`/`'previous-tab'` dispatch to the switcher when the setting says so.
- `src/main/browser-shortcuts.js`: `'next-tab'` loses its `Ctrl+PageDown` alias; `'next-tab-in-order'`/`'previous-tab-in-order'` take `Ctrl+PageDown`/`Ctrl+PageUp` (menu items, so the Shortcuts page lists them). `browser-api/contract.json` needs nothing for keys; the card needs one overlay message (`overlay:show` with mode `'switcher'` and a payload `{ entries, pick }`, pinned in the contract) and one reply (`chrome:switcher-pick` for a click).
- `src/renderer/overlay.js`: the `'switcher'` mode renders the card from the payload only; it holds no order of its own.
- Settings: `tabSwitchOrder: 'recent' | 'list'` in `settings-schema/schema.json` and `settings.js` (substrate check), device-local.
- Copy: the setting's two labels and description, the card's accessible name ("Tab switcher"), and the Shortcuts page rows, in `copy/messages/en.json` with the five translations in the same PR.

## 6. Accessibility

- The card is `role="listbox"` with `aria-activedescendant` on the pick; opening announces "Switch tabs, {title}, {n} of {count}" through the strip's polite region, and each step announces the new pick. Landing announces nothing extra (the page's own title change is the signal, as with any switch).
- Everything the card does is doable without it: a tap of Ctrl+Tab goes to the previous tab; the ⌘L panel lists all tabs for anyone who wants to see them.
- The card respects `prefers-reduced-motion` and the chrome's contrast tokens; the raised tile has a 2 px focus ring in `--accent`.

## 7. Security and privacy

Nothing new leaves main: the card's payload is the same `{id, title, favicon, private}` projection the panel's rows already receive, for the window's own tabs. Nothing is persisted or synced. A quiet tab's snapshot is never read for the card (titles and icons come from the tab record's `meta`, as in the panel).

## 8. Testing

- Unit: `tab-switcher.js` order and stepping (splits as one entry, dead ids skipped, unseen tabs appended, Shift direction, close-while-open), the setting's sanitising, the shortcut table (PageDown no longer an alias).
- Desktop: a scenario in `test/desktop/browser-shortcuts-smoke.mjs` (it runs on Windows and under xvfb on Linux and already drives Ctrl+Tab): open three tabs, activate them 1→2→3, press Ctrl+Tab twice with Ctrl held (`sendInputEvent` keyDown Control, keyDown Tab ×2, keyUp Control), assert the landing is tab 1; a single tap lands on 2; Esc cancels; the card never appears for a tap (overlay mode stays null). macOS lands the same through the acceptance suite's Playwright keyboard (`keyboard.down('Control')`).
- Manual before merge, per platform: a real keyboard, with the focus in a page input, in the ⌘L panel, in Settings, in DevTools, and with a native dialog open (the no-release case of §3.4).

## 9. Deliberately excluded

- A full-screen or centered switcher (the OS's ⌘-Tab look). The Island anchor keeps it one surface.
- Including other windows' or spaces' tabs. Window switching is the OS's job.
- Persisting the order across relaunch.
- Changing ⌘1–9, ⌥⌘Z, or the cluster keys.
- Mouse-wheel or trackpad stepping.
- A per-site or per-space exception.

## 10. Delivery

1. **Spike (half a day):** on each platform, confirm `Control` `keyUp` reaches `before-input-event` after a menu-accelerator Ctrl+Tab (macOS) and after an intercepted one (Windows, Linux), with focus in a page, in the overlay, in the utility sheet, and with a tab view that was just swapped by the first step. Record the results in this file.
2. **PR 1:** the setting, `tab-switcher.js`, the state machine, landing on release, Esc, PageDown/PageUp split from Tab, the Shortcuts page rows, copy in six languages, the smoke scenario. No card yet: a tap and a held multi-step both work blind.
3. **PR 2:** the card in the overlay, click-to-land, Ctrl+W while open, announcements.
4. Website and What's New only after the release that carries both PRs (`docs/marketing-claims.md`).

## 11. Decisions needed from the owner

- **D1 — Default.** Most-recent-first by default, with the list order as the setting (recommended, §3.5), or the reverse.
- **D2 — Menu labels.** Keep **Next Tab** / **Previous Tab** on the Tab menu and explain the order on the Shortcuts page, or rename them (**Last Used Tab** / **Next Used Tab**) and give the positional items their own names.
- **D3 — The card.** The one-row favicon strip (§3.3), or a vertical list of titles like the ⌘L switcher. The strip is closer to ⌘-Tab and fits the Island; the list is easier to read with many tabs.
- **D4 — Ctrl+W while the card is open** closes the picked tab (as proposed) or is ignored.
- **D5 — Platforms.** Ship on a platform only if the spike shows reliable release delivery there (proposed), or ship everywhere with the stuck-open fallback of §3.4 as the known limit.

## 12. Open questions

- Whether the card should also appear for a *tap* after a short delay when the person pauses before releasing (the 150 ms rule, §3.3) or only ever on the second step.
- Whether a split's entry should land on its last focused pane or always on its first.

## 13. Obligations elsewhere

- `spec/features.md`: a new feature (F55, "Switch tabs in the order you used them") and the parity matrix row; mobile is N/A (no Ctrl key) and is a D-register entry.
- `CLAUDE.md`: the browser-shortcuts paragraph and the Quiet Tabs rule that stepping never wakes.
- `docs/press/release-notes/vX.Y.0.md` and the What's New page for the release that ships it; the website's keyboard page after that release.
