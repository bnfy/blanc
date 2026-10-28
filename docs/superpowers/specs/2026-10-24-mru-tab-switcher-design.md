# Ctrl-Tab by most recent use

**Date:** 2026-10-24
**Status:** decided; implemented on Linux on 2026-10-26 (PR 1 and PR 2, §10). Revised 2026-10-25 with the Linux spike (§10): the release can't be detected the way the first draft assumed, and §3.4 now describes the approach that works on Linux. Windows and macOS are still to be measured. The owner decided D1–D6 on 2026-10-26 (§11), taking every recommendation.
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
- On macOS the Tab menu's **Next Tab** / **Previous Tab** items take the new meaning with their existing Ctrl+Tab / Ctrl+Shift+Tab accelerators. Their labels stay **Next Tab** / **Previous Tab**, and the Shortcuts page explains the order (D2).
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

**What the spike found (Linux, 2026-10-25; §10).** Today `installBrowserShortcuts` calls `event.preventDefault()` on the Ctrl+Tab key press, so the page never sees it and the native menu accelerator doesn't fire a second time. When it does that, **the same webContents receives no key releases at all** afterwards, neither Tab's nor Control's, until the next key press. Electron's lower-level `input-event` misses them too, so the drop happens below Blanc. Moving keyboard focus to another surface during the press, at once or a tick later, doesn't recover the release either. The first draft's plan (keep focus put and listen for `Control` `keyUp` on whichever surface has focus) therefore never sees the release.

**What works on Linux.** For the two Tab-cycling commands only, and only while the setting says *in the order you used them*:

- `installBrowserShortcuts` handles Ctrl+Tab and Ctrl+Shift+Tab without calling `preventDefault()`. The key releases then arrive on the focused surface, every time: a page, a quick tap, the ⌘L panel, the Settings sheet and the chrome strip all delivered `Control` `keyUp` in the spike.
- The menu items keep showing Ctrl+Tab but are built with `registerAccelerator: false`. Without that, the unconsumed press also reaches the native menu accelerator and every Tab steps twice (measured).
- **Trade-off:** web pages now receive Ctrl+Tab key events, which Chrome keeps from them. A page can't stop Blanc's step (Blanc has already acted when the page sees the key), but a web app that binds Ctrl+Tab itself (some web code editors do) reacts too. The owner accepted this (D6).

**The state machine** is unchanged in shape: *closed → stepping (Ctrl held) → landed or cancelled*. It arms on the first Ctrl+Tab and listens for `Control` `keyUp` on **every** webContents of the window. The window's `before-input-event` listeners are already on every surface (`installChromeShortcuts`); tab-view.js already tracks held modifiers there for gestures.

- **Windows** routes Ctrl+Tab through the same `installBrowserShortcuts` path as Linux, so the same fix is expected to hold; it still has to be measured with a real keyboard (§10).
- **macOS** is unknown. Ctrl+Tab there is a native menu key equivalent (`command('next-tab')`), and `installBrowserShortcuts` isn't installed on macOS, so the press arrives as a menu `click`, not a key event. Whether the `Control` release then reaches `before-input-event` has to be measured (§10). If it doesn't, macOS needs its own path, for example handling Ctrl+Tab in `before-input-event` there as well and making the menu shortcut display-only as on the other platforms.
- **Focus outside any webContents** (a native dialog, the menu bar opened with the mouse, a popup window): no `keyUp` arrives. The card then stays open until Esc, a click, or the next Ctrl+Tab, and `powerMonitor`/window `blur` cancels it. It never lands on its own by timer; a timer would switch tabs under a person who is still reading the card.
- **Repeat.** Holding Tab auto-repeats; repeats step the pick (unlike Ctrl+W, where repeats are swallowed). Holding Ctrl alone does nothing.
- **Held firewall.** A parked (Recently closed) guest already consumes these accelerators without acting (`installHeldFirewall`); unchanged.
- The spike in §10 proves release delivery on each platform before any UI is built. If a platform cannot deliver `Control` `keyUp` reliably, that platform keeps positional Ctrl+Tab and says so in the D-register, and the design does not ship a timer there.

### 3.5 Setting

- **Settings → General → Switch tabs with Ctrl+Tab:** *In the order you used them* (default) / *In the order of the tab list*. Device-local like the Island's auto-hide (not in `SYNCED_KEYS`): it is a habit of the keyboard in front of the person.
- With the positional choice, Ctrl+Tab behaves exactly as today and the card never appears; Ctrl+PageDown/PageUp are positional either way.
- Default on (D1, decided): Firefox's default, Arc's only behaviour, and the point of the feature. People who want the tab-strip order have the setting and the PageDown keys.

## 4. Interactions with existing features

