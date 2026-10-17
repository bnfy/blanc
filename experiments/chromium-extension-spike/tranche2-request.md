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
- Request hook. The browser-process `URLLoaderThrottle` path
  (`ContentBrowserClient::CreateURLLoaderThrottles`) for every subresource
  and navigation request in regular and incognito profiles; no network-service
  patch. Decisions must fail closed while the engine is loading, matching
  `installStartupNavigationGate` in Electron.
- Cosmetic filtering. Declarative CSS and the bundled scriptlets from
  `adblock/sources/` injected per frame through a renderer-side agent
  (`RenderFrameObserver`) or an isolated-world user script; measured, not
  assumed, against the same fixtures.
- Lists. The pinned, hash-verified EasyList/EasyPrivacy snapshot from
  `adblock/sources/`, nothing fetched at startup; the same inputs as
  Electron so the comparison is like for like.

**Measurements (all recorded, with the harness in the evidence tree):**

| Measure | Method | Bound (from plan §5 criterion 3) |
| --- | --- | --- |
| Block rate | the `adUrls` and `normalUrls` sets in `test/unit/adblock-youtube.test.js` and the request fixtures behind `adblock-exceptions`, `adblock-events` and `adblock-engine-loader` tests, replayed through the fork and through Electron Blanc on the same lists | at least Electron Blanc's rate on the same set; any URL blocked by Electron and allowed by the fork is listed by name |
| Cosmetic coverage | the cosmetic and scriptlet cases in `adblock-scriptlets.test.js` and the YouTube fixture page, visually and by DOM assertion | parity with Electron on the same pages |
| Decision latency | per-request p50/p99 for the throttle's decision, measured on a 200-request page load | p99 under 2 ms in-process; under 5 ms over Mojo; above that, the other engine placement is tried before concluding |
| Patch count | files and hunks touched outside `src/blanc/`, counted by the same inventory script as the ledger | fits the A1 budget once A1 names it; reported either way |
| Private windows | the same hook active in incognito, verified by the fixture | blocked, as Blanc Blocker protects private tabs today |

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
  files versus patches, the `patches/` apply script that fails on fuzz, the
  budget (proposal to confirm: 40 files, 120 hunks, counted by the ledger's
  inventory script), and CI reporting of the count on every PR. The move
  itself is a build task for the tranche after Decision 2.
- **Visual comparison**: Electron Blanc 1.36.0 and the 157 prototype at
  1200×900 and 600×420, light and dark, states resting / panel / palette /
  find / private, captured the same way, with every difference listed and
  classified as prototype-CSS (fixable), missing service (expected) or
  Chromium rendering (needs a decision).
- **VoiceOver pass**: the resting pill, the expanded panel, the Extensions
  view and the start page, with rotor order, labels and focus return after
  Escape; failures listed per control.
- **Cost sheet**: Task 0's cold build, fetch, anchors, compile fixes and
  calendar span, projected at one rebase per two weeks plus security
  respins, against the evaluation's table, with every remaining unknown
  named.

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

From plan §5: criterion 2 (patch count exceeds the A1 budget and cannot be
moved into overrides within one sprint) and criterion 3 (neither F12 option
blocks at Blanc Blocker's rate on the fixture set within the budget). Either
is recorded in the ledger and reported to the owner the day it is hit; the
tranche does not continue past it without a new decision.

## 8. Approval

- [ ] Approved by the owner on `_______` (quote or link), with any change
      to the order or scope above noted here.
