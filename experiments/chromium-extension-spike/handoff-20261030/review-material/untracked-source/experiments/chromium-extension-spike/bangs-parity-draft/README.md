# Bangs state substrate — unintegrated

Shipping reference v1.45.1, commit `85883b1afa11375e1300130914d6f40c5388af21`. `shipping/` retains exact released resolver, parser, catalog, settings, custom-template and site-security sources; `result.json` checks every byte against that commit. `generate-normalizers.cjs` extracts the unchanged released custom and recent normalizers from the pinned settings source and checks source/output hashes on regeneration.

`bang-state.js` is a pure state-transition adapter around those released functions. It normalizes the snapshot, resolves using the shipping resolver, derives the next local recents for a regular navigation and leaves recents unchanged for private navigation. It also exposes whether input is bang-shaped for the future suggestion boundary. Six focused Node tests passed: aliases and encoding, private recents, disabled/unknown input, custom shadowing and template validation, empty-query targets, and limits/malformed inputs. `test.log` and `result.json` bind the exact sources and result. These tests are new state-adapter checks, not end-to-end or shipping-runtime tests.

Nothing loads this module in the development browser. It has no native profile storage, sync, tab ownership, window lifecycle, trusted privacy determination, actual navigation, UI Settings, change broadcast or history-clearing integration. The `isPrivate` argument is not an authority boundary. A future native owner must derive privacy from the actual tab, re-resolve against current owned settings at dispatch, atomically commit regular recents, never commit private recents, validate template and resolved URL, and enforce suggestion privacy at the native boundary. Do not wire renderer-supplied privacy or state as authority. The exact released model and its CommonJS dependencies also need a reviewed browser-process execution or equivalent native implementation; Node execution alone does not establish that architecture. Reuse the released UI and catalog only after the state, synchronization and lifecycle contract is implemented and verified. There is no product parity credit yet.


## Native request-lifecycle draft — 2026-10-30

`native/dispatch_guard.h` and `.cc` provide a single-sequence gate for future asynchronous resolution. The native owner must issue nonzero, lifetime-unique identities and a settings revision, derive privacy from the real tab, and reconstruct all of them on completion. A new request supersedes an older request for that tab; changes in window, profile, tab, document, revision or privacy reject the old result. Only an accepted regular resolution is classified for possible recents; private and unresolved results are distinct. Close, tab cancellation and shutdown discard pending records. The draft's 32-pending ceiling is conservative and needs product/operational review.

`native/dispatch_guard_result.json` records a passing standalone C++ test for those lifecycle transitions, bounds and shutdown. It uses synthetic values: it does not establish actual Chromium ownership, thread use, URL safety, real-tab lifetime, recents persistence or browser behavior. The pinned linker emitted the recorded missing-libLTO warning. Any owner must perform the final context and URL recheck immediately before use and again after asynchronous work; a stale browser/profile/tab or private result must never write recents. No native integration or parity credit exists yet.


## Native syntax and resolver draft — 2026-10-30

`native/bang_syntax.cc` implements the released UTF-16 token, ECMAScript whitespace and URI-query encoding behavior, including explicit failure for unpaired surrogates when URI encoding is required. `bang-syntax-oracle-result.json` compares 24,051 generated cases against the exact released JavaScript with zero mismatches. `native/bang_resolver.cc` adds custom-code precedence, catalog alias lookup, disabled/unknown behavior and empty-query home routing. Its standalone test passes, and `bang-resolver-oracle-result.json` compares 8,016 cases using the full 10,624-entry released catalog and synthetic custom entries against shipping JavaScript with zero mismatches. These are real compiled C++ calculations, not a native browser integration. The linker reported the existing missing-libLTO warning.

`native/catalog.json` is a deterministic conversion of the hash-verified released catalog and popular codes; `catalog-result.json` records its digest and 10,624 entries. A future native loader must verify provenance, validate schema and size, preserve ordering and duplicate precedence, and derive custom home/URLs from independently validated current native settings. The resolver expects those validated inputs; it does not parse or verify a URL, decide the target tab/privacy, persist settings/recents, provide synchronization or perform navigation. It currently uses a linear lookup and has not been qualified for production responsiveness. Unicode, catalog and custom tests do not prove real browser, settings, security, visual or platform parity. No code or asset is wired into the development browser.


## Pinned native catalog loader — 2026-10-30

`native/bang_catalog.cc` accepts only the exact SHA-256-pinned v1.45.1 converted catalog (at most 2 MiB), parses it using Chromium's RFC JSON reader, validates its schema, field sizes, codes, alias counts, encoding flags and expected entry/popular counts, and retains release ordering. The caller must cap file reads before allocation and obtain the asset from a trusted source. A release change requires regenerating and reviewing the pinned digest. The loader currently validates but does not retain the catalog domain field; the shipped picker still needs its exact domain data when the native/UI bridge is designed.

