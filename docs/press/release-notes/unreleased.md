# Unreleased notes

Changes merged since v1.43.1 are included in the prepared
[v1.44.1 release notes](v1.44.1.md). No additional release changes are
recorded here.

## Before publishing 1.44.1

- **Send to Device:** the production `blanc-sync` Worker already serves the
  `sends` store. Its deployed source, read through the Cloudflare API on
  October 26, 2026, has the store list `bookmarks, settings, session, icons,
  sends`, as in commit `97088934` (#1087). The M16 Space stores aren't in it,
  and they stay on hold for the owner's decision in
  `cloudflare/sync-worker/README.md`. Re-read the deployed source before
  publishing: a later `wrangler deploy` from `main` would ship M16 too.
- **Link routing:** check it with real apps on each platform (spec §8: Slack
  or Mail on macOS, the Windows default-browser handoff, `xdg-open` on
  Linux), cold and warm. So far it has been tested on Linux only, in CI and
  under xvfb.
- Leave out what these notes don't cover on purpose: Shared Spaces is offered
  only in development builds, the iOS changes belong to the iPhone app's
  notes, and the CI, test, website and spec changes aren't user-visible.
