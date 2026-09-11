# iPhone Duo Mobile Migration Plan

> **For agentic workers:** this is a phased program plan, not a single task list. Each phase ends in its own `writing-plans` pass that produces a task-by-task implementation plan (the pattern the iOS port already follows: `2026-07-07-ios-m0-m1-walking-skeleton.md` through `2026-07-09-ios-m5-ad-blocking.md`). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Blanc for iPhone as an app that is native to iPhone Duo: one codebase that presents the Island correctly on the compact outer display (vertical controls), the regular-width inner display (standard bars in portrait, vertical controls in landscape), and every partially folded pose, without forking the product contract in `spec/`.

**Architecture:** iPhone Duo is an iPhone. The migration target is therefore the existing SwiftUI/WebKit port at `ios/Blanc/` (about 3,000 lines, milestones M0–M5 of `docs/superpowers/specs/2026-07-07-ios-port-roadmap-design.md`), not a new app and not a port of the Electron code. The work adds an adaptive layout layer (size class + control axis + fold state) beneath the Island, decomposes the resting pill into a horizontal readout plus system toolbar items on Duo's vertical axis, and makes every expanded surface fold-aware. Product behaviour stays governed by `spec/features.md`; every platform split lands in `spec/divergence-register.md` first.

**Tech Stack:** Swift 5 / SwiftUI with UIKit bridges where SwiftUI lacks an API, WKWebView, Xcode 27 with the iOS 27 SDK (the toolbar visibility-priority and overflow-menu APIs the HIG names are `iOS 27.0`), the generated substrate (`Tokens.swift`, `BlancSettings.swift`, `SlashCommands.strings`), the shared `blanc://` web bundle via `BlancSchemeHandler` + `PagesBridge`, XCTest, and the Gherkin suite in `spec/acceptance/`.

**Source studied:** Apple HIG, "Designing for iPhone Duo" (new page, September 9, 2026), read in full from its documentation JSON on September 10, 2026. Companion Tech Talks 111462 ("Raise the bar with iPhone Duo"), 111463 ("Strike a pose with adaptive layouts on iPhone Duo"), and 111466 ("Design for iPhone Duo") were not transcribable from this environment and are a Phase 0 viewing task.

---

## 1. What the HIG requires, in Blanc terms

| HIG rule | Consequence for Blanc |
|---|---|
| Two displays, compact-width outer and regular-width inner; design with size classes, not per pose | The iOS port needs a real compact/regular split. Today `ContentView` is one fixed bottom-pill layout. |
| Toolbars, tab bars, and navigation controls move to a vertical side edge on the outer display and on the inner display in landscape; only inner portrait keeps horizontal bars | The Island's action cluster and tab dots must be expressible as system toolbar items so they ride the vertical axis. |
| "Keep text-based buttons to a minimum. Labels that include text stay in a horizontal bar." | The domain readout is text. The system itself keeps text in a horizontal bar, so a horizontal address capsule is HIG-consistent even when controls are vertical. |
| Don't override default bar placement; follow the standard order (Back/Close first, then Done-class actions, then original groupings) | Blanc gives up hand-placed control positions and adopts `ToolbarItemGroup` placement with visibility priorities. |
| Items overflow bottom-to-top by default; assign visibility priorities; badge-carrying items stay visible longer; use the system overflow menu and reserve the ellipsis for it | Reload and New Tab get high priority; Downloads carries a badge while active; Blanc's slash-command list is not an overflow menu and must not use the ellipsis. |
| Provide a title and a symbol for every non-text toolbar item | Every Island action needs a shared-copy title. This is the open S3 copy slice. |
| Reserved regions: outer camera (always, grows into the Dynamic Island), inner camera (only while active; UI moves aside), folding region (only when partially open) | Custom surfaces must not sit under the camera or across the fold. The web view currently ignores the top safe area. |
| Alerts, context menus, sheets, and split views avoid the fold automatically; custom components use the reserved-region APIs | Palette, utility pages, permission prompts, and the shield popover should be system sheets/popovers/alerts so avoidance is free. The find capsule and the `blanc://` pages are custom and need explicit handling. |
| Prefer even column counts in grids; favor small adjustments over rearrangement when folding | Start-page layouts (`shelf`, `billboard`, Mahjong) need fold-aware column rules delivered through the pages bridge. |
| Arrangement views: split (horizontal when wider than tall, vertical when taller) and overlay (one view per half when partially folded) | The fold gives Blanc a natural two-pane surface: page on one half, command palette on the other. This is the Duo-specific feature worth building, after the basics. |
| Split View multitasking on the inner display; each app's controls go to its outer edge | Blanc must run at compact width beside another app and never require full screen. |
| Same functionality and element state across displays and poses | Opening or closing the device must preserve the active tab, scroll, input text, and expanded Island state. |

