# Unreleased notes

v1.53.0 is the current public release ([notes](v1.53.0.md)). Changes merged
since then are below as they're recorded.

## Added

- **Switch to tabs and Spaces from a mini window.** Type in a mini window's
  search to find tabs in your other windows and in your Spaces, and your
  Spaces themselves. Pick one and Blanc takes you there; a mini window you
  hadn't used yet closes behind you (#1734).
- **Open links from other apps in a mini window.** Turn it on in Settings →
  General, and a link you click in another app opens in a mini window
  instead of your Blanc window; another link joins it. Links that match one
  of your link rules still go where the rule says (#1734).

## Fixed

- **New space… in a mini window counts the tabs that move.** It said
  "0 tabs" every time (#1734).

## Still open from 1.53

- **Move a mini window to a Space** (#1734) by hand in a packaged build, with
  a real mouse: the Island's Spaces button, the move-mode menu, and File →
  Move to Space ▸. Acceptance covers moving to a saved Space, to one on
  screen, to a new Space, and the private-tab refusal.
- **Switch to tabs and Spaces from a mini window** (#1734) by hand in a
  packaged build: a tab in another window, a tab in a Space set aside, and a
  Space by name. Acceptance covers all three.
- **Links from other apps in a mini window** (#1734) by hand in a packaged
  build: from Mail or Messages on macOS, and from another app on Windows and
  Linux (the command line), with the setting on and off, and with a link rule.

- **Opening local HTML files on Linux** (#1630) by hand from a file manager's
  Open With (GNOME Files and Dolphin) with the AppImage, at launch and while
  Blanc is running. CI opens a file in the static preview from the packaged
  AppImage's command line, as a `file:///` URI at launch and as a path handed
  to a running Blanc.

## Still open from 1.52

- **Download peek with Auto-hide on**, by hand in a packaged build on macOS
  and Windows: a real click on a download link shows the hidden Island in both
  the float and push styles. CI checks it with real downloads on Linux and
  Windows; nobody has watched it on screen yet.
- **Opening local HTML files on Windows** (#1630) by hand from Explorer's
  Open with in an installed build, including Settings' Set default button.
  CI checked the rest on a signed ECS package on a Windows runner (run
  44658492309): the installer's registration and its removal, and a file
  opening in the static preview at launch and when handed to a running
  Blanc.
- **The Windows passkey fix** on a PC with Windows Hello set up, and on real
  sites. On November 21, 2026 a signed ECS package of `main` (`4c8f5d02f`,
  run 44887227876) was checked in the Windows VM (no Windows Hello) with a
  local test page: a quiet passkey request no longer started Windows'
  passkey dialog, a passkey request the page made directly still did, and
  public 1.51.0 still showed the bug. A sign-in form inside an iframe can
  still open the dialog.
- **The message for a refused local HTML file** in a packaged build on macOS
  and Windows. Unit tests cover the reasons and the text; nobody has seen the
  dialog on screen yet.
- **Closing a real Proxmox console window** (#1477) in a packaged build. The
  fix was checked in the acceptance suite with a page that asks before it's
  left, not against Proxmox itself.

## Still open from 1.51

- **The one Start Page** (from the fork's V24) by hand in a packaged build on
  macOS, Windows and Linux: dragging cards with a real mouse and finger,
  resizing them, and the light-or-dark text over a real photo.
- **The wallpaper behind the Island** (#1622) by hand on Windows and Linux,
  where the window buttons sit over the photo, and with a Space's color wash.
  It was checked on macOS by hand and in the desktop checks there.
- **Customize at the smallest windows:** the clock gives way down to half
  size; below that Customize scrolls, and at 640×480 with a tall clock it
  can still get short (it never covers the clock, by the owner's rule).
- **The Favorites page** (#1614) by hand in a packaged build on macOS,
  Windows and Linux: Edit… with a real address change, the ⋮ menu, and
  dragging with a real mouse.

## Still open from 1.50

- **Whether macOS asks for Downloads access the first time** Blanc saves a
  download without asking (#1591). The packaged check on November 17, 2026
  saw no prompt, but it ran with the same signing identity as an installed
  Blanc that may already have had access. Saving to the real Downloads folder
  was checked in signed packaged builds on macOS and Windows.
- **Favorites drag and drop with a real mouse** in a packaged build on macOS,
  Windows and Linux. The checks so far drive drags with page events only.
- **The Favorites menu's nested folders** by hand in a packaged build on
  each platform.

## Still open from 1.49.1

- **New Tab reuse** (#1505) in a packaged build on macOS, Windows and Linux,
  including a quiet unused new tab and the Settings switch.

## Still open from 1.49

- **The pop-out certificate fix** (#1478) against a real local console, such
  as Proxmox's noVNC and xterm.js windows, after **Continue**.
- **Mahjong** in a packaged build: the three tile sets, the match trail and
  board-cleared celebration (and the reduced-motion glow), in light and dark
  mode.

## Still open from 1.48

- **Glance over a split hands-on checks** (#1444) in a packaged build on
  macOS, Windows and Linux: the card drawing above both panes and their
  corner tabs (Linux especially), clicking between panes, and closing a pane
  under the card. It has only run in the acceptance suite on Linux.
- **The WebSocket certificate fix** (#1442) against a real local console,
  such as Proxmox's, after **Continue**.

## Still open from 1.47.1

- **The certificate crash fix** (#1424) held on the published Apple Silicon
  app. It hasn't been run in Blanc on Linux or Windows.

## Still open from 1.47

- **The update-restart change in #1405:** the macOS and Windows updater
  handoffs were confirmed on November 7, 2026, and the owner reported
  everything fine after the Mac update. How many windows were open wasn't
  recorded, so a multi-window restart is still unproven.
- **Page zoom** in a packaged ECS build on Windows and Linux, and its PDF,
  private-tab, sign-in popup and second-profile cases in a packaged build.
- **1Password fill** misses forms in iframes, shadow DOM or hidden behind a
  button, as it did in v1.46.0.
- **The first release on ECS 45.2.1** has no native-source review (waived).

## Still open from 1.46

- **Mini Window:** not hand-checked on Linux, with several displays, or for
  the hour-long close.

## Still open from 1.45

- **Link routing:** the published 1.45.0 was checked on October 29
  ([record](../../reviews/2026-10-29-link-routing-real-app-checks.md)).
  Links handed over by the OS open in the rule's profile or Space, cold and
  warm, on macOS (`open -a`), Linux (`xdg-open` as the default browser, and
  the OpenURI portal) and Windows (the registered protocol command). The
  new-tab option passes on macOS and Linux. Still open:
  - The new-tab option's background-window focus bug the checks found is
    fixed in v1.45.1; recheck it on Linux's window manager.
  - **Windows default-browser handoff:** `start` and clicks in other apps
    weren't proven. The test VM can't hand links to any default browser but
    Edge (see the record).
  - **A click in Mail or Slack on macOS:** not tried, because it needs Blanc
    to be the default browser.
- Leave out what notes don't cover on purpose: the iOS changes belong to the
  iPhone app's notes, and the CI, test, website and spec changes aren't
  user-visible.
