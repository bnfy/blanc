# Audit: a native Swift macOS Blanc, with Electron kept for Windows/Linux

Date: September 2, 2026
Baseline audited: public v1.12.0 (`a117852`), working tree at `f5ed12e`
Status: assessment only. No decision has been made and no code exists.

## Verdict

A native Swift macOS Blanc is a second product, not a port, and it trades away
the feature Blanc is marketed on. The effort is on the order of the entire
Electron app again, the performance gain is real but modest and unmeasured, and
it cannot fit anywhere near the September 7–10 launch. Recommendation: do not
commit now. Run the bounded post-launch spike in the last section first.

## The engine decision drives everything

The only native macOS engine is WKWebView. Bundling Chromium (CEF or similar)
into a Swift shell keeps Chromium's memory profile and gains only native chrome,
so "Swift macOS Blanc" means "WebKit Blanc". Every consequence below follows
from that.

## Effort

### What exists today

| Measure | Value |
|---|---|
| Main-process JS | 25,910 lines (`src/main/main.js` alone 8,089) |
| Renderer JS/HTML/CSS | 19,513 lines |
| Unit tests | 186 files, 24,709 lines |
| Acceptance scenarios | 143 across 25 feature files in `spec/acceptance/` |
| Spec'd features / divergences | 38 (`spec/features.md`) / 26 (`spec/divergence-register.md`) |
| Electron desktop velocity | 821 commits, 84 tags between 2026-07-03 and 2026-09-02 |
| iOS Swift port so far | 2,977 lines, 26 commits between 2026-07-08 and 2026-08-31 |

### Calibration

The iOS port is the honest yardstick. About three thousand Swift lines cover
tabs, address input, the palette, session persistence, settings, a content
blocker, and the `blanc://` pages bridge, and that app is not tester-grade.

A macOS app at feature parity is estimated at 25–35k lines of Swift plus tests,
roughly 4–6 months at the current velocity for a first public release. These
are estimates, not measurements. After that first release every feature costs
twice, permanently, because Windows and Linux stay on Electron. The parity
substrate in `spec/`, `tokens/`, `settings-schema/`, and `copy/` was built for
exactly this split, so the contract is written down, but the desktop code is
not reusable.

### Items that get redesigned rather than ported

- **Blocking (F12, D1).** WKContentRuleList is declarative with a per-list rule
  cap, the same Manifest V3 constraint Blanc was built to escape. Scriptlets,
  cosmetic depth (D14), and shield-count fidelity (D13) all degrade. The
  site's headline claim would have to be rewritten under
  `docs/marketing-claims.md`. If this answer is bad, the direction is dead
  regardless of the memory numbers.
- **Chromium-specific work shipped in the last releases.** Configurable WebRTC
  receive buffering (v1.12.0, `webrtc-audio-buffer-preload.js` plus command
  line switches), encrypted DNS control (F25), hardened Electron fuses, the
  capture indicator preload, and the truthful `permissions.query` shim are all
  Chromium-shaped. Each is rebuilt against WebKit or dropped.
- **Profile migration.** The `JsonStore` files (settings, Favorites, history,
  downloads, adblock stats, profiles) are plain JSON and port cleanly.
  Chromium's cookie, localStorage, IndexedDB, and service-worker data does not
  read into WebKit, so every user is logged out of every site on the upgrade.
- **Updater handoff.** Moving existing installs from `electron-updater` to a
  Swift app under the same bundle id (`me.bnfy.bowser`) is unproven. It needs
  the staging rehearsal in `docs/staging-update-feed.md` to prove a packaged
  Electron Blanc can discover, download, and Restart Now into the native app,
  then a Sparkle chain going forward.
- **1Password login fill (F38, D26).** The Electron utility-process broker and
  the `Blanc Helper (Plugin).app` library-validation exception disappear. A
  Swift implementation would need its own SDK path and a fresh security review
  under `docs/1password-integration.md`.
- **Release pipeline.** `scripts/release.sh`, notarization via 1Password, the
  provisioning-profile and signing-certificate pin, `after-sign-verify.js`,
  fuse checks, packaged-payload verification, SBOM, and Sigstore steps are all
  Electron-shaped. The macOS half of `docs/release-verification.md` is
  rewritten from scratch while the Windows/Linux workflow stays as is.
- **Tests.** Pure policy modules (`tab-sleep.js`, `closed-tabs.js`, the
  `*-model.js` files) translate as specifications, not code. The 143
  acceptance scenarios need an XCUITest binding to replace the
  Playwright-Electron harness in `test/desktop/`.

## Performance

### Measured baseline

From the committed run `bench/memory/results/memory-2026-08-09T17-33-45-039Z.md`
(`phys_footprint` summed across the process tree, Blanc 1.1.0):

| Configuration | Memory | Processes |
|---|---|---|
| Blanc idle | 200 MiB | 6 |
| Blanc, 18 mixed tabs | 1.3 GiB | 18 |
| Blanc, blocking off, same workload | 4.2 GiB | 85 |
| Brave, same workload | 1.7 GiB | 20 |
| Chrome, same workload | 5.6 GiB | 85 |

### Expected change with a WebKit shell

None of this is measured in the repository. Treat every figure as a hypothesis
for the spike to test.

- **Idle** drops the most. Node, the two always-live chrome renderers (strip
  and overlay), and Electron's GPU process go away. Idle is expected to land
  well under half of today's figure.
- **Loaded** improves less. WebKit content processes are leaner than
  Chromium's, but the dominant saving, blocking, is already banked, and a
  weaker blocker gives some of it back. A 20–35% reduction at 18 tabs is a
  guess.
- **Startup and battery** favor native AppKit and WebKit on Apple silicon.
  Nothing in the repository quantifies either today.
- **The published figures are pinned.** `site/src/components/MemoryChart.astro`,
  `docs/press/fact-sheet.md`, and the committed run are held together by the
  `public-truth` test. A new engine means re-running the bench and revising all
  three together, with the Brave-is-the-fair-peer qualification intact.

### Gains that are not about speed

These may matter more than the memory delta:

- Native window material. The liquid-glass spike (`experiment/liquid-glass-island`,
  draft PR #74) was parked because same-window layering is impossible in
  Electron. A native shell gets that material on macOS 26 directly.
- Native menus, Services, Handoff, and system text behaviors without shims.
- A much smaller download and no Chromium bump per release on macOS.

## Recommendation

1. Do nothing before launch. Product merges stop Thursday, September 3 at noon
   ET, and the soak clock cannot absorb this.
2. After launch, spend at most two weeks on a throwaway WKWebView spike that
   answers only three questions:
   - Blocker fidelity: compile the pinned EasyList/EasyPrivacy snapshot through
     the `blocking-backends.md` pipeline and compare blocked-request counts and
     visible leftovers against the current engine on a fixed page set.
   - Updater handoff: prove, with the staging feed, that a packaged Electron
     Blanc can update into a native app under the same bundle id.
   - Migration experience: document exactly what a user sees when every site
     session is gone after the upgrade.
3. Decide only after the spike. If the blocker answer is bad, stop there.
