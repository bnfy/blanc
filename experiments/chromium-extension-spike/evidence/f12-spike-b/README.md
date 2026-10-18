# Spike B: MV2/uBlock Origin source audit

October 17, 2026. Pinned Chromium 157.0.8103.6, pristine commit
`41520584daa68d0040db7746ae562a0ff82187f6`. Read-only source checkpoint;
no extension-system patch, uBO loading, native build or latency run performed.
Paths and lines below refer to this pin, not Chromium main.

## Findings

| Surface | Source | Finding / possible change |
| --- | --- | --- |
| Manifest parser | `extensions/common/extension.cc:60`, `:98` | Minimum supported manifest is still 2; ordinary MV2 parses. No parser restoration indicated. |
| Deprecation stages / switches | `extensions/browser/manifest_v2_handler.cc:111` | `ShouldDisableLegacyExtensions()` returns true unless the process-wide test override is set. This implementation has no staged feature or user flag branch. Old flag recipes cannot be inferred to work. |
| Installation and enablement | same file `:157`, `:171` | Affected extensions are blocked on installation/enablement. Changing this handler would modify extension-system behavior and needs assessment against Spike B's core-patch stop rule. |
| Startup and updates | same file `:196`, `:203`, `:255`, `:331` | Startup disables affected enabled extensions; re-enable logic checks the same gate, including installed/updated extension handling. Merely bypassing initial install is insufficient. |
| Test override | same file `:343` | `AllowMV2ExtensionsForTesting` requires the scoped test-enabler pass key. It is test infrastructure, not a supported production option. No test override was used. |
| Component exception | `extensions/browser/manifest_v2_util.cc:21`, `:38` | MV3 and non-extension types are excluded; component locations are explicitly unaffected. Policy-installed ordinary MV2 extensions are not exempted here. |
| Component admission | `chrome/browser/extensions/component_loader.cc:373` | Ordinary component addition checks the allowlist. `AddOrReplace` at `:389` bypasses it for developer testing. This is a potential separate packaging route to audit, not permission to grant uBO component privileges or claim normal extension support. |
| Enterprise policy | `components/policy/resources/templates/policy_definitions/Extensions/ExtensionManifestV2Availability.yaml:21` | Policy metadata is deprecated and supported only through 138. Its old description does not establish a functioning 157 exception. |
| Blocking API permission | `extensions/common/api/_permission_features.json:870` | MV2 extension/legacy-app blocking permission remains declared. The MV3 branch is policy-only. |
| Blocking listener enforcement | `extensions/browser/api/web_request/web_request_api.cc:574`, `:1397` | Blocking listener paths still check `kWebRequestBlocking`; no API removal established by this audit. Permission declaration alone is not runtime proof. |
| Store install status | `extensions/browser/api/webstore_private/extension_install_status.cc:170` | Store status checks the MV2 handler's installation gate. A component load would not prove Chrome Web Store distribution or updates. Server-side Store availability is outside this source audit. |
| Payload | `ublock/pinned.json`, `ublock/upstream/manifest.json:91`, `:107` in Blanc | Pinned uBO 1.75.0 uses manifest 2 and requests webRequestBlocking. Source/license/platform review remains required before adoption. |

## Decision and remaining audit work

Ordinary MV2 loading has a hard deprecation gate, while the parser and blocking
API remain. There is no evidence for a simple public flag or enterprise-policy
solution. Do not patch the deprecation handler or extension core as a routine
next step: that could trigger the approved Spike B stop condition.

The component exception means this checkpoint cannot yet conclude that every
packaged-provider route requires a core patch. Next trace component allowlisting,
privilege differences, background-page creation, update ownership, and the pinned
uBO package's API dependencies. Record whether a supported browser-owned provider
route is possible within scope; otherwise stop Spike B with the audit artifact.
An exhaustive gate inventory, runtime load, blocking/cosmetic parity, list-reload
hold, patch cost and runtime persistence are still pending. Spike B is in progress,
not passed or stopped. No production baseline or Decision 2 change follows.

## Component-loading follow-up — October 17, 2026

Source audit only; no component privilege was granted and no runtime load attempted.

