# Unreleased notes

Changes merged since v1.44.1 are included in the prepared
[v1.45.0 release notes](v1.45.0.md). No additional release changes are
recorded here.

## Before publishing 1.45.0

- **Shared Spaces** ships only once its gates are closed or waived in writing
  by the owner: the device retest with the #1204 restore fix (`e578b9439`),
  Mac ↔ Windows and Linux device validation on a private 1.45.0 candidate with
  written platform confirmations, and the `@F57` acceptance scenarios on Linux
  CI, the two-client F57-8 included. The evidence goes in the 1.45.0 release
  incident. Without them, drop its two entries from the notes and hold the
  switch-on version (`isSharedSpacesOffered()`) at 1.46.
- **Privacy page and FAQ:** they must say what Shared Spaces carries (the
  encrypted record of shared tabs' web addresses, titles, tab names, groups,
  pins and order, and closed-tab markers kept for 30 days), what never syncs,
  and the retention and erasure terms, before the release publishes. That's a
  website-only PR, deployed with the What's New page.
- **Connect your iPhone** (owner, October 28, 2026: ship it in 1.45.0, and
  the release waits for it). Before publishing: a TestFlight build containing
  Pair with your Blanc (#1235) is live in the Public beta group; the website
  has `/pair` and an `ios-availability.json` that says the iPhone app is
  public; `IPHONE_PAIRING_FROM` is set to 1.45.0 with its notes entry; and a
  real iPhone has scanned a 1.45.0 candidate's code and joined.
- **Sync without a passphrase:** the production `blanc-sync` Worker's
  `NEW_ACCOUNT_DAILY_LIMIT` is 100 (deployed October 28, 2026 at 20:03 UTC
  with the owner's approval, version `9f7efb3a-dad5-45eb-960c-bd2a7e3fd906`;
  the code is unchanged from `ec302891`). The window's best-effort
  screen-capture exclusion is unverified and is never claimed.
- **Translations:** the new Sync, pairing, Sunrise and link-routing strings
  ship in the PR authors' own translations; the owner waived a fluent review
  on October 28, 2026. Record it in the 1.45.0 release incident.
- **What's New 1.45:** start from the draft in
  [`docs/press/whats-new-1.45-draft.md`](../whats-new-1.45-draft.md). Run
  `npm run site:whats-new -- --release 1.45`, replace the TODO media with
  captures from the merged build, and get the owner's sign-off on the final
  text and media before the website-only PR deploys.
- **Link routing:** the 1.44.1 real-app checks (Slack or Mail on macOS, the
  Windows default-browser handoff, `xdg-open` on Linux, cold and warm) are
  still open; the new in-app option (F60-6) is tested in CI only.
- Leave out what these notes don't cover on purpose: the iOS changes belong
  to the iPhone app's notes, and the CI, test, website and spec changes
  aren't user-visible.
