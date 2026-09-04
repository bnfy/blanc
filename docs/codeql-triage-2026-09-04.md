# CodeQL triage — September 4, 2026

A successful analysis job does not mean there are no findings. GitHub returned 35 open alerts during this review. Findings remain open unless individually resolved with evidence.

## Error-page retry (#16, #26)

The destination assignment in `src/renderer/pages/error.js:42` is preceded by an anchored, case-insensitive allowlist for `http://`, `https://` and `file://`. The parameter is assigned to the link's href, not parsed as HTML, and displayed values use textContent. Allowing an arbitrary web destination on a browser's Retry action is intended navigation, not an application redirect authorization boundary.

The production file is byte-identical to public v1.15.0. `test/unit/error-page-retry.test.js` executes its actual source in an isolated VM and confirms rejection of javascript, data, vbscript, internal schemes, malformed separators, leading newlines and encoded separators, while preserving the three allowed scheme families. This is a source/DOM-property test, not a fresh packaged-browser execution claim. The two alerts are false positives for the reported executable-scheme/XSS and unintended-redirect conditions; file navigation remains governed by the browser's main-process policy.

## Screenshot server (#5–9, #30)

Confirmed development-tool issue: the server listened on all interfaces and accepted paths outside its preview root. The draft fix binds loopback, checks lexical and realpath containment, rejects malformed paths and reads/stats the same open handle. Tests cover traversal and symlink escapes. The local build tree remains trusted input; this is not a sandbox against a concurrent local process that can rewrite that tree.

## Import size races (#31–33)

`src/main/pages.js` checks a user-selected import path's size before reading it; `src/main/browser-data-import.js` repeats the pattern for discovered browser profile files. A file can change or grow between the check and read. The observed concern is bypassing the intended memory-size bound, not demonstrated remote code execution. The candidate now uses one open handle and a fixed byte-bounded buffer, rejecting growth beyond the configured limit before parsing. Tests exercise growth after stat, short reads, exact limits, UTF-8 and cleanup. These alerts remain unresolved on main until the fix lands and is reanalyzed. This is a runtime import change and needs affected-platform validation before merge/release.

## Other findings

Remaining test-fixture, source-generator and SEO-tooling alerts need individual source review. Do not dismiss them merely because their paths are under test or scripts. No project-wide vulnerability clearance or independent audit is claimed.

## Individually reviewed test-code false positives

| Alerts | Evidence | Disposition rationale |
| --- | --- | --- |
| #2 | `test/desktop/steps/quiet-tabs.steps.js:181` | Math.random creates a synthetic page-state marker for a leakage test, not an authentication secret, key or nonce. |
| #3, #4 | `src/main/test-hook.js:1750–1756`; `main.js` acceptanceTestMode gate | JSON.stringify encodes the supplied URL as a JS string literal. These deliberate navigation attack drivers run only in explicit unpackaged test mode, not a renderer-exposed production API. |
| #10 | `test/unit/bookmark-import.test.js:22`; `src/main/bookmark-import.js:51` | The test asserts that a javascript bookmark fixture was dropped; it is not the production allowlist. The parser uses anchored http(s)-only acceptance. |
| #11, #12 | `test/desktop/packaged-first-run-smoke.mjs:288,370` | urls is an array of complete page URL strings; includes is exact element membership, not substring host validation. |
| #13, #14, #15 | `test/unit/bench-memory.test.js:916,925,954` | missing is an array of absent URLs; includes is exact element membership in test assertions. |
| #27 | `test/unit/bench-memory.test.js:545` | Regex checks diagnostic text after asserting a benchmark cell failed. It does not authorize a host. |
| #28, #29 | `test/unit/public-truth.test.js:18,75` | Negative source-text assertions intentionally match forbidden remote-font/favicon domains anywhere in source. Anchoring would weaken the checks, not improve URL validation. |

These classifications follow the call semantics and data flow, not merely the files being tests. Other fixture/server alerts remain open.

## Serialization and SEO corrections

- #20/#21: Android XML string generation now escapes literal backslashes before quote escapes. Existing catalog output remains byte-identical; synthetic backslash/quote tests verify the correction.
- #44: internal-link classification compares parsed exact origins, including protocol-relative links; hostname suffix and userinfo lookalikes are rejected.
- #45: supported HTML entities are decoded in one pass, avoiding recursive decoding of nested ampersand entities.

These are tooling correctness fixes in the draft, not deployed runtime fixes. All three targeted tests, generator parity and syntax checks passed.

## Additional false-positive classifications

- #22–25 (`site/scripts/verify-parity.mjs`): script/comment removal creates normalized strings for equality comparison of trusted old/new build output. The result is compared in the CLI, never emitted as sanitized HTML or executed. The patterns are not an XSS sanitizer.
- #34 (`test/unit/site-changelog.test.js`): the test creates an isolated output directory, checks generated JSON, then intentionally appends a newline to verify stale-output detection. There is no authorization decision between checking and modifying a shared sensitive file.
