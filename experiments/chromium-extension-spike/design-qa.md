# Expanded Island extension picker QA

final result: passed

Source visual truth: user-selected option 2,
`/Users/anthonyjloria/.codex/generated_images/01a1414c-5d22-7bc3-b975-4ab604814052/exec-e202aae4-eba9-4e99-9a4d-bddffebb269d.png`.
Implementation: real Blanc Prototype Chromium window, permanent isolated profile,
`chrome://blanc-prototype/host.html` over the Blanc new tab page.

## Evidence and normalization

- Source: 1487×1058 image, generated browser frame approximately 1360×930 at (63,44).
- Normalize that browser region to 1224×837 (90%) for comparison with the actual app's 1224×837 logical window. Source has no declared device pixel ratio; this scale aligns its 690px panel with the native 620px design size.
- Native screenshot: 2448×1674 at device scale 2, captured by macOS without window shadow, reduced to 1224×837 for comparison.
- `evidence/extensions-reference.png` and `evidence/extensions-final.png` were viewed together in the same comparison input. State: light theme, expanded Extensions view, six installed actions, empty focused search, highlighted row. An additional focused comparison used `extensions-reference-detail.png` and `extensions-final-detail.png`, both 622×617 regions at (300,7).
- The focused comparison selects Bitwarden in both. Real alphabetical ordering places it second, instead of the mock's first position. The actual page retains its existing date/Customize controls; the mock omits those. These are intentional content differences, not a change to the new-tab design.
- `evidence/extensions-narrow.png`: native 600×420 logical window, rendered at 1200×840 and normalized to 600×420. List scrolls; footer and traffic lights remain visible. `extensions-resting.png` records the single-button resting Island.

## Findings and iteration history

1. [P1, resolved] The first native panel had an opaque white WebView rectangle across the page. Set both the host CSS and native WebContents background transparent. Revised native evidence shows the real page around the panel.
2. [P2, resolved] Native icons were padded in a 32px icon request. Request Chromium's 16px toolbar icon at its 2× representation; retain its native badges/state. The revised capture shows recognizable real extension icons.
3. [P2, resolved] Initial UI used Inter throughout, instead of Blanc's Instrument Sans. Use bundled Instrument Sans at width 98 and +0.01em, retaining Inter on key caps. Live font loading was verified; final focused evidence shows the corrected typography.
4. [P2, resolved] A narrow window showed the resting pill behind the expanded view. Hide the strip with visibility while the view is open, preserving its geometry for native popup anchoring; restore on close/back. Final narrow evidence shows a single panel beneath native traffic lights.

Final full-view and focused comparison found no remaining actionable P0/P1/P2 issues.

## Required fidelity surfaces

- **Typography:** bundled Instrument Sans, 15px row titles, 13px secondary copy, 16px heading, 11px keyboard footer; Inter key caps. Hierarchy and readable density follow the target. Native font choice takes precedence over guessing the generated image's font. Long installed names truncate on narrow widths with full native tooltips.
- **Spacing/layout:** centered 620px panel, 18px radius, 64px rows, 44px search, 48px heading. The panel is approximately 598px high versus the normalized mock's 617px: the small difference retains all six rows and the same hierarchy. Small windows place it below traffic lights and scroll only the list. Background page remains interactive outside the panel.
- **Colors/tokens:** white surface, warm selected row, subdued secondary text and rules, gold focus ring and Get extensions text. The visible focus ring is deliberately stronger than the mock for keyboard focus. No page tint or decorative overlay was added.
- **Images/assets:** actual installed extension icons from Chromium, including Bitwarden's grayscale and 1Password's lock badge. These reflect live extension state and intentionally differ from the mock's simplified brand logos. Navigation/footer icons reuse committed app SVGs. Existing Sunrise wallpaper remains the actual new-tab background. Native toolbar icons can appear softer at 36px than marketing logos; higher-resolution native action artwork is optional P3 polish.
- **Copy/content:** real installed names, alphabetic order, native tooltip text. Generic "Open extension" describes the actual browser action; no invented per-extension capability text. Enter replaces the mock's Cmd+number hints to retain Chromium tab-selection shortcuts. Search, back, Esc, Manage, Get, and keyboard footer match the intended hierarchy.

