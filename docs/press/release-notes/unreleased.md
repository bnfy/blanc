# Unreleased notes

v1.45.1 is the current public release ([notes](v1.45.1.md)). The next release
is 1.46.0, a feature release ([notes](v1.46.0.md)). Changes merged after its
release commit are below as they're recorded.

## Before 1.46.0 publishes

- **What's New:** `https://blanc.day/whats-new/1.46` must be live, with the
  owner's sign-off on its text and media.
- **Mini Window hands-on checks** on macOS and Windows: the global shortcut
  opens a mini window without raising other Blanc windows, the Dock menu item,
  and placement on the display under the pointer.

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
