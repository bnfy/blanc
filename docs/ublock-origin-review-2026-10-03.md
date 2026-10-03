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
