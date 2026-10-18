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

## Opaque about selection and inherited deduplication — October 17, 2026

Evidence: [opaque/dedup checkpoint](../f12-opaque-dedup-20261017/README.md).
Browser-side selection now admits exact committed about:blank/srcdoc with a
browser-recorded tuple/precursor matching the actual non-opaque HTTP(S) parent.
The precursor selects rules only; opaque origin stays `null` and is never used
as a same-origin grant or a replacement network observation. Unknown precursor,
opaque parent and unsupported URLs remain outside this bounded gate.

The generated uBO payload wraps both its exported native main-world body and
its extension insertion body with one per-payload random, per-realm once marker.
The marker is non-enumerable/non-configurable/non-writable after installation.
It is duplicate prevention, not an authorization boundary against page code.
Exceptions that select no payload set no marker; a throwing body is not retried.
New documents have independent markers. In-place filter-generation semantics
and arbitrary scriptlets remain broader coverage work.

Eight fresh sessions repeat 56 frame cases: **42 scoped passes / 14 gaps**.
Native regular early checks now pass 10/10 (HTTP, sandbox HTTP, inherited srcdoc,
blank, opaque srcdoc, each twice). All 24 private cancellation observations
still pass; uBO remains disabled there. Two native data cases and twelve Electron
early cases remain gaps. Eight no-script cases are sandbox enforcement only.

Four inherited repeat-delivery cases, across two fresh document cycles, show
one body execution with 4–5 attempts after two deliberate extension deliveries.
The test explicitly resets upstream's isolated injection sentinel to force the
late main-world path; it does not pretend these deliveries occurred naturally.
Two opaque srcdoc cases pass early checks but extension late delivery cannot be
observed, so their repeat-delivery scope remains a gap. Independent verification
rejects missing attempts, duplicate bodies and opaque-origin substitution.

Boundary run records blob, data and nested-opaque early gaps, plus one passing
opaque-srcdoc exception. Seven existing gate-safety and six inherited
normal/exception/restoration checks pass; a separate observer/counter-free
payload repeats the six inherited checks. Full 5,123-network parity and complete
previous ancestor matrices were not rerun and remain historical.

One guarded incremental build: **34.24 s wrapper / 30.61 s Siso, six steps**,
from a one-action plan. Final guard zero; fresh footprint **31 files / 74 hunks**.
**195 focused tests / 102-file lint pass**. First lint found one harness global
reference and was corrected. Two excluded dedup probes are retained: first
never forced late delivery past upstream's isolated marker; second overclaimed
opaque extension reachability and stopped. Neither is counted as acceptance.
Disposable profiles/fixture CA keys/runtime processes were removed.

Latency remains deferred, including gate and marker overhead. Electron early
behavior and independent update-loader identity remain open; its diagnostic
build request §8 is unchecked and no checkout/build started. Broader lifecycle,
CSP/opaque/fenced contexts, arbitrary scriptlets, component containment and
plan items 3–6 remain open. Task0 and the156 baseline are unchanged.

## Data/blob and nested-opaque document coverage — October 17, 2026

Evidence: [non-HTTP chain checkpoint](../f12-data-blob-20261017/README.md).
The native gate now accepts data/blob along with about documents only when the
exact browser-committed URL matches and its browser-owned tuple/precursor is
HTTP(S). Every opaque parent must carry that same tuple; selection stops at the
first non-opaque parent and requires an exact match there. Mismatches, unknown
precursors, no parent, unsupported ancestors and chains beyond 64 hops receive
no added payload. No ancestor is skipped to borrow the visible top tab. This is
rule selection only, never inherited origin privileges or substituted network
context. Document/profile/generation binding and once-only payload remain.

Four fresh native regular/private sessions cover nine cases each. **14 regular
early checks** pass over data, blob, sandboxed blob, nested opaque srcdoc/data/blob
and child-origin blob. Host-specific first-inline markers prove top-vs-child rule
selection. **16 private-policy checks** have actual Blanc cancellation records
with the observed initiator (including opaque `null`); private uBO stays disabled.
Six of the 36 cases remain gaps: four cross-owner blob navigations are rejected
by Chromium before an inspectable document, and two regular mismatched-chain
data documents receive no early payload. Browser rejection is not a native
scriptlet/selection pass. The private mismatched chain still has its own network
cancellation proof and is not counted as private uBO coverage.

