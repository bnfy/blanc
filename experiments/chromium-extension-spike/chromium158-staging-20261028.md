# Chromium158 rebase — build complete, qualification incomplete

## Current authoritative status

Build completed successfully on the sixth cached invocation with eight workers, followed by zero scheduled actions. The current checkout matches the durable completed snapshot:78 modified upstream files/170 tracked hunks plus23 added source files; these counts describe different categories and must not be compared to an older tracked-only footprint as if equivalent. [Snapshot verification](evidence/chromium158-staging-20261028/source-snapshot-verification.json) validates both artifact hashes and current file contents.

64 affected protocol checks pass. Separate mock-keychain recovery6/6 and Split View5/5 pass diagnostically. Real-keychain follow-up passed all6recovery and5split checks; the earlier stall remains unexplained. No signed158 or gate acceptance is claimed. Six build wrappers total10380.131seconds, excluding staging/isolated repairs/qualification and owner attention.157fallback remains intact, Electron paused, Google baseline separate and latency deferred.

## Historical checkpoints (superseded by current status above)


Owner authorized isolated durable workspace/dependencies and a fresh exact dry-run scope. Target158.0.8127.2, official tag681cd621e82e606d7536eae8ea2576afb3c7d65c. Source/cache seed is the preserved157Recovery tree; destination Projects/BlancChromium158. Copy-on-write staging running in session9585; records/20261028/clone.log and clone.complete record outcome.314GiB free at start, no competing build found.

Next: finish clone, preserve seed tracked diff/inventory, fetch exact target, review root/dependency changes and compiler/SDK pins, apply/review Blanc integration in isolated tree, then generation and normal dry-run. Existing preparation scripts deliberately reject versions other than157.0.8103.15; review anchors before changing pins. Exact action count is not yet known. No clean, compilation, Electron work or Google mutation. Preserve signed157 masters and original source/output.

## Root preparation complete

Exact fetch succeeded after preserving network failures. Isolated source verified158.0.8127.2 at681cd621; pinned dependency sync now running with hooks/pre-hooks and depot auto-update disabled. Target compiler changes from llvmorg-24-init-7747-g62397f8b-67 to llvmorg-24-init-14453-ge063be79-1; compiler installation not yet performed. Scope must include this cache impact. No compilation or dry-run count yet.

Read-only patch admission identified3conflicts: live-tab restoration, frameBUILD.gn, certificate blocklist. Rawpatch-check.log retained. Adapt identities around new upstream ContextualTasks restoredata and preserve union of blocklist entries. No patch has yet been applied; dependencies still running.

## Final dry-run scope

Dependencies and pinned158Clang prepared; three conflicts resolved,111certificate entries retained. Obsolete157TypeScript workaround removed, upstream checking retained. GN37223targets/5069files.122Python metadata actions completed. Final guarded dryrun57943actions; no pending buildflag commands. No compilation; guard stopped large plan. No active operation. Raw plan at Projects/BlancChromium158/src/out/BlancPrototype/blanc-build-plan.log. Electronpaused/Googleseparate. Await compilation decision; preserve reproducible158adaptations before build.

## Owner build approval

Owner approved57943-action Chromium158 build with8workers. Durable wrapper operations/build158-approved.py running session23354: preserves reviewed158.patch/untracked-source-inventory.json, then guarded build --allow-large-build --local-jobs=8. Log Projects/BlancChromium158/records/20261028/approved-build.log, build-receipt.json. Inspect actual processes before any competing work. On success normal zero-action guard, then affected native restoration/split identity, certificate coverage, blocker/document-start and integration checks; no signed-candidate acceptance from unsigned output. Narrow repairs preserve caches; no clean. Electronpaused/Googleseparate/latencydeferred. Original157source/master untouched.

## First build outcome

Approved158 build session23354 exited1:30.41s,946done,1failed,84396remaining; actual scheduler expanded beyond57943approval (~85k). Attempted graceful stop after noticing expansion but process already exited naturally. TypeScript eslint failure resolves undeclared //../../../node_modules/buffer/index.d.ts outsidecheckout; investigate isolation/dependency resolution, do not add external path or skip checks. Cache preserved. No active build. Need narrowrepair and revised dryrun scope before resuming expanded build; affectedruntimechecks not run.

## TypeScript isolation repair

TypeScript barebuffer resolution escaped to owner node_modules. Added target path mapping to pinned third_party/node/node_modules/@types/node/buffer.d.ts; failed target nowpasses1step, undeclared-dependency enforcement unchanged. Upstream generator already sets skipLibCheck; earlier stricter-config description was incorrect, no new suppression added. Revised dryrun56997actions; not a live upper bound (prior57943expandedto85342). Full compilation not resumed. Preserve caches, Electronpaused/Googleseparate. See evidence/chromium158-staging-20261028/revised-scope.json and typescript-isolation.patch.

## Authorized cached resume

Owner explicitly authorized cached158 resume with8workers and reported live-scope expansion. Wrapper operations/build158-resume.py active session77475; records/20261028/build-resume1.log and resume1-receipt.json. No competing build found. Preserve caches; narrow failures only, no clean. Wrapper runs normal guard on success; require actual zero actions, not exit alone, before affected recovery/split identity/certificate/blocker checks. No signed acceptance. Electronpaused/Googleseparate. Do not restart build if already active.

## Second TypeScript target repair and cached resume

Resume1 failed after1425actions on Glic generator externalbuffer types. Added same pinnedin-checkout mapping to thattarget; isolated check passed1step10.01s. No suppression. Authorized cached8worker resume2 active session22430; records/20261028/build-resume2.log and resume2-receipt.json. Scopeexpansion already authorized. No competing build/clean. Zeroactionguard and affectedruntimechecks follow success. Electronpaused/Googleseparate.