## Interaction and runtime verification

Actual native button and row clicks, search, no matches, Cmd+A, arrows, Enter,
Escape, back, reopening, Cmd+L/T, native popups/onboarding for six extensions,
manager and store links, pin independence, disable/re-enable refresh, and small
window layout were exercised. Missing activation, stale active tab and unknown
extension ID are rejected by the native bridge. Console/exception and bridge
status capture found no errors during final search/open/close interaction.
See `evidence/extensions-controls.json` for observations.

Account-authenticated workflows, wallet signing, user-script execution, and
production rollout are outside this picker smoke test. No credentials were
entered. Temporary test tabs were removed and existing pin settings restored.

## Implementation checklist

- [x] Single resting native Extensions button; no pinned icon accumulation.
- [x] Expanded picker backed by Chromium's installed action model.
- [x] Genuine native action execution and popup anchor.
- [x] Native input and responsive verification.
- [x] Revised source/render comparison and evidence saved.
- [x] Incremental native builds and final zero-action build preflight.

P3 follow-up: consider a larger native action-image source if Chromium exposes it
without losing dynamic badges. No blocking visual finding remains.


Post-handoff correction: the owner identified an oversized resting Extensions
glyph (20px versus adjacent 16.09px SVG boxes). Reduced it to 16px in Island
windows. Same-scale native crops `evidence/extensions-icon-before.png` and
`evidence/extensions-icon-after.png` were viewed together: size and baseline
now align with neighboring controls. Native picker and Bitwarden popup retested.
This finding is resolved; final result remains passed.


Placement follow-up: moved Extensions into the existing right-side action group
with Reload and Close, reducing inter-group whitespace to the shared 1px gap.
Native same-scale before/after crops in `evidence/extensions-spacing-*.png`
confirm the tighter cluster; native picker and popup activation passed.


Hover/spacing follow-up: the native Extensions hit box remained wider than its
neighbors, and Close had a solid hover fill. Resolved by using 26×26 logical
footprints for all three actions with identical measured gaps (1.1484375px),
and matching circular hover colors and foregrounds. Native screenshots
`evidence/controls-hover-{light,dark}-{extensions,reload,close}.png` were viewed
together per theme at identical 2× density. Both themes show equal highlight
diameters and consistent color/spacing. Physical picker, popup, Reload and Close
checks passed. The default appearance and original tabs were restored.
Final result remains passed.


Dynamic header follow-up: passed. Native full-window captures were inspected for
light and dark fixtures, scrolling, MetaMask and the expanded Extensions panel.
The frame and page have no divider or mismatched band; pixel checks across the
seam match exactly on eight captured surfaces. Live CSS transitions and NTP
wallpaper fades change the header continuously. Native tab changes bypass the
snapshot polling delay. Only the 68px header is opaque, leaving page content
visible outside expanded panels. Private fallback, narrow layout, extension
popup and NTP typing checks passed. Original tabs/preferences and window size
were restored; local fixture history/TopSites entries were cleaned up. Evidence
and input-method qualifications are recorded in results.md and evidence/header-*.


Sunrise Dark Dock icon: passed. The actual native Dock capture
`evidence/dock-sunrise-dark.png` was viewed and shows the gold Sunrise artwork
on the dark tile. Verified after relaunch with the existing permanent profile;
tabs and extension popup behavior were preserved. The runtime icon refresh
replaces the stale Chromium tile while reusing the shipping icon artwork.

## Island extension removal — October 20, 2026

Right-click installed Island rows now opens the native extension menu with **Remove from Blanc**. Native Store installation, confirmation Cancel preserving the extension, and confirmed removal updating the picker pass in a disposable profile; eight focused tests and scoped lint pass. Existing native policy and active-tab/user-activation guards are retained. Final zero-action guard passes after two successful incremental builds and one retained include failure. No upstream hooks added: prior measured 50 files/118 hunks remains within 50/120. Evidence: [island-extension-removal-20261020](evidence/island-extension-removal-20261020/README.md). Retained preview untouched; private/managed/localized/platform matrices remain open. Latency deferred; Electron diagnostic build unapproved; all unrelated recovery and migration gaps unchanged.

