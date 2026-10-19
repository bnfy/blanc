# Tranche 2 request: the Decision 2 package, F12 first

## October 19 PDF reload/crash checkpoint

Regular and private selectable-text PDF find each return three matches before reload, after
Page.reload, after an actual outer-page renderer crash and recovery navigation, and after switching
away and reselecting the PDF tab. Reload/crash/tab transitions reset the capsule. The crashed target
rejects/times out a Runtime evaluation; crash command responses are retained. Private theme stays
private, closing the searched private PDF resets find, private Recently Closed remains empty and
private context disposal succeeds. Page.crash selected the PDF URL's outer page target: this does
not prove independent PDF plugin-process crash recovery. No physical keyboard/mouse acceptance.

No production changes or compilation. Guard zero actions (3.59s); native hashes match the prior
PDF checkpoint. Footprint remains 40 upstream files/96 hunks (not re-enumerated for evidence-only
work). Setup failures were a sandbox ps denial and immediate CDP-readiness race; both occurred
before test cases and are recorded in attempts.json. Final browser results are in results.json.
Disposable profile/server removed; existing preview tabs and empty host status verified without
relaunching the preview. No new Electron comparison, unit suite or PDF visual comparison claimed.

Remaining: independently selected PDF plugin failure, scanned/encrypted/forms and selection/wrap,
cache eviction/ineligible pages, private subframe crashes/process-sharing, IME/accessibility/full
visual parity. Native input pending unlock, latency deferred, Electron diagnostic build unapproved
and unstarted. Visual item4 and previous F12/Task0 gates remain incomplete/unchanged.

Evidence: `evidence/ui138-find-pdf-recovery-20261019/`.

## October 19 PDF/private lifecycle progress

Simple two-page PDF find passes regular/private counts, regular next/previous, no-match and
PDF→HTML reset. Private forward BFCache restoration, iframe removal and active find-tab closure
pass bounded checks. Evidence: `evidence/ui138-find-pdf-20261019/`. No code change/build; guard
zero, native hashes unchanged, footprint remains 40 files /96 hunks. Broader PDF/cache/private/
accessibility cases remain gaps; native input pending unlock and visual item4 incomplete.
Latency deferred; Electron diagnostic build unapproved/unstarted; prior F12/Task0 unchanged.


## October 18 BFCache/private find progress

Actual regular back/forward and private back-cache restoration now pass document-identity and
persisted-pageshow proofs, find reset and fresh search. Private isolation, navigation/tab reset
and renderer crash/reload pass. Fixed direct-open private find theme in host assets only.
No native build; guard zero; binary hashes unchanged; footprint remains 40 files /96 hunks.
Evidence: `evidence/ui138-find-lifecycle-20261018/`. Native input pending unlock; broader lifecycle
and visual gaps explicit, item4 incomplete. Latency deferred; Electron diagnostic build
unapproved/unstarted; earlier F12/Task0 gates unchanged.


## October 18 expanded find progress

Eight cross-runtime query comparisons, six component style pairs and three result states now
have bounded automated evidence. Fixed stale find UI on an exact active renderer crash; reload
recovery passes. Client/scroll metric differences are recorded; no whole-window pixel claim.
One41.02s incremental build, finalguard0,40files96hunks. Item4 remains incomplete, native input
pending unlock. Evidence: `evidence/ui138-find-expanded-20261018/`. Latency deferred; Electron
diagnostic build unapproved/unstarted; prior F12/Task0 gates unchanged.


## October 18 find-capsule progress update

Find capsule and native bridge are implemented with bounded automated Electron comparison,
private isolation and 1280/800/500px geometry checks. Native input remains pending unlock;
visual item 4 stays in progress, not accepted. Footprint40 files /96 hunks; two incremental
builds, final guard zero. Evidence: `evidence/ui138-find-20261018/`. Prior F12/Task0 gates
unchanged. Latency deferred; Electron diagnostic build unapproved/unstarted.


**Status: the original tranche was approved on October 17, 2026 (§8), and
its audit and recording checkpoints have started. The corpus amendment in
§2.1 was explicitly approved on October 17, 2026 at `68892cc1` (§8.1).
The owner authorized recording approval, merging #916 once CI is green,
and resuming implementation within the amended scope. Further option C
runs remain stopped. Spike A implementation is in progress on draft #920;
the current full-uBO-corpus and update-check checkpoint is mapped below.** Task 0 measured a rebase (`rebase-ledger.md`, row 0: 2h39m47s
cold build, one broken anchor, one API change, 21 upstream files) and its
native acceptance passed except the extension version-upgrade observation,
which stays under daily check through November 3. That open gate blocks 157's
promotion to the verified baseline and the row's `passed` outcome; it does not
block the next work, which needs only the measurement. This request asks the
owner to clear the next tranche of `docs/chromium-migration-implementation-plan-2026-10-16.md`
§5 step 2: the items Decision 2 needs, with F12 blocking first.

## 1. What this tranche produces

The Decision 2 package, as the plan's §2 defines it. Each item ends in a
recorded artifact; none ends in a claim.

