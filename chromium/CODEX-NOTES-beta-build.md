# Result

> **OWNER HOLD (2026-11-10, binding, overrides the brief):** do NOT start item F
> (the dedicated beta build) or item G (which depends on it). The owner will say
> when. Finish A to E and H, record F and G as "held by owner", and stop. Keep
> this notice when you rewrite the file.

Queue 2 stopped at explicit hold and display guard; local commits only.

| Item | State |
| --- | --- |
| A shared Spaces | Done implementation; native two-window/group/Undo gate 3/3; D owed |
| B native icons | Done implementation; real peer PNG/privacy gate passes; D owed |
| C Android safety | Partly: local bundle/unit/support checks pass; native 156/device owed |
| D regression | Blocked: display locked; final full gate/five-feature comparison owed |
| E Sparkle | Done: newest stable 2.10.1 reviewed/staged; preview/offline checks pass |
| F dedicated beta | Held by owner; hold missed before failed cold attempt, now enforced |
| G local beta proof | Held by owner; no beta app exists; temporary private key deleted |
| H operator handoff | Done documentation/operator commands; offline validation only |

Prototype: macos-9b7aa261f5018db7; beta-spaces-layout-1-runtime-config.json.
Beta: no candidate/app; partial output ../src/out/BlancBeta preserved, no resume.
Cold attempt failed in 6.42s (781 actions), optional Metal Toolchain absent.
Gate: earlier beta-regression-sync-1 22/22; latest focused Spaces 3/3; bridge 8/8.
Scenario: sync.feature:162 passes on macos-fbb479dfc8d99cdb (pairing-8).
Latest native candidate's whole-scenario comparison is owed; no lost pass established.
Android: available unit/bundle checks, 35-file reconstruction and 38 support syntax checks.
156 compile/device owed: no tree/output/adb; Darwin arm64, exact commands in C.
Sparkle 2.10.1: newest stable; five post-2.8.0 advisories fixed, full license retained.
Owner next: unlock display for D; explicitly resume F/G only when ready.
Later owner operations: production key custody, signing/Apple, iPhone Sync, publication.
Unverified: final full regression, native Android, beta identity/linkage/acceptance,
real updater install, production Sync and all signed distribution gates.
No push/tag/publication, Developer ID, Apple, production Sync, 1Password or live-tree action.

| Gate evidence | Result | Candidate scope |
| --- | --- | --- |
| Full desktop Sync, regression-sync-1 | 22/22 | 01fd557468d72dd0, before group repair |
| Final two-window Spaces, spaces-layout-1 | 3/3 | 9b7aa261f5018db7 |
| Final tools / reconstruction | 291/291; 159/573 | Offline source checks only |

## A — desktop bridge checkpoint

Added distinct `desktop.spaces.*` methods beside the unchanged phone facade.
The desktop inventory represents all windows, holds switching/restoring windows,
protects every open Space against reconciliation replacement/removal, stores
independent per-window receipts, routes row/binding/layout events by window and
Space, validates acknowledgements, and retains full desktop capture metadata.
Shipping Shared Spaces service/runtime/model remain the pinned bundle source.
The phone `spaces.js` is byte-unchanged. Bundle regenerated with lane tooling.
Four local-Worker unit checks cover independent receipts, open/held protection,
Undo retaining a local copy, and invalid/stale inventory refusal. This is not
native integration or native acceptance evidence.

Precommit checkpoint: `beta-bridge-tools-1.tap` 278/278 pass; patch
reconstruction 158 upstream outputs / 566 canonical files; whitespace clean.

### Native integration in progress

`beta-spaces-pairing-1` passes unchanged `sync.feature:162` on
`macos-c17384cecb432f8d`. Subsequent native work adds a distinct durable desktop
receipt IPC; Android's original WriteStore remains asynchronous and unchanged.
The first focused two-window gate on `macos-4451fa2da0d4fa34` passed setup and
pairing, then stopped at the harness's conservative request-headroom wait
(19 recent GETs; no Worker quota changed). Its requests contain no 429s.
The focused Spaces poll now requests only Spaces stores, reserving seven GETs
of headroom, and leaves native routine polling in control. That is not a pass.
Inspection also found a real bridge bug: an inventory omitting `holding` after
a switch retained its earlier true value. Push now resets transient flags;
the new hold/resume unit test passes (5/5 desktop bridge tests).
Native builds 1 and 2 failed on C++ API/style errors, corrected without any
build-guard override. Builds 3–5 succeeded using the guarded incremental path.
Native navigation waits for a successful committed load, and row acknowledgements
are being tied to native disk checkpoints. Multi-window gate and regression
remain owed on the final candidate.