| Gate / behavior | Pinned source | Consequence for packaged uBO |
| --- | --- | --- |
| Admission | `chrome/browser/extensions/component_extensions_allowlist/allowlist.cc:37`; `component_loader.cc:373-402` | uBO is not a built-in allowlisted component. Ordinary Add checks the ID. AddOrReplace explicitly skips the allowlist for developer testing; that bypass is not production acceptance. A product integration needs deliberate browser-owned admission, not an ordinary unpacked install. |
| Manifest identity | `component_loader.cc:644-659` | Component creation uses REQUIRE_KEY and kComponent. The pinned uBO manifest has no key. A generated packaged manifest/stable identity is required; the upstream payload must remain attributable and its modification recorded. No key or package generated here. |
| Privilege difference | `extensions/common/features/simple_feature.cc:764-790` | After type/blocklist checks, features with component-auto-grant become available before ordinary allowlist/location/version checks. Component loading is materially more privileged; it cannot stand in for ordinary MV2 compatibility. Audit and constrain this privilege before runtime adoption. |
| Background page | `extensions/browser/process_manager.cc:305-335`; `chrome/browser/extensions/chrome_process_manager_delegate.cc:66-103` | Background-page creation remains, subject to embedder/profile permission and shutdown checks. No additional Mac MV2-version rejection found in this path. uBO declares background.html; execution and startup readiness remain runtime questions. |
| Updates | `extensions/common/manifest.h:72-77`; `chrome/browser/extensions/updater/extension_updater.cc:422`; `extensions/browser/extension_registrar.cc:575-622` | kComponent is not an ordinary auto-updateable location. AddComponentExtension handles packaged version changes/browser reloads. Blanc would own payload delivery and persistence tests; Store updates are not proven or implied. |
| Payload permissions | `ublock/upstream/manifest.json:98-109` | alarms, contextMenus, privacy, storage, tabs, unlimitedStorage, webNavigation, webRequest, webRequestBlocking and all URLs. These require a runtime/API review, particularly component privileges and content-script behavior; declaration is not proof. |

The component exception is a technically distinct integration candidate, not a
restoration of ordinary MV2. This audit establishes the loading chain and its
privilege/update costs but does not establish that a production integration meets
the no-extension-core-patch constraint. No core patch is justified by the audit.
Next decision requires classifying a narrow browser-owned admission hook against
that constraint, plus privilege containment and the list-reload hold design before
runtime work. Spike B stays in progress; ordinary MV2's hard gate is unchanged.

## Admission and reload-hold assessment — October 17, 2026

A concrete candidate is browser-owned admission through ComponentLoader's public
Add(manifest, root) API (`component_loader.h:95`), a fixed packaged identity and a
narrow browser component allowlist entry. That would leave the MV2 deprecation
handler, manifest parser and extension event router unchanged. Those changes are
browser integration rather than demonstrated extension-core restoration; whether
they suffice is still unproven. Do not use AddOrReplace's testing bypass, a global
MV2 test override or a blanket component auto-grant change. No integration patch
or runtime load was made during this assessment.

The reload issue is concrete in the pinned payload: `js/storage.js:961-965` only
suspends when canSuspend() is true, then resets both engines. Chromium's packaged
`js/vapi-background.js:1378` returns false; suspendOneRequest/unsuspendAllRequests
at 1353-1355 are empty. Electron's `src/main/ublock-host-mainworld.js:59-74` wraps
loadFilterLists and signals the host before/after loading, holding decisions on
failure. Component status does not change that code. Merely loading uBO would
therefore not satisfy the reload gate.

An acceptable prototype design must authenticate readiness/reload messages to the
fixed packaged extension and background document, hold the regular-profile
browser request proxy before releasing traffic, and fail closed on timeout,
background loss or incomplete reload. Private traffic must keep Blanc Blocker.
It must also avoid deadlocking the extension's own pinned list acquisition and
prove that startup and concurrent reloads cannot outrun the hold. This is a design
requirement, not implemented protection. Feature auto-grants and API use still need
runtime inspection; allowlisting alone does not contain component privileges.

Assessment outcome: candidate integration identified, **runtime admission not yet
established**. Keep Spike B in progress. If it needs core gate/event-dispatch
patches or cannot meet the scoped fail-closed hold, apply the approved stop rule;
do not silently relax it. No production or baseline decision follows.

## Reload ordering and runtime experiment boundary — October 17, 2026

