# Windows reliability feedback — October 3, 2026

Implementation and verification for [draft PR #499](https://github.com/bnfy/blanc/pull/499).
Public comparison baseline: v1.26.0. Previous runtime/packaging commit:
`bb3566e34931f85838a8dc233073c845a98bc933`. Earlier `91a00a1b` packages are
superseded by its native focus teardown correction. A later Windows native crash invalidates clean delivery of these candidates; the additional close-order correction below is pending validation. No version was bumped.

## Implemented behavior

Essential browser menu actions and Windows/Linux input share main-process
definitions and execution. Ctrl+H, Ctrl+J, Alt+D, F5 and Ctrl+PageUp/PageDown
are available alongside existing bindings. Exact modifier matching preserves
plain Tab, AltGr, composition and ordinary editing. The existing shortcut
inventory includes primary bindings and aliases without changing its row shape.

Input resolves current window/tab/view ownership. Deferred address focus is
invalidated by tab changes and intentional surfaces. Reclaiming an already
open address panel focuses its existing WebContents without replaying its
renderer initialization or resetting DOM selection. Renderer replays also
preserve a touched input's selection. Temporary native tab visibility is
restored only when the current, owned view is actually hidden. Parked closed
tabs lose active handlers and consume browser accelerators in their deny-only
firewall. Programmatic tab navigation and reload are serialized with identity
checks.

Repeated Settings requests while loading share the pending navigation.
A successfully loaded, visible sheet still toggles closed. Failed, destroyed
or crashed sheets clear cached state and recreate on the next invocation.
Permission prompts retain priority. Private tabs, Quiet Tabs snapshots,
unsaved-form protection and persisted data formats remain compatible.

## Web Store gate

[Electron 44.4.0](https://releases.electronjs.org/release/v44.4.0) shipped the
unsupported `chrome.webstorePrivate` crash fix (#53776). The candidate uses
official Electron 44.5.1. Before removing the workaround, a standalone sandboxed
probe loaded a real Store listing and 1Password detail page, checked successful
responses and absence of the unsupported API, and survived for 30 seconds.

Store-specific cancellation and error substitution are removed. Ordinary
blocker delegation, site exceptions and certificate handling remain in place.
Settings Help states that Chrome extensions cannot be installed and explicit
1Password login fill is macOS-only; extension installation and broader
password-manager support are outside this change.

Runtime preflight compares the lockfile, installed Electron package and actual
executable before desktop verification and packaging. The initial unrelated
checkout had stale 44.4.3 dependencies despite locking 44.5.1. Work used a clean
`npm ci` installation in this isolated worktree.

## Automated verification

Historical passing results apply to `bb3566e3`; the final report-only check subsequently failed on the same runtime:

| Check | Result |
| --- | --- |
| Lint and full unit suite | Pass; 2,065 tests, zero failures/skips |
| Desktop acceptance (local macOS) | 168 scenarios / 1,005 steps passed |
| Native shortcut/lifecycle regression | 97 commands per run; Windows and Linux each passed twice on the unchanged SHA; macOS passed |
| Real Store browsing | Seven paths per platform; API absent, no uncaught exceptions; Windows/Linux repeat also passed |
| Substrate, OAuth, modified links, tab handoff and acceptance wiring | All passed |
| Private macOS package | Pinned signature/profile, payload, fuses and strict deep signature passed; production browser/Settings and release regressions passed |
| Private Windows/Linux packages | All jobs passed; actual runtime, production address input/tab churn/Settings crash recovery, payload/fuses and exact timestamped Windows publisher passed |
| Hosted Ubuntu 22.04 / 24.04 | Launcher/refusal, namespace and seccomp checks passed |
| CodeQL and site build | Passed; no deployment |

[Source run 37148003301](https://github.com/bnfy/blanc/actions/runs/37148003301)
passed its first matrix. Because earlier teardown failures were intermittent,
only Linux's native job was repeated (attempt 2), then only Windows' native
job was repeated (attempt 3); both passed. Each repeat also passed Store checks.
[Private package run 37147999864](https://github.com/bnfy/blanc/actions/runs/37147999864)
passed all jobs. These runs contain the production focus correction, unlike
the earlier evidence below. The general reporter freeze remains unreproduced;
these results are bounded regression evidence, not proof that all freezes are fixed.

### Earlier verification at `91a00a1b`

The following results preceded the focus teardown stress reproduction and
are retained for traceability. The dependency audit applies to the unchanged
production dependency graph.

| Check | Result |
| --- | --- |
| `npm run lint` | Pass |
| `npm run test:unit` | 2,061 passed; zero failures/skips |
| `npm run substrate:check` | Pass: blocker, compliance and compatibility inputs |
| `npm run release:security` | Pass on the unchanged production dependency graph; zero production vulnerabilities |
| `npm run test:acceptance:desktop` (local macOS) | 168 scenarios / 1,005 steps passed |
| Native command regression | 83 commands passed on each of Windows, Linux and macOS |
| Real Web Store browsing | Seven paths passed on each platform; unsupported API absent; no uncaught exceptions |
| Signed private macOS unpacked build | Runtime, payload, fuses, pinned certificate/profile and strict deep signature checks passed |
| macOS packaged browser compatibility | Production address input, tab churn, interactive Settings, forced Settings renderer crash/recreation and Help guidance passed |
| macOS packaged release regressions | Pass |
| Private Windows packaging | Installer and application validly timestamped and signed by the exact Bananify Creative publisher; payload/fuse checks passed |
| Private Windows/Linux packaged browser compatibility | Production address input, tab churn, Settings interactivity/crash recovery and actual 44.5.1 runtime passed |
| Hosted Ubuntu 22.04 / 24.04 sandbox checks | Launcher, refusal, namespace and seccomp evidence passed |

Windows/Linux source tests use `WebContents.sendInputEvent` to exercise native
`before-input-event` and menu-duplicate suppression. macOS compatibility uses
native menu invocation with its existing bindings. The sequence covers rapid
transitions, aliases, focused utility/permission/overlay surfaces, parked tabs,
private/reopen behavior and ownership changes. On failure it records command
delivery, focused surface, active tab and uncaught exceptions. The latest
command snapshot is retained even when the debugger connection fails.

Store paths are direct listing, redirected detail, actual popup, Personal
private, named-profile regular/private and restored quiet tabs. Each checks a
real Store document and live renderer, rather than an error/refusal page.
Packaged tests run with `BLANC_TEST=0`, including the production blur policy.

Hosted evidence:

- [Source/native-input/Store matrix 37144898017](https://github.com/bnfy/blanc/actions/runs/37144898017): all jobs passed at `91a00a1b`, including lint, unit, substrate, OAuth, modified-link and tab-handoff checks. The first OAuth attempt timed out waiting for its tab-style callback; rerunning only that job at the unchanged SHA passed. Its cause is not established.
- [Private platform run 37144894232](https://github.com/bnfy/blanc/actions/runs/37144894232): all Windows/Linux and Ubuntu sandbox jobs passed at the same commit.
- [CodeQL 37144898003](https://github.com/bnfy/blanc/actions/runs/37144898003) and [site build 37144898011](https://github.com/bnfy/blanc/actions/runs/37144898011) passed. No site was deployed.

Development regressions reproduced recursive Linux error replacement, a native
macOS termination during back-to-back reloads, and Windows menu fallback from a
parked guest. Serialization, failure-presentation guards and the held firewall
address those reproductions. During the intermediate `118265a9` Linux run,
the debugger connection closed at private-tab close; no uncaught JavaScript
exception was recorded and the process exit code/signal were unavailable.
A repeat at that unchanged SHA passed. This unexplained failure remains part
of the evidence; the earlier `91a00a1b` native matrix passed on its first attempts.
The screenshot's original general freeze remains unreproduced. Passing these
checks does not establish that every reported freeze is resolved.

The evidence-only commit `c4c711a9` triggered [run 37146142045](https://github.com/bnfy/blanc/actions/runs/37146142045). Windows lost its debugger connection at the private-tab-close transition, and repeating only that job at the unchanged SHA failed at the same transition. The last recorded command was Ctrl+W from the overlay; process exit code/signal and final hook state were unavailable. No uncaught JavaScript exception was recorded. Linux/macOS native commands and Store checks, substrate, OAuth, modified-link, tab-handoff, CodeQL and site build passed. At that point the repeated Windows failure blocked a clean validation claim. The later confirmed Linux crash and focus correction are recorded below; Windows now passes twice, but its original disconnect had no native dump and its precise cause is unestablished. A test-only follow-up adds bounded process output, delayed exit/liveness observation and local crash dumps with uploads disabled, retained as private three-day Actions artifacts on failure. It does not modify the packaged candidate.

## Earlier delegated Parallels Windows check (`91a00a1b`)

The owner requested testing in Parallels and explicitly authorized its native
keyboard interface when the Computer Use input bridge could observe Windows
but could not forward input. Native input used `prlctl send-key-event`; guest
screenshots were observed through Computer Use after each action group.
Read-only guest process/session checks and installation used Parallels Tools.
Those guest PowerShell checks can bring a console forward; Blanc was explicitly
reactivated and observed before subsequent keyboard tests.

Environment: Parallels Desktop 27.0.2 (58673), Windows 11 Pro Insider Preview
build 26220.9472 ARM64, running the private x64 Blanc build through Windows
emulation. This is VM evidence, not the original reporter's physical machine.
The earlier `91a00a1b` candidate was installed with a fresh isolated profile, leaving the
normal profile unlaunched. Installer exit code was zero; independent guest
SHA-256, exact Authenticode publisher and timestamp checks passed:

- Installer: `20d33795fefab61a31e7bbfde376badb4a5faa330cb10c7e0affa27c0e362626`.
- Installed executable: `00c3325f78b490501293a198305c36e45582f075b559f938269e2a2847ece838`.

Observed on the earlier candidate:

- Navigated to example.com, then actual Store listing and 1Password detail pages. The detail remained alive through several minutes of later interactions, tab switching, close/reopen and F5 reload. No extension installation was attempted.
- Ctrl+, opened Settings after browsing. Plain Tab focused General controls; Shift+Tab and Enter opened Help. Help displayed Electron 44.5.1, Chromium 152.0.7977.130, Windows x64 and the new guidance.
- Ctrl+Tab from Settings changed the active tab and dismissed the sheet. Ctrl+W from Settings closed the active Store tab; Ctrl+Shift+T reopened it.
- One create/switch/close cycle was observed step by step, then twelve consecutive Ctrl+T → Ctrl+Shift+Tab → Ctrl+Tab → Ctrl+W cycles ran with 15 ms key holds. The original three tabs remained, with the Store active and subsequent commands responsive.
- Ctrl+PageUp selected example.com and Ctrl+PageDown returned to the Store. Ctrl+H opened History and Ctrl+J opened Downloads from that sheet. Alt+D focused and selected the address. F5 reloaded the Store detail.
- File → Settings opened through the native menu after browsing and churn. Ctrl+, reopened Settings after reload/reopen, and another request toggled the loaded sheet closed.
- After the repeated hosted Windows failure, the same retained candidate was launched from its separate directory with the isolated profile. One private-tab close was observed, followed by twelve rapid native Ctrl+Shift+N → Ctrl+W pairs; the app remained on example.com with two ordinary tabs. Another immediate private create/close pair after reload, Find and Settings also returned to that page. These production observations do not explain the debugger failures.
- Alt+F4 closed normally; no Blanc process remained. The original application was restored from its pre-test backup, and every one of its 116 files matched SHA-256. Its signature remained valid. Private candidates and test profiles were retained separately for investigation.

The focus investigation has a remaining limitation: a single batch containing
Ctrl+T immediately followed by `https://example.com/focus91` with 15 ms key
holds produced only `eom/focus91` in the address field. The panel stayed open.
At 100 ms key holds the complete address and caret were preserved. Typing
once the panel had been observed ready also worked. Initial focus has not yet
settled in the failed sequence; that timing explanation is an inference,
not an established root cause. Do not claim arbitrary immediate native input
is lossless or that this residual is fixed. The production packaged regression
checks input after panel readiness and late focus/selection preservation.

The production VM session was observed for visible responsiveness and process
survival; it was not instrumented for every uncaught exception. Automated
source diagnostics and production VM observations provide different evidence.

## Private candidates

These validation artifacts retain version 1.26.0 for private testing and do
not belong to the public v1.26.0 release. All earlier candidate artifacts,
including runs `37141711275`, `37143456829`, `37144217491` and
`37144894232`, predate `bb3566e3`. The artifacts below also require replacement after the subsequent Windows failure; retain them only as historical evidence.

| Candidate | Download | Expires (UTC) | Actions artifact SHA-256 |
| --- | --- | --- | --- |
| Windows installer | [11283335468](https://github.com/bnfy/blanc/actions/runs/37147999864/artifacts/11283335468) | 2026-10-06 19:32:48 | `9987aac99c1f862356a8295c324a11a962be972cd16c7188ee99a7846db14399` |
| Linux AppImage | [11283143200](https://github.com/bnfy/blanc/actions/runs/37147999864/artifacts/11283143200) | 2026-10-06 19:33:29 | `bcd2b07c3371612959194fba6a753eb5872b5736818ea7b5e431fe2ce819604c` |

The archive digests differ from individual installer/AppImage digests.
Windows includes `windows-signature.json`, which binds its installer digest
to the publisher and timestamp. [Ubuntu 22.04 evidence](https://github.com/bnfy/blanc/actions/runs/37147999864/artifacts/11283093161)
and [Ubuntu 24.04 evidence](https://github.com/bnfy/blanc/actions/runs/37147999864/artifacts/11282367701)
expire October 17. The local signed macOS candidate is not notarized public
release or updater evidence. Private local logs, native-key dispatch records,
installation/restoration checks and this report are retained in
`dist/validation/windows-feedback-bb3566e3/` and its adjacent ZIP. The prior
`windows-feedback-91a00a1b` bundle remains historical.

## Outstanding affected-machine gate

The rebuilt Windows candidate completed the delegated Parallels test below, but a later automated Windows check crashed on that same runtime. The current additional correction requires new automated and packaged validation. Explicit owner acceptance
of this evidence and affected-machine Windows/Linux confirmation remain pending
before merge. No physical Linux desktop test was performed;
the installed Parallels Ubuntu guest is ARM64, while this candidate AppImage
is x64. Hosted Ubuntu 22.04/24.04 checks do not establish physical desktop
confirmation. Prior v1.26.0 waivers do not cover this candidate.

No merge, tag, public release, updater handoff, website deployment or public
reply was performed. Release publication and adjacent updater validation
remain separate actions.


## Native focus teardown investigation

The expanded 97-command regression at `3d08ad92` reproduced a Linux main-process
SIGSEGV during repeated private-tab close in [run 37147255869](https://github.com/bnfy/blanc/actions/runs/37147255869).
The [private diagnostic artifact](https://github.com/bnfy/blanc/actions/runs/37147255869/artifacts/11282851898)
contains native exit/liveness, bounded command delivery, focus/tab state and a
local crash dump. No JavaScript uncaught exception was recorded. Windows and
macOS passed that same expanded sequence, which does not invalidate the Linux
failure or the earlier Windows disconnects.

Exact official Electron 44.5.1 Linux x64 symbols matched the dump module ID
`6750EAB2DF952462232FCC64A7D9E7FC0`. The stack enters
`ui::PropertyHandler::GetPropertyInternal`, `DesktopFocusRules::CanFocusWindow`,
`FocusController::WindowLostFocusFromDispositionChange` and `OnWindowDestroying`
while destroying `RenderWidgetHostViewAura` and `WebContents`. The symbols ZIP
SHA-256 `9dbf06f81bfcd6e34b8cece3a9e00fa56455b7eda899027e14dd1134e68451ee`
matched Electron's release checksum. Crash dumps remain private.

The correction transfers focus away from a focused guest and hides its view
while its native window hierarchy is still intact, before detachment. It uses
the same guarded path for close, tab switching, Glance and workspace transfer.
Unfocused guests leave the permission/overlay focus unchanged. Active close
invalidates deferred address focus before parking or destruction. Ownership,
view liveness, private isolation and shutdown guards remain in force.

Local native macOS 97-command coverage and actual lifecycle ordering tests
passed. The Windows/Linux native matrix passed twice per platform at the
unchanged correction SHA, and rebuilt production packages passed. This validates
the tested transitions; it does not establish the precise cause of earlier
Windows debugger disconnects or every freeze in the user report.


## Rebuilt Parallels candidate (`bb3566e3`)

The exact rebuilt installer and installed executable independently passed guest
SHA-256 and exact timestamped Authenticode checks. Installation exited zero;
the original 116 application files matched their backup before replacement.
Only a fresh isolated profile was launched.

- Installer: `4180a15f9b7cce896636e83cef806141313530ac26628d7b9043c62d78498e27`.
- Installed executable: `777fe2224672ae668dfa7be75072e31321b9f742887992764b2a01a85344425a`.

The owner unlocked the Mac and testing continued using the same authorized
native keyboard interface and Computer Use observations. On this corrected
runtime:

- Navigated to example.com, the actual Store extensions listing and 1Password detail page. F5 and Ctrl+Shift+R reloaded the detail page; it survived subsequent tab and Settings interactions. No extension installation was attempted.
- Ctrl+, opened Settings after example.com and Store browsing. Ordinary Tab and Enter selected Help, which displayed the exact 44.5.1 runtime and the new extension/password-manager limits.
- Ctrl+Tab from Settings switched the active tab and dismissed the sheet. Ctrl+W from Settings closed the Store listing; Ctrl+Shift+T reopened it. Alt+D selected the full address before detail-page navigation.
- Thirteen Ctrl+T → Ctrl+Shift+Tab → Ctrl+Tab → Ctrl+W cycles completed with 15 ms key holds. Twenty Ctrl+Shift+N → Ctrl+W private-tab pairs followed, including one private tab observed before its close. The two ordinary tabs remained with the Store active.
- Ctrl+PageUp visibly selected example.com; Ctrl+PageDown returned to the Store. Ctrl+H opened History, then Ctrl+J opened Downloads from that sheet.
- File → Settings opened through the native menu after stress. Seven plain Tab presses and Enter opened Help. Ctrl+, toggled the loaded Settings sheet closed; Settings reopened after the timing probe described below.
- A guest process check recorded nine Blanc processes reporting Responding=true and the isolated session containing only example.com and the Store detail, with the latter active. This is bounded process/UI evidence, not a measurement of every uncaught exception.
- Alt+F4 closed normally. The original application was restored; all 116 files matched their pre-test SHA-256 values, its signature was valid, and no Blanc process remained. Original executable SHA-256: `29ea79b3aa61cc866ff3b686d53ab9704142c544bbfd6682eebe897c317b7252`. The normal profile was never launched. The candidate and isolated profile remain separately retained for investigation.

The immediate-input limitation was independently reproduced here: a single
15 ms-key-hold batch of Ctrl+T followed by `https://example.com/focusbb`
left `ps://example.com/focusbb` in the address field. It was not submitted.
The panel stayed open, its disposable tab closed, and Settings still reopened.
Typing after panel readiness and at 100 ms key holds succeeded during browsing.
This candidate does not fix input sent before initial address focus is ready.
The original reporter's general Windows freeze remains unreproduced.

## Final Windows check and additional correction (pending validation)

The report-only `f89fe684` check [37149365254](https://github.com/bnfy/blanc/actions/runs/37149365254) reproduced a Windows main-process access violation while closing a newly created private tab. Exit `3221225477` (`0xc0000005`) and process liveness confirm a native failure; zero JavaScript uncaught exceptions does not establish survival. The passing Parallels and prior CI runs do not invalidate this failure.

The [private dump](https://github.com/bnfy/blanc/actions/runs/37149365254/artifacts/11282479097) matched official Electron 44.5.1 Windows symbols module `205ABBCBDFD937F14C4C44205044422E1`. The fault is `ui::PropertyHandler::GetPropertyInternal`; symbolicated stack-memory candidates include DesktopFocusRules, FocusController, LegacyRenderWidgetHostHWND and Aura destruction. These candidates are consistent with the Linux focus path, but are not a complete validated unwind. Official symbols archive SHA-256 `a2354108a79d199468c5a6328bd6791ec0c3c52191437575433efa7e5b7c17b4` and diagnostic archive SHA-256 `cc70b8817b198d598684ed6427cdca77bc9aaf288ec774feea82c410c2b2fd60` were verified. Raw dumps remain private.

The additional Windows/Linux close path keeps a hidden retired guest rooted in its original live native window through WebContents destruction. Background guests are attached while hidden before closing. Application handlers are removed and browser/popup dispatch is denied. Removal waits until the native destruction stack returns and rechecks window identity, view liveness and attachment. Deferred address cancellation does not reveal a closing view. Externally destroyed views use the same deferred cleanup; macOS and window shutdown retain their established teardown. Five fresh-process shortcut runs per Windows/Linux matrix cell replace the prior single run. Exact runtime, package and Parallels results will be recorded after verification.
