# Chrome Web Store native crash — September 11, 2026

## Root cause

The owner's Blanc 1.16.0 macOS crash report records `EXC_BAD_ACCESS` at address
zero on the browser-process main thread. Electron 44.2.0 symbols resolve the
top frame to `extensions::WebstorePrivateGetReferrerChainFunction::Run()` in
`extensions/browser/api/webstore_private/webstore_private_api.cc:1440`.

Electron PR #53752 identifies the same failure. Chromium 152 moved
`webstorePrivate` into the core extensions registry, which made the unsupported
API visible to ordinary pages on `https://chromewebstore.google.com`. Electron
does not provide the required delegate, and the Web Store page's API call
dereferences it. Electron 43 predates the regression. The upstream fix removes
the API from web pages; its 44.x backport is PR #53776.

At the time of this change, #53776 remained open and Electron 44.3.0 did not
contain the fix. Downgrading Blanc would also downgrade Chromium and disturb
the release-verified screen-sharing/runtime baseline, so it is not an
acceptable recovery.

## Blanc guard

Until Blanc can update to an Electron release containing the upstream fix,
each browsing session owns one `onBeforeRequest` policy that rejects document
loads for the exact Chrome Web Store host before Chromium creates the document.
It covers main frames and subframes in Personal, private, and named-profile
sessions. It remains active when Blanc Blocker is off, when a site exception is
present, and in the acceptance harness. The existing ad blocker continues to
receive every other eligible request through the same single Electron listener.

A blocked top-level navigation becomes a local `blanc://error` page explaining
that Blanc prevented a browser crash. This covers direct address-bar loads,
restored quiet tabs, links, redirects, and popups because the session request
policy runs below those entry points. No other Google or Chrome host is blocked.

Remove the guard only after the selected Electron package is verified to
contain #53752 or its branch backport and a real Electron regression proves the
Chrome Web Store page no longer exposes the unsupported API.

## Verification

- `test/unit/chrome-web-store-guard.test.js` pins exact-host parsing, document
  scope, guard precedence over blocker exceptions, and ordinary blocker
  delegation.
- `npm run test:web-store-guard` launches Electron 44.3.0 with an isolated
  profile and Blanc Blocker disabled, navigates the active tab to a Chrome Web
  Store detail URL, observes the local explanation page, and confirms the
  browser process remains alive with no uncaught main-process exception.
- The smoke is part of `release:verify:press` so a future release cannot omit
  this gate while the workaround remains.

This guard is not present in public v1.16.1. Shipping it requires a new version
and the normal immutable release and updater evidence.
