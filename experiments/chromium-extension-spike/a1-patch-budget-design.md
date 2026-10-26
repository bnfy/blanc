# A1: upstream integration and patch-budget design

> October 26 technical review complete: [source-bound review](evidence/a1-design-review-20261026/README.md) covers all **75 existing upstream files / 184 hunks** in the signed DevTools repair source. Exact patch digests and the changed path set match the recorded inventory; no dependency audit, build or runtime suite was repeated. Fourteen selected owned-source copies also match. Technical recommendations are recorded below; Decision 2/owner approval, layout migration, automated apply tooling and measured savings remain open. Electron paused, Google baseline separate, latency deferred.

Reviewed implementation: Blanc source `1523375af5b93cf910d9cca82f522155ef525adf`, Chromium157.0.8103.15 / upstream `1aa07b638799e59656559ae6c6649d4b197f555e`. The recorded October25 inventory includes151clean Git dependencies; that dependency audit is not newly rerun. The owner permits recorded budget changes with later consolidation, so the old49/120 and58/137 ceilings are historical. No patch deletion, layout move, GN/toolchain change or new build is performed by this review.

## Historical starting point — October 20

Fresh configuration-pinned inventory against Chromium commit `41520584daa68d0040db7746ae562a0ff82187f6` measures **49 files / 117 hunks**. See `evidence/a1-patch-audit-20261020/inventory.json` for Git version, attributes, hashes and checked dependency pins. The zero spare files/three spare hunks described that historical49/120ceiling. Neither it nor the original21-file inventory describes the current footprint. Changes confined to new Blanc-owned files are excluded by the approved counting rule, not claimed to have zero maintenance cost.

## Reviewed boundary and dependency decisions

The current75-path ledger is a maintenance inventory, not a promise that75sites can become one generic hook. `domains.json` gives each path one primary responsibility; several files also contain research or shared duties. Tests and binary branding remain in the count.

| Responsibility | Upstream files | Hunks | Review disposition |
| --- | ---: | ---: | --- |
| Bundle/keychain identity | 5 | 6 | Retain namespace and signer/helper identity invariants. Four branding/resource paths may later move to dedicated resources; keychain isolation is not cosmetic. |
| Build dependency edges | 5 | 7 | Keep required process edges; factor owned implementation only after checking GN visibility/cycles. |
| Island/native shell | 17 | 57 | Largest presentation integration surface; extract owned policies, preserve real extension anchors and native commands. |
| Session/recovery | 19 | 51 | Keep durability, encrypted readiness, identity and close ordering explicit. No count-only removal. |
| Native hit testing | 8 | 10 | Preserve the complete AppKit→Views target chain and its interface implementers/test adapters. |
| Network enforcement | 8 | 26 | Keep final factory/override, socket, transport and activation boundaries. No earlier catch-all hook. |
| Provider/document research | 10 | 24 | Compiled research admission is excluded from the preview, but source/API maintenance still counts; some files have mixed responsibilities. |
| Certificate policy | 1 | 1 | Preserve all eight certificate-blocklist entries until an equivalent verified upstream policy replaces them. |
| Build compatibility | 2 | 2 | Candidate retirement only during a necessary affected TypeScript build/update. |
| **Total** | **75** | **184** | **Zero measured reduction.** |

Specific layering constraints:

- `content` owns small callback/forward-declaration gates; Chrome registers noncapturing function pointers. Do not introduce `content`→Chrome UI or service implementation dependencies. Factory-owned request state keeps weak BrowserContext/document identity; registration itself must not capture a profile/window.
- URLLoader gating remains after request-mutating DevTools assembly and at the override downstream receiver. Preserve CORS/security flags, no-assets behavior and request ownership. The earlier outer hook's bypass is documented; an apparent patch-count saving does not justify reverting it.
- Keep core session backend callbacks generic. Split the Chrome-side identity/session facade from the UI host header so session integration does not need WebUI/Views declarations. Do not create a browser-core↔browser-view target cycle while extracting it.
- Start with interface/body separation around the4,149-line owned `blanc_prototype_ui.cc`, then profile-owned session/Space services and presentation adapters. The908-line owned blocker proxy is already separated from the utility/Mojo targets; it still has maintenance cost outside the75-path counter. Fourteen verified copied files are a sample, not an exhaustive owned-code inventory.
- Retain explicit research/default configuration and generated resource/license inputs. Whole-file overrides, copied declaration stubs and disabled research code are never zero-cost accounting devices.

## Proposed layout after Decision 2

