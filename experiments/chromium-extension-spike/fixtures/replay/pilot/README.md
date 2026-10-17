# Instrumented Electron HTTP capture pilot

This pilot runs the installed Blanc **1.36.0 source**, extracted into a temporary
folder, on checksum-verified stock Electron **44.8.0**. It wraps the existing
coordinator's provider decision method in that extracted copy. It does not
replace request listeners, evaluate synthetic requests against an engine, or
use the blocker-disabled `BLANC_TEST=1` mode. The installed app is read only.

A loopback HTTP proxy serves only five exact fixture URLs, preserving their
original scheme, authority, path and query. It never forwards unknown traffic.
TLS CONNECT receives 502. Browser DNS is disabled except loopback as an extra
restriction. The fixture page issues real script/fetch requests; allowed traffic
must appear at the proxy under its original URL and Host, while blocked traffic
must have a real provider decision and no proxy arrival. Both regular and private
tabs are exercised through the Island's existing `browserAPI` methods.

This is an **authored fixture pilot**, not the required real-page capture corpus
of 2,000 blocked and 2,000 allowed requests. It is also not signed-package
acceptance: the instrumentation changes the unpackaged bootstrap and uses a
stock Electron executable. No performance claim is valid from a synchronous
logging wrapper. TLS, original-site response acquisition, request correlation,
workers, service workers, redirects and post-teardown keepalive remain pending.

The raw log retains hook inputs (`referrer`, optional `initiator`, frame and tab
URLs, resource type), the actual session's persistence/profile classification,
provider readiness and its unchanged decision. Ghostery's Electron adapter
constructs its effective source URL from `referrer`; that is not necessarily the
browser's true initiator origin. The later normalization step must preserve this
difference rather than guessing missing initiators from expected fixture data.
Raw logs are deliberately not passed off as validator-ready acceptance records.

## Run

Use explicit tool paths; there is no dependency or native build change:

```
node pilot/run.mjs ELECTRON_EXECUTABLE INSTALLED_APP_ASAR ASAR_MODULE_JS PLAYWRIGHT_INDEX_MJS NEW_EVIDENCE_DIRECTORY
```

The evidence directory must be new. The runner extracts into an OS temp folder,
precreates both profile directories, disables telemetry/search suggestions,
launches only that source copy, and removes its disposable app/profile tree
after its owned process exits. It records the installed ASAR digest before and
after, source/filter hashes, browser version, DOM outcomes, actual decisions and
proxy arrivals. Failed runs retain their evidence as failures. The installed
browser and both Chromium prototype profiles are never attached or controlled.

Proxy-only tests (require permission to bind a loopback socket):

```
node --test pilot/proxy-test.mjs
```
