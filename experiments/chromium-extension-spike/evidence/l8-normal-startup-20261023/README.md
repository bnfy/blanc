# Normal Preview startup recovery — October 23

**Open finding. L6 is reopened; L8 remains open. Readiness 7/12, delta -1.**

Owner completed the L8 MacBook walkthrough on signed source57fc3b13. Normal launch, Shelf, Bitwarden Cancel/retry/install/popup focus and its persistence, and Shipping preservation passed, but example tabs did not return after normal Cmd+Q/reopen.

The MacBook profile reports a normal exit and no explicit startup preference. A new disposable local fixture reproduces the failure: three tabs/selected index2 become one New Tab after a normal restart. A closed copy of that exact fixture restores all three tabs/selection with --restore-last-session. The prior scripted recovery harness supplied that flag, so it did not exercise the actual default launch path. This is evidence of a startup selection problem, not an assertion that the owner's saved records are destroyed.

Repair in progress: make LAST the registered startup default only when Blanc's sealed-assets switch is present. User and managed startup preference values remain authoritative. No startup flag is forced, no owner profile is changed, and ordinary Chromium startup is unchanged. Requalify normal restarts, explicit New Tab/URL preferences, private exclusion, signed recovery and owner launch before reinstating L6/L8.

Source7065f9c0 includes the correction and a new-profile guard. The first repair exposed a fresh `--no-first-run` wait; the final guard opens New Tab before a profile has any saved session. Directly editing a protected startup preference was an invalid fixture; the corrected control uses Chromium's Settings API, with read-back. Final preflight and signed runs each pass seven controls: fresh page creation, two normal restarts retaining tabs/selection, explicit native New Tab and URL choices, private-only launch and private exclusion across subsequent normal restart. Full recovery/notarization and the owner's repeated normal MacBook restart remain pending.

Two incremental builds35.06/35.22seconds, six steps each; guard zero. Fresh footprint72files/176hunks under the owner's standing consolidation authorization. The initial counter budget used the mistaken assumption that startup_browser_creator.cc was already modified; corrected measured totals are retained. No build-setting/toolchain changes.
