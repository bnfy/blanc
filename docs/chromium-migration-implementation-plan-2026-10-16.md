# Migrate to a Chromium fork: implementation plan

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

## 1. Where the prototype stands

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
what exists today. A gate passes only on recorded evidence of the kind named
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
| F12 | Ad/tracker blocking | **Missing** | Rebuild. Options: (a) Blanc Blocker on Chromium's network service through a `URLLoaderThrottle`/`WebRequest`-style hook plus cosmetic injection as a renderer-side user script; (b) full uBO, which needs Manifest V2: Chrome's supported MV2 use ended with Chrome 139, enterprise exception included (§7), while this checkout still carries MV2 handling, test overrides and component exceptions, so restoring a supported full-uBO path requires a source/API audit and a runtime spike; the required patches and their maintenance cost remain unknown, and option (b) is not a policy default. Either way the shield count, per-site allow and the popover are Blanc UI over the chosen engine. Highest-risk workstream; its estimate is unknown until both spikes run. | L+ |
| F13 | Permissions | Chromium prompts | Rebuild the explicit policy and copy over `PermissionRequestManager` with a Blanc prompt view; the held-view denial rules become moot or divergences | M |
| F14 | Settings | Missing | Port `blanc://settings` as WebUI; `settings-schema` stays the source; Chromium prefs only for things Chromium owns | M |
| F15 | Theming | Done (system/dark/private tint) | Port; drive `ThemeService`/`NativeTheme` from the setting | S |
| F16 | Internal pages | newtab only | Port the remaining pages as WebUI documents with the sheet surface | M |
| F17 | Patron and app icons | Missing | Port (main-process activation becomes a browser-process service) | S |
| F18 | Session persistence and restore | Chromium's | Decide: keep Chromium's `SessionService` and import `session.json` once, or port Blanc's v2 format. Recommend import once, then Chromium's. | M |
| F19 | Context menu | Chromium's | Port the Blanc actions into `RenderViewContextMenu` overrides | S |
| F20 | HTTP auth policy | Chromium's dialog | Override `LoginHandler` to fail the challenge silently | S |
| F21 | Telemetry | Missing | Port (browser-process service; same endpoints and consent rules) | S |
| F22 | Distribution and updates | None | Workstream G | L |
| F23 | Zoom | Native | Keep | — |
| F27 | Tab Sync | Missing | Port `sync.js` and `sync-crypto.js`; `safeStorage` becomes `OSCrypt` | M |
| F28 | Vertical tabs | Missing | Port the rail as a side WebUI panel | M |
| F30 | Favorites import | Missing | Port over `BookmarkModel` | S |
| F31 | Quiet Tabs | Missing | Rebuild on Chromium's discarding (`TabLifecycleUnit`); the dirty probe, `sessionStorage` rule and "quiet" vocabulary need a divergence review | M |
| F32 | Independent windows | Native | Keep; the window-runtime registry collapses into `BrowserWindowInterface` | S |
| F33 | Local profiles | Missing | Rebuild on Chromium `Profile`s; import `profiles.json` | M |
| F34 | Glance | Missing | Rebuild as a side-by-side `WebContents` in the browser view, or defer as a divergence | M |
| F35 | Start page layouts | Done (bookmarks, TopSites) | Port the remaining data hooks (blocked counts, groups, other devices) | S |
| F36 | Onboarding | Hidden | Port once privacy consent and import exist | S |
| F37 | Blank tab type-to-open | Done | Keep | — |
| F38 | 1Password fill | Missing | Decide: the 1Password **extension** installs and runs (F38's reason to exist was Electron's lack of it); keep the broker only if the extension's desktop integration fails in a signed fork build | S (decision) |
| F40 | Bring Your Tabs | Planned on Electron | Rebuild against Chromium sessions when F18 is decided | M |
| F41 | Blanc Spaces | Missing | Port the saved-set model over native groups and `TabStripModel` | M |
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