- **⌘1–9 / cluster keys** (`clusterSlots`, `lastActiveByCluster`): untouched. Landing through the card records the activation like any switch, so cluster memory stays right.
- **Vertical tabs** (F28): the card draws under the Island regardless of the tab list's position; the list highlights the landed tab as it does for any switch.
- **Tab sync / Spaces / session:** nothing persists. `activationHistory` is in-memory today and stays so; after a relaunch the order starts from the restored selection (the card lists unseen tabs in tab-order, §3.2).
- **Quick Switcher (⌘L typing):** unchanged. Ctrl+Tab while the ⌘L panel is open steps the card over the panel; landing dismisses the panel (as a tab switch does).
- **Find bar:** Ctrl+Tab while Find is open is a tab switch today; the card behaves the same and Find closes on landing as it does now.

## 5. Data and code shape

- `src/main/tab-switcher.js` (pure, no Electron): `switcherOrder(history, tabOrder, isLive, splitOf)`, `step(state, direction, order)`, `onClose(state, closedId)`. Unit-tested.
- `src/main/main.js`: the state machine and its listeners; `cycleTab` stays for the positional setting and PageDown/PageUp. `'next-tab'`/`'previous-tab'` dispatch to the switcher when the setting says so.
- `src/main/browser-shortcuts.js`: in *recent* order, `'next-tab'`/`'previous-tab'` are handled without `preventDefault()` (§3.4); every other command, and both of these in *list* order, keep consuming the press as today. `'next-tab'` loses its `Ctrl+PageDown` alias; `'next-tab-in-order'`/`'previous-tab-in-order'` take `Ctrl+PageDown`/`Ctrl+PageUp` (menu items, so the Shortcuts page lists them). `browser-api/contract.json` needs nothing for keys; the card needs one overlay message (`overlay:show` with mode `'switcher'` and a payload `{ entries, pick }`, pinned in the contract) and one reply (`chrome:switcher-pick` for a click).
- `src/renderer/overlay.js`: the `'switcher'` mode renders the card from the payload only; it holds no order of its own.
- `src/main/main.js` `command()`: in *recent* order, the Next Tab / Previous Tab menu items get `registerAccelerator: false` (shown, not registered; §3.4). The menu is rebuilt when the setting changes.
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
- **Synthetic input can't prove the release.** The spike showed the release being dropped on the native input path; `sendInputEvent` skips that path, so a green smoke scenario says nothing about it. The Linux job should drive the same scenario with real X11 events (`xdotool` under xvfb, as the spike did; one `apt-get install xdotool`), so a regression fails CI.
- Manual before merge, per platform: a real keyboard, with the focus in a page input, in the ⌘L panel, in Settings, in DevTools, and with a native dialog open (the no-release case of §3.4).

## 9. Deliberately excluded