### Native gate checkpoint

Candidate `macos-fbb479dfc8d99cdb` (`beta-spaces-native-8`) passes all three
focused native checks in `beta-spaces-native-8-gate/result.json`: Settings Sync,
QR/cancel/join, and two windows sharing distinct Spaces with a peer edit and
native delete/Undo. Both windows retain their exact tab URL lists; both local
Space entries and the peer's unaffected Space survive. Real local Worker,
mock Keychain, isolated profiles, rendering guard passed; no production contact.

Gate 7 exposed a real Undo race: a stale inventory reply could acknowledge away
a pending restore and remove its menu entry, although all tabs survived. Native
now retains the restore until a durable accepted inventory echoes it; stale
reconciliation/deletion cannot remove a pending restored Space. Gate 8 passes.
The shared runtime receipt is durably written through a desktop-only Mojo call;
failed writes cannot return a durable inventory receipt. Remote row changes
checkpoint native disk before acknowledging. No Android caller changed.

Precommit `beta-spaces-tools-4.tap`: 280/280; patch reconstruction passes at
158 upstream / 567 canonical files. Full regression and broader remote row,
group, navigation, split and lifecycle coverage are still owed; the focused
gate is not evidence for every Shared Spaces case.

## B — native icon bridge

The native default-profile tab snapshot now uses `desktop.setTabs`; the phone
entry point and its empty icon provider remain unchanged. Chromium rasterizes
its cached favicon to a transparent-padded 32px PNG. The native upload snapshot
admits at most 256 icons, each at most 8192 characters, and excludes private,
inherited-document-policy and sandboxed tabs before creating the bridge row.
The desktop-only shim admits those bounded native PNGs to shipping's existing
icon capture/export code. It fetches no icon URL and accepts no renderer image.

Three tab/bridge unit checks pass: the prior phone contract, native PNG/privacy/
budget behavior, and unchanged phone icon behavior. Candidate
`macos-113aa91f4ae19068` built in 34.71s (10 guarded incremental actions).
The first native icon run validated the received 32px PNG, then failed in a new
harness assertion that incorrectly treated the remote-icon map as an array.
The assertion now uses the actual map shape; no product behavior was changed
for this correction. The clean rerun is `beta-icons-native-2-gate`.

The corrected icon run reached native icon/private exclusion and both Send
directions, then crashed at the five-minute web-app metrics timer. Its native
stack identifies `web_app::SamplingMetricsProvider::EmitMetrics`; the pinned
upstream loop dereferenced a missing WebAppTabHelper for a private tab hosted
in a regular window. Patch 0049 skips tabs without that helper, preserving
private exclusion instead of manufacturing regular-profile app state. This
was a real browser defect exposed by the longer gate, not an icon assertion
failure. The source inventory grows to 153 pristine / 159 reconstructed files;
no patch-budget increase, toolchain change or test-step relaxation was used.

`beta-icons-native-3-gate` passed all three functional checks, including native
32px icon arrival, exclusions, both Send directions, share-off retraction and
inherited-policy persistence after restart. Final shutdown then failed a Mojo
DCHECK: ThreadPool discarded an Unprotect reply while the pipe was still open.
Desktop Protect/Unprotect now default-complete dropped replies as unavailable;
Android's callback path is compile-time unchanged. The new desktop persistence
reply also defaults to failure if dropped. Final clean shutdown qualification
remains owed in item D's full run on the rebuilt candidate.

Final B build: `macos-01fd557468d72dd0`, 21.10s / 6 guarded actions.

B precommit: `beta-icons-tools-2.tap` 282/282; desktop patch reconstruction
159 upstream / 568 canonical passes. The first tools run only failed the
old 158-file count assertion; it now records the added private-tab crash patch.

## C — Android safety

Against bundle `ef49491f64d20084bb67e2f589fc1569dc24affc87a3a4fc4cd73b2177ec7c02`:

| Check | Result / evidence |
| --- | --- |
| All tools/release tests, including Android-lane and phone bundle tests | 282/282, beta-android-tools.tap |
| Lane bundle regeneration check | Current; v1.46.0 shipping module pin unchanged |
| Android patch reconstruction | 35 upstream / 568 canonical; beta-android-patches.log |
| Desktop patch reconstruction | 159 upstream / 568 canonical; beta-android-desktop-patches.log |
| Android JS/CJS/MJS and shell support syntax | 38 files; beta-android-support-syntax.json |
| Chromium 156 Android compile | Not run; beta-android-host.json |
| APK/emulator/device/native Android gates | Not run; no adb, checkout or output here |

