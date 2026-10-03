# Individual uBO CodeQL review and owner decisions — October 3, 2026

This records technical recommendations and the owner's supplied review
decisions for the **39 specific immutable upstream alerts**. On October 3,
the owner explicitly approved #77 for deferred **Won't fix**, superseding the
earlier hold and accepting the signed, notarized macOS arm64 probe evidence
committed in `130dabe3`, including its build-output launch limitation.
All 39 now have owner decisions. No alert has been dismissed; scanning remains
enabled and PR #490 remains draft. **Do not dismiss anything before PR #490
leaves draft.** Editing this document does not grant distribution clearance.

The supplied summaries name the GitHub reason for 30 approved alerts and give
an exact dismissal comment for #77, recorded below. For the nine non-blocking
alerts they refer to the reviewer's per-alert record. Those exact reasons, and
the verbatim comments for the original 38 approvals, must be obtained from that
record before execution, not reconstructed as words the owner approved.
The evidence column remains a technical assessment, not an approved comment.

The live comparison at code head `31b33196` matched the same 39 baseline
numbers, rules and paths. These decisions apply to the pinned source/adaptation
review; changed upstream bytes, mitigations or a new alert require fresh review.
At the agreed post-draft stage, apply all 39 decisions individually with their
recorded reasons/comments. Draft removal must not be inferred from this record.
Source/licensing clearance and installed-platform acceptance remain independent
release requirements.

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

