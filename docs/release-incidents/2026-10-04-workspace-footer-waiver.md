# Workspace footer manual-machine waiver — October 4, 2026

PR [#510](https://github.com/bnfy/blanc/pull/510) adds Workspace lifecycle and packaged recovery coverage and fixes the compact Island footer overflow with Windows/Linux shortcut labels at 125% zoom. This is a merge gate record, not a public release record.

At source `289c36972bb9f2a6cd332eef634e8e0becd94243`, the [Workspace regression run](https://github.com/bnfy/blanc/actions/runs/37181364232) passed all 14 scenarios on macOS, Windows and Linux, including minimum-window/vertical-tab layout, both shortcut-label variants, containment and non-overlap at 125% zoom. Local full desktop acceptance passed 171 scenarios at `eeecc54429128978460955b0d96f390b8e140eae`; the final source also includes test-only readiness corrections. Earlier private packaged recovery results at `77a6b7738917db7cc52d2d1381f11346a2c44f47` do not constitute packaged verification of the new footer CSS.

**Unperformed evidence:** physical Windows/Linux testing of this footer fix has not been confirmed. Hosted CI cannot rule out native display-scaling or machine-specific layout and interaction defects. No new signed Windows/Linux candidate containing the footer CSS has been manually verified.

After that missing evidence and risk were stated in this chat, the owner replied **“waive”** on October 4, 2026 to the explicit question about waiving physical Windows/Linux footer testing and squash merging once CI passes. That written response waives affected-machine confirmation for this PR's merge only. Required CI and protected-branch rules remain mandatory. The waiver does not authorize a public release or waive signing, notarization, updater handoffs, or future release verification.
