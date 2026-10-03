# PR #490 follow-up review — October 3, 2026

The external review was incomplete. This follow-up verifies its concrete
findings and examines the remaining renderer, host bridge, profile-deletion,
and async/null caller paths. It is not a claim that the stopped eleven-agent
review or every CodeQL angle has been completed. All public platform flags and
the uBO distribution gate remain disabled. The PR remains draft.

## Confirmed findings and changes

- **Release availability:** the uncleared distribution check blocked ordinary
  Blanc builds. Ordinary packages now exclude all upstream uBO assets and their
  adaptation-build scripts. Native after-pack inventory checks enforce absence;
  metadata, packaged notices, license inventory and SBOM describe the included
  baseline. Internal candidates still include exact verified assets and cannot
  become public releases. Clearing the gate still requires the documented legal
  and corresponding-source assessment.
- **Resource authorization:** a live webpage successfully loaded
  `web_accessible_resources/1x1.gif` without a secret before the fix. Managed
  resources now reach upstream's native request listener, including when global
  filtering is off. Live tests reject missing/forged/reused short tokens and
  permit a valid one. A second live regression confirmed an encoded-path
  bypass after the first fix; noncanonical managed resource paths are now
  rejected before Electron decodes them. A pinned public manifest key gives every profile/platform
  the same extension identity; user folder paths no longer influence it.
- **Unsupported runtime recovery:** the unsupported provider's fail-closed
  request handler cancelled internal recovery assets too. It now admits Blanc's
  internal schemes and bundled renderer files while keeping remote requests
  gated until explicit continuation without blocking. Runtime mismatch tests
  exercise settings/error documents and remote/file controls.
- **Cancelled restart:** destructive Quiet/Reopen cleanup moved from
  `before-quit` to `will-quit`. Stay cancels relaunch and restores the surviving
  window's closing flag. A regression executes the actual main-process quit
  callbacks, retains snapshots/held entries on Stay, and disposes them only at
  the irreversible quit phase. This is not an atomic rollback of other windows
  that have already closed during normal Electron shutdown.
- **Request cost:** lifecycle refresh builds the WebContents index. Network
  decisions use that index without rebuilding the tab list, and revalidate the
  live view, private flag and profile. The regression exercises 100 decisions
  without another tab scan, then rejects old views and changed principals.
- **Native CI races:** the logger test now waits for the actual logger consumer
  before creating requests. Backup export uses a real click/user gesture.
  Windows fixture paths now use native path/URL construction and canonical
  realpath behavior. POSIX mode assertions remain on POSIX; only the Unix-only
  chmod-denial fixture is skipped on Windows. Production permission checks and
  blocking behavior are unchanged.

## Remaining-path review

The shield chooser retains draft selection, persists before restarting,
revalidates the active non-private tab in sender-bound IPC, and reports a
cancelled/failed change. Settings renders unsupported/failed/restart-pending
states and exposes explicit recovery. Neither path can enable an uncertified
platform or sync provider selection. The native shield suite exercises keyboard,
small-window, unavailable/private guards and both restart directions.

The managed background uses a dedicated extension port, exact bridge URL,
WebContents/session/main-frame validation, fixed operations and bounded queues.
Document injection and content messaging revalidate profile, current WC/frame,
held restrictions and document tokens. The CSS failure path now rejects its
pending caller before marking invalid response data failed; header dictionaries
have no prototype setter. These checks do not clear the outstanding upstream
inspector/picker port findings described in the separate CodeQL triage.

Profile deletion closes owned browser/OAuth windows before disposing the
provider, then clears normal/private storage, cache and auth state. Failed native
cleanup retains the crash-resumable deletion marker. A baseline without bundled
uBO does not attempt to load missing extension assets; deletion still clears the
entire native sessions. The live suite verifies native extension storage is
absent after named-profile deletion. Async site actions are awaited at their IPC
callers; private/unknown provider results use the existing Blanc branch. No
private tab/query/log records are admitted to the uBO registry.

## Validation and limits