Two more fresh regular sessions exercise explicit exceptions and the baseline
again: seven exception outcomes and seven baseline early outcomes pass; four
mismatch/navigation gaps remain. The latter session is labelled `restored` in
raw data but is a **fresh-session baseline**, not an in-place filter-generation
restoration claim. The 56-case Electron/native matrix is also rerun on this
binary; its proof and exact scoped counts are in this checkpoint's evidence.
Inherited deduplication and document-gate safety regressions are rerun separately.
Full 5,123-URL network parity and full previous ancestor matrices remain historical.

One guarded incremental build: **36.01 s wrapper / 32.36 s Siso, eight steps**
after a two-action plan. Final guard zero. Fresh measured footprint **31 upstream
files / 74 hunks**. **202 focused tests / 106-file lint pass**. No cold output,
GN-args/toolchain changes, latency run or Electron diagnostic build. §8 of that
separate proposal remains unchecked. Plan items 3–6 and Task0 remain unchanged.

Two failed harness attempts are retained/excluded: the first assumed a rejected
cross-owner blob had a visible document; the second evaluated that absent
execution context and stalled. Only its verified disposable browser was stopped
with SIGTERM so the runner saved evidence and removed its profile. The final
probe uses actual browser console rejection without evaluating a missing realm.
All final and failed-run cleanup reports, raw observations, source snapshots,
binary hashes, invocation logs and independent verification are archived.

Remaining: cross-owner/unknown-precursor and mismatched chains, top-level data/blob,
deeper/fenced contexts, opaque-specific ancestor rules and CSP permutations,
opaque extension late-path reachability, arbitrary scriptlets/lifecycle/recovery,
component containment, independent Electron update identity and Electron early
timing. Qualified latency remains explicitly deferred, including gate overhead.

Final regression evidence: the eight-session56case matrix verifies **44 scoped
passes /12 Electron early gaps** (native12early,24private attribution and8sandbox
no-script enforcement). Four inherited repeat-delivery proofs and seven gate
safety checks pass; two opaque extension late-delivery attempts remain unproved.
These scoped categories are not summed into full provider acceptance.

## Opaque late delivery and duplicate suppression — October 17, 2026

Evidence: [late-delivery checkpoint](../f12-opaque-late-20261017/README.md).
Two fresh native regular profiles each create eight document kinds twice: opaque
srcdoc, data, blob, sandboxed blob, nested opaque srcdoc/data/blob, and child-origin
blob. Native first-inline effects and original security origins are checked before
any diagnostic delivery. No private uBO or Electron parity claim is added.

- **8 actual extension repeat-delivery passes:** data and nested-data documents
  receive two deliberate late deliveries through raw `chrome.tabs.executeScript`.
  The real engine's assembled injector executes, its main-world attempt count rises
  by at least two, and its body count remains one. The upstream isolated injector
  sentinel is deliberately reset; the shared main-world once marker is not reset.
- **8 opaque-srcdoc delivery gaps:** direct and nested sandboxed srcdoc callbacks
  explicitly refuse access at origin `null`, even with `matchAboutBlank: true`.
  The earlier wrapper hid this error; it is now archived. Permissions are unchanged.
- **16 blob delivery gaps:** `webNavigation.getAllFrames` omits the blob leaf.
  A separate all-frames diagnostic message probe supplies browser-owned sender
  metadata for reachable parents, but no matching blob document. No frame id or
  parent origin is substituted. The pinned `IsValidUrl` source excludes blob from
  webNavigation's accepted schemes; the all-frames omission's deeper cause remains
  unproved. An omitted frame is not proof that every possible extension path fails.