The inspected machine is Darwin arm64; the build wrapper deliberately requires
Linux x86-64. The expected `~/chromium-android/src` and
`~/Projects/BlancChromium156/src` do not exist. Existing 157/158 trees report their
respective milestones and contain no AndroidDebug/AndroidDebugX64 args files.
No remote build host was contacted and no toolchain, checkout or emulator was
installed. These source/bundle checks are not Android compile or runtime credit.

Owed compile on the existing Linux Android lane host, after guarded application
of this commit's Android lane and canonical source (including the bundle/hash)
against its saved last-applied map, preserving the existing args and caches:

```sh
cd "$HOME/blanc"
ANDROID_SRC="$HOME/chromium-android/src"
ANDROID_NODE="$ANDROID_SRC/third_party/node/linux/node-linux-x64/bin/node"
"$ANDROID_NODE" chromium/tools/build-sync-bundle.mjs --check
python3 chromium/tools/check-patches.py --lane android
"$ANDROID_NODE" chromium/tools/build.mjs "$ANDROID_SRC" --lane=android --out=AndroidDebugX64 --check
"$ANDROID_NODE" chromium/tools/build.mjs "$ANDROID_SRC" --lane=android --out=AndroidDebugX64 --build
# On the configured emulator, after the compile:
cd "$ANDROID_SRC"
BLANC_TREE="$HOME/blanc" BLANC_EVIDENCE="$HOME/blanc-evidence/android/beta-sync-bridge" \
  bash "$HOME/blanc/chromium/tests/android/a4-gate.sh"
```

Do not bypass a changed environment/large-plan guard. The arm64 Pixel output's
corresponding owed compile uses `--out=AndroidDebug`, with that output's existing
saved environment and APK/device gates; neither output has been qualified here.

## D — regression in progress

`beta-regression-sync-1` runs on `macos-01fd557468d72dd0`. The Spaces check now
turns its own opt-in off through Settings before the independent tabs/Favorites
checks, keeping their initial conditions separate without changing Worker
quotas or weakening assertions. Full five-feature comparison is still owed.

Source review during this run found two additional native group gaps: staged
descriptors were profile-wide rather than window/Space-specific, and a layout
row's checkpoint could precede its layout. Pending changes scope descriptors
to the exact window and Space, apply the accepted layout before acknowledging
and checkpointing, preserve empty groups, and defer layout around a local split
before any mutation. A new two-window peer group-edit assertion and bridge
layout test are staged. They are not included in the running binary; regeneration,
build and a fresh final regression are required before claiming qualification.

Patch accounting at the last built candidate: 48 ordered patches, 570 hunks,
155 paths in patch outputs, 153 pristine inputs, 159 reconstructed upstream
outputs and 568 canonical files. No patch-budget increase was requested.

`beta-regression-sync-1` completes 22/22 on `macos-01fd557468d72dd0`,
including clean shutdown, the persisted quota wait (120033 ms), private and
secondary profile refusal. This validates the B teardown fix. It predates the
new group/Undo changes and is not final D evidence for that next candidate.
Regenerated bundle: `6e6f26c5872abe7053b0fbee46c0d1c737c27b925ec96b9cfa1986b6b4b45467`;
`beta-layout-unit-1.tap` passes 8/8 desktop bridge tests, including two pending
Undo restores and layout-before-checkpoint delivery.

Final group/Undo candidate `macos-9b7aa261f5018db7` built in 32.90s / 9 guarded
actions. `beta-spaces-layout-1-gate` passes 3/3 with real groups in both windows,
peer tab and group renames in the first, no foreign group in the second native
window or peer Space, exact tab preservation through delete/Undo, and clean exit.
The full Sync gate and five-feature comparison on this candidate remain owed.

Group/Undo checkpoint precommit: `beta-layout-tools-1.tap` 284/284; desktop
159/568 and Android 35/568 reconstruction pass. Bundle regeneration check passes
for `6e6f26c5872abe7053b0fbee46c0d1c737c27b925ec96b9cfa1986b6b4b45467`.
Android native compile/device qualification remains owed as listed in C.

### Scenario baseline and owed comparison

| Feature | finish-final-features-2 pass/fail/undefined | Final queue candidate |
| --- | --- | --- |
| sync.feature | 17 / 0 / 1 | Whole run owed; :162 focused pass on fbb479dfc8d99cdb |
| internal-pages.feature | 10 / 0 / 0 | Owed |
| island-and-commands.feature | 72 / 0 / 1 | Owed |
| vertical-tabs.feature | 18 / 2 / 0 | Owed |
| quiet-tabs.feature (:8/:118 only in baseline) | 2 / 0 / 0 | Whole file owed |