Local on official Electron 44.5.1/macOS arm64: the dedicated real-blocking suite
passed after the changes, including resource authorization, tools, storage,
profiles, quiet/wake, OAuth, POST and background failure/retry. Ordinary unsigned
developer packaging passed all payload/compliance hooks with upstream uBO
excluded. This is not signing/notarization, installed-platform or CI evidence.
Additional local and hosted results are recorded below when available.

The initial dependency-advisory check reported GHSA-CH52-4W7C-C8XP against
existing desktop build-tool and Astro lockfile entries. Current main's scoped
reachability review and the additional uBO payload review below now account for
that advisory; fresh local and hosted audits pass. No advisory policy was
disabled or expanded.

CodeQL findings remain separately tracked in
`docs/ublock-origin-codeql-2026-10-03.md`. No exclusion, query disablement or alert
dismissal was made. Corresponding-source/legal clearance, complete platform
acceptance and installed candidate checks remain requirements before enabling
uBO or merging/releasing this platform-sensitive feature.

### Completed local checks

- `npm run lint`, `npm run substrate:check`, `npm run ublock:check` passed.
- Full unit suite: 2,093 passed, zero failed. Targeted quit/provider regressions
  also passed after replacing duplicate tab-ID lookups with `idForTab`.
- `npm run test:ublock:desktop` passed with real filtering and encoded-resource
  attack controls; `npm run test:shield-provider:desktop` passed.
- Ordinary unsigned arm64 macOS packaging passed with **no `ublock/` ASAR
  entries** and 37 applicable license records. Explicit internal packaging passed
  verified upstream/source/host/adaptation bytes and 38 license records; rebuilt
  after the encoded-path fix. Neither build was signed or published.
- `npm run security:dependencies` still fails for the documented advisory.

Hosted results for the follow-up commit are pending. Local results above do not
replace Windows/Linux/Intel macOS, installed-machine or release evidence.

### Hosted follow-up findings

The first follow-up (`591fb24f`) passed Windows' full unit suite, but native
checks still failed. Linux/Windows timed out reading the logger while its
WebContentsView was detached; the native logger renders its buffer through
animation frames. The test now returns to the actual logger tab before reading
its visible rows. macOS arm64 read the list checkbox before async preferences
hydration; the test now waits for the real default value instead of treating
initial HTML as loaded settings. Neither fix injects records or changes uBO
filtering/updates. A fresh hosted run is required to verify these diagnoses.

Public release entry points also explicitly reject an inherited
`BLANC_UBLOCK_INTERNAL_BUILD=1`, even after legal clearance; the fast release
check runs before authentication. Both exclusion/enablement and internal/public
boundary tests passed (13 targeted release tests).

An attempted ordinary unsigned package launch exited with SIGKILL before CDP.
`codesign --verify --deep --strict` reports that its modified executable lacks
resources required by the remaining signature. The payload/compliance checks
passed; this unsigned output provides no packaged launch/signing evidence.

### Further native fixes

Run `37122413300` at `34cbb7ad` passed Windows and macOS arm64, including
unit, lint and all three native suites. Intel macOS and Linux failed later at
subscription-update compilation. The fixture now awaits the upstream reload
started by `updateStop` before initiating the next update; upstream deliberately
coalesces concurrent reloads. The subsequent compiled-count and server-absence
assertions remain intact. Fresh hosted confirmation is still required.

The popup fixtures also wait for upstream's loading state to clear before
interacting. This exposed two host lifecycle hazards: the old profile-wide
close operation could dismiss a replacement popup, and delayed native tool
focus could blur the replacement while its initial document loaded. Closing
now uses the initiating popup's sender-validated preload; the profile-wide
bridge close operation is removed. Initial blur events do not dismiss a loading
popup; committed views still dismiss on genuine focus loss, with current-view
and refocus checks. Unit guards and the native Dashboard/Logger/reopen/Escape
sequence passed locally. The real-blocking core suite also passed afterward.

### Fixture isolation and renderer-loss injection

Run `37123328075` at `82fcccce` passed Windows, macOS arm64 and Intel macOS.
Linux progressed through subscription updates and failed at background-loss
injection: `forcefullyCrashRenderer()` left provider readiness unchanged during
the assertion window. The Linux fixture now terminates the actual owned
renderer PID with SIGKILL, verifies there is exactly one background after retry,
and retains the server-absence, failed-state and retry assertions. It changes
no production runtime or sandbox setting. Hosted confirmation remains pending.