| # | Item | Plan reference | Artifact | Needs builds |
| --- | --- | --- | --- | --- |
| 1 | **F12 blocking spike A**: Blanc Blocker on Chromium's network stack | §3 F12 (a), §4 C | `evidence/f12-spike-a/` report with measured block rate, cosmetic coverage, patch count, decision latency | yes, incremental |
| 2 | **F12 blocking spike B**: Manifest V2 audit and uBO runtime spike | §3 F12 (b), §4 C, §7 | `evidence/f12-spike-b/` audit (every MV2 gate in the 157 checkout, with file and line) and a runtime report with patch count and block rate, or a recorded stop | yes, incremental |
| 3 | A1 patch-budget design | §4 A1 | design doc: out-of-tree layout, budget number, the measured 21-file inventory against it, CI reporting | no (the layout move itself is not in this tranche) |
| 4 | Electron-versus-Chromium visual comparison | §2 kill gate | side-by-side captures of resting, panel, palette, find and private states at the same window sizes, with a diff list | no |
| 5 | VoiceOver pass of the Island | §2 kill gate | checklist with pass/fail per control and the rotor/focus order | no |
| 6 | Staffing and CI cost sheet | §2 | one page replacing the evaluation's hypotheses with Task 0's numbers at the two-week cadence | no |

Order: 1 and 2 start first and run in parallel where the single builder
allows (one build at a time; the spikes alternate, they never overlap a build).
3 runs alongside as a document. 4, 5 and 6 fill the gaps. The tranche ends
when every row has its artifact, or when a kill criterion is hit and recorded.


## October 18 rail/restore and visual acceptance follow-up

Native drag/keyboard, tab/group/window restoration and private isolation now have bounded
acceptance evidence. Fixed opaque rail renderer paint, redundant rail header offset, loose-tab
end-of-strip movement and insertion before a group's first tab; interior/pinned targets stay
rejected. Matched 1280x800 rail/panel geometry and private color pass; Billboard's 68px header
reservation matches. Component screenshots are not complete composed visual parity: content,
pill controls, Start Page features, narrow/DPI/palette/find and wider lifecycle cases remain gaps.
Evidence: `evidence/ui138-acceptance-20261018/` (hashed archive, failed attempts retained).
79 renderer tests, three promotion tests and scoped lint pass. Two incremental builds 44.17s
and 43.66s; final guard zero. Budget unchanged at 40 files / 94 hunks; no increase needed.
Disposable profiles removed; original two preview tabs restored. Recently Closed remains
profile-wide; Spaces/Glance unported. Plan item 4 started, incomplete; items 3/5/6 unchanged.
Latency deferred, Electron diagnostic build unapproved/unstarted; F12/Task0 gates unchanged.


## October 18 narrow/palette/find diagnostic checkpoint

Native command entry now selects palette mode, full-window scrim/hit region and copied
repeat-command selection behavior; click/typing/new-tab entries remain panel mode. Five
actual Chromium sizes, 1280x700 through 500x400 pass bounded palette geometry/typed-selection
checks. Crowded 500x400 panel/list/footer and rail scrolling pass. Electron reference uses
renderer viewport emulation and diagnostic palette CSS, not native window/keyboard input.
Electron actual find API returns 1/1 fixture match at five sizes; Chromium Blanc find capsule
and bridge remain unported (/find filtered out), native Find not tested while locked.
Native Cmd-L/Escape/outside-click acceptance awaits unlock; no physical checks claimed.
At <=800px native controls require Chromium panel y48 vs Electron y12; full composed/DPI/
private parity remains open. Evidence: `evidence/ui138-narrow-palette-20261018/`.
One 37.69s incremental build, six steps; final guard zero; 40 files / 94 hunks unchanged. Four regressions
and focused host lint pass. Disposable fixtures removed, original preview two tabs restored.
Plan item4 in progress; previous F12/Task0 gates unchanged. Latency deferred; Electron
diagnostic build unapproved/unstarted. Find migration and unlocked input are next gaps.

### Earlier UI follow-up — October 18, 2026 (EDT)

Vertical rail, native Recently Closed and session-only site mute now have bounded native
input, bridge, private-isolation and restart evidence. The Store popover is suppressed;
normal Google installation, permission prompt, persistence and removal pass. Footprint
40 files / 94 hunks; incremental builds only, final guard zero. Evidence:
`evidence/ui138-rail-store-20261018/`. Matched visuals, broader drag/group/window restore,
profile-wide history semantics, Glance/Spaces and prior F12/Task0 gaps remain explicit.
Latency deferred; Electron diagnostic build unapproved/unstarted. This updates the UI
follow-up, not acceptance of the full tranche or promotion of Chromium157.

### UI migration preview — October 18, 2026 (EDT)

Owner-authorized 1.38 follow-up is partially implemented. Reviewed renderer sources,
Start Page image/color controls and native group/tab-menu bridges are covered by
`evidence/ui138-preview-20261018/`; full inventory is `ui-refresh-20261018.md`.
Vertical rail, Recently Closed, site mute, Glance/Spaces and physical/matched visual
acceptance remain open. The 157 header-reservation preparation bug reported by the
owner is fixed with a specific anchor marker and regression test. This does not
close the tranche visual gate. Spikes A/B and prior F12 gaps remain unchanged;
latency deferred; Electron diagnostic build §8 unapproved/unstarted.

### 1.1 Progress checkpoint — October 18, 2026 (EDT; native crash recovery)

Native execution leases now retire when the exact document is gone **or its
renderer frame is no longer live**. A real renderer crash during paused native
ExecuteScript previously left a valid WeakDocumentPtr and held reload forever;
the bounded repaired schedule drains pending1 to0 and completes reload, then
loads a protected replacement. Inactive live documents are not retired.
Background-document recreation also passes new-realm readiness plus first-inline,
allowed and blocked controls; this is not a background-process crash or an
automatic restart policy. Background process loss, asynchronous effects, original
caller identity and broader lifecycle coverage remain gaps. Prerender activation
remains unsupported, with the prior protected cancellation fallback retained.
Evidence: `evidence/f12-native-recovery-20261018/`. One 35.07-second incremental
build; footprint remains **40 files / 92 hunks**, final guard zero actions.
Latency stays deferred; Electron diagnostic build unapproved/unstarted.