`catalog-syntax-result.json` records a passing syntax-only compile against the actual Chromium 158 headers and pinned flags, without linking. `bang_catalog_test.cc` prepares a real Chromium base/crypto test for the released catalog, `!youtube` resolution, tampering, trailing-data and size rejection; `catalog-test-syntax-result.json` confirms syntax only. The real test is not linked or run, so neither actual JSON/crypto behavior nor catalog acceptance is established. Loading, process ownership, URL validation, user settings, navigation and UI remain unintegrated.


The current catalog loader supersedes the prior version: `bang_catalog.cc` SHA `263626e1b7534488f851d2d5ef3f6cf9b5c7531eff28b4cc70eb13937052b6bf` now retains the released domain field in each resolver entry for the picker; `catalog-syntax-v2-result.json` records a passing Chromium-header syntax check. The prepared actual catalog test includes a domain assertion and explicit failure returns, so release builds with `NDEBUG` do not silently remove its checks. The first revised test syntax attempt failed because an `assert`-only variable became unused under those flags; the failure is retained, and `catalog-test-syntax-v3-result.json` passes after replacing all standard assertions. The real base/crypto test is still unlinked and unrun.

Because the native entry structure changed, the standalone resolver was rebuilt and its 8,016-case released-catalog comparison rerun successfully (`bang-resolver-oracle-v2-result.json`). This confirms the prior calculated resolution behavior for the changed structure; it does not test the loader or product integration.


## Custom Bang normalization candidate — 2026-10-30

`native/bang_custom.cc` proposes the release's 100-entry, first-code-wins normalization and native GURL template validation: ECMAScript whitespace trimming, code/name limits, one lowercase `%s`, credential and hostname-placeholder rejection, HTTPS or the shipping local-network HTTP exception, and home/domain derivation. Inputs are typed UTF-16; a native IPC and sync owner must preserve lone surrogates and validate types rather than silently replace data.

The candidate and its explicit-return test pass syntax-only compilation against Chromium 158 headers (`custom-syntax-result.json`, `custom-test-syntax-result.json`). `custom-reference-result.json` records exact release-JS outcomes for ten hand-selected valid and invalid examples. **The GURL/native implementation has not been linked, run or compared to those outcomes.** WHATWG versus GURL behavior, IPv4/IPv6 edge cases, arbitrary Unicode, spoofing, private settings, JSON/IPC round-tripping, full shipping unit cases and actual browser behavior remain open. This draft is not an authorization or URL-security boundary until real differential and browser tests pass; no product integration or parity credit.


## Real Chromium API tests — 2026-10-30

The previously unrun native tests now execute as standalone binaries linked to the preserved Chromium 158 output, its existing cached libraries and matching durable SDK 27.0. They do not use or modify the active SDK 27.2 build output. `Chromium Preview/evidence/bangs-real-chromium-api-20261030/v1-result.json` records a passing custom-normalization test against real GURL and IP code; `native/bang-custom-oracle-result.json` compares 3,032 custom inputs with the exact released JavaScript running under Node 20, with zero mismatches, using the preserved Chromium GURL/IP/ICU implementation. Cases include custom code/name limits, placeholders, credentials, local and public hosts, IPv4/IPv6, international domains and surrogate inputs. This is finite fixture evidence, not proof of all WHATWG/GURL behavior or real Electron runtime parity.

The first catalog link (`v3-result.json`) failed because the cached crypto hash object was absent from the link closure; that failure remains recorded. Adding the existing frozen `hash.o` allowed `v4-result.json` to compile, link and run the explicit-return catalog test: the exact pinned catalog loads with Chromium JSON and SHA-256, preserves the YouTube domain, resolves an alias, and rejects empty, mutated, appended and oversized input. These checks do not exercise browser integration, profile storage, trusted assets, UI, sync, private ownership or current-build toolchain identity. No product parity credit.


## Profile preference substrate — 2026-10-30

`native/bang_prefs.cc` uses Chromium `PrefService` primitives for enabled-by-default state, normalized custom Bangs and a ten-entry, deduplicated local recent list. Custom names and templates are persisted as UTF-16 code-unit arrays in this draft's private pref schema, preserving lone surrogates rather than replacing them. The code rejects managed writes and private recents updates; successful setters report in-memory acceptance, not a disk-write receipt. Corrupt unit values are dropped, and a corrupt list over 1,000 rows fails closed. That protective limit and the private-history clear behavior need product compatibility review.