## October 20 — Public Split View controls and pane headers

PR993-based Split with choices are available in the Island tab menu; initiating group wins. Reserved30px persistent-pane headers provide live title/favicon, focus, Back and Remove from Split. Removal retains both tabs and puts the removed pane after its survivor. Final21 automated regular/private checkpoints and seven capture tests pass, including public menu activation, header focus/title, order and Spaces save/reopen. Initial const compile failure retained; incremental repair48.76s/11steps, guardzero. Fresh50files/116zero-context hunks within50/120. Evidence: `evidence/split-public-controls-20261020/README.md`.

Still open: public Glance Keep as split, full pane menu/divider, exact unequal-width alignment, rail clustering/shortcut semantics, whole-split Recently Closed, Back history scenario, physical input/full visual and broader lifecycle. Menu choices are currently a scrollable list rather than nested submenu. Latency deferred; Electron diagnostic build unapproved; retained preview untouched.

## October 20 — Split View divider and pane menus

PR993-based persistent divider drag, keyboard sizing/reset and accessible values now control the native ratio, with ordered visible-pair validation. Pane menus provide reload, per-tab mute, pin, remove and close; Escape returns focus. Final 37 automated regular/private checkpoints and seven capture tests pass, including saved 55/45 ratio recovery and destructive pane actions. Initial compiler shadowing failure and inactive-private-fixture timeout retained; repaired incremental build 35.17s/six steps, final guard zero. Fresh footprint 50 files/118 hunks within approved50/120. Evidence: `evidence/split-divider-menus-20261020/README.md`.

Remaining: full-height/narrow-window alignment, complete group/move/whole-split menu parity, public Glance conversion, rail/shortcut/Recently Closed integration and broader lifecycle/physical-input/accessibility checks. Header handle only; no full visual parity claim. Retained preview untouched; latency deferred and Electron diagnostic build unapproved.

## October 20 — Full-height divider / narrow geometry checks

Thirty actual regular/private window cases captured at1200/900/700/600/500px and20/50/80 percent. Four width500 extreme-ratio header-overflow failures remain; no repair yet. Pinned PR993 pure layout expects stacked rows in12 width600/500 cases, whereas native stays side-by-side. Full-height source audit also finds double-click swap versus #993 reset and50px versus percentage keyboard steps. These native-input behaviors remain unverified: CUA selected retained preview, so no input was sent. Evidence: `evidence/split-narrow-geometry-20261020/README.md`.

No compile/product changes; zero-action guard, prior50/118 unchanged. Next: coordinate narrow fallback/native/header geometry and divider semantics, then test native full-height hit regions. Green CI does not close these runtime parity failures. Latency deferred; Electron diagnostic build unapproved; retained preview untouched.

## October 20 — Narrow layout and full-height divider repair

Owner approved51 files/120 hunks. The native layout hook now shares page/header/gutter geometry: minimum300px columns, stacked rows below612px, focused-pane fallback for short windows. Fallback preserves saved column ratios. Full-height Island gutter double-click resets widths without swapping; transient fallback resize is refused. Former500px header overflow is repaired in all four cases.

Final context-matched regular/private matrix:30 geometry cases plus wide-return ratio/full-height CDP reset/short-focus/Spaces observations (71 records including30 pre-resize snapshots). Existing37 pane/menu regression checkpoints, seven capture tests and eleven counter tests pass. Compiler failures and zero-size probe runtime failure retained; probe publication fixed. Incremental successes48.98s and36.01s; final guardzero. Fresh51 files/120 hunks is at the approved ceiling. Evidence: `evidence/split-narrow-fix-20261020/README.md`.

Physical native hit-testing, broad accessibility, rail/fullscreen/drag-drop and display-scale/lifecycle matrices remain open. No full acceptance claim. Retained preview untouched; latency deferred; Electron diagnostic build unapproved.