Not stated anywhere on the page: point dimensions, safe-area values, hinge geometry, or aspect ratios. Those come from the Apple Design Resources templates and the safe-area APIs at runtime, so no Blanc token may hard-code them.

---

## 2. Where the iOS port stands (measured September 10, 2026)

- `ios/Blanc/Blanc/` holds 20 Swift files and 2,977 lines including tests. Deployment target `17.0`, bundle id `me.bnfy.blanc`, iPhone and iPad orientation keys present, `SUPPORTS_MACCATALYST = NO`.
- Implemented: tabs model (`TabsManager`, `TabModel`), address normalization, OS hand-off, a bottom-anchored resting pill (`ContentView.addressPill`) with Liquid Glass fallback (D15), a `.sheet` palette with tabs / slash / Quick Switcher modes (`PaletteSheet`), `blanc://` scheme handler and pages bridge, a `WKContentRuleList` content blocker with binary protected state (D13), session and settings stores, theme resolution.
- Not implemented: tab groups, private tabs, favorites, history, downloads, permissions, find, TestFlight (roadmap M6 onward). The Swift audit of September 2 calls the app "not tester-grade".
- Contract deviations already present and worth fixing in passing: the pill caps tab dots at 3 (F1 says 8 plus `+N`; the M2 design chose 3 for mobile without a divergence entry), and `WebView` uses `.ignoresSafeArea(edges: .top)`, which on Duo puts page content under the inner camera's reserved region when it activates.
- The five iOS milestone plans record zero checked steps although the code exists. Phase 1 reconciles that bookkeeping.

---

## 3. Design decisions (recommendations to ratify in Phase 0)

### 3.1 Island decomposition on the vertical axis (new divergence, D27)

Three options were weighed:

1. **Rotate the whole pill vertical.** Rejected. The domain readout is text and becomes unreadable; the HIG itself keeps text labels in a horizontal bar.
2. **Keep the horizontal pill at the bottom and ignore vertical controls** (a "full-width immersive" layout). Rejected. The HIG permits full width only where bars are unnecessary. A browser's bar is necessary, and the outer display is short, which is the entire reason controls move sideways.
3. **Decompose (recommended).** The Island splits into two coordinated parts when the environment reports vertical controls:
   - **Island readout**: a horizontal capsule holding favicon, domain, the shield state, and the private chip. It is the tap target for the palette (D7) and the blank-tab text field (F37). It sits at the bottom of the content area on the outer display, inset by the asymmetric safe area so it never runs under the vertical bar or the camera. Full width of the remaining content area.
   - **Island actions**: the action cluster (reload/stop, favorite, close tab, downloads, new tab) and the tab dots become system toolbar items in `ToolbarItemGroup`s with visibility priorities, so bar compression, overflow, badge retention, RTL side-pinning, and camera avoidance are system behaviour. The dots render as a custom vertical stack (cap 8 plus `+N`, per F1) inside one toolbar item; tapping a dot switches tabs, tapping `+N` opens the palette.
   - On the inner display in portrait the environment reports horizontal bars and the existing single resting pill returns unchanged, so a Duo user sees the same Island as every other iPhone user whenever the device is open upright.

   Parity contract that still holds: identical contents and states (F1), identical actions, identical copy, one Island per window. Only the axis and the container differ.

### 3.2 Expanded states are system containers

Panel and palette are already one `.sheet` on iOS (tap the pill, per D7). Keep that. Sheets avoid the fold automatically. The shield popover becomes a system popover, permission prompts use system alerts, and the utility pages (favorites, history, downloads, settings, shortcuts) stay in a sheet-presented web view. Only two surfaces stay custom and need reserved-region handling: the find capsule (F8) and the `blanc://` page content itself.

### 3.3 Fold geometry reaches the web bundle through the pages bridge

