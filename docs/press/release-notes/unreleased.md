# Unreleased notes

v1.45.0 is the current public release ([notes](v1.45.0.md)). Changes merged
since then are below as they're recorded.

## Fixed

- With **Also for links I open in a new tab** on, a link you open in the
  background (middle-click, ⌘-click or Ctrl-click) whose rule needs a new
  window now opens that window behind the one you're using, instead of in
  front.

## Still open from 1.45.0

- **Link routing:** the published 1.45.0 was checked on October 29
  ([record](../../reviews/2026-10-29-link-routing-real-app-checks.md)).
  Links handed over by the OS open in the rule's profile or Space, cold and
  warm, on macOS (`open -a`), Linux (`xdg-open` as the default browser, and
  the OpenURI portal) and Windows (the registered protocol command). The
  new-tab option passes on macOS and Linux. Still open:
  - The new-tab option's background-window focus bug the checks found is
    fixed on main (see Fixed above); recheck it on Linux's window manager.
  - **Windows default-browser handoff:** `start` and clicks in other apps
    weren't proven. The test VM can't hand links to any default browser but
    Edge (see the record).
  - **A click in Mail or Slack on macOS:** not tried, because it needs Blanc
    to be the default browser.
- Leave out what notes don't cover on purpose: the iOS changes belong to the
  iPhone app's notes, and the CI, test, website and spec changes aren't
  user-visible.