- `src/blanc/BUILD.gn`: narrowly separated browser, renderer, utility, resources and test targets. Keep dependency direction explicit; do not create a browser-view/header cycle.
- `src/blanc/browser/`: Island host, native command bridge, Spaces/recovery and profile-owned services.
- `src/blanc/renderer/` and `src/blanc/services/blocker/`: document-start agent, Mojo interfaces and sandboxed engine service.
- `src/blanc/resources/`: copied first-party UI and licensed bundled material with existing notices preserved.
- `src/blanc/chromium_src/`: exceptional whole-file wrappers only where symbol visibility, GN selection and include ordering are demonstrated. No global macro-based behavioral rewriting as a default.
- `src/blanc/patches/`: small ordered integration patches, one purpose per patch; manifest records upstream revision, affected paths, source hashes, owner, justification and regression suite.

This target layout is a design recommendation, not a validated new GN graph. Where an independent target would cause a browser dependency cycle, keep a narrow adapter compiled by the existing owner target until a valid interface split is demonstrated.

Keep `prepare.mjs --assets-only` as the asset copier during migration. Move native implementation files before changing behavior. Each move must have a reversible commit, identical runtime contracts and the guarded incremental build plan reviewed before execution. No cold output or toolchain change is implied.

## Patches versus overrides

Keep explicit patches for lifetime, serialization, request interception and cross-process document-token contracts: these depend on precise upstream ordering and should stay visible in review. Move implementation bodies to Blanc-owned targets while leaving minimal calls at genuine integration points. Merely moving an include or merging adjacent edits is not a functional reduction.

A whole-file override can reduce direct edits but increases shadowed source risk. Report direct patched files/hunks, overridden upstream files, and the union of affected upstream paths separately. Do not subtract a path from the maintenance footprint merely because a wrapper now owns it. The approved tranche counter is unchanged; a successor accounting rule needs an explicit Decision 2 record.

## Reduction candidates, in priority order

| Candidate | Evidence and possible benefit | Required proof before removal |
| --- | --- | --- |
| ESLint compatibility pair | `ui/webui/resources/tools/eslint/BUILD.gn` adds Buffer declarations; `tsconfig_base.json` enables skipLibCheck. Two files/two hunks, not product behavior. | Determine why the pinned dependencies require both; on a candidate upstream revision run the actual affected TypeScript build without each workaround. No deletion solely because cached outputs pass. Upper bound of two paths, not a promised saving. |
| Branding/resources | Four paths/five hunks: plist, BRANDING, Assets.car, app.icns. | Dedicated resource targets must preserve bundle identity, icons and signing/packaging inputs on each supported platform. Moving copied assets alone does not qualify as eliminating upstream integration. |
| Build integration | Browser/frame/renderer/utility/content GN touch points currently wire separate runtime boundaries. | Factor Blanc-owned source lists/deps into dedicated targets; prove no circular dependencies and correct linking in each process. Several upstream dependency edges will still be necessary. No quantified saving yet. |
| Island native adaptation | BrowserView, layout, window feature controller, commands and extension toolbar contain distinct native responsibilities. | Consolidate duplicated policy into Blanc helpers, retain native anchors, focus routing and crash recovery. Run permission/popup/header/Glance/Find regressions. Do not replace all hooks with an unsupported giant wrapper. |
| Session acknowledgement/identity | Backend, manager, service, restore and live-tab metadata patches enforce durable identity and failure reporting. | Preserve clear/encrypted write failures, delayed completion, owner destruction, duplicate identities and crash reconstruction evidence. No removal recommended before a supported upstream equivalent exists. |
| Document tokens/blocker and worker hooks | Browser/renderer/Mojo and update-loader edits carry safety and attribution contracts. | Re-run request-path, stale-document, navigation, lifecycle and fail-closed tests. Do not trade correctness for lower inventory. |

No reduction has been applied or measured. Current Decision2 proposal: use the recorded75/184footprint as the review baseline and prioritize demonstrated removal. The owner permits recorded increases without repeated budget approval; this does not approve a layout migration or claim a maintenance-cost reduction. Historical stop conditions remain historical and cannot be waived by this design.

## Bounded consolidation sequence

1. Record the exact current upstream/copy/resource inputs and narrow the UI/session public interfaces. Review dependency direction before moving bodies.
2. Extract owned implementation by responsibility, one reversible change at a time. Treat an unchanged upstream-path union as unchanged footprint, even when code moves.
3. Separate shared production integration from research-provider recipes without relaxing default exclusion or dropping identity validation. Mixed files remain counted.
4. On the next necessary affected upstream update, assess the ESLint pair and branding candidates. No speculative clean build or deletion to improve the count.
5. Implement the manifest/apply contract and authoritative native inventory job before relying on unattended rebase automation. A design review is not proof that these tools exist.

