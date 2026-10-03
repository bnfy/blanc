# Windows reliability feedback — October 3, 2026

Implementation and verification for [draft PR #499](https://github.com/bnfy/blanc/pull/499).
Public comparison baseline: v1.26.0. Tested runtime/packaging commit:
`e56273752995c4730cdf7787039d61ea7c7ffe6d`. Earlier candidates, including
`91a00a1b` and `bb3566e3`, are superseded. No version was bumped.

## Implemented behavior

Essential browser menu actions and Windows/Linux input share main-process
definitions and execution. Ctrl+H, Ctrl+J, Alt+D, F5 and Ctrl+PageUp/PageDown
are available alongside existing bindings. Exact modifier matching preserves
plain Tab, AltGr, composition and ordinary editing. The existing shortcut
inventory includes primary bindings and aliases without changing its row shape.

Input resolves current window/tab/view ownership. Deferred address focus is
invalidated by tab changes and intentional surfaces. Reclaiming an already
open address panel focuses its existing WebContents without replaying its
renderer initialization or resetting DOM selection. Renderer replays preserve
a touched input's selection. Parked closed tabs lose active handlers and consume
browser accelerators in their deny-only firewall. Programmatic tab navigation
and reload are serialized with identity checks and load-failure guards.

Repeated Settings requests while loading share the pending navigation.
A successfully loaded, visible sheet still toggles closed. Failed, destroyed
or crashed sheets clear cached state and recreate on the next invocation.
Permission prompts retain priority. Private tabs, Quiet Tabs snapshots,
unsaved-form protection and persisted data formats remain compatible.

Windows/Linux non-parked close keeps a hidden retired guest rooted in its
original live native window through WebContents destruction, then removes it
on the next event turn after checking window identity, view liveness and
attachment. Background guests are attached while hidden before closing.
Application handlers are removed and browser/popup dispatch is denied.
Deferred address cancellation does not reveal a closing view. Externally
destroyed views receive deferred cleanup; macOS and shutdown retain their
established teardown. Tab switching, Glance and workspace detachment transfer
focus away from a focused guest before hiding/removing its native view.

## Web Store gate

[Electron 44.4.0](https://releases.electronjs.org/release/v44.4.0) shipped the
unsupported `chrome.webstorePrivate` crash fix (#53776). The candidate retains
official Electron 44.5.1. Before removing the workaround, a standalone sandboxed
probe loaded a real Store listing and 1Password detail page, checked successful
responses and absence of the unsupported API, and survived for 30 seconds.

Store-specific cancellation and error substitution are removed. Ordinary
blocker delegation, site exceptions and certificate handling remain in place.
Settings Help states that Chrome extensions cannot be installed and explicit
1Password login fill is macOS-only; it neither saves passwords nor fills
automatically. Extension installation and broader password-manager support
are outside this change.

Runtime preflight compares the lockfile, installed Electron package and actual
executable before desktop verification and packaging. The initial unrelated
checkout had stale 44.4.3 dependencies despite locking 44.5.1. Work used a clean
`npm ci` installation in this isolated worktree.

## Automated verification at `e5627375`

| Check | Result |
| --- | --- |
| Lint and full unit suite | Pass; 2,070 tests, zero failures/skips |
| Desktop acceptance (local macOS, unlocked host) | 168 scenarios / 1,005 steps passed |
| Native shortcut/lifecycle regression | Windows and Linux each passed five fresh processes × 97 commands; macOS passed its 97-command menu compatibility sequence |
| Real Store browsing | Seven paths per platform; unsupported API absent, live documents, no uncaught exceptions |
| Substrate, OAuth, modified links, tab handoff and acceptance wiring | All passed |
| Private macOS package | Pinned signature/profile, payload, fuses and strict deep signature passed; production browser/Settings and packaged release regressions passed |
| Private Windows/Linux packages | All jobs passed; actual runtime, production address input/tab churn/Settings crash recovery, payload/fuses and exact timestamped Windows publisher passed |
| Hosted Ubuntu 22.04 / 24.04 | Launcher/refusal, namespace and seccomp checks passed |
| CodeQL and site build | Passed; no deployment |

[Source run 37150360793](https://github.com/bnfy/blanc/actions/runs/37150360793)
and [private package run 37150358140](https://github.com/bnfy/blanc/actions/runs/37150358140)
passed all jobs at the exact tested SHA. [CodeQL 37150360694](https://github.com/bnfy/blanc/actions/runs/37150360694)
and [site build 37150360707](https://github.com/bnfy/blanc/actions/runs/37150360707)
also passed. The initial local acceptance invocation, while the host was locked,
passed 167/168 scenarios and failed native 1Password capsule focus. The complete
unlocked rerun passed 168/168; both logs are retained.

Windows/Linux source tests use `WebContents.sendInputEvent` to exercise native
`before-input-event` and menu-duplicate suppression. macOS compatibility uses
native menu invocation with its existing bindings. The sequence covers rapid
transitions, aliases, utility/permission/overlay focus, parked tabs, eight
private-tab pairs, reopen behavior and ownership changes. Failure diagnostics
record delivery, focused surface, active tab, exceptions and bounded native
process/exit state, retaining the last snapshot if the debugger disconnects.
Local native dumps have upload disabled and private three-day failure artifacts.

Store paths are direct listing, redirected detail, actual popup, Personal
private, named-profile regular/private and restored quiet tabs. Each checks a
real Store document and live renderer. Packaged tests run with `BLANC_TEST=0`,
including production blur behavior, late address-focus/selection preservation,
Settings interactivity and forced Settings renderer crash/recreation.
The earlier dependency security gate passed with zero production vulnerabilities;
the production dependency graph is unchanged.

These are bounded regression results. The reporter's original general Windows
freeze remains unreproduced; passing these checks does not establish that every
reported freeze is resolved.

## Delegated Parallels Windows check at `e5627375`

The owner requested testing in Parallels and explicitly authorized its native
keyboard interface because the Computer Use input bridge could observe Windows
but could not forward input. Native input used `prlctl send-key-event`; Computer
Use screenshots were observed after action groups. Parallels Tools performed
installation, read-only process/session checks and restoration.

Environment: Parallels Desktop 27.0.2 (58673), Windows 11 Pro Insider Preview
build 26220.9472 ARM64, running the private x64 Blanc build through Windows
emulation. This is VM evidence, not the original reporter's physical machine.
The exact installer and installed executable independently passed guest
SHA-256, exact Authenticode publisher and timestamp checks. Installation exited
zero; only a fresh isolated profile was launched.

- Installer SHA-256: `c8035cebddc9a597d6629e138b016613d82f6fef3c976f100c3ccc75f160e374`.
- Installed executable SHA-256: `123725352b5ac34232194761dff679a8c60e436ddb00a12e332728c1afd8221d`.
- Publisher: `CN=Bananify Creative, O=Bananify Creative, L=North Chili, S=New York, C=US`; signature valid, timestamp present.

Observed results:

- Navigated to example.com, the real Store extensions listing and 1Password detail page. F5 and Ctrl+Shift+R reloaded the detail; it survived later interactions. No extension installation was attempted.
- Ctrl+, opened Settings after example.com and during Store loading. Plain Tab and Enter selected Help, showing Electron 44.5.1, Chromium 152.0.7977.130, Windows x64 and accurate extension/password-manager limits.
- Ctrl+Tab from Settings changed the active tab and dismissed the sheet. Ctrl+W from Settings closed the Store detail once; Ctrl+Shift+T reopened it. Alt+D selected the address before detail navigation.
- Thirteen Ctrl+T → Ctrl+Shift+Tab → Ctrl+Tab → Ctrl+W cycles completed with 15 ms key holds. Forty native Ctrl+Shift+N → Ctrl+W private-tab pairs followed, with the first private tab observed before close. The two ordinary tabs remained and subsequent commands responded. This is an input sequence plus bounded final-state observation, not per-event instrumentation of all forty pairs.
- Ctrl+PageUp selected example.com; Ctrl+PageDown returned to the Store. Ctrl+H opened History, containing only ordinary visits; Ctrl+J opened Downloads from that sheet.
- File → Settings opened through the native menu after stress. Seven plain Tab presses and Enter opened Help. Ctrl+, toggled the loaded sheet closed.
- A process check recorded nine Blanc processes reporting Responding=true. The isolated persisted session contained example.com and the canonical Store detail URL, with the latter active. VM observations do not measure every uncaught exception; automated source diagnostics provide that separate evidence.
- Alt+F4 closed normally. Restoration verified all 116 original application files by SHA-256, a valid signature and zero remaining Blanc processes. Original executable SHA-256: `29ea79b3aa61cc866ff3b686d53ab9704142c544bbfd6682eebe897c317b7252`. The normal profile was never launched. The candidate and isolated profile remain separately retained for investigation.

An immediate-input limitation was reproduced on superseded `91a00a1b` and
`bb3566e3`: a single 15 ms-key-hold batch of Ctrl+T immediately followed by a URL
lost its prefix before initial address focus was ready. The panel stayed open,
the incomplete URL was not submitted, and Settings remained accessible.
Typing after observed panel readiness and at 100 ms key holds succeeded.
That pre-readiness sequence was not rerun on `e5627375`, and this change does
not claim to fix it. Production packaged coverage verifies input after panel
readiness and late focus/selection preservation.

## Additional Linux desktop attempt and cleanup

Disposable x64 Ubuntu 22.04.5 and 24.04.5 guests were provisioned in Parallels
on the ARM Mac. Both independently verified the exact candidate AppImage digest
`8bafb4fc2936bc48397e8a9f2e7dd2915d91708dcb144aa0e08b504809937dc1`.
Ubuntu 22.04's user-namespace probe succeeded, but LightDM failed during desktop
setup before Blanc launched. Ubuntu 24.04 reached XFCE; its default namespace
probe failed with Operation not permitted and AppArmor's unprivileged namespace
restriction enabled. Its launcher treated command text with arguments as a
file-open request; no Blanc process or renderer was observed. No sandbox policy
was changed. Actual Blanc refusal and native desktop regression remain untested
in these guests. Setup failures are not Blanc failures or passing evidence.

The additional provisioning was ended after the owner reported excessive delay.
At the owner's request, both test VM registrations/bundles, external virtual
disks, downloaded images, seed ISOs, candidate setup copies and disposable SSH
key were deleted. About 12.28 GiB of allocated setup files were removed. The
original Windows VM remains running and the original ARM Ubuntu VM remains
stopped. Only small private setup diagnostics remain in the ignored
`dist/validation/linux-feedback-e5627375/`; all 26 retained files passed their
checksum manifest. This does not waive the remaining desktop/owner gate.

The subsequent evidence-only head `9ced2b3180092b965bb8ee30fe19e72905f5812b`
passed the full [source matrix](https://github.com/bnfy/blanc/actions/runs/37151696351),
[CodeQL](https://github.com/bnfy/blanc/actions/runs/37151696331) and
[site build](https://github.com/bnfy/blanc/actions/runs/37151696359). Its only
change from the tested runtime was this report. That source run again recorded
five native-input passes each on Windows/Linux, one macOS menu pass and seven
Store paths per platform.

## Private candidates

These artifacts retain version 1.26.0 for private testing and do not belong to
the public v1.26.0 release. Every earlier candidate, including runs
`37141711275`, `37143456829`, `37144217491`, `37144894232` and `37147999864`,
is superseded.

| Candidate | Download | Expires (UTC) | Actions archive SHA-256 |
| --- | --- | --- | --- |
| Windows installer | [11283807200](https://github.com/bnfy/blanc/actions/runs/37150358140/artifacts/11283807200) | 2026-10-06 20:10:10 | `8ba5dc9d5330e850b8b9a8036f413683191fcccb6237eb95eee4416ab0ce09a6` |
| Linux AppImage | [11284245740](https://github.com/bnfy/blanc/actions/runs/37150358140/artifacts/11284245740) | 2026-10-06 20:12:09 | `da0b84cdaeb1b4ed416d1f605c67ad4fa650ff2cd17847169e258d8f1307eb4e` |

Both downloaded archives matched Actions' digests. Archive digests differ from
individual installer/AppImage digests. Windows includes `windows-signature.json`
binding its installer digest to the publisher/timestamp. [Ubuntu 22.04 evidence](https://github.com/bnfy/blanc/actions/runs/37150358140/artifacts/11284086636)
and [Ubuntu 24.04 evidence](https://github.com/bnfy/blanc/actions/runs/37150358140/artifacts/11283522871)
expire October 17. The local signed macOS candidate is not notarized public
release or updater evidence.

Private local logs, key dispatch records, installation/restoration checks,
symbolication notes and this report are retained in the ignored
`dist/validation/windows-feedback-e5627375/` and adjacent ZIP with checksums.
Raw native dumps remain separate private diagnostic files. The prior
`windows-feedback-91a00a1b` local bundle is historical.

## Native focus teardown investigation and superseded evidence

Early development regressions reproduced recursive Linux error replacement,
macOS termination during back-to-back reloads and Windows menu fallback from a
parked guest. Navigation serialization, failure-presentation guards and the held
firewall address those reproductions. The `118265a9` Linux private-close debugger
disconnect passed on repeat; its exit/signal was unavailable. At `91a00a1b`,
[source run 37144898017](https://github.com/bnfy/blanc/actions/runs/37144898017)
and [package run 37144894232](https://github.com/bnfy/blanc/actions/runs/37144894232)
passed. Its first OAuth attempt timed out; only that job passed on unchanged-SHA
repeat, with cause unestablished. Subsequent report-only `c4c711a9`
[run 37146142045](https://github.com/bnfy/blanc/actions/runs/37146142045)
lost the Windows debugger at private-tab close twice. No native dump/exit was
available, so its precise cause remains unestablished.

The 97-command regression at `3d08ad92` reproduced a Linux main-process SIGSEGV
during private close in [run 37147255869](https://github.com/bnfy/blanc/actions/runs/37147255869).
The [private diagnostic archive](https://github.com/bnfy/blanc/actions/runs/37147255869/artifacts/11282851898)
SHA-256 is `f8e116f687fcc0b6a5666156b3b2b33379eedbf91e6ee61d669abfb99f0e41be`.
Official Electron 44.5.1 Linux symbols matched module
`6750EAB2DF952462232FCC64A7D9E7FC0` and release checksum
`9dbf06f81bfcd6e34b8cece3a9e00fa56455b7eda899027e14dd1134e68451ee`.
The stack enters `ui::PropertyHandler::GetPropertyInternal`,
`DesktopFocusRules::CanFocusWindow`, `FocusController` and `OnWindowDestroying`
while destroying `RenderWidgetHostViewAura` and WebContents.

The first focus-before-detach correction `bb3566e3` passed two source runs per
Windows/Linux, [source matrix 37148003301](https://github.com/bnfy/blanc/actions/runs/37148003301),
[package run 37147999864](https://github.com/bnfy/blanc/actions/runs/37147999864)
and delegated Parallels testing (13 normal cycles, 20 private pairs). Its later
report-only `f89fe684` [run 37149365254](https://github.com/bnfy/blanc/actions/runs/37149365254)
crashed the Windows main process at private close: exit `3221225477`
(`0xc0000005`), process dead, zero JavaScript uncaught exceptions.
Earlier passes do not invalidate that native failure.

The [Windows diagnostic archive](https://github.com/bnfy/blanc/actions/runs/37149365254/artifacts/11282479097)
SHA-256 is `cc70b8817b198d598684ed6427cdca77bc9aaf288ec774feea82c410c2b2fd60`.
Official 44.5.1 Windows symbols matched module
`205ABBCBDFD937F14C4C44205044422E1` and release checksum
`a2354108a79d199468c5a6328bd6791ec0c3c52191437575433efa7e5b7c17b4`.
The exact fault is `ui::PropertyHandler::GetPropertyInternal`; stack-memory
candidates include DesktopFocusRules, FocusController, LegacyRenderWidgetHostHWND
and Aura destruction. Those candidates are consistent with the Linux path,
but are not a complete validated unwind. Dumps remain private.

The final `e5627375` close ordering preserves the live native root throughout
destruction. Actual lifecycle-order unit tests, five fresh source processes per
Windows/Linux, rebuilt packages and the delegated Parallels sequence passed.
This supports the tested transitions without establishing the cause of every
earlier disconnect or the reporter's broader freeze.

## Owner merge approval and remaining evidence limits

After the missing Linux desktop evidence and machine-specific risk were
disclosed, the owner instructed "squash merge" on October 3. This accepts the
delegated Windows VM evidence and approves proceeding with the incomplete Linux
desktop gate waived for this candidate. The exact instruction, disclosure and
scope are recorded in the [dated merge decision](../release-incidents/2026-10-03-windows-feedback-validation.md).
Prior v1.26.0 waivers are not used, and no unperformed test is marked passed.
Linux desktop interaction and physical-machine behavior remain unverified.
Strict protected-branch checks must pass after incorporating current main.
This approval covers merge only; release/publication remains separate.

No merge, tag, public release, updater handoff, website deployment or public
reply was performed. Publication and adjacent updater validation remain separate
actions.
