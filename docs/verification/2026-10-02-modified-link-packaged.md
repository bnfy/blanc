# Modified link clicks in Linux and Windows packages — October 2, 2026

The fix for [issue #468](https://github.com/bnfy/blanc/issues/468) was merged
through [PR #470](https://github.com/bnfy/blanc/pull/470) as
`6ada63b6ca10bf245408180b3b69a9ddf221866e`. The owner subsequently requested
Linux and Windows verification.

## Candidate and scope

[Private validation run 37042797138](https://github.com/bnfy/blanc/actions/runs/37042797138)
completed successfully with `mode=validation`, `platform=all`, and no release
tag. Its exact source and workflow commit was
`1f685d4f172682c42356b25743fe3cf6723cb0f7` on `codex/verify-468-packages`.
The application source under `src/` matches the merged fix. The branch adds a
packaged test fixture, its npm script, and native workflow wiring; it changes
no application runtime code.

Both private x64 candidates use official, unmodified Electron 44.5.1. They
retain package version 1.25.0, but are private builds of the merged source,
not the public v1.25.0 release. Public release assets, tags, and updater feeds
were not changed.

## Packaged results

| Platform | Executed candidate | Native click result |
| --- | --- | --- |
| [Ubuntu 24.04.5 LTS](https://github.com/bnfy/blanc/actions/runs/37042797138/job/110956813712) | Directly launched `Blanc-1.25.0.AppImage`, under Xvfb | 40 cases and 3 restricted-tab recreations passed |
| [Windows Server 2025, build 10.0.26100](https://github.com/bnfy/blanc/actions/runs/37042797138/job/110956813728) | `Blanc.exe` installed by the signed NSIS candidate | 40 cases and 3 restricted-tab recreations passed |

The fixture sends native Chromium input through CDP and uses shipping chrome
IPC to arrange and inspect tabs. `BLANC_TEST=0`; production main-process test
hooks and Node inspection are unavailable, and the hardened fuses remain set.

Each platform executes the Cartesian product of regular/private tabs, five
policies, and four click actions:

- Ctrl+left-click, middle-click, Ctrl+Shift+left-click, and Shift+middle-click.
- Default, origin-only, and no-referrer policies, plus CSP document sandbox
  with and without `allow-popups-to-escape-sandbox`.
- Exactly one destination tab, expected foreground/background tab selection,
  unchanged source navigation, preserved private mode and group, and no extra
  browser window.
- HTTP `Referer`, `document.referrer`, and actual localStorage access: inherited
  opaque-origin sandbox restrictions produce `SecurityError`; the explicitly
  permitted escape produces ordinary storage access.

The three recreation checks verify that a sandboxed duplicate and both tabs
rebuilt after closing/reopening a quiet group retain their storage restriction.
Neither packaged run logged the original WebContents TypeError or an uncaught
main-process exception.

Both complete platform jobs also passed packaged blocker/compliance payload,
all eight fuse states, microphone/camera permission and live-track smoke, and
installed `blanc-import` protocol checks. Linux passed direct AppImage launch
and relaunch without FUSE 2, desktop registration, and updater metadata/embedded
blockmap validation. Windows passed installed browser registration and
uninstall cleanup.

The Windows installer and unpacked executable both had **Valid**, timestamped
Authenticode signatures with the exact expected subject:

`CN=Bananify Creative, O=Bananify Creative, L=North Chili, S=New York, C=US`

The private Windows artifact includes `windows-signature.json`, binding the
installer digest to the publisher and timestamp verification.

## Retained artifacts and fixture validation

Private artifacts expire October 5, 2026. These SHA-256 digests identify the
uploaded artifact ZIPs, not individual executable files:

- [Linux artifact 11243070723](https://github.com/bnfy/blanc/actions/runs/37042797138/artifacts/11243070723),
  `Blanc-Linux-37042797138-validation`:
  `00ec3c07d53a1388cdfba95144660aed04af5d6a0955e8790d80b15bb0e76c17`.
- [Windows artifact 11243296120](https://github.com/bnfy/blanc/actions/runs/37042797138/artifacts/11243296120),
  `Blanc-Windows-37042797138-validation`:
  `444d7f25df9427cc873bbacc6ef790970d5413565b739f105fefd5de7bd8e086`.

Local fixture calibration passed 40 cases and three recreations with official
Electron 44.5.1. This was harness calibration, not packaged macOS verification.
Lint and all 1,991 unit tests passed. Syntax, diff, and workflow checks passed;
all PR checks at the candidate commit passed, including CodeQL and the existing
80-case unpackaged Linux/Windows regression tests.

Before the final candidate run, the fixture was corrected to avoid URL-to-HTML
reflection and to wait for chrome's initial tab selection. A local calibration
that began before that selection completed failed its focus assertion;
the corrected complete local and packaged runs above passed.

## Remaining release evidence

These are automated packaged-app results on hosted Linux and Windows machines.
They do not establish behavior on the reporters' affected physical machines,
physical input devices, or a normal desktop's window focus. Adjacent public
in-app updater handoffs were not exercised. The fix still needs a public
release before existing users receive it.

The [merge-only waiver](../release-incidents/2026-10-02-ctrl-click-merge-waiver.md)
for PR #470 remains limited to that merge. This record grants no additional
waiver or permission to tag, merge another PR, or publish a release. The
affected-machine confirmation or an explicit release-specific waiver remains
required before release under the repository protocol.