`native/bang_profile.cc` is a syntax-checked browser-profile adapter intended to derive the real original profile and off-the-record status, reject guest/system/secondary contexts, and prevent private recent writes. It has not been linked or exercised with real Profile objects and is not an authorization boundary for WebUI or tab ownership. Preference registration, observers, actual browser ownership, navigation, UI, sync and history integration are not wired. This pref schema is not the shipping JSON schema; a lossless sync/migration bridge and real IPC surrogate handling are still required.

Standalone tests linked against the preserved Chromium 158 libraries and SDK 27.0: `Chromium Preview/evidence/bangs-real-chromium-api-20261030/v7-result.json` passes real in-memory PrefService defaults, custom normalization, UTF-16 units, regular/private recents, independent stores, managed-setting rejection and corrupt inputs. `v8-result.json` passes a real isolated JsonPrefStore write, close and reload with custom UTF-16 and recents, while a private recent is not written; the synthetic fixture is retained. An intermediate v6 wrapper failed before compilation because it referenced a nonexistent earlier receipt; v7 corrected it. These do not prove disk-error reporting, actual Chromium profile/private lifecycle, sync or product behavior, and do not use the active build output.


## Browser profile registration hook — 2026-10-30

`integration/register-prefs.mjs` stages a conditional native profile-preference registration into the real Chromium `browser_prefs.cc`; its test against the current source passed anchor, idempotence, drift, partial and duplicate-registration checks. It has not been applied, linked or built. The matching header must be placed and included in the correct GN target with its dependencies before use; the hook by itself provides no browser feature or parity credit. Native search integration must preserve the existing tab, frame, document and selection checks.


## Profile registration target correction — 2026-10-30

The earlier out-of-line registration hook crossed from Chromium's profile-prefs target into the browser-view UI target. The draft now puts keys and inline registration in `native/bang_pref_registration.h`, with staged source and GN changes in `integration/staged/`. The hooks pass actual source/target anchor, drift, duplicate and idempotence checks. Real frozen Chromium PrefService memory and disk/reload tests pass again (`v9-result.json`, `v11-result.json` under `Chromium Preview/evidence/bangs-real-chromium-api-20261030`). The first v10 wrapper failed before compiling because its generated model path was wrong; the failure is retained and v11 corrects it. This staging has not been applied or GN-checked, and browser navigation, real Profile/OTR, UI and sync remain unverified.


## Native navigation decision — 2026-10-30

`native/bang_navigation.cc` resolves a supplied validated catalog and profile snapshot into search, Bang, unavailable or invalid. It suppresses suggestions for all Bang-shaped text, requires an HTTP(S) GURL for navigation, and fails closed for missing data on a Bang-shaped request. The real frozen Chromium GURL standalone test `Chromium Preview/evidence/bangs-real-chromium-api-20261030/v12-result.json` covers aliases, custom precedence, disabled/unknown, missing data, invalid UTF-16 and unsafe schemes. The result wrapper incorrectly says three units; it compiled four, as its array records and `v12-scope-correction.txt` clarifies. No browser dispatch, catalog loading, profile authority, navigation, recents, settings or suggestions are connected.


## Asynchronous catalog service — 2026-10-30

`native/bang_catalog_service.cc` provides a sequence-bound, weak-reply ThreadPool loader for a fixed catalog filename under a caller-trusted root. It bounds the file read and calls the pinned digest/schema parser. The standalone real Chromium test (`Chromium Preview/evidence/bangs-real-chromium-api-20261030/v14-result.json`) covers a valid catalog, corrupt input, duplicate start and owner destruction before reply. v13 failed to compile its test due incompatible capturing `BindOnce` lambdas and a missing `DoNothing` declaration; this failure remains recorded. Browser asset packaging, real owner lifetime and current build integration are outstanding.


## Staged browser search-handler integration — 2026-10-30

`integration/stage-browser.mjs` stages catalog startup, real tab profile settings and native Bang resolution within the existing search path; `stage-frame-gn.mjs` stages the source list and candidate direct dependencies. `integration/staged/browser-manifest.json` binds the actual source and staged hashes. The source-based check tests drift rejection and order of existing active-tab/document revalidation before navigation and recent recording. An initial stage attempt rejected a non-unique RegisterMessages anchor; it was narrowed to the concrete handler class. Nothing has been applied, GN-checked, compiled or exercised in a browser. Packaging, target/header ownership, privacy and lifecycle, settings, sync, picker, suggestions, and full UI remain open.


## Browser syntax and asset overlay — 2026-10-30