The `blanc://` pages have no reserved-region API. The native side already pushes start-page data over `PagesBridge`; it will also push a fold descriptor (`{folded, axis, insetStart, insetEnd}` in CSS pixels relative to the page) that `pages.css` exposes as custom properties and a `data-fold` attribute on `<html>`. Layouts opt in with even column counts and a center gutter. This is a bridge message shape change, so it lands in the S4 substrate contract, not only in Swift.

### 3.4 Continuity is a state rule, not a layout rule

Opening or closing the device changes the size class. Nothing may be recreated on that transition: `TabsManager` and each `TabModel`'s `WKWebView` survive, the palette's typed input survives, find state survives, and the active tab's scroll position survives. Layout containers re-derive from the environment; models do not.

### 3.5 The Duo signature feature: fold to command (Phase 4, optional)

When the inner display is partially folded, an overlay arrangement puts the page on one half and the command palette (tab switcher, slash commands, Quick Switcher) on the other. In laptop pose this reads as "page above, keyboard and commands below". This is the one place Blanc should build something Duo-only, and it needs a D11 amendment because D11 currently reserves multi-pane surfaces to desktop unless a foldable contract adopts them explicitly. Glance (F34) on the inner display follows the same amendment as a split arrangement. Both wait for hardware.

### 3.6 What Duo does not change

Blocking stays declarative with binary protection state (D1, D13, D14). Renderer discard stays OS-governed (D23). Passkeys and AutoFill stay a mobile gain (D12). Updates stay store-managed (D9). Sync, telemetry consent, and Patron rules are untouched. No new synced setting is introduced; the control axis is derived from the environment, never stored.

---

## 4. Global constraints

- **Spec first, paired commits.** Every phase that changes behaviour edits `spec/features.md`, `spec/divergence-register.md`, `spec/parity-matrix.md`, and `spec/acceptance/` before or with the Swift change. New scenarios tag `@duo` and trace to `F#`/`D#`.
- **Substrate stays green.** New tokens go in `tokens/tokens.json` and are built with `npm run tokens:build`; new copy goes in `copy/` and is built with `npm run copy:build`; `npm run substrate:check` must pass on every commit. Never hand-edit `*/generated/`.
- **Minimum iOS stays 17.** Duo-specific APIs are gated with `#available(iOS 27, *)`, the same pattern D15 uses for Liquid Glass, so the app still builds and runs on the current floor.
- **No hard-coded Duo geometry.** Safe areas, reserved regions, and fold insets are read at runtime. Tokens may define Blanc's own spacing, never the device's.
- **Launch freeze.** Product and runtime merges to `origin/main` stopped September 10 at noon ET, and `origin/main` advances only for launch evidence and copy until the Show HN on September 15. This plan and its Phase 0 spec edits live on `claude/iphone-duo-hig-review-k9tdim` and merge after the Show HN post. No Swift work merges before September 17.
- **No public claims.** Per `docs/marketing-claims.md`, nothing about iPhone, iPhone Duo, or mobile appears in any article, post, listing, or site copy until an iOS release exists with its own evidence record.
- **Hardware honesty.** Until an iPhone Duo is in hand, every gate below is simulator-only and is recorded as such in `spec/acceptance/index.md`. A simulator pass never flips a row to `SHIPPED`.

---

## 5. Phases

### Phase 0: Decide and specify (docs only, about one week)

**Files:**
- Modify: `spec/divergence-register.md` (new D27; amend D7, D11, D19)
- Modify: `spec/features.md` (F1 platform note; F8, F16, F35 fold clauses; F34 Duo note)
- Modify: `spec/parity-matrix.md`, `spec/acceptance/index.md`
- Create: `spec/acceptance/iphone-duo.feature`
- Modify: `spec/shared-substrate.md` (S3 island-action copy slice; S4 fold descriptor)
- Modify: `copy/slash-commands.json` or create `copy/island-actions.json` plus `copy/build.mjs` support
- Modify: `tokens/tokens.json` (mobile island geometry group)
- Modify: `docs/superpowers/specs/2026-07-07-ios-port-roadmap-design.md` (append a Duo addendum pointing here)