- A full-screen or centered switcher (the OS's ⌘-Tab look). The Island anchor keeps it one surface.
- Including other windows' or spaces' tabs. Window switching is the OS's job.
- Persisting the order across relaunch.
- Changing ⌘1–9, ⌥⌘Z, or the cluster keys.
- Mouse-wheel or trackpad stepping.
- A per-site or per-space exception.

## 10. Delivery

1. **Spike:** on each platform, confirm `Control` `keyUp` reaches `before-input-event` after a menu-accelerator Ctrl+Tab (macOS) and after an intercepted one (Windows, Linux), with focus in a page, in the overlay, in the utility sheet, and with a tab view that was just swapped by the first step. Record the results in this file.

   **Linux, 2026-10-25: done.** Blanc at `4f989f0`/`28fc0a5`, Electron 44.9.3, xvfb with no window manager, the full Chromium sandbox (run as an unprivileged user), real X11 key events from `xdotool`. Every webContents was instrumented, including ones created later. A control step (Ctrl+A, which Blanc doesn't intercept) delivered the release normally, so the probe sees releases when they exist.

   | Variant | Ctrl release seen (of 5: page held, page tap, ⌘L panel, Settings sheet, chrome strip) | Steps per Tab |
   |---|---|---|
   | Today's code: each Tab switches tabs at once | 3: lost on the quick tap and in the ⌘L panel | 1 |
   | Ctrl+Tab only counts (focus stays put), press consumed | **0** | 1 |
   | …plus focus moved to the strip during the press, at once or a tick later | 0 | 1 |
   | Press not consumed | 5 | **2** (native menu accelerator also fires) |
   | **Press not consumed + menu item `registerAccelerator: false`** | **5** | **1** |

   The harness, the raw reports for rows 2–5 (row 1's was overwritten during the spike) and the throwaway patch are in [`assets/2026-10-24-mru-tab-switcher/`](assets/2026-10-24-mru-tab-switcher/README.md).

   **Windows, 2026-10-28: done.** `browser-shortcuts-smoke.mjs` drives the whole scenario on the GitHub-hosted `windows-latest` runner with real input through the OS input queue (`test/desktop/support/native-keys-win.ps1`, `keybd_event`/`mouse_event`): tap, second tap, held double step landing on release, Ctrl+W closing the pick, and a click on a tile. With the press not consumed and `registerAccelerator: false`, as on Linux, every release arrived. One difference: Windows reserves Ctrl+Esc for the Start menu, so Esc never reaches Blanc while Ctrl is held. The Start menu takes focus, and the window's `blur` cancels the switch, so the effect is still a cancel. The smoke skips that step on Windows (#1202).

   **macOS, 2026-10-28: code ready, not proven.** Ctrl+Tab is a native menu key equivalent there and `registerAccelerator` is Windows/Linux only, so one press can reach Blanc twice: as a surface's `before-input-event` and as the accelerator's `click` (`triggeredByAccelerator`). `installMacTabSwitchKeys` steps from the surface without consuming the press, the accelerator click steps the same way, and whichever comes second within 80 ms is dropped; a mouse click on the menu item stays a whole tap. `native-keys-mac.swift` posts `CGEvent`s, but the self-hosted Mac runner lacks Accessibility permission (`AXIsProcessTrusted()` false), so macOS stays out of `recentOrderAvailable()` until the runner is granted it and the smoke passes there.

   **Earlier note (manual probe).** `assets/2026-10-24-mru-tab-switcher/ctrl-tab-probe.mjs` is a manual version for a real keyboard: run from a checkout, it makes a throwaway worktree of `origin/main`, applies the two variants behind environment flags, and walks the tester through four scenarios per variant. It reproduces the Linux table with `--auto`.
2. **PR 1:** the setting, `tab-switcher.js`, the state machine, landing on release, Esc, PageDown/PageUp split from Tab, the Shortcuts page rows, copy in six languages, the smoke scenario. No card yet: a tap and a held multi-step both work blind.

   **Implemented 2026-10-26, Linux only (D5).** On Windows and macOS `recentOrderAvailable()` is false: Ctrl+Tab keeps going by position, the press is still consumed and the setting row is hidden. The Shortcuts page lists the new **Next/Previous Tab in List Order** items (Ctrl+PageDown/PageUp) from the live menu. `browser-shortcuts-smoke.mjs` drives the recent order with real X11 keys from `xdotool` on the Linux CI job (tap, second tap, held double step, Esc); with the press consumed again it fails, as the spike predicts.
3. **PR 2:** the card in the overlay, click-to-land, Ctrl+W while open, announcements.

   **Implemented 2026-10-26, Linux only.** The card is overlay mode `'switcher'` (`overlay:show` with `purpose.switcher = { tabIds, pick }`, `chrome:switcher-pick` for a click), geometry in `tab-switcher.js` `switcherBounds`. Three things differ from §3–§6 as first written:
   - **Ctrl+W goes through the menu accelerator.** Consuming the Ctrl+W press loses the Control release exactly as a consumed Ctrl+Tab does (the smoke reproduced it: the pick closed and the release never landed). While a switch is in progress, `installBrowserShortcuts` leaves Ctrl+W alone (`defers`) and the Tab menu's Close Tab accelerator runs it, which closes the pick. The page also sees that Ctrl+W, so a page that cancels its keydown stops this one Ctrl+W, as with any unconsumed menu key.
   - **The card draws only over a bare page.** With the ⌘L panel, Find or a popover open, the overlay is busy, so the switch works blind and lands as usual (§4 expected the card over the panel).
   - **Announcements come from the card's own polite region**, not the strip's: the card is its own document and never takes focus, so `aria-activedescendant` alone wouldn't be spoken.

   The smoke covers each item with real keys: no card on a tap, the card on a held step without focus moving, Esc, Ctrl+W followed by the release, and a mouse click on a tile.
4. Website and What's New only after the release that carries both PRs (`docs/marketing-claims.md`).

## 11. Decisions (owner, 2026-10-26)

The owner took the recommendation on all six.

- **D1 — Default.** Most-recent-first by default; the list order is the setting (§3.5).
- **D2 — Menu labels.** The Tab menu keeps **Next Tab** / **Previous Tab**; the Shortcuts page explains the order.
- **D3 — The card.** The one-row favicon strip (§3.3), not a vertical list of titles.
- **D4 — Ctrl+W while the card is open** closes the picked tab.
- **D5 — Platforms.** *Recent* order ships on a platform only once the spike shows reliable release delivery there. Linux and Windows qualify (§10); macOS waits for real-key CI. A platform that doesn't qualify keeps positional Ctrl+Tab, recorded in the D-register, with no timer fallback.
- **D6 — Pages see Ctrl+Tab.** Accepted: in *recent* order Blanc doesn't consume the Ctrl+Tab press (§3.4), so web pages also receive it. Blanc steps first, and a page can't block it.

## 12. Open questions

- Whether the card should also appear for a *tap* after a short delay when the person pauses before releasing (the 150 ms rule, §3.3) or only ever on the second step.
- Whether a split's entry should land on its last focused pane or always on its first.

## 13. Obligations elsewhere

- `spec/features.md`: a new feature (F59, "Switch tabs in the order you used them"; F55 was taken meanwhile) and the parity matrix row; mobile is N/A (no Ctrl key) and is a D-register entry.
- `CLAUDE.md`: the browser-shortcuts paragraph and the Quiet Tabs rule that stepping never wakes.
- `docs/press/release-notes/vX.Y.0.md` and the What's New page for the release that ships it; the website's keyboard page after that release.