Baseline totals: 119 pass / 2 fail / 2 undefined, including two quiet cases.
Existing vertical failures are stale V16 grouped-pin expectations (:129) and
Linux-only controls (:239); Island :320 is Linux-only. These remain explicit,
not waived or rewritten. No final comparison means **lost-pass count unknown**,
not zero. The final five-feature run did not start after the locked Sync failure.

### Locked-display interruption

`beta-regression-sync-2` on `macos-9b7aa261f5018db7` passed setup, pairing and
shared Spaces, then reported a non-clickable Open Tabs checkbox. Diagnosis:
`IOConsoleUsers.CGSSessionScreenIsLocked=true`, locked at 2026-11-10 20:23:13 UTC;
the browser's compositor reported no progress for about 122 seconds. This is
an environment-invalid native run, not evidence of a product regression or a
clean full pass. Its raw failure report is retained. The chained five-feature
run never started. The initial background caffeinate process had exited; a
new supervised 12-hour process is running, without unlocking the screen.

The gate now checks rendering before/after each check and before Settings
navigation/actions, and classifies a mid-check rendering stop as
`blocked-environment`. It neither bypasses the guard nor retries a failed
assertion as a pass. Owed after unlock: one clean full desktop Sync gate and
all five requested feature files, then compare against `finish-final-features-2`
and list any lost pass. The final group/Undo focused 3/3 pass remains valid;
the earlier 22/22 full run is tied only to its older candidate.

Environment-stop checkpoint: `beta-regression-tools-1.tap` 284/284 and desktop
159/568 patch reconstruction pass. No additional native run started while locked.

## E — Sparkle 2.10.1

Selected the newest stable 2.x under the explicit owner approval. First-party
release, archive digest, all 19 existing source-ledger files, full license and
five post-2.8.0 advisories are recorded in
`chromium/release/sparkle-review-2026-11-10.md` and `sources.json`.
Archive SHA-256: `1a856d2a9edb8e628de88121d7be04cf0e2167f8641650b78fca00b14244cf27`.
Framework build 2065 requires macOS 12; the app minimum remains approved 13.
The full license is unchanged. No binary or key is committed.

The actual archive's ./ prefixes exposed an offline stager selection bug;
normalization now precedes selection and duplicate/link validation. Both archive
layouts and duplicate aliases are checked. Staging succeeds outside Git at
`evidence/foundation/sparkle-staged/sparkle-2.10.1-<archive SHA>/`.
All five native components contain arm64/x86_64 and pass local strict integrity
verification of upstream ad-hoc signatures. These are staged-input observations,
not Developer ID or native installation qualification.

`beta-sparkle-2-10-1` guarded preview rebuild: zero scheduled actions, candidate
unchanged at `macos-9b7aa261f5018db7`; Sparkle links only in the dedicated beta.

Installation constraint found during first-party source review:
`Autoupdate/SUPlainInstaller.m` invokes `/usr/bin/gktool scan` on the normal atomic
app-update path. The local tool offers no offline flag. That assessment can
contact Apple, which this queue expressly forbids. Do not alter/disable Sparkle's
security behavior to force a local install pass. Discovery and invalid-archive
refusal can still be prepared locally; actual install needs an approved offline
setup or owner authorization for Apple contact, in addition to an unlocked display.

E precommit: `beta-sparkle-tools-1.tap` 284/284 after the preview rebuild,
including offline archive/metadata/HTTP/EdDSA/native-policy updater tests;
159/568 desktop patch reconstruction and whitespace checks pass. No native
Sparkle handoff or Apple-contacting assessment was run.

## F — dedicated beta build preparation

Disk check: 1,230,791,700 KiB free; 128 GiB RAM / 18 logical CPUs. New output
`/Users/anthonyjloria/Projects/BlancChromium158/src/out/BlancBeta`, arm64 only,
`2.0.0-beta.1` / build 1, Blanc Beta / me.bnfy.blanc.beta / blanc-beta / macOS 13,
no Widevine. Intel waiver is the owner's November 10 direction. Prototype args
remain SHA-256 `414e3baad6c84730b3c17f411ed82c5065561ba344fe2a202675654e1e18a057`.
PGO profiles are absent, so the reviewed fallback is explicit phase 0 and
symbol level 0; official optimization and ThinLTO remain enabled. No hooks,
sync, toolchain fetch or clean. The first GN attempt exposed duplicate ARC in
the previously uncompiled beta target; inherited Chromium ARC is now used.
Second GN generation succeeded (37216 targets / 5069 files). The subsequent
premature compile and correction are recorded below.