- **32 direct mechanism passes:** the same real engine main-world payload is also
  delivered twice by explicit Playwright evaluation in each actual document realm.
  Attempts rise by exactly two, bodies remain one, origins and early effects stay
  unchanged. This is diagnostic duplicate-suppression evidence, **not extension
  delivery acceptance**. The fixture supplies the selection origin for this direct
  test; unresolved extension frame ids use a diagnostic-only `-1`. New document
  cycles prove marker state is per realm, not retained from the previous document.

Seven negative verifier tests reject missing main-world arrival despite successful
API callbacks, repeated bodies, missing direct attempts, replaced opaque origins,
stale/wrong document identity, silently discarded blob candidates and changed
payload bytes. Both final runs independently verify. Three failed harness attempts
remain excluded: Playwright's stale empty opaque URL twice, then assuming blob
appeared in webNavigation. The final harness reads `location.href` in the actual
realm and records absent extension identity as a gap.

**209 focused tests and 109-file lint pass.** The first sandboxed unit invocation
failed on loopback `listen EPERM`; the permitted run passed without code changes.
No native or payload code changed. Guarded plan: **zero actions, 3.77 seconds**;
no compile launched. App/framework hashes match the prior checkpoint. The last
measured upstream footprint remains 31 files / 74 hunks (not remeasured here).
Both final runs took 13.33 and 13.07 seconds; these are harness wall times, not
latency measurements. All five attempted disposable profiles were removed.

Claude Code plan: Spike B remains in progress. Production opaque-srcdoc/blob late
reachability, mixed/unknown/top-level/deeper/fenced contexts, ancestor/CSP rules,
arbitrary scriptlets, lifecycle/filter generations and privilege containment remain
open. Previous network, private and gate-safety matrices were not rerun for this
harness-only change. Latency stays deferred. Electron diagnostic proposal §8 is
still unchecked; no checkout/build started. Task 0 and plan items 3–6 are unchanged.

## Opaque/blob static origin fallback investigation — October 17, 2026

Evidence: [static fallback checkpoint](../f12-origin-fallback-20261017/README.md).
The pinned source distinguishes legacy `matchAboutBlank`'s about-only ancestor
climb from static content scripts' `match_origin_as_fallback` origin/precursor
matching for about/blob/data/filesystem. Host permission checks remain in place.
The legacy climb can stop at a remote parent; this is consistent with the opaque
refusal, but no internal trace proves that particular bailout. webNavigation's
valid-scheme list separately excludes blob, explaining its enumeration omission.

Two **diagnostic-only copies** of the existing observed uBO payload add one static
isolated-world content script, matched only to the two authored fixture origins,
at document idle. They differ only in `match_about_blank` versus
`match_origin_as_fallback`. Existing scripts, permissions and private exclusion
are preserved. The prototype's existing payload is not edited. The test receiver
sends actual browser `MessageSender` frame/document id, URL and origin; the harness
requires an exact unique authored document before targeting its `documentId`.
No permission or extension-system patch, guessed frame id or substituted origin.

The matched final comparison has ten frame kinds over two document cycles:

- About-only mode: **4 positive-control passes / 16 absent-receiver gaps**.
  The HTTP and inherited-srcdoc controls confirm the content script is loaded.
- Origin mode: **14 diagnostic static-delivery passes / 6 gaps per profile**,
  reproduced in two fresh profiles (**28 / 12**). New reachable kinds are opaque
  srcdoc, blob, sandboxed blob, nested opaque srcdoc and child-origin blob.
  Their browser-provided origins stay unchanged, including opaque `null`.
- Static data, nested-data and nested-blob receivers remain absent. The earlier
  programmatic data/nested-data passes still stand; the two APIs behave differently.
  This absence is retained as a gap, not attributed to a source cause without proof.
- All three final profiles pass two out-of-scope controls: unmatched HTTP and
  sandboxed srcdoc produce no diagnostic receiver or fixture-specific scriptlets.
  Existing generic native scriptlet counters may still be present and are recorded.

