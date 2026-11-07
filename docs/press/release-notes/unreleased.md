# Unreleased notes

v1.46.0 is the current public release ([notes](v1.46.0.md)). The next release
is 1.47.0, a feature release ([notes](v1.47.0.md)). Changes merged after its
release commit are below as they're recorded.

## Before 1.47.0 publishes

- **What's New:** `https://blanc.day/whats-new/1.47` must be live, with the
  owner's sign-off on its text and media.
- **Default page zoom hands-on checks** in a packaged build on the ECS
  runtime, and on Windows and Linux: it has only been run unpackaged on macOS.
- **Protected playback, 1Password and passkeys** on ECS 45.2.1, the first
  release on Electron 45.
- **The macOS update restart** (#1405): confirm in the 1.46.0 → 1.47.0
  updater handoff that secondary windows come back after **Restart Now**.

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