The staged browser source passes syntax-only compilation with the actual guarded SDK27.2 flags and a durable include overlay (`Chromium Preview/evidence/bangs-browser-syntax-20261030/v2-result.json`). The first attempt v1 could not find an existing relative module source from the staged directory; v2 added the original UI include directory. The exact digest-pinned catalog is staged in `integration/staged/assets-overlay/`; it has not been packaged into a full candidate. The frame GN draft now includes Bang headers as sources; GN ownership, linking and real browser behavior are not verified.


## Complete asset candidate — 2026-10-30

`integration/staged/assets-candidate` is a separate, unpromoted copy of the open development browser's v6 assets plus `blanc-bangs-catalog.json`. The 78-file input matched its dev-receipt manifest and had no symlinks; the candidate copies matched all 78 hashes and added only the pinned catalog. `assets-candidate-manifest.json` inventories 79 files. No browser behavior or product parity is established by this packaging check.


## Bang state bridge and search routing — 2026-10-30

The v6 development host used the legacy Google-only `navigate` route, bypassing the staged native `searchTab` integration. The separate v3 asset candidate preserves v6 Find handling while staging selected-search host routing and a read-only Bang-state decoder; only host.js differs from v2. Isolated JS checks verify Bang-shaped text reaches `searchTab` with tab/document/epoch, stale tabs reject, and UTF-16 unit arrays retain lone surrogates while malformed values reject. The paired native source `blanc_prototype_ui-state-v2.cc` passes SDK27.2 syntax-only v3. This is unpromoted: the selected-search path lacks outbound-isolation qualification and real browser/profile/privacy tests, and settings changes and notifications remain absent. See `Chromium Preview/evidence/search-isolation-handoff-20261029/OFFLINE-ENVIRONMENT-PLAN.md`.


## Picker source and recent refresh — 2026-10-30

The candidate Bang JS, catalog and hint/picker source block match the v1.45.1 shipping source; this is not visual or runtime proof. Candidate v4 stages refresh and `onBangsChanged` after search requests, with an epoch that suppresses stale responses. Isolated JS checks pass the refresh and out-of-order cases. Settings, sync and history broadcasts, selected-search outbound-isolation qualification and real browser/privacy checks are still missing; candidate remains unpromoted.


## Staged observer and /clear integration — 2026-10-30

The native v3 candidate registers pref change observers only after a trusted Island state request, removes them when JavaScript is disallowed, and invalidates the host on change. The v5 host refreshes Bang state. The draft also clears Bang recents when the Island's existing regular-window history-clear path is accepted. Static order/guard checks and SDK27.2 syntax-only compilation pass. The host staging generator initially failed its idempotence test; that is corrected. Browser observer lifetime, multiwindow, privacy, actual `/clear` persistence and browser history-manager clear, icons, settings/sync, GN/link and outbound-isolation qualification remain untested.


## Custom-settings mutations — 2026-10-30

`native/bang_mutation.cc` implements re-read-before-write add/remove operations on PrefService with release-derived validation, duplicate and count limits, and managed-write rejection. A standalone test against frozen Chromium APIs passes (`Chromium Preview/evidence/bangs-real-chromium-api-20261030/v15-result.json`). The result reports an in-memory accepted change only; it does not establish a disk receipt, profile authority, Settings UI or sync behavior.


## Staged Settings page — 2026-10-30

The v6 asset candidate adds an English-only Bangs Settings page with an enable switch, custom add/remove, duplicate and built-in replacement messages, Enter submission and focus recovery. Its native bridge accepts only the exact top-level page and derives the original regular profile through the existing adapter. A fake-DOM interaction test passes; staged native source with the fixed handler passes SDK27.2 syntax-only v6. V5 failed the Chromium style check on inline virtual methods and is preserved. The prior v4 syntax include overlay was inadvertently overwritten while preparing v5, then reconstructed and verified against all v4 header hashes; failed v5 overlay is preserved. The page is not yet built or browser-tested, and localization, sync, privacy/accessibility and durable-write evidence remain open. Selected-search outbound isolation remains unqualified.


## Partial Settings localization — 2026-10-30

Candidate v7 uses selected exact shipping v1.45.1 translations in six locales for Bang settings controls. Fake-DOM tests cover interaction and French selection. Prototype-only text and some errors remain English; it follows system/navigator locale rather than the shipping selected language. The sync explanation remains honest rather than claiming unimplemented sync. No real browser, accessibility or full localization parity is established.


## Selected-language staging — 2026-10-30

Settings candidate v3 reads the separately staged device-wide interface language when registered, otherwise uses system language; fake-DOM tests pass explicit selection and fallback. SDK27.2 syntax-only v8 passes. The language registration/backend itself is unbuilt, and this independent process freeze must be reconciled with the shared interface-language implementation before promotion. Some prototype-only copy remains English and no browser/language/restart parity is established.


## Shared language composition — 2026-10-30