- [ ] **Step 1: Watch the three Tech Talks** *(open: needs a person with video access; not doable from a headless session)* (111462, 111463, 111466) and record the exact API names for arrangement views and reserved regions in a `references/` note. As of September 10 neither appears in the public SwiftUI or UIKit documentation index, while `ToolbarItemVisibilityPriority`, `ToolbarOverflowMenu`, `UIBarButtonItemVisibilityPriority`, and `UINavigationItem.additionalOverflowItems` do, all at iOS 27.0. Download the iPhone Duo templates from Apple Design Resources for the safe-area values.
- [x] **Step 2: Write D27** *(done 2026-09-11, proposed status; awaiting owner ratification)* ("iPhone Duo vertical-axis Island decomposition") with the option analysis from section 3.1 and the parity contract. Amend D7 to add Duo triggers (tap readout = palette; toolbar items = action cluster). Amend D11 so a foldable inner display may adopt a two-pane surface under an explicit contract. Amend D19 to say the vertical tab dots on Duo are a presentation of the same tab model.
- [x] **Step 3: Amend the features.** F1 gains a platform note referencing D27 and keeps the 8-dot cap as the contract on every platform. F8 states the find capsule avoids reserved regions. F16 and F35 state that internal pages receive fold geometry and use even column counts when folded. F34 records the Duo inner display as a permitted, PLANNED surface.
- [x] **Step 4: Write `iphone-duo.feature`.** Scenario ids follow the suite's `F<feature>-<n>` rule, all tagged `@duo @ios @mobile @D27`:
  - `F1-3` Outer display shows the readout capsule and vertical action items with Reload and New Tab visible at the top of the axis.
  - `F1-4` Opening the device in portrait restores the single resting pill without reloading the page or losing typed palette input.
  - `F1-5` Inner display in landscape places controls on the side; in Split View they sit on Blanc's outer edge.
  - `F1-6` Downloads item stays visible under compression while a download is active.
  - `F1-7` Partially folded inner display keeps the palette sheet, permission prompt, and shield popover off the folding region.
  - `F1-8` Inner camera activation moves the pill and page content out of the camera region and back when it deactivates.
  - `F8-2` Find capsule moves off the folding region without closing.
  - `F35-7` Start page `shelf` renders an even number of columns and no content across the fold when folded.
- [ ] **Step 5: Add the copy slice.** Titles for reload, stop, favorite, unfavorite, close tab, downloads, new tab, tabs, and overflow, generated to `.strings` and `.xml`, guarded against the desktop action-cluster labels in `index.html`/`overlay.js` the same way slash commands are.
- [ ] **Step 6: Add tokens.** `island-readout-height`, `island-readout-radius`, `island-dot-size`, `island-dot-gap` under a `geometry` group with a `mobile` consumer; extend `tokens/build.mjs` so `mobile`-only tokens are emitted to Swift/Kotlin and skipped by the desktop CSS guard.
- [ ] **Step 7: Run the gates.** *(spec half run 2026-09-11 after Steps 2–4; rerun after Steps 5–6)* `npm run substrate:check` and `npm run test:acceptance:dry` pass. Commit as the paired spec commit.

**Gate:** spec files describe the Duo contract completely enough that a Swift engineer needs no HIG page open to build Phase 1 and 2.

### Phase 1: Toolchain and adaptive skeleton (M0/M1 refresh, one to two weeks)

**Files:**
- Modify: `ios/Blanc/Blanc.xcodeproj/project.pbxproj` (Xcode 27 recommended settings; keep `IPHONEOS_DEPLOYMENT_TARGET = 17.0`; `UIRequiresFullScreen` absent or false; all orientations)
- Create: `ios/Blanc/Blanc/LayoutPosture.swift` (environment model: size class, `controlAxis` `.horizontal|.vertical`, `foldState`, camera reserved-region presence)
- Modify: `ios/Blanc/Blanc/ContentView.swift`, `ios/Blanc/Blanc/WebView.swift`
- Create: `ios/Blanc/BlancTests/LayoutPostureTests.swift`
- Modify: the five iOS milestone plans' checkboxes to reflect what shipped