The owner requested migrating recent Electron UI/UX next. The pinned 1.38.0
inventory and verification order are in `ui-refresh-20261018.md`; migration is
pending, not part of this recovery acceptance. Spikes A/B remain in progress.

| Item | Status | Evidence / next gate |
| --- | --- | --- |
| 1. Spike A | **In progress** | Request-path audit, origin-preserving replay, synthetic 2,000/2,000 corpus, browser-process factory proxy, sandboxed Mojo Ghostery engine, regular/private network parity, fail-closed probes, GET redirects, dedicated workers, bounded service-worker identity, two shared-worker clients and one exact-owner teardown are measured. Current evidence is linked from `results.md`, including `evidence/f12-shared-lifecycle-20261017/`. Remaining acceptance work includes the rest of the request-path matrix, CSS/procedural cosmetics/scriptlets, the private real-page sanity sample and qualified quiet-machine latency. The final aggregate `evidence/f12-spike-a/` report is pending. |
| 2. Spike B | **In progress: full synthetic network parity** | `evidence/f12-ubo-reload-20261017/` records sandboxed component readiness, bundled-list local replacement, authored-rule blocking, acknowledged pre-reset cancellation, stale/page/popup rejection, background-target loss and independent private Blanc Blocker. Profile lifetime and empty-body response bugs were caught and repaired incrementally. No extension-core MV2 override. `evidence/f12-ubo-parity-20261017/` adds two fresh runs per runtime over 5,123 candidates plus four controls: 2,113 blocks / 3,014 allows, zero context/decision/fixture differences. `evidence/f12-ubo-cosmetics-20261017/` adds eight matching regular main-frame pages: static CSS, has-text mutations and late fetch scriptlets pass; historical document-start failure is superseded for Chromium main frames by `evidence/f12-document-gate-20261017/`: 12/12 early constant/fetch passes versus Electron 0/12, seven safety probes and 12 native-only update-loader joins. The subframe follow-up `evidence/f12-subframe-trace-20261017/` adds 16/16 early native cases and identifies two late Electron ancestor misses per session. Cross-runtime identity remains open. Broader cosmetics/scriptlets/paths, exhaustive failures/lifecycle, privilege containment and production recovery UX remain open. |
| 3. A1 patch-budget design | **Not started** | Current measured upstream footprint is 40 files / 92 hunks; the renderer token follows the document-start and local update-factory patches. Design artifact remains required. |
| 4. Visual comparison | **Not started** | Fixed-size Electron/Chromium capture matrix remains required. |
| 5. VoiceOver pass | **Not started** | Island rotor, labels, order and Escape focus-return checklist remains required. |
| 6. Cost sheet | **Not started** | Task 0 clean recovery, fortnightly maintenance and extension-release wait must remain three separate lines. |

Earlier follow-up: `evidence/f12-static-integration-20261017/` integrates
static origin fallback with actual MessageSender identity, browser-owned live
precursor/ancestor context and generation checks around real engine selection.
Two fresh profiles: 36 automatic non-HTTP late deliveries + four HTTP controls,
one body each, 26 identity/generation checks. The prior data/nested-data/nested-blob
receiver gaps were diagnostic `crypto.randomUUID()` failures in insecure contexts;
corrected diagnostic 20/20. Private/non-HTTP and exception regressions retain
explicit boundary gaps; seven gate safety checks pass. 228 tests, 119-file lint,
one 35.12-second incremental build, final zero-action guard; fresh footprint 31/74.
In-flight reload/delivery atomicity, broader CSP/Trusted Types, lifecycle,
scriptlets and containment remain unqualified. Latency deferred; Electron build
§8 unchecked/unstarted. Prior full network parity remains historical, not rerun.

Service lifecycle behavior is now measured in eight fresh regular/private
Electron/Chromium sessions: failed registration, controlled network fetch, cache
response, blocked fetch and different-URL worker replacement. See
`evidence/f12-service-lifecycle-20261017/README.md`. Observer session-loss errors
were traced to failed-startup detach races and are now retained as explicit
incomplete observations when exact-session detach proves the cause. Eight same-URL
changed-byte update runs pass; see `evidence/f12-service-update-20261017/README.md`.
Strict failed-script and controlled-fetch context acceptance remain open, as do
unchanged-byte and HTTP cache/validator variants. Spike B's component follow-up
documents required manifest identity, broader feature privileges, background-page
support and browser-owned payload updates; runtime loading is still unproven.
The follow-up identifies a narrow browser-owned Add/allowlist candidate and an
authenticated fail-closed reload-hold design requirement; neither is implemented.
`evidence/f12-service-context-20261017/README.md` closes 16 unique controlled
worker fetch contexts across eight fresh sessions. Failed-startup, update-script,
cache-only and broader lifecycle attribution remain explicit gaps.
The failed-loader follow-up (`evidence/f12-service-loader-20261017/README.md`)
now resolves eight token-linked HTTP 404 loader identities with execution realm
explicitly unobserved. It also fixes false Electron update correlation when a
repeated hook occurrence could borrow the initial token; all eight update contexts
remain rejected. Other startup failures are gaps. Spike B now records the required
acknowledgement-before-reset reload protocol and its runtime failure probes;
Component admission is now implemented as an explicit offline probe; authenticated
bridge protection remains unimplemented. The update checker creates its request
ID after constructing throttles, independently of the later updated-script loader.
No safe cross-runtime identity join has been established; update contexts stay gaps.

