# Migrate to a Chromium fork: implementation plan

**Status (October 16, 2026): a plan for Decision 2, not a commitment.** Shipping
Blanc stays on Electron. The owner reopened the platform question on
October 15 and authorized a time-boxed prototype under
`experiments/chromium-extension-spike/`; this document turns what that
prototype has shown into the work a migration would need, in order, with the
evidence each step must produce and the conditions under which the owner
should stop. It does not authorize a production migration, a public release, a
general extension runtime in Electron, or any work outside the prototype
directory and its branch. Only Decision 2 does that, and the first task below
exists to give Decision 2 the one number it still lacks.

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
- Six real extensions enabled (Bitwarden, 1Password, React Developer Tools,
  Grammarly, MetaMask, Tampermonkey): MV3 service workers, content scripts,
  messaging, storage, action popups from a native button, persistence across a
  full relaunch, and an update fetched from Google's update endpoint
  (Bitwarden 2026.9.3 → 2026.10.0). Authenticated features (vault sign-in,
  wallet signing, desktop pairing) remain untested by design.
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
  changes ship with `prepare.mjs --assets-only` and no compile. Incremental
  native builds for the milestones above took 32–60 s each.

**Confirmed divergences from Electron Blanc** (each one is a `D#` candidate
for `spec/divergence-register.md` if the migration proceeds, not a bug):

