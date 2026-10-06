# Installed uBO acceptance — October 3, 2026

These are sanitized observations from real installed v1.27.0 candidates (macOS bundle builds 1270–1272), not results from the unpackaged desktop suite. Production fuses and sandbox settings remained intact. Disposable profiles and local fixtures were used; no browsing URLs, personal data, credentials or raw Chromium logs are retained.

- `macos-1270-failed.json`: signed, notarized arm64 DMG installed in an isolated Applications folder. The first Blanc → uBO restart, request/cosmetic blocking, original Dashboard and Logger, private isolation and quiet/wake passed. The later uBO → Blanc restart quit without reopening. Repeated with the same outcome.
- `windows-1270-failed.json`: signed NSIS installed in an isolated folder in the existing Windows 11 ARM64 VM. The x64 app launched under emulation; its first Blanc → uBO restart quit without reopening. Repeated, including a detached launch. This is not native Windows x64 certification.

The new installed suite drives the real shield CTA and requires a different process and a ready provider after each restart. Unit and unpackaged UI tests alone did not detect these failures. The provisional change to prepare relaunch during `will-quit` did not fix the failure and has been removed. The prior irreversible-quit scheduling is restored. Failed records are retained until rebuilt signed candidates pass.

The owner required the existing installed Linux VM and prohibited creating another VM. That VM is Ubuntu 26.04 ARM64; the available candidate is x86-64. Its direct launch returned `Exec format error`. A normal-user namespace probe also failed. This combination cannot certify Linux x86-64 installed acceptance. No VM, kernel policy, sandbox bypass or runtime adaptation was created to turn this into a pass.

Platform acceptance and public enablement remain pending. No release, public updater metadata, CodeQL dismissal or platform flag was changed by these tests.

## Native crash diagnosis and build 1271