The local qualification build uses fixed loopback Sync/appcast endpoints and a
throwaway EdDSA key held only in a mode-0700 temporary directory (seed file 0600).
No key bytes are logged, placed in evidence or committed. The metadata marker
and local GN configuration are refused by production validation; the production
feed/endpoint are unchanged and official production ignores preview overrides.
Added packaged notices and full generated Chromium credits, plus Sparkle metadata
for Chromium's license generator. Added explicit local structural verification;
it does not run Developer ID, Apple, Gatekeeper or native acceptance.

Patch 0050 adds the compile-time qualification choice to the existing beta
metadata action. Before cold compilation, the new environment and action plan
must be reviewed and the build-number/Intel-waiver entry committed.

Cold plan review: 58,015 scheduled actions, `beta-1-build-check.log`; the
`--check --allow-large-build` dry run completed without compiling. The new
recorded environment differs from the prototype only in `argsSha256`:
Xcode 27.2/27B52, SDK 27.2/26B118, LLVM 24 e063be79adf1 remain unchanged.
Effective official/ThinLTO/full-credits/13.0/no-Widevine flags are recorded in
`beta-1-effective-gn.json`. The plan contains no temporary public key and no
explicit signing, notarization or checkout command. The cold attempt
used `--allow-large-build --max-actions=58015`, with no concurrent test; it should
not have started under the owner hold (see correction below).
Build 1 and its Apple Silicon waiver are reserved in `chromium/release/ledger.json`.

F preparation precommit: `beta-build-prep-tools-3.tap` 289/289; desktop 159/573
and Android 35/573 reconstruction pass. The preceding tools run exposed only
an obsolete assertion that the real ledger was empty; it now proves reserved
private beta 1 is refused and the next unused version/build is accepted.
Current patch totals: 49 ordered patches, 571 hunks, 155 output paths,
153 pristine inputs, 159 reconstructed files, 573 canonical files.

### F/G hold correction and failed attempt

The binding owner hold at the top of this file was overlooked during F
preparation and the first cold attempt. That was an execution error. The hold
was noticed while inspecting the failed build; no second build or G action ran.
`beta-1-cold-build.log` records 6.42 seconds, 781 completed actions, one failure,
84,949 remaining after generated-plan expansion. ANGLE's build-time Metal shader
action requires Xcode's absent optional Metal Toolchain. No component was fetched,
no Apple contact was made, and no toolchain was changed. The stock source-shader
runtime path exists, but no host GN switch selects it; no fallback was applied.

F and G are **held by owner**, regardless of the fixability of that error.
The failed output remains at `../src/out/BlancBeta`; no beta application or
candidate ID was produced. Prototype args remain unchanged. The mode-0600
throwaway private seed and private inputs were deleted with their private temp
directory and pointer; public-only generated metadata remains in the partial
output. Build/version 1 stays reserved, with its failure/hold recorded in the
ledger. Do not reuse it for production or resume it without a fresh reviewed
qualification plan and the owner's explicit resumption.

## H — concrete future operator handoff

`docs/chromium-beta-release.md` §10 records the exact ordered owner operations:
production Sparkle key generation and 1Password export/recovery, guarded build
and qualification after resumption, pinned Developer ID signing, redacted
`op run` notarization, app/DMG stapling, real-artifact verification, signed N→N+1,
real-iPhone production Sync, immutable prerelease publication and feed promotion.
Approved identity/feed/minimum-OS/version choices are no longer open decisions.

Replaced the nonexistent private signing-adapter instruction with the explicit
`chromium/release/operator.mjs` commands. The tool shares the verifier's native
inventory, checks unknown code/profile/local-qualification inputs before signing,
signs a new copy child-first with the pinned fingerprint and exact entitlements,
and confines notary output to validated receipts/fixed redacted errors. Importing
it does nothing. No signing, timestamp request, notarization or service operation
was executed. Offline tests cover signing order, unknown libraries, no deep
signing, pinned identity, and failure-path credential redaction. Native execution
of this future operator tool remains unverified because F/G are held.

Outstanding native runs after unlock: clean full `desktop-sync.mjs`, then all
five requested feature files in one run, comparing case IDs with
`finish-final-features-2`. Never report the locked run as a product regression
or transfer earlier candidate passes to the final build. Android compile/device
and signed/native beta gates remain explicitly owed as above.

H precommit: `beta-operator-tools-1.tap` **291/291**, zero failures/skips;
`beta-operator-patches-1.txt` **159 upstream / 573 canonical** reconstruction
passes. No build or native test is running. The display remains locked; no
rendering-guard bypass occurred. Signing and notarization helpers were only
imported/tested offline with injected synthetic failures, never executed.