Each successful receiver gets the real engine main-world payload twice through
extension messaging and DOM script insertion. Actual main-world attempts increase
by at least two while the body count remains one. **No direct Playwright payload
evaluation is used.** Payload bytes and exact responses/identity are archived.
This proves a bounded, supported extension delivery mechanism. It is **not yet
provider integration**: fixture-selected rule context is still supplied by the
harness; authenticated context selection, readiness/generation/lifetime binding,
CSP/ancestor rules, recovery and privilege containment remain required. The
receiver is intentionally an isolated experiment, never shipped or installed into
the permanent profile. No new private uBO or Electron acceptance claim is added.

**216 focused tests / 114-file lint pass.** Seven new verifier tests reject absent
arrival, wrong/stale identity or origin, duplicate execution, direct-eval claims,
widened manifest scope, unmatched-host delivery and payload tampering. The loaded
manifest itself is verified. Guarded native plan: **zero actions, 5.68 seconds**;
no compilation. Native app/framework hashes remain unchanged; last measured patch
footprint remains 31 files / 74 hunks, not remeasured here. All experiment profiles
are removed. Early exploratory runs are archived separately from the final proof;
one scope-control attempt failed because it incorrectly expected no generic native
counter at all. The final control checks actual fixture-specific effects instead.

Claude Code plan and routine ledger updated. Spike B remains in progress. Qualified
latency remains deferred; harness wall times are not latency measurements. Electron
diagnostic build §8 remains unchecked/unstarted. Task 0 and items 3–6 are unchanged.


## Static origin fallback integrated — October 17, 2026

[Evidence and exact limits](../f12-static-integration-20261017/README.md).
Browser-owned live document/tab/frame/origin, precursor/ancestor selection and
reload generation now bind the automatic static late path to the real uBO engine.
Two fresh profiles: **36 non-HTTP late-delivery passes + four HTTP early controls**,
one body per document; **26 identity/generation checks**. No fixture context or
harness payload delivery supplies those results. The former data/nested-data/
nested-blob receiver gaps were a diagnostic `crypto.randomUUID()` failure in
insecure contexts; its corrected diagnostic passes **20/20**, superseding that
hypothesis. Existing private/non-HTTP matrix **30 passes/six boundary gaps**,
exceptions/fresh restore **14/four**, and **seven gate safety checks** pass.

**228 tests / 119-file lint pass.** One incremental build **35.12 s wrapper /
31.49 s Siso, six steps**; final guard zero actions. Fresh footprint **31 files /
74 hunks**. Exploratory/failed attempts and cleanup are retained in the evidence.
No full network-corpus or Electron rerun. In-flight delivery/reload atomicity,
broader CSP/Trusted Types, lifecycle/owners/scriptlets/containment and Electron
identity remain open. Latency deferred; Electron build §8 unchecked/unstarted.
No baseline promotion or change to plan items 3–6.


## Static fallback reload schedules and CSP — October 17, 2026

[Evidence and exact limits](../f12-static-race-csp-20261017/README.md).
Assets-only final reply generation check: final **45 diagnostic schedules** include
15 actual filter-list reloads; **36 pre-dispatch drops / nine after-delivery stale
attempts**, no duplicate bodies. Explicit diagnostic pauses establish controlled
behavior, not natural race incidence. **After-dispatch atomicity remains a gap**;
unchanged-rule reloads do not qualify in-place changed-rule semantics.

Ordinary provider CSP matrix **15/15** actual late attempts with one body. Page
nonce/script-none and Trusted Types controls remain enforced; extension-world
insertion is privileged/exempt in this pin. Receiver comment corrected, no policy
weakening; full CSP/containment remains open. Ordinary regression **18 late + two
HTTP controls + 13 identity checks** passes. **238 tests / 126-file lint** pass.
Zero-action guard **4.57 s**, no compile; last upstream footprint31/74 unchanged,
not remeasured. Initial lint and all runtime attempts retained. No full network,
Electron/private/safety reruns. Parent32790e0b CodeQL four alerts remain unresolved.
Latency deferred; Electron build §8 unchecked/unstarted; Task0/items3–6 unchanged.


## Static delivery barrier and broader CSP — October 18, 2026 UTC

