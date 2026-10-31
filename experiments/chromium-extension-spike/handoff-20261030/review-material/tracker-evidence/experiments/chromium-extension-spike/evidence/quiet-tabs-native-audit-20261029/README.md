# Quiet Tabs native integration audit

Current status: partial implementation, not qualified. The candidate has a guarded manual Quiet action, discard/wake integration, browser-wide delay setting, automatic sweep and a native Settings dialog. Scoped regular/private menu, storage/history and refusal tests passed. Native Settings interaction, the live 30-minute sweep, visibility/race coverage, full safety equivalence and Windows/Linux remain unverified. The development browser has not been promoted to this combined candidate.

The sections below preserve the sequence of implementation evidence. Earlier statements of missing code describe those earlier candidates, not the current source. The current blockers are:

- Unlock-dependent verification of the native Settings dialog and inactive-tab visibility mismatch. Race v3 stopped before its assertion because Chromium reported "Tab is currently visible"; its failure is preserved.
- The frozen v31 regular-profile automatic-sweep run passed in1863983ms (31m04s), with a clean fixture exit. Private/platform and remaining safety/UI coverage remain open.
- Remaining capture, navigation/probe races, repeated quiet/wake cycles, global capacity boundary, private page-state and platform coverage. Existing scoped tests do not establish full parity.
- The separate selected-search isolation qualification still prevents promotion of the combined candidate.

Shipping source: v1.45.0 / 6f1bc523, src/main/tab-sleep.js sleepCandidates and src/main/main.js explicitSleepEligible/quietTab. Exact policy is retained beside this report and source hashes in source-identities.json.

Native option selected for further integration: targeted PageDiscardingHelper::ImmediatelyDiscardMultiplePages with an eligibility policy, preserving Chromium's renderer lifecycle and reload path. Do not use TabLifecycleUnitExternal::DiscardTab or TabManager::DiscardTabByExtension directly: their implementations do not run full eligibility selection. Do not pass a null eligibility policy or allow protected pages to be discarded.

Shipping-specific conditions still requiring mappings: active and visible Split/Glance panes; loading/asleep/transition state; pinned/muted/ever-used media; active capture/display share; pending permission; live opener/child family; inherited policy/adopted tabs; deep scrolling; committed HTTP history; dirty form and sessionStorage probe with navigation epoch revalidation; 50-snapshot cap and private page-state policy. Native eligibility covers several media/form/visibility conditions, but that is not proof of the complete shipping contract.

Implementation sequence: map and test each refusal signal; revalidate target identity and navigation after asynchronous probes; invoke policy-checked targeted discard; project quiet/waking status into Island and restore focus/history on activation; then add the off/30m/1h/6h settings and idle sweep. Exercise dirty forms, capture, private history, opener families, visible panes, wake Back/Forward and repeated requests. No discard was executed during this audit; no source/output/profile mutation or build.

## Eligibility implementation

`native/quiet-tabs/eligibility.h` implements an all-known eligibility gate and post-probe identity revalidation. The standalone C++ transition test passes: every hazard becoming present or unknown refuses discard, owner/tab/document changes invalidate the probe, missing history/native/storage proof refuses, and the50-snapshot boundary refuses. This is preparation, not integrated runtime evidence.

The mapper must set `kInheritedPolicyRequiresLiveRenderer` for non-inert inherited-policy tabs; an inert explanation page is not automatically the same hazard. Beforeunload and storage proof must be mapped with the actual native lifecycle contract. Do not report Quiet Tabs implemented until the collector, all-frame dirty probe, discard action, wake behavior, settings and browser tests are integrated.

## Native read-only dirty probe

`native/blanc_quiet_probe.h` now runs the shipping dirty-control script in an isolated world across all frames, with one250ms deadline. It returns booleans only. It refuses missing/dead/changed documents, changed frame count, malformed replies and frame counts above256. No discard is enabled.

Candidate v18 built after fixing explicit Value conversion and constructor/destructor style failures. Normal zero-action guard passed. Framework6038cf3269d3a4d087146a62b44ea8682c151c9fcce8ead6fe3574545ceff2df. browser-quiet-probe-v1 passed clean input, programmatic edit, cross-origin password frame and sessionStorage in regular/private (two clean exits). browser-quiet-probe-timeout-v1 returned incomplete/dirty in254ms while the disposable renderer was busy for1second, then exited cleanly. Results live in ../custom-tab-name-20261029. Build logs retained in outer evidence/quiet-probe-{incremental,repair}-20261029.

Still missing: native signal collector, discard/wake integration, settings/sweep, exhaustive race and safety tests. This evidence does not qualify Quiet Tabs or promote the combined candidate.

