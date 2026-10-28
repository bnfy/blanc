# Unreleased notes

v1.44.1 is the current public release ([notes](v1.44.1.md)). Changes merged
since then are below as they're recorded. Include only what is present in the
selected release commit, and clear the checks at the end before publishing.

## Added

- **Shared Spaces.** Keep a Space the same on each of your computers. With
  Sync on, open Settings → Sync, turn on **Spaces and groups** under What
  syncs, and choose which Spaces to share. Their open tabs, tab names, groups
  and pinned tabs, in the same order, then match on every device that has it
  turned on, and a change on one appears on the others. Every device that
  turns it on can change these Spaces. The page you're looking at never
  changes under you: a close or a new address from another device waits until
  you leave that tab. The switch is off by default and set on each device;
  turning it off keeps a copy of your Spaces on that device, and your other
  devices keep syncing. Shared Spaces is end-to-end encrypted like the rest of
  Sync and belongs to the Personal profile. Private tabs, internal pages and
  local files never sync. Up to 25 Spaces can be shared, and a Space you
  delete still counts toward that limit for 30 days. A Space too large to
  sync says so and asks you to split it.
- **Recently closed on every device.** A tab you close in a shared Space
  closes on your other devices too, and their Recently closed lists it with
  the name of the device it was closed on, so you can bring it back from any
  of them. Closed tabs still use sync storage for 30 days.

## Still open from 1.44.1

- **Link routing:** check it with real apps on each platform (spec §8: Slack
  or Mail on macOS, the Windows default-browser handoff, `xdg-open` on
  Linux), cold and warm. So far it has been tested on Linux only, in CI and
  under xvfb.
- Leave out what notes don't cover on purpose: Shared Spaces is offered only
  in development builds until PR E, the iOS changes belong to the iPhone app's
  notes, and the CI, test, website and spec changes aren't user-visible.

## Before publishing 1.45.0

- **Shared Spaces** ships only from a release commit that contains the
  Shared Spaces PR E enable change (`isSharedSpacesOffered()` offered in
  packaged builds) and only once its gates are closed or waived in writing by
  the owner: the device retest with the #1204 restore fix (`e578b9439`),
  Mac ↔ Windows and Linux device validation with written platform
  confirmations, and the `@F57` acceptance scenarios on Linux CI, the
  two-client F57-8 included. (The production Worker that has served the M16
  stores since October 27, 2026 at 00:39 UTC is approved: the owner accepted
  it on October 28, 2026; see the
  [v1.44.1 incident](../../release-incidents/2026-10-28-v1.44.1.md#the-sync-worker).)
  The evidence goes in the 1.45.0 release incident. Without them, drop the
  entry above.
- **Privacy page and FAQ:** they must say what Shared Spaces carries (the
  encrypted record of shared tabs' web addresses, titles, tab names, groups,
  pins and order, and closed-tab markers kept for 30 days), what never syncs,
  and the retention and erasure terms, before the release publishes. That's a
  website-only PR, deployed with the What's New page.
- **What's New 1.45:** start from the draft in
  [`docs/press/whats-new-1.45-draft.md`](../whats-new-1.45-draft.md). After
  the prep PR creates `v1.45.0.md`, run `npm run site:whats-new -- --release
  1.45`, replace the TODO media with captures from the merged build, and get
  the owner's sign-off on the final text and media before the website-only PR
  deploys. A page needs at least two highlights.