No tranche kill criterion has been observed at this checkpoint. Spike A remains
inside the fixed 40-file / 120-hunk budget. Every native build used the existing
157 output and the guarded incremental procedure; `4eaad3c7` itself needed no
compile because the guarded plan reported zero actions. The 156 checkout,
toolchain, GN arguments, permanent profile and Task 0 upgrade gate remain
unchanged. Formal latency is owner-deferred and is still an open Spike A gate.

## 2. F12 spike A: Blanc Blocker on Chromium's network stack

**Question:** can Blanc Blocker's existing engine and lists block on the
fork at Electron Blanc's rate, with cosmetic filtering, without exceeding
the patch budget, and with acceptable per-request latency?

**Scope, two weeks:**

- Engine placement. Two candidates, measured, not argued: the existing
  `@ghostery/adblocker` engine (JavaScript) running in a Chromium utility
  process reached over Mojo from a browser-side request hook; or the
  Rust `adblock-rust` engine (MPL-2.0; file-level copyleft, compatible with
  Blanc's MIT first-party code, recorded in `THIRD-PARTY-NOTICES.md` if
  adopted) linked into the browser process as Brave does. Spike A builds at
  least the first; it builds the second only if the first's latency fails
  the bound below.
- **Request-path coverage audit, first.** The pinned 157 source routes
  requests through more than one path, and a browser-process
  `URLLoaderThrottle` does not see all of them: renderer-initiated
  subresources, navigations, keepalive (`fetch` with `keepalive`, beacons),
  prefetch and prerender, service-worker-initiated fetches, dedicated and
  shared worker scripts, WebSocket and WebTransport handshakes each have
  their own factory or service. Before any hook is written, the spike
  enumerates every request path in the checkout with file and line, states
  which interception point sees it (`CreateURLLoaderThrottles`,
  `WillCreateURLLoaderFactory` proxying, or neither), and ships a coverage
  fixture that issues one request of each kind and asserts it was
  decided. The audit is a deliverable on its own; a path the hook cannot
  reach is listed, never assumed covered.
- Request hook. Browser-side interception at the points the audit names,
  in regular and incognito profiles; the throttle path is the first
  candidate and factory proxying the second; no network-service patch and
  no extension-system patch. Decisions must fail closed while the engine
  is loading, matching `installStartupNavigationGate` in Electron.
- Cosmetic filtering, three separate mechanisms. **Native CSS** (element
  hiding and selectors a stylesheet can express) is injected per frame as
  a user stylesheet or an isolated-world style injection; the page's CSP
  must not be able to block it, as it cannot block Electron's today.
  **Extended procedural rules** need a DOM evaluator in the renderer agent
  with a mutation observer, since no stylesheet expresses them; its scope,
  debounce and cost on dynamic pages are measured by the dynamic-node
  tests below. **Scriptlets** are different: the
  bundled scriptlets in `adblock/sources/` patch page globals (`fetch`,
  `XMLHttpRequest`, timers, `JSON.parse` and the like) and so must execute
  in the **main world** at document start, where an isolated world cannot
  reach those objects (Chrome's content-script model documents the
  boundary: <https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts>).
  The spike injects them from the renderer agent into the main world
  (`RenderFrameObserver::DidCreateScriptContext` for world 0, or the
  user-script path with main-world execution) as browser-privileged code
  that the page's CSP does not govern, keeping the per-scriptlet isolation
  `adblock-scriptlets.js` enforces in Electron. Each mechanism is measured
  on its own fixtures, not assumed from the other.
- Lists. The pinned, hash-verified EasyList/EasyPrivacy snapshot from
  `adblock/sources/`, nothing fetched at startup; the same inputs as
  Electron so the comparison is like for like.

**Measurements (all recorded, with the harness in the evidence tree):**

| Measure | Method | Bound (from plan §5 criterion 3) |
| --- | --- | --- |
| Block rate | the **replay corpus** defined below, issued at the browser level through the fork and through Electron Blanc on the same lists | every request decided the same way in both, for blocked *and* allowed traffic; any divergence listed by URL, type and rule |
| Cosmetic coverage | the corpus's **outcome pages**, checked in both browsers by DOM assertion and capture | parity with Electron on the same pages, CSS and scriptlet outcomes reported separately |
| Decision latency | see the latency protocol below | **proposed** acceptance bounds, not criterion 3: p99 under 2 ms in-process, under 5 ms over Mojo, on the warm steady-state run; above that, the other engine placement is tried before concluding. The owner may change the bounds at approval |
| Patch count | upstream files and hunks, counted by the §7 rules and counter before and after the spike | within §7's fixed tranche budget (40 files, 120 hunks); reported either way |
| Private windows | the same hook active in incognito, verified by the fixture | blocked, as Blanc Blocker protects private tabs today |

**Replay corpus — original approved definition.** This definition remains
the approval record until §8.1 is explicitly approved; §2.1 proposes its
replacement for acceptance provenance and a separate private sanity sample.
The unit tests named in the plan (`adblock-youtube`,
`adblock-exceptions`, `adblock-events`, `adblock-engine-loader`) exercise the
engine against mocks, not a browser; they seed URLs but cannot be the
acceptance fixture. Spike A first builds
`experiments/chromium-extension-spike/fixtures/replay/` (committed under
the experiments tree per §6, reviewed like the list snapshot; it moves out
of `experiments/` only with a later decision):

