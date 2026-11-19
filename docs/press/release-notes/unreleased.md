# Unreleased notes

v1.51.0 is the current public release ([notes](v1.51.0.md)). Changes merged
since then are below as they're recorded.

## Added

- **Open local HTML files on Windows.** Choosing Blanc under **Open with** for
  an `.html` file now opens it, as on a Mac, instead of opening Blanc with
  nothing in it (#1630). The file shows in a separate, static preview window:
  scripts, network requests and other files on the disk (such as a page's own
  stylesheets and images) are blocked, so some pages look plainer than they do
  in other browsers, and files over 8 MB don't open. Blanc is added to the
  Open with list for HTML files, and making Blanc your default browser
  doesn't make it the default for them. A preview closes with Blanc's last
  window.

## Fixed

- **Pop-up windows close when their page asks first.** A page in a separate
  pop-up window, such as Proxmox's console while it's connected, can ask
  before you leave it. Blanc now asks **Leave** or **Stay**, as it does in a
  tab; before, the window's close button did nothing (#1477).
- **No passkey prompt on page load on Windows.** Many sign-in pages quietly
  ask the browser for passkeys as they load. On Windows that opened Windows'
  **Sign in with a passkey** dialog on every visit, even with no passkey
  saved. Blanc now tells those pages it can't list passkeys, so they show
  their own passkey button; choosing it still opens the dialog.

## Still open for the next release

- **Opening local HTML files on Windows** (#1630) by hand from Explorer's
  Open with in an installed build. CI checked the installer's registration
  and its removal on a real Windows runner. The packaged check that opens a
  file at launch and while Blanc runs is in the Windows release job but
  hasn't passed on an ECS build yet.
- **The Windows passkey fix** in a packaged build and on a PC with Windows
  Hello set up. It was checked in the Windows VM (no Windows Hello) with a
  source build and a local test page, not a real site. A sign-in form inside
  an iframe can still open the dialog.
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
- **Okta Verify FastPass** (#1585) against a real enrolled Okta Verify. The
  local-network prompt was checked against a test server on `127.0.0.1`
  only, and a public name that resolves to a private address isn't gated.

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
