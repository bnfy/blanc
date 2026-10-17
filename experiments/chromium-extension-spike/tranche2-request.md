# Tranche 2 request: the Decision 2 package, F12 first

**Status: awaiting the owner's written approval (§8). Nothing in this tranche
has started.** Task 0 measured a rebase (`rebase-ledger.md`, row 0: 2h39m47s
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
- Cosmetic filtering, two separate mechanisms. **CSS** (element hiding and
  procedural rules) is injected per frame as a user stylesheet or an
  isolated-world style injection; the page's CSP must not be able to block
  it, as it cannot block Electron's today. **Scriptlets** are different: the
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
| Decision latency | per-request p50/p99 for the throttle's decision, measured on a 200-request page load | p99 under 2 ms in-process; under 5 ms over Mojo; above that, the other engine placement is tried before concluding |
| Patch count | files and hunks touched outside `src/blanc/`, counted by the same inventory script as the ledger | fits the A1 budget once A1 names it; reported either way |
| Private windows | the same hook active in incognito, verified by the fixture | blocked, as Blanc Blocker protects private tabs today |

**Replay corpus.** The unit tests named in the plan (`adblock-youtube`,
`adblock-exceptions`, `adblock-events`, `adblock-engine-loader`) exercise the
engine against mocks, not a browser; they seed URLs but cannot be the
acceptance fixture. Spike A first builds `adblock/fixtures/replay/`
(committed, reviewed like the list snapshot):

- A request corpus of at least 2,000 requests the pinned lists block and
  2,000 they allow, each with URL, resource type, initiator and frame
  context, recorded from real page loads in Electron Blanc with the
  blocker's own decision logged as the oracle, served back from a local
  fixture server during replay so both browsers see identical traffic.
- Outcome pages: the existing YouTube fixture page plus synthetic pages
  that each exercise one class of cosmetic rule (element hiding,
  procedural, `:has`, scriptlet-dependent behaviour such as a patched
  `fetch` or a defused timer), with DOM assertions that state the
  expected post-filter state.
- A coverage page issuing one request of every path the audit found.

Both browsers run the same corpus through the prototype's existing
browser-level harness style (CDP plus the fixture server), never through
unit-test mocks. The corpus and its Electron oracle run are the measured
baseline; "Electron Blanc's rate" means that run.

**Stop conditions for spike A:** the two-week box ends; or neither engine
placement meets the latency bound; or the hook requires patching the
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
more than the A1 budget on its own. A stop is recorded with the audit.

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
contiguous replacement as `git diff --numstat`/`--stat` reports it against
the pristine checkout. The count is produced by the same inventory method
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

- [ ] Approved by the owner on `_______` (quote or link), with any change
      to the order or scope above noted here.