Requalification is tied to an actual change: GN/module movement requires affected linking; session movement requires affected write/restore/cancellation cases; native view movement requires pane input/extension anchors; network movement requires the affected request boundary. Existing passed suites are reused when unchanged. Latency and Electron work are not authorized by this list.

## Fail-closed patch application contract

Current preparation is procedural: `prepare.mjs:edit` and blocker `patch` helpers reject missing/ambiguous anchors, but marker presence can skip an edit, and files can be mutated before the whole recipe set finishes. They do not implement the following complete before/after-state contract or an all-series rollback. This is a tooling gap for future unattended maintenance, not a new demonstrated runtime defect.

The future apply tool operates only on the pinned clean source/dependency revisions. Validate the complete manifest and before-image hashes before any mutation; reject dirty upstream files, changed DEPS, missing dependencies, duplicate paths, unexpected binaries and wrong patch order. Preflight the full series in a disposable index/worktree before touching the intended checkout. Apply without three-way merge, whitespace repair, fuzz or automatic conflict resolution. Verify exact after-image hashes, then run the existing inventory. A context offset or otherwise different base must fail the before-image check even if Git could apply it. On failure preserve diagnostics and leave the production checkout untouched. Idempotent reruns accept only the exact manifest after-state. This is a specification, not an implemented apply tool.

## CI reporting design

Every PR should run a lightweight manifest/source-policy check and report the intended upstream paths, direct delta, override delta and missing evidence. A dedicated trusted runner with the pinned Chromium checkout runs the authoritative existing counter after applying the series. Upload signed/hashed inventory evidence tied to the PR SHA, Chromium SHA, resolved dependency pins and tool version. A missing checkout or refused dependency audit is **unverified**, never a zero count or successful budget check. Report the actual current count against the reviewed baseline (currently75/184); any future enforced ceiling must be explicitly documented rather than retaining the historical58/137 limit. Avoid giving untrusted PR scripts credentials or a writable shared developer checkout.

The hosted PR suite currently does not constitute this authoritative Chromium inventory job. Wiring the manifest/apply tool and runner is implementation after Decision 2. The technical design review is complete at the stated source; tool/runner implementation and owner acceptance remain open. This artifact does not close the runtime, visual, VoiceOver, cost, latency or extension-upgrade gates.

## Current path ledger — reviewed October 26

All75upstream paths appear once below. Hunk counts are the exact recorded184-hunk inventory, whose patch digests match the reviewed source. `source-binding.json` retains per-path hashes and `domains.json` the primary classification. This replaces the stale49-path table; the October20 baseline remains in its dated evidence and Git history.