## Pinned companion tool repair

Resume2 stopped after11093actions11m54.79s at SwiftShaderlink:missingllvm-otool. Restored exact llvmobjdump-llvmorg-24-init-14453-ge063be79-1 package using update.py --package objdump; verified llvm-otool/llvm-nm24.0.0git. Failedlink passed1step10.20s. No clean/compiler reinstall. Resume3 running session35054, build-resume3.log/resume3-receipt.json. Eightworkers/liveexpansion authorized.157fallback source/cache/signedmaster preserved. Zeroactionguard then affected checks remain pending.


### Guarded affected-check handoff

Chromium 158 build remains active with eight workers (resume3, session35054; PID38763), last checked at15922 completed actions/43m39s, no new failure. Qualification sessions53213 and54381 remain waiting for successful build/zero-action guard and prior checks respectively. Preserved a reproducible source snapshot at evidence/chromium158-source-snapshot: 3,564,285-byte tracked binary patch, all23 untracked source files archived, SHA256 receipts. No runtime acceptance yet. Chromium157 fallback unchanged; caches preserved; Electron paused; Google baseline separate; latency deferred.


### Compiled certificate retention

Queued certificate SPKI retention checker operations/check158-blocklist.py (session51400). It waits for resume3 success plus zero-action guard, then compares inherited157/158 source entries and scans native Mach-O outputs. Writes evidence/chromium158-affected-checks/certificate-retention.json; no runtime revocation or signed acceptance implied. Build35054 remains live; latest17497actions55m25s. Existing runtime qualification53213 and splits54381 still queued. All fallback/caches preserved.


### DocumentService lifetime API repair

Chromium158 resume3 stopped after39,986 actions at2h14m33s: CosmeticDocument still used the old DocumentService constructor. Adapted only158 service to SelfDeletingPassKey, MakeSelfDeleting and private destructor. First isolated attempt exposed private-destructor requirement; corrected object passed. Preserved both logs and source hashes in repo evidence/chromium158-staging-20261028/document-service-repair. Cached eight-worker resume4 is active session95597; records/20261028/build-resume4.log and resume4-receipt.json. Requeued affected checks42516, splits76586, certificate34555; no runtime pass or zero-action result yet. Preserve157fallback, Electronpaused, Googleseparate, latencydeferred.


### UI API compatibility repair

Resume4 failed at1131actions on Chromium158 UI API changes. Forwarded GetActionAppMenuForTesting to existing delegate and renamed four foreground-tab enum uses. Single repaired UI object passed; evidence/chromium158-staging-20261028/ui-api-repair retains source hash and log. Cached eight-worker resume5 running session23284; records/20261028/build-resume5.log and resume5-receipt.json. Affected checks9624, splits73844, certificate9431 queued behind success/zero-action guard. No runtime pass yet;157fallback preserved, Electronpaused, Googleseparate, latencydeferred.


### Build complete; affected qualification

Chromium158 build COMPLETE: resume5 exit0, guardExit0 and literal zero scheduled actions. All64 regular/private property-group and blocker-recovery protocol checks pass with Node22; first Node20 WebSocket fixture failure preserved. All111 inherited certificate entries retained in source/native binary. Recovery fixture failed missing encrypted file on default native launch; original evidence preserved. Explicit encrypted-session diagnostic is running session65727 at evidence/chromium158-affected-checks/recovery-encrypted; do not repeat64passes. Split runner42188 is waiting because primary report incomplete (empty error string); run remaining split after recovery diagnosis, avoiding competing runner. No signed acceptance. Completed-source snapshot: evidence/chromium158-source-snapshot-completed.157fallback preserved, Electronpaused, Googleseparate, latencydeferred.


## Chromium158 real-keychain isolation checkpoint

Completed native build preserved. Six recovery and five Split View checks pass with a mock keychain; real-keychain recovery fails encrypted-session creation and real-keychain split readiness fails. Stack sample identifies blocked macOS key retrieval; cause remains unresolved. These are diagnostic passes only, not signed acceptance or new gate credit. See experiments/chromium-extension-spike/evidence/chromium158-staging-20261028/keychain-recovery-diagnosis/README.md. Previous64passes not repeated;157fallback preserved, Electron paused, Google separate, latency deferred.


## Real-keychain follow-up: passed

Owner reported this Mac unlocked and no visible Keychain prompt. An unsandboxed metadata-only lookup confirmed the existing Preview Safe Storage item in login.keychain-db; a read-only SecKeychainGetStatus call returned unlocked=true. Earlier sandboxed status errors did not establish the keychain state.

Using the same completed158 app, fresh isolated fixtures passed all6real-keychain recovery checks and all5real-keychain Split View checks. Recovery explicitly enables encrypted-session storage and verifies encrypted-only restart; split uses the native default feature configuration. No app code, signing, stored key, access permissions or build cache changed. The earlier stall's root cause remains unproven; retain all earlier failures and the stack sample. This demonstrates successful affected native runs, not a diagnosed permanent fix for every possible Keychain stall or signed-candidate acceptance.

Together with the existing64protocol passes, all75prepared affected checks now have passing results. The64were not repeated.111certificate-entry retention remains a separate static/native-byte check. No new gate credit, signed158acceptance, or L12GO. Next review/package the158rebase evidence and assess remaining original Decision2 inputs;157signedfallback preserved, Electronpaused, Googleseparate, latencydeferred.