| Alert | Upstream location | Recommendation | Owner decision | GitHub dismissal reason | Specific evidence / limit |
| --- | --- | --- | --- | --- | --- |
| 72 | `js/click2load.js:38` | Mitigated in deployed adaptation | Approved; defer while PR is draft | Won't fix | Parsed HTTP(S) target required before href/navigation or exception creation; executable/local/internal/encoded malformed schemes rejected by actual host tests. Ordinary external web navigation remains intentional. |
| 73 | `js/click2load.js:51` | Mitigated in deployed adaptation | Approved; defer while PR is draft | Won't fix | Parsed HTTP(S) target required before href/navigation or exception creation; executable/local/internal/encoded malformed schemes rejected by actual host tests. Ordinary external web navigation remains intentional. |
| 74 | `js/document-blocked.js:88` | Mitigated in deployed adaptation | Approved; defer while PR is draft | Won't fix | Parsed HTTP(S) target required before href/navigation or exception creation; executable/local/internal/encoded malformed schemes rejected by actual host tests. Ordinary external web navigation remains intentional. |
| 75 | `js/document-blocked.js:207` | Mitigated in deployed adaptation | Approved; defer while PR is draft | Won't fix | Parsed HTTP(S) target required before href/navigation or exception creation; executable/local/internal/encoded malformed schemes rejected by actual host tests. Ordinary external web navigation remains intentional. |
| 76 | `js/logger-ui.js:1086` | Security-context false positive recommended | Approved; defer while PR is draft | False positive | Sink prefixes select value with a literal fragment marker. Hash parsing accepts only an existing owned-tab option; this cannot become an executable URL or HTML parsing operation. |
| 77 | `js/scriptlets/noscript-spoof.js:70` | No exploit observed under required scripting policy | Approved explicitly; earlier hold superseded; defer while PR is draft | Won't fix | Owner accepted [signed, notarized macOS arm64 packaged evidence](evidence/ublock-noscript-signed-macos-2026-10-03/README.md) in `130dabe3`, including its build-output launch limitation. Actual uBO no-scripting switch, execution controls, fallback reconstruction and enforced default CSP were exercised; Node access was unavailable. Original upstream source remains byte-exact. Re-test if uBO changes its noScriptingCSP default. Exact approved comment is recorded below. |
| 78 | `lib/codemirror/mode/xml/xml.js:82` | Security-context false positive recommended | Approved; defer while PR is draft | False positive | CodeMirror XML tokenizer recognizes comments and returns token styles; it neither removes unsafe HTML nor authorizes DOM insertion. It is not an HTML sanitizer. |
| 79 | `js/logger-ui.js:2781` | No privileged execution sink; export limitation retained | Approved; defer while PR is draft | Won't fix | Markdown table formatting reaches the export textarea through textContent, then explicit clipboard copy. It is not complete Markdown/HTML sanitization for a later external consumer; pasted exports must still be treated as untrusted text. |
| 80 | `js/scriptlet-filtering-core.js:95` | Security-context false positive recommended | Approved; defer while PR is draft | False positive | requote is used by decompile to create filter text for diagnostics. Executable scriptlet arguments instead use JSON.stringify in patchScriptlet; toLogger consumes details.filters as text, separately from injected code. |
| 81 | `js/scriptlets/epicker.js:651` | Preceding allowlist prevents reported escape bypass | Approved; defer while PR is draft | False positive | The pure-hostname branch requires the whole value to match letters/digits/underscore/dot/hyphen and a letter suffix. Backslashes cannot reach its dot-only replacement; the other branch escapes regex metacharacters. |
| 82 | `js/traffic.js:1148` | Verified bug; mitigated in header adaptation | Approved; defer while PR is draft | Won't fix | Only the first pipe was replaced. [Independent stock Brave 1.96.61 evidence](evidence/2026-10-03-ubo-permissions-stock-brave/README.md) reproduces the official uBO 1.75.0 bug, exact headers, two-directive control and disabled-extension control. Reported upstream as [uBlockOrigin/uBlock-issues#4145](https://github.com/uBlockOrigin/uBlock-issues/issues/4145); filing the issue does not establish an upstream fix. Native three-directive fixture left camera/microphone/geolocation allowed before the fix, and denies all three after it. replaceAll changes header serialization only. Regression preserves pre-existing headers and exception decisions. |
| 83 | `js/static-net-filtering.js:464` | Security-context false positive recommended | Approved; defer while PR is draft | False positive | LogData.requote serializes modifier/header/IP values into raw diagnostic filter text. It is not JavaScript generation; matching and compiled modifier data use their original structured values. |
| 84 | `js/vapi-client.js:47` | Mitigated in deployed adaptation | Approved; defer while PR is draft | Won't fix | Actual adapted token generators use isolated crypto.getRandomValues with 128 bits per segment; no Math.random fallback. Executed unit probes and native one-use resource authorization pass. |
| 85 | `js/vapi-background.js:92` | Mitigated in deployed adaptation | Approved; defer while PR is draft | Won't fix | Actual adapted token generators use isolated crypto.getRandomValues with 128 bits per segment; no Math.random fallback. Executed unit probes and native one-use resource authorization pass. |
| 86 | `js/click2load.js:38` | Mitigated in deployed adaptation | Approved; defer while PR is draft | Won't fix | Parsed HTTP(S) target required before href/navigation or exception creation; executable/local/internal/encoded malformed schemes rejected by actual host tests. Ordinary external web navigation remains intentional. |
| 87 | `js/click2load.js:51` | Mitigated in deployed adaptation | Approved; defer while PR is draft | Won't fix | Parsed HTTP(S) target required before href/navigation or exception creation; executable/local/internal/encoded malformed schemes rejected by actual host tests. Ordinary external web navigation remains intentional. |
| 88 | `js/document-blocked.js:88` | Mitigated in deployed adaptation | Approved; defer while PR is draft | Won't fix | Parsed HTTP(S) target required before href/navigation or exception creation; executable/local/internal/encoded malformed schemes rejected by actual host tests. Ordinary external web navigation remains intentional. |
| 89 | `js/document-blocked.js:207` | Mitigated in deployed adaptation | Approved; defer while PR is draft | Won't fix | Parsed HTTP(S) target required before href/navigation or exception creation; executable/local/internal/encoded malformed schemes rejected by actual host tests. Ordinary external web navigation remains intentional. |
| 90 | `web_accessible_resources/google-ima.js:482` | Security-context false positive recommended | Approved; defer while PR is draft | False positive | Google IMA surrogate inspects Engadget text in page-owned player DOM to choose a compatibility behavior. This substring grants no extension/host privilege and is not hostname authorization. |
| 91 | `js/resources/cookie.js:118` | Intentional cookie range; reported delimiter risk not reproduced | Approved; defer while PR is draft | Exact reason in reviewer record; not supplied here | Actual setCookieFn probe percent-encodes semicolon, backslash, newline and NUL values before cookie serialization. The documented ASCII ranges exclude those delimiters; ordinary cookie encoding remains intact. |
| 92 | `lib/codemirror/mode/css/css.js:231` | Real syntax-highlighting defect; not a security sanitizer | Approved; defer while PR is draft | Exact reason in reviewer record; not supplied here | A-f admits extra characters (actual probe misclassifies #GGG). The CSS mode sets an editor error style; it does not grant a browser feature or sanitize executable content. Upstream code retained, correction can follow a reviewed upstream update. |
| 93 | `lib/codemirror/mode/css/css.js:231` | Real syntax-highlighting defect; not a security sanitizer | Approved; defer while PR is draft | Exact reason in reviewer record; not supplied here | A-f admits extra characters (actual probe misclassifies #GGG). The CSS mode sets an editor error style; it does not grant a browser feature or sanitize executable content. Upstream code retained, correction can follow a reviewed upstream update. |
| 94 | `lib/codemirror/mode/css/css.js:231` | Real syntax-highlighting defect; not a security sanitizer | Approved; defer while PR is draft | Exact reason in reviewer record; not supplied here | A-f admits extra characters (actual probe misclassifies #GGG). The CSS mode sets an editor error style; it does not grant a browser feature or sanitize executable content. Upstream code retained, correction can follow a reviewed upstream update. |
| 95 | `lib/codemirror/mode/htmlmixed/htmlmixed.js:53` | Real syntax-highlighting defect; not a security sanitizer | Approved; defer while PR is draft | Won't fix | Actual getTagRegexp matches an ordinary closing tag but misses whitespace variants because string escapes are wrong. It chooses a CodeMirror text mode, never authorizes DOM/HTML execution. Upstream code retained. |
| 96 | `lib/codemirror/mode/htmlmixed/htmlmixed.js:53` | Real syntax-highlighting defect; not a security sanitizer | Approved; defer while PR is draft | Won't fix | Actual getTagRegexp matches an ordinary closing tag but misses whitespace variants because string escapes are wrong. It chooses a CodeMirror text mode, never authorizes DOM/HTML execution. Upstream code retained. |
| 97 | `js/code-viewer.js:102` | Mitigated; intended user-directed resource inspection | Approved; defer while PR is draft | Won't fix | Adapted viewer accepts HTTP(S) or its own extension scheme/host only, omits credentials and displays response in CodeMirror as text. Cross-extension/local/executable schemes refused. Arbitrary HTTP(S) inspection is intentional, not an origin-isolation guarantee for exports. |
| 98 | `js/diff-updater.js:190` | Mitigated schemes; intended subscription update network | Approved; defer while PR is draft | Won't fix | Actual adapted resolveURL accepts only HTTP(S) after resolution. Diff inputs come through the extension-owned updater and updates remain data, not executable resources. User-selected subscriptions necessarily permit outbound HTTP(S); this is not an Internet-only network allowlist. |
| 100 | `js/reverselookup-worker.js:86` | Mitigated in deployed adaptation | Approved; defer while PR is draft | Won't fix | Reverse-lookup network response now has a null prototype. Actual adapted worker probe preserves a literal __proto__ key through structured clone without changing a prototype. |
| 101 | `js/reverselookup-worker.js:286` | Existing null-prototype dictionary; false positive recommended | Approved; defer while PR is draft | False positive | fromExtendedFilter response is Object.create(null) before indexed writes; no inherited __proto__ setter exists. Keys are diagnostic filter text rather than writes to the global Object prototype. |
| 102 | `js/reverselookup-worker.js:312` | Existing null-prototype dictionary; false positive recommended | Approved; defer while PR is draft | False positive | Actual immutable worker probe stores __proto__ as an own list key. Its initial map and resetLists replacement both retain null prototypes; reset removes the entry. |
| 103 | `web_accessible_resources/nobab2.js:33` | Whole-expression anchor defeats reported hostname bypass | Approved; defer while PR is draft | False positive | Component string is joined into a ^https?:// expression with escaped hostname alternatives and a following slash. Actual script accepts four intended hosts and rejects suffix-host, query-embedded host, userinfo and wrong-scheme inputs. It is a webpage surrogate, not a host privilege grant. |
| 104 | `web_accessible_resources/nobab2.js:34` | Whole-expression anchor defeats reported hostname bypass | Approved; defer while PR is draft | False positive | Component string is joined into a ^https?:// expression with escaped hostname alternatives and a following slash. Actual script accepts four intended hosts and rejects suffix-host, query-embedded host, userinfo and wrong-scheme inputs. It is a webpage surrogate, not a host privilege grant. |
| 105 | `web_accessible_resources/nobab2.js:35` | Whole-expression anchor defeats reported hostname bypass | Approved; defer while PR is draft | False positive | Component string is joined into a ^https?:// expression with escaped hostname alternatives and a following slash. Actual script accepts four intended hosts and rejects suffix-host, query-embedded host, userinfo and wrong-scheme inputs. It is a webpage surrogate, not a host privilege grant. |
| 106 | `web_accessible_resources/nobab2.js:36` | Whole-expression anchor defeats reported hostname bypass | Approved; defer while PR is draft | False positive | Component string is joined into a ^https?:// expression with escaped hostname alternatives and a following slash. Actual script accepts four intended hosts and rejects suffix-host, query-embedded host, userinfo and wrong-scheme inputs. It is a webpage surrogate, not a host privilege grant. |
| 107 | `js/codemirror/search-thread.js:81` | Dedicated Worker context; origin-check false positive recommended | Approved; defer while PR is draft | Exact reason in reviewer record; not supplied here | search-thread listener is behind WorkerGlobalScope/self-instance guards. Its extension page constructs a dedicated Worker from a fixed same-extension path and retains the handle; a webpage window postMessage cannot target that Worker listener. |
| 108 | `js/dom-inspector.js:54` | Authenticated deployed tool handshake | Approved; defer while PR is draft | Exact reason in reviewer record; not supplied here | Single-use 128-bit capability is issued through native extension messaging and bound to regular profile, WebContents, parent frame, isolated current document and inspector. Forged-first, sibling, private/unmapped, stale, disabled and replay tests reject. Original inspector loads and reconnects in native suite. |
| 109 | `js/diff-updater.js:270` | Dedicated Worker context; origin-check false positive recommended | Approved; defer while PR is draft | Exact reason in reviewer record; not supplied here | assets.js creates a dedicated Worker at fixed js/diff-updater.js and sends structured update records through the private Worker handle. Its self.onmessage is not a Window message receiver; the separate network scheme finding is reviewed as 98. |
| 110 | `js/epicker-ui.js:899` | Authenticated deployed tool handshake | Approved; defer while PR is draft | Exact reason in reviewer record; not supplied here | Same document/frame/profile-bound native capability as inspector, scoped to picker. Hostile webpage parent repeatedly transferred forged ports to the actual picker and got no replies; genuine picker continued to work. Invalid first messages do not consume the bootstrap listener. |
| 111 | `js/reverselookup-worker.js:303` | Dedicated Worker context; origin-check false positive recommended | Approved; defer while PR is draft | Exact reason in reviewer record; not supplied here | reverselookup.js creates a dedicated Worker at fixed js/reverselookup-worker.js. Inputs arrive through its retained private handle; worker-local dictionaries/results are assessed individually in 100–102. |

## Alert #77: approved deferred dismissal

The owner explicitly approved **Won't fix** when PR #490 leaves draft. This
supersedes the earlier hold: the owner accepted the signed, notarized macOS
arm64 evidence in `130dabe3`, even though the app ran from build output rather
than an installed copy. The evidence remains [available here](evidence/ublock-noscript-signed-macos-2026-10-03/README.md).

Use this exact owner-supplied dismissal comment:

> No script execution observed with uBO's no-scripting switch: signed, notarized macOS arm64 build passed the packaged probe. Original kept byte-exact; re-test if uBO changes its noScriptingCSP default.

No dismissal is authorized before the PR leaves draft. This security disposition
does not claim installed-machine results or clear other platforms. Continue the
following candidate protocol for platform acceptance and regression evidence:

1. Bind the installed candidate to its source commit, installer/app SHA-256,
   verified publisher/signature (and macOS notarization or Linux authenticated
   artifact record), OS/architecture, Electron version and uBO version. Use an
   isolated test profile and record relevant uBO settings. No personal URLs or
   profile data belong in the evidence.
2. Use the active-control and noscript payloads from the committed
   `test/desktop/ublock-noscript.mjs` fixture against the installed app. Drive the
   actual uBO no-scripting control; do not substitute a custom CSP or disable
   scripts through DevTools. The development harness's test hooks/flags are not
   available in packaged builds and do not establish installed acceptance.
3. With scripting allowed, prove the original/inserted scripts, image error
   handler and JavaScript link execute in the active control. Retain their
   expected marker requests, so a broken fixture cannot look protected.
4. Enable no-scripting and reload the fixture. Confirm the configured
   `noScriptingCSP` matches the pinned required default and record the actual
   response CSP. Fallback content must render and noscript reconstruction must
   occur. The original/inserted scripts, image error handler, clicked JavaScript
   link and executable meta refresh must not execute or navigate. Preserve the
   exact marker booleans, fixture-relative final path and absence of protected
   marker requests at the fixture server. Record Node access and renderer
   sandbox evidence without changing either policy. The meta-refresh case has
   no executable positive control in the current harness; state that limit.
5. Turn no-scripting off, reload, and prove the original script executes again.
   Save sanitized results under `docs/evidence/` with the platform/artifact
   identity and procedure. Any failure or unsupported observation stays open;
   CI, an unsigned build or a direct source run cannot replace these results.
6. Record candidate results and limits for platform acceptance. The security
   disposition for #77 is already approved; do not request it again. Its GitHub
   dismissal remains deferred until PR #490 leaves draft.

Signed bundled candidates themselves remain subject to distribution clearance.
The owner's approval of #77 does not supply source/licensing clearance or
installed-platform acceptance. No candidate has been certified by this checklist.

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


## Signed local macOS probe follow-up

The [signed macOS probe record](evidence/ublock-noscript-signed-macos-2026-10-03/README.md)
adds successful packaged-app execution/CSP evidence for #77 at `43ae6748`, with
Gatekeeper and stapled-ticket verification. It is an unpacked local candidate,
not installed-platform acceptance. The earlier harness failures are retained.
The owner subsequently accepted this evidence and supplied the approved
**Won't fix** comment above. The earlier hold is superseded; the GitHub action
remains deferred until PR #490 leaves draft.