- [ ] **Step 1: Toolchain.** Build and run on the iPhone Duo simulator profiles that ship with Xcode 27 in both outer and inner configurations, plus an iPhone 17 simulator and an iOS 17 simulator for the floor. Record the exact `xcodebuild -destination` strings in `ios/README.md`.
- [ ] **Step 2: Reconcile the milestone bookkeeping.** Tick the steps that exist in code; list the ones that do not as the remaining M2–M5 debt.
- [ ] **Step 3: `LayoutPosture`.** A pure value type derived from `horizontalSizeClass`, `verticalSizeClass`, orientation, safe-area asymmetry, and (gated at iOS 27) the fold and reserved-region signals. Unit-test the derivation table: outer = compact + vertical controls; inner portrait = regular + horizontal bars; inner landscape = regular + vertical controls; Split View compact = compact + vertical on Blanc's outer edge.
- [ ] **Step 4: Safe areas.** Remove `.ignoresSafeArea(edges: .top)` from the web view; let WKWebView receive the real safe-area insets so pages using `viewport-fit=cover` get correct `env()` values and the inner camera region is honoured. Verify no double inset appears on non-Duo iPhones.
- [ ] **Step 5: Continuity.** Prove with a UI test that toggling the simulator between outer and inner configurations keeps the same `WKWebView` instance, scroll offset, and `PaletteSheet` input.

**Gate:** the existing pill renders correctly on both Duo simulators with nothing under the camera or vertical bar; `LayoutPostureTests` green; floor simulator unaffected.

### Phase 2: The Island on the vertical axis (M2/M3 rework, two to three weeks)

**Files:**
- Create: `ios/Blanc/Blanc/IslandReadout.swift`, `ios/Blanc/Blanc/IslandActions.swift`, `ios/Blanc/Blanc/TabDots.swift`
- Modify: `ios/Blanc/Blanc/ContentView.swift` (compose by `LayoutPosture`), `ios/Blanc/Blanc/PaletteSheet.swift`
- Modify: `ios/Blanc/Blanc/TabsManager.swift` (close tab, favorite hook, downloads badge count placeholders)
- Create: `ios/Blanc/BlancTests/IslandCompositionTests.swift`, UI tests for F1-3, F1-4, F1-5, F1-6

- [ ] **Step 1: `TabDots`.** Horizontal and vertical variants from one model: standalone pins, then the active section, cap 8, `+N` opens the palette. Fixes the 3-dot deviation.
- [ ] **Step 2: `IslandReadout`.** Favicon, domain, shield state, private chip; Liquid Glass on iOS 26+, token surface below (D15). Blank-tab state reads as a text field (F37).
- [ ] **Step 3: `IslandActions`.** `ToolbarItemGroup`s: navigation group (Close Tab), primary group (New Tab, Reload/Stop, high priority), secondary group (Favorite standard, Downloads standard with badge, Tabs standard). Titles from the copy slice, SF Symbols for every item, no text-only items. Ellipsis reserved for the system overflow. All gated at iOS 27 with a horizontal-pill fallback below.
- [ ] **Step 4: Compose.** `ContentView` chooses: vertical controls → readout at the bottom of content + `IslandActions` in the toolbar; horizontal bars → the single resting pill. Transition is a layout change only; no model recreation.
- [ ] **Step 5: Split View.** Verify at compact width beside another app on the inner simulator that controls follow Blanc's outer edge and the readout respects the opposite edge.
- [ ] **Step 6: Update the matrix.** F1 iOS stays `PARTIAL` with a note that F1-3/4/5/6 pass on simulator.

**Gate:** F1-1 through F1-6 iOS step definitions pass on both Duo simulators and on the floor simulator.

### Phase 3: Fold-aware surfaces (M4 rework plus early M8–M12 items, two to three weeks)

**Files:**
- Modify: `ios/Blanc/Blanc/PagesBridge.swift` (fold descriptor message), `src/renderer/pages/pages.css`, `src/renderer/pages/newtab.js`, `src/renderer/pages/mahjong.js`
- Create: `ios/Blanc/Blanc/FindCapsule.swift`, `ios/Blanc/Blanc/ShieldPopover.swift`, `ios/Blanc/Blanc/PermissionPrompt.swift`
- Modify: `spec/shared-substrate.md` S4 (already specified in Phase 0), `test/unit/` coverage for the CSS fold rules

- [ ] **Step 1: Fold descriptor.** Native pushes `{folded, axis, insetStart, insetEnd}`; the bundle sets `--fold-inset-start`, `--fold-inset-end`, and `data-fold`. Desktop's `pages.js` never sets them, so desktop rendering is unchanged; a unit test asserts the default is the unfolded state.
- [ ] **Step 2: Start-page layouts.** `shelf` and `billboard` snap to even column counts and a center gutter when `data-fold` is set; `ledger` and `tally` keep their columns off the fold; Mahjong keeps the board on one half and the controls on the other. No horizontal overflow at any width (F35).
- [ ] **Step 3: Find capsule.** Custom view anchored to the bottom of the content area, repositioned by the reserved-region API when folded; page stays interactive (F8).
- [ ] **Step 4: Shield popover and permission prompts.** System popover and system alerts with the shared copy; automatic fold avoidance.
- [ ] **Step 5: Utility pages.** Confirm the sheet-presented web view honours the fold and that outbound links open real tabs (F16).