Candidate v9 composes the existing staged shared interface-language freeze and asset injection with Bang Settings, replacing the prior independent freeze. It stages the device-language pref registration and released locale bundles. Pin/system/fallback JS checks and SDK27.2 syntax-only v9 pass. Selection UI and persistence/restart, actual cross-surface language behavior, GN/link and browser tests remain open; candidate is unpromoted.


## Custom mutation disk round trip — 2026-10-30

A new isolated real Chromium JsonPrefStore test (`Chromium Preview/evidence/bangs-real-chromium-api-20261030/v16-result.json`) passed sequential add, remove, duplicate rejection and two reloads while preserving a lone UTF-16 surrogate. It proves only successful fixture writes; the Settings handler does not yet confirm failure or durable write completion, and real profile/OTR, browser UI and sync remain unverified.


## Settings disk readback candidate — 2026-10-30

The native Settings draft now waits for the pref write barrier and checks the expected key against the bounded Preferences file and current in-memory value before reporting success. The isolated real Chromium helper test v17 passes match, mismatch, malformed and missing files; this is value readback, not fsync proof. SDK27.2 syntax-only v11 passes after v10 exposed missing out-of-line constructor/destructor; the rejected-post request ID was also corrected. Actual browser I/O failures, cross-window writes, teardown, Profile/OTR, sync and linking remain untested.


## Combined Settings hub and language backend — 2026-10-30

Candidate v10 combines the previously staged interface-language native backend, Settings controls and capability-gated hub routing with Bangs, retaining an explicit Chromium Settings link. Five adapted mock routing checks and SDK27.2 syntax-only v14 pass. The first syntax attempt v12 failed for a trivially destructible `NoDestructor` and inline complex constructor/destructor; v13 corrected both. The staged native backend also reports unconfirmed when a readback task cannot be posted. No real browser/backend, persistence, restart/veto, accessibility, GN/link or selected-search isolation proof is established.


## Synthetic Chromium Settings interaction — 2026-10-30

A separate headless Chromium fixture loaded the staged Settings page on loopback with a mocked native bridge. The result `Chromium Preview/evidence/bangs-settings-ui-20261030/result-v2.json` passes French label selection, switch, Enter submission, duplicate alert/draft retention, remove and focus. The screenshot confirms a basic layout and remaining mixed-language copy. The isolated context exited and its owned profile was removed. The initial v1 sandbox run failed before profile creation because loopback listen was denied; v2 used approved escalation. This is not a native bridge, disk, private-profile, selected-search isolation or full a11y/visual parity test.


## Prototype translations and narrow view — 2026-10-30

Candidate v11 adds six-locale draft translations for the prototype-specific explanation, sync limitation and several errors. They are new and unreviewed, not released copy. Fake-DOM tests and a separate 390px headless Chromium loopback UI check pass with a mocked native bridge; screenshot and result are in `Chromium Preview/evidence/bangs-settings-ui-20261030/`. Real WebUI, profile/private, storage, language restart, complete accessibility and visual parity remain open.


## Integration input inventory — 2026-10-30

All ten native implementation units pass separate SDK27.2 syntax-only checks; `integration/staged/application-manifest-v1.json` identifies 27 proposed source inputs/additions and the v11 assets with hashes. No source was applied. A `gn desc` attempt could not be treated as read-only: GN tried writing `gn_logs.txt` in the active output, and the sandbox denied it. GN ownership, linking, outbound isolation and runtime behavior are not verified.


## Pending Settings mutations — 2026-10-30

Candidate v12 prevents overlapping form/toggle/removal mutations, exposes busy state and preserves the draft after an unconfirmed save. Five focused fake-DOM checks and a separate real Chromium loopback UI test with mocked bridge pass, including delayed save and rejection. This is not a native I/O failure, cross-window, actual privacy or full accessibility test. `application-manifest-v2.json` binds the staged source to v12 assets; no application or promotion occurred.


## Bang icon policy draft — 2026-10-30

`icons/icon_policy.cc` stages the shipping eligibility and retry rules. A 640-case differential against exact released JS and SDK27.2 syntax pass; initial syntax failed Chromium style/raw-reference checks and was corrected. This is not an icon feature: actual queue, network, storage, sanitizer, private-profile authority and UI are absent, and the cap constants do not enforce limits.


## Bang icon queue draft — 2026-10-30

A standalone queue stages the shipping 40-host request limit and four-active limit, deduplication, retry policy and generation checks. It additionally revalidates private/custom eligibility at dispatch. Focused native and SDK27.2 syntax checks pass. No network, in-flight cancellation, storage, sanitizer, real profile authority or UI is implemented; stricter dispatch behavior needs review.


