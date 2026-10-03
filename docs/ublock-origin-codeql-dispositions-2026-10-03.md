# Individual uBO CodeQL recommendations — October 3, 2026

These are technical review recommendations for the **39 specific immutable
upstream alerts**, not GitHub dismissals, owner risk acceptance or distribution
clearance. All 39 remain open and scanning remains enabled. The PR is draft.
No directory exclusion, query waiver or bulk disposition was made.

The fresh merge-ref scan at `ae991e43` had exactly the baseline alert numbers,
rules and locations, with no new Blanc alert. The baseline binds each original
file to its digest. Host adaptations are separately generated and byte-checked;
CodeQL still sees the original upstream source at these locations.

`node scripts/audit-ublock-codeql-contexts.cjs` reproduces the offline context
probes against verified source bytes and checks every baseline source digest.
The focused security tests exercise actual adapted functions and bootstrap code.
The native real-blocking suite exercises original tools, resource permissions,
blocking and the combined Permissions Policy regression. A maintained native
`test:ublock-noscript:desktop` regression and a fresh macOS arm64 result are
[recorded below](evidence/2026-10-03-ubo-codeql-contexts/README.md); this is not
all-platform installed acceptance.

| Alert | Upstream location | Recommendation | Specific evidence / limit |
| --- | --- | --- | --- |
| 72 | `js/click2load.js:38` | Mitigated in deployed adaptation | Parsed HTTP(S) target required before href/navigation or exception creation; executable/local/internal/encoded malformed schemes rejected by actual host tests. Ordinary external web navigation remains intentional. |
| 73 | `js/click2load.js:51` | Mitigated in deployed adaptation | Parsed HTTP(S) target required before href/navigation or exception creation; executable/local/internal/encoded malformed schemes rejected by actual host tests. Ordinary external web navigation remains intentional. |
| 74 | `js/document-blocked.js:88` | Mitigated in deployed adaptation | Parsed HTTP(S) target required before href/navigation or exception creation; executable/local/internal/encoded malformed schemes rejected by actual host tests. Ordinary external web navigation remains intentional. |
| 75 | `js/document-blocked.js:207` | Mitigated in deployed adaptation | Parsed HTTP(S) target required before href/navigation or exception creation; executable/local/internal/encoded malformed schemes rejected by actual host tests. Ordinary external web navigation remains intentional. |
| 76 | `js/logger-ui.js:1086` | Security-context false positive recommended | Sink prefixes select value with a literal fragment marker. Hash parsing accepts only an existing owned-tab option; this cannot become an executable URL or HTML parsing operation. |
| 77 | `js/scriptlets/noscript-spoof.js:70` | No exploit observed under required scripting policy | Maintained native Electron 44.5.1 regression uses the actual no-scripting switch, active-payload controls and noscript reconstruction: fallback rendered; original/inserted scripts, error attribute, JavaScript link and meta redirect did not execute; Node unavailable. Upstream refuses reconstruction when noScriptingCSP differs from its default. Re-test if that policy changes. |
| 78 | `lib/codemirror/mode/xml/xml.js:82` | Security-context false positive recommended | CodeMirror XML tokenizer recognizes comments and returns token styles; it neither removes unsafe HTML nor authorizes DOM insertion. It is not an HTML sanitizer. |
| 79 | `js/logger-ui.js:2781` | No privileged execution sink; export limitation retained | Markdown table formatting reaches the export textarea through textContent, then explicit clipboard copy. It is not complete Markdown/HTML sanitization for a later external consumer; pasted exports must still be treated as untrusted text. |
| 80 | `js/scriptlet-filtering-core.js:95` | Security-context false positive recommended | requote is used by decompile to create filter text for diagnostics. Executable scriptlet arguments instead use JSON.stringify in patchScriptlet; toLogger consumes details.filters as text, separately from injected code. |
| 81 | `js/scriptlets/epicker.js:651` | Preceding allowlist prevents reported escape bypass | The pure-hostname branch requires the whole value to match letters/digits/underscore/dot/hyphen and a letter suffix. Backslashes cannot reach its dot-only replacement; the other branch escapes regex metacharacters. |
| 82 | `js/traffic.js:1148` | Verified bug; mitigated in header adaptation | Only the first pipe was replaced. [Independent stock Brave 1.96.61 evidence](evidence/2026-10-03-ubo-permissions-stock-brave/README.md) reproduces the official uBO 1.75.0 bug, exact headers, two-directive control and disabled-extension control. Reported upstream as [uBlockOrigin/uBlock-issues#4145](https://github.com/uBlockOrigin/uBlock-issues/issues/4145); filing the issue does not establish an upstream fix. Native three-directive fixture left camera/microphone/geolocation allowed before the fix, and denies all three after it. replaceAll changes header serialization only. Regression preserves pre-existing headers and exception decisions. |
| 83 | `js/static-net-filtering.js:464` | Security-context false positive recommended | LogData.requote serializes modifier/header/IP values into raw diagnostic filter text. It is not JavaScript generation; matching and compiled modifier data use their original structured values. |
| 84 | `js/vapi-client.js:47` | Mitigated in deployed adaptation | Actual adapted token generators use isolated crypto.getRandomValues with 128 bits per segment; no Math.random fallback. Executed unit probes and native one-use resource authorization pass. |
| 85 | `js/vapi-background.js:92` | Mitigated in deployed adaptation | Actual adapted token generators use isolated crypto.getRandomValues with 128 bits per segment; no Math.random fallback. Executed unit probes and native one-use resource authorization pass. |
| 86 | `js/click2load.js:38` | Mitigated in deployed adaptation | Parsed HTTP(S) target required before href/navigation or exception creation; executable/local/internal/encoded malformed schemes rejected by actual host tests. Ordinary external web navigation remains intentional. |
| 87 | `js/click2load.js:51` | Mitigated in deployed adaptation | Parsed HTTP(S) target required before href/navigation or exception creation; executable/local/internal/encoded malformed schemes rejected by actual host tests. Ordinary external web navigation remains intentional. |
| 88 | `js/document-blocked.js:88` | Mitigated in deployed adaptation | Parsed HTTP(S) target required before href/navigation or exception creation; executable/local/internal/encoded malformed schemes rejected by actual host tests. Ordinary external web navigation remains intentional. |
| 89 | `js/document-blocked.js:207` | Mitigated in deployed adaptation | Parsed HTTP(S) target required before href/navigation or exception creation; executable/local/internal/encoded malformed schemes rejected by actual host tests. Ordinary external web navigation remains intentional. |
| 90 | `web_accessible_resources/google-ima.js:482` | Security-context false positive recommended | Google IMA surrogate inspects Engadget text in page-owned player DOM to choose a compatibility behavior. This substring grants no extension/host privilege and is not hostname authorization. |
| 91 | `js/resources/cookie.js:118` | Intentional cookie range; reported delimiter risk not reproduced | Actual setCookieFn probe percent-encodes semicolon, backslash, newline and NUL values before cookie serialization. The documented ASCII ranges exclude those delimiters; ordinary cookie encoding remains intact. |
| 92 | `lib/codemirror/mode/css/css.js:231` | Real syntax-highlighting defect; not a security sanitizer | A-f admits extra characters (actual probe misclassifies #GGG). The CSS mode sets an editor error style; it does not grant a browser feature or sanitize executable content. Upstream code retained, correction can follow a reviewed upstream update. |
| 93 | `lib/codemirror/mode/css/css.js:231` | Real syntax-highlighting defect; not a security sanitizer | A-f admits extra characters (actual probe misclassifies #GGG). The CSS mode sets an editor error style; it does not grant a browser feature or sanitize executable content. Upstream code retained, correction can follow a reviewed upstream update. |
| 94 | `lib/codemirror/mode/css/css.js:231` | Real syntax-highlighting defect; not a security sanitizer | A-f admits extra characters (actual probe misclassifies #GGG). The CSS mode sets an editor error style; it does not grant a browser feature or sanitize executable content. Upstream code retained, correction can follow a reviewed upstream update. |
| 95 | `lib/codemirror/mode/htmlmixed/htmlmixed.js:53` | Real syntax-highlighting defect; not a security sanitizer | Actual getTagRegexp matches an ordinary closing tag but misses whitespace variants because string escapes are wrong. It chooses a CodeMirror text mode, never authorizes DOM/HTML execution. Upstream code retained. |
| 96 | `lib/codemirror/mode/htmlmixed/htmlmixed.js:53` | Real syntax-highlighting defect; not a security sanitizer | Actual getTagRegexp matches an ordinary closing tag but misses whitespace variants because string escapes are wrong. It chooses a CodeMirror text mode, never authorizes DOM/HTML execution. Upstream code retained. |
| 97 | `js/code-viewer.js:102` | Mitigated; intended user-directed resource inspection | Adapted viewer accepts HTTP(S) or its own extension scheme/host only, omits credentials and displays response in CodeMirror as text. Cross-extension/local/executable schemes refused. Arbitrary HTTP(S) inspection is intentional, not an origin-isolation guarantee for exports. |
| 98 | `js/diff-updater.js:190` | Mitigated schemes; intended subscription update network | Actual adapted resolveURL accepts only HTTP(S) after resolution. Diff inputs come through the extension-owned updater and updates remain data, not executable resources. User-selected subscriptions necessarily permit outbound HTTP(S); this is not an Internet-only network allowlist. |
| 100 | `js/reverselookup-worker.js:86` | Mitigated in deployed adaptation | Reverse-lookup network response now has a null prototype. Actual adapted worker probe preserves a literal __proto__ key through structured clone without changing a prototype. |
| 101 | `js/reverselookup-worker.js:286` | Existing null-prototype dictionary; false positive recommended | fromExtendedFilter response is Object.create(null) before indexed writes; no inherited __proto__ setter exists. Keys are diagnostic filter text rather than writes to the global Object prototype. |
| 102 | `js/reverselookup-worker.js:312` | Existing null-prototype dictionary; false positive recommended | Actual immutable worker probe stores __proto__ as an own list key. Its initial map and resetLists replacement both retain null prototypes; reset removes the entry. |
| 103 | `web_accessible_resources/nobab2.js:33` | Whole-expression anchor defeats reported hostname bypass | Component string is joined into a ^https?:// expression with escaped hostname alternatives and a following slash. Actual script accepts four intended hosts and rejects suffix-host, query-embedded host, userinfo and wrong-scheme inputs. It is a webpage surrogate, not a host privilege grant. |
| 104 | `web_accessible_resources/nobab2.js:34` | Whole-expression anchor defeats reported hostname bypass | Component string is joined into a ^https?:// expression with escaped hostname alternatives and a following slash. Actual script accepts four intended hosts and rejects suffix-host, query-embedded host, userinfo and wrong-scheme inputs. It is a webpage surrogate, not a host privilege grant. |
| 105 | `web_accessible_resources/nobab2.js:35` | Whole-expression anchor defeats reported hostname bypass | Component string is joined into a ^https?:// expression with escaped hostname alternatives and a following slash. Actual script accepts four intended hosts and rejects suffix-host, query-embedded host, userinfo and wrong-scheme inputs. It is a webpage surrogate, not a host privilege grant. |
| 106 | `web_accessible_resources/nobab2.js:36` | Whole-expression anchor defeats reported hostname bypass | Component string is joined into a ^https?:// expression with escaped hostname alternatives and a following slash. Actual script accepts four intended hosts and rejects suffix-host, query-embedded host, userinfo and wrong-scheme inputs. It is a webpage surrogate, not a host privilege grant. |
| 107 | `js/codemirror/search-thread.js:81` | Dedicated Worker context; origin-check false positive recommended | search-thread listener is behind WorkerGlobalScope/self-instance guards. Its extension page constructs a dedicated Worker from a fixed same-extension path and retains the handle; a webpage window postMessage cannot target that Worker listener. |
| 108 | `js/dom-inspector.js:54` | Authenticated deployed tool handshake | Single-use 128-bit capability is issued through native extension messaging and bound to regular profile, WebContents, parent frame, isolated current document and inspector. Forged-first, sibling, private/unmapped, stale, disabled and replay tests reject. Original inspector loads and reconnects in native suite. |
| 109 | `js/diff-updater.js:270` | Dedicated Worker context; origin-check false positive recommended | assets.js creates a dedicated Worker at fixed js/diff-updater.js and sends structured update records through the private Worker handle. Its self.onmessage is not a Window message receiver; the separate network scheme finding is reviewed as 98. |
| 110 | `js/epicker-ui.js:899` | Authenticated deployed tool handshake | Same document/frame/profile-bound native capability as inspector, scoped to picker. Hostile webpage parent repeatedly transferred forged ports to the actual picker and got no replies; genuine picker continued to work. Invalid first messages do not consume the bootstrap listener. |
| 111 | `js/reverselookup-worker.js:303` | Dedicated Worker context; origin-check false positive recommended | reverselookup.js creates a dedicated Worker at fixed js/reverselookup-worker.js. Inputs arrive through its retained private handle; worker-local dictionaries/results are assessed individually in 100–102. |

## Native noscript and header probes

Official Electron 44.5.1 / uBO 1.75.0, macOS arm64, real blocking enabled,
isolated temporary profile, sandbox enabled and Node disabled:

- The actual `no-scripting` switch triggered original noscript reconstruction.
  Fallback content appeared. An inline error handler, a JavaScript link, an
  inserted script and executable meta refresh each failed to execute, as did the
  original inline script. No event-handler marker request reached the fixture
  server. `typeof require` remained `undefined`. This supports the specific
  required-CSP context for 77; it does not license arbitrary DOM parsing outside
  that context.
- One combined `permissions=camera=()|microphone=()|geolocation=()` custom filter
  left all three native feature-policy controls true before adaptation and false
  after adaptation. A unit regression also failed on the original separator
  behavior and passed after correction. Filter matching, scriptlet resources and
  the official upstream inventory are unchanged; only header serialization is
  adapted. [Official permissions syntax](https://github.com/gorhill/uBlock/wiki/Static-filter-syntax#permissions)
  specifies replacing the separators.

[Durable probe evidence](evidence/2026-10-03-ubo-codeql-contexts/README.md)
now preserves the three earlier native JSON outputs and a fresh, reproducible
source-context report. The native probe fixture itself was not retained and
those earlier native observations were not rerun for their evidence commit.
The subsequent maintained noscript regression now supplies a fresh reproducible
run, with the original logs retained as historical observations. These are not release attestations or
all-platform installed acceptance. The source-level recommendations remain
inspectable against the pinned package.

Before changing GitHub dispositions, review the evidence for each numbered
alert and its exact deployed version. Do not characterize the real editor
formatting defects or external Markdown export limits as complete sanitization.
The closed distribution gate and installed-platform requirements remain separate.