The subscription fixture now isolates external DNS, using cached bundled lists
while still fetching and updating its local HTTP subscription through original
controls. The compiled-data check allows the update cycle to finish within a
bounded 30-second wait. This follows the upstream cycle model; it is not a
production timeout change. Test-only observations retain at most 32 asset
events and report fixture response revisions on failure. The local core suite
passed with these changes.

Latest full local unit run: 2,097 passed, zero failed. Lint, substrate and all
three desktop suites passed after popup fixes. The final unsigned internal
rebuild passed upstream/adaptation/source/license/compliance payload hooks; the
unchanged after-sign gate then rejected the unsigned app's missing provisioning
profile. That is payload evidence only, not a successful signed package or
installed launch. Public signing and provisioning checks remain mandatory.

### Current-main dependency guard re-review

Run `37123747958` at `4b3c88af` stopped all four jobs at the new dependency
reachability guard from main PR #493, before native tests ran. Merged main at
`78593547` and reviewed the exact three additional uBO package patterns against
the existing cache/Android-tooling VEX determinations. The lockfiles are
unchanged; the inspected internal ASAR includes none of the affected downloader
or Android-tooling modules. The guards accept only those exact patterns and
pin the canonical uBO manifest digest so future payload changes require review.
See `docs/security-reviews/2026-10-03-http-cache-semantics.md`. No VEX statement
or advisory policy was disabled or expanded.

After that merge and review, lint, both VEX guard tests, all 2,104 local unit
tests and `npm run security:dependencies` passed. The dependency advisory is
accounted for by main's reviewed VEX, superseding the earlier unresolved audit
status in this record. Fresh native matrix confirmation remains required.

### Four-platform native result

Run `37124316811` at `c4907d8ad29e4fd2ff8745486c2dadc8810bfceb` passed all
four jobs: macOS arm64, Intel macOS, Windows x64 and Linux x64. Each job passed
byte/adaptation checks, lint, the full unit suite and all three real native
suites (shield, blocking/tools/isolation/lifecycle, Dashboard). Linux exercised
actual owned-renderer termination, failed-state request gating and retry.
Existing parity/substrate, OAuth, tab-handoff and modified-link checks also
passed on that revision. CodeQL remains red; the diagnostic-only cleanup and
remaining upstream findings are recorded separately. This is development-CI
evidence, not installed candidate, signing/updater, legal or public enablement.

Additional live resource-path probes after the matrix pass also rejected
repeated separators and literal backslashes, while retaining the valid one-use
capability control. These assertions are retained in the native suite. No
additional runtime change was needed; the full local real-blocking suite passed
with both probes. Final-revision hosted results are linked from the PR body.

### Repeated native run exposed popup instability

The all-platform pass is not a stability certificate. Diagnostic-only run
`37124610254` at `87da63a3` passed Windows/Linux/macOS arm64 but Intel macOS
failed reopening the popup after the logger. Run `37124782990` at `4a98a36b`
passed Windows and both Macs; Linux failed when the zapper popup closed before
its handler could be invoked. Its provider remained ready with no provider
error, and all resource-path probes passed. No test was waived or retried into
a reported green result.

The two native fixtures now record at most 64 native focus/load/destroy events
on failure, retaining numeric IDs, event names and three fixed managed-tool
names only. No webpage URL, request content or production diagnostic is added.
The traced shield and core suites passed locally. Hosted evidence is needed
to distinguish a native view-focus transition from a fixture interaction race;
popup stability remains unresolved until that evidence supports a fix.

The traced run `37125185116` at `d8a9d6f4` passed all four native jobs; the
intermittent failure did not reproduce. Three consecutive traced local core
runs also passed. Source review identified that the fixtures advanced on
picker-frame removal or managed-tab creation before observing the original
popup's native close. That permits a subsequent page lookup to select a stale
popup, and races a second popup-open with the previous teardown.