- A request corpus of at least 2,000 requests the pinned lists block and
  2,000 they allow, each with URL, resource type, initiator origin,
  first-party (top frame) origin and frame context, recorded from real page
  loads in Electron Blanc with the blocker's own decision logged as the
  oracle.
- **Origin-preserving replay.** Serving the corpus from `localhost` would
  change every domain and first-party/third-party relationship the rules
  match on, so replay must present each request to the blocker under its
  **original scheme, host and port**. The transport is a local MITM-style
  proxy or host-resolver override (`--host-resolver-rules` plus a local
  TLS fixture CA installed only in the disposable profiles) that answers
  the recorded responses while the browser still believes it is talking to
  the original origins; both browsers use the same transport. The harness
  additionally **records the request context each blocker actually
  received** (URL, type, initiator, top-frame origin, as the hook or
  `webRequest` details report them) and diffs it against the corpus
  record, so a context mismatch is caught as a harness fault rather than
  counted as a blocking difference.
- Outcome pages: the existing YouTube fixture page plus synthetic pages
  that each exercise one class of cosmetic rule, in three separately
  reported groups: **native CSS** (element hiding, `:has` and other
  selectors the engine can render as a stylesheet), **extended procedural
  rules** (`:has-text`, `:matches-css`, `:upward`, `:xpath` and the rest of
  the procedural set, which a stylesheet cannot express and which need a
  DOM evaluator run by the renderer agent), and **scriptlet-dependent
  behaviour** (a patched `fetch`, a defused timer). Each page has DOM
  assertions for the expected post-filter state. The procedural group
  also has **dynamic-node tests**: nodes inserted, re-attributed or moved
  after load and after a timer, so the evaluator's mutation handling
  (observer scope, debounce and re-evaluation cost) is measured rather
  than assumed; a procedural rule that holds at load and fails after
  mutation is a fail.
- A coverage page issuing one request of every path the audit found.

### 2.1 Corpus amendment — approved at `68892cc1` (§8.1)

**Approved change.** Replace the real-page provenance requirement in the
first replay-corpus bullet with the committed synthetic acceptance corpus
below, and authorize a separate, bounded private real-page sanity sample.
Merging this document does not approve either change. The original approval
in §8 does not extend to this amendment. No replacement-corpus generator,
private recorder, capture, replay run or native implementation starts until
the owner approves §8.1 explicitly.

