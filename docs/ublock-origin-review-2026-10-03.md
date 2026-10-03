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