The fixtures now register the popup's close-event waiter before invoking Back,
Dashboard, Logger, picker and zapper, and await that event before advancing.
Each new tool popup also waits for upstream's loading state to clear. These
are observable lifecycle conditions rather than retries or arbitrary sleeps.
The native blur policy, production filtering deadlines and all tool assertions
remain unchanged. Local shield and core suites passed; final-revision hosted
confirmation is required and recorded in the PR body.


## Second external review: packaging, preloads and profile readiness

The later review against `4a98a36b` correctly identified that the original
packaging verification was insufficient. Checking only for absence of uBO did
not prove that the desktop allowlist survived builder normalization. A bare
exclusion matcher triggered electron-builder's default `**/*` inclusion.

- The hook now uses the installed builder's normalization and appends exclusions
  only within existing positive FileSets. Missing/exclusion-only allowlists fail
  explicitly. The regression runs `getMainFileMatchers` on the real package
  configuration and rejects docs, tests, site, marketing, iOS and dotfiles.
  A separate after-pack ASAR inventory rejects unexpected first-party files.
  An actual ordinary macOS ASAR contained 334 first-party files (20,474,760 bytes),
  no uBO payload, and passed the allowlist, blocker, capture and compliance hooks.
  The internal ASAR also passed the inventory and exact uBO payload checks.
  Both unsigned inspection builds stopped at the unchanged after-sign provisioning
  gate; neither is installed-candidate/signing evidence.
- Capture scope wrappers now reside under `src/main/` inside the signed ASAR.
  They are reproducibly generated from the unchanged locked macOS/Windows/Linux
  implementations. Startup and package checks compare their exact bytes; writable
  user-data preload files are never registered. Tests reject wrapper/source
  corruption and prove extension documents cannot run the capture relay. Original
  runtime pins and implementations are unchanged; native media acceptance remains
  a platform release gate.
- `ublock:check` binds the matrix to package.json and the installed-runtime entry
  in package-lock.json. Bundled candidates additionally check the builder's
  actual framework version, including overrides. Version drift fails build/CI
  checks before a mismatched candidate can ship. Public platform flags stay off.
- Newly opened profile sessions hold GET navigation until their own provider is
  ready. Failure retains the gate; successful retry or explicit disabling releases
  GETs. POSTs are never replayed. Replay revalidates profile, private state, current
  WebContents and document generation. Profile deletion drops its pending queue.
  Concurrent attachments await the same initialization. The real uBO suite now
  opens a new named profile with an HTTP home page and proves its first page
  reaches the fixture server once, rather than landing on a blocked error page.
- Blanc sessions retain the three request/header callbacks required by filtering,
  CSP and independent browser policies. The five observation listeners are now
  registered only for uBO, and removed by their coordinator on provider teardown.
  Browser policies survive. Three nested tab-query lookups in main were replaced
  with direct identity/projection reads.

Local evidence: focused security/lifecycle checks, lint, pinned uBO/adaptation
checks, and real-blocking first-profile navigation passed. The full suite before
observation optimization passed 2,118 tests; final-head results are recorded below
when available. The preceding `e3c0502d` native run `37125520066` passed macOS ARM,
macOS Intel and Windows, but Linux timed out on the first shield click. This was
not the earlier popup-close failure. Shield fixtures now await actual page commit
instead of accepting an initially false loading flag, and include bounded geometry
and overlay-mode diagnostics on failure. This does not certify the Linux issue as
resolved. Final native validation remains pending.


Final focused checks included a 256-entry navigation bound and stale-view pruning.
The local suite passed 2,121 tests before that small bound addition; its focused
regressions passed afterward. Substrate, lint, dashboard and shield passed. A
later core run reproduced popup closure immediately after focus while uBO stayed
ready. Fixture diagnostics now include fixed close/IPC labels and numeric main
call sites to identify the closure cause; a subsequent core run passed, which is
not proof of resolution. The completed external review at `e3c0502d` adds further
findings, including CSS probe timing, WebSockets and profile startup failure
isolation. Those are being verified and are not cleared by this commit.


## Completed-review follow-up