## Native observation collector

Candidate v19 adds a read-only quietState observation for a window-owned tab: active/visible split, pending/loading, pinned/muted/audible, capture, permission prompt, live opener family and committed HTTP history. Silent-media history, inherited-policy proof, native eligibility, storage-preservation and beforeunload remain explicitly unmapped; safeToDiscard always remains false. This does not enable Quiet Tabs.

Build passed with normal zero-action guard, frameworkdcc8bffbb895d02326b973612db5ea25cf45f7a493a0f2057ef97a34e38686fa. browser-quiet-state-v1 checks background, pin/mute and visible inactive split observations in regular/private, and verifies missing proofs stay unknown/refused. Two clean exits0. Capture/permission/opener event cases still need targeted runtime checks.

## Document-scoped media history

Candidate v22 tracks media playback from tab insertion/commit via a WebContents observer. Existing unobserved documents remain unknown; new committed documents have a known clean starting state. Playback, including muted media, marks the document used. Pause and same-document navigation retain the mark; a new main-frame document clears it, matching shipping main.js onMainFrameCommit.

Build and normal zero-action guard passed, framework8acd1e8f3452063c04bca5c6342b456c5b26ef9520f1948600daad7689657e71. browser-quiet-media-v1 passes clean/muted/pause/same-document/new-document cases in regular and verified primary-private contexts, two exits0. Test-only autoplay flag used with generated silent WAV; no production autoplay behavior changed. First compile failure retained under quiet-media-incremental-20261029. Quiet action still disabled pending remaining lifecycle proofs.

## Native policy and before-unload mapping

Candidatev24 queries DiscardEligibilityPolicy::CanDiscard(PROACTIVE, ignore_recent_visibility=true) through the live performance graph and reads before-unload disablers across frames. It does not force-discard protected pages. The existing graph gained a direct performance_manager dependency; caches/toolchain unchanged. Build and zero-action guard passed, framework6ea4ad1d0c2d2097f89b5780026f80a5eca8bd97de9bb616f10c239332c0053b. browser-quiet-policy-v1 passes native visible-page protection and before-unload detection in regular/private, two clean exits. Inherited-policy and storage preservation remain unmapped, safeToDiscard false. Raw initial namespace compile failure retained.

## Inherited document provenance

Candidatev25 retains opener provenance in tab-owned observer state, so losing the live opener does not clear the hazard. Tabs observed from insertion without an opener can report false; older unobserved provenance remains unknown. Current sandbox flags independently mark inherited-policy protection.

Build and zero-action guard passed, framework1456d032d59f860f26db9438740bb39f88d32408daf374622be0637867f98a0a. browser-quiet-provenance-v1 passes ordinary-tab known state, popup protection retained after opener close, and sandbox protection in regular/private. Two clean exits. Storage-preservation qualification and full discard/wake integration remain; no discard enabled.

## Guarded discard and storage transfer

Candidatev26 adds guarded quietTab API (not a visible menu). Native policy must report eligible; active/visible panes, pin/mute/media/capture, pending permissions, opener/inherited state, beforeunload, loading, unknown provenance and50-discard capacity refuse. The bounded dirty probe runs, then identity and native conditions are checked again. The policy-checked helper performs discard; no force-discard API is used. The replacement hook transfers custom title, tab identity, split marker and lifecycle observation. Chromium copies navigation/session-storage state.

Build and zero-action guard passed, frameworkb71ad85a9d126b3fb07a8a62a25d40e57445754b46cc3f7ed380ab813e9693e2. browser-quiet-storage-v1 proves document.wasDiscarded after wake, seeded sessionStorage, custom title and Back history in regular/private. browser-quiet-refusals-v1 verifies active/pinned/muted/dirty/beforeunload/sandbox refusals in regular/private. Four clean exits. These are local scripted cases; visible UI, capture/event races, full page-state/privacy policy, repeated-cycle and platform coverage remain. The standalone policy header is not the action implementation; native action has explicit equivalent guards and still needs full equivalence review.

## Explicit Quiet menu

Candidatev27 exposes Quiet This Tab Now for background rows using the same pre/post-probe guard for menu eligibility and action. The click revalidates; active rows hide the action, and quiet/protected rows disable it. Native `asleep` state is projected into the existing renderer's quiet treatment.

Build and zero-action guard pass, framework6135f3eeee740e9ca9722c6243f9ca667f95ee99ab6dba4d207abaf19829ca0e. browser-quiet-menu-v1 clicks the actual overlay action, checks quiet state/disabled item, wakes by activation, and checks active-item omission in regular/private. Two exits0. Automatic delays/settings, broader safety race coverage, physical/accessibility/visual qualification and other platforms remain open.