## Bang icon store model — 2026-10-30

A standalone bounded in-memory record model implements shipping-style ordering, a 300-record cap, private-write rejection and the released canonical data-URL/header check. Tests use real Chromium base64 but synthetic header-only bytes. This predicate is not an image sanitizer; real decoding/re-encoding, durable storage, network, profile authority, clear integration and UI are absent.


## PNG admission and sanitizer draft — 2026-10-30

PNG input-size/header and dimension admission matches 486 released-JS cases. The staged sanitizer requests Chromium's isolated decoder and produces a bounded 32px PNG; SDK27.2 syntax passes, but the decoder and output have not been executed. It supports PNG only, while shipping supports additional types. Real image, sandbox, lifetime, network and browser checks remain open.

## Bang icon ICO admission and decoder draft — 2026-10-30

Staged `icons/icon_ico_bounds.cc` SHA `8aaa6d0f6de812213edf56dce230fe99293ced24bc7821465b1277c3a96f6ac4` validates bounded ICO containers before isolated decode. `icons/icon_sanitizer.cc` SHA `35267e36d046f7bd721eaba2c12448cf2c89bd789a4ccfa745ada2f478143145` adds an ICO entry point using the existing isolated decoder and 32px PNG output draft. Focused comparison against exact saved shipping `validSourceIcoBytes` passed 2,510 generated cases (mostly malformed inputs), zero mismatches: `icons/icon-ico-oracle-result.json` SHA `9493328978d940a27767c8513cb6a7ead59b65a708f60e52c8711e6087649e28`. Both changed units pass SDK27.2 syntax-only: `evidence/bangs-browser-syntax-20261030/icon-sanitizer-v2-result.json`.

This is unintegrated draft code: neither ICO nor PNG decoding has executed, and actual pixel output, multiframe selection, utility sandbox, lifetime/cancellation, transport, privacy and browser UI remain unverified. Chromium's `max_size_in_bytes` is enforced on the decoded bitmap before Mojo transfer, not as a 16 MiB decode-allocation limit; the decoder uses its platform image limit, so do not claim a 16 MiB decoding cap. Shipping's image-labelled ICO path is broader than this container precheck and SVG/GIF and other image formats are still missing; no feature parity credit or promotion. Search outbound isolation remains unqualified. Latest observed build log 26706/59759 at 1h26m13s; process enumeration was sandbox-denied this turn, and the separate monitor owns post-build guard and zoom checks. Electron paused, Google baseline separate, latency deferred. Tracker 0/57 fully verified, 24 partial, 13 known gaps, 20 unassessed.


## Bang icon transparent ICO and transfer-bound fix — 2026-10-30

Against exact release v1.45.1 source `85883b1afa11375e1300130914d6f40c5388af21`, saved `icons/shipping-favicon-sanitizer.js` SHA `8987dc3c0d9f7d070044cce221866cb7d02a0ab2ca89849aca47f03f4b0e6998` and `shipping-icon-raster.js` SHA `84c3069e48f26e8b9a7c4b252cedd69e1a05a4aec047ca89c978123044b1c9e9`. Shipping's non-PNG canvas path rejects a fully transparent result, whereas the staged ICO sanitizer accepted one. `icons/icon_sanitizer.cc` SHA `9d719fd454ca11ad62ca387b867292330cd5b4d441a53093a42e908012722677` now checks the resized ICO pixels for nonzero alpha; PNG keeps the separate shipping native-image behavior. Its bitmap transfer ceiling now includes 4096 bytes of serialization allowance above 16 MiB, avoiding an automatic rejection solely due to envelope overhead at the admitted 4M-pixel limit. SDK27.2 syntax-only `evidence/bangs-browser-syntax-20261030/icon-sanitizer-v3-result.json` passes.

This remains unintegrated and unexecuted: the alpha path, transfer boundary, actual decoder, image selection, utility sandbox and browser behavior need real tests. The ceiling limits Mojo transfer after decoding, not peak decode allocation; actual row stride may still lead to rejection. SVG/GIF and other formats, transport, profile/privacy ownership and icon UI remain open. No parity credit or promotion. Actual wrapper PID26367 and Siso PID26452 were confirmed live; latest log 27055/59711 at 1h27m40s. Monitor owns post-build guard and zoom checks. Selected-search isolation unqualified. Electron paused, Google baseline separate, latency deferred. Tracker 0/57 fully verified, 24 partial, 13 known gaps, 20 unassessed.


## Bang Settings profile-wide pending-write guard — 2026-10-30