[Evidence and exact limits](../f12-static-drain-20261018/README.md).
The static receiver now holds a document-bound delivery lease until synchronous
insertion finishes. Reload acknowledges the native request hold, then drains
committed deliveries before engine reset/readiness. Sent code is serialized,
not revoked. A three-second timeout retains the lease and fails closed; lost
acknowledgements have no automatic recovery yet.

**45 controlled schedules:** 36 pre-dispatch drops, nine deliveries drained before
reset, no duplicate bodies; 15 actual unchanged-rule reloads. A destroyed receiver
makes actual reload reject while unready. This qualifies static-delivery/reset
ordering, not native-early/upstream injection atomicity, changed-rule semantics or
natural race incidence.

**15 new policy cases:** five HTTP-header controls and ten inherited srcdoc/blob
cases cover nonce, none, Trusted Types, strict-dynamic and report-only. Page-policy
negative controls remain effective while privileged extension delivery succeeds.
Not full containment. Existing **15 meta-CSP**, **18 late + two HTTP + 13 identity**,
and **10 readiness + one startup** regressions pass. **253 tests / 133-file lint**.
**Zero actions / 5.18 s**, no native build; binary hashes unchanged, last footprint
31 files/74 hunks unchanged and not remeasured. Four archives, 231 members, five
independent extracted proofs; all disposable roots removed. Initial test-import
failure and earlier race run retained/excluded from final proof.

Remaining: lost-ack recovery, concurrent reload/lifecycle/recreation, native early
and non-static upstream deliveries, in-place changed rules, asynchronous effects,
adversarial/deeper/combined CSP and full containment, broader coverage and Electron
identity. Latency remains deferred; Electron diagnostic build §8 stays unchecked
and unstarted. Task0/items3–6 unchanged. Parent b99334c7 passed all 22 CI checks,
none skipped, CodeQL no new alerts; this checkpoint awaits its own CI.


## Lost acknowledgement recovery and reload lifecycle — October 18, 2026 UTC

[Evidence and limits](../f12-static-recovery-20261018/README.md).
A held reload can now retire a static lease after the browser proves the exact
previously verified document is absent. This proof chain starts with actual
MessageSender identity and two LateContext checks; an arbitrary absent ID is not
destruction proof. The authenticated query preserves inactive/BFCache/retained
crash documents as present, based on the pinned source audit. Runtime BFCache,
prerender and crash cases remain unqualified.

**45 controlled schedules pass**, retaining 36 pre-dispatch drops / nine drained
committed deliveries and zero duplicate bodies. Additional runtime checks prove:
live receiver timeout keeps page fetches blocked; two real load calls share a
promise through acknowledgement; overlapping begin and stale completion reject;
receiver acknowledgement allows retry after failure; destroyed receiver permits
actual reload recovery with exact native lifetime evidence. Malformed ID,
stale/malformed generation and popup query controls reject.

Generated uBO clears its shared load promise after native readiness acknowledgement
on success or failure; completion uses the epoch returned by begin. This broadens
reload lifecycle coverage but does not close native early/upstream non-static
injection atomicity, changed-rule semantics, asynchronous effects or full recovery UX.

**260 tests / 133-file lint**, ordinary **18 late + two HTTP + 13 identity**,
**15 header/inherited CSP**, and **ten readiness + one startup** checks pass.
One guarded incremental **34.59 s wrapper / 30.82 s Siso, six steps**; final guard
zero actions **4.39 s**. Fresh footprint **31 files / 74 hunks**. Four archives,
236 members, four independent extracted proofs. Initial test/harness failures and
pre-final runtime retained and excluded; all disposable roots/private keys removed.
No full network, Electron or meta-CSP rerun. Latency remains deferred; Electron
build §8 unchecked/unstarted. Task0/items3–6 unchanged; CI pending this checkpoint.

## Native/upstream completion ordering follow-up

[October 18 evidence](../f12-delivery-order-20261018/README.md) adds native
execution acknowledgement and upstream API completion drains. Four diagnostic
schedules and prior static/CSP/readiness regressions pass. Exact upstream document
identity, lifecycle/async/other injection coverage and full acceptance remain open.
Latency deferred; Electron diagnostic build §8 remains unapproved/unstarted.