The hold must be acknowledged **before** the packaged loader calls the original
loadFilterLists and before storage.js resets the engines. An asynchronous
"reloading" notification emitted after reset is not sufficient: a browser request
could already pass the gate. A prototype wrapper must acquire a profile-scoped
generation/lease, wait for the browser acknowledgement, perform the load, then
release only that generation on success. Overlapping loads, stale acknowledgements,
background destruction and rejected promises must never release a newer hold.
Startup begins held before component admission; private requests stay on Blanc
Blocker and cannot release the regular-profile gate.

The minimum runtime experiment should use an immutable, hash-verified generated
copy of the pinned GPL payload, stable manifest key, ordinary browser allowlisting
and an ID/document/profile-bound readiness bridge. Do not edit the pinned upstream
copy, use developer AddOrReplace, or relax global MV2 gates. A generated preload
must install the wrapper before the first load; observing an already-running
background page is too late for startup proof. Pinned list acquisition must be
explicitly permitted without exempting arbitrary page traffic. Component feature
auto-grants remain a trust expansion; source integrity/review is not a sandbox or
proof of least privilege. No runtime experiment or bridge was implemented here.

This gives a testable design within browser-owned integration, but not proof that
it can be completed without extension-core edits. The next runtime checkpoint must
first inventory the actual admission/bridge patches against the fixed budget and
core-patch rule. Required failure probes: delayed startup, held reload with page
traffic, overlapping reloads, background crash, stale release, private-profile
isolation and restart. Passing a component load alone cannot close Spike B.
# Component admission follow-up

The later [bounded readiness/reload checkpoint](../f12-ubo-reload-20261017/README.md)
adds actual blocking smoke checks and a browser-authenticated cancellation hold,
including private-profile teardown and background-document loss. Full corpus
parity, broader failure/recovery and privilege containment remain open; the
earlier unproven-readiness statements below describe the admission-only stage.

The [offline admission checkpoint](../f12-component-admission-20261017/README.md)
now proves pinned uBO 1.75.0 background target, popup and runtime identity through
normal ComponentLoader::Add with a switch-gated fixed-ID allowlist. Earlier
"runtime unproven" notes below describe the source-audit checkpoint. Startup
readiness, blocking parity, authenticated reload hold and privilege containment
are still unproven; component admission alone closes none of those gates.

## Full synthetic network follow-up — October 17

[Full-corpus evidence](../f12-ubo-parity-20261017/README.md) now records two fresh
sessions per runtime, 5,123 candidates plus four controls, with zero uBO context,
decision or fixture-behavior differences. Automatic list updating is disabled in
both disposable profiles; the interrupted updater-hold run is retained. This
closes the bounded full-corpus network comparison, not cosmetics/scriptlets,
component containment or production lifecycle/recovery acceptance. Update-check
identity remains open even though unchanged and changed bytes behave correctly.


### Cosmetic checkpoint — October 17, 2026

See [evidence](../f12-ubo-cosmetics-20261017/README.md). Four fresh uBO sessions / eight normal+CSP pages match on static CSS,
`has-text` mutations and late constant/fetch scriptlets. First-inline constant
check fails in both runtimes on all eight pages; document-start acceptance stays
open. Initial favicon misses retained; final fixture explicitly serves them.
Eight same-URL/two-registration update sessions pass behavior; all 16 update
identities remain ambiguous gaps. No URL/order/timing join introduced.
138 focused tests and 73-file lint pass; guard schedules zero actions, zero native
compilations, no cold cost. Native footprint unchanged. Reports give session
brackets only; owner attention/agent time unmeasured. Latency deferred. Full
Spike A/B acceptance, Task 0 outcome and baseline promotion remain unchanged.


### Document-start / update-identity follow-up — October 17, 2026

See [evidence](../f12-scriptlet-start-20261017/README.md). Two four-session sets (with/without injection
observer), 48 loads across normal/CSP, first visit/reload/fresh navigation:
0 early constant and 0 immediate-fetch prevention passes; later getter/constant
succeed. Both gates remain open; no fixture delay or fabricated identity fix.
Pinned source shows update version omitted and full scope collapsed to origin
before factory interception. Correct fixes require pre-page-script registration
with generation/document binding, and an independent loader-registration join
in both runtimes. 142 tests / 77-file lint pass; archives independently verified.
Guard zero actions, no native compile/cold cost; footprint unchanged. Latency
deferred; owner attention/agent time unmeasured. Plan acceptance unchanged.