## Quiet delay and sweep implementation

Candidatev29 registers browser-wide Local State quiet_delay, default1h, values off/30m/1h/6h. A30-second sequential sweep uses the same CompleteQuiet gate as manual quiet, rechecks delay after the probe, skips offline/startup/persistence/Space transitions, and applies renewed grace after a backward clock jump or gap over60seconds. Settings are not synced or per-private-window. The visible Settings control is not yet connected.

Build and zero-action guard passed, framework3f876b9d1063d31afde2a05442f76f61a3952d1487a1d9faf08cdc7244ea0c2b. schedule_test.cc passes exact thresholds, Off and clock-jump rules. browser-quiet-settings-v1 verifies default, valid/invalid writes, regular/private sharing and persistence (three exits0). browser-quiet-storage-v2 verifies the refactored common discard path (two exits0). This does NOT prove an actual30-minute/1-hour timed sweep. Outstanding: timed sweep integration, visible control, global50-tab cap accounting (current native count is per profile), capture/race/private page-state review and platform qualification.

## Global cap and timed run

The cap now counts discarded tabs across browser profiles, matching the global shipping ceiling. v30 built and passed zero guard. Its timed fixture was aborted after identifying an overly strict initial_window_saved readiness gate; raw progress and aborted.json are retained. v31 instead refuses failed/pending saves and active SessionRestore, without requiring every ordinary window to produce a new-window save. v31 built/zero guard passed, framework9e129c95ca1ebec988e9650c37beda50de5bb5efbc500e0a55f1efa1cd6238ce.

Unaccelerated timed v2 is running on a frozen app copy at outer evidence/quiet-timed-v2-20261029 with a disposable profile. It must observe no early quiet and actual automatic quiet after30minutes, within32minutes. No result claimed yet. Global50 boundary runtime coverage, visible Settings and broad race/platform coverage remain.

## Settings focus repair and race qualification in progress

v33 compiled and passed the zero-action guard; framework 58e8fa5ddf5a17e3b42f9c2ce950e96c29a645bad3f9f5883ba4383c8a56c898. The first physical Settings test timed out before Save and exited cleanly; retain browser-quiet-settings-ui-v1.json as a failure. Host dismissal now occurs before showing the native dialog, without refocusing the page afterward. This is asset-only v34, not a new native build. Physical verification is pending Mac unlock; no visual acceptance is claimed.

The new foreground-switch-during-probe test v1 could not establish native eligibility and therefore did not exercise its race assertion. v2 adds an explicit committed title readiness condition; its outcome is pending. Neither is evidence of a passing race yet. The independent frozen v31 30-minute timer test remains running.

Race v2 also failed at native eligibility protected, before the race. Both fixture browsers exited0. Preserve both failures; determine the native protection reason rather than bypass it.

The v35 read-only reason diagnostic built and zero-action guard passed. Race v3 exposes "Tab is currently visible" while Blanc reports inactive/non-visible-pane; no race assertion reached. Preserve this visibility mismatch and investigate after unlock; no protection was bypassed. Framework dbd139b26e1fe7c4f91c2e946ffb462a796457f4be120929d5c54bbf36eedcd6.

Source follow-up: Chromium WebContentsImpl::UpdateWebContentsVisibility explicitly retains initial visibility until did_first_set_visible_ observes a real VISIBLE transition. BrowserView::OnActiveTabChanged detaches/attaches the content view normally; the prototype SyncActive only observes the active contents and does not override visibility. This is a plausible explanation for the locked-screen-only fixture failure, not yet proven causal. Recheck after unlock; do not call WasHidden manually or alter discard policy to force acceptance.

## Current-document safety repair

v36 checks that every probed document is still a member of the current frame tree, and checks current main-frame identity before discard. This closes the code path where document liveness alone could accept a document retained in BFCache. Build and zero guard pass, framework78e04766884936497417517be44c971d799841578b25b60ebbad800e0e50fea9. The proposed frame race harness did not establish concurrent overlap: v1-v5 failures remain, v5 confirms clean baseline but probe settled before replacement. No race acceptance is claimed; a deterministic overlap harness remains required.

Paused-renderer navigation attempts v1-v3 also fail the proposed assertion. v3 returns a clean observation; client-side pending promise alone does not prove native overlap, and no discard was executed. Do not treat this as a passing race or established product failure. A native overlap signal or equivalent deterministic fixture remains needed. All own browsers exited0; failures retained.

