# Unreleased notes

Changes merged since v1.49.1 are included in the prepared
[v1.50.0 release notes](v1.50.0.md). No additional release changes are
recorded here.

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