| Upstream path | Primary responsibility | Hunks |
| --- | --- | ---: |
| `chrome/app/app-Info.plist` | identity branding | 1 |
| `chrome/app/theme/chromium/BRANDING` | identity branding | 2 |
| `chrome/app/theme/chromium/mac/Assets.car` | identity branding | 1 |
| `chrome/app/theme/chromium/mac/app.icns` | identity branding | 1 |
| `chrome/browser/BUILD.gn` | build edges | 1 |
| `chrome/browser/app_controller_mac.mm` | island shell | 1 |
| `chrome/browser/chrome_content_browser_client.cc` | network enforcement | 7 |
| `chrome/browser/chrome_content_browser_client_receiver_bindings.cc` | network enforcement | 3 |
| `chrome/browser/extensions/component_extensions_allowlist/allowlist.cc` | research provider identity | 3 |
| `chrome/browser/extensions/component_loader.cc` | research provider identity | 2 |
| `chrome/browser/lifetime/application_lifetime_desktop.cc` | session recovery | 1 |
| `chrome/browser/prefs/browser_prefs.cc` | session recovery | 1 |
| `chrome/browser/prefs/session_startup_pref.cc` | session recovery | 2 |
| `chrome/browser/search/search.cc` | island shell | 2 |
| `chrome/browser/sessions/session_restore.cc` | session recovery | 7 |
| `chrome/browser/sessions/session_service.cc` | session recovery | 2 |
| `chrome/browser/sessions/session_service_base.cc` | session recovery | 8 |
| `chrome/browser/sessions/session_service_base.h` | session recovery | 1 |
| `chrome/browser/ui/browser_command_controller.cc` | island shell | 2 |
| `chrome/browser/ui/browser_commands.cc` | island shell | 8 |
| `chrome/browser/ui/browser_live_tab_context.cc` | session recovery | 4 |
| `chrome/browser/ui/browser_tab_restorer.cc` | session recovery | 2 |
| `chrome/browser/ui/omnibox/omnibox_everywhere/omnibox_everywhere_controller.cc` | island shell | 1 |
| `chrome/browser/ui/omnibox/omnibox_next_features.cc` | island shell | 1 |
| `chrome/browser/ui/startup/startup_browser_creator.cc` | session recovery | 1 |
| `chrome/browser/ui/startup/startup_browser_creator_impl.cc` | session recovery | 5 |
| `chrome/browser/ui/views/extensions/extensions_toolbar_button.cc` | island shell | 7 |
| `chrome/browser/ui/views/extensions/extensions_toolbar_button.h` | island shell | 1 |
| `chrome/browser/ui/views/extensions/extensions_toolbar_desktop.cc` | island shell | 6 |
| `chrome/browser/ui/views/frame/BUILD.gn` | build edges | 3 |
| `chrome/browser/ui/views/frame/browser_frame_view_mac.mm` | island shell | 2 |
| `chrome/browser/ui/views/frame/browser_native_widget_mac.mm` | island shell | 2 |
| `chrome/browser/ui/views/frame/browser_view.cc` | island shell | 10 |
| `chrome/browser/ui/views/frame/layout/browser_view_tabbed_layout_impl.cc` | island shell | 4 |
| `chrome/browser/ui/views/frame/multi_contents_view.cc` | island shell | 3 |
| `chrome/browser/ui/webui/chrome_web_ui_configs.cc` | island shell | 2 |
| `chrome/browser/ui/window_feature_controller/window_feature_controller.cc` | island shell | 3 |
| `chrome/renderer/BUILD.gn` | build edges | 1 |
| `chrome/renderer/chrome_content_renderer_client.cc` | network enforcement | 3 |
| `chrome/utility/BUILD.gn` | build edges | 1 |
| `chrome/utility/services.cc` | network enforcement | 3 |
| `components/os_crypt/common/keychain_password_mac.mm` | identity branding | 1 |
| `components/remote_cocoa/app_shim/browser_native_widget_window_mac.mm` | island shell | 2 |
| `components/sessions/content/content_serialized_navigation_builder.cc` | session recovery | 2 |
| `components/sessions/core/command_storage_backend.cc` | session recovery | 4 |
| `components/sessions/core/command_storage_backend.h` | session recovery | 1 |
| `components/sessions/core/command_storage_manager.cc` | session recovery | 1 |
| `components/sessions/core/command_storage_manager.h` | session recovery | 2 |
| `components/sessions/core/tab_restore_service.h` | session recovery | 2 |
| `components/sessions/core/tab_restore_service_impl.cc` | session recovery | 4 |
| `components/sessions/core/tab_restore_service_impl.h` | session recovery | 1 |
| `content/app_shim_remote_cocoa/web_contents_view_cocoa.mm` | native hit testing | 1 |
| `content/browser/loader/url_loader_factory_utils.cc` | network enforcement | 4 |
| `content/browser/loader/url_loader_factory_utils.h` | network enforcement | 1 |
| `content/browser/renderer_host/render_frame_host_impl.cc` | research provider identity | 2 |
| `content/browser/service_worker/service_worker_update_checker.cc` | network enforcement | 2 |
| `content/browser/web_contents/web_contents_view_mac.h` | native hit testing | 1 |
| `content/browser/web_contents/web_contents_view_mac.mm` | native hit testing | 1 |
| `content/browser/web_contents/web_contents_view_mac_unittest.mm` | native hit testing | 1 |
| `content/browser/websockets/websocket_connector_impl.cc` | network enforcement | 3 |
| `content/public/browser/BUILD.gn` | build edges | 1 |
| `extensions/browser/api/execute_code_function.cc` | research provider identity | 5 |
| `extensions/browser/script_executor.cc` | research provider identity | 6 |
| `extensions/browser/script_executor.h` | research provider identity | 2 |
| `extensions/common/api/extension_types.json` | research provider identity | 1 |
| `extensions/common/mojom/frame.mojom` | research provider identity | 1 |
| `extensions/renderer/programmatic_script_injector.cc` | research provider identity | 1 |
| `extensions/renderer/script_injection.cc` | research provider identity | 1 |
| `net/cert/cert_verify_proc_blocklist.inc` | certificate policy | 1 |
| `ui/base/cocoa/views_hostable.h` | native hit testing | 2 |
| `ui/views/controls/native/native_view_host_mac.h` | native hit testing | 1 |
| `ui/views/controls/native/native_view_host_mac.mm` | native hit testing | 2 |
| `ui/views/controls/native/native_view_host_mac_unittest.mm` | native hit testing | 1 |
| `ui/webui/resources/tools/eslint/BUILD.gn` | build compatibility | 1 |
| `ui/webui/resources/tools/eslint/tsconfig_base.json` | build compatibility | 1 |
| **Total** | **75 paths** | **184** |
