# Unreleased notes

v1.44.1 is the current public release ([notes](v1.44.1.md)). Changes merged
since then aren't recorded here yet.

## Still open from 1.44.1

- **Link routing:** check it with real apps on each platform (spec §8: Slack
  or Mail on macOS, the Windows default-browser handoff, `xdg-open` on
  Linux), cold and warm. So far it has been tested on Linux only, in CI and
  under xvfb.
- **Sync Worker:** production `blanc-sync` serves `sends` (Send to Device),
  and since 2026-10-27 00:39 UTC the M16 Space stores too, uploaded while the
  owner's record and `cloudflare/sync-worker/README.md` said deployment was on
  hold. The owner records approval or rolls it back; see the
  [1.44.1 incident](../../release-incidents/2026-10-28-v1.44.1.md#the-sync-worker).
- Leave out what notes don't cover on purpose: Shared Spaces is offered only
  in development builds until PR E, the iOS changes belong to the iPhone app's
  notes, and the CI, test, website and spec changes aren't user-visible.
