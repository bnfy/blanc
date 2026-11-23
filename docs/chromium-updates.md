# Keeping the Chromium fork current

People expect a Chromium browser to pick up Chrome's fixes about when Chrome
does. Chrome ships a new milestone every four weeks and a stable security
update about every week.

## The rule

Owner decision, November 22, 2026: every public lane of the fork follows the
Android lane's rule (`docs/superpowers/specs/2026-11-03-android-port-design.md`
§8.3).

- **7 days.** A lane moves to the newest Chrome stable within 7 days of the
  first stable release newer than its pin. This covers both a new milestone and
  a security update inside one.
- **72 hours.** When Google's release post says a flaw fixed in that release
  "exists in the wild", the deadline is 72 hours from that release.

Today the public lane is the desktop lane: Blanc Beta on Mac, Windows and
Linux, which share one pin (`chromium/lanes/desktop.json` on `chromium/next`).
The Android lane (`chromium/lanes/android.json`) falls under the rule from its
first public release. Make it count by setting `public: true` for `android` in
`scripts/chromium-release-watch.mjs`.

"Chrome stable" means the newest release of the newest milestone whose
scheduled stable date has passed. Early Stable builds of the next milestone,
which chromiumdash lists on the Stable channel weeks early, don't count.

## The watch

`.github/workflows/chromium-release-watch.yml` runs daily at 13:23 UTC and can
be started by hand (`gh workflow run chromium-release-watch.yml`). It runs
`scripts/chromium-release-watch.mjs`, which reads:

- each lane's pin;
- the Stable releases for the lane's platforms, and the milestone schedule,
  from chromiumdash;
- the Chrome Releases blog feed, for "exists in the wild" notes.

For each public lane that is behind, it keeps one open issue labelled
`chromium-update`, titled `Chromium update due: <lane>`. The issue names the pin,
the newest stable, whether it is a milestone or a security update, and the
deadline. GitHub emails a new issue. When stable moves on while the issue is
open, the watch also comments, so the move reaches the owner's mailbox. Once the
lane file names the newest stable or later, the watch closes the issue.

## Moving a pin

- **Desktop:** follow the desktop move plan
  (`docs/superpowers/plans/2026-11-22-desktop-fork-chromium-159.md` on
  `chromium/next`). A security update inside a milestone runs the same steps
  and is usually a much smaller rebuild.
- **Android:** follow `docs/android/rebase.md`.

Moving a pin still needs the owner's approval for downloads, environment changes
and large rebuilds, as `CLAUDE.md` says. The watch only says when a move is due.
