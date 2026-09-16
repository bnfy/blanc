# Badge seed build: owner confirmation waiver

On September 4, 2026 Anthony Loria explicitly replied “waive it” after being
informed that PR #289 awaited his own Windows/Linux machine confirmation,
that automated validation had passed on both platforms and locally on macOS,
and that a machine-specific packaging issue could remain undetected. This
authorizes merging PR #289 based on the recorded automated evidence, including
the launch-freeze exception needed for this badge work.

Windows/Linux validation passed at ff45fb95bff8b22fc564cf43480f96352ef4c574:
https://github.com/bnfy/blanc/actions/runs/33926211192 . Packaged blocker,
compliance, fuse and live media checks passed; Windows also passed the exact
publisher and timestamped Authenticode checks. A fresh macOS arm64 private
build passed normal signing/profile/entitlement verification and the packaged
first-run test, including corrupt-cache recovery.

The waived evidence is an owner-performed Windows/Linux candidate install
and affected-machine confirmation. No such install or updater handoff is
claimed. The local macOS candidate was not notarized. This waiver authorizes
the source merge, not a public release, release-gate waiver, or replacement
of immutable v1.15.0 assets.