Latest reference revalidated as v1.45.1 / 85883b1a. Exact published diff leaves tab-sleep.js unchanged; main.js changes concern routed-window focus and shared-sync projection, not Quiet. Earlier scoped Quiet evidence remains relevant but does not establish the outstanding acceptance items.

## Real-time automatic sweep result

The frozen v31 regular-profile run passed at1863983ms (31m04s), with no early quiet, and browser exited0. Result: ../custom-tab-name-20261029/browser-quiet-timed-v2.json. exec81060 terminal0. Final progress.json retains status=running from the last heartbeat; the final result and terminal handle establish completion. Do not repeat this passed regular sweep without an affected change. This is not private/platform or physical UI acceptance.

## Deterministic removed-frame probe check

Frame-race v6 passed regular/private. It verifies a clean baseline, sets a child-origin beforeScriptExecution breakpoint, checks the paused script is the native dirty probe, then removes that child through the parent. The probe returns complete=false/dirty=true. Both browsers exit0. This proves a specific real in-flight frame-removal refusal, not full BFCache or active-tab/action race coverage. Earlier timing-based failures remain. Framework78e04766884936497417517be44c971d799841578b25b60ebbad800e0e50fea9.

## Additional deterministic lifecycle cases

Using the same verified native-probe breakpoint, replacement-frame v1, tab-close v1, and main-navigation v1 passed regular/private. Each invalidated the probe with complete=false/dirty=true; six fixture browsers exited0. Main-navigation also verifies the replacement URL committed. These are read-only probe cancellation checks; full BFCache restoration and guarded-discard action races remain unverified. No passed suites were rerun.

## Unlocked native Settings checks

Owner unlocked. browser-quiet-settings-ui-v3 and browser-quiet-settings-ui-private-v1 passed with CUA native interaction: popup shows Off/30minutes/1hour/6hours, save6h is read back, canceled Off leaves6h, regular/private fixtures exit0. Private context is independently verified. Screenshot inspected with readable label/help/buttons and no clipping. This supplements the harness's older generic scope string; not full screen-reader, localization, or platform acceptance. Development instance untouched.

## Unlocked active-tab action race

After unlock, native eligibility is reached and browser-quiet-race-v5 passes regular/private: activate during the Quiet request, expected rejection handled immediately, asleep=false and document.wasDiscarded=false, both exits0. v4 exited from an unhandled expected API rejection; its failure and unavailable exit status are recorded in browser-quiet-race-v4-failure.json. No protection change was needed. The successful unlocked setup supports the locked-screen visibility explanation without proving all occlusion cases.

## Global capacity and private lifetime

Global-cap v1 passes49regular+1private discarded tabs in the same browser process; the51st refuses and waking1returns a slot. Private lifetime v1 retains synthetic session/localStorage through Quiet/wake, but restarting the private profile restores neither tab/custom name nor storage. A full closed-profile scan (141files,7647780bytes) has no UTF8/UTF16 plaintext canary. Three clean browser exits. This is scoped local evidence, not proof against every encoded/forensic persistence channel or full platform acceptance.

## Camera and microphone capture

Capturev2 regular checks and capturev3 private checks pass on v37: synthetic fake_device_0 video and Fake Default Audio Input audio are live; native protection reasons identify the capture, Quiet refuses, stopping tracks restores eligibility and Quiet succeeds. Three clean browser exits. Private v3 uses a CDP-created context with confirmed private tabs; the ordinary primary incognito grant in v2 is unsupported and its failure is retained. v1's fake UI bypasses the real indicator path, so it is not capture acceptance. No real device or system permission was accessed. Display/tab sharing, media UI badges and other platforms remain open.

## Local-tab sharing and private capture delivery

The chooser's local audited auto-select-tab flag matches only the uniquely named fixture tab; screen/window selectors are not enabled. Regular tab-sharingv1 checks pass: the mirrored source and the capturing page both refuse Quiet; stopping tracks releases the source. v1 then fails an inappropriate private handle assertion.

Private v5 passes the same guard/recovery checks using native source identity (exact tab id, fixture URL, capturing/mirrored state), while the renderer handle remains null and its label opaque. Pixelv1 separately verifies decoded synthetic source pixels[14,56,92,255] against[13,57,91,255], using declared3-level RGB codec tolerance. No real desktop/window/personal content is selected.

Failed private v2/v3 waited for a future requestVideoFrameCallback after play on a static source; the already decoded frame is available, so those timeouts are not an established delivery failure. v4's opaque-label failure is also retained. All fixture processes exited0. This qualifies scoped tab-sharing Quiet guards and one synthetic private frame, not media quality, full screen/window sharing or other platforms.
