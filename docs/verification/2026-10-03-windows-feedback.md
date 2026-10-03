# Windows reliability feedback — October 3, 2026

Implementation and verification for [draft PR #499](https://github.com/bnfy/blanc/pull/499).
Public comparison baseline: v1.26.0. The earlier verified implementation was
`91a00a1badac18a30a43b5613dd1df0317dba51c`. A later stress test reproduced a
native crash, so its packages are superseded by the focus teardown correction
described below. New platform/package evidence is pending. No version was bumped.

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

Results apply to the implementation commit above, except the explicitly noted
unchanged dependency audit.

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
of the evidence; the final `91a00a1b` native matrix passed on its first attempts.
The screenshot's original general freeze remains unreproduced. Passing these
checks does not establish that every reported freeze is resolved.

The evidence-only commit `c4c711a9` triggered [run 37146142045](https://github.com/bnfy/blanc/actions/runs/37146142045). Windows lost its debugger connection at the private-tab-close transition, and repeating only that job at the unchanged SHA failed at the same transition. The last recorded command was Ctrl+W from the overlay; process exit code/signal and final hook state were unavailable. No uncaught JavaScript exception was recorded. Linux/macOS native commands and Store checks, substrate, OAuth, modified-link, tab-handoff, CodeQL and site build passed. This repeat Windows failure is unresolved and blocks a clean validation claim. A test-only follow-up adds bounded process output, delayed exit/liveness observation and local crash dumps with uploads disabled, retained as private three-day Actions artifacts on failure. It does not modify the packaged candidate.

## Delegated Parallels Windows check

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
The final candidate was installed with a fresh isolated profile, leaving the
normal profile unlaunched. Installer exit code was zero; independent guest
SHA-256, exact Authenticode publisher and timestamp checks passed:

- Installer: `20d33795fefab61a31e7bbfde376badb4a5faa330cb10c7e0affa27c0e362626`.
- Installed executable: `00c3325f78b490501293a198305c36e45582f075b559f938269e2a2847ece838`.

Observed on the final candidate:

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
including runs `37141711275`, `37143456829` and `37144217491`, predate the final
runtime; use the artifacts below.

| Candidate | Download | Expires (UTC) | Actions artifact SHA-256 |
| --- | --- | --- | --- |
| Windows installer | [11282110791](https://github.com/bnfy/blanc/actions/runs/37144894232/artifacts/11282110791) | 2026-10-06 18:41:26 | `3eeb9f202c3e82acb3254397e19b1135c02a7599155368aade3184932648dc3c` |
| Linux AppImage | [11281528994](https://github.com/bnfy/blanc/actions/runs/37144894232/artifacts/11281528994) | 2026-10-06 18:42:54 | `3983cfde464e5b69d23a8aab3cd221addc1a6525acbd6f505cc743a3ed483f5d` |

The archive digests differ from individual installer/AppImage digests.
Windows includes `windows-signature.json`, which binds its installer digest
to the publisher and timestamp. [Ubuntu 22.04 evidence](https://github.com/bnfy/blanc/actions/runs/37144894232/artifacts/11281593644)
and [Ubuntu 24.04 evidence](https://github.com/bnfy/blanc/actions/runs/37144894232/artifacts/11281773347)
expire October 17. The local signed macOS candidate is not notarized public
release or updater evidence. Private local logs, native-key dispatch records,
installation/restoration checks and this report are retained in
`dist/validation/windows-feedback-91a00a1b/` and its adjacent ZIP.

## Outstanding affected-machine gate

The delegated VM check is complete with the limitations above. The repeated hosted Windows private-tab-close failure also remains unresolved; the draft cannot be represented as fully validated. Explicit owner
acceptance of this evidence and affected-machine Windows/Linux confirmation
remain pending before merge. No physical Linux desktop test was performed;
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

Local native macOS 97-command coverage and targeted lifecycle ordering tests
passed. This is a candidate correction; the Windows/Linux matrix and rebuilt
packages must pass before it can be represented as validated. The older private
artifacts above do not contain this production change.
