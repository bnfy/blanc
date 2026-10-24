# Migrate to a Chromium fork: implementation plan

**Primary implementation plan — status reconciled October 23, 2026.** This remains the governing plan and ordering for Chromium migration. The owner explicitly requested that ongoing work update this plan. The [Mac preview checklist](../experiments/chromium-extension-spike/mac-preview-release-checklist.md) is a supporting readiness checklist, not a replacement roadmap, authorization, or waiver of the gates below. Historical estimates are not a current release ETA.

### Decision 2 closure priority — October 22

The [review package](../experiments/chromium-extension-spike/decision2-review-package-20261022.md), [gate reconciliation](../experiments/chromium-extension-spike/mac-preview-gate-reconciliation-20261022.md), [cost sheet](../experiments/chromium-extension-spike/decision2-cost-sheet-20261022.md) and [concrete preview proposal](../experiments/chromium-extension-spike/mac-preview-scope-proposal.md) are prepared. Four authoring deliverables are complete; acceptance is not. Report this progress alongside final sign-offs. Prioritize scope/maintenance decisions, one matched visual/VoiceOver session, current-candidate provenance and isolated artifact acceptance. Do not continue expanding already-covered lifecycle permutations without an unmet written criterion or observed defect.

### Running Mac preview release-candidate readiness

`[■■■■■■■■■□□□] 9/12 launch gates cleared (75%) · Δ +1 L8 signed distribution accepted, October 23, 2026`

