# Native prefetch consumption and utility-loss refusal

October 21, 2026, PR #1028. Four isolated schedules pass: regular/private ×
consumption/utility-loss. Existing native binary and pinned engine unchanged.

## Observed results

- Both consumption schedules record one initial HTTPS request with sec-purpose:
  prefetch, an explicit native mainFrame allow before navigation, then a link
  navigation with CDP Network.responseReceived.fromPrefetchCache=true,
  fromDiskCache=false and Preload PrefetchResponseUsed / Success. No second server
  request occurs. This resolves the prior same-origin consumption ambiguity.
- Both refusal schedules warm the engine through a real source-page load, verify
  the unique disposable profile browser PID and its owned Blanc utility child,
  kill only that utility, then insert speculation rules. Native logs record
  engine_result=-1 / engine-error / block for prefetch and subsequent navigation.
  CDP records PrefetchFailedNetError; neither phase reaches the HTTPS server.
- These are engine-error fail-closed refusals, not filter-match refusals. The
  pinned native/blocker/bundle.mjs and engine.js explicitly return allow for
  isMainFrame(). The candidate tracker allow from the preceding diagnostic is
  consistent with that policy, not evidence of a bypass. No filter-based
  mainFrame refusal is claimed or enabled here.

## Method and limits

Disposable exact-host certificates use a scoped SPKI exception, never global TLS
ignore or trust-store installation. Context identity is checked with browser CDP.
No feature override is supplied by this harness; full runtime variations/defaults
remain unqualified. The eight-second observation window is a fixture wait, not a
latency measurement. All disposable profiles and keys are removed. Permanent
profiles, tabs and the Google baseline remain untouched.

Only same-origin successful consumption and prefetch-after-utility-loss are
qualified here. Utility loss after successful prefetch but before consumption,
policy changes between those phases, cross-origin serving, redirects, sender
teardown, pre-prefetch, prerender activation and uBO remain open. This does not
close F12 or Decision 2. No native compile; guard zero. Prior upstream 56/134
unchanged. Native input, latency and the Electron diagnostic build remain pending.

Reproduce with fixtures/replay/synthetic/prefetch-consumption-run.mjs CONFIG NEWROOT.
validate.py verifies the archived result independently; SHA256SUMS covers members.