The completed external review at `e3c0502d` is addressed by the payload/preload
commit above and this follow-up. Every public platform flag and distribution
clearance field remains false; no signed uBO installer has been distributed.

- All profile sessions receive a normal-session failure gate and their private
  Blanc Blocker before initialization yields. One failed background no longer
  stops initialization of other profiles. The real provider factory regression
  verifies a failing first profile, ready second profile, and both private
  sessions attached before the first asynchronous initialization.
- `<all_urls>` and wildcard host matching include WebSockets. The real fixture
  proves a blocked socket never reaches its upgrade handler and an allowed
  socket does. Upstream filtering-engine bytes remain unchanged.
- Network decisions retain their two-second failure deadline. Site queries,
  storage erasure and lifecycle observations have a separate bounded timeout;
  an expired optional query cannot mark unrelated filtering failed. CSS has a
  ten-second operation bound. Document identity probes run immediately, while
  actual script injection retains the requested runAt and token guard. The real
  fixture streams a five-second document, deliberately delays the native CSS
  probe 2.5 seconds, proves allowed networking works during the CSS operation,
  and verifies CSS plus document-idle injection without provider failure.
- Verified uBO background and hidden bridge/CSS helper timers are unthrottled;
  ordinary webpage timer policy is unchanged. A repeat run previously downloaded
  the updated fixture subscription but stalled before the updater-cycle finish.
  Following this change, two complete local core runs passed, including the
  original subscription-update control. This is local evidence, not certification
  of every platform. [Electron's timer/visibility API](https://www.electronjs.org/docs/latest/api/web-contents#contentssetbackgroundthrottlingallowed)
  documents the behavior being controlled.
- Ordinary excluded packages hide the provider selector and shield chooser,
  including uBO-specific private-tab text. A previous uBO selection still shows
  recovery. Blanc startup failures expose Retry and Continue in a separate
  recovery row, independent of the uBO tools row.
- Private Windows/Linux validation defaults to the ordinary release payload.
  An explicit uBO candidate input is valid only in validation mode and requires
  completed distribution clearance before any signing/build job. Local unsigned,
  undistributed source inspection remains possible. An additional CI job builds
  an actual ordinary Linux package and verifies its ASAR inventory independently.
- Dashboard/Logger opening reuses the owning profile's existing tab. Only those
  two documents under the current verified extension identity can be reopened
  or restored; private and foreign/other extension documents remain excluded.
  Native tests exercise reuse, close/reopen and cold-start persistence.
- `/block-ads` can disable a failed provider without querying its background.
  Restart intent survives a long Leave/Stay prompt; Stay still cancels it and
  preserves Quiet/Reopen state. macOS profile deletion waits for the actual
  native hide event before destruction.
- Every byte-checked text host input and package record has LF attributes,
  checked with Git's actual attribute resolution. AGENTS.md and CLAUDE.md now
  reflect the owner's authorized narrow uBO exception and current storage
  migration, retaining the MIT/identity boundaries. CI paths are limited to
  integration, browser substrate, packaging and relevant fixtures.

Local final checks passed: 2,132 unit tests; lint; substrate; real blocking;
shield/provider UI; dashboard. The later cold-start tool-wake assertion has its
own native follow-up result. Earlier flaky popup focus and Linux shield evidence
is retained above; fresh hosted results are required rather than inferred from
these local passes. CodeQL remains uncleared, and its upstream findings were not
excluded or dismissed. Distribution clearance and installed-platform acceptance
remain prerequisites for public uBO availability.


### Fresh hosted evidence at `7d608dc7`

Run `37128306931` passed its ordinary Linux package job. Linux passed all 2,132
unit tests, the real shield/provider suite and the expanded blocking/lifecycle
suite, including delayed CSS, WebSockets and tool cold restore. Its Dashboard
fixture then timed out switching from My filters to My rules. Upstream starts
`originalState.enabled` true while the DOM checkbox is unchecked, so its dirty
predicate stays true until `readUserFilters` hydrates and remembers state. The
fixture was waiting for Blanc's earlier heading, then clicking the next tab
before hydration. It now waits for the native clean predicate for this pane and
before its initial edit. The unsaved guard remains unchanged and is still tested
with an actual dirty edit and Stay. Failure diagnostics report fixed panel names
and guard state, without filter content. Fresh Linux confirmation is required.

The fresh ordinary macOS inspection ASAR contains 335 first-party files totaling
20,479,924 bytes, zero `ublock/` files, and the three reproducible capture wrappers
inside the app. Allowlist, blocker, capture and compliance checks passed; the
unsigned inspection still stopped at the unchanged after-sign provisioning gate.
This is payload evidence, not a signed or installed candidate.

The CodeQL workflow completed its scan, but the separate security check remains
failed with 40 open merge-ref findings: 39 immutable upstream locations and the
exclusive-marker race finding 113. No exclusions or dismissals were introduced.

Intel macOS failed the updated-subscription assertion on the same head. The
fixture list was fetched and cached, but the updater was still running before
the final engine reload. Native timer/fetch diagnostics are now bounded and
record fixed asset categories, timing and cycle completion without browsing
URLs or filter text. Three local traced runs passed; that does not resolve the
Intel failure. The next hosted run must identify or clear it.

### Updater trace at `55cd5472`

Linux reproduced the subscription failure. The native trace proves this was the
fixture's artificial `updateStop()` barrier: it ran at 1791037243949 while a
remote fetch was in flight; that fetch returned and scheduled a 120,000 ms
timer at 1791037243965; the manual fixture update started at 1791037244002, then
its 100 ms timer was refused because the old timer was still pending. The new
list reached cache but the cycle could not finish inside the 30 second fixture
wait. Upstream uses `updateStop()` during shutdown; Blanc's production code does
not call it. The fixture now waits for the dashboard-started cycle's native
completion, then its filter reload, before clicking the original list clock.
No updater, filtering, timer or production network-policy code is changed.
A temporary debugger experiment was removed; the existing fixture already
disables remote DNS, which explains its immediate CDN errors. Both Linux and
ARM macOS traces show the same artificial stop race. Windows passed this run.
Fresh native CI confirmation is still required.

The corrected natural-cycle fixture passed locally, including its newly fetched
rule being blocked before reaching the HTTP fixture server. The core fixture
also waits for My filters hydration before making its initial edit.

A subsequent local core run hit the earlier native popup-focus intermittency
before subscriptions: the zapper popup focused, then native focus returned to
chrome within seven milliseconds and the blur handler closed it. That run is
recorded as a failure, not updater evidence. Popup diagnostics now include the
fixed layout operation and numeric height to trace possible resize transitions.


### Remaining review fixes after `c5e44f16`

The external verification accepted the ordinary payload, signed capture wrappers,
public UI hiding, profile isolation, startup gates and recovery changes at
`c5e44f16`. Its exact-head native run `37129712965` passed the four desktop jobs
and the real ordinary Linux package job. Three functional gaps remained, plus
the queue-capacity part of the profile-failure finding.

- Native `vAPI.tabs.open({ select: true })` searches without a URL fragment.
  The host registry now follows that behavior, retaining query strings and the
  existing private/profile isolation. The original Dashboard link therefore
  selects its existing tab even after a panel changes its fragment.
- The original Logger link additionally defaults to upstream's detached-window
  request with `?popup=1`. The host routes that verified tool request into the
  owning profile's managed Logger tab, strips only the detached-window parameter,
  retains its requested tab-selection fragment, and never creates an extra
  browser window. Foreign identities fail before a window can be created.
  Upstream's popup handlers and filtering engine remain unchanged.
- Tool selection accepts an owned quiet tab without requiring a live renderer;
  the browser's normal wake path recreates its view. Duplicate Tab grants only
  verified Dashboard/Logger documents in regular tabs the same managed-navigation
  permission used by reopen/restore. Generic and private extension documents do
  not receive that grant.
- `/allow-ads` checks the model's blockable site before any exception write. If
  uBO is failed, unsupported, initializing, or rejects a site change, the command
  opens the existing Privacy & Security settings; a failed navigation's internal
  error document can reach recovery without becoming a trusted-site exception.
  No Blanc exception is substituted for a failed uBO write.
- At the bounded 256-operation ceiling, excess operations reject and their
  network requests are cancelled. Already admitted decisions retain their
  deadlines and the healthy provider stays ready. A real 300-request burst
  proves cancellation, successful admitted requests, continuing allowed traffic
  and a blocked script that never reaches the fixture server afterward.
- A genuine blocking decision timeout still fails the provider at two seconds
  and holds affected traffic until Retry or explicit disabling. This is the
  October 2 implementation plan's fail-closed requirement; it is not removed to
  make the remaining review finding appear resolved. Optional operations retain
  separate bounded timeouts.
- `AGENTS.md` and `CLAUDE.md` now explicitly distinguish the owner's October 2
  implementation authorization from distribution approval and acceptance waivers.
  The legacy-cleanup comment describes the retired general extension runtime
  separately from the optional managed uBO provider.

Local official Electron 44.5.1 verification passed the expanded real-blocking
suite, including repeated original popup links, managed Duplicate Tab, actual
cold-restart quiet-tool selection through the original popup, failed `/allow-ads`
recovery, bounded request pressure and the original two-second timeout/crash
recovery. The complete Dashboard suite also passed. Early iterations identified
a missing detached-Logger route and two fixture mistakes (testing a script filter
with `fetch`, and expecting a hostname on the internal failure page); those
failed runs were corrected before claiming verification. Final lint, unit,
substrate, shield and exact-head hosted results are recorded separately below.

Distribution flags remain disabled. GPL/corresponding-source clearance, the 40
open CodeQL findings, installed candidate confirmation and the previously observed
native popup-focus intermittency remain acceptance gates. A passing native run
alone does not clear these requirements.


Final local lint and all 2,140 unit tests passed; substrate, pinned-package
integrity, the expanded core native suite and the complete Dashboard suite also
passed. The shield suite reproduced the existing native popup focus loss after
its Back/reopen check; the ready popup blurred with no focused WebContents and
was dismissed. Its diagnostic handler itself assumed `electron.windows()` was
a Promise and masked the original error. That diagnostic now safely handles the
synchronous API without altering any assertion or popup behavior. This native
focus issue remains open even if a subsequent run passes.


### Native popup dismissal correction

Run `37131409028` passed ARM macOS, Intel macOS, Windows and the ordinary package
job. Linux lost its driver connection while reloading the regular fixture after
backup import; the original diagnostics could not identify a native exit. The
fixture-only follow-up at `62934f66` adds process exit code/signal and fixed
window lifecycle records. Its Linux run `37131781153` instead reproduced the
older premature popup dismissal: the ready picker popup blurred when the active
webpage took focus again, then Blanc's blur callback closed it before its picker
click. The trace also records that webpage's load finishing. The test process
exited normally only during cleanup, so that run is not native-crash evidence.
The earlier backup/import connection loss still needs confirmation.

`WebContents` blur is a view-focus transition, not proof of user dismissal.
[Electron's documented events](https://www.electronjs.org/docs/latest/api/web-contents#event-blur)
separate it from window deactivation. The popup now dismisses on native mouse
press or key press outside its view, actual BrowserWindow blur, Escape, its
validated Close/Back buttons, or the existing tab/surface/window teardown paths.
Page-load focus movement alone does not close it. Observers are removed when the
popup closes; no polling, retry delay, arbitrary evaluation, private data event,
or visual styling change is introduced. Pure event tests cover duplicate/dead
views, movement/key-up, deliberate outside input, window deactivation and
idempotent teardown. Native shield acceptance explicitly focuses the underlying
webpage while controls remain open, then proves actual outside mouse input closes
them and restores the original listener count.


The diagnostic ARM macOS job failed at the original Dashboard popup click with
the same view-dismissal symptom; Windows and Intel macOS passed that run. After
the input/window-based correction, local lint, all 2,140 unit tests, substrate
integrity and all three native suites (shield/provider, full blocking/lifecycle,
Dashboard) passed. The full core suite includes backup import and cold restart.
A fresh four-platform run must still verify the correction; no earlier failed
run or installed acceptance gate is being relabelled as passed.
