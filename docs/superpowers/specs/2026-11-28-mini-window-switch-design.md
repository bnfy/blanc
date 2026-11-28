# Mini Window: switch to tabs and Spaces (#1734, part 2)

**Status:** shipping Blanc (Electron) implemented on `claude/mini-window-switch`, not in a public release; the fork follows on `chromium/next`.
**Asked for:** #1734 item 2, from Koen's feedback on #1138. The global
shortcut opens a mini window with its search focused: "When I press the
shortcut and start typing a website or space, I immediately can." The mini
window works as a quick launcher. It can open a site, as today, and it can
also go to something you already have: a tab in another window or in a
Space, or the Space itself. You get there without a second shortcut.
Part 1 (Move to Space) shipped in bnfy/blanc#1763 and #1789. Part 3, opening
links from other apps in a mini window, gets its own design.

## What it does

The new behavior applies only in a mini window. An ordinary window's ⌘L
stays as it is.

- **Tabs elsewhere.** The mini window's Quick Switcher also matches tabs that
  are elsewhere in this profile:
  - every tab in this profile's other windows (ordinary windows, not other
    mini windows);
  - every tab in its Spaces that are set aside, whether held live in memory
    or saved on disk only (after a relaunch, or after Blanc freed memory).

  A row shows the page's title and icon. Its second line gives the site and
  where the tab is: the Space's name, or "Another window" for a window that
  shows no Space. These rows rank just below this window's own tabs and
  above Favorites.

- **Going there.** Picking a tab elsewhere:
  - in a window on screen, brings that window forward with the tab selected;
  - in a Space that is set aside, opens the Space (as the Spaces menu does,
    `openSpaceInProfile`) with that tab selected.

  Nothing moves, and the tab isn't duplicated. If the tab has gone in the
  meantime, the panel says so and stays open.

- **Spaces.** Typing a Space's name offers it again in a mini window: this
  profile's Spaces and other profiles' Spaces, as in an ordinary window.
  Picking one goes to it: its window comes forward, or the Space opens.
  `/space <name>` does the same. Nothing moves. Moving the window's tabs
  stays the Spaces button's job (part 1, the `move` flag).

- **The mini window afterwards.** After you go somewhere, the mini window
  closes if it is still untouched (only its unused start page, the same test
  as part 1's `miniWindowMoveCandidates`). It stays if it holds pages.

- **Never listed:** private tabs, other profiles' tabs (tabs can't change
  profile, and other profiles' Spaces are listed by name only, as #1642
  does), and the other mini windows' tabs. While the active tab is private,
  the list is left out, as the Archive is (F52).

## Approaches considered

1. **A list sent when the panel opens (chosen).** In a mini window,
   `refreshSwitcherData` also asks main for the other tabs, and the panel
   scores them with the same `matchScore` as its own tabs. A pick sends an
   opaque key back to main, which checks it again and goes there.
   - Why: it fits how the switcher already works. The list is built once per
     panel opening, and a single scoring path means the rows can't rank
     differently from the window's own tabs.
2. **Main searches on every keystroke.** The messages would be smaller, but
   each letter needs a round trip, and a second scoring path would drift from
   the panel's. Dropped.
3. **Show other windows as "other devices"** (the existing remote-tabs rows).
   Almost no new code, but those rows reopen the page in a new tab instead of
   switching to it, which defeats the point. Dropped.

## Decisions

- **D1. Windows plus Spaces set aside** (owner, November 28, 2026), including
  Spaces saved only on disk (builder's call: "set aside" means every Space
  not on screen).
- **D2. Approach 1** (owner, November 28, 2026).
- **D3. Mini window only, and it closes only when untouched** (builder's
  call, proposed November 28 and not disputed). A mini window used as a
  launcher goes away after it has done its job. One holding pages is left
  for the person to decide.
- **D4. Spaces go, the Spaces button moves.** Part 1 refused a Space picked
  by name in a mini window, so a pick could never move the tabs by accident.
  Now a pick without `move` goes to the Space instead. That is safe, because
  going to a Space touches nothing in the mini window.

## Shape (for the plan)

- **The list, in main:** a new `chrome:mini-switch-tabs` handler.
  - It answers only for a mini window, and returns `[]` otherwise or while
    the active tab is private.
  - Each row is `{ key, title, url, favicon, place }`, where `place` is the
    Space's name or `null` for a window that shows no Space.
  - Keys are opaque, for example `w:<runtimeId>:<tabId>` for a live tab and
    `s:<spaceId>:<index>` for a tab in a saved record.
  - Favicons follow the same PNG-only rule as the tabs payload. A saved
    record's `meta` supplies the title and icon of a tab that isn't live.
- **Going there, in main:** a new `chrome:mini-switch-go` handler, given a
  key. It resolves the key again:
  - a live tab in a window on screen: focus that window and select the tab
    (`setActiveTab`);
  - a tab in a Space that is held or saved: `openSpaceInProfile`, then
    select the tab by id (held) or by index (saved).

  It returns `{ ok, error }`. After `ok`, the mini window closes if
  `miniWindowMoveCandidates` is null.
- **Spaces, in main:** `chrome:workspaces-open` in a mini window without
  `move` goes to the Space with `openSpaceInProfile`. That covers this
  profile's Spaces and other profiles' Spaces. The handler then applies the
  same rule for closing an untouched mini window. With `move`, it is part 1's
  move, unchanged.
- **The panel:** the `spaceResults` exclusion added in part 1 goes away. The
  new rows are `kind: 'elsewhere'`, keyed `elsewhere:<key>`, and pick through
  `window.browserAPI.goToMiniSwitchTab(key)`.
- **Bridge:** two new `browserAPI` members, which means updating
  `browser-api/contract.json`, the generated vectors, and the fork's typed
  bridge (`chromium/tools/browser-api-mojom.mjs`). Part 1 also had to
  regenerate that fork bridge.
- **New copy:** "Another window", and an error for a tab that has gone ("That
  tab isn't open anymore"), in all six languages.

## Not in this part

- Other profiles' tabs, and ordinary windows' ⌘L.
- Part 3: opening links from other apps in a mini window.

## Tests

- **Unit tests:**
  - the list's rows: what is listed and what is left out (private tabs, mini
    windows, other profiles, a private active tab);
  - key resolution, including a key that has gone stale;
  - the rule for closing an untouched mini window;
  - the panel's ranking and its picking path.
- **Acceptance:**
  - F61-9: go to a tab in another window, and the untouched mini window
    closes;
  - F61-10: go to a tab in a Space that is set aside, and the Space opens
    with that tab selected;
  - F61-11: go to a Space by name, and a mini window holding a page stays
    open.
- **The fork:** the same feature on `chromium/next` afterwards, in the
  fork's host, with a native check as in part 1.
