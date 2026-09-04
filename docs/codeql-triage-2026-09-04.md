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