| Behaviour | Electron | Chromium prototype |
| --- | --- | --- |
| Grouped pins | A pinned tab stays in its group and leads it | Chromium unpins a tab when it is grouped |
| ⌘1–⌘9 with groups | nth cluster | nth tab |
| Mute | Per-tab | Per-tab `WebContents` mute (Chromium's site-level mute unused) |
| `/clear` | Blanc history only | `HistoryService` visits only (not Clear browsing data) |
| Favicons for history rows | Captured pixels | Chromium cache or letter fallback; nothing fetched |
| Favorites manager | `blanc://bookmarks` sheet | `chrome://bookmarks/` in a tab |

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
evaluation's 2–5 engineer-days per Chromium major is a hypothesis, and the
owner's October 5 decline rested entirely on that cost. Section 6 makes it the
first engineering task.

## 2. Gates, restated with evidence

The evaluation doc defines four gates. This table says what each needs and
what exists today. A gate passes only on recorded evidence of the kind named
here; never from source inspection, an unpacked extension, or a harness
result that was not reproduced with real input.

| Gate | What it requires | Evidence present | Evidence missing |
| --- | --- | --- | --- |
| **Spike gate** (end of Phase 1) | Measured rebase cost; Web Store acceptance; CEF control test | Web Store acceptance passed October 16 (`results.md` §§ Normal Web Store installation, Verified version upgrade, Extension compatibility matrix). CEF control test moot: option C was built directly. | **One measured rebase** of the prototype patch set onto the next Chromium major, with wall-clock and human time recorded (Task 0, §6). |
| **Kill gate** (end of Phase 2) | Patch budget held; action popups attach to the Island; pixel parity without a UI rewrite; measured rebase and security cost fits available staffing | Popups: pass (native button inside the resting Island, real `ExtensionsToolbarButton` anchor). Pixels: the Island renderers are the Electron files, copied by `prepare.mjs`, so parity is by construction for the strip and overlay; the start page likewise. Island input routing: pass with CGEvent input. | Patch budget: not yet defined for the fork layout (§4, A1). Accessibility: no VoiceOver pass recorded. Staffing fit: depends on Task 0. Windows/Linux: nothing. |
| **Beta gate** (end of Phase 3) | Spec acceptance suite green on macOS, Windows and Linux against the Chromium build | None. `test/desktop/` drives Electron through `src/main/test-hook.js`; no Chromium adapter exists. | A Chromium test hook, a Playwright/CDP launch path for the fork, and green runs on three platforms (§4, F). |
| **Cutover gate** (Phase 4) | Installed-upgrade spike: `electron-updater` hands off to the Chromium build on all three platforms with user-data migration, signing and publisher continuity, rollback and updater-ownership handover | None. | Everything in Workstream G; a proven Restart Now from the immediately preceding public Electron Blanc on each platform, as the release protocol already demands of every Electron release. |

**Decision 2 is taken after the kill gate, before Phase 3.** The minimum
package for it: Task 0's measured rebase, the A1 patch-budget design with the
current count against it, the §3 parity table updated with whatever has
been built by then, a VoiceOver pass of the Island on the Mac, and a
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
| F12 | Ad/tracker blocking | **Missing** | Rebuild. Options: (a) Blanc Blocker on Chromium's network service through a `URLLoaderThrottle`/`WebRequest`-style hook plus cosmetic injection as a renderer-side user script; (b) managed uBO as a packaged MV2/MV3 extension, which depends on the fork's MV2 policy (§7). Either way the shield count, per-site allow and the popover are Blanc UI over the chosen engine. Highest-risk workstream. | L |
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
- **A2. Rebase cadence.** Task 0 (§6) first. Then a scripted rebase runbook:
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
MV2 policy for uBO (§7); account-dependent passes for 1Password and
Bitwarden in a **signed** fork build; the simple MV3 fixture from the original
acceptance matrix.

### I. Release engineering and compliance

Per-platform signing and notarization from CI, the authenticated manifest,
SBOM and provenance as today, `THIRD-PARTY-NOTICES.md` regenerated for the
Chromium tree (BSD-3 plus its bundled notices; the reserved identity assets
and MIT first-party carve-outs unchanged), Widevine through castlabs or a
documented absence, Safe Browsing and other Google services replaced or
disabled with a recorded decision each.

## 5. Ordering, sizing and kill criteria

Sequence (each box gated by the previous one's evidence):

1. **Task 0: measured rebase** (§6). One to two weeks of calendar, mostly
   build time. Produces the spike gate's missing number.
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

The first engineering task, and the only one this plan asks to start now.

**Goal:** apply the current prototype patch set to the next Chromium major
after 156 (whichever is on the stable or beta channel when the task starts)
and record what it costs.

**Procedure (owner's Mac, with the build-cache rules in `AGENTS.md`):**

1. Do **not** touch `out/BlancPrototype`. Create a second checkout or
   worktree of the Chromium source at the new tag and a second output
   directory with the same `args.gn`; this is an intentional cold build, the
   only one the task needs, and under the build-cache rule in `AGENTS.md` it
   starts only after the owner has approved it in writing with its disk and
   time cost stated. Record its wall-clock time, which is also the first
   measured respin cost without a cache.
2. Extend `prepare.mjs` to accept the new version (it refuses unknown
   versions by design) and run it. Every anchor that no longer matches is one
   line in the ledger: file, hunk, cause (moved, renamed, API changed), minutes
   to fix.
3. Build with `build.mjs --record-environment` against the new output
   directory, fix compile errors, ledger each.
4. Re-run the prototype's automated checks and the native-input checklist
   from `results.md` (Web Store install, one extension update, Island tab
   control, Favorites, groups). Ledger failures.
5. Record: upstream tag, total calendar time, owner attention time, agent
   time, anchors broken, files patched before and after, compile errors, and
   check results, as a dated section in `results.md` and a row in a new
   `experiments/chromium-extension-spike/rebase-ledger.md`.

**Done when:** the ledger row exists and the prototype passes the same checks
on the new major, or the task has stopped on criterion 1 with the ledger
explaining why. Either outcome is the deliverable.

## 7. Open questions carried forward

- MV2 in the fork: Chromium's own MV2 removal is enterprise-policy-gated in
  this era. Decide whether the fork keeps MV2 loading for the managed uBO
  provider (a Blanc policy default and a patch to maintain) or ships uBO Lite
  / Blanc Blocker only. Needed before F12's option (b) is scoped.
- Private tabs in a regular window (F4) versus incognito windows: a product
  decision with a large patch delta; recommend the divergence.
- Which of Reopen Closed Tab's three tiers survive (F2): Tier 1's parked live
  view has no Chromium equivalent; recommend Tiers 2 and 3.
- F38: does the 1Password extension's desktop integration work in a signed,
  notarized fork? If yes, the broker, the `disable-library-validation`
  exception and the fill-status capsule retire together.
- Widevine via castlabs (asked October 5, awaiting a reply) and the Google
  service replacements, both inherited from the evaluation doc.
- Whether macOS builds can leave the owner's machine (A4); without that,
  criterion 4 is hard to meet.