The v3 staged Settings handler only excluded concurrent mutations within one WebUI handler, allowing a second window on the same original profile to change the value while the first write was being confirmed. New `native/bang_write_gate.h` SHA `d0feef9c44b120070ec029c2a19f1eb59f62bea40de9928f1cbbe112917a8e70` and `integration/staged/bang_settings_handler-disk-v4.inc` SHA `4ceaded858c9cdcd789460d462765253bcb0340946656782e1672ed195f15da3` stage a process-wide, exact native-profile-path lease held across the write barrier and disk readback, including if its original view is closed. Different profile keys remain independent; lock-protected lease release is safe if a callback is discarded on another thread. Changes are composed in `blanc_prototype_ui-hub-v11.cc` SHA `de58173d1992a67ed45c139a07a016eb2c1cc96bef822c8d1af500b27c33e5c7`, frame v4 and `application-manifest-v3.json` SHA `9d73d483fd184544614062f546fa09e2e79f06670bd665bbe109447c2c83f070` (28 entries). Inputs remain unapplied, not authorization to modify active build.

Standalone focused native gate test `native/bang-write-gate-v2-result.json` passes separate keys, held callback copies, release, and four-thread contention. Browser source SDK27.2 syntax v15 initially failed Chromium style for inline complex constructors/destructors; retained `evidence/bangs-browser-syntax-20261030/v15.log`. After moving template definitions out of class and using native `base::FilePath` keys, v16 syntax passes; `v16-include-identities.json` records exact include inputs because v16's generic receipt names the older overlay. No real multiwindow/Profile lifecycle, actual disk failure, outside-writer coordination, restart, GN/link or browser behavior was tested, so no product parity credit. Selected-search isolation remains unqualified. Wrapper PID26367 and Siso PID26452 verified live; latest log 27494/59659 at 1h29m09s. Monitor owns completion, guard and zoom checks. Electron paused, Google baseline separate, latency deferred. Tracker 0/57 fully verified, 24 partial, 13 known gaps, 20 unassessed.


## Bang Settings lease with real Chromium preference write — 2026-10-30

`native/bang_write_gate_disk_test.cc` SHA `e95b8fa9dde419f813786e15a2ce8c8b6e17e2abbd5940b1ea3be3b4aca6d059` exercises the staged profile-keyed lease with the actual frozen Chromium JsonPrefStore: a callback retains the lease after simulated view closure; another same-key writer is excluded; committed value is read back from an isolated Preferences file; the lease releases; a second mutation is correctly unconfirmed before its flush and confirmed afterward. Compile/link/run passed using reused frozen Chromium objects and the matching SDK27.0, not the active build (`evidence/bangs-real-chromium-api-20261030/v19-result.json` SHA `07f48254b20e9223c9ae4b73cb0b113871512ee69f0ff4b868004a887b6bf08a`). Isolated fixture remains durable as evidence.

This is a synthetic owner and standalone PrefService, not an actual Profile, WebUI handler, two browser windows, disk failure, shutdown cancellation or full durability proof; unpromoted manifest v3 and selected-search isolation hold unchanged. The already checked asset-only refresh avoids the selected-search framework but development PID9492 remains open with exact full launch args; earlier auto-review rejected agent quit over session-loss risk, so user normal closure and a verified closed-profile backup are required for refresh. The approved build wrapper PID26367 and Siso PID26452 were confirmed live; log 27930/59575 at 1h30m15s. Monitor owns completion, zero-action guard and affected checks. Electron paused, Google baseline separate, latency deferred. Tracker 0/57 fully verified, 24 partial, 13 known gaps, 20 unassessed.


## Bang Settings isolated failed-write evidence — 2026-10-30

Focused `native/bang_write_gate_failure_test.cc` SHA `b1e8fafc0410bbbc96cb675509136a8678bc346d9ae79a8c1c72bcb25bb8aff4` first creates and confirms a synthetic Preferences baseline, then removes write permission on its own fixture directory before another mutation. Actual Chromium ImportantFileWriter logs a temporary-file creation failure, `Permission denied (13)`. After the normal write-barrier callback, the attempted value is not confirmed and the prior value remains readable; fixture permissions were restored. Compile/link/run passed against preserved frozen 158 cached objects with matching SDK27.0; raw `evidence/bangs-real-chromium-api-20261030/v20.log` and `v20-result.json` SHA `8ae6b3d53a3d4dd3374df5d53de1d2530fe5e6d8fe2208de14123c3cffc49ad2` retain evidence.

This is real filesystem denial and preference readback in a standalone synthetic PrefService, not actual browser Settings UI error handling, Profile lifecycle, cross-window, retry after failure, fsync or Windows/Linux proof. Memory still contains the mutation; the current design reports unconfirmed rather than rollback. No product integration or parity credit; candidate manifest v3 and selected-search isolation hold unchanged. Build wrapper PID26367/Siso PID26452 confirmed live; latest log 28094/59566 at 1h30m51s; separate monitor owns guard and affected tests. Electron paused, Google baseline separate, latency deferred. Tracker 0/57 fully verified, 24 partial, 13 known gaps, 20 unassessed.


