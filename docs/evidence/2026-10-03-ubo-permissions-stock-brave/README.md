# Stock Brave reproduction: uBO `$permissions` with three directives

Observed **2026-10-03, 18:04–18:07 UTC**. Prepared for owner review before an
upstream report. Nothing was posted upstream; no CodeQL alert was dismissed and
no scanning policy was changed.

## Result

**Reproduced in stock Brave with unmodified uBlock Origin 1.75.0.** A single
`$permissions` filter containing three directives leaves a `|` in the emitted
`Permissions-Policy` header. Chromium reports a header parsing error and all
three tested features remain allowed by document policy. The two-directive
control denies both features correctly.

| Requested step | Configuration | Expression result |
| --- | --- | --- |
| 3 | uBO enabled, camera + microphone + geolocation in one filter | `[true, true, true]` |
| 4 | uBO enabled, camera + microphone in one filter | `[false, false]` |
| 5 | Entire uBO extension disabled, page reloaded | `[true, true, true]` |

The additional three-feature expression in step 4 returned
`[false, false, true]`, confirming that the two-feature control did not deny
geolocation.

## Environment and provenance

- Browser: **Brave 1.96.61**, **Chromium 154.0.8037.98**, Official Build, arm64.
  Confirmed in `brave://version/` and through `Browser.getVersion`.
  This matched the current stable desktop release on the observation date:
  [official Brave release notes](https://brave.com/latest/), October 2, 2026.
- OS: **macOS 27.2, build 26B5091g, arm64**, confirmed by the browser version
  page and `sw_vers`. This OS build is recorded exactly; no other OS was tested.
- uBO: **1.75.0**, the only user-installed extension in a newly created, empty
  temporary browser profile. No profile migration, sign-in, or sync.
- Installed the [official Chromium ZIP](https://github.com/gorhill/uBlock/releases/download/1.75.0/uBlock0_1.75.0.chromium.zip)
  unpacked, with developer mode enabled in the disposable profile. ZIP SHA-256:
  `393cf95709d1074d4022970e9014e434395c53a822387f1e25f43be97cf4b582`.
  All **658 files** matched the official inventory hashes in `ublock/pinned.json`
  before testing and again when preparing this evidence. No extra files,
  adaptations, Blanc runtime, or patched browser were loaded.
- uBO's default lists and settings were retained; the only custom filter was
  the reproduction filter, subsequently replaced by the control filter.
  Default Brave Shields settings were retained. No other blocker extension was
  installed. The disabled-uBO control emitted no Permissions-Policy header.

The stock application was launched with these operator-supplied options;
filesystem paths are sanitized placeholders:

```text
Brave Browser
  --user-data-dir=<new-empty-temporary-profile>
  --remote-debugging-port=0
  --load-extension=<official-unmodified-extracted-uBO-directory>
  --no-first-run
  --no-default-browser-check
  brave://extensions/
```

No sandbox-disabling or MV2 feature-override flag was supplied. Playwright CLI
attached to the already running stock browser over its local debugging port;
it did not launch a Playwright-bundled browser.

## Reproduction and exact observations

1. Open uBO Dashboard → My filters, enter the following single filter, and
   click **Apply changes**:

   ```text
   ||example.com^$permissions=camera=()|microphone=()|geolocation=()
   ```

2. Open `https://example.com/` and evaluate:

   ```js
   ['camera','microphone','geolocation'].map(f => document.featurePolicy.allowsFeature(f))
   // [true, true, true]
   ```

   Expected: `[false, false, false]`. Actual browser console error:

   ```text
   Error with Permissions-Policy header: Parse of permissions policy failed because of errors reported by structured header parser.
   ```

   Exact observed response header value (one line, including the additional
   directives present with the default configuration):

   ```text
   Permissions-Policy: camera=(), microphone=()|geolocation=(), browsing-topics=(), run-ad-auction=(), join-ad-interest-group=(), private-state-token-redemption=(), private-state-token-issuance=(), private-aggregation=(), attribution-reporting=(), keyboard-map=(), idle-detection=(), compute-pressure=()
   ```

3. Replace the filter with the following, click **Apply changes**, and reload
   the same page:

   ```text
   ||example.com^$permissions=camera=()|microphone=()
   ```

   ```js
   ['camera','microphone'].map(f => document.featurePolicy.allowsFeature(f))
   // [false, false]
   ```

   Exact observed response header value:

   ```text
   Permissions-Policy: camera=(), microphone=(), browsing-topics=(), run-ad-auction=(), join-ad-interest-group=(), private-state-token-redemption=(), private-state-token-issuance=(), private-aggregation=(), attribution-reporting=(), keyboard-map=(), idle-detection=(), compute-pressure=()
   ```

4. Disable the **entire uBO extension** using Brave's extension manager, then
   reload `https://example.com/`. The two-directive filter remains stored but
   the extension is off:

   ```js
   ['camera','microphone','geolocation'].map(f => document.featurePolicy.allowsFeature(f))
   // [true, true, true]
   ```

   **No `Permissions-Policy` response header was present.** Without uBO there
   is no injected restriction to enforce; the allowed result is expected. The
   upstream form should describe this distinction rather than claiming that
   disabling uBO makes those three values false.

## Capture method and limits

Filters and extension enablement were changed through their ordinary UI.
The expressions above were executed in the page's default JavaScript context
using the browser's **DevTools Protocol `Runtime.evaluate`**, with
`returnByValue: true` and `includeCommandLineAPI: true`. These are captured
JavaScript return values, not a manually typed DevTools Console screenshot.
An additional Playwright page evaluation agreed for the three-directive case.

Headers came from Playwright CLI's `response-headers` for the actual HTTPS
navigation responses (all HTTP 200), not from source-code reconstruction.
The collection harness did not intercept requests, mock responses, or modify
headers. The JSON records each response's Date header and the observed values.
Only the relevant response header is retained; unrelated request metadata,
profile paths, extension IDs, browser logs, and user information are omitted.

`allowsFeature()` describes document policy, not an OS/browser permission
grant. No camera, microphone, or geolocation access was requested or granted.
This evidence establishes the stock-browser defect, not the effectiveness of
Blanc's adaptation or acceptance on other platforms.

## Troubleshooting Information

[troubleshooting.txt](troubleshooting.txt) contains the exact text selected from
**uBO Dashboard → Support → Troubleshooting Information**, collected after the
three-directive case and before changing the filter. A final newline was added
for the text file. The `[array of 1 redacted]` marker is uBO's own default output;
the single test filter is disclosed above. `userSettings` and `hiddenSettings`
are both `[none]`.

[observations.json](observations.json) contains the sanitized structured
observations and package/source digests.

## Upstream source reference

On the observation date, `gorhill/uBlock` master resolved to
`01092d95dbc7d91599a5ad017d5b98aba1118659`.
Its [src/js/traffic.js at line 1148](https://github.com/gorhill/uBlock/blob/01092d95dbc7d91599a5ad017d5b98aba1118659/src/js/traffic.js#L1148)
contains:

```js
permissions.push(directive.value.replace('|', ', '));
```

That master file and the tested official release's `js/traffic.js` were
byte-identical, SHA-256
`a014cb1eb4d0332a2d2b1f073496f094c79b03e0bf3d29df6a7214a350c86969`.
Master itself was not installed as a separate extension build.

The [official `$permissions` documentation](https://github.com/gorhill/uBlock/wiki/Static-filter-syntax#permissions)
documents pipe-separated directives and their conversion to comma separators.
It also recommends separate filters for independent exception handling; that
recommendation does not change the observed serialization defect.

This folder is durable evidence for PR #490 / alert #82. Any upstream report or
GitHub disposition remains subject to owner review.