### Native document-start and update-loader implementation — October 17, 2026

See [evidence](../f12-document-gate-20261017/README.md). Chromium now passes
12/12 first-inline constant/getter and immediate-fetch checks across normal/CSP,
reload and fresh documents; Electron remains 0/12. Seven document/profile/filter
safety probes and ten prior reload/ownership checks plus unready startup pass.
Static/has-text/late-fetch regressions pass; early timing difference is explicitly
reported, not hidden as parity. Native-only loader tokens prove eight unchanged
same-URL collision checks and four changed-byte updates; Electron's independent
identity and cross-runtime acceptance remain gaps. Eight changed-byte sessions
retain controlled-fetch and failed-initial-loader proofs.

162 tests and 84-file lint pass. Four guarded incremental attempts: 55.62 s
stopped after an unexpectedly expanded header rebuild, 15.65 s compile failure,
13.26 s API-spelling failure, 43.98 s success / 10 steps; final guard zero actions.
128.51 s total invocation wall time is routine repair/build overhead, not cold
cost. Exact pristine header bytes and their recorded checkout metadata were
restored to avoid needless recompilation; proof is archived. No output, args or
toolchain reset. Footprint 31 files / 74 hunks (limit 40/120). Initial payload
import-order timeout is retained; final lazy initialization passes. All seven
archives independently verify and disposable profiles/keys were removed.

Main-frame guarantee only; synchronous gate/polling overhead remains unqualified.
Electron correction, subframes/opaque contexts, broader scriptlets/paths/lifecycle,
component containment and recovery remain open. Latency deferred; owner attention
and agent time unmeasured. Task 0 outcome/baseline and 156/permanent data unchanged.


### Subframe scriptlets and cross-runtime update tracing — October 17, 2026

See [evidence](../f12-subframe-trace-20261017/README.md). Native HTTP(S)
subframes use browser frame IDs/ancestor chains and uncached current-engine
selection: 16/16 first-inline constant/getter, ancestor and immediate-fetch cases
pass across same-origin, cross-origin, nested CSP, fresh navigation, exception
and changed/restored ancestor cases. Electron early 0/16; late 12/16 versus
Chromium 16/16. Shipping Electron remains unchanged. Main-frame 12/12 and seven
safety regressions pass on the new binary.

Eight same-URL collision sessions with native ServiceWorker tracing complete.
Eight native update joins pass; eight Electron identities remain gaps. Stock
checker constructor traces expose script URLs, not the independent registration,
checked-version or hook-token join needed to close the cross-runtime gate. No
URL/time/order or numeric trace-ID equivalence is inferred. First trace attempt
stopped on a two-second flush deadline and remains excluded; final ten-second
bounded flush requires actual completion. Old unit job fixtures were corrected
to carry the now-required frame ID/ancestors; 172 tests and 89-file lint pass.

One guarded incremental build: 37.57 s wrapper / 33.65 s Siso, eight steps, no
failure or cold output. Final guard zero actions, footprint unchanged 31/74.
All build wall time is routine tranche work, separate from Task 0 cold cost.
Owner attention/agent time not measured. Latency including gate overhead remains
deferred. Private subframes, opaque/non-HTTP/fenced contexts, broader scriptlets,
component containment, recovery UX and independent Electron identity remain
open. No Task 0 outcome/baseline promotion or change to 156/permanent profiles.


### Private/opaque frames and Electron instrumentation assessment — October 17, 2026

See [evidence](../f12-opaque-electron-audit-20261017/README.md) and the
[source-backed Electron assessment](../../electron-update-instrumentation.md).
Eight fresh sessions (two per runtime/profile) complete 56 frame cases. The
24 private script-enabled cases keep uBO disabled, permit the allowed control
and reject the blocked probe with zero blocked arrivals. Eighteen have actual
private Blanc Blocker cancellation records; six Electron srcdoc/data cases
remain attribution gaps because the existing observer scrub rejects non-HTTP
frame metadata. This does not count as private uBO scriptlet acceptance.