## Bang Settings failed-save rollback and retry — 2026-10-30

A focused follow-up reproduced a user-visible recovery gap in standalone Chromium JsonPrefStore: after permission-denied save of a removal, retrying that removal returned `not-found` because the change remained in memory; a plain CommitPendingWrite did not reschedule the failed write (`evidence/bangs-real-chromium-api-20261030/v21.log`). New `native/bang_write_rollback.cc` SHA `9c306264042669214ca626c7e03c95b2a33ab57ffeaa45fac9d2b19ebdb70e51` and staged handler `bang_settings_handler-disk-v5.inc` SHA `9c9f4202debe039e0aa72e71a10dedb105641f5e60a64b1f8e1a9d63c27dcc31` retain the prior user preference and restore it after unconfirmed readback or task-post failure only if current value still equals the attempted value and remains user-modifiable. Reentrant observer destruction is weak-pointer guarded and the write lease remains held. They are composed in hub v12 and `application-manifest-v4.json` SHA `79fca91e8dbbcd4db401910039b2d4db4684f96b8e01147b3f04514f79ec399d` (30 entries); no active source/output changed.

Real isolated permission-denied write, conditional rollback, successful retry/readback, absent boolean user-pref restoration and changed-value refusal pass in `evidence/bangs-real-chromium-api-20261030/v24-result.json` SHA `a8386c8190753630fb501dc063d24774196bf03d373453d06cc310b78b5ef369`; v23 failed due fixture shutdown before a final pending write, preserved in v23.log, fixed by flushing in v24. SDK27.2 source syntax passes hub v17 and `bang-rollback-v1-result.json`; `v17-include-identities.json` records actual overlay inputs. This is still standalone PrefService evidence, not actual native handler, browser UI, multiwindow, managed-policy, outside writer, ABA, restart or cross-platform proof. Value equality cannot detect intervening A→B→A changes; rollback is in-memory and its eventual disk write is not guaranteed. Post-task failure and handler lifetime paths require actual browser tests. Selected-search isolation remains unqualified, candidate unapplied/unpromoted. Build wrapper PID26367/Siso PID26452 live, last log 28831/59476 at 1h32m53s; monitor owns completion/guard/affected tests. Electron paused, Google baseline separate, latency deferred. Tracker 0/57 fully verified, 24 partial, 13 known gaps, 20 unassessed.


## Bang Settings observed-change guard — 2026-10-30

The value-only failed-save rollback could overwrite a later in-process change if the value went A→B→A during confirmation. Staged `bang_settings_handler-disk-v6.inc` SHA `031539b637a62bc10f70c8d6fe21b0b408475a94ff475476ea8922b8b2874d19` counts observed preference notifications, refuses confirmation or rollback after any later observed change, and rejects ambiguous reentrant mutation with more than one notification. `native/bang_write_rollback.cc` SHA `5672457730575c070ed2976bd3852250fd7dac94929f04fe9b79fad58056d06c` also requires the original observed epoch. v5 source snapshots reconstructed with verified old SHA and preserved under `integration/staged/bang_write_rollback-v1-snapshot.*`; `application-manifest-v5.json` SHA `3b552b1457612b70882b278f3001ecd3335159c9e07eedf86ea01c6635f83098` replaces v4 and remains unapplied.

With real frozen Chromium PrefService and PrefChangeRegistrar, isolated test v25 passes the prior actual permission-denied rollback/retry cases plus an observed boolean A→B→A sequence that refuses rollback, and a same-epoch restoration (`evidence/bangs-real-chromium-api-20261030/v25-result.json` SHA `1adc4cd8f596762527b36919e8e0f589e89c481cfd716f3feac9de422ec34d95`). SDK27.2 syntax-only hub v18 and rollback v2 pass; overlay inputs in `v18-include-identities.json`. This does not prove actual WebUI handler observer lifecycle, direct concurrent outside-process changes, silent/no-notification changes, shutdown, managed policy, fsync, other platforms or the reentrant-handler branch. The epoch is per-handler, counts changes to either watched Bang preference, and cannot detect disk-only changes or unobserved writers. Candidate still unintegrated, search isolation held, no parity credit. Build wrapper PID26367/Siso PID26452 live; latest log 29157/59470 at 1h34m12s. Monitor owns guard and checks. Electron paused, Google baseline separate, latency deferred. Tracker 0/57 fully verified, 24 partial, 13 known gaps, 20 unassessed.
