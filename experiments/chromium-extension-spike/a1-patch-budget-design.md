# A1: upstream integration and patch-budget design

Status: design draft for Decision 2, October 20, 2026. No layout move, patch deletion, build, GN change, or budget increase is authorized by this document. Current tranche ceiling remains **49 existing upstream files / 120 hunks**.

## Measured starting point

Fresh configuration-pinned inventory against Chromium commit `41520584daa68d0040db7746ae562a0ff82187f6` measures **49 files / 117 hunks**. See `evidence/a1-patch-audit-20261020/inventory.json` for Git version, attributes, hashes and checked dependency pins. There are zero spare files and three spare hunks. The original 21-file inventory is historical; it is not the cost of today's prototype. Changes confined to new Blanc-owned files are excluded by the approved counting rule, not claimed to have zero maintenance cost.

## Proposed layout after Decision 2

- `src/blanc/BUILD.gn`: narrowly separated browser, renderer, utility, resources and test targets. Keep dependency direction explicit; do not create a browser-view/header cycle.
- `src/blanc/browser/`: Island host, native command bridge, Spaces/recovery and profile-owned services.
- `src/blanc/renderer/` and `src/blanc/services/blocker/`: document-start agent, Mojo interfaces and sandboxed engine service.
- `src/blanc/resources/`: copied first-party UI and licensed bundled material with existing notices preserved.
- `src/blanc/chromium_src/`: exceptional whole-file wrappers only where symbol visibility, GN selection and include ordering are demonstrated. No global macro-based behavioral rewriting as a default.
- `src/blanc/patches/`: small ordered integration patches, one purpose per patch; manifest records upstream revision, affected paths, source hashes, owner, justification and regression suite.

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

No reduction has been applied or measured. Proposal for Decision 2: retain 49/120 initially, prioritize demonstrated removal over speculative extra headroom, and require owner approval for any change. Historical stop conditions remain historical and cannot be waived by this design.

## Fail-closed patch application contract

The future apply tool operates only on the pinned clean source/dependency revisions. Validate the complete manifest and before-image hashes before any mutation; reject dirty upstream files, changed DEPS, missing dependencies, duplicate paths, unexpected binaries and wrong patch order. Preflight the full series in a disposable index/worktree before touching the intended checkout. Apply without three-way merge, whitespace repair, fuzz or automatic conflict resolution. Verify exact after-image hashes, then run the existing inventory. A context offset or otherwise different base must fail the before-image check even if Git could apply it. On failure preserve diagnostics and leave the production checkout untouched. Idempotent reruns accept only the exact manifest after-state. This is a specification, not an implemented apply tool.

## CI reporting design

Every PR should run a lightweight manifest/source-policy check and report the intended upstream paths, direct delta, override delta and missing evidence. A dedicated trusted runner with the pinned Chromium checkout runs the authoritative existing counter after applying the series. Upload signed/hashed inventory evidence tied to the PR SHA, Chromium SHA, resolved dependency pins and tool version. A missing checkout or refused dependency audit is **unverified**, never a zero count or successful budget check. Fail the budget check above 49/120; report approaching limits without changing the limit. Avoid giving untrusted PR scripts credentials or a writable shared developer checkout.

The hosted PR suite currently does not constitute this authoritative Chromium inventory job. Wiring the manifest/apply tool and runner is implementation after Decision 2. Design review remains open; this artifact does not close the runtime, visual, VoiceOver, cost, latency or extension-upgrade gates.

## Current path ledger

| Upstream path | Hunks |
| --- | ---: |
| `chrome/app/app-Info.plist` | 1 |
| `chrome/app/theme/chromium/BRANDING` | 2 |
| `chrome/app/theme/chromium/mac/Assets.car` | 1 |
| `chrome/app/theme/chromium/mac/app.icns` | 1 |
| `chrome/browser/BUILD.gn` | 1 |
| `chrome/browser/app_controller_mac.mm` | 1 |
| `chrome/browser/chrome_content_browser_client.cc` | 4 |
| `chrome/browser/chrome_content_browser_client_receiver_bindings.cc` | 2 |
| `chrome/browser/extensions/component_extensions_allowlist/allowlist.cc` | 2 |
| `chrome/browser/extensions/component_loader.cc` | 1 |
| `chrome/browser/search/search.cc` | 2 |
| `chrome/browser/sessions/session_restore.cc` | 3 |
| `chrome/browser/sessions/session_service_base.cc` | 4 |
| `chrome/browser/sessions/session_service_base.h` | 1 |
| `chrome/browser/ui/browser_command_controller.cc` | 2 |
| `chrome/browser/ui/browser_commands.cc` | 6 |
| `chrome/browser/ui/browser_live_tab_context.cc` | 4 |
| `chrome/browser/ui/views/extensions/extensions_toolbar_button.cc` | 7 |
| `chrome/browser/ui/views/extensions/extensions_toolbar_button.h` | 1 |
| `chrome/browser/ui/views/extensions/extensions_toolbar_desktop.cc` | 6 |
| `chrome/browser/ui/views/frame/BUILD.gn` | 3 |
| `chrome/browser/ui/views/frame/browser_frame_view_mac.mm` | 2 |
| `chrome/browser/ui/views/frame/browser_native_widget_mac.mm` | 2 |
| `chrome/browser/ui/views/frame/browser_view.cc` | 10 |
| `chrome/browser/ui/views/frame/layout/browser_view_tabbed_layout_impl.cc` | 4 |
| `chrome/browser/ui/webui/chrome_web_ui_configs.cc` | 2 |
| `chrome/browser/ui/window_feature_controller/window_feature_controller.cc` | 3 |
| `chrome/renderer/BUILD.gn` | 1 |
| `chrome/renderer/chrome_content_renderer_client.cc` | 3 |
| `chrome/utility/BUILD.gn` | 1 |
| `chrome/utility/services.cc` | 3 |
| `components/remote_cocoa/app_shim/browser_native_widget_window_mac.mm` | 2 |
| `components/sessions/core/command_storage_backend.cc` | 1 |
| `components/sessions/core/command_storage_backend.h` | 1 |
| `components/sessions/core/command_storage_manager.cc` | 1 |
| `components/sessions/core/command_storage_manager.h` | 2 |
| `components/sessions/core/tab_restore_service_impl.cc` | 3 |
| `content/browser/renderer_host/render_frame_host_impl.cc` | 2 |
| `content/browser/service_worker/service_worker_update_checker.cc` | 2 |
| `content/public/browser/BUILD.gn` | 1 |
| `extensions/browser/api/execute_code_function.cc` | 3 |
| `extensions/browser/script_executor.cc` | 5 |
| `extensions/browser/script_executor.h` | 2 |
| `extensions/common/api/extension_types.json` | 1 |
| `extensions/common/mojom/frame.mojom` | 1 |
| `extensions/renderer/programmatic_script_injector.cc` | 1 |
| `extensions/renderer/script_injection.cc` | 1 |
| `ui/webui/resources/tools/eslint/BUILD.gn` | 1 |
| `ui/webui/resources/tools/eslint/tsconfig_base.json` | 1 |