**Reason and evidence.** Option C and its repeat admitted 0 of 10 initial
documents. At recorder commit `570d9939b83a5fb3a882254107c9a2f5ca34ea87`
([#914](https://github.com/bnfy/blanc/pull/914)), the repeat recorded three
uncontrolled-Vary refusals, four encoded/opaque-body refusals and three
status refusals (one 401, two 403). No script/xhr/image distribution was
measurable because the initial documents were refused. These are feasibility
results, not blocking-parity evidence. The statuses are consistent with bot
protection but do not establish its cause; the body heuristic can reject
ordinary nonces, hashes and inline data without proving that they are private
identifiers. Preserve these failed attempts and their limits. Stop iterating
C; this proposal does not weaken the public scrubber or turn those attempts
into acceptance data.

**A. Committed synthetic acceptance corpus.**

- Generate deterministic candidate URLs and authored fixture pages from the
  pinned EasyList/EasyPrivacy snapshot: blocking rules, exception rules and
  near-miss negative controls. Commit the generator, seed, rule references,
  list hashes, fixture bytes and manifest under `fixtures/replay/`, with
  list-derived URLs, data and generated page content licensed under
  **CC BY-SA 3.0-or-later**, attributed to **The EasyList authors**, as
  specified in `fixtures/replay/NOTICE`. Preserve source hashes, source
  links and transformation descriptions with generated artifacts; the
  first-party generator and independently authored harness code retain
  their existing terms. Do not edit the packaged root
  `THIRD-PARTY-NOTICES.md` from this spike branch; any future integration
  into `main` must align its notices in that separate change. Rules seed
  candidates; they do not supply the expected block/allow answer.
- Keep the minimum **2,000 distinct URLs observed blocked and 2,000 distinct
  URLs observed allowed** by the real Electron provider. Repetitions,
  regular/private reruns and superficial identifier variants cannot pad
  these counts. Report unique rules, rule families and URL/context cases
  separately, with the selection and deduplication algorithm. If the
  threshold cannot be reached without padding, report the shortfall.
- Before capture, commit a coverage matrix mapping rule families and
  block/exception/negative cases to resource types, first- and third-party
  relationships, initiator and top-frame combinations, frame context and
  `profile_kind: regular|private`. Include same-origin and cross-origin
  frames, absent and opaque initiators, no-referrer requests, redirects,
  worker/service-worker and sender-teardown cases, and every request-path
  class in the audit (including keepalive/beacons, prefetch/prerender,
  worker scripts, WebSocket and WebTransport). Each applicable cell needs
  a runtime assertion and evidence; unsupported or unobservable cells stay
  explicit gaps, never implied passes or silently dropped rows. Explain
  genuinely inapplicable combinations. Meeting 4,000 URLs alone is not
  acceptance and does not close an unimplemented coverage path.
  Prioritize renderer subresources by resource type, first- versus
  third-party contexts, regular/private profiles and redirects, so the
  highest-priority criterion 3 evidence is gathered first. This ordering
  does not narrow criterion 3 or waive other cells. Given the unchanged
  two-week box, a partial matrix with explicit gaps is an expected possible
  deadline outcome, not a reason to extend the box or manufacture passes.
  Report each cell as passed, failed, gap or inapplicable with its evidence
  or reason; distinguish untested coverage from observed mismatches. A
  stopped spike with gaps is a valid measurement deliverable, not completed
  acceptance or a claim that criterion 3 passed. Apply the existing stop
  and kill criteria to the evidence actually obtained.
- Use actual browser loads, the real provider and startup gate, and the
  same origin-preserving offline transport with disposable fixture TLS in
  both browsers. No live upstream fallback. Observe each hook's actual
  URL, type, initiator presence/value, top-frame origin, frame context and
  profile kind independently using the reviewed context mapping. Never
  substitute referrer or frame origin for the initiator. Context mismatch
  remains a harness fault; absence and opaque `null` stay distinct.
- Produce the oracle from **two fresh offline Electron replays** of the
  identical manifest and response bytes. Require exact stable request,
  context and decision sets, retaining failed attempts; do not prune to an
  intersection. A source rule's predicted answer or unit-test mock is not
  an oracle. Record browser/build, engine artifact and list hashes,
  configuration, enabled rules and initialization/readiness settings for
  both browsers. Identical engine source alone does not establish identical
  behavior; configuration, initialization and integration can differ.
- Supply complete, safe, authored responses for **every candidate URL,
  including Electron-blocked requests**, and a manifest of their authored
  descendant requests. An incorrectly allowed script must execute that
  fixture behavior rather than receive a synthetic 502 that hides its
  children. Descendants that Electron never issued are reported separately
  as causally attributable fork-only behavior, not fabricated Electron
  decisions or additions to the oracle denominator. Unknown, unmanifested
  requests remain harness faults. Preserve direct block→allow differences
  even if a secondary harness fault occurs; do not discard or disguise
  them. If any missing response still prevents downstream execution, mark
  `downstream_behavior_tested: false` and qualify the false-negative count
  as a lower bound beside every reported rate.
- Preserve the three outcome groups already specified above: native CSS,
  procedural cosmetics with dynamic-node mutation assertions, and
  main-world document-start scriptlets. Counts of network decisions cannot
  substitute for DOM outcomes, scriptlet delivery or audited path coverage.
  Report results as **synthetic fixture parity**, not a measured real-web
  block rate or proof of complete real-world coverage.

**B. Separate private real-page sanity sample.**

- After approval, record at most five public, unauthenticated pages through
  a real browser network session in fresh disposable profiles, with a
  bounded 60-second observation per page. Use a distinct recording path;
  Node's upstream client is not this sample's browser transport. Do not
  bypass bot challenges, authenticate, import user profiles, autofill,
  submit forms, or record personal browsing. Record negotiated protocols
  and refusals; a failed page remains a failed observation.
- Keep response bodies, full-URL observations and any transient identifiers
  only on this Mac, outside the repository and synced folders, under an
  owner-only run directory under
  `~/Library/Caches/me.bnfy.blanc-f12-private-sanity/<run-id>/`
  (directories 0700, files 0600), with the expanded absolute path recorded
  locally. This avoids relying on temporary-directory retention, but a
  cache is not guaranteed storage: record any early eviction as lost
  evidence, never as a completed check. Do not persist Cookie, Set-Cookie,
  Authorization, Proxy-Authorization or credential material in recordings;
  fresh-session cookies needed by the browser remain ephemeral. Do not
  export profiles, HARs, raw stderr, screenshots, keys or individual URLs
  to GitHub, CI, remote artifacts or third-party analysis services.
- Delete disposable profiles and trust keys when each run ends; retain
  private recordings only until the earlier of seven days after capture
  or completion/stopping of spike A. Record the exact local path, expiry
  and cleanup result locally. Longer retention needs a separate owner
  decision. No raw data goes into the public evidence tree, even if a
  recording fails.
- Commit only reviewed, aggregate summaries: attempted/completed pages,
  requests and differences by resource type, first/third-party and profile
  class, refusal counts/reasons, observation bounds, tool/build identifiers
  and hashes of whole recording bundles. No per-URL hashes or identifiers.
  The private sample is excluded from the 2,000/2,000 threshold and all
  synthetic-parity denominators; report it beside those results as a
  limited realism check whose raw evidence is not publicly reproducible.
  If paired comparison is attempted, derive its oracle from two stable
  offline Electron replays, not the live acquisition; otherwise report
  observations only, without a parity claim.

**Unchanged limits.** This proposal does not reset either two-week box,
waive coverage gaps, change latency bounds or kill criteria, enlarge the
40-file/120-hunk budget, authorize a cold output or promote 157. Spike B's
reference to the same fixtures follows the amended definition only after
§8.1 approval. Record any effect on the remaining time box in the ledger;
no automatic extension. Existing §5 build guards and §6 exclusions remain.
The only proposed exception to committing corpus artifacts under §6 is the
bounded local private sample above. Implementation may resume under the explicit approval recorded in §8.1.

**Latency protocol.** The thresholds above are new proposals for this
tranche; plan §5 criterion 3 speaks only to block rate, so these bounds
decide which engine placement is tried, not whether the tranche stops.
Measurement: the timed interval is from the hook receiving the request
(throttle `WillStartRequest` or the factory proxy's entry) to the
block/allow decision being applied, **including** any Mojo round trip to a
utility-process engine; engine-internal time is recorded separately when
the engine exposes it. Runs: the corpus's 4,000+ requests replayed as page
loads with the browser's natural concurrency (not serialized), five
repetitions after one discarded warm-up repetition, on an otherwise idle
machine; p50, p95 and p99 reported per repetition and as the median across
repetitions. A **cold** figure is also recorded for the first 200 decisions
after engine load, reported separately and not held to the warm bound.
Clock: monotonic `base::TimeTicks` at both ends of the interval, logged by
the hook itself, not by the harness. Electron Blanc's own decision latency
is measured the same way where its `webRequest` path exposes it, for
reference, not as a bound.

Both browsers run the same corpus through the prototype's existing
browser-level harness style (CDP plus the origin-preserving transport),
never through unit-test mocks. The corpus and its Electron oracle run are the measured
baseline; "Electron Blanc's rate" means that run.

**Stop conditions for spike A** (each stops spike A only; spike B and items
3–6 continue, and only §7's kill criteria stop the tranche): the two-week
box ends; or neither engine placement meets the proposed latency bound; or
the hook requires patching the
network service or the extension system (plan §4 A, "never fork the
extension system"). A stop is recorded with the measurements taken.

## 3. F12 spike B: Manifest V2 audit and uBO runtime spike

**Question:** what does it cost, in patches and maintenance, to run Blanc's
pinned uBlock Origin 1.75.0 payload (`ublock/pinned.json`, the Electron
provider's reviewed source) as a Manifest V2 extension on the 157 fork, and
does it block at the rate the Electron provider achieves?

**Scope, two weeks, audit before runtime:**

1. **Audit (no build).** Enumerate every place the 157 checkout gates
   Manifest V2: manifest-version validation, the MV2 deprecation experiment
   stages and their kill switches, the enterprise-policy remnants, test-only
   and component-extension exceptions, `webRequestBlocking` availability,
   and the Chrome Web Store/update paths that refuse MV2. Each entry has
   file, line, what it does, and whether a default, a flag or a patch would
   change it. The audit is the deliverable even if the runtime spike stops.
2. **Runtime spike.** The minimum patch set that loads the pinned uBO
   payload as an MV2 extension with blocking `webRequest` in a regular
   profile (not the Store; the Store does not serve MV2 uBO), from Blanc's
   packaged payload as the Electron provider does. Private windows keep
   Blanc Blocker, as today.
3. **The reload gap.** Electron's host (`ublock-host-mainworld.js`) holds
   every decision until `µBlock.loadFilterLists()` settles because uBO on
   Chromium allows everything while it reloads lists. Spike B measures
   whether the fork has the same gap and what a browser-side hold costs in
   patches; a fork cannot ship the gap.

**Measurements:** block rate and cosmetic coverage on the same fixtures as
spike A; patch count by the same inventory; the audit's count of gates that
need a patch versus a default; whether each gate is one upstream is actively
removing (a patch against a removal in progress is maintenance cost that
compounds every two weeks).

**Stop conditions for spike B:** the audit shows `webRequestBlocking` or MV2
loading cannot be restored without patching the extension system's core
(plan §4 A rule 3); or the two-week box ends; or the runtime spike needs
more than §7's fixed tranche budget on its own. A stop is recorded with the audit; like spike A's, it stops spike B only.

**Not in spike B:** uBO Lite (MV3) as a provider. If both spikes stop, uBO
Lite is the third option to scope, as a separate request.

## 4. Items 3 to 6

- **A1 patch-budget design** (document): the `src/blanc/` layout, override
  files versus patches, the `patches/` apply script that fails on fuzz, and
  CI reporting of the count on every PR. The move itself is a build task
  for the tranche after Decision 2. The budget number and counting rules
  are **not** left to this document: §7 fixes them for the tranche so the
  stop condition is enforceable from day one; A1 may propose a different
  number for Decision 2, and may not retroactively relax a stop already
  hit.
- **Visual comparison**: Electron Blanc 1.36.0 and the 157 prototype at
  1200×900 and 600×420, light and dark, states resting / panel / palette /
  find / private, captured the same way, with every difference listed and
  classified as prototype-CSS (fixable), missing service (expected) or
  Chromium rendering (needs a decision).
- **VoiceOver pass**: the resting pill, the expanded panel, the Extensions
  view and the start page, with rotor order, labels and focus return after
  Escape; failures listed per control.
- **Cost sheet**: Task 0's numbers against the evaluation's table, with
  every remaining unknown named, in **three separate lines that are never
  summed into one fortnightly figure**: (a) *clean-build recovery*, the
  2h39m47s cold build, which recurs only on a new checkout, a toolchain
  change or cache loss, not per milestone; (b) *routine per-milestone
  maintenance*, the fetch, prepare anchors, compile fixes, incremental
  builds and re-verification, which is the fortnightly cost and is
  projected at the two-week cadence plus security respins; (c) the
  *extension-release wait*, calendar latency on a third party's release
  schedule that costs attention only at each daily check and is not
  labour per milestone. Owner attention and agent time are reported as
  measured or `not measured`, never inferred from calendar span.

## 5. Builds and the ledger

- All builds are guarded incremental builds in the existing 157 sibling
  output (`BlancChromium157/src/out/BlancPrototype`) through `build.mjs`.
  **No new cold output. No change to `args.gn`, Xcode or depot_tools. The
  156 checkout and output stay untouched.** A spike that needs a GN change
  regenerates with unchanged arguments and goes through the normal
  regeneration and buildflag stops.
- Every build invocation is logged in a new ledger section, "Tranche 2
  incremental builds", as routine builds; none is added to row 0's cold
  column. Agent start/stop intervals are recorded; owner attention is
  recorded when observed.
- Row 0 stays open on the upgrade gate while this tranche runs; the ledger
  notes that development continued on 157 with the gate open. If the gate
  *fails* rather than staying unobserved, promotion stops; the spikes' work
  is kept, since any later major needs the same port.

## 6. What approval covers, and what it does not

Covers: items 1–6 above, on the 157 sibling output with guarded incremental
builds; new files under `experiments/chromium-extension-spike/` (spike code,
evidence, documents); edits to `prepare.mjs` and the native bridge needed
by the spikes, on the prototype branch; draft PRs against
`codex/chromium-extension-spike`, merged on the owner's word.

Does not cover: Phase 3 parity porting beyond the two spikes; the A1 layout
move; Windows or Linux builders or builds; the data migrator; the updater or
cutover spike; any change to shipping Electron Blanc (a shipping bug found
on the way goes to `main` in its own PR, as #904 did); a general extension
runtime in Electron; any public claim about the fork; Decision 2 itself.

## 7. Kill criteria that apply during this tranche

**Provisional patch budget, fixed for this tranche:** **40 upstream files
and 120 hunks**, counted as follows. A *file* is an existing upstream file
that `prepare.mjs` (or, later, the `patches/` set) modifies; Blanc-owned
new files do not count; the two icon assets count as files. A *hunk* is one
`@@` section of a unified diff with zero context lines, produced
deterministically by

```sh
GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_NOSYSTEM=1 git diff \
  --unified=0 --inter-hunk-context=0 --diff-algorithm=myers \
  --no-indent-heuristic --no-renames --no-ext-diff --no-textconv --no-color --text \
  <upstream-tag> -- <text inventory paths>
```

run inside the patched checkout (or the same options with `--no-index`
against a pristine copy). Every option that shapes hunk boundaries is pinned
on the command line, which overrides repository, user and system
configuration, and user and system configuration are also excluded: without
the pins, settings such as `diff.interHunkContext` or `diff.algorithm` change
the count (reproduced: two changes separated by two unchanged lines count as
two hunks by default and one with `diff.interHunkContext=5`; the pinned
command counts two under a hostile user or repository configuration). The
counter records the Git version with each count. The count is taken over
the text files in the inventory, as the number of `@@` headers (`--stat` and `--numstat` count changed lines, not hunks, and are
not used; see <https://git-scm.com/docs/git-diff>). Adjacent changes
separated by at least one unchanged line are therefore separate hunks; `prepare.mjs` edits files in place and never renames them, so rename
detection is off; a mode-only change counts as zero hunks and one file. The
counter classifies a file as binary when either side's content has a NUL byte
in its first 8,000 bytes; changed binary content (including the two icon assets)
counts as one hunk and one file. Text diffs force `--text`, and applicable `diff`
and `binary` attributes are recorded rather than used to classify content. The counter is a
script in the experiments tree, run against the same pristine checkout the
inventory used, and its output is committed with each count. The count is produced by the same inventory method
as `evidence/rebase-157-20261016/patched-upstream-files.json`, run before
and after each spike, and recorded in the ledger. Today's count is **21
files**; the hunk count is measured at the start of the tranche and
recorded as the baseline. Each spike reports its own delta.

From plan §5: criterion 2 (the count above exceeds 40 files or 120 hunks and
cannot be moved into overrides within one sprint) and criterion 3 (neither
F12 option blocks at Blanc Blocker's rate on the replay corpus within the
budget). Either is recorded in the ledger and reported to the owner the day
it is hit; the tranche does not continue past it without a new decision.

## 8. Approval

- [x] Approved by the owner on October 17, 2026, in the Claude Code
      session after Codex cleared the request at `416b5ac` with no blocking
      findings: "Approve §8 as written". No change to order or scope: the
      F12 spikes first with no-build items 3–6 between builds, two-week
      boxes per spike, the proposed latency bounds (p99 2 ms in-process,
      5 ms over Mojo) retained, and §7's fixed budget of 40 upstream files
      and 120 hunks. The approval covers exactly §6; anything §6 excludes,
      including a new cold output, needs a new approval.

### 8.1 Corpus amendment approval — granted October 17, 2026

- [x] Approved by the owner on October 17, 2026 in this Codex session at
      reviewed commit `68892cc1b997694483af943de12a297b0f44175d`.
      Owner's exact words: "Approve §8.1 as written at 68892cc1. Record my
      approval, merge #916 once CI is green, and resume implementation."
      No changes to the reviewed scope, including the separate experiment
      cache namespace, were requested.

The original checked §8 approval remains historical. This separate explicit
approval covers §2.1 A's synthetic acceptance definition and B's bounded
local sample, with their reporting, retention and cleanup requirements and
all unchanged limits above; anything beyond them requires another decision.
Merging alone was not approval. The owner separately authorized merging
#916 once CI on its current head is green and resuming the amended work.

Earlier follow-up: browser-side pre-dispatch document constraints pass eleven
runtime checks across same-document, same-URL, cross-path and cross-origin
navigation, plus six helper/four completion regressions. Readiness leases cover
browser snapshots and bounded all-frame fanout; stale IDs are rejected after file
loading. Renderer-boundary navigation and original caller identity before the
snapshot remain gaps, alongside lifecycle/async effects. Evidence:
`evidence/f12-document-target-20261018/`. Footprint: 35 files / 79 hunks; one 317-second
incremental build, final guard zero actions. Spikes A/B in progress; items 3–6 not started.
Latency deferred; Electron diagnostic build §8 unchecked/unstarted. No promotion.
