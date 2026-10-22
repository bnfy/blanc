# Migrate to a Chromium fork: implementation plan

**Primary implementation plan — status reconciled October 21, 2026.** This remains the governing plan and ordering for Chromium migration. The owner explicitly requested that ongoing work update this plan. The [Mac preview checklist](../experiments/chromium-extension-spike/mac-preview-release-checklist.md) is a supporting readiness checklist, not a replacement roadmap, authorization, or waiver of the gates below. Historical estimates are not a current release ETA.

### Current execution status

Evidence base: [tranche plan and dated checkpoints](../experiments/chromium-extension-spike/tranche2-request.md), [rebase ledger](../experiments/chromium-extension-spike/rebase-ledger.md), [runtime results](../experiments/chromium-extension-spike/results.md). “Implemented / bounded evidence” does not mean full parity or release acceptance. The October 16 narrative below is retained as a dated baseline; this reconciliation supersedes its status claims where explicitly identified.

| Primary plan item | Current status | Completed evidence and next requirement |
| --- | --- | --- |
| §6 Task 0 / §4 A2 rebase | **Measured; gate still open** | Chromium156→157 cold recovery recorded at2h39m47s, one broken anchor/API change. Native scoped acceptance performed. Authentic Google-endpoint extension version upgrade on retained157 baseline still pending; no promotion or `passed` rebase outcome. Human attention/cost is not inferred from build duration. |
| §4 A1 patch design | **Drafted; implementation/review incomplete** | [A1 design](../experiments/chromium-extension-spike/a1-patch-budget-design.md) exists. Latest explicit budget58files/133hunks; fresh footprint56/133. Owner now permits budget increases without repeated approval, with later consolidation and recorded totals. Older49/120 or50/118 figures are historical. Layout move and authoritative native inventory CI remain open. |
| §4 B Island / §3 F2,F6,F7,F8,F28 | **Implemented in parts; acceptance in progress** | Rail, split rows/numbered commands, native Restore Tab, find, menus, divider and pane controls have bounded evidence. Same-size visual checks exist but complete composed parity/VoiceOver/native physical-input acceptance is not closed. |
| §4 C / F12 blocker spikes A and B | **In progress, not accepted** | [Aggregate acceptance matrix](../experiments/chromium-extension-spike/f12-acceptance-status.md) and Spike A report entry point now consolidate network/cosmetic/runtime and lifecycle evidence. [Request-path reconciliation](../experiments/chromium-extension-spike/evidence/f12-reconciliation-20261021/README.md) now maps13rows and verifies38archives/1,269members. Current-head equivalence remains open. Four native keepalive/beacon sender-close schedules now pass for pre-enqueued POST307 continuation; broader teardown/retry and paired parity remain open. Socket/speculation source disposition is complete: native socket adapters were missing at that source checkpoint, ordinary prefetch needs runtime proof, and pre-prefetch/prerender remain conditional. Native WebSocket gate now has18 bounded decisions/eight successful handshakes; ten bounded pending socket lifecycle schedules now pass; WebTransport now has eight real HTTP3 baseline/enforcement controls; twelve WebTransport worker/lifecycle schedules now pass boundedly; remaining teardown/composition and speculation gaps stay open. No final spike acceptance or engine decision asserted. Qualified latency remains explicitly deferred; diagnostic Electron build remains unapproved/unstarted. |
| §3 F15,F16,F35 / §4 D,H themes and extensions | **Scoped implementation and native acceptance recorded** | Island Store results/icons, installation/permission Cancel, removal branding/menu, theme apply/Undo/removal/restart, theme-aware controls, installed-theme management and Extensions branding implemented. Does not close all internal pages, locales, extension matrix or signed native-host integration. |
| §3 F18,F32,F33,F41 session / windows / profiles / Spaces | **Implemented in parts; bounded recovery passes** | Identity-based persistence, partial-close reconciliation, failed-write retry, cross-owner saves, profile-deletion cancellation and Split ratio intent recovery implemented. [Latest retry repair](../experiments/chromium-extension-spike/evidence/ratio-flush-retry-fix-20261021/README.md):6schedules60checks; [capped/shutdown checks](../experiments/chromium-extension-spike/evidence/ratio-cap-shutdown-20261021/README.md):4schedules32checks. These do not certify arbitrary crashes/power loss, full profile product parity, original-profile migration, or physical recovery UI. |
| §3 F34 Glance / persistent Split View | **Partial migration against #993** | Reference is PR993 commit98ea48fc, mapped in [Split View migration](../experiments/chromium-extension-spike/split-view-migration.md). Persistent multiple/inactive/private snapshots, grouping, headers/divider, rail, shortcuts, Recently Closed and native restore have bounded evidence. Full Glance conversion/parity and cross-window whole-split drag remain open; old Glance alone is not the migration target. |
| §2 Decision2 package visual comparison | **Started, incomplete** | Multiple geometry/theme/native checkpoints exist; full matched resting/panel/palette/find/private comparison and final diff disposition still required. |
| §2 VoiceOver / cost sheet | **Not completed** | No complete VoiceOver acceptance or staffing/CI cost sheet established by this reconciliation. Keep as next Decision2 deliverables; do not substitute CI or elapsed build time. |
| §4 E data migration / G cutover / I release | **Unqualified** | No production Electron→Chromium profile/updater handoff, rollback or signed public native artifact acceptance claimed. Preview checklist tracks a proposed narrower track, requiring explicit scope approval. |
| §4 F infrastructure / beta gate | **Partial test infrastructure; gate open** | Native CDP fixtures and focused tests exist. Hosted PR green runs include Electron jobs, not full native Chromium spec acceptance on three platforms. Latest verified all-pass headede130ce:27pass/2skip, CodeQL no new alerts; later evidence/checklist head1bacf7e7 published, CI not rechecked in this documentation task. |
| Decision2 / public release | **Not approved by this reconciliation** | Keep existing gate sequence. Owner-authorized prototype follow-ups are not blanket migration/release authorization. |

### Next work under this primary plan

1. Consolidate outstanding F12 A/B acceptance artifacts and A1 review; list missing qualifications without silently running deferred latency or the unapproved Electron diagnostic build.
2. Finish the Decision2 package: matched visual comparison, owner-assisted physical-input/VoiceOver session and staffing/CI cost sheet. Keep the real Google upgrade gate monitored separately.
3. Update §3 feature status as work lands; each completion needs a linked bounded result and remaining acceptance gap. Prioritize reproducible enabled-feature data-loss/security failures over an unlimited interleaving matrix.
4. Use the supporting Mac checklist to prepare scope/isolation/packaging choices, then obtain the required owner decisions. Do not move cutover, migration or existing beta gates into a “follow-up” bucket without explicit approval.

Documentation reconciliation only: no builds, runtime tests, profile changes, publication or release actions. Native input pending; latency deferred; Electron diagnostic build pending approval/unstarted.

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
