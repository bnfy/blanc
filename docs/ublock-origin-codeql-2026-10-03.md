# PR #490 CodeQL triage — October 3, 2026

The initial PR scan reports **40 open alerts**, numbered 72–111. Of these,
39 point into the immutable uBO 1.75.0 snapshot and one points into Blanc's
legacy-extension migration. The API also returns 20 previously dismissed alerts;
those are not new findings from this integration and their disposition was not
changed. A scan finding is not itself proof of an exploitable vulnerability.

This is an initial source-level triage, **not security clearance**. No alert was
dismissed, no directory was excluded from CodeQL, and no query was disabled.
The PR remains draft and every public platform/distribution gate stays closed.

## Fixes in this follow-up

- **99 — cleanup marker file race:** use exclusive `wx` creation, so a file or
  symlink inserted after the existence check cannot be followed or overwritten.
  Regression tests exercise concurrent marker insertion and actual symlink
  substitution, and preserve managed uBO state and website service workers.
  The migration marker is still written only after successful cleanup.
- **84, 85 — predictable security tokens:** the deployed adaptation replaces
  `Math.random()` in `vAPI.randomToken` and `vAPI.generateSecret` with isolated-realm
  `crypto.getRandomValues`. Each segment has 128 random bits; content identifiers
  retain a CSS-safe alphabetic prefix. Tests execute the actual adapted functions,
  require cryptographic entropy, and reject fallback to `Math.random`.
  The 658 upstream files remain byte-identical. Because CodeQL scans that original
  snapshot, these two upstream-source alerts can remain visible even though the
  runtime adaptation is hardened. Do not dismiss them without reviewing the patch
  and deployed-byte evidence.

## Remaining source-level findings

Numbers are GitHub alert IDs in bnfy/blanc. These observations explain the actual
code context; they are not blanket exemptions for third-party code.

| Alerts | Source and observation | Disposition / next evidence |
| --- | --- | --- |
| 107, 109, 111 | `search-thread`, `diff-updater`, and `reverselookup-worker` receive messages in dedicated Workers created by extension code. These are not window message listeners receiving arbitrary origins. | Likely analysis-context false positives; confirm worker ownership and entry-point reachability before disposition. |
| 108, 110 | Inspector and picker UI accept a transferred MessagePort through a window message. A string discriminator alone is not sender authentication. The legitimate sender is an isolated content script in the parent webpage, so requiring the extension's own origin would break the tools. | Open trust-boundary review: test hostile parent/sibling messages and first-message races; choose a capability handshake based on observed behavior. |
| 101, 102 | The flagged reverse-lookup dictionaries are created with `Object.create(null)`, including resets. | No prototype setter exists on these dictionaries; retain this evidence for specific false-positive review. |
| 100 | Reverse lookup builds a plain local response object indexed by a filter string. This is not a write to the global Object prototype, but `__proto__` can still affect the response object's own prototype/serialization. | Open hardening item: exercise hostile filter keys through the worker and use a null-prototype result if needed. |
| 103–106 | `nobab2.js` constructs one expression beginning `^https?://`, with escaped hostname alternatives and a following `/`. CodeQL flags the component strings separately. | The complete expression is anchored and delimited; likely false positives, not an unanchored hostname authorization check. |
| 98 | Filter-diff fetching intentionally follows list/CDN metadata supplied through an extension-owned worker. | Review accepted schemes, redirects, metadata provenance and profile request policy; do not infer safety solely from worker isolation. |
| 97 | Code viewer fetches a URL and displays the response in CodeMirror. It also accepts its initial URL from the query string. | Intended resource inspection, but verify page reachability and URL/scheme policy before dismissing the request-forgery alert. |
| 95, 96 | CodeMirror HTML mixed-mode uses incorrectly escaped whitespace sequences in its closing-tag expression. | Real syntax-highlighting defect, not evidence of an HTML sanitizer bypass: this parser colors text. Assess a narrow adaptation/upstream update separately. |
| 92–94 | CodeMirror CSS color recognition uses `A-f`, accepting extra characters. | Real syntax-highlighting defect; it marks tokens as errors and is not a security allowlist. |
| 91 | Cookie value expression deliberately uses ASCII ranges excluding semicolon and backslash; surrounding comments document permitted browser deviations from RFC cookie grammar. | Review against actual cookie serialization, not the visual appearance of the character class. |
| 90 | Google IMA's synthetic ad SDK checks page DOM for an Engadget compatibility branch. It does not use the substring as a privilege/hostname allowlist. | Likely security-context false positive; changing it to host authorization would change the shim's purpose. |
| 72–75, 86–89 | Click-to-load and strict-block pages take navigation targets from query parameters, then set an href or navigate. Each sink has both XSS and redirect findings. | Open: verify malicious schemes/encoded inputs under the actual Electron page CSP, navigation guards and permissions. Prefer explicit allowed-scheme validation as defense in depth; CSP alone is not sufficient evidence to dismiss. |
| 83, 80 | `requote` serializes filter-language text; scriptlet executable argument injection separately uses JSON serialization. | Trace downstream DSL consumers before changing escaping; these are not automatically JavaScript injection sinks. |
| 82 | Permissions-Policy directive construction replaces the first pipe separator only. | Open grammar review and multi-separator/header fixture; no finding dismissed on assumption that one separator is sufficient. |
| 81 | Picker hostname branch is guarded by `^\w[\w.-]*[a-z]$` before dot escaping; backslashes cannot enter that branch. | The specific missing-backslash-escape alert is mitigated by the preceding character allowlist. |
| 79 | Logger builds Markdown export text, escaping table pipes. | Review export consumers; Markdown formatting is not itself privileged HTML execution. Do not claim complete Markdown sanitization. |
| 78 | CodeMirror XML mode recognizes comment delimiters for syntax highlighting, not sanitization of HTML inserted into a DOM. | Likely security-context false positive. |
| 76 | Logger assigns `location.replace('#' + select.value)`. The literal fragment prefix prevents switching to a JavaScript URL; there is no HTML parsing sink in this operation. | Likely false positive for DOM XSS. |
| 77 | Noscript spoofing intentionally parses page-owned noscript text into DOM nodes. | Open behavior/trust review: exercise event attributes and scripting-disabled pages under real CSP; intentional DOM reconstruction alone is not an exemption. |

## Separate CI failures

The new native matrix's shallow checkout lacked immutable release tags/commits
required by five existing unit evidence checks. This follow-up fetches full
history. Windows additionally exposes platform assumptions in the general unit
suite (POSIX paths, file modes, and other existing fixtures); those failures have
not been waived or bypassed and may still prevent the native suites from running.

Substrate failed the dependency policy on advisory `GHSA-CH52-4W7C-C8XP` in root/site
dependency trees. That is a separate dependency-audit finding, not one of the
40 CodeQL alerts. It remains unresolved by this patch.

## Validation

- The full local unit suite passed: 2,089 tests.
- Eight focused cleanup/package tests passed, including concurrent marker and
  symlink substitution and cryptographic generation from the adapted bytes.
- `npm run lint` and `npm run ublock:check` passed. Adaptation now changes/adds 67
  files; filtering-engine modules remain upstream.
- `npm run test:ublock:desktop` passed with real blocking, native tools/picker,
  redirects/CSP/scriptlets/dynamic rules, backup/restore, private/profile isolation,
  deadlines, crash recovery and sandboxed views after token hardening.

Fresh hosted scan and platform results should be read from the follow-up commit's
checks. Source-level observations above do not replace adversarial runtime tests
or platform acceptance. In particular, this document does not mark the remaining
37 alerts fixed.
