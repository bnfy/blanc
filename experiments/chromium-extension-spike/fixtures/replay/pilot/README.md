# Instrumented Electron HTTP capture pilot

This pilot runs the installed Blanc **1.36.0 source**, extracted into a temporary
folder, on checksum-verified stock Electron **44.8.0**. It wraps the existing
coordinator's provider decision method in that extracted copy. It does not
replace request listeners, evaluate synthetic requests against an engine, or
use the blocker-disabled `BLANC_TEST=1` mode. The installed app is read only.

A loopback proxy serves only six exact HTTP or HTTPS fixture URLs, preserving their
original scheme, authority, path and query. It never forwards unknown traffic.
HTTP mode refuses CONNECT. HTTPS mode terminates only known fixture authorities locally;
unknown hosts/ports and mismatched SNI/Host are refused. Browser DNS is disabled except loopback as an extra
restriction. The fixture page issues real script/fetch requests; allowed traffic
must appear at the proxy under its original URL and Host, while blocked traffic
must have a real provider decision and no proxy arrival. Both regular and private
tabs are exercised through the Island's existing `browserAPI` methods.

This is an **authored fixture pilot**, not the required real-page capture corpus
of 2,000 blocked and 2,000 allowed requests. It is also not signed-package
acceptance: the instrumentation changes the unpackaged bootstrap and uses a
stock Electron executable. No performance claim is valid from a synchronous
logging wrapper. Original-site response acquisition, request correlation,
workers, service workers, redirects and post-teardown keepalive remain pending.

The observer logs **every provider `onBeforeRequest` call**, including non-fixture
and internal requests. The runner selects the six known URLs only for fixture
assertions; it does not filter the saved log. This observes calls that reach the
provider, not proof that every network path reaches it.

The raw log retains `initiatorOrigin` and its property-presence bit separately
from `referrer`, frame/top-frame origins, tab URL and resource type. The original
observer mistakenly read `initiator`, which is not this Electron API's property;
run 01–06 nulls are instrumentation loss, not evidence of a missing browser field.
[Electron 44.8.0's `ToDictionary`](https://github.com/electron/electron/blob/v44.8.0/shell/browser/api/electron_api_web_request.cc#L104-L144)
sets `initiatorOrigin` from `WebRequestInfo::initiator`, while referrer is separate.

Run 07 asserts actual page-origin initiators on all five subresources in each
profile, including a no-referrer fetch with an empty referrer. Browser-started
main-frame navigations have no initiator property. Never substitute `frame.origin`
or referrer for it: a requesting frame need not be the initiating origin.
Ghostery's Electron adapter uses `referrer` as its effective source URL; preserve
that engine input separately. Main-navigation top-frame normalization uses the
request URL's origin by explicit contract, retaining raw precommit frame values.
The per-field comparison table belongs to the replay contract in #907; no
validator comparison is waived by this capture fix. Workers, opaque origins and
redirect context still require dedicated runtime probes before corpus admission.
These raw logs are not validator-ready acceptance records.

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

## HTTPS mode

Set `BLANC_F12_TLS=1` on the same runner command. The fixtures and their embedded
URLs become HTTPS; assertions continue to use those original origins. A fresh
one-day CA and server leaf are generated with OpenSSL inside the disposable run
directory. The leaf has exact fixture-host SANs. The proxy terminates TLS itself;
it opens no outbound connection and never tunnels to a remote server.

Only the disposable Electron Sessions install `setCertificateVerifyProc` through
the extracted bootstrap. The callback checks the pinned generated leaf, its CA
signature, exact allowed hostname/SAN and both certificates' validity windows;
anything else is rejected. This is explicit session-local fixture trust, **not**
a global certificate-error override or macOS trust-store import. Trust decisions
retain Chromium's original verification error. No `--ignore-certificate-errors`
or process-wide TLS verification disable is used. The temporary CA, private keys,
app and profiles are removed when the owned browser exits. Keys are never evidence.

The same TLS response bytes can serve the eventual 157 replay, but **157 fixture
trust and browser replay are not implemented or tested here**. There is no claim
that the production certificate-validation path passed: this is a fixture trust
callback, deliberately limited to this ephemeral leaf and these offline hosts.

Run transport and trust tests with:

```
node --test pilot/proxy-test.mjs pilot/tls-test.mjs
```

Tests cover trusted and untrusted TLS, unknown CONNECT hosts/ports, Host/tunnel
mismatch, pinned-certificate/hostname/expiry rejection, and the original HTTP
proxy restrictions. The actual browser run asserts encrypted allowed arrivals,
correct initiators including no-referrer, unchanged real blocking decisions,
and accepted fixture verification in both regular/private Sessions. This remains
an authored transport pilot, not the real-page acceptance corpus.
