# Result

Queue 2 in progress; local commits only. No live-tree or production access.

| Item | State |
| --- | --- |
| A shared Spaces | Implemented: two-window native gate 3/3; full regression owed |
| B native icons | Implemented; peer icon/privacy pass; clean full gate owed in D |
| C Android safety | Partly: available checks pass; Linux 156 compile/device gates owed |
| D regression | Owed; comparison baseline finish-final-features-2 |
| E Sparkle | Owed; existing 2.8.0 pin is not security-cleared |
| F dedicated beta | Owed; initial disk check 1.1 TiB available |
| G local beta proof | Owed |
| H operator handoff | Owed |

Prototype: macos-01fd557468d72dd0, beta-icons-native-4-runtime-config.json.
Beta candidate/app: not built.
Gate: beta-spaces-native-8-gate 3/3; bridge unit tests 6/6.
Scenario: sync.feature:162 passes on candidate 8 (beta-spaces-pairing-8).
Latest precommit tools: 282/282; patches: 159 desktop / 35 Android / 568 canonical.
Lost native passes: not measured yet.
Android: 282/282 tools; bundle current; 35-file lane reconstruction; 38 syntax checks.
156 compile and device/emulator execution owed: no tree/output; Darwin arm64 host.
Owner next: no input needed at this checkpoint.
Unverified: wider Spaces regression, final shutdown fix, Android, regressions, beta build,
Sparkle linkage/handoff, signed distribution, production real-device Sync.

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
