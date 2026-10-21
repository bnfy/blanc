# Offline HTTPS capture checkpoint — October 17, 2026

This extends the merged HTTP pilot to an origin-preserving **offline HTTPS**
transport. It is authored fixture traffic, not the 4,000-request acceptance
corpus. Native builds: **0**. No Chromium source, output, toolchain or profile
was changed. The installed Blanc ASAR was read only and has the same digest
before/after every run. No system or login-keychain trust was installed.

## Measured result

- [HTTPS 01](https-01/report.json): first HTTPS run passed in regular/private
  Sessions. Source hash fields for the transport and certificate factory were
  then added to the report; this first report is retained unchanged.
- [HTTPS 02](https-02/report.json): passed with the complete source hashes.
- [HTTPS 03](https-03/report.json): final measured run passed after correcting
  a stale HTTP-only comment in the proxy. All five current
  implementation hashes (runner, bootstrap, transport, certificate factory and
  trust verifier) match the committed files.
- [HTTP regression](http-regression/report.json): original HTTP mode still passes
  in both profiles with the final harness.

Each run observed **12 fixture decisions: 8 allow, 4 cancel**. All ten fixture
subresource calls carried the actual page-origin initiator, including two
no-referrer fetches with empty referrers. Browser-started navigations genuinely
lacked an initiator. The full logs retain every provider onBeforeRequest call,
including internal/non-fixture calls; those are not counted as acceptance traffic.
Allowed fixture requests reached the proxy with their HTTPS URL and original
Host unchanged. All allowed HTTPS arrivals were encrypted. Neither blocked
fixture URL reached the proxy; the real provider returned its original cancel.

The certificate-decision logs show accepted fixture certificates in both actual
Sessions and the original `net::ERR_CERT_AUTHORITY_INVALID` result before the
fixture verifier. This is **explicit test trust**, not production TLS acceptance.
A fresh one-day CA signs a leaf restricted to the four fixture hosts. The
session-local callback accepts only that exact leaf with a valid CA signature,
matching hostname/SAN and valid dates; everything else is rejected. No broad
certificate-error switch or OS trust import is used. The proxy has no upstream
forwarding code; CONNECT ends at its own TLS socket and unknown authorities,
ports or inconsistent SNI/Host are refused.

All four owned Electron processes exited; all four disposable app/profile/CA
and key directories were removed and the proxies closed. Reports retain only
public certificate fingerprints, not private keys. Original six HTTP attempts
and run 07 remain in the previous dated evidence directory.

## Validation and invocations

`node --test .../pilot/proxy-test.mjs .../pilot/tls-test.mjs`: **8/8 passed**.
The five TLS tests exercise the scoped verifier (pin, CA, hostname and expiry),
verified CONNECT response, untrusted-CA rejection, unknown authority/port refusal,
and Host/tunnel mismatch. The three HTTP restrictions still pass.

Run commands used the same explicit paths documented in the pilot README:

```sh
BLANC_F12_TLS=1 node experiments/chromium-extension-spike/fixtures/replay/pilot/run.mjs /private/tmp/blanc-f12-runtime/dist/Electron.app/Contents/MacOS/Electron /Applications/Blanc.app/Contents/Resources/app.asar /private/tmp/blanc-electron-drag-fix/node_modules/@electron/asar/lib/asar.js /private/tmp/blanc-electron-drag-fix/node_modules/playwright/index.mjs /private/tmp/blanc-f12-https-pilot-01
BLANC_F12_TLS=1 node experiments/chromium-extension-spike/fixtures/replay/pilot/run.mjs /private/tmp/blanc-f12-runtime/dist/Electron.app/Contents/MacOS/Electron /Applications/Blanc.app/Contents/Resources/app.asar /private/tmp/blanc-electron-drag-fix/node_modules/@electron/asar/lib/asar.js /private/tmp/blanc-electron-drag-fix/node_modules/playwright/index.mjs /private/tmp/blanc-f12-https-pilot-02
BLANC_F12_TLS=1 node experiments/chromium-extension-spike/fixtures/replay/pilot/run.mjs /private/tmp/blanc-f12-runtime/dist/Electron.app/Contents/MacOS/Electron /Applications/Blanc.app/Contents/Resources/app.asar /private/tmp/blanc-electron-drag-fix/node_modules/@electron/asar/lib/asar.js /private/tmp/blanc-electron-drag-fix/node_modules/playwright/index.mjs /private/tmp/blanc-f12-https-pilot-03
node experiments/chromium-extension-spike/fixtures/replay/pilot/run.mjs /private/tmp/blanc-f12-runtime/dist/Electron.app/Contents/MacOS/Electron /Applications/Blanc.app/Contents/Resources/app.asar /private/tmp/blanc-electron-drag-fix/node_modules/@electron/asar/lib/asar.js /private/tmp/blanc-electron-drag-fix/node_modules/playwright/index.mjs /private/tmp/blanc-f12-http-pilot-08
```

Here `node` was the bundled runtime at
`/Users/anthonyjloria/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node`.
OpenSSL's measured version is in each HTTPS report. Start/end timestamps are run
wall clocks, not active owner/agent attention. No cold-build time is added.

## Still pending

- Actual permitted real-page response acquisition and 2,000 blocked + 2,000
  allowed oracle requests; captured acceptance-corpus requests remain **0**.
- Chromium 157 fixture trust and identical-response replay; the transport is
  reusable but no fork-side comparison is claimed here.
- Stable request/hop correlation, redirects, workers/service workers, opaque
  origins, teardown traffic and the rest of the coverage audit.
- Cosmetic/scriptlet outcomes and native interception-to-decision latency.

Task 0's Google-endpoint version-upgrade gate remains open. No baseline promotion
or shipping Electron behavior change is included.