- `macos-1271-failed.json`: rebuilt signed, notarized DMG-installed arm64 candidate repeats the second-restart failure despite the provisional relaunch timing change.
- `windows-native-1271-failed.json`: real signed NSIS installation on hosted Windows x64, [validation run 37156979685](https://github.com/bnfy/blanc/actions/runs/37156979685), fails its first provider restart. The ordinary four-platform and package suite [passed at the same head](https://github.com/bnfy/blanc/actions/runs/37157091518); that is distinct from this installed failure.
- `native-crash-summary.json`: official Electron symbols resolve the Mac trap to native child-view removal, entered from a WebContents focus-loss callback. The signed and diagnostic crashes have matching native offsets. No raw crash identifiers or personal paths are committed.
- `macos-blur-fix-diagnostic.json`: deferring production overlay blur dismissal until the native callback returns, and rejecting callbacks after window shutdown or a newer surface generation, passes the provider round trip and native close/reopen/Quit in an instrumented, ad-hoc signed disposable copy. This is causal diagnostic evidence, not signed acceptance.

The usual unpackaged UI harness intentionally skips production overlay blur dismissal, so it could not detect this path. The new production-handler unit regression and installed suite cover it. Rebuilt signed build 1272 and Windows candidate acceptance are still pending; no platform is cleared by the diagnostic result.

Local verification of the merged source and fix passed: full lint, 2,213 unit tests, substrate/compliance checks, the real-blocking uBO desktop suite, and the shield provider desktop suite. The new blur regression fails against the previous synchronous handler. These are local checks; signed installed acceptance is still a separate gate.

## Signed, installed build 1272

The native teardown fix passes in the rebuilt signed candidates from `92e27667`:

- `macos-1272-passed.json`: signed, notarized arm64 app copied from its DMG into an isolated Applications folder. Three real shield provider restarts, network/cosmetic blocking, original tools, private isolation, quiet/wake, filter persistence, global switch, window close/LaunchServices reopen and native Cmd+Q all pass. The exact test process exited.
- `windows-native-1272-passed.json`: the timestamp-signed NSIS app installed on native hosted Windows x64 passes the same provider round trip and last-window process exit. [Signed validation run 37158994208](https://github.com/bnfy/blanc/actions/runs/37158994208) also passes registration, uninstall and packaged checks.
- `macos-1272-noscript.json` and `windows-native-1272-noscript.json`: the packaged no-scripting probe passes against these exact executable bytes.
- `build-1272-receipt.json` and `windows-1272-signature.json`: source/artifact hashes, Mac signing/notarization observations and Windows signature binding. These remain internal validation candidates.

[The four-platform suite and ordinary package check](https://github.com/bnfy/blanc/actions/runs/37158984018) pass on attempt 2. Intel's first attempt hit the two-second blocking deadline alongside repeated GPU initialization failures; the failed job passed when repeated without source changes. That timeout remains a recorded failure, and passing CI does not certify an installed Intel Mac. CodeQL matches the same 39 open baseline alerts; none were dismissed.

This clears the diagnosed installed restart crash in the tested Mac arm64 and native Windows x64 packages. The real updater **Restart Now** handoff, existing Windows VM repeat and shortcut relaunch remain pending. Linux and Intel installed acceptance remain unavailable/unperformed; public platform flags remain off. No public release or feed was changed.

### Real macOS Restart Now handoff

`macos-1272-restart-now.json` records the authenticated public v1.26.0 → signed build 1272 handoff through the actual native **Restart Now** dialog. The owner confirmed clicking it. Native ShipIt logs show successful installation and automatic relaunch; the reopened UI reports v1.27.0/Electron 44.5.1/arm64 and Blanc Blocker ready. The installed executable and ASAR match the candidate, with a valid strict-deep signature. This used an isolated old-app copy and private loopback feed, with auto-install smoke mode off.

With explicit owner approval, the original Mac profile, updater caches and logs were set aside intact, then restored with their directory identities verified. The normal public app reopened with its original session; its installed bundle was not updated. No personal data or raw native logs are committed.

`windows-arm-vm-1272-attempt1-failed.json` retains the existing ARM64 VM's first repeat: the formerly failing provider restart passed, then the Dashboard Apply control timed out. The native hosted x64 suite passes; these observations are kept distinct. The VM repeat is being investigated, and the Windows updater handoff remains pending.

The unchanged second Windows VM attempt, with native stderr captured reliably, passes all installed checks (`windows-arm-vm-1272-attempt2-passed.json`), including provider round trip, filter persistence and last-window process exit. The first timeout remains recorded; this retry does not erase it. This ARM64/emulation observation complements the native hosted x64 acceptance. Windows Restart Now and normal shortcut relaunch are still pending.

### Real Windows Restart Now and normal shortcut relaunch

`windows-arm-vm-1272-restart-now.json` records the authenticated public v1.26.0
→ signed candidate handoff in the existing Windows 11 ARM64 VM, running the
x64 app under emulation. The actual downloaded-update prompt was activated
with auto-install smoke mode off. The old process exited and NSIS automatically
reopened v1.27.0; executable and ASAR hashes match the timestamp-signed candidate.
This is not a direct installer-over-running-app substitute.

The owner then confirmed closing the final window, opening Blanc from the
Windows Start menu at v1.27.0, and closing it again. The shortcut target points
to this isolated installation, and the subsequent process check found no owned
Blanc process. The original profile and updater cache were restored intact with
their directory identities verified; the private feed was stopped. The normal
Mac app/session are also restored. No personal data or raw logs are committed.

This complements native hosted Windows x64 installed/no-scripting acceptance;
it does not turn the ARM64 guest into native x64 hardware. Earlier failures and
successful retries remain recorded. The final rollout proposes Apple Silicon
and Windows x64 only, as described in the [support matrix](../../ublock-origin-support-matrix-2026-10-03.md).
Intel and Linux installed uBO gates remain open. Owner release confirmation and
final exact-head CI still precede public merge/release.

## Native Intel signed installed acceptance and Rosetta limits

The unsigned DMG-installed native Intel suite at `ca94babf` passed all checks
([37162421830](https://github.com/bnfy/blanc/actions/runs/37162421830)); its two
JSON receipts explicitly do not claim signing acceptance.

The exact signed, notarized x64 DMG from `0872ed72`, build 1273, was transferred
with explicit owner authorization through an unpublished disposable draft.
[Native signed intake 37163485751](https://github.com/bnfy/blanc/actions/runs/37163485751)
installed it from the read-only DMG and verified all three pinned hashes, the
exact signer, Gatekeeper, strict-deep signature, stapled ticket, fuses and uBO
payload. The production controls/provider round trip, persistence, native
close/reopen/Quit and no-scripting suites pass. `intel-native-signed-1273-*`
records these separate observations.

The same signed package failed twice under Rosetta on the Apple Silicon owner
Mac with `ubo-startup-timeout` after its first provider switch. Both fresh-profile
failures remain in `intel-rosetta-1273-attempt*-failed.json`; this is not native
Intel evidence and is not called flaky. The runtime gate now excludes an Intel
app translated by Rosetta using Electron's native translation flag, activates
Blanc Blocker, and preserves the saved uBO configuration. Native Apple Silicon
and native Intel remain distinct supported combinations. No startup or request
deadline was relaxed.

The read-only draft download first failed before running any app. The owner then
explicitly approved temporary write access for the one intake job. After the
passing test, the draft and only asset were deleted and the temporary tag was
confirmed absent. The intake job and its elevated permission are removed. The
public release/updater feed remain unchanged.

## Native Linux installed AppImage restart and sandbox verification

The real outer AppImage first failed its shield restart at `0872ed72`; switching
to a stable outer executable at `373723c` still failed. The later `1c63f1b`
diagnostic again saw the old process exit with no new CDP endpoint, while
confirming the working directory was outside the mount. All three failures are
retained. Raw fixture logs are not committed.

The official AppImage extraction launcher mode fixed the tested restart path:
[private validation 37163617450](https://github.com/bnfy/blanc/actions/runs/37163617450)
at `2094cdeb` passed installed controls, three provider restarts, custom filters
and cosmetics, original tools, private isolation, quiet/wake, persistence, global
blocking and last-window process exit. Every renderer after each restart had
seccomp mode 2, NoNewPrivs 1 and a separate user namespace. No request/startup
deadline or sandbox was relaxed, and official Electron 44.5.1 was retained. The
no-scripting test uses bytes extracted from that same outer AppImage. Packaged
Settings/crash recovery, permissions, protocol, metadata and payload checks pass.

The two native Ubuntu 22.04/24.04 jobs also pass all 30 uBO-selected launch cases
each: direct, desktop-menu, nested and extracted startup plus sandbox-disabled
refusals. Every sampled renderer is sandboxed; denied cases make zero browsing
requests. The sanitized summary preserves counts without machine paths or raw
launcher output. CI enables the disposable host's user namespaces; no existing
VM or shipped sandbox policy is changed.

The existing ARM64 VM limitation remains recorded. A final added check now
relaunches the actual outer AppImage after last-window exit using the same uBO
profile and re-verifies its saved custom filter and real blocking. Its separate
validation result will be recorded before Linux enablement.

The final [Linux validation 37164080999](https://github.com/bnfy/blanc/actions/runs/37164080999)
at `de6c0017` passes every job, including that same-profile normal AppImage
close/relaunch check, saved-filter enforcement and second last-window exit.
`linux-appimage-de6c-passed.json`, its no-scripting companion and the two-OS
sandbox summary bind the observations to exact source and executable bytes.
Native Linux x64 is now proposed for enablement. The existing ARM64 VM remains
unmodified and uncertified; no new VM or sandbox bypass was introduced.

All four desktop jobs and the ordinary package gate pass at `cd6ede0f`
([37163867214](https://github.com/bnfy/blanc/actions/runs/37163867214)). CodeQL
there matches all 39 approved baseline numbers, rules and source locations, with
no first-party alert. Nothing has been dismissed while PR #490 remains draft.
Final exact-head checks and owner release confirmation still precede publication.

## Final code-head checks and approved security dispositions

[Final code-head run 37164566623](https://github.com/bnfy/blanc/actions/runs/37164566623)
at `d9fd1c16` passes all four desktop jobs and ordinary packaging. Substrate,
OAuth, shortcuts, modified links, handoff and site checks also pass.

After verifying all 39 baseline alert numbers, rules, locations and original
source hashes, PR #490 was actually taken out of draft. Each exact approved
reason/comment was then applied individually, including the owner's superseding
#77 decision. `codeql-owner-decisions-executed.json` preserves the responses and
timestamps. Four remaining bot conversations for the already-disposed alerts
91–94 were resolved; no human or unapproved finding was hidden. GitHub reports
zero open PR alerts, green CodeQL and a clean protected merge state. Scanning and
branch protection remain enabled.

Owner affected-platform release confirmation still precedes merge, version
tagging and the foreground release protocol. No public v1.27.0 release/feed
change has occurred.