Four native regular HTTP/sandbox-HTTP cases pass first-inline constant/getter
and fetch suppression. Eight native non-HTTP regular cases lack the tested
early effects; Electron's 12 regular script-enabled cases lack them too.
Late effects differ: Electron HTTP/sandbox-HTTP/about:blank flags appear, while
srcdoc/data flags do not; Chromium non-HTTP flags do not appear. Eight sandbox
no-script cases prevent authored script execution; this is sandbox enforcement,
not successful scriptlet coverage. Actual opaque origins stay literal `null`.

The Electron v44.8.0 source pin is Chromium 152.0.7977.167. The assessment maps
browser-owned update metadata → per-load token → ResourceRequest → real Electron
webRequest hook, with collision/profile/old-version/lifetime safeguards and
required negative tests. It is unimplemented/uncompiled and needs a separately
approved Electron diagnostic build. Existing native joins retain their prior
meaning; independent Electron update identity stays open.

Two incomplete matrix attempts remain archived (opaque frame-name lookup,
then about:blank navigation replacing document.write); the corrected harness
uses element.contentFrame and writes to the default blank document. The first
unit invocation hit nine sandbox loopback EPERM errors; the authorized loopback
rerun passes all 181 tests. Lint: 93 files, zero issues. No native edits or
compilation; the existing output's final guarded plan has zero actions. Last
measured footprint 31 files/74 hunks is unchanged by these harness/docs changes.
All profiles/CA private keys and owned browser processes are removed. No native
mouse/keyboard or latency claim. Latency stays deferred; broader opaque/fenced
coverage, scriptlets, containment, recovery, worker contexts and both full
acceptance gates stay open. Plan items 3–6 remain unstarted; no Task 0/baseline
promotion and no 156/permanent-profile changes. Attention/agent time unmeasured.


### Inherited document start, Electron observer and diagnostic-build proposal — October 17, 2026

See [evidence](../f12-inherited-observer-20261017/README.md). The opt-in
native gate now considers about:blank/srcdoc only when the committed browser
URL matches, its non-opaque HTTP(S) origin matches its actual parent origin,
and the existing profile/document/generation checks hold. That origin supplies
scriptlet rule selection only; document identity and request metadata remain
unchanged. Opaque about/data and unsupported schemes do not acquire a guessed
parent origin or an early-protection claim.

Eight fresh sessions repeat all 56 frame cases. Native early checks now pass
8/8 across HTTP, sandboxed HTTP, inherited srcdoc and blank (four newly passing
inherited cases). All 24 private script-enabled cases have actual private Blanc
Blocker cancellation records and unchanged allowed/blocked network outcomes.
The six former Electron attribution gaps are closed by synthetic-only exact
about/data metadata admission, with observed initiator presence and literal
opaque null preserved. Unknown data/blob/file metadata and exempted network
fields are rejected; the public recorder scrubber is unchanged.

Six inherited normal/exception/restoration probes and all seven gate-safety
regressions pass. The 56-case matrix retains 16 early-scriptlet gaps: four native
opaque srcdoc/data cases and 12 Electron regular cases. Eight sandbox script-denial
checks remain scoped enforcement evidence, not scriptlet passes. Broader nested,
blob/fenced/CSP/lifecycle contexts, full provider/containment acceptance and
cross-runtime update identity remain open. The full 5,123 corpus was not rerun.

187 focused tests pass; lint covers 96 files without issues. One guarded
incremental build: 37.45 s wrapper / 33.62 s Siso, eight steps, after a two-action
plan. No compile failure, cold output, GN-arg/toolchain or hook change. Final guard
zero actions; measured footprint31 files/74 hunks. Build time is routine tranche
work, never Task0 cold cost. Profiles, fixture CA keys and owned browser processes
removed. No physical-input claim. Latency remains deferred; attention/agent time
not measured, items3–6 unstarted, Task0/156/permanent data unchanged.

[Electron diagnostic build proposal](../../electron-instrumentation-build-request.md)
is drafted with separate unchecked §8 approval. It pins Electron44.8.0/Chromium152,
one isolated arm64 testing output, local tools and resource/time limits. Estimates
are labelled unmeasured (4–8h cold compile; up to220GiB new-root budget). No fetch,
setup or build started. The current tranche approval does not authorize it.

Inherited-frame native/extension late-path deduplication is not proved by the bounded constant/fetch cases; an exactly-once probe remains required for broader scriptlets.