**Gate:** F1-7, F1-8, F8-2, F35-7 pass on simulator; `npm run test:unit` covers the CSS fold defaults; internal-pages and newtab-layouts scenarios in the iOS column move from ⬜ to simulator-verified.

### Phase 4: Fold to command and Glance (Duo-only, after hardware, two weeks)

**Files:**
- Create: `ios/Blanc/Blanc/FoldedCommandArrangement.swift`, `ios/Blanc/Blanc/GlanceArrangement.swift`
- Modify: `spec/divergence-register.md` D11 status, `spec/features.md` F34, `spec/parity-matrix.md`

- [ ] **Step 1: Overlay arrangement.** Partially folded inner display: page on one half, palette on the other, with the palette's input focused so the keyboard lands on the lower half in laptop pose. Collapse the secondary view when not folded so the ordinary sheet returns.
- [ ] **Step 2: Split arrangement for Glance.** A second local tab as a reference pane on the inner display; promotion and dismissal semantics from F34; never crosses a window or profile.
- [ ] **Step 3: Hardware acceptance** on a physical iPhone Duo in book, flat, and standing poses. Record results in `spec/acceptance/index.md`.

**Gate:** owner decision to ship; F34 iOS row moves from `N/A` to `PARTIAL` or `SHIPPED` with hardware evidence.

### Phase 5: Beta and evidence (M6 with Duo in scope)

- [ ] **Step 1: TestFlight.** Provisioning for `me.bnfy.blanc`, the default-browser entitlement request (the roadmap's long pole), App Store Connect screenshots captured on both Duo display configurations and a standard iPhone.
- [ ] **Step 2: Acceptance grid.** Every `@duo` scenario (F1-3–F1-8, F8-2, F35-7) and every iOS row it touches is recorded as simulator-verified or hardware-verified, never blank.
- [ ] **Step 3: Release record.** A dated incident-style record under `docs/release-incidents/` for the first iOS build, mirroring the desktop discipline. Only after it exists may `docs/marketing-claims.md` admit any iPhone or iPhone Duo claim.

---

## 6. Risks and open questions

- **Unverified API names.** Arrangement views and reserved-region APIs are described in the HIG but not yet in the public documentation index. Phase 0 Step 1 resolves this; Phases 3 and 4 depend on it. If the APIs are UIKit-only, the SwiftUI app hosts them through `UIViewControllerRepresentable`.
- **WebKit under the fold.** Whether WKWebView exposes reserved regions to page content, or only safe areas, is unknown. The pages bridge design in 3.3 assumes it does not, which is the safe assumption.
- **Hardware availability.** Every gate before Phase 4 is simulator-only. Poses cannot be fully exercised in a simulator; hinge-angle behaviour is a hardware test.
- **Split View multitasking on iPhone** is new. Blanc must not assume full-screen width or a single window scene; the current single `TabsManager` is fine because Split View pairs Blanc with another app, not with itself.
- **Effort.** The iOS port shipped roughly 3,000 lines in eight weeks and is pre-beta. Phases 0 through 3 are estimated at six to nine weeks of the same cadence; these are estimates, not measurements. Duo work does not shorten the roadmap's M6–M16 ladder; it restructures M2–M4 so the adaptive layer is built in rather than bolted on.
- **The launch calendar.** No Swift work merges before September 17, 2026. If the launch schedule moves, this plan's start moves with it and never competes with the release soak.

## 7. Out of scope

- Porting any Electron code. The desktop app remains the reference implementation per `spec/README.md`.
- Android. The Kotlin substrate outputs continue to be generated; nothing here consumes them.
- iPad multi-window and hardware-keyboard shortcuts (D7, D11), except where Duo's Split View forces resizing support.
- Any change to blocking fidelity, shield-count semantics, or the S1 pipeline.
- Recapturing desktop launch media or editing `site/` for mobile.