This counts accepted L1–L12 gates in the [supporting readiness tracker](../experiments/chromium-extension-spike/mac-preview-release-checklist.md#running-mac-preview-rc-readiness), not engineering completion or time remaining. Prototype features and extensive bounded tests are implemented, but no frozen candidate has complete launch-gate acceptance. L2 signed-artifact acceptance: [owner record](../experiments/chromium-extension-spike/evidence/l2-owner-acceptance-20261022/README.md), native checkpoint `78f92ceb`, automated evidence `04a88217`. L9 is now accepted through the [signed notice/live withdrawal route](../experiments/chromium-extension-spike/evidence/preview-notice-20261023/README.md). Current CI is a separate L11 gate. Decision 2 remains open; preview scope was approved October 22.

Keep this bar in subsequent progress updates. Award one cell only when the corresponding gate has its complete evidence/approval record; report `Δ 0 gates` when new tests improve supporting evidence without closing a gate. Record regressions and denominator changes explicitly. L11 exact-head CI/audits is blocked by the owner’s pending-Electron-build decision. L12 materials are prepared; final readiness/go-no-go still depends on the unaccepted prerequisites. Decision 2 and L4 authentic external-upgrade proof remain independent; do not resume an unlimited stress-test matrix. Google baseline stays separate. Latency deferred; Electron diagnostic build pending approval/unstarted; neither is counted as passed.

### October 23 — certificate replacement L8 owner acceptance

[Authenticated replacement and owner record](../experiments/chromium-extension-spike/evidence/l8-certificate-distribution-20261023/README.md): source7c427328/archiveffcfefdfbb54, six exact hosted/downloaded files, actual Safari quarantine/signature/ticket/Gatekeeper, both owner-reported controlled restart checks, selection/Shelf/Bitwarden-popup/Shipping preservation. Read-only postcheck binds all458files/5symlinks of the running copy and both saved Example entries. The initial first-launch missing-tabs observation is retained with unresolved concurrency attribution; no repair is claimed. **L8 accepted for the replacement;9/12,delta0.** This replaces existing L8 artifact acceptance, not a new gate. L4/L11/L12 and Decision2 remain open; no release/merge,Google separate,latency/Electron pending.

### October 23 — controlled restart passes; first-launch attribution unresolved

[Owner follow-up](../experiments/chromium-extension-spike/evidence/l8-certificate-distribution-20261023/first-launch-report.json): both recreated Example tabs return after one Cmd+Q/reopen; exact running7c427328 bytes and both saved Example entries verify read-only. The owner disclosed concurrent iOS Sync testing, so the earlier first-launch absence is not a controlled upgrade regression. The other session's recorded use of isolated data does not prove Preview interference either. Preserve the finding without claiming a fix or a cause. Remaining controlled hand checks are pending;9/12delta0, no build/profile mutation,Google separate,latency/Electron pending.

### October 23 — replacement owner first-launch tabs finding

[Owner finding](../experiments/chromium-extension-spike/evidence/l8-certificate-distribution-20261023/first-launch-report.json): previous Example tabs absent on first launch, on the expected7c427328 source and regular Preview profile. Open-session streams contain one tab/no Example navigation; historical Tabs streams contain Example records. Cause and transition timing remain unresolved; no automatic restart/profile edit or recovery attempted. A controlled loaded-tab/Cmd+Q/reopen owner check is pending. **No replacement L8 acceptance; automated46checks do not close this finding.** Prior dated gate records remain scoped; no new gate credit.

### October 23 — replacement manifest and hosted bytes authenticated

[Distribution evidence](../experiments/chromium-extension-spike/evidence/l8-certificate-distribution-20261023/README.md): source7c427328/archiveffcfefdfbb54 manifest verifies as pinned anthony@bnfy.me / GitHub issuer, locally, on the release Mac and from a fresh downloaded packet. Both actual tamper controls reject; all458files/5symlinks, provenance and licenses verify. Unpublished draft422428502 has six matching assets; all six fresh anonymous asset GETs match without account credentials forwarded. The owner then downloaded in Safari on MacBook:458files/5symlinks,Safari quarantine,signature,ticket and Gatekeeper pass; replacement closed before verification. Final owner ordinary-launch/two-restart/Shelf/Bitwarden-popup/Shipping-preservation check is pending. No new build, profile mutation or public release;Google separate;latency/Electron pending. **9/12,delta0;replacement L8 and final approval remain unaccepted.**

### October 23 — native certificate replacement notarized;46 frozen checks pass

[Replacement evidence](../experiments/chromium-extension-spike/evidence/l11-native-replacement-20261023/README.md): source `7c427328100d1ba76cb7e8b651a1f36d74ec86c6`, archive `ffcfefdfbb5421619f3ba359bb4c5d92134b468ac8475c18eda12153a7f5e4ed`, Apple Accepted `e46dbe18-f1f1-424e-abe9-ab44b79ef29c`. Zero-action native guard;12compliance tests;17executables/10preview identities verified;all eight SPKIs present. Apart from the certificate table, the native patch exactly matches the prior accepted source. After stapling,7startup/6encrypted-recovery/17core/16notice checks pass;all458files/5symlinks remain unchanged. Initial authorization timeout and restricted-trust verification incident remain separate setup evidence. Local checksum/SBOM/inventory/provenance packet prepared; manifest authentication, fresh download and replacement-artifact acceptance remain pending. No Chromium recompile, Electron build, permanent/Google profile changes or release. **9/12,delta0;L11 still blocked by its independent sandbox failure.**

### October 23 — fresh L4 Google offer check: no eligible update

[Official endpoint evidence](../experiments/chromium-extension-spike/evidence/l4-google-offer-20261023/README.md), 08:00 PM EDT: all six requests return HTTP200; retained Bitwarden2026.10.0 receives `noupdate`. Isolated baseline was already closed; disk version/from-Web-Store metadata and profile/backup critical-file hashes are unchanged. No native updater/restart or fresh enabled/popup result is claimed. **L4 open;9/12(75%),delta0.** Keep the bounded monitor through November3 and require a real native upgrade before acceptance. Permanent profiles/tabs untouched; latency deferred, Electron diagnostic build pending.

### October 23 — L12 readiness materials prepared; release remains NO-GO

The [artifact-specific decision packet](../experiments/chromium-extension-spike/preview-release-decision-20261023.md) and [tester guide](../experiments/chromium-extension-spike/preview-user-guide.md) now cover installation/removal, separate profiles/keychain, manual update/matching-backup rollback, feature exclusions, privacy-aware reporting, sole-maintainer withdrawal and final approval requirements. The packet binds the accepted6b9a05a0 evaluation archive and explicitly refuses to promote it as the newer certificate-patched candidate. It records L4, blocked L11, replacement-artifact qualification and Decision2 as remaining dependencies. L12 documentation preparation is complete; artifact-specific owner go/no-go is not requested while prerequisites fail. **9/12(75%),delta0;L12 not accepted.** No build, runtime/profile change or release; Google separate, latency/Electron pending.

### October 23 — native clone also fails sandboxed duplication

[Runtime investigation](../experiments/chromium-extension-spike/evidence/l11-sandbox-duplication-20261023/README.md): the supported Electron44.9.1 `webContents.clone()` alternative fails the unchanged real middle-click/duplicate storage assertion too (`allowed` versus `SecurityError`, before group reopen). The trial was reverted completely. No safe app-only repair has been demonstrated; the owner explicitly chose to keep Electron builds pending and record L11 blocked. Native clone with history-index navigation also fails the same assertion and was reverted. **L11 open;9/12(75%),delta0.** No assertion weakening, native build, profile changes or new artifact acceptance; Google separate and latency deferred.

### October 23 — original L11 findings cleared; sandbox duplication remains

[Hosted verification](../experiments/chromium-extension-spike/evidence/l11-repair-20261023/README.md#hosted-repair-head-verification-and-remaining-failure) on repair head9f27af90: substrate passes and actual PR-ref CodeQL has zero open alerts (all48 cleared). Native eight-key coverage passes. Separate Windows/Linux and local44.9.1 modified-link failure: a sandboxed child's duplicate regains storage access before group reopen. The native inherited flags are not present in the recorded JS preferences. An unsuccessful history-only repair was reverted; no assertion weakened or Electron diagnostic build started. **L11 stays open**, with no additional gate credit or new signed-artifact claim. Preserve Google baseline; latency/Electron pending.

### October 23 — L11 source repairs and native revocation verification

[L11 repair evidence](../experiments/chromium-extension-spike/evidence/l11-repair-20261023/README.md) updates Electron44.9.1 and siteZod4.6.7 without suppressions; all four dependency audits,4,175unit tests and sitebuild/SEO pass.48prior CodeQL alert flows are repaired; exact-head hosted clearance is still required. Chromium's native updater fetched CRLSet10856 in an isolated profile. Six TLS keys were present; the other two code-signing keys are invalid for TLS. A built-in eight-key patch now protects before component download:16native CRLSet API checks pass plus an unlisted control, six TLS certificates report REVOKED, two code-signing certificates report INVALID, unrelated certificate verifies. Temporary diagnostic is removed and stock tool restored. Guarded native browser build72steps/38.12s; guard0;73files179hunks. No Electron build or latency run. The previous signed artifact is preserved and lacks this patch; replacement signing/artifact-bound requalification is pending. **L11 stays open; no additional gate credited.** Google baseline separate; no merge/release.

### October 23 — L11 exact-head audit blocked

[Exact-head audit](../experiments/chromium-extension-spike/evidence/l11-audit-20261023/README.md) on `dc9d5556` finds 14 successful, one failed and six running checks at the recorded snapshot. Substrate fails high-severity Electron44.8.0 and siteZod4.6.5 advisories; first fixed versions are44.9.1 and4.6.6. The current CodeQL job is pending; the correct PR-merge-ref endpoint retains48 prior-analysis test/evidence-harness alerts requiring review/repair, not silent dismissal. The native candidate's dynamic CRLSet/compromised-key disposition is also unqualified; static blocklist absence alone is not runtime-exposure proof. **L11 open;9/12(75%),delta0.** Repair/dispose findings and verify complete exact-new-head CI before L11 acceptance. No dependency/code/build change, no job rerun, merge or release. Google separate; latency/Electron pending.

### October 23 — L8 signed distribution accepted

[Current replacement packet](../experiments/chromium-extension-spike/evidence/l8-replacement-20261023/README.md), source `6b9a05a0` / archive `a7fe468c648e`, verifies all 458 files/five symlinks, source/license/SBOM/provenance bindings, strict signature and Apple ticket. Fresh Safari Sigstore authentication now verifies against pinned `anthony@bnfy.me` / `https://github.com/login/oauth`; actual changed-manifest and changed-artifact controls reject. The release Mac independently authenticates the packet. All six unpublished hosted assets match; six fresh anonymous HTTPS downloads also match every byte and the downloaded packet authenticates, without forwarding account credentials to the asset host. Twelve compliance/seven verifier tests pass. Draft422364839 remains unpublished. The actual MacBook Safari download now verifies all 458 files/five symlinks, Safari quarantine, strict signature, ticket and Gatekeeper. The verified `Blanc Chromium Preview-2.app` was closed before first launch on macOS 27.2/arm64. The owner now confirms **“All checks passed”** for ordinary launch, two clean restarts, tabs/selection/Shelf, Bitwarden popup/Tab focus and Shipping-tab preservation. The running App-Translocated copy matches the authenticated candidate source and all 458 files/five symlinks; postcheck Shipping hashes remain unchanged. Prior installation-permission Cancel/retry evidence maps through unchanged UI/assets/bundle identities/Developer ID/upstream, with current-candidate download/launch/restarts/popup verified separately. The initial Downloads-only process-path assumption missed normal macOS translocation; correcting that optional diagnostic verified the correct app, not a product failure. Three separate current-candidate fresh-profile startup/clean-quit checks also pass on the MacBook; its own disposable profile was removed, with no permanent/Google profile copy or reset. **L8 accepted: 9/12 (75%), delta +1 L8.** L4/L11/L12 and Decision 2 remain open. This is bounded second-Mac acceptance of an unpublished validation packet, not a factory-clean OS, hermetic rebuild, production migration or public release. No build, merge or release; Google separate; latency and Electron pending. Earlier dated statuses below retain their historical scope.

### October 23 — intermittent startup restoration scheduling repair

The [scheduling repair](../experiments/chromium-extension-spike/startup-restore-scheduling.md) removes Blanc macOS restoration from the pre-main-loop startup stack: dispatch a non-nestable task with owned value inputs, process/profile keep-alives and a weak profile recheck, then reuse the native restoration/fallback helper and notices. No empty session or competing read is introduced. Six original signed sequences and twelve signed diagnostic sequences passed, which alone does not explain the original failure. An ad-hoc diagnostic Keychain block and an unintended bare prototype UI launch (closed normally) are retained separately as test/setup incidents. Temporary native logs are removed byte-for-byte. Incremental repair build 32.89 seconds/eight steps, final guard 0; fresh 72 files/178 hunks. [Frozen signed qualification](../experiments/chromium-extension-spike/evidence/l6-restore-scheduling-20261023/README.md) now passes **125 checkpoints (92 recovery/startup, 33 core/notice)** on source `6b9a05a0`, archive `a7fe468c648e1b3d096a49e663e06b182bb483353fb5c4bb1c37dc8349994aca`, Apple Accepted `47e56224-454f-4765-9bd6-f7868a245f32`. Notarization/stapling finished before tests; all 458 files and five symlinks remain frozen. A deterministic functional ordering negative control rejects the old pre-main-loop entry and passes the repaired and final stapled candidate; this is not a latency comparison. Prior explicitly accepted recovery UI and seven UI/blocker assets map unchanged. **L6 accepted again: 8/12, delta +1.** L4/L8/L11/L12 and Decision 2 remain open. L8 requires this replacement’s distribution/provenance acceptance, not the older download record. Google stays separate; latency/Electron pending. Earlier dated statuses below are historical.

### October 23 — owner normal-restart failure, L6 reopened

[Normal-startup diagnosis](../experiments/chromium-extension-spike/evidence/l8-normal-startup-20261023/README.md) reproduces the MacBook report: without an explicit startup setting or restore flag, the signed app opens only New Tab; the same closed session restores all tabs/selection with the flag. Prior scripted tests supplied that flag. L6 is reopened and L8 remains unaccepted: **7/12 (58.3%), delta -1**. Source `7065f9c0` makes saved-session continuation the registered Blanc default and guards new profiles, preserving explicit user/managed preferences. Two incremental builds completed; Apple accepted/stapled the replacement. Final seven normal-startup/preference controls plus 49 recovery, 17 core and 16 notice checks pass. One earlier intermittent synchronous-restore timeout in the nonregular-record sequence remains unresolved; subsequent identical and old/new online/offline controls pass, which does not close that finding. The corrected Safari download on the MacBook matches458files/5symlinks with quarantine, strict signature, Gatekeeper and staple validation passing; existing Bitwarden and Shipping hashes are preserved. The owner now confirms both normal MacBook restarts, including tabs/selection and the requested Shelf/Bitwarden checks. Post-restart read-only checks preserve Shipping hashes and the installed Store extension. L6/L8 acceptance remains open for the separately recorded intermittent restoration wait; normal-restart confirmation does not resolve its cause. The owner profile and Google baseline remain unchanged. Latency deferred; Electron diagnostic build pending.

### October 23 — L8 readable credits repair; final acceptance pending

[Current L8 work](../experiments/chromium-extension-spike/evidence/l8-signed-distribution-20261023/README.md) prepares a 340-component SBOM, source/build materials, final inventory and authenticated checksum manifest. Initial packet `419b8276` passed Apple notarization, real signature verification, tamper rejection and 39 runtime checks, but the final audit found its readable Chromium Credits HTML was the upstream placeholder. Its full license texts exist in SPDX; the initial packet is superseded and does not close L8.

Source `57fc3b13` now generates readable notices for all 323 native components from 320 complete license texts and fails closed on missing text or placeholder HTML. Twelve compliance tests pass. The replacement is Developer ID signed, Apple Accepted (`47535090`), stapled and manifest-authenticated; 39 signed checks and zero-action native guard pass. Second-Mac exact-file download/launch/extension integration remains pending. The initial native Safari downloads have quarantine and Gatekeeper evidence, not replacement-artifact acceptance. No Chromium compilation; packaging launcher only.

**L8 remains open; 8/12 (66.7%), delta 0.** The fixture is an unpublished draft, with no public release approval or permanent public-download claim. Google baseline remains separate. Latency deferred; Electron diagnostic build pending approval/unstarted.

### L6 close-history regression repaired and acceptance reinstated — October 23

[Current signed repair](../experiments/chromium-extension-spike/evidence/l6-close-warning-repair-20261023/README.md) reproduces the warning on the previous signed candidate: closing an untouched, unpinned New Tab with no Recently Closed entries demands a flush of a history file Chromium deliberately never created. The watcher now matches that native exclusion. It still rebuilds/flushes the surviving session and flushes any existing history; pinned or navigated New Tabs retain their history. Backend errors, unload cancellation and private exclusion are unchanged. This is not evidence that the original owner warning meant tabs were lost.

**70 signed checkpoints pass:** 21 close-history controls (fresh/pinned/navigated New Tabs, actual Island ×, pre-existing history after restart and real Session write-failure/retry) plus the complete eight-schedule/49-check bounded recovery suite. This covers encrypted restart/crash, failed-write retry, Split/Recently Closed, grouped multiwindow/Spaces, private exclusion, native Cancel/Leave, nonregular read/clean Quit and owner/profile teardown. The previously owner-approved recovery UI is source-identical; that mapped UI acceptance is retained without claiming a fresh provider outage or waiting-screen observation. L5 input/VoiceOver acceptance maps through unchanged UI controls/assets; no new spoken pass is invented.

Source `f4996df4e88c775bc1947a574b2bd7a0f9ad7539`, signed/stapled ZIP `bc145e5ea41278971fd3384d0334d15f7140e0d4170e6b05f8e6a8d8f5c52bca`, Apple Accepted `9a8bd400-bb73-4555-8740-f2e09f115fd6`. Strict signature/staple/Gatekeeper and unchanged 17 executable/seven selected asset hashes pass. One **37.63-second/six-step incremental build**, guard zero; fresh inventory **70 files/173 hunks**, unchanged. Seven capture and eleven counter tests pass; initial fixture/environment mistakes are retained separately. Completed disposable profiles and remote signing staging/jobs are removed; current owner review tabs and retained authorized signing access are preserved.

**L6 accepted again: 8/12 (66.7%), delta +1.** Earlier reopened/pending L6 records below are historical, superseded by this repair and replacement-artifact qualification. L4 real Google upgrade, L8 distribution/provenance, L11 exact-head CI/audits and L12 final go/no-go remain open; Decision 2 remains independent. Next executable priority is L8's concrete remaining artifact/distribution evidence, without repeating the covered recovery matrix. Google baseline/ledger stay separate and uncommitted; latency deferred; Electron diagnostic build pending approval/unstarted. No merge or release approval.

### L5 owner acceptance completed — October 23

[Owner acceptance record](../experiments/chromium-extension-spike/evidence/l5-owner-acceptance-20261023/README.md) closes the current signed candidate’s physical-input, matched visual and VoiceOver session. The owner passed Island/pane/divider/menu navigation, current-shipping card visuals and page typing; theme Apply/Remove with native Cancel and focus return; Bitwarden permission labels and keyboard refusal; then retry installation and native popup focus/navigation/Escape. Final confirmation explicitly includes **Cancel leaving Bitwarden uninstalled before retrying**. Spoken VoiceOver and physical results are owner-observed, distinct from supporting AX and automated checks.

Source `8439cabc865167f0e70cddedd22b390a3bec4438`, archive `8783c93501a199b7194957ee2e0672178617aff8e795a2ea4411cc8884b3f985`, Apple Accepted `12b32e11-5d97-4639-ad5d-605ff26b2bef`; strict signature, archive digest and unchanged 17 executable/seven asset hashes are reverified at acceptance recording. No build or runtime matrix rerun. **L5 accepted: 7/12 (58.3%), delta +1.** Earlier pending L5 sections below are dated history superseded by this record.

**L6 remains reopened** for the independent close-history acknowledgement warning; this is not recovery acceptance or proof of data loss. Next priority is that concrete finding, followed by the remaining distribution/provenance, exact-head CI and final acceptance requirements. L4’s authentic Google upgrade and Decision 2 remain open. Google baseline/ledger stay separate; current test tabs are preserved; latency deferred; Electron diagnostic build pending approval/unstarted. No merge or release approval.

### L5 current-shipping Split View visual parity — October 23

[Signed parity evidence](../experiments/chromium-extension-spike/evidence/l5-split-visual-parity-20261023/README.md) uses installed shipping **1.42.1**, its packaged CSS/layout and live local-page comparison. The fork now matches two-pane card framing:8 px outer/inter-pane gaps, one 8 px rounded outline, active outline emphasis, quiet hover/focus divider grip, Instrument Sans and bottom-right corner tabs (site/icon inactive; × active). Full-width header bars are removed; context-click/Shift+F10 retains pane actions and Escape returns focus. Private presentation is separate from the unchanged private-excluding history predicate. Existing Cocoa/Views page hit testing and native ratio/membership remain intact. No new 3/4-pane feature claim.

Source `8439cabc865167f0e70cddedd22b390a3bec4438`, signed ZIP `8783c93501a199b7194957ee2e0672178617aff8e795a2ea4411cc8884b3f985`, Apple Accepted `12b32e11-5d97-4639-ad5d-605ff26b2bef`; strict signature/staple/Gatekeeper and17 executable / seven asset equality pass.75 signed regression plus56 signed regular/private layout/input checkpoints pass;21 source / seven capture / 11 counter tests and lint pass. Native real clicks/typing, drag 50→59, double-click reset 50, keyboard resizing, corner menus and Remove preserving tabs pass. Guard 0; footprint 70/173. Earlier real findings, compiler failure and invalid fixture attempts are retained separately.

Owner's prior stage2 divider/menu/narrow checks are recorded as passed on the prior artifact. **This replacement's visual/VoiceOver acceptance remains open, as does the independent L6 history acknowledgement warning. Readiness6/12 (50%), delta 0.** Google remains separate; latency deferred; Electron diagnostic build pending approval/unstarted. No release/merge or exact-head CI claim.

### L5 native page input corrected; L6 acknowledgement reopened — October 23

[Owner-session evidence](../experiments/chromium-extension-spike/evidence/l5-native-pointer-20261023/README.md) records a real pointer-routing failure: the transparent full-height Island NSView intercepted clicks intended for pages. The initial page-observer workaround passed protocol injection but failed the owner test and is removed. The final Cocoa/Views hit-test correction passes native clicking and typing in both panes; the owner confirms “Yes, both panes activate and typing works.” Requested header/frame border simplification is included, with subtle active fill and keyboard focus rings retained. Remaining full L5 owner/VoiceOver checks stay open.

Source `006ccda1`, signed ZIP `ca69ff73efc85f8daeefbc782d3f8793b29fcd7ae5248d984b1ea6c91567ab44`, Apple accepted `29ec9c3c-9623-4b79-bd7d-7f7d7348dc83`; 75 signed runtime, 16 source, seven capture and 11 counter tests pass, as do strict signature and final hash checks. Final incremental guard: zero actions; footprint: 70 files/173 hunks under standing authorization. Earlier failed approach, compiler/fixture failures and its superseded notarization are retained separately.

The same owner session exposed “Tab closed, but history persistence failed or timed out.” after close/cancel/leave. This is an unresolved history-save acknowledgement finding, not proof of lost tabs. **Reopen L6 pending disposition; current readiness 6/12 (50%), delta -1.** Preserve the historical 49-check/owner-mapped-UI record without overriding this newer observation. Google baseline remains separate, latency deferred, Electron diagnostic build pending. No release/merge implied.

### L5 theme accessibility repair verified — October 23

[Signed theme-action repair](../experiments/chromium-extension-spike/evidence/l5-theme-accessibility-20261023/README.md) moves installed themes out of list-box options into labelled groups with native Apply/Remove buttons. Actual macOS AX and keyboard checks pass: Tab/Shift-Tab, Return Apply, disabled-Apply focus transfer to Remove, Space, native removal Cancel/Remove, filtering, restart persistence and ordinary extension search. This resolves the concrete defect found during L10.

Source `c506e4aa10e4c843009ac85656b5a951451bf9d0`, archive `777180c90c2b4fafb10c4e0442704fff2875763bf9d479714733151a1c150dfe`, Apple accepted `5461db97-8bd3-441d-9fdc-84de4d6152b6`; stapled, strict signature and Gatekeeper pass. Sixteen focused source tests, nine package tests and 75 current signed runtime checks pass (regular/private/scope security, core browsing, encrypted recovery). Seventeen executable and six UI/blocker hashes remain unchanged through testing. Assets-only preparation, native guard zero; no Chromium compilation. Sandbox loopback/signature-service refusals are retained as environment limitations, with permitted final checks passing.

**Readiness remains 7/12 (58.3%), delta 0 gates.** Full L5 still needs its bounded owner physical-input/matched-visual/VoiceOver acceptance session; native automation is not spoken VoiceOver or owner sign-off. Prior L6/L7/L10 acceptance remains mapped to unchanged native/security paths with these focused replacement checks; no claim that every historical matrix was rerun. Test profiles and remote signing staging are removed; master artifact and previously authorized SSH access retained. Google baseline separate, latency deferred, Electron diagnostic build pending approval/unstarted.

### L10 functional smoke accepted — October 23

[Current signed-candidate smoke](../experiments/chromium-extension-spike/evidence/l10-functional-smoke-20261023/README.md) passes 17 core checkpoints, six theme phases and native extension/import/local-password persistence checks. Official Store theme install/Undo/removal, Bitwarden install Cancel/accept/native popup/restart/removal, exact-byte downloads, audio, navigation/find/zoom, favorites/history, Shelf/wallpaper/rail and restart behavior are verified. Native HTML import uses only a synthetic file; password save/fill uses only a local nonfunctional credential. Current L6 evidence covers windows/private/Spaces/Split. No build or candidate change; 17 executable and three asset hashes match. **L10 accepted for the bounded scope: 7/12 (58.3%), delta +1.**

The run found a separate L5 defect: installed-theme Apply/Remove controls work in the DOM but are flattened out of the macOS accessibility tree inside an option. Repair their accessible semantics and requalify on the signed app before closing L5. This is not a new VoiceOver pass. L4 real upgrade, L8 distribution/provenance, L11 exact-head CI and L12 go/no-go remain open. Google baseline stays separate; latency and Electron remain pending.

### L6 signed recovery acceptance — October 23

[Eight current-candidate schedules](../experiments/chromium-extension-spike/evidence/l6-signed-acceptance-20261023/README.md) pass 49 checkpoints: encrypted restart/crash, real failed-write retry, Split/Recently Closed, grouped multiwindow/Spaces, native close/Cancel/Leave, private exclusion, nonregular read/clean Quit, and native owner/profile teardown. All 17 executable and three asset hashes remain unchanged; no build. Initial Node-runtime, target-selection and syntax fixture failures are retained separately.

The owner explicitly accepted the mapped unchanged recovery UI after being told the waiting state was not reproduced on this signed candidate: **“Accept mapped UI evidence; close L6.” L6 is accepted for this exact candidate; readiness is 6/12 (50%), delta +1.** Do not equate FIFO rejection or normal startup with encryption-provider timeout coverage. Next independent work is L10 finite functional smoke; L5 needs physical owner input and L4 an authentic external upgrade. Google remains separate; latency/Electron pending.

### L3 completed — October 23

[Baseline/maintenance closeout](../experiments/chromium-extension-spike/evidence/l3-closeout-20261023/README.md) verifies the candidate still matches the official current Mac Beta `157.0.8103.15`, all five identified security fixes/eight files, nine changed dependency pins and the current 62/162 patch inventory. The guarded update and signed requalification path is rehearsed; Anthony Loria's prior sole-maintainer/suspend-when-unavailable policy supplies the required owner decision. **L3 is accepted for this selected preview baseline. Together with this turn's owner-approved L7, readiness is 5/12 (41.7%), delta +2.**

Decision 2 human-attention/CI billing acceptance and the actual Google extension upgrade remain separate and open. The Beta baseline is not labeled Stable or vulnerability-free. Next independent executable work is the bounded L6 signed-candidate recovery acceptance; L4 waits for a real external upgrade and L5 needs physical owner input. No build/profile change, latency test or Electron build was performed for this closeout.

### L7 accepted — October 23

The owner explicitly approved L7 for the signed candidate with archive SHA-256 `4c86c89e7ec81791ef8bedf525187b302c313f913a5e5b07a26d4d2a45b9ef00`, source `09985c16`. [Owner acceptance](../experiments/chromium-extension-spike/evidence/l7-owner-acceptance-20261023/README.md) binds the existing 80-check signed repair evidence and its limitations. **L7 closed for this candidate at 4/12 gates (33.3%), delta +1; the subsequent L3 closeout above brings the current total to 5/12.** The earlier pending-approval sections below are historical. No release, merge, Decision 2 or unrelated gate approval is implied.

The next launch-gate work at that point was L3; the closeout above now reconciles the upgraded security baseline, clean dependency/patch inventory, successful signed rebase rehearsal and already-approved sole-maintainer withdrawal policy against its finite criterion. Keep actual Google-upgrade qualification in L4 and Decision 2 cost approval separate; neither can be silently counted as passed. Google baseline remains untouched; latency and the Electron diagnostic build stay pending.

### L7 repairs verified — October 23

The [signed replacement and 80-check report](../experiments/chromium-extension-spike/evidence/l7-security-repair-20261023/README.md) repairs both findings below. Default builds compile out custom research/diagnostic hooks; the packager rejects their binary markers and the launcher refuses their arguments. The retained research worker logger independently refuses private metadata before identity creation or I/O. Source `09985c16`, signed ZIP `4c86c89e7ec8`, Apple accepted `1818186c-4b95-4571-b822-397bf8705161`; all 17 executable hashes match after notarization/tests. One 43.44-second incremental build, final guard zero, fresh inventory 62 files/162 hunks; 37 source checks pass. Original source/output and Google baseline remain separate and unchanged.

**L7-S1/S2 technical findings resolved; owner security/privacy acceptance is the remaining L7 step.** The previous review below is historical, not a current unresolved defect in this replacement. Progress stays **3/12 (25%), delta 0** until that acceptance. No new latency, Electron build, public release or Decision 2 approval.

### L7 review outcome — October 23

[Signed-candidate security review](../experiments/chromium-extension-spike/evidence/l7-security-review-20261023/README.md) finishes the current finite dispatch/private-store/permissions/packaging review. The current `f177e0b5` candidate has two reproduced blockers: L7-S1, locally enabled experimental uBO/diagnostic hooks remain in the distribution binary; L7-S2, the separate worker-update diagnostic writer records private service-worker URL/scope/storage-key metadata when explicitly enabled. Neither is enabled by default; no remote-content privilege escalation was demonstrated. The ordinary blocker private-log exclusion still passes and is distinct from L7-S2.

Fifty-two core runtime checks pass on this signed artifact; default security flags/no browser listener, all 17 Mach-O hashes, strict signature, stapling and Gatekeeper verify. The review also inventories 67 dispatch-comparison names and user-data/removal behavior. No build or artifact change. **Next priority: remove diagnostic/admission hooks from distribution, independently suppress private worker diagnostics, then incrementally rebuild and re-sign/notarize once and run the targeted replacement-artifact checks.** Owner security/privacy acceptance remains after those repairs. This replaces further open-ended security stress expansion. **3/12 (25%), delta 0 gates.** Google baseline stays separate; latency deferred; Electron build pending approval.

### Current execution status

Evidence base: [tranche plan and dated checkpoints](../experiments/chromium-extension-spike/tranche2-request.md), [rebase ledger](../experiments/chromium-extension-spike/rebase-ledger.md), [runtime results](../experiments/chromium-extension-spike/results.md). “Implemented / bounded evidence” does not mean full parity or release acceptance. The October 16 narrative below is retained as a dated baseline; this reconciliation supersedes its status claims where explicitly identified.

| Primary plan item | Current status | Completed evidence and next requirement |
| --- | --- | --- |
| §6 Task 0 / §4 A2 rebase | **Measured; gate still open** | Chromium156→157 cold recovery recorded at2h39m47s, one broken anchor/API change. Native scoped acceptance performed. Authentic Google-endpoint extension version upgrade on retained157 baseline still pending; no promotion or `passed` rebase outcome. Human attention/cost is not inferred from build duration. |
| §4 A1 patch design | **Drafted; implementation/review incomplete** | [A1 design](../experiments/chromium-extension-spike/a1-patch-budget-design.md) exists. Latest measured footprint72files/176hunks at the October23 normal-startup repair; prior source continuity comparison completed October22. Owner now permits budget increases without repeated approval, with later consolidation and recorded totals. Older49/120 or50/118 figures are historical. Layout move and authoritative native inventory CI remain open. |
| §4 B Island / §3 F2,F6,F7,F8,F28 | **Scoped L5 owner acceptance recorded; broader parity partial** | Rail, Restore Tab, find, menus, divider and pane controls have bounded evidence. [Current signed candidate L5](../experiments/chromium-extension-spike/evidence/l5-owner-acceptance-20261023/README.md) has owner physical-input, visual and VoiceOver acceptance; broader product parity remains partial; the later L6 repair above resolves the independent history-warning regression. |
| §4 C / F12 blocker spikes A and B | **In progress, not accepted** | [Aggregate acceptance matrix](../experiments/chromium-extension-spike/f12-acceptance-status.md) and Spike A report entry point now consolidate network/cosmetic/runtime and lifecycle evidence. [Request-path reconciliation](../experiments/chromium-extension-spike/evidence/f12-reconciliation-20261021/README.md) now maps13rows and verifies38archives/1,269members. Current-head equivalence remains open. Four native keepalive/beacon sender-close schedules now pass for pre-enqueued POST307 continuation; broader teardown/retry and paired parity remain open. Socket/speculation source disposition is complete: native socket adapters were missing at that source checkpoint, ordinary prefetch needed runtime proof at that historical checkpoint, and pre-prefetch/prerender remain conditional. Native WebSocket gate now has18 bounded decisions/eight successful handshakes; ten bounded pending socket lifecycle schedules now pass; WebTransport now has eight real HTTP3 baseline/enforcement controls; twelve WebTransport worker/lifecycle schedules now pass boundedly; Subsequent prefetch response repair, dedicated consumption, repeated cancellation and verified private-only cross-profile recovery provide bounded evidence; see the new review package. Remaining conditional prerender/pre-prefetch, provenance and aggregate acceptance gaps stay open. No final spike acceptance or engine decision asserted. Qualified latency remains explicitly deferred; diagnostic Electron build remains unapproved/unstarted. |
| §3 F15,F16,F35 / §4 D,H themes and extensions | **Scoped implementation and native acceptance recorded** | Island Store results/icons, installation/permission Cancel, removal branding/menu, theme apply/Undo/removal/restart, theme-aware controls, installed-theme management and Extensions branding implemented. Does not close all internal pages, locales, extension matrix or signed native-host integration. |
| §3 F18,F32,F33,F41 session / windows / profiles / Spaces | **L6 accepted — startup scheduling repaired and signed qualification complete** | [Current scheduling repair/125 frozen signed checks](../experiments/chromium-extension-spike/evidence/l6-restore-scheduling-20261023/README.md) removes the pre-main-loop restoration path; old negative control fails the ordering contract and replacement passes. Prior close-history fix and unchanged owner-approved recovery UI remain covered. No arbitrary power-loss, production-profile migration or unlimited lifecycle guarantee. |
| §3 F34 Glance / persistent Split View | **Partial migration against #993** | Reference is PR993 commit98ea48fc, mapped in [Split View migration](../experiments/chromium-extension-spike/split-view-migration.md). Persistent multiple/inactive/private snapshots, grouping, headers/divider, rail, shortcuts, Recently Closed and native restore have bounded evidence. Full Glance conversion/parity and cross-window whole-split drag remain open; old Glance alone is not the migration target. |
| §2 Decision2 package visual comparison | **Started, incomplete** | Multiple geometry/theme/native checkpoints exist; full matched resting/panel/palette/find/private comparison and final diff disposition still required. |
| §2 VoiceOver / cost sheet | **Scoped L5 accepted; Decision 2 cost acceptance incomplete** | [Signed owner session](../experiments/chromium-extension-spike/evidence/l5-owner-acceptance-20261023/README.md) accepts the bounded physical/VoiceOver controls. The cost sheet still separates measured build cost from missing human-attention/billing acceptance; the sole-maintainer suspension policy is recorded. L5 does not close Decision 2. |
| §4 E data migration / G cutover / I release | **L2 isolated preview accepted; production migration/cutover open** | Owner-approved Apple Silicon/macOS27 scope, tested27.2. Signed candidate identity, separate representative profiles, coexistence, tab/settings restart persistence and removal pass automated plus owner checks ([L2 record](../experiments/chromium-extension-spike/evidence/l2-owner-acceptance-20261022/README.md)). Production profile/updater handoff, other launch gates and release approval remain open. |
| §4 F infrastructure / beta gate | **Partial test infrastructure; gate open** | Native CDP fixtures and focused tests exist. Hosted PR green runs include Electron jobs, not full native Chromium spec acceptance on three platforms. Latest verified all-pass headede130ce:27pass/2skip, CodeQL no new alerts; later evidence/checklist head1bacf7e7 published, CI not rechecked in this documentation task. |
| Decision2 / public release | **Not approved by this reconciliation** | Keep existing gate sequence. Owner-authorized prototype follow-ups are not blanket migration/release authorization. |

### Next work under this primary plan

1. Consolidate outstanding F12 A/B acceptance artifacts and A1 review; list missing qualifications without silently running deferred latency or the unapproved Electron diagnostic build.
2. Finish the Decision2 package: matched visual comparison, owner-assisted physical-input/VoiceOver session and staffing/CI cost sheet. Keep the real Google upgrade gate monitored separately.
3. Update §3 feature status as work lands; each completion needs a linked bounded result and remaining acceptance gap. Prioritize reproducible enabled-feature data-loss/security failures over an unlimited interleaving matrix.
4. Use the approved preview scope and owner-selected existing release-signing setup to prepare the signed candidate. Finish operational maintenance ownership and the supporting manual-update policy, then execute one frozen artifact acceptance suite. Do not move cutover, migration or existing beta gates into a “follow-up” bucket without explicit approval.

Current L6 update uses a guarded 32.89-second/eight-action normal incremental repair build and 125 frozen signed checks; the unchanged owner-approved recovery UI is mapped explicitly. Old diagnostic repetitions remain separate from final acceptance. L6 is accepted again; L8 replacement distribution, L4/L11/L12 and Decision 2 remain open. Earlier reconciliation and acceptance sections retain their dates and scope. Google baseline stays separate; latency deferred; Electron diagnostic build pending approval/unstarted; no release approval.

---

**Status (October 16, 2026): a plan for Decision 2, not a commitment.** Shipping
Blanc stays on Electron. The owner reopened the platform question on
October 15 and authorized a time-boxed prototype under
`experiments/chromium-extension-spike/`; this document turns what that
prototype has shown into the work a migration would need, in order, with the
evidence each step must produce and the conditions under which the owner
should stop. It does not authorize a production migration, a public release, a
general extension runtime in Electron, or any work outside the prototype
directory and its branch. Only Decision 2 does that. The first task below
(§6) exists to give Decision 2 the one number it still lacks; it is proposed
here, not authorized: it needs a cold build, and approving this document does
not approve that build. The owner approves it separately, after being shown
the target tag, the checkout and output paths, a disk estimate and the
expected duration.

Companion documents:

- `docs/platform-migration-electron-to-chromium-2026-10-04.md`: the
  evaluation (options, target architecture, burden estimates, the phase model
  and gates). This plan uses its gates and does not restate its reasoning.
- `experiments/chromium-extension-spike/README.md` and `results.md`: what the
  prototype does, how it is built without a cold build, and the dated
  evidence for every claim below.
- `spec/parity-matrix.md` and `spec/features.md`: the product contract a
  Chromium Blanc must satisfy; the feature ids (`F1`…`F46`) below are theirs.
- `browser-api/contract.json` and `browser-api/generated/vectors.json`: the
  bridge contract and test vectors the Chromium build must replay.
- `AGENTS.md` and `CLAUDE.md`, platform-direction paragraph: the current
  authorization boundary.



## 1. October 16 prototype baseline (historical)

Everything in this section is backed by a dated entry in `results.md` or a
merged PR on `codex/chromium-extension-spike`; nothing here is from source
inspection alone.

**Proven on the Mac (Chromium 156.0.8078.36, Apple Silicon, isolated
profile):**

- Live Chrome Web Store installation in an independently branded build, with
  Chromium's native permission prompt, the real install handler and no
  diagnostic install API.
- Six real extensions enabled, each verified only on the scoped checks its
  row in the compatibility matrix names (`results.md` → Extension
  compatibility matrix): Bitwarden (worker, content-script response, native
  popup, full restart, signed update 2026.9.3 → 2026.10.0 in a separate
  profile; its initial installation used the documented diagnostic flow,
  the other five the listing's normal Add to Chrome button), React Developer
  Tools (renderer detection, popup, storage round trip), 1Password (worker,
  inline scripts, welcome flow to account setup), Tampermonkey (worker,
  popup, userscript install, GM storage across reload), Grammarly (worker,
  content scripts, logged-out popup), MetaMask (worker, inpage provider,
  `eth_accounts` with zero accounts). Every account-dependent feature (vault
  sign-in, autofill, desktop pairing, wallet creation and signing, writing
  suggestions) remains unverified, as does the scheduled update timer.
- Island-only windows: native tab strip, toolbar and bookmarks bar hidden; the
  copied Electron strip and overlay renderers run as `chrome://blanc-prototype`
  WebUI over a JSON `chrome.send` bridge; inset native macOS window controls;
  page-matched header tint; native drag regions; page fullscreen.
- Island tab control with physical input: create, switch, close, navigate,
  back, forward, reload, stop, ⌘L/⌘T/⌘A, Escape, type-to-open, the Quick
  Switcher across tabs, Favorites and history.
- Native Chromium services behind Blanc's UI: Favorites (`BookmarkModel`;
  hearts, ⌘D, `/save [folder]`), history (`HistoryService`; `/history`,
  switcher ranking, `/clear` expiring all local visits on a disposable
  profile), pin/mute/reorder (`TabStripModel`; rows, `/pin`, `/mute`, drag,
  ⌥⇧↑/↓), named tab groups (Chromium tab groups; `/group`, `/ungroup`,
  `/close-group`, headers, switcher), the Blanc start page with four layouts
  reading this profile's bookmarks and TopSites, and an expanded-Island
  Extensions view invoking real extension actions.
- Build discipline: `build.mjs` guards every incremental build (toolchain,
  Clang, `args.gn` digest, Siso dry-run plan under 1,000 actions, lock); UI
  changes ship with `prepare.mjs --assets-only` and no compile. The recent
  small native rebuilds (a few hundred lines in one file) took about 32–60 s
  each; earlier native fixes took 1m49s to 8m6s, and the focused UI cold
  build took 2h20m for 40,298 actions. None of these is a rebase.

**Confirmed divergences from Electron Blanc** (each one is a `D#` candidate
for `spec/divergence-register.md` if the migration proceeds, not a bug):

| Behaviour | Electron | Chromium prototype |
| --- | --- | --- |
| Grouped pins | A pinned tab stays in its group and leads it | Chromium unpins a tab when it is grouped |
| ⌘1–⌘9 with groups | nth cluster | nth tab |
| Favicons for history rows | Captured pixels | Chromium cache or letter fallback; nothing fetched |
| Favorites manager | `blanc://bookmarks` sheet | `chrome://bookmarks/` in a tab |

Two choices that look like divergences are not: mute is the per-tab
`WebContents` mute rather than Chromium's site-level setting, and `/clear`
expires `HistoryService` visits rather than opening Clear browsing data; both
keep Electron's semantics on a different mechanism.

**Not implemented, in the prototype's own words** (`README.md` → Limits):
Favorites and History sheets, the tab context menu's Move to Group submenu,
Spaces, Glance, blocking, Blanc-style private tabs, sync, Quiet Tabs, the
utility pages, the remaining slash commands, and every platform other than
macOS. The profile runs with `--use-mock-keychain`; the production keychain
path is untested. The Island's Trusted Types policy was relaxed for the WebUI
host and has not been re-tightened.

**Patch surface today:** `prepare.mjs` applies anchored edits to 20 upstream
files (`chrome/browser/ui/**`, `chrome/app/**`, `components/remote_cocoa/**`,
`ui/webui/resources/tools/eslint/**`), plus one new native pair
(`blanc_prototype_ui.cc`, 1,397 lines; `.h`, 47 lines), a `BUILD.gn` hook and
the copied Island assets. That is already half of the evaluation doc's
proposed budget of about 40 patched files, before blocking, private tabs,
Windows or Linux exist. The budget, and the out-of-tree layout that keeps it,
are therefore the first design decision of Workstream A, not a later clean-up.

**The one number Decision 2 still lacks:** no rebase has been measured. The
evaluation's 2–5 engineer-days per Chromium major is a hypothesis, priced
at a four-week cadence that has since become two weeks (Workstream A2), and
the owner's October 5 decline rested entirely on that cost. Section 6 makes it the
first proposed engineering task, pending its separate cold-build approval.

## 2. Gates, restated with evidence

The evaluation doc defines four gates. This table says what each needs and
the October 16 evidence baseline. See the current execution status above for subsequent progress; the requirements in this table remain binding. A gate passes only on recorded evidence of the kind named
here; never from source inspection, an unpacked extension, or a harness
result that was not reproduced with real input.

| Gate | What it requires | Evidence present | Evidence missing |
| --- | --- | --- | --- |
| **Spike gate** (end of Phase 1) | Measured rebase cost; Web Store acceptance; CEF control test | Web Store acceptance passed October 16 (`results.md` §§ Normal Web Store installation, Verified version upgrade, Extension compatibility matrix). CEF control test moot: option C was built directly. | **One measured rebase** of the prototype patch set onto the next Chromium major, with wall-clock and human time recorded (Task 0, §6). |
| **Kill gate** (end of Phase 2) | Patch budget held; action popups attach to the Island; pixel parity without a UI rewrite; measured rebase and security cost fits available staffing | Popups: pass (native button inside the resting Island, real `ExtensionsToolbarButton` anchor). Island input routing: pass with CGEvent input. Layouts: native screenshots prove the tested window sizes render and hit-test correctly. | Pixel parity: **not proven.** The renderers are copied from Electron, but `prototype.css` changes geometry (pill zoom 1.15, a 26px slot for the native Extensions button, altered gaps) and hides controls whose services do not exist; an explicit Electron-versus-Chromium visual comparison of the same states at the same sizes has not been made. Patch budget: not yet defined for the fork layout (§4, A1). Accessibility: no VoiceOver pass recorded. Staffing fit: depends on Task 0. Windows/Linux: nothing. |
| **Beta gate** (end of Phase 3) | Spec acceptance suite green on macOS, Windows and Linux against the Chromium build | None. `test/desktop/` drives Electron through `src/main/test-hook.js`; no Chromium adapter exists. | A Chromium test hook, a Playwright/CDP launch path for the fork, and green runs on three platforms (§4, F). |
| **Cutover gate** (Phase 4) | Installed-upgrade spike: `electron-updater` hands off to the Chromium build on all three platforms with user-data migration, signing and publisher continuity, rollback and updater-ownership handover | None. | Everything in Workstream G; a proven Restart Now from the immediately preceding public Electron Blanc on each platform, as the release protocol already demands of every Electron release. |

**Decision 2 is taken after the kill gate, before Phase 3.** The minimum
package for it: Task 0's measured rebase, the A1 patch-budget design with the
current count against it, the §3 parity table updated with whatever has
been built by then, a side-by-side visual comparison of Electron and
Chromium Island states (resting, panel, palette, find, private) at the same
window sizes, a VoiceOver pass of the Island on the Mac, and a
one-page staffing and CI cost sheet that replaces the evaluation's hypotheses
with measurements where any exist.

## 3. Parity: feature by feature

`spec/parity-matrix.md` is the contract. For each desktop-applicable feature,
this table records the prototype's state on October 16, the Chromium
mechanism a port would use, and the size class (S: days, M: one to three
weeks, L: more than three weeks, for one engineer plus agents; all
hypotheses until the work is scoped in its own PR). "Native" means Chromium
already provides the behaviour and Blanc only skins it; "port" means Blanc's
own module moves largely as is; "rebuild" means the Electron design depends
on Electron primitives and must be redone against Chromium's.

| Id | Feature | Prototype today | Chromium approach | Size |
| --- | --- | --- | --- | --- |
| F1 | Island chrome | Strip + overlay as WebUI; shield chip, private chip, Spaces mark, capture chip hidden | Keep the WebUI host; replace the polling snapshot with `TabStripModelObserver` pushes; add the missing chips as their services land | M |
| F2 | Tabs: create/close/switch/pin/mute | Done; reopen and duplicate missing | Native: `TabStripModel`, `sessions::TabRestoreService` for Reopen Closed Tab (rebuild of the three-tier hold; Chromium has no parked live view, so Tier 1 becomes a divergence) | M |
| F3 | Tab groups | Done; no Move to Group submenu; grouped pins diverge | Native groups; add the context submenu to the Island's menu model; record the pin divergence | S |
| F4 | Private tabs | Chromium incognito windows only | Rebuild: Blanc mixes private tabs into one window; Chromium isolates by `Profile`. Decide: adopt incognito windows (divergence) or build an off-the-record tab in a regular window (deep patch, likely over budget). Recommend the divergence. | M (decision) |
| F5 | Address input and search | Done through the Island | Port `normalizeAddressInput`/`handOffToOs` into the host; `TemplateURLService` for engines, or keep Blanc's settings | S |
| F6 | Palette and Quick Switcher | Done | Port | S |
| F7 | Slash commands | 12 of the catalogue | Port the remainder as their services land; `copy/slash-commands.json` stays the source | M |
| F8 | Find in page | Missing | Native `FindTabHelper`/`find_in_page` behind the Island capsule | S |
| F9 | Favorites | Native model; no sheet, no "Add all open tabs" | Keep `BookmarkModel`; port `blanc://bookmarks` as a WebUI sheet; import from Electron `bookmarks.json` (Workstream E) | M |
| F10 | History | Native service; no sheet | Keep `HistoryService`; port the sheet; import `history.json` | S |
| F11 | Downloads | Chromium's manager | Port the sheet over `DownloadManager`; keep `downloads.json` import | M |
| F12 | Ad/tracker blocking | Spikes A/B implemented in parts; acceptance open; see current status | Rebuild. Options: (a) Blanc Blocker through browser-side request interception chosen by a request-path coverage audit (a `URLLoaderThrottle` alone does not see keepalive, prefetch or worker paths), CSS injected per frame, and scriptlets executed in the page's main world where they patch globals; (b) full uBO, which needs Manifest V2: Chrome's supported MV2 use ended with Chrome 139, enterprise exception included (§7), while this checkout still carries MV2 handling, test overrides and component exceptions, so restoring a supported full-uBO path requires a source/API audit and a runtime spike; the required patches and their maintenance cost remain unknown, and option (b) is not a policy default. Either way the shield count, per-site allow and the popover are Blanc UI over the chosen engine. Highest-risk workstream; its estimate is unknown until both spikes run. | L+ |
| F13 | Permissions | Chromium prompts | Rebuild the explicit policy and copy over `PermissionRequestManager` with a Blanc prompt view; the held-view denial rules become moot or divergences | M |
| F14 | Settings | Missing | Port `blanc://settings` as WebUI; `settings-schema` stays the source; Chromium prefs only for things Chromium owns | M |
| F15 | Theming | ThemeService integration, Web Store themes and adaptive UI; bounded checks pass | Port; drive `ThemeService`/`NativeTheme` from the setting | S |
| F16 | Internal pages | newtab only | Port the remaining pages as WebUI documents with the sheet surface | M |
| F17 | Patron and app icons | Missing | Port (main-process activation becomes a browser-process service) | S |
| F18 | Session persistence and restore | Native persistence plus identity/retry recovery implemented; broader acceptance open | Decide: keep Chromium's `SessionService` and import `session.json` once, or port Blanc's v2 format. Recommend import once, then Chromium's. | M |
| F19 | Context menu | Chromium's | Port the Blanc actions into `RenderViewContextMenu` overrides | S |
| F20 | HTTP auth policy | Chromium's dialog | Override `LoginHandler` to fail the challenge silently | S |
| F21 | Telemetry | Missing | Port (browser-process service; same endpoints and consent rules) | S |
| F22 | Distribution and updates | None | Workstream G | L |
| F23 | Zoom | Native | Keep | — |
| F27 | Tab Sync | Missing | Port `sync.js` and `sync-crypto.js`; `safeStorage` becomes `OSCrypt` | M |
| F28 | Vertical tabs | Rail and split rows implemented; bounded checks, full acceptance open | Port the rail as a side WebUI panel | M |
| F30 | Favorites import | Missing | Port over `BookmarkModel` | S |
| F31 | Quiet Tabs | Missing | Rebuild on Chromium's discarding (`TabLifecycleUnit`); the dirty probe, `sessionStorage` rule and "quiet" vocabulary need a divergence review | M |
| F32 | Independent windows | Native | Keep; the window-runtime registry collapses into `BrowserWindowInterface` | S |
| F33 | Local profiles | Native-profile lifecycle/deletion checks; full profile UX/import incomplete | Rebuild on Chromium `Profile`s; import `profiles.json` | M |
| F34 | Glance | Partial Glance/Split View migration against PR993; see current status | Rebuild as a side-by-side `WebContents` in the browser view, or defer as a divergence | M |
| F35 | Start page layouts | Done (bookmarks, TopSites) | Port the remaining data hooks (blocked counts, groups, other devices) | S |
| F36 | Onboarding | Hidden | Port once privacy consent and import exist | S |
| F37 | Blank tab type-to-open | Done | Keep | — |
| F38 | 1Password fill | Missing | Decide: the 1Password **extension** installs and runs (F38's reason to exist was Electron's lack of it); keep the broker only if the extension's desktop integration fails in a signed fork build | S (decision) |
| F40 | Bring Your Tabs | Planned on Electron | Rebuild against Chromium sessions when F18 is decided | M |
| F41 | Blanc Spaces | Spaces capture/store/journal and split recovery implemented; bounded checks pass | Port the saved-set model over native groups and `TabStripModel` | M |
| F42 | Dark websites | Missing | Port the Dark Reader preload as a user script in an isolated world; the CSS fetch broker moves to the browser process | M |
| F44 | Interface language | English only | Port `strings.<locale>.js` loading into the WebUI host; `copy/` stays the source | S |
| F45 | Arc Spaces import | Missing | Port after F41 | S |
| F46 | Custom tab names | Missing | Port as Island state keyed by tab handle | S |

Features the matrix marks desktop N/A or mobile-only are omitted. Two
Electron-specific surfaces have no row because they would not exist:
`src/main/webauthn.js` (Chromium ships platform WebAuthn on all three
platforms) and the capture indicator's page-world instrumentation (Chromium
owns the capture state; the chip becomes a view over `MediaStreamCaptureIndicator`).

## 4. Workstreams

Each workstream names its owner surface, its deliverables, and the evidence
that closes it. They are ordered by dependency in §5, not here.

### A. Core: fork layout, patch budget, rebase, security

- **A1. Out-of-tree layout.** Move the prototype from `prepare.mjs`'s anchored
  edits to Brave's structure: a `src/blanc/` tree with its own `BUILD.gn`,
  `chromium_src` override files where a whole upstream file is wrapped, and a
  `patches/` directory applied by a script that fails on fuzz. Define the
  patch budget (proposal: 40 files, 120 hunks) and have CI print the count on
  every PR. `prepare.mjs` remains the UI-asset copier until the Island host
  is rewritten as a real WebUI resource bundle.
- **A2. Rebase cadence.** Chrome milestones ship every **two weeks** since
  Chrome 153 ([Google's announcement](https://developer.chrome.com/blog/chrome-two-week-start)),
  not the four weeks the evaluation doc priced, so every per-major figure in
  that doc's burden table (rebase days, CI hours, security respins layered on
  top) is to be read at twice the frequency until the ledger replaces it.
  Task 0 (§6) first. Then a scripted rebase runbook:
  fetch the tag, apply patches, rebuild incrementally where Siso allows, run
  the prototype's checks, record wall-clock and human time in a dated ledger.
  The ledger is the input to every later staffing claim.
- **A3. Security respins.** A respin must ship within days of upstream.
  Deliverable: a CI job that builds the fork for each platform from a tag,
  runs the smoke suite and produces signed artifacts without a human on the
  Mac. Until it exists, every respin is a manual Mac build, which Task 0 will
  measure.
- **A4. Build infrastructure.** Hosted builders with persistent Siso caches
  for macOS (arm64 and x64), Windows x64 and Linux x64, or a documented
  decision that macOS builds stay on the owner's machine. Record cost per
  month against the evaluation's $2–6k hypothesis.

Closes when: one rebase per Chromium major has been done three times on the
runbook, with recorded time, and a security respin has been produced from CI
without manual steps.

### B. Island host

- Replace the polled snapshot with observer-driven pushes; move the bridge
  from JSON `chrome.send` to a typed Mojo interface generated from
  `browser-api/contract.json` (Phase 0's step 3), and run `replayVectors()`
  against the Chromium adapter in CI (step 5).
- Restore the Island's Trusted Types policy; remove `--use-mock-keychain` and
  verify the keychain path; a VoiceOver and NVDA pass of the resting and
  expanded Island; IME input in the address field.
- The remaining chrome documents: permission prompt, fill-status capsule (if
  F38 keeps the broker), utility sheet, Glance.

Closes when: the contract check passes against the fork in CI and the
accessibility pass is recorded.

### C. Blanc services on Chromium (F12 first)

Blocking is the critical path: Blanc's identity is default blocking, and the
prototype has none. Spike both options in §3's F12 row within two weeks each
and choose on measured block rate against `test/unit`'s filter fixtures,
cosmetic coverage, and patch count. Then permissions, settings, theming,
telemetry, sync, Dark websites, Spaces, Quiet Tabs, profiles, Glance, in the
order §5 gives.

### D. Internal pages and sheets

Port `blanc://` pages as WebUI documents served from the resource bundle,
with the sheet surface as a transparent `WebContentsView` below the Island as
today. `pages.js`'s flat-directory rule and per-document CSP carry over.

### E. Data migration

A one-time, idempotent importer run on first launch of the Chromium build
when an Electron `userData` directory exists: `bookmarks.json` →
`BookmarkModel`; `history.json` → `HistoryService`; `settings.json` → Blanc
prefs; `session.json` v2 → a restored window set (born quiet); `profiles.json`
→ Chromium profiles; `downloads.json` metadata; `install.json` so telemetry
continuity holds; the Patron key through `OSCrypt`. Cookies and site storage
do **not** migrate (different partition formats, and the `persist:` naming
has no Chromium equivalent): say so in release notes and the onboarding step.
Electron's directory is left untouched for rollback. Evidence: a fixture
profile per shipped Electron major since 1.11.0, imported in CI, with counts
asserted.

### F. Test infrastructure

A Chromium equivalent of `src/main/test-hook.js` (a WebUI test page or a CDP
domain exposed only with a switch and never in a packaged build), a Playwright
launch path for the fork, and the `spec/acceptance` suite bound to it. The
Beta gate is this suite green on three platforms. The unit tests that guard
contracts (`browser-api`, `substrate`, `copy`, `adblock`) run unchanged.

### G. Updater and cutover

The cutover gate in §2, as its own spike before any beta:

1. macOS: the Chromium build keeps `me.bnfy.bowser`, the Developer ID and
   provisioning profile; `electron-updater` in public Electron Blanc must
   discover a `latest-mac.yml` pointing at the fork's zip, download it and
   relaunch into it. Verify Gatekeeper, notarization and the stapled ticket as
   the release protocol already requires. Then the fork's own updater
   (Sparkle, Omaha, or a Blanc feed) takes over.
2. Windows: NSIS to the fork's installer with the same publisher subject and
   the Default Programs registration preserved.
3. Linux: AppImage to AppImage, or a documented move to a repository.
4. Rollback: a documented way back to the last Electron release with the
   untouched `userData`.

Electron Blanc continues to receive security releases until the fork has
shipped one full update cycle to the public.

### H. Extensions

Already proven for the Web Store path. Remaining: the extension demand check
the owner dropped on October 5 can stay dropped; policy defaults (no Google
sign-in, no sync, proxied or disabled Google endpoints as Brave does);
the MV2 question for uBO (§7, a fork-maintenance effort, not a policy);
account-dependent passes for 1Password and
Bitwarden in a **signed** fork build; the simple MV3 fixture from the original
acceptance matrix.

### I. Release engineering and compliance

Per-platform signing and notarization from CI, the authenticated manifest,
SBOM and provenance as today, `THIRD-PARTY-NOTICES.md` regenerated for the
Chromium tree (BSD-3 plus its bundled notices; the reserved identity assets
and MIT first-party carve-outs unchanged), Widevine (castlabs answered on
October 5 and 6: free EVS signing covers only unmodified ECS Electron
releases; a custom Chromium build needs commercial VMP certification with an
audit through castlabs' Widevine 3PL partnership, so the fork either budgets
that or documents the absence of Widevine), Safe Browsing and other Google
services replaced or disabled with a recorded decision each.

## 5. Ordering, sizing and kill criteria

Sequence (each box gated by the previous one's evidence):

1. **Task 0: measured rebase** (§6), once its cold build is approved. One
   to two weeks of calendar, mostly build time. Produces the spike gate's
   missing number.
2. **A1 patch layout + B Mojo bridge + C F12 blocking spikes.** Four to six
   weeks in parallel between the two agents and the owner. Produces the kill
   gate package.
3. **Decision 2.**
4. **Phase 3, macOS first:** C services in order F13, F14, F15, F4 decision,
   F8, F9–F11 sheets, F16, F18 decision, F31, F41, F42, F27, F33, F34, F38
   decision, then the rest of §3; D pages; E importer; F suite green on
   macOS. Twelve to twenty weeks (hypothesis).
5. **Windows, then Linux:** A4 builders, I signing, F suite green. Six to ten
   weeks each (hypothesis), overlapping with 4 where builders exist.
6. **G cutover spike,** then **Phase 4:** Blanc Beta side by side with public
   Electron Blanc for at least one Chromium major; then the normal release
   gate.

Sizing is for one maintainer directing two agents, with the Mac as the only
builder until A4. Every figure above is a hypothesis to be replaced by the
ledger in A2 and the PR history; do not quote them outside this document.

**Stop (or pause and return to Electron-only) if any of these holds:**

1. Task 0 shows a rebase costing more than two owner-days of attention, or
   more than one calendar week including builds, for the current patch set.
   At a two-week milestone cadence, one calendar week per rebase is already
   half of all available time, so this criterion is the generous bound, not
   a comfortable one.
2. The patch count exceeds the A1 budget and the overflow cannot be moved into
   overrides within one sprint.
3. Neither F12 option blocks at least Blanc Blocker's current rate on the
   fixture set without exceeding the budget.
4. A security respin cannot be produced within seven days of upstream for two
   consecutive respins once A3 exists.
5. The G spike cannot complete a Restart Now handoff on any one of the three
   platforms.
6. The measured monthly build cost plus the owner's measured time exceeds what
   the owner states, in writing before Phase 3, that Blanc can carry.

Stopping keeps the prototype directory and branch as a record; nothing in
shipping Blanc changes.

## 6. Task 0: measure a rebase

The first engineering task this plan proposes. It is **not** started by
approving this document: it needs one cold build, and the build-cache rule in
`AGENTS.md` makes every cold build a separately approved, reviewed event.
Before asking for that approval, present the target tag, the checkout and
output paths, a disk estimate (a second Chromium checkout plus output is on
the order of 100 GB or more) and the expected duration (the only comparable
figure is the 2h20m focused UI cold build; a full `chrome` target from
nothing will take longer). Nothing in the prototype's existing checkout,
`out/BlancPrototype`, caches or toolchain is touched at any point.

**Goal:** apply the current prototype patch set to the next Chromium major
after 156 (whichever is on the stable or beta channel when the task starts)
and record what it costs.

**Procedure (owner's Mac):**

1. **Fresh checkout, separately.** `build.mjs` fixes its output directory to
   `<source>/out/BlancPrototype`, so the new major needs its own source
   checkout (not a second output directory in the existing tree) at the new
   tag, outside the existing checkout. Run Chromium's required setup hooks
   once for that checkout only, as `README.md` describes for fresh
   initialization. Record the tag, the commit and the paths.
2. **Prepare.** Extend `prepare.mjs` to accept the new version (it refuses
   unknown versions by design) and run it against the new checkout. Every
   anchor that no longer matches is one line in the ledger: file, hunk, cause
   (moved, renamed, API changed), minutes to fix.
3. **Generate, after preparing.** `gn gen out/BlancPrototype` in the new
   checkout with the same arguments as the existing one (`is_debug=false
   is_component_build=false symbol_level=0 target_cpu="arm64"`). Generation
   comes after `prepare.mjs` because preparation edits `BUILD.gn`, which
   invalidates any graph generated earlier, and the guard refuses a pending
   regeneration even with `--allow-large-build`. If a later `prepare.mjs`
   fix touches `BUILD.gn` again, re-run `gn gen` with unchanged arguments
   before the next guarded step.
4. **Record the environment.** `build.mjs <new-src> --record-environment`
   writes the environment baseline for the new output directory and exits;
   it compiles nothing.
5. **Inspect the plan.** `build.mjs <new-src> --check` runs the Siso dry run
   and stops, as designed, because a cold build is far above the 1,000-action
   threshold. If it instead stops on pending buildflag-header generation
   (Siso does not run generators in a dry run, so the plan cannot see what
   depends on them), generate only the reported flag target, as the
   prototype README describes, and run `--check` again; do not treat that
   stop as the plan. Save the final plan log with the ledger; its action
   count is part of the approval request.
6. **Build, under the separate approval.** Only with the owner's written
   approval of that specific plan: `build.mjs <new-src> --build
   --allow-large-build`. Record its wall-clock time and action count as
   its own ledger column, separate from patching and testing effort: it is
   a clean-build recovery benchmark for an empty output directory with no
   configured compilation cache, not a cost assumed to recur every
   milestone (routine rebases reuse whatever a later cache configuration
   and unchanged inputs allow, which Task 0 does not measure). Fix
   compile errors, ledger each,
   and rebuild incrementally (those later builds go through the normal
   guard, including its regeneration and buildflag stops).
7. **Re-verify.** Re-run the prototype's automated checks and the
   native-input checklist from `results.md` (Web Store install, one extension
   update, Island tab control, Favorites, groups) on the new build. Ledger
   failures.
8. **Record.** Upstream tag, total calendar time, owner attention time, agent
   time, anchors broken, files patched before and after, compile errors,
   cold-build duration and disk used, and check results, as a dated section
   in `results.md` and a row in a new
   `experiments/chromium-extension-spike/rebase-ledger.md`.

**Done when:** the ledger row exists and the prototype passes the same checks
on the new major, or the task has stopped on criterion 1 with the ledger
explaining why. Either outcome is the deliverable.

## 7. Open questions carried forward

- MV2 in the fork: upstream Chromium has finished removing Manifest V2
  support; the enterprise policy exception ended with Chrome 139 (official
  timeline:
  <https://developer.chrome.com/docs/extensions/develop/migrate/mv2-deprecation-timeline>).
  That ends supported use; it does not establish that every loading path is
  gone, and the pinned 156 checkout still carries MV2 handling, test
  overrides and component exceptions. Restoring a supported full-uBO path
  therefore requires a source/API audit and a runtime spike; the required
  patches and their maintenance cost remain unknown, against the
  alternatives of Blanc Blocker on Chromium's network stack or uBO Lite.
  Needed before F12's option (b) is scoped, and it changes F12's estimate.
- Private tabs in a regular window (F4) versus incognito windows: a product
  decision with a large patch delta; recommend the divergence.
- Which of Reopen Closed Tab's three tiers survive (F2): Tier 1's parked live
  view has no Chromium equivalent; recommend Tiers 2 and 3.
- F38: does the 1Password extension's desktop integration work in a signed,
  notarized fork? If yes, the broker, the `disable-library-validation`
  exception and the fill-status capsule retire together.
- Widevine: castlabs answered on October 5 and 6 (recorded in the evaluation
  doc). The open question for a fork is different from Electron's: free EVS
  signing applies only to unmodified ECS Electron releases, and a custom
  Chromium build needs commercial VMP certification with an audit. Decide
  whether to budget that or ship without Widevine. The Google service
  replacements (Safe Browsing, push, geolocation, translate) remain open from
  the evaluation doc.
- Whether macOS builds can leave the owner's machine (A4); without that,
  criterion 4 is hard to meet.

### Sender-closure preflight — October 21, 2026

Keepalive/sendBeacon remains open: pinned assets are missing and installed reference hash changed, so regeneration correctly refused. Zero runtime passes. Evidence: experiments/chromium-extension-spike/evidence/f12-sender-close-20261021/. Recover authenticated assets or reconcile a new baseline before parity claims. Latency deferred; Electron diagnostic build pending approval.

### F12 native assets recovered — October 21, 2026

Supersedes the missing-native-assets blocker above: the authenticated CodeQL archive contains the current pinned engine. Archive and 13 member hashes/sizes verified; recovered header matches current Chromium source. Native-only keepalive/sendBeacon work can resume; runtime checks are not yet run. Original paired Electron ASAR remains unavailable, so paired parity stays open. Evidence: experiments/chromium-extension-spike/evidence/f12-sender-close-20261021/asset-recovery.json. No build or latency run; Electron diagnostic build remains pending approval.

### Native sender-closure evidence — October 21, 2026

Four native schedules pass (regular/private × keepalive/beacon), with eight explicit post-close redirect decisions and preserved allowed POST body hashes. Qualifies pre-enqueued requests through one307 after target destruction; retries/process teardown/other methods and paired Electron parity remain open. See experiments/chromium-extension-spike/evidence/f12-sender-close-20261021/README.md and validation.json. No build; latency deferred; Electron diagnostic build pending. Next Decision2 priority: socket/speculation disposition and remaining strict source-path attribution.

### Socket/speculation disposition — October 21, 2026

Completed the next source-reconciliation task after #920. Document WebSocket and WebTransport have extension proxy paths but no Blanc Blocker adapter; null-frame WebSocket workers bypass that extension predicate; ordinary prefetch has a candidate URL-loader route awaiting runtime proof. Pre-prefetch has a conditional initial-request bypass behind disabled-by-default features, with inspected callers in Android WebView and the forced-testing path; this is not proof of enabled Mac exposure. The document-start prerender cancellation is switch-scoped, not activation acceptance. Evidence: [experiments/chromium-extension-spike/evidence/f12-socket-speculation-20261021/README.md](../experiments/chromium-extension-spike/evidence/f12-socket-speculation-20261021/README.md). Next priority: design the browser-context-bound WebSocket decision boundary, then real document/worker and regular/private handshake controls; review any patch-budget change before applying. Source capture is reproducible and hashed; zero new runtime passes or builds. Both spikes and Decision 2 remain in progress. Google baseline separate; native input pending, latency deferred, Electron diagnostic build pending approval.

### WebSocket implementation preparation — October 21, 2026

Fresh footprint55files/129hunks; shared document/worker factory-hook draft is unapplied and projects58/133. Owner budget decision requested under tranche2 §7. Two real-handshake fixture checks pass after sandbox loopback permission; zero native browser/blocker passes and no build. Evidence: experiments/chromium-extension-spike/evidence/f12-websocket-enforcement-20261021/. Next: approved hook plus bounded context/lifecycle-aware engine gate, guarded incremental preflight and regular/private document/worker handshake controls. Google baseline separate; native input pending, latency deferred, Electron diagnostic build pending approval.

### Native WebSocket enforcement — October 21, 2026

Supersedes the preparation-only status above: registered connector factory gate implemented without central-header changes. Four regular/private schedules pass18decisions (eight successful document/dedicated/shared/service-worker WSS handshakes, eight filter refusals, two missing-engine refusals); four keepalive/beacon regression schedules also pass. Source/binary hashes and failed/interrupted build history retained in experiments/chromium-extension-spike/evidence/f12-websocket-enforcement-20261021/. Fresh footprint56files/133hunks, below the approved58/133 projection; owner permits future budget increases without asking, with later consolidation. Two incremental successes, finalguard0. Next: pending socket teardown/timeout/utility-loss controls, then WebTransport and speculation gaps. Paired Electron/uBO socket parity and broader lifecycle remain open; no final F12/Decision2 acceptance. Google baseline separate, native input pending, latency deferred, Electron diagnostic build pending approval.

### Pending WebSocket lifecycle — October 21, 2026

Ten regular/private schedules pass: actual native-pending evidence before document/dedicated/shared target destruction, real35-second timeout, or verified child utility termination. Six abandoned sockets never handshake after utility resume; two timeouts refuse once and ignore late replies; two utility-loss schedules keep subsequent attempts failed closed. Fresh controls prove usability where the utility resumes, not automatic restart after loss. Evidence: experiments/chromium-extension-spike/evidence/f12-websocket-lifecycle-20261021/. One31.42s/six-step incremental build adds opt-in lifecycle observations; finalguard0, fresh56files133hunks. Pending service-worker destruction, profile/browser shutdown, simultaneous requests and provider parity remain gaps. Next Decision2 priority: WebTransport adapter/HTTP3 controls and speculation. Google baseline separate; native input pending, latency deferred, Electron diagnostic build pending approval.

### Native WebTransport HTTP/3 enforcement — October 21, 2026

Eight final regular/private controls pass: both endpoints work without the opt-in gate; protected allowed connections complete real HTTP/3 CONNECT plus datagram echo, while two blocked-host attempts receive native filter refusals with no server arrival. Chrome's existing extension rejection is preserved; weak owner/client-disconnect/35-second timeout guard an initiator-origin `other` decision before network creation. Evidence: experiments/chromium-extension-spike/evidence/f12-webtransport-enforcement-20261021/. Four WebSocket regression schedules and eleven counter tests pass. One40.71s/eight-step incremental build, finalguard0; fresh56files134hunks, threshold58/134 updated under standing owner authorization. Document runtime scope only; WebTransport workers/pending teardown/timeout/utility-loss/provider composition remain open. Next: those bounded transport controls, then speculation. Google baseline separate; native input pending, latency deferred, Electron diagnostic build pending approval/unstarted. F12/Decision2 remain in progress.

### WebTransport workers and pending lifecycle — October 21, 2026

Twelve bounded regular/private schedules pass: two matrices cover12dedicated/shared/service-worker allow/block controls; ten pending cases cover document/dedicated/shared destruction, real35-second timeout and utility loss. Real HTTP3 CONNECT/datagram controls establish reachability. Initial immediate-abandonment assumption failed and is retained: document destruction later refuses the stale decision; dedicated/shared late allow decisions do not create connections because their connector is destroyed. Do not call these immediate cancellation. Timeout refuses once/ignores late reply and fresh control succeeds; utility loss keeps subsequent requests failed closed, not restart proof. Evidence: experiments/chromium-extension-spike/evidence/f12-webtransport-lifecycle-20261021/. No native edits/build; guard0, prior56/134unchanged. Pending service-worker termination/profile/browser/concurrent/provider matrices and speculation remain open; F12/Decision2 in progress. Google baseline separate, native input pending, latency deferred, Electron diagnostic build pending approval/unstarted.

### WebTransport service-worker/profile teardown — October21

Four final schedules pass: regular/private activated service-worker stop, private BrowserContext destruction, and regular owned-browser/profile clean shutdown while service-worker transport decisions are held. Exact native pending IDs, version/context/process observations and real HTTP3 server records show no late handshake; surviving-context controls work. Initial worker target-disappearance assertion timed out and is retained: native stopped-version events prove worker stop even while debugging targets remain. Late worker allow decisions are not network handshakes. Evidence: experiments/chromium-extension-spike/evidence/f12-webtransport-teardown-20261021/. No native edit/compile,guard0,unchanged binary verified; prior56/134unchanged. Hot regular-profile deletion, crash/restart/concurrent/provider boundaries remain unqualified. Next request-path priority: speculation initial requests/consumption. Claude primary plan governs; F12/Decision2 stay in progress. Google baseline separate, native input pending, latency deferred, Electron diagnostic build pending approval.

### WebTransport hot deletion/crash checkpoint — October21

IMPORTANT unresolved runtime failure: after native Default profile removal from Local State and its page closure, a held service-worker WebTransport allow decision still reaches the real HTTP3 server (CONNECT+echo) on utility resume. Weak context remains alive. Profile1 survives; clean restart removes Default and fresh transport works, but does not close late-handshake gap. Regular/private browser-SIGKILL/restart controls pass with no pending handshake/replay and fresh success. Final3schedules:2pass1fail, not allpass. Initial premature Preferences assertion and first actual failure retained separately. No repair/build; guard0; unchanged native hashes,prior56/134. Evidence: experiments/chromium-extension-spike/evidence/f12-webtransport-profile-crash-20261021/. Next priority: deletion/shutdown admission check at pending completion, then rerun; not merely WeakPtr lifetime. Google baseline separate; F12/Decision2 remain open, native input pending, latency deferred, Electron diagnostic build pending approval.

### WebTransport deletion-admission repair — October21

The reproduced hot-profile gap is repaired: pending completion now refuses when BrowserContext shutdown started or Chromium marked the profile for deletion, even while its weak context remains alive. Same hot-delete fixture explicitly records profile_unavailable=true/result-1 and zero server arrival; survivor/restart plus regular/private crash controls pass. Four prior teardown schedules and eight real HTTP3 baseline/enforcement controls pass on the repaired binary. Evidence: experiments/chromium-extension-spike/evidence/f12-webtransport-delete-fix-20261021/. Previous failure remains archived; this supersedes its unresolved status only for the tested boundary. One33.43s/six-step incremental build, finalguard0; only Blanc-owned native source changed, prior56/134unchanged. Concurrent deletion/cancellation/new-request/provider cases remain unqualified. Next request-path priority: speculation initial requests/consumption. Google baseline separate; native input pending, latency deferred, Electron diagnostic build pending approval; F12/Decision2 remain open.

### Concurrent WebTransport/deletion cancellation — October21

Four final regular/private schedules pass eight concurrent document/service-worker requests each:32distinct native batch decisions,16allowed realHTTP3/datagram exchanges,16filterrefusals with no blockedserverarrival. Two schedules cancel native Default-profile deletion at real beforeunload while decisions are held; profile remains registered, requests resolve normally after utility resume, fresh controls succeed. This is pre-commit deletion scheduling cancellation, not reversal of marked deletion. Initial asyncLocalState fixture errors retained separately. Evidence: experiments/chromium-extension-spike/evidence/f12-webtransport-concurrent-cancel-20261021/. No nativeedit/build,guard0,unchanged artifacthashes;prior56/134unchanged. Saturation/higherload/repeatedcancellation/multiple-profile/provider matrices remain open. Next request-path priorityspeculationinitialrequests/consumption. Googlebaseline separate; nativeinputpending,latencydeferred,Electron diagnosticbuildpendingapproval; F12/Decision2notaccepted.

### Higher-load WebTransport / repeated deletion cancellation — October 21

Four final schedules / twelve cycles pass with 16 simultaneous allowed document/service-worker requests per cycle: 192 native decisions and real HTTP/3 batch exchanges, six native deletion cancellations across regular/private contexts, and twelve fresh controls. Repeated removal reacquires Chromium's consumed profile-statistics keepalive each time; the earlier fixture assertion is retained. Important limit: 32-request mixed batches never all reached the gate; 16-request mixed batches pass their first cycle but time out on the second admission cycle. Chromium throttle/failed-handshake penalties are a plausible source-supported explanation, not proven causality. Repeated mixed-load admission/cancellation remains open; allowed-only success does not supersede that limit. Evidence: experiments/chromium-extension-spike/evidence/f12-webtransport-load-cancel-20261021/. No production edit/build, guard0, native hashes and prior56files/134hunks unchanged. Disposable profiles/keys removed. Next work: isolate throttled admission from gate completion without disabling Chromium safeguards; speculation initial requests/consumption also remains a Decision2 priority. Google baseline separate, native input pending, latency deferred, Electron diagnostic build pending approval/unstarted; F12/Decision2 remain open.

### Mixed WebTransport admission causality — October21

Repeated mixed WebTransport admission investigation: the 10-second all-pending barrier times out under injected utility suspension, not under normal utility execution. Two cycles of16 mixed document/service-worker requests in each regular/private profile pass normally:64 decisions,32allowed HTTP3 CONNECT/echo exchanges,32blocked outcomes with no blocked server arrivals,4fresh controls. Paired held-utility runs pass cycle1 and reproduce cycle2 admission timeout in both contexts. Native verbose logs show300-second failed-handshake penalties and individual admission delays greater than10seconds. Source confirms throttle runs before WillCreateWebTransport/Blanc gate, with per-page document and per-BrowserContext service-worker state. Holding admitted requests prevents successful handshakes from releasing their pending counts while new admission is exponentially delayed. This supersedes the prior merely speculative throttle explanation for these reproduced runs; it is not proof of arbitrary-load progress or all cancellation boundaries.

No production fix or throttle bypass is indicated. Future mixed cancellation fixtures should cancel with an explicitly measured subset admitted and the remainder queued, then release utility and verify every eventual outcome, rather than require all requests pending simultaneously within10seconds. Longer runs, saturation and repeated mixed cancellation remain unqualified. No latency benchmark performed: native timer diagnostics are used solely for timeout causality. No compilation; guard0; native/engine hashes unchanged, prior56files/134hunks unchanged. Disposable profiles and keys removed. Google baseline separate; physical native input pending, latency deferred, Electron diagnostic build pending approval/unstarted; F12/Decision2 remain open.

Evidence: experiments/chromium-extension-spike/evidence/f12-webtransport-admission-20261021/.

### Repeated mixed WebTransport cancellation — October21

Two successive mixed cancellation cycles in each regular/private disposable profile pass. Each batch submits16requests (8document/8service-worker,8allow/8block). At the actual native beforeunload prompt, admitted/not-yet-admitted counts are8/8 then4/12 regular and10/6 then3/13 private; captured Chromium throttle diagnostics show queued work. The utility is held only until cancellation, not until every request is admitted. No new server events occur before release. Dismissing each prompt preserves Default registration; utility resume yields64distinct final decisions across four cycles,32real HTTP3 CONNECT/datagram exchanges and32filter refusals with no blocked-host arrival. Four fresh controls pass. Profile-statistics keepalive is reacquired before each deletion attempt.

This qualifies the bounded repeated mixed queued/admitted cancellation case that the prior all-pending barrier could not test. It does not qualify arbitrary load, indefinite starvation, more than two successive mixed cycles, committed deletion reversal, utility loss during cancellation, or all provider/profile combinations. Chromium admission safeguards remain enabled; no production changes or timing thresholds were weakened. The first run also passed but lacked prompt-time snapshots; it is retained locally and not added to final totals. Final report and prompt-time throttle evidence are archived. No native compilation, guard0, unchanged executable/framework/engine provenance and prior56files/134hunks. Disposable profiles and keys removed. Google baseline stays separate. Physical native input pending, latency deferred, Electron diagnostic build pending approval/unstarted. F12/Decision2 remain open; speculation initial requests/consumption remains a request-path priority.

Evidence: experiments/chromium-extension-spike/evidence/f12-webtransport-mixed-queued-cancel-20261021/.

### WebTransport utility loss during cancellation — October21

Four bounded regular/private schedules pass: SIGKILL of the verified disposable Blanc Blocker utility either at the native beforeunload prompt or immediately after dismissing it. Each schedule submits16mixed document/service-worker requests; prompt snapshots show admitted/not-yet-admitted counts4/12 and9/7 regular,8/8 and9/7 private, with native throttle queue evidence. Before loss the owned utility is held and no batch server arrival occurs. Cancellation preserves Default registration. All64requests eventually receive distinct native result-1 decisions and client failures, not fixture-deadline failures. Four fresh normally-allowed requests also fail closed. Only the four pre-loss positive controls reach the real HTTP3 server; no batch or fresh post-loss CONNECT arrives. This verifies failure handling, not utility auto-recovery: the engine remains unavailable in the same process.

No production changes or native compilation; guard0 and native/engine hashes unchanged, prior56files/134hunks. Syntax/lint, archived-report validator and evidence hashes pass. Disposable profiles/keys removed; raw logs local under /private/tmp/blanc-wt-cancel-utility-loss-01. Profile/provider matrices, restart recovery after this combined boundary, committed deletion, repeated utility replacements and arbitrary load remain unqualified. Google baseline separate, physical native input pending, latency deferred, Electron diagnostic build pending approval/unstarted. F12/Decision2 remain open; speculation initial requests/consumption remains a request-path priority.

Evidence: experiments/chromium-extension-spike/evidence/f12-webtransport-cancel-utility-loss-20261021/.

### WebTransport cancellation / utility-loss restart — October21

Four clean restart schedules pass after WebTransport utility loss and native profile-deletion cancellation: regular/private contexts, loss at beforeunload prompt or immediately after cancellation. The pre-restart boundary again refuses64mixed queued/admitted requests plus4fresh requests with zero post-loss CONNECT. After clean close/relaunch of each same disposable user-data directory, Default remains registered and no private browser context is restored. No unsolicited CONNECT appears in the1.5second restart observation window. In a fresh matching regular/private context, all four allowed controls complete real HTTP3 CONNECT/datagram echoes and four blocked controls receive native result1 without server arrival. This is clean process restart recovery, not in-process utility recovery, crash/powerloss qualification, permanent-profile migration, full session-history fidelity, or indefinite no-replay proof. Previously failed pending requests are not claimed to resume.

No production edit or compilation; guard0 and native/engine hashes unchanged, prior56files/134hunks. Archived validator, syntax/lint, hashes and diff checks pass. Disposable profiles/keys removed; local raw root /private/tmp/blanc-wt-cancel-restart-01. Abrupt crash during this combined boundary, service-worker fresh controls after restart, longer observation and broader provider/profile matrices remain open. Google baseline separate, native input pending, latency deferred, Electron diagnostic build pending approval/unstarted. F12/Decision2 remain open; speculation initial requests/consumption remains a request-path priority.

Evidence: experiments/chromium-extension-spike/evidence/f12-webtransport-cancel-restart-20261021/.

### WebTransport cancellation / utility-loss abrupt crash — October21

Four browser-SIGKILL/restart schedules pass after WebTransport utility loss and profile-deletion cancellation: regular/private, utility loss at beforeunload prompt or immediately after cancellation. Each browser PID is verified against its disposable user-data directory and original recorded owner before SIGKILL; browser disconnect is awaited before relaunching the same directory. Crash occurs after all16mixed requests and a fresh request have refused, not while callbacks or cancellation remain unresolved. Across schedules64mixed refusals and4fresh refusals precede crash. Default stays registered; private browser contexts are absent after restart. No unsolicited CONNECT appears during the1.5second observation window. Four fresh allowed requests complete realHTTP3/datagram exchanges; four blocked requests receive native result1 with no blocked server arrival. This qualifies abrupt process death at the settled failure boundary, not powerloss, in-flight crash, session/tab-history fidelity or indefinite no-replay guarantees.

No production edits or native compilation; guard0, unchanged native/engine hashes and prior56files/134hunks. Archived validator, syntax/lint, hash and diff checks pass. Disposable profiles/keys removed; raw local root /private/tmp/blanc-wt-cancel-crash-01. Unresolved-callback/cancellation crash, post-restart service-worker controls and broader matrices remain open. Google baseline separate; physical native input pending, latency deferred, Electron diagnostic build pending approval/unstarted. F12/Decision2 remain open; speculation initial requests/consumption remains a request-path priority.

Evidence: experiments/chromium-extension-spike/evidence/f12-webtransport-cancel-crash-20261021/.

### WebTransport unresolved-callback / cancellation crash — October21

Four final regular/private browser-SIGKILL schedules pass with unresolved WebTransport callbacks: crash while the native deletion beforeunload prompt remains open, or just after Cancel. Each submits16mixed document/service-worker requests with the verified utility held. At crash the admitted counts are9/8regular and8/10private; the remainder is not yet admitted and native throttle snapshots show queued work. Zero batch decisions and zero new server events are observed before killing the verified browser owner. The held disposable utility is killed after browser disconnect for cleanup. No claim that requests received refusals: they remain unresolved at process death. After relaunching the same disposable directory, Default remains registered, private contexts are absent, no unsolicited CONNECT appears during1.5seconds, and four fresh allowed HTTP3/datagram controls plus four native-blocked controls pass.

Initial four attempts failed a fixture precondition: newly created profile registration was not yet on disk, so the post-crash Local State info_cache assertion could not run. Those reports remain archived and are not successful recovery cases. Final fixture first proves Default registration persisted before creating requests. This qualifies an already-registered profile, not the fresh-registration crash boundary, powerloss, indefinite no-replay, session/tab-history fidelity, or post-restart service-worker request recovery. No production change/build; guard0, unchanged native/engine hashes and prior56files/134hunks. Syntax/lint, archived validator, hashes and diff checks pass. All disposable profiles/keys removed; raw roots /private/tmp/blanc-wt-pending-crash-01 and -02. Google baseline separate; native input pending, latency deferred, Electron diagnostic build pending approval/unstarted. F12/Decision2 remain open; speculation initial requests/consumption remains a request-path priority.

Evidence: experiments/chromium-extension-spike/evidence/f12-webtransport-pending-crash-20261021/.

### Fresh-profile registration crash recovery — October 21

Four final fresh-profile crash/restart schedules pass: regular/private contexts, crash with native deletion beforeunload open or just after Cancel, and mixed WebTransport callbacks unresolved. Each fixture explicitly proves Default is absent from Local State info_cache both before requests and immediately after the verified browser SIGKILL. Restarting the same disposable user-data directory reconstructs and persists Default registration. The existing regular service-worker registration survives (one scope); fresh private contexts have zero registrations and no private context is restored. Four allowed HTTP/3/datagram controls and four native blocked controls pass after restart, with no unsolicited CONNECT in the 1.5-second observation window. The earlier missing-info_cache assertion was not proof of an unrecoverable profile: this test proceeds through restart instead of requiring registration to have persisted before the crash.

Scope remains bounded: Default directory reconstruction with an independent Profile 1 present, one retained regular service-worker registration, no claim of complete preferences, tabs/history, arbitrary named profiles, power loss, indefinite no replay, or fresh service-worker transport execution after restart. A preliminary four-case run without the registration-retention check passed and remains local; it is not added to final totals. No production edits or compilation; guard zero, native/engine hashes unchanged, prior 56 files/134 hunks unchanged. Validator, syntax/lint, evidence hashes and diff checks pass. Disposable profiles and keys removed; raw roots /private/tmp/blanc-wt-registration-crash-01 and -02. Google baseline separate; native input pending, latency deferred, Electron diagnostic build pending approval/unstarted. F12/Decision 2 remain open; speculation initial requests/consumption remains a request-path priority.

Evidence: experiments/chromium-extension-spike/evidence/f12-webtransport-registration-crash-20261021/.

### Post-restart service-worker WebTransport — October 21

Four crash/restart schedules pass with post-restart service-worker WebTransport execution: regular/private, crashing during the native deletion prompt or just after Cancel with unresolved mixed requests and Default not yet registered on disk. Existing regular service-worker registrations survive and are used without re-registering; private contexts have no retained registrations and explicitly create fresh private workers. All four service-worker allowed controls complete real HTTP/3 CONNECT/datagram echoes; four blocked controls receive native result1 and no blocked-host server arrival. Native records confirm frame-less-worker ownership, initiator-origin source contract and correct private flags. The existing four document allow/block controls also pass. Default registration reconstruction, private-context exclusion and the bounded 1.5-second no-replay observation remain successful.

No production edits or compilation; guard zero, unchanged native/engine hashes and prior 56 files/134 hunks. Validator, syntax/lint, evidence hashes and diff checks pass. Disposable profiles/keys removed; raw root /private/tmp/blanc-wt-restart-service-01. This is fresh worker request execution after restart, not resumption of interrupted connections, private persistence, arbitrary-load/repeated-restart qualification or indefinite no-replay proof. Broader provider/profile and lifecycle matrices remain open. Google baseline separate; native input pending, latency deferred, Electron diagnostic build pending approval/unstarted. F12/Decision 2 remain open; speculation initial requests/consumption remains a request-path priority.

Evidence: experiments/chromium-extension-spike/evidence/f12-webtransport-restart-service-20261021/.

### Repeated-restart service-worker WebTransport — October 21

Four regular/private cancellation-boundary sequences pass three post-restart service-worker allow/block pairs each: initial browser-SIGKILL recovery followed by two clean close/relaunch cycles in the same disposable user-data directory. Across twelve restart checks, workers complete twelve real HTTP/3 CONNECT/datagram echoes and receive twelve native blocked decisions with no blocked-host arrivals. Regular registrations remain available without re-registering; private registrations and contexts are absent after every restart, and private workers are explicitly re-created. Each restart includes a bounded 1.5-second no-unsolicited-CONNECT observation. Native records confirm worker ownership and correct private flags. Initial document allow/block controls also pass.

This qualifies repeated clean restarts after one crash, not three consecutive crashes, connection resumption, indefinite no replay, arbitrary repetition/load or broader provider/profile matrices. No production edit or compilation; guard zero, unchanged native/engine hashes and prior 56 files/134 hunks. Validator, syntax/lint, evidence hashes and diff checks pass. Disposable profiles and keys removed; raw root /private/tmp/blanc-wt-repeated-service-01. Google baseline separate; physical native input pending, latency deferred, Electron diagnostic build pending approval/unstarted. F12/Decision 2 remain open; speculation initial requests/consumption remains a request-path priority.

Evidence: experiments/chromium-extension-spike/evidence/f12-webtransport-repeated-service-20261021/.

### Consecutive-crash service-worker WebTransport — October 21

Four regular/private sequences pass three consecutive verified browser-SIGKILL/restart cycles in each disposable profile. The first crash interrupts unresolved WebTransport and native deletion prompt/Cancel boundaries; the two later crashes occur after completed worker allow/block pairs, with no intervening clean shutdown. All twelve post-restart worker pairs pass: twelve real HTTP/3 CONNECT/datagram echoes and twelve native blocks without blocked-host server arrival. Regular registrations survive without re-registration; private registrations and contexts remain absent after every restart and fresh private workers are created. Native records prove worker ownership and private flags. Every restart includes a bounded 1.5-second no-unsolicited-CONNECT observation. Original document controls also pass.

This qualifies three consecutive process crashes per tested profile, not three in-flight callback crashes, power loss, interrupted-connection resumption, indefinite replay exclusion, arbitrary repetition/load or all profile/provider combinations. No production edits or compilation; guard zero, native/engine hashes unchanged, prior 56 files/134 hunks unchanged. Validator, syntax/lint, hashes and diff checks pass. Disposable profiles/keys removed; raw root /private/tmp/blanc-wt-consecutive-crash-service-01. Google baseline separate; physical native input pending, latency deferred, Electron diagnostic build pending approval/unstarted. F12/Decision 2 remain open; speculation initial requests/consumption remains a request-path priority.

Evidence: experiments/chromium-extension-spike/evidence/f12-webtransport-consecutive-crash-service-20261021/.

### Consecutive pending service-worker crashes — October 21

Four regular/private sequences pass three consecutive browser-SIGKILL/restart cycles with pending work. The first interrupts the existing mixed document/service-worker cancellation boundary. Each of the next two submits eight service-worker requests, holds the verified utility, proves three admitted native pending IDs with five not yet admitted, zero native decisions, zero client callbacks and zero new server events, then kills the verified disposable browser. The held utility is killed after disconnect for cleanup. Thus eight additional crashes interrupt service-worker-only batches, not completed requests. All twelve post-restart worker pairs pass: twelve real HTTP/3/datagram allowed exchanges and twelve native blocks without blocked-host arrivals. Regular registrations persist; private contexts/registrations remain excluded and private workers are explicitly recreated. Each restart includes a bounded 1.5-second no-unsolicited-CONNECT observation.

This is bounded consecutive pending-work process-crash recovery, not request resumption, power loss, indefinite no replay, arbitrary load/repetition, or all provider/profile combinations. No production edits or compilation; guard zero, unchanged native/engine hashes, prior 56 files/134 hunks unchanged. Validator, syntax/lint, evidence hashes and diff checks pass. Disposable profiles/keys removed; raw root /private/tmp/blanc-wt-repeated-pending-service-01. Google baseline separate; physical native input pending, latency deferred, Electron diagnostic build pending approval/unstarted. F12/Decision 2 remain open; speculation initial requests/consumption remains a request-path priority.

Evidence: experiments/chromium-extension-spike/evidence/f12-webtransport-repeated-pending-service-20261021/.

### October 21: ordinary prefetch initial-request diagnostic

Two regular/private schedules confirm four real speculative requests reach the
native engine before navigation. All four receive explicit mainFrame allow,
including the candidate tracker host; this is not a blocking pass. Same-origin
navigation makes no additional server request, but dedicated prefetch consumption
versus HTTP cache reuse is unqualified. Refusal control and consumption attribution
remain the next priority. Evidence: `experiments/chromium-extension-spike/evidence/f12-prefetch-initial-20261021/README.md`.
No native code/build change; prior 56 files/134 hunks unchanged. Google baseline
separate; latency deferred; native input and Electron diagnostic build pending.

### October 21: prefetch consumption and fail-closed refusal

Four regular/private schedules pass. Dedicated same-origin prefetch serving is
confirmed by fromPrefetchCache=true, fromDiskCache=false and PrefetchResponseUsed;
no second server request. Utility loss before speculation causes explicit native
engine-error refusals for both initial prefetch and navigation, with no arrival.
The pinned engine explicitly allows mainFrame requests; filter-match refusal is
not claimed. This resolves the earlier same-origin consumption ambiguity, while
post-prefetch utility loss/policy change, cross-origin serving, redirects,
pre-prefetch, prerender and uBO remain open. F12/Decision 2 remain in progress.
Evidence: `experiments/chromium-extension-spike/evidence/f12-prefetch-consumption-20261021/README.md`.
No native compile, guard zero, prior56/134 unchanged. Google baseline separate;
latency deferred; native input and Electron diagnostic build pending.

### October 21: utility loss between ready prefetch and consumption

Two regular/private diagnostics show previously allowed ready prefetch consumed
after utility loss without a fresh native decision. Fresh control requests are
explicitly refused before navigation; consumption uses prefetch cache with no
new server arrival. This is not consumption-time fail-closed acceptance, nor a
new network leak. No repair; invalidation/revalidation policy remains open before
claiming that coverage. F12/Decision 2 stay open. Evidence: `experiments/chromium-extension-spike/evidence/f12-prefetch-postready-loss-20261021/README.md`.
No build; guard zero; prior56/134 unchanged. Google baseline separate, latency
deferred, native input and Electron diagnostic build pending.

### October 21: prefetch consumption after utility loss repaired

The opt-in Blanc navigation response throttle revalidates HTTP(S) responses
before commit, including prefetch, with a weak callback and35s timeout. Two
regular/private post-ready utility-loss schedules now cancel before document
commit; four healthy-consumption/earlier-loss regressions also pass. This
supersedes the prior bounded post-ready-loss failure. uBO is excluded. New
throttle timeout/teardown, subframes, redirects, BFCache/prerender and broader
policy changes remain unqualified; F12/Decision2 remain open. Extra response
round-trip latency is unmeasured and deferred. Evidence: `experiments/chromium-extension-spike/evidence/f12-prefetch-response-repair-20261021/README.md`.
Incremental43.79s/8steps after retained include error; guard0. Fresh56files/135hunks;
ceiling58/135 recorded under standing authorization, consolidation later. Eleven
counter tests and scoped checks pass. Google baseline separate; permanent tabs
untouched; native input and Electron diagnostic build pending.

### October 21: prefetch response timeout and tab teardown

Four regular/private schedules pass: paused utility forces native35s response
timeout with refusal, or consuming tab closes while response is pending. After
resumption no late commit/duplicate completion occurs in the bounded observation;
fresh navigation succeeds. CDP PrefetchResponseUsed, unresolved source navigation,
native decisions and server arrivals establish the tested phases. No production
change; guard0; prior56/135 unchanged. Profile destruction, shutdown, subframes,
redirects and broader lifecycle remain open. Evidence: `experiments/chromium-extension-spike/evidence/f12-prefetch-response-lifecycle-20261021/README.md`.
Google baseline separate; latency deferred; native input and Electron diagnostic
build pending. F12/Decision2 remain in progress.

### October 21: pending prefetch profile deletion and shutdown

Four regular/private schedules pass. Actual Default profile deletion closes the
pending consuming page, preserves the independent profile, and stays absent after
restart. Clean browser shutdown while the utility is held cancels pending
navigation and restarts usable. No late response completion or second server
arrival in the bounded observation. Cancellation/veto, crash/powerloss, concurrent
navigations and broader lifecycle remain open; no session-restoration claim.
Evidence: `experiments/chromium-extension-spike/evidence/f12-prefetch-profile-shutdown-20261021/README.md`.
No production change/build, guard0, prior56/135 unchanged. Google baseline
separate; latency deferred; native input and Electron diagnostic build pending.

### October 21: pending-prefetch cancellation/veto still unqualified

Three four-schedule fixture attempts retained; zero acceptance passes. Initial
Browser.close bypasses unload handlers and was replaced by chrome://quit. Final
delete-cancel captures native prompts and retains profiles, but only after the
pending response timed out (settled=true/error document at prompt). Shutdown-veto
prompt capture still times out. These do not establish a production cancellation
bug or pending-response recovery. Next priority is reliable prompt activation/
sequencing before timeout, without widening deadlines. Evidence: `experiments/chromium-extension-spike/evidence/f12-prefetch-cancellation-veto-20261021/README.md`.
No native change/build; guard0; prior56/135 unchanged. Profiles cleaned, Google
baseline separate; latency deferred; native input and Electron build pending.

### October 21: pending-prefetch cancellation/veto sequencing repaired

Four final regular/private schedules pass: profile-deletion cancellation and native Exit veto while cached prefetch consumption awaits a blocker response. The guard is armed in Default before the independent profile is opened and before the utility stall. Nonblocking trigger dispatch captures the actual beforeunload prompt with the original navigation still unsettled on its source URL. Cancellation retains Default; utility resume permits the original navigation with a native response allow, one prefetched server arrival, and a successful fresh navigation. Earlier failed setup/trigger attempts are retained separately, not counted as passes.

Shutdown uses an archived temporary flag-gated IDC_EXIT command; CDP Browser.close bypasses unload handlers. The diagnostic is removed byte-for-byte and the normal binary restored. The final matrix includes an independent Profile 1 window, so last-window veto and physical native input remain unqualified. Two incremental builds (35.25/35.26 seconds); production blocker unchanged and prior56files/135hunks unchanged. Google baseline separate; latency deferred and Electron build pending approval/unstarted. F12/Decision2 remain open. Evidence: `experiments/chromium-extension-spike/evidence/f12-prefetch-veto-sequencing-fix-20261021/README.md`.

### October 22: last-window pending-prefetch shutdown veto

One regular-context schedule passes after closing the independent Profile 1 window and proving exactly one Island host and one native browser window across all remaining non-host page targets. Native Exit produces beforeunload while original prefetched consumption is unsettled; dismissal retains Default and the source, utility resume permits that navigation with an explicit response allow and one prefetch server arrival, and a fresh navigation succeeds. Initial embedded-target window-probe error retained separately. Temporary Exit diagnostic removed byte-for-byte and normal binary restored incrementally; no production changes, prior56files/135hunks unchanged. Private-only last-window, physical input, crash/powerloss and concurrent veto remain open. Google baseline separate; latency deferred, Electron build pending approval/unstarted. F12/Decision2 remain open. Evidence: `experiments/chromium-extension-spike/evidence/f12-prefetch-last-window-veto-20261022/README.md`.

### October 22: private-only last-window pending-prefetch veto

One private-only last-window schedule passes: the guard and consumer share one private context; all regular content tabs and the independent profile window are closed, with one Island host and one native window proven before Exit. Beforeunload arrives while the original consumption is unsettled. Cancellation retains the window; resuming the utility produces a private response allow, original consumption with one prefetch server arrival, and successful fresh private navigation. Two retained setup failures attempted to close an embedded Island host as a tab; the fixture now excludes hosts from tab closure and verifies their count independently. Temporary Exit diagnostic removed byte-for-byte and normal binary restored incrementally; no production changes, prior56files/135hunks unchanged. Physical input, abrupt crash/powerloss, repeated veto and concurrent cancellation remain open. Google baseline separate, latency deferred, Electron build pending approval/unstarted. F12/Decision2 remain open. Evidence: `experiments/chromium-extension-spike/evidence/f12-prefetch-private-last-window-20261022/README.md`.

### October 22: repeated shutdown veto — partial evidence, readiness boundary open

Final repeated test completes two regular cycles and one private-only cycle, each with two native Exit vetoes while original prefetch consumption is pending. Six prompts cancel successfully; all three completed cycles recover original consumption with native allow/one server arrival and fresh navigation. Full three-cycle schedules do NOT pass: regular cycle3/private cycle2 stop before prefetch readiness, with no preload events. Earlier attempts and a no-veto regular control also fail second-cycle readiness; cancellation is not proven causal. Rearming observation and distinct source URLs do not reliably resolve it. Next work is readiness/eligibility/fixture diagnosis, not claiming a shutdown-recovery failure. Temporary native diagnostic removed, normal binary restored incrementally, production unchanged/prior56files135hunks. Google baseline separate; latency deferred and Electron build pending. Full repeated acceptance, physical input and F12/Decision2 remain open. Evidence: `experiments/chromium-extension-spike/evidence/f12-prefetch-repeated-veto-20261022/README.md`.

### October 22: repeated-prefetch readiness reconciled

Native diagnostic evidence shows the selected source was still HIDDEN when a later-cycle candidate was submitted, despite document.visibilityState=visible; it became natively visible by timeout without prefetch starting. Rule parsing/candidate registration succeeded. Chromium CanPrefetchNow requires native VISIBLE. Fixture now closes helper windows first and waits for actual source active/primary-active/VISIBLE before submission, without changing the15second readiness deadline or forcing eligibility. Three no-veto cycles pass, then final three regular+three private-only cycles pass two native shutdown vetoes each (12prompts/6original-consumption recoveries), native allow/one prefetch arrival/fresh navigation each. Earlier failures and private host lookup correction retained. This supersedes the prior incomplete repeated-cycle row within bounded fixture scope; general native visibility behavior, physical input, concurrent cancellation/crash/powerloss remain open. Temporary diagnostics removed byte-for-byte; normal binary restored incrementally, production unchanged/prior56files135hunks. Google baseline separate; latency deferred, Electron build pending approval/unstarted; F12/Decision2 open. Evidence: `experiments/chromium-extension-spike/evidence/f12-prefetch-readiness-reconciliation-20261022/README.md`.

### October 22: concurrent pending-prefetch shutdown veto

Regular and private-only last-window schedules pass with two pending prefetched consumptions each. Two rounds issue a native Exit and an acknowledged duplicate while beforeunload is open; duplicate requests coalesce into the existing prompt in the bounded check. Across schedules8native acknowledgements/4dismissed prompts preserve all4pending navigations; utility resume yields4original consumption recoveries, native allow/private ownership, one serverprefetcharrival perURL, and fresh navigation. Temporary native probes removed byte-for-byte, normal binary restored incrementally, production unchanged/prior56files135hunks. Higher concurrency/cross-profile overlap/physical input/crash/powerloss remain open. Google baseline separate; latency deferred, Electron build pending approval/unstarted; F12/Decision2 open. Evidence: `experiments/chromium-extension-spike/evidence/f12-prefetch-concurrent-veto-20261022/README.md`.

### October 22: higher-concurrency prefetch shutdown veto

Regular and private-only last-window schedules each pass eight pending prefetched consumptions and two veto rounds with four acknowledged overlapping native Exit requests per prompt. Across schedules16acknowledgements coalesce into4prompts; all16original consumptions recover with native allow/private ownership and one serverprefetcharrival perURL; fresh navigation also passes. Temporary probes removed byte-for-byte and normal binary restored incrementally; production unchanged/prior56files135hunks. This is a bounded eight-consumer check, not maximum capacity or cross-profile simultaneous qualification. Repeated bursts/physical input/crash/powerloss remain open. Google baseline separate; latency deferred and Electron build pending approval/unstarted; F12/Decision2 open. Evidence: `experiments/chromium-extension-spike/evidence/f12-prefetch-high-concurrency-20261022/README.md`.

### October 22: repeated high-concurrency shutdown veto

Three consecutive eight-consumer cycles pass in each regular and private-only last-window schedule. Across six cycles, 48 acknowledged native Exit requests coalesce into 12 actual beforeunload prompts; all 48 original prefetched consumptions remain pending through cancellation and recover after utility resume. Every URL has native allow with the expected private flag and exactly one server prefetch arrival; fresh navigation passes each cycle. Extra consumers close between cycles, dialog listeners detach, and new cycle URLs prevent cache ambiguity. No readiness timeout or runtime failure occurred in this run.

Temporary native visibility/Exit probes are removed byte-for-byte and the normal binary restored incrementally with final guard zero. Production code and prior upstream footprint of 56 files/135 hunks are unchanged. This qualifies three repeated cycles at eight consumers per window, not maximum capacity, indefinite repetition, simultaneous cross-profile shutdown, physical native input, crash or power-loss recovery. Google baseline remains separate; disposable profiles and certificate keys removed; permanent profiles untouched. Latency deferred; Electron diagnostic build pending approval and unstarted. F12/Decision 2 remains open.

Evidence: `experiments/chromium-extension-spike/evidence/f12-prefetch-repeated-high-concurrency-20261022/README.md`.

### October 22: cross-profile shutdown veto and prefetch recovery

> Evidence correction (October 22): Default guard ownership was not verified in this fixture. Its cross-profile guard-placement claim is withdrawn; see the corrected higher-concurrency cross-profile evidence below.

Two regular-profile schedules pass with concurrent pending prefetch consumptions in distinct Default and Profile 1 windows. The beforeunload guard belongs to Default in one schedule and Profile 1 in the other. Each schedule performs two cancellation rounds, with a second acknowledged native Exit request while each prompt is open. Across both schedules, eight acknowledged Exit requests coalesce into four prompts; both consumers remain pending through each cancellation. Utility resume recovers all four original consumptions with native allow, private=false, exactly one server prefetch arrival per URL and fresh navigation in both profiles. The fixture verifies distinct native windows, associates each source with its Island host, and waits for both profile Preferences files. The runtime has one shared owned blocker utility, held only after both candidates reach Ready.

The first attempt stopped before candidate submission because the second Island bridge was not ready; its report is retained separately and is not an acceptance pass. A bounded bridge-readiness wait fixes fixture sequencing without changing production behavior or response deadlines. Temporary visibility/Exit probes are removed byte-for-byte; the normal binary is restored incrementally with final guard zero. Prior upstream footprint remains 56 files/135 hunks. This is two regular profiles with one consumer each, not cross-profile private contexts, simultaneous guards, higher cross-profile load, repeated cycles, physical native input, crash or power-loss qualification. Google baseline remains separate; disposable profiles/keys removed and permanent profiles untouched. Latency deferred; Electron diagnostic build pending approval/unstarted. F12/Decision 2 remains open.

Evidence: `experiments/chromium-extension-spike/evidence/f12-prefetch-cross-profile-veto-20261022/README.md`.

### October 22: concurrently armed cross-profile shutdown guards

> Evidence correction (October 22): Default guard ownership was not verified in this fixture. Its cross-profile guard-placement claim is withdrawn; see the corrected higher-concurrency cross-profile evidence below.

Two schedules pass with beforeunload guards armed concurrently in Default and Profile 1, each retaining one pending prefetch consumption. Both schedules repeat twice: one cancels the first prompt; the other accepts the first profile prompt and cancels the second. Chromium presents prompts sequentially. A second acknowledged Exit from the other profile while the first prompt is open coalesces within a bounded 200 ms observation. Across both schedules there are eight Exit acknowledgements, six actual prompts, four cancellation rounds and four original consumption recoveries. Both windows and guard pages survive cancellation, including the initially accepted profile, and every consumer remains unsettled with no response decision until utility resume. Native allow/private=false, exactly one server prefetch arrival per URL and fresh navigation in both profiles pass. No runtime failure occurred in this run.

Temporary native visibility/Exit probes are removed byte-for-byte and the normal binary restored incrementally, with final guard zero. Production code and prior upstream footprint of 56 files/135 hunks are unchanged. This qualifies two regular profiles, one consumer per profile and two rounds per choice; private cross-profile guards, higher cross-profile load, arbitrary repetition, physical native input, crash and power-loss remain unqualified. Google baseline remains separate; disposable profiles and keys removed, permanent profiles untouched. Latency deferred; Electron diagnostic build pending approval and unstarted. F12/Decision 2 remains open.

Evidence: `experiments/chromium-extension-spike/evidence/f12-prefetch-cross-profile-guards-20261022/README.md`.

### October 22: higher-concurrency cross-profile guards and ownership correction

Two corrected schedules pass with eight pending prefetched consumptions per regular profile (16 concurrently), and beforeunload guards concurrently armed in Default and Profile 1. Each schedule repeats two cancellation rounds: cancel the first prompt, or accept the first and cancel the second profile prompt. Native Island host assertions prove guard and consumer ownership before candidate submission, and all eight consumers per profile share their intended window, distinct from the other profile. Across schedules, eight acknowledged Exit requests, six sequential prompts and 32 original consumption recoveries pass. Every consumer remains pending through prompts/cancellation, then receives native allow/private=false and exactly one server prefetch arrival after the shared owned utility resumes; fresh navigation passes for every consumer.

The initial attempt exposed a fixture error: context.newPage() after Profile 1 opened put the intended Default extra tab in Profile 1's active window. The prior fixtures also created the purported Default guard after Profile 1 opened without verifying native ownership. Therefore the guard-placement claims in 3418dfa2 and c9703316 are withdrawn; their raw observations remain historical, not proof of guards in both profiles. The corrected fixture creates the Default guard before Profile 1, launches additional tabs with explicit profile-directory, and asserts each guard and consumer against its native Island host. Initial failure report/fixture retained separately; corrected final run passes. No production defect or production repair is claimed.

Temporary probes removed byte-for-byte; normal binary restored incrementally with final guard zero. Prior upstream footprint remains 56 files/135 hunks. This qualifies eight consumers per regular profile and two rounds per choice, not maximum capacity, private cross-profile guards, arbitrary repeated bursts, physical input, crash or power-loss recovery. Google baseline separate; disposable profiles/keys removed and permanent profiles untouched. Latency deferred; Electron diagnostic build pending approval/unstarted. F12/Decision 2 remains open.

Evidence: `experiments/chromium-extension-spike/evidence/f12-prefetch-cross-profile-high-guards-20261022/README.md`.

### October 22: repeated high-concurrency cross-profile shutdown guards

Six repeated high-concurrency cycles pass: three cancel-first cycles and three accept-first/cancel-second cycles, reusing the same two regular-profile windows, guard hosts and sixteen consumer tabs within each schedule. Every cycle rechecks native guard/consumer ownership and source visibility, uses distinct source/consumption URLs, arms both guards, and holds the owned blocker utility only after all sixteen candidates reach Ready. Two cancellation rounds per cycle produce 24 acknowledged Exit requests and 18 sequential prompts overall. All 96 original consumptions stay pending through cancellation and recover after utility resume with native allow/private=false and exactly one server prefetch arrival per URL; fresh navigation passes for each consumer. CDP sessions and dialog listeners detach between cycles. No runtime failure or readiness timeout occurred in this run.

These checks retain the explicit ownership correction from 38160ddc; they do not reinstate the withdrawn guard-placement claims in 3418dfa2/c9703316. The validator verifies identical target IDs and guard hosts across cycles as well as 48 distinct consumed URLs per schedule. Temporary native probes removed byte-for-byte; normal binary restored incrementally with final guard zero. Production unchanged, prior upstream footprint 56 files/135 hunks. This is three cycles per choice at eight consumers per regular profile, not arbitrary duration/capacity, private cross-profile guards, physical native input, crash or power-loss qualification. Google baseline remains separate; disposable profiles/keys removed, permanent profiles untouched. Latency deferred; Electron diagnostic build pending approval/unstarted. F12/Decision 2 remains open.

Evidence: `experiments/chromium-extension-spike/evidence/f12-prefetch-cross-profile-repeated-high-guards-20261022/README.md`.

### October 22: private cross-profile shutdown veto and prefetch recovery

Two private cross-profile schedules pass with native beforeunload guards armed in private windows belonging to Default and Profile 1. Temporary native probes assert IsOffTheRecord and original-profile basename for every guard and consumer, with distinct Island hosts and native windows. Each profile has one pending prefetched consumption. Both choices repeat twice: cancel the first prompt, or accept it and cancel the other profile's prompt. Eight acknowledged Exit requests coalesce into six sequential prompts; all four original consumptions remain pending through cancellation and recover after the owned utility resumes. Native response decisions retain private=true, each URL has exactly one server prefetch arrival, and fresh navigation passes in both private windows. No runtime failure occurred.

The initial regular Default anchor remains open; this is not private-only last-window shutdown qualification. The probes add private/original-profile fields only under the temporary fixture flag, are archived in this evidence directory, and are removed byte-for-byte afterward. Normal binary restored incrementally, final guard zero; production unchanged and prior upstream footprint remains 56 files/135 hunks. Higher private cross-profile load, repeated cycles, persistence exclusion/cache isolation, physical native input, crash and power-loss remain unqualified. Google baseline separate; disposable profiles/keys removed and permanent profiles untouched. Latency deferred; Electron diagnostic build pending approval/unstarted. F12/Decision 2 remains open.

Evidence: `experiments/chromium-extension-spike/evidence/f12-prefetch-private-cross-profile-20261022/README.md`.

### October 22: private-only cross-profile shutdown veto

Both private-only cross-profile shutdown-veto schedules pass after closing the disposable regular about:blank anchor. Native and CDP inventories require exactly two Island hosts, four content tabs and two native windows; every native tab is off the record, with distinct original profiles Default and Profile 1. Both guards are armed. The cancel-first and accept-first/cancel-second choices each repeat twice, producing eight acknowledged Exit requests and six sequential prompts. Both original consumptions remain pending through cancellation, including the initially accepted profile, and all four recover after utility resume with native allow/private=true and exactly one server prefetch arrival per URL. Fresh private navigation passes. The final inventory retains the same two private window IDs and no regular window. No runtime failure occurred.

This closes the regular-anchor limitation for this two-private-window cancellation case. It is not completed-shutdown, private persistence/exclusion, cache-isolation, higher-load, arbitrary repeated-cycle, physical native input, crash or power-loss qualification. Temporary native probes from the prior private cross-profile evidence are removed byte-for-byte; normal binary restored incrementally, final guard zero. Production code and prior upstream footprint 56 files/135 hunks unchanged. Google baseline separate; disposable profiles/keys removed and permanent profiles untouched. Latency deferred; Electron diagnostic build pending approval/unstarted. F12/Decision 2 remains open.

Evidence: `experiments/chromium-extension-spike/evidence/f12-prefetch-private-only-cross-profile-20261022/README.md`.

### October 22 — native OS-wide search exclusion

Owner requested removal of Chromium's “Search from anywhere” Google/Lens launcher. Fork preparation now disables profile eligibility and controller activation, including saved opt-in/hotkey invocation. [Evidence](../experiments/chromium-extension-spike/evidence/disable-omnibox-everywhere-20261022/README.md) records corrected incremental compile success and the initial compiler failure. Runtime restart/physical shortcut acceptance remains pending; no profiles or live instances changed. This is separate from the Decision 2 reconciliation and does not close a launch gate. Footprint adds two upstream files/two hunks relative to the prior recorded 56/135 (projected 58/137; full inventory not remeasured here). Latency deferred; Electron build pending.

### October 22 — first scope gate closed and source continuity reconciled

**L1 accepted: 1/12 (8.3%), Δ +1.** [Scope decision](../experiments/chromium-extension-spike/mac-preview-scope-approval-20261022.md) approves Apple Silicon/macOS26, separate fresh-profile app, manual signed preview updates and no automatic migration. Decision2 and final release remain open. L9 policy prerequisite accepted; rehearsal/security notice/withdrawal still required.

[Authoritative provenance reconciliation](../experiments/chromium-extension-spike/evidence/decision2-provenance-20261022/README.md) measures58files/137hunks. All56 earlier upstream patches match the prefetch repair inventory; only two launcher paths were added. Native bridge/engine source continuity verified; framework binary changed, so historical tests are supporting evidence, not a rerun. Full new-file/resource mapping and candidate smoke remain. No more lifecycle permutations without a concrete acceptance gap.

Visual comparison could not safely target the dev process through the native UI tool: the shared app path selected the Google baseline window. No UI actions were performed on that baseline. Use a uniquely identifiable isolated candidate window for the matched comparison; no new Electron build authorized. Latency deferred.


### October 22 native visual/AX and local isolation checkpoint

[Bounded evidence](../experiments/chromium-extension-spike/evidence/visual-ax-isolation-20261022/README.md): native/reference Find labels, matches and Escape focus pass; native settled address and private input checks pass. Native panel lacks reference secure-connection, Private, Spaces and Settings affordances. Capture dimensions differ across displays, so matched visual acceptance remains incomplete. Unique ad-hoc preview clone solves UI targeting and preserves dev two-tab order/selection; Google baseline stays separate. Final signed/fresh-profile isolation and VoiceOver remain open. `[■□□□□□□□□□□□] 1/12 (8.3%) · Δ 0 gates`. No build; latency deferred; Electron diagnostic build pending.


October22 follow-up: [candidate preflight and visual recheck](../experiments/chromium-extension-spike/evidence/matched-visual-candidate-audit-20261022/README.md). Geometry remains unmatched despite owner setup; VoiceOver welcome completed; owner confirms correctly spoken Island labels and Control-Option navigation (bounded pass, full packaged L5 still open). Candidate preflight rejects test clone: helper IDs still prototype, ad-hoc signature/no team, external assets and explicit dev profile arguments. Next packaging work must produce the isolated self-contained candidate before L2 acceptance. No new launch gate closed; latency/Electron build pending.


October22 self-contained local preview package: [evidence](../experiments/chromium-extension-spike/evidence/preview-package-20261022/README.md). Bundled UI/fonts/blocker/licenses, separate helper/framework identifiers, canonical bundle paths and default preview profile. Fresh startup, relocation/restart, isolated-HOME default-profile and removal checks pass boundedly; baseline/dev tabs preserved. Initial FindEvent startup crashes retained (canonical-path final succeeds, causality unproven). Ad-hoc only; native keychain/service identity and signed/quarantined candidate acceptance remain open. Launcher-only compilation, no Chromium/Electron rebuild; upstream58/137 unchanged. `[■□□□□□□□□□□□] 1/12 (8.3%) · Δ 0 gates`. Latency deferred, Electron build pending.


October22 [preview startup crash repair](../experiments/chromium-extension-spike/evidence/preview-startup-repair-20261022/README.md): old-binary missing-assets fatal reproduced; guarded FindEvent now rejects error/no-WebUI frames, matching negative survives. Four fresh-start schedules and real native Find result pass with clean exits. Restored-profile startup stalls in SessionRestoreImpl::Restore; isolation remains open, next priority. Incremental49.97s/sixsteps, finalguard0; Google baseline/dev unchanged. No latency/Electron build. `[■□□□□□□□□□□□] 1/12 (8.3%) · Δ 0 gates`.


October22 [restored-profile investigation](../experiments/chromium-extension-spike/evidence/preview-restore-investigation-20261022/README.md): unchanged artifact restores the saved disposable copy, five repeat restarts and fifteen fresh/restart pairs pass. Settled three-tab fixture preserves order/selection across three restarts. Immediate close during pending navigation loses those pending tabs; retained separately. Prior startup stall did not recur and has no confirmed cause or repair; L2 stays open. No native build or production change; Google/dev tabs unchanged. `[■□□□□□□□□□□□] 1/12 (8.3%) · Δ 0 gates`. Latency and Electron diagnostic build pending.


October22 [pending-tab shutdown repair](../experiments/chromium-extension-spike/evidence/pending-tab-shutdown-repair-20261022/README.md): new actively loading GET tabs now survive clean quit with order/selection. Six final schedules cover pending responses, Stop, committed history, no POST replay, actual shutdown veto and relocation/restart. Draft Stop regression repaired; original loss and failed fixtures retained. Two incremental builds38.97s/35.61s, final guard0; fresh59/142. Google/dev unchanged. Prior intermittent startup stall and pre-existing no-history close warning remain open, as do signed/keychain/macOS26 acceptance. `[■□□□□□□□□□□□] 1/12 (8.3%) · Δ 0 gates`. Latency/Electron build pending.


October22 [loading-tab close acknowledgement repair](../experiments/chromium-extension-spike/evidence/loading-tab-close-history-20261022/README.md): initial/uncommitted tabs excluded from native history now flush the remaining session without demanding a nonexistent history file. Five minimal-repair schedules pass: held GET close/clean restart, native cancellation and committed-history restore, real Tabs/Session flush EIO rejection, and explicit native Restore Tab after immediate crash. Automatic reopening assumptions and a host-return-value fixture failure are retained; speculative preference change removed. Google/dev snapshots unchanged; fresh59/142. Prior intermittent startup stall and signed/macOS26 isolation remain open. `[■□□□□□□□□□□□] 1/12 (8.3%) · Δ 0 gates`. Latency deferred; Electron diagnostic build pending.


October22 [restored-profile callback diagnosis](../experiments/chromium-extension-spike/evidence/restore-readiness-20261022/README.md): three targeted diagnostic starts (retained failure-profile copy, saved three-tab profile and clean restart) receive successful browser-session data and leave the synchronous restore wait; exact multi-tab order/selection preserved. Tested mode is browser-only, so app-registry readiness is not required. Original stall does not recur and remains unresolved; no production repair or L2 closure. Next recurrence needs browser read dispatch/completion and encryption-stage markers if its callback is missing. Temporary logging removed byte-for-byte; normal binary restored incrementally. Google/dev and original fixture profiles unchanged; prior59/142. `[■□□□□□□□□□□□] 1/12 (8.3%) · Δ 0 gates`. Latency/Electron diagnostic build pending.

October22 [browser-session encryption-readiness diagnosis](../experiments/chromium-extension-spike/evidence/session-readiness-20261022/README.md): five targeted copied-profile starts pass exact tabs/selection and clean exit. All effective modes are encrypted-preferred; browser reads initially queue before the encryptor arrives, then both backend reads, replay and synchronous restore complete successfully. This establishes the active dependency, not the historical stall cause; no recurrence or production repair. Temporary markers removed byte-for-byte and normal binary restored incrementally; original fixtures and Google/dev unchanged. Prior59/142; L2 remains open. `[■□□□□□□□□□□□] 1/12 (8.3%) · Δ 0 gates`. Latency deferred; Electron diagnostic build pending.

October22 [encryption readiness fault checks](../experiments/chromium-extension-spike/evidence/encryption-faults-20261022/README.md): corrected eight-second delay resumes, temporary/permanent provider errors restore through existing clear-store fallback, and normal recovery restarts preserve the three-tab window. Non-returning callback remains in synchronous restore without a deadline response; after fixture termination, native Restore Tab recovers the saved window. Eight final starts: seven restored/clean exits and one bounded unresolved wait, not eight passes. Initial premature timeout and automatic-restore assumptions retained. This simulated gap does not prove the historical stall cause; real keychain and encrypted-only failures remain open. Diagnostics removed/normal binary restored incrementally; Google/dev and original fixture preserved, prior59/142. L2 open, `[■□□□□□□□□□□□] 1/12 (8.3%) · Δ 0 gates`. Latency deferred; Electron diagnostic build pending.

October22 timeout repair design: [safety constraints and required checks](../experiments/chromium-extension-spike/encryption-readiness-repair-design.md). Do not release the restore wait by synthesizing an empty session or failing the shared encryption provider. Owner selected the recovery screen with saved tabs preserved; the bounded recovery repair is validated below, and L2 remains open. Google/dev untouched; latency and Electron diagnostic build pending.

October22 [encryption recovery repair](../experiments/chromium-extension-spike/evidence/session-recovery-20261022/README.md): owner-selected native recovery screen appears after ten seconds without consuming the pending read. Late completion restores once; Quit avoids blank fallback and releases keep-alives after startup. Twelve starts/28 assertions pass, including encrypted-only delay and Quit/restart with unchanged saved records; both-store provider-error fallback controls pass. Initial Quit/fixture/compiler failures retained. Seven capture/eleven counter tests and final guard0 pass; diagnostics removed, normal binary restored incrementally. Fresh60/149 under standing budget authorization. Google/dev unchanged. Real keychain, historical stall cause, wider lifecycle and packaged macOS26 acceptance remain open; L2 open. `[■□□□□□□□□□□□] 1/12 (8.3%) · Δ 0 gates`. Latency and Electron diagnostic build pending.


October 22 release-gate closeout: current status reconciled against `7c5d6bb5` recovery and self-contained packaging evidence. Owner selected existing release-signing Mac/CI; do not invoke the shipping Electron release script. [Manual preview maintenance policy](../experiments/chromium-extension-spike/preview-manual-maintenance-policy.md) drafted; signed candidate, matched visual disposition, maintenance ownership and final acceptance remain next. Local absence of signing identities does not establish absence of 1Password-backed release credentials. 1/12 gates accepted, delta 0. Google baseline separate, latency deferred, Electron build pending.


October 22 [signing access evidence](../experiments/chromium-extension-spike/evidence/preview-signing-access-20261022/README.md): shipping publisher identified as Anthony Loria / XYGUCY4498; direct disposable signing probe finds no identity on this host. Notarization credentials available through configured release environment. Current candidate staged and launcher validated, but remains ad-hoc; signed isolation/recovery and notarization pending signing access. Google/dev unchanged; no Chromium/Electron build, latency deferred. 1/12 gates, delta 0.

October 22 signing follow-up: configured release-vault backup is mislabeled; its sole attachment is an Apple Development public certificate, not the Developer ID private-key identity. Signed candidate/notarization and artifact acceptance await corrected backup or release-keychain access. No keychain/profile changes, no gate closure.


October 22 [signed preview candidate](../experiments/chromium-extension-spike/evidence/signed-preview-20261022/README.md): shipping Developer ID signs separate app/helpers; Apple Accepted, stapled, strict verification and Gatekeeper pass. Launcher minimum corrected from inherited27 to26 (17 Mach-O deployment audit passes). Five isolated recovery assertions and validated native shutdown-veto/restart fixture pass; failed fixture attempts retained. Mock keychain/macOS27.2 only; real keychain and clean macOS26/full acceptance remain open. Temporary SSH access and seven fixture app/profile directories removed; Google/dev tabs unchanged. Final archive SHA256 `1e2204deaad59d050171ea88f18fc0b789ee39e7435b58b414cd7b5e51d62e78`. No Chromium/Electron rebuild, latency deferred. 1/12 gates; delta0, signing/notarization preparation complete.

October 22 [real-keychain preflight](../experiments/chromium-extension-spike/evidence/real-keychain-preflight-20261022/README.md): signed framework and native provider still use generic Chromium Safe Storage/Chromium service/account. Preview-only keychain namespace is a concrete L2 blocker. No real-keychain launch or credential access performed; recovery tests remain pending a namespace repair and replacement signed/notarized artifact. Google/dev snapshots unchanged. 1/12 gates, delta0. No build; latency deferred, Electron diagnostic build pending.

October 22 [preview keychain namespace repair](../experiments/chromium-extension-spike/evidence/preview-keychain-repair-20261022/README.md): common native keychain service/account now stable preview-only names, no generic Chromium fallback or migration. Incremental33.29s/6steps, finalguard0; footprint61/150 under standing authorization. Developer ID signature verified. Six real-keychain checks pass including encrypted-only clean restart, order/selection and immediate post-close crash; native shutdown Cancel/restart fixture passes. Isolated-HOME authorization failure and sandbox trust-verification errors retained separately. Google/dev unchanged; temporary SSH key revoked/deleted. Apple Accepted fb2c7d4f-6254-4fc1-83b6-a1774730bdcb; stapled/strict verification/Gatekeeper pass. Archive SHA256 921422c6f0e37b47256ba43e0de21a3c532cce2b8bb984665e6103fac9fd6874. SupportedmacOS26/fullcandidateacceptance and denied-provider saved-data checks remain open. 1/12 gates, delta0. Latency deferred, Electron build pending.

October22 [signed candidate boundary checks](../experiments/chromium-extension-spike/evidence/preview-boundary-20261022/README.md): after publishing keychain/signing61f390c8, eight bounded L7 checks pass on notarized921422c6 artifact. Ordinary HTTP bridge/iframe/internal and local fetch refusals, owner integrity and clean exit verified. Full dispatch/private-storage/diagnostic review remains open; no full security signoff. Owner confirms no macOS26 Mac available: supported-OS acceptance blocked, approved scope unchanged. Google/dev preserved; fixture removed; no build. 1/12 gates, delta0; latency/Electron pending.

October22 [macOS27.2 security/acceptance review](../experiments/chromium-extension-spike/evidence/macos27-security-review-20261022/README.md): owner amended scope from26 to27, acceptance on27.2 now valid. Quarantined relocated signature/Gatekeeper and six real-keychain recovery checks pass; nine strengthened private boundary checks pass, private fixture History URLs0, ten entitlement sets have no get-task-allow/disable-library-validation. L7 remains blocked: SR1 privileged Trusted Types disabled; SR2 explicit native diagnostic flag can persist private request metadata (not default leakage). Full method/dataflow/private-store and remaining candidate acceptance still open. No full security signoff or gate awarded1/12delta0. No build; Google/dev preserved, latency/Electron pending.

October22 [Trusted Types/private diagnostic repair](../experiments/chromium-extension-spike/evidence/preview-security-repair-20261022/README.md): restore exact static-markup Trusted Types policies and suppress private native diagnostic records, including expired socket owners. Final Developer ID signed replacement passes 39 bounded security/recovery assertions plus four markup tests; private History fixture rows0, regular logging positive control passes. Initial download SVG allowlist omission caught by console review and repaired; failed attempt retained. Incremental43.70s/7steps, finalguard0. Replacement notarization Accepted `1cd794f4-ae75-4342-bfa9-f2c7662f4192`; stapled, strict signature and Gatekeeper pass. Final archive SHA256 `7725b7886208b1aa047609cf0b48e9bb03604447238edb384208fd459fd51923`; tested code unchanged after stapling. Full security signoff and remaining acceptance still open; no new gate closure (1/12). Google baseline separate; latency/Electron pending.

October22 [signed coexistence acceptance](../experiments/chromium-extension-spike/evidence/signed-coexistence-20261022/README.md): security/notarization fixes published as cf2c103d on #1028. Next L2 schedule confirms separate app/profile ownership and state preservation across quits, but preview restart repeatedly terminates restored HTTP renderers with reason332 (invalid document sequence number); both document probes time out. Shipping early-readiness assertion is separately retained with intact saved session. No isolation pass; removal stage not reached. Next priority: diagnose saved/restored page-state producer without disabling the Chromium IPC guard. Google/dev unchanged; no build; latency/Electron pending. `[■□□□□□□□□□□□] 1/12 · Δ 0 gates`.

October22 [restored renderer repair](../experiments/chromium-extension-spike/evidence/restored-renderer-repair-20261022/README.md): pending initial GET PageState excluded; narrow legacy -1 sequence repair preserves Chromium IPC validation. Original failure-profile11 and new pending-GET14 checks pass; committed-history and POST non-replay controls pass. Replacement signed/notarized artifact passes all12 side-by-side isolation checks, including actual restored document loads, independent restarts and preview removal. Incremental31.90s/8steps, guard0, footprint62/153. Fixture mismatches retained separately. Apple Accepted39ccbbec-c003-4849-97f6-9e26361a0abe; archive6c2bbae590f312d7f112f7c0acd871946812f34b92852582582ece6bc0b7528c. L2 automated schedule passes; owner hand check and wider artifact acceptance remain open. Google/dev preserved. `[■□□□□□□□□□□□] 1/12 · Δ 0 gates`. Latency deferred; Electron pending.

October22 renderer fix/isolation published as05aceba1 to#1028, Google baseline excluded. Next L6 [current-candidate recovery](../experiments/chromium-extension-spike/evidence/current-candidate-recovery-20261022/README.md) passes six real-keychain assertions on notarized6c2bbae590f3 artifact: encrypted-only restart, exact tabs/selection, loading-close acknowledgement and immediate post-ack crash recovery. No rebuild. Full frozen recovery/recovery-UI acceptance remains open;1/12 gates, delta0. Latency deferred; Electron pending.

October22 [signed recovery acceptance](../experiments/chromium-extension-spike/evidence/signed-recovery-acceptance-20261022/README.md): unchanged notarized6c2bbae590f3 candidate passes native Cancel/Leave, grouped two-window Spaces/crash/journal recovery, active/inactive35/65 and65/35 ratio/focus restoration, Recently Closed and private teardown/restart exclusion. **L6 blocker:** real disposable-filesystem write refusal followed by acknowledged retry and immediate crash loses surviving HTTP tab; repeated with20second post-restart wait. No repair. Recovery-screen and broader pending profile teardown remain unqualified on artifact. Initial fixture readiness/helper failures retained. Google/dev preserved, no build;1/12 gates delta0. Next priority is durable retry acknowledgement repair, not further stress expansion. Latency/Electron pending.

October22 [failed-write retry repair](../experiments/chromium-extension-spike/evidence/save-retry-repair-20261022/README.md): corrected earlier loss diagnosis—the blank screen waits for native crash Restore. Original artifact explicit restore resurrects closed B; repair flushes current open session before history and revalidates mutations. Corrected failure/retry/crash, encrypted recovery, Split/RecentlyClosed, Cancel/Leave controls and native Restore UI pass on replacement signed/notarized d668fcd0ce6c artifact (Apple9b702603-3494-484b-ac15-b238908aa901). Seven capture tests, incremental40.93s/6steps, temporary diagnostic removed byte-for-byte and normal output restored; finalguard0, prior62/153unchanged. Earlier automatic-restore fixture failures retained. Google/dev unchanged. L6 broader acceptance remains open;1/12delta0. Latency/Electron pending.

October22 retry repair and signed evidence published as71d12488 to#1028; Google baseline excluded. Next L6 [signed private lifecycle checks](../experiments/chromium-extension-spike/evidence/signed-private-followup-20261022/README.md) pass10checkpoints on notarized d668fcd0ce6c candidate, including private split mutations, Spaces exclusion, context disposal and clean restart exclusion. No build. Encryption-recovery UI and broader artifact-bound teardown remain open;1/12, delta0. Latency deferred; Electron pending.

October22 [signed recovery UI/teardown](../experiments/chromium-extension-spike/evidence/signed-recovery-ui-20261022/README.md): unchanged notarized d668fcd0ce6c candidate shows accessible recovery dialog during disposable FIFO-held encrypted session read; releasing original bytes restores three tabs. Native Quit while read remains blocked exits2 via teardown watchdog; subsequent restart restores all tabs, then exits0. This is a common read-deadline UI pass and held-I/O teardown failure, not a real provider outage test. Initial setup/UI-binding failures retained. L6 open; next investigate cancellable pending-read shutdown. Google/dev unchanged, no build,1/12delta0; latency/Electron pending.

October22 [pending-read Quit repair](../experiments/chromium-extension-spike/evidence/pending-read-quit-repair-20261022/README.md): traced watchdog to opening a FIFO as a session record on BLOCK_SHUTDOWN storage sequence. POSIX nonblocking open plus descriptor fstat rejects nonregular records before reading, retaining write durability and regular encrypted format. Replacement Developer ID candidate passes16assertions (pipe/no-watchdog/exit0, regular encrypted restart, loading close, failed-write retry/crash). Incremental31.97s/6steps, finalguard0, fresh62/156 under standing owner authorization. Apple Acceptedf527392f-6720-4974-b831-53f5ffa49c8b, stapled/strict/Gatekeeperpass, final ZIP18272ab548d0117744209536bc24c0b6cc09ece38c01fec4976cf8e78899306f; L6 remains open for actual provider and remaining teardown acceptance. Prior68px layout assertion fails in unchanged source, retained separately. Google/dev processes remain alive with empty current target lists; no relaunch.1/12delta0, latency/Electron pending.

October22 published pending-read Quit repair/signed evidence78f92ceb to#1028, Google baseline excluded. Next L2 [current signed isolation](../experiments/chromium-extension-spike/evidence/current-signed-isolation-20261022/README.md) passes12coexistence/restart/rendering/removal checks on notarized18272ab548d0 candidate. Distinct identities, no preview URL/document registration/update feed and installed shipping code equality verified. Disposable profiles only; owner visual hand check and wider settings/update handoff claims not implied. No build;1/12delta0. Latency deferred/Electron pending.

October22 signed isolation evidence published04a88217 to#1028; Google baseline excluded. Owner L2 hand check prepared at /private/tmp/blanc-l2-owner-check with exact18272ab548d0 signed candidate and shipping1.42.1 in disposable app/profile copies. Both labeled test windows observed via native AX; shipping test onboarding skipped. Await owner identification/tab independence/preview-quit observation before restart/settings/removal stages. No owner pass or L2 closure claimed;1/12delta0. No build, latency/Electron pending.

October22 L2 owner walkthrough: owner reports initial app identification, tab independence and Preview quit/shipping survival passed. Process inspection still found original test Preview alive, so a separate controlled exit0/restart was recorded; exact three tabs/selection restored. Settings-separation and explicit native-menu quit stage now pending; owner restart/removal sign-off not yet recorded. L2 remains open,1/12delta0; Google baseline separate, no build, latency/Electron pending.

October22 L2 owner stage2 passed: owner selected Shelf only in preview and reported shipping remained Billboard, then native-menu Preview quit produced exit0. Agent restarted exact test candidate; protocol and native AX confirm Shelf, shipping stays Billboard, and four tabs in each (original3 + owner-addedNewTab). Await owner Shipping quit/preview-survival, then shipping restart and test-preview removal. L2 stillopen;1/12delta0. No build; Google separate, latency/Electronpending.

October22 L2 owner stage3 passed: Shipping quit while Preview remained usable with Shelf/four tabs. Shipping exit0 and restart preserve all four tabs/Billboard; preview remains Shelf. Final test Preview native-menu quit exits0; only disposable app bundle removed, profile and master signed artifact preserved. Shipping remains running with four tabs/Billboard verified by protocol and native AX. Await final owner visual confirmation before L2 closure;1/12delta0. No build; Google separate, latency/Electronpending.

October22 L2 closed after owner final Passed: signed18272ab548d0 artifact isolation accepted with separate tabs/settings, reciprocal native quit/restart and disposable-preview removal. Original data and master app preserved; controller finished. Launch progress2/12(16.7%), delta+1L2. See owner evidence. Other ten gates remain open; no release/Decision2 approval. Google separate; latency and Electron pending.

October22 L2 acceptance published26940e23 to#1028. Next [L3 review](../experiments/chromium-extension-spike/evidence/l3-baseline-review-20261022/README.md) completes official channel/paginated delta reconciliation: candidate157.0.8103.6 behind currentBeta157.0.8103.15;581commits/1,894paths,6patchoverlaps,DEPSrolls. Candidate lacks at least5described upstream memory-safety fixes; no exploitability/CVE completeness claim. Anthony Loria is sole maintainer, owner requires distribution suspension when unavailable; backup draft superseded. Next prepare reversible current-Beta update and guarded build-plan review before any compilation; preserve Google fixture/source/output. L3 open,2/12delta0. No build/latency/Electron.

October22 owner requested157.0.8103.15 update. Isolated source prepared at1aa07b6387, six overlap merges clean, nine dependencies and five upstream security fixes verified. Original source/output/Google preserved. Build graph and generated flags updated with unchanged compiler/SDK/args; copied absolute-path Siso cache safely relocated through export/import before final preflight. Compilation/signing/runtime acceptance still pending; see beta15-update-20261022.md. Prior artifact L2 remains recorded; new artifact requires regression evidence. Latency/Electronpending.

October23 Beta15 build completed: target157.0.8103.15, normal guard0, originalHEAD/fingerprints preserved. Default-worker pressure caused one graceful interruption with18,003done/0failed; cached eight-worker resume succeeds32,396steps/2h20m44.55s (aggregate2h49m13.11s).22focusedtests pass,9deps reverified; separate preview packaged with only.15framework. DeveloperID signing/notarization/runtime acceptance **not started**: MacBook SSH port22 times out on default andIPv4routes. Await owner wake/unlock/same-network/RemoteLogin; existingkey retained. See [Beta15 evidence](../experiments/chromium-extension-spike/evidence/beta15-update-20261022/README.md). No newgate acceptance, no PRpush/merge; Google separate, latency/Electronpending.

October23 [Beta15 update completed](../experiments/chromium-extension-spike/evidence/beta15-update-20261022/README.md): target157.0.8103.15/1aa07b6387, five identified upstream memory-safety fixes and nine dependency pins verified;62files/156hunks. Owner-approved isolated rebuild completed after cached worker-limit resume, aggregate2h49m13.11s, finalguard0. DeveloperID/AppleAccepted/stapled/Gatekeeper pass (submission17bf3b2f-3528-4fc3-b17e-2db0a4833e43); ZIPd9924b7e5398b95f21e1107cb146eaf0f1e53387e9c850fc720b33e4adbe50cb. Seventy-six signed runtime checkpoints and23focused source tests/scopedlint pass, including security/private diagnostics, encrypted/write-retry/crash/Split recovery and coexistence/restart/removal. Originalsource/output fingerprints and installedShippingcode preserved; Google9225/dev9248reachable,emptytargets,notrestarted. SSH/credential/probe failures retained. ExistingL2ownerrecord remainsboundtooldartifact; no newphysical/fullsecurity/releaseapproval or gate awarded,2/12delta0. Maintenance/cost/fullreview and otherlaunchgates remainopen; Googleledger/baselineexcluded. Latency/Electronpending.

October 23 signed update and retreat acceptance: [43-check evidence](../experiments/chromium-extension-spike/evidence/signed-update-rollback-20261023/README.md) binds source `ad53757c` and signed A `18272ab548d0` / B `d9924b7e5398`. Native browser download and Archive Utility preserve quarantine; macOS Open confirmation permits B with no security bypass. Three-tab order/selection and Shelf survive update, clean restart and rollback using the closed A backup; the B profile stays separately preserved. Fresh-profile retreat and preview removal preserve shipping's disposable state and installed code. Initial download-directory, target-lifecycle and OS-confirmation timeout failures are retained as fixture limitations. The Google baseline was not modified; its endpoint was unavailable at both runtime snapshots, so no current tab-preservation claim.

L9 replacement/rollback/removal mechanics are complete; the visible version/security notice and published withdrawal route are the concrete remaining L9/L12 work. L8 gains quarantine launch on existing macOS27.2, not clean-machine/public-endpoint or signed extension integration qualification. Updated [operating instructions](../experiments/chromium-extension-spike/preview-manual-maintenance-policy.md) are prepared for publication review. No code/native build/signing change; original A/B masters retained. **2/12 gates, delta 0**; no Decision2 or release approval. Latency and the Electron diagnostic build remain pending.

October23 L9 closed: [signed notice acceptance](../experiments/chromium-extension-spike/evidence/preview-notice-20261023/README.md) binds source9a1b4fa9, ZIPf177e0b5100db9a3fc83c7d5522cc343b86582add4d209d49696cef4f3729a55 and AppleAccepteddbe289ff-82fd-4ddf-87ea-d2a3023677f6. Version/source/status metadata is stamped at packaging; Start Page has offline guidance and the Island opens the same live status route. PR1028 publishes the status/withdrawal section; it is anonymous HTTP200, not a public release. Sixteen signed notice and two footer layout checks pass, including Escape/focus return, no automatic status request and restart persistence; 16 focused source tests pass. Readability repaired to an opaque surface. Earlier keyboard/URL/ready timing fixture failures retained. Prior43-check signed update/rollback/retreat proof remains the operator rehearsal. **3/12 (25%), delta+1L9**; remaining security, physical/functional, distribution/provenance and final release gates stay open. No native build or Google baseline mutation; latency deferred, Electron diagnostic build pending.
