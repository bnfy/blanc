# Press page design QA

## Comparison target

- Source visual truth: `/Users/anthonyjloria/.codex/generated_images/019fc113-3c4e-7ee0-afea-7e8233576373/exec-a6cabc12-2b28-4a9c-9bd2-c1867624d457.png`
- Browser-rendered implementation: `/Users/anthonyjloria/Projects/Blanc Browser/output/press-redesign/hig-type-final-top.png`
- Latest combined comparison evidence: `/Users/anthonyjloria/Projects/Blanc Browser/output/press-redesign/design-qa-hig-comparison.jpg`
- Full editorial-layout comparison evidence: `/Users/anthonyjloria/Projects/Blanc Browser/output/press-redesign/design-qa-comparison-v3.jpg`
- Focused top-of-page evidence: `/Users/anthonyjloria/Projects/Blanc Browser/output/press-redesign/hig-type-final-top.png`
- Focused product/proof evidence: `/Users/anthonyjloria/Projects/Blanc Browser/output/press-redesign/hig-type-final-middle.png`
- Focused comparison-table evidence: `/Users/anthonyjloria/Projects/Blanc Browser/output/press-redesign/implementation-v3-scroll-1260.png`
- Revised Press Assets evidence: `/Users/anthonyjloria/Projects/Blanc Browser/output/press-redesign/press-assets-v2.png`
- Press Assets before/after comparison: `/Users/anthonyjloria/Projects/Blanc Browser/output/press-redesign/design-qa-press-assets-comparison.jpg`
- Cross-platform launch evidence: `/Users/anthonyjloria/Projects/Blanc Browser/output/press-redesign/press-platforms-top.png`
- Island-demo source state: `/Users/anthonyjloria/Projects/Blanc Browser/output/press-redesign/press-product-before-island-demo.png`
- Interactive Island implementation: `/Users/anthonyjloria/Projects/Blanc Browser/output/press-redesign/press-product-island-demo-final.png`
- Island before/after comparison: `/Users/anthonyjloria/Projects/Blanc Browser/output/press-redesign/press-product-island-comparison-v1.png`
- Clean shipping-build capture: `/Users/anthonyjloria/Projects/Blanc Browser/output/press-redesign/press-wikipedia-clean-v1.png`
- Expanded-tabs pre-fix state: `/Users/anthonyjloria/Projects/Blanc Browser/output/press-redesign/press-expanded-tabs-before-fix.png`
- Expanded-tabs refined state: `/Users/anthonyjloria/Projects/Blanc Browser/output/press-redesign/press-expanded-tabs-after-fix.png`
- Expanded-tabs before/after comparison: `/Users/anthonyjloria/Projects/Blanc Browser/output/press-redesign/press-expanded-tabs-comparison.png`
- Route: `http://127.0.0.1:4321/press`
- State: light theme, page top followed by the first 2,406 CSS pixels of the page.

## Viewport and normalization

- Source raster: 913 × 1,723 pixels. It represents the selected 1440-wide editorial concept, scaled by ImageGen into a 913-pixel raster.
- Implementation viewport: 919 × 802 CSS pixels in the Codex in-app browser.
- Browser-reported device pixel ratio: 2. The browser screenshot API normalized captures to 919 × 802 output pixels, so no additional density downsampling was required.
- Implementation comparison composite: three contiguous 919 × 802 browser captures at scroll positions 0, 802, and 1,604, appended to 919 × 2,406 pixels.
- For the shared comparison input, the source was proportionally resized from 913 to 919 pixels wide and top-aligned on a 919 × 2,406 white canvas. No implementation geometry was stretched.
- Latest HIG legibility check: source resized to 1,159 pixels wide and cropped to the matching 1,159 × 802 top region; implementation captured at 1,159 × 802 CSS pixels. Both were placed in `design-qa-hig-comparison.jpg` without stretching.
- Island redesign comparison: both before and after states were captured at the same 1,280 × 720 CSS-pixel viewport and appended without resizing in `press-product-island-comparison-v1.png`.

## Full-view comparison evidence

The combined comparison shows the selected hierarchy preserved in the implementation: compact masthead, oversized launch claim, release metadata column, an interactive enlarged Blanc Island with four annotations, a clean secondary shipping-build capture, five-column proof strip, black-accented category comparison, and newsroom band. The implementation continues with the requested announcement, factual release details, reviewer path, trade-offs, and direct press contact.

## Focused-region comparison evidence

- Hero: `implementation-v3-top-refined.png` confirms the headline now wraps to two lines, the release metadata remains legible, one primary action dominates, and the real product appears immediately below the fold.
- Product evidence: `press-product-island-demo-final.png` confirms the enlarged Island now owns the visual hierarchy, while `press-wikipedia-clean-v1.png` confirms the real 1400 × 875 shipping capture remains undistorted and free of surrounding callouts.
- Category comparison: `implementation-v3-scroll-1260.png` confirms that the five-column proof strip and selected black Blanc comparison column retain the editorial rules.
- Newsroom: `press-assets-v2.png` confirms that the real product is now the dominant press asset, the launch card is distinctly branded, and release verification is separated from editorial downloads.

## Required fidelity surfaces

- Fonts and typography: passed after a second iteration and rechecked for the live demo. Inter Variable and JetBrains Mono are the existing site fonts and match both the editorial concept and shipping Island. The headline weight, metadata tracking, and compact uppercase labels preserve the intended hierarchy. A final computed-style audit of the product section finds zero visible text elements below 12 CSS pixels.
- Spacing and layout rhythm: passed after one iteration. Section rules, asymmetric grids, product annotations, proof columns, comparison density, and newsroom alignment match the reference. The implementation deliberately adds vertical room below the newsroom for substantive press content.
- Colors and visual tokens: passed. The page uses the existing Blanc white, near-black, quiet-gray, and 1px-rule token system with no gradients or invented color.
- Image quality and asset fidelity: passed. The lead download is a real 2784 × 1824 native Blanc product capture, and the new 2400 × 1260 launch card combines the actual product UI, Blanc mark, and existing brand typography. The interactive Island uses real website captures for every displayed site, including a 2597 × 1494 crop of the supplied CNET page, plus the live publication favicons for The Verge, 9to5Mac, and CNET. The page also retains the real shipping `vertical-tabs.png` and BrandMark component. Images retain their declared dimensions and aspect ratios; no placeholder product imagery was introduced.
- Copy and content: passed. The selected category thesis is preserved, while generated/invented details were replaced with repository-grounded facts: Anthony J. Loria, Bananify, macOS/Windows/Linux availability, DMG/NSIS/AppImage formats, built-in network blocking, private in-memory sessions, optional E2EE sync, no required account, no built-in agent, and deliberate absence of an extension marketplace.

## Interaction and browser checks

- Primary review-build link resolves to the platform selector, while the verification panel retains a direct Apple Silicon DMG link for reviewers who need that artifact.
- “Read announcement” scrolls to `#announcement`; verified section top at 24px after navigation.
- “Press assets” scrolls to `#newsroom`; verified section top at 24px after navigation.
- Product capture and launch-card links retain download behavior.
- The new product capture and launch card loaded at 2784 × 1824 and 2400 × 1260 respectively; no broken images were found.
- One H1 and a semantic comparison table are present.
- Browser reload produced no `pageerror` event and no console event during the error-check window.
- No horizontal overflow was present at the 919px desktop viewport.
- The Island opens and collapses from both the pill and state control; Escape collapses it and returns focus to the pill.
- Typing `/` renders six real command rows, typing `not` reveals Notion, and choosing that row updates the resting domain/shield before collapsing.
- The final 1,280 × 720 Island-section audit found no broken images, no console errors, no horizontal overflow, and a 12px visible-text floor.
- The named demo group reads “tech news,” contains The Verge, 9to5Mac, and CNET, and opens with The Verge active against the matching page capture.

## Comparison history

### Iteration 1

- [P2] Desktop composition collapsed too early at 919px.
  - Evidence: the initial implementation used the 940px breakpoint, turning the five proof columns into two columns, moving product annotations under the image, and reducing the newsroom to two columns. The selected source keeps all three regions in their desktop composition at a comparable raster width.
  - Fix: lowered the desktop-collapse breakpoint to 800px.
- [P2] Hero headline wrapped to three lines and weakened the selected launch claim.
  - Evidence: `implementation-v3-top.png` showed “Blanc 1.0 / replaces the / browser toolbar.” while the source uses two lines.
  - Fix: widened the hero copy track, reduced the metadata track and grid gap, adjusted the display scale, and increased the headline measure.

### Post-fix evidence

- `implementation-v3-top-refined.png` shows the intended two-line headline and balanced metadata column.
- `design-qa-comparison-v3.jpg` shows the desktop product annotations, five-column proof strip, comparison table, and three-part newsroom restored.
- No actionable P0, P1, or P2 differences remain.

### Iteration 2 — HIG legibility

- [P2] Supporting mono text was too small at normal viewing distance.
  - Evidence: the browser computed-style audit found 94 visible text leaves below 13px, including 9.5px release labels, callout copy, comparison headers, newsroom metadata, captions, and fact labels.
  - Fix: established a 12px visible-text floor across the Press page, raised supporting prose to 13px where appropriate, enlarged comparison cells and resource labels, and widened product annotation columns from 125px to 150px so the larger copy wraps cleanly.
- Post-fix evidence: `design-qa-hig-comparison.jpg`, `hig-type-final-top.png`, and `hig-type-final-middle.png` show the larger type without headline drift, broken grids, image distortion, or horizontal overflow. The final computed-style audit reports zero visible text elements below 12px at the 1,159px viewport.

### Iteration 3 — press assets and platform clarity

- [P2] The original Press Assets band gave the screenshot, logo, launch card, and checksum nearly equal weight, so it did not tell an editor which image best demonstrated the product.
  - Evidence: `design-qa-press-assets-comparison.jpg` shows the old uniform resource grid beside the revised newsroom at the same final 1159 × 802 comparison size.
  - Fix: promoted a native 2784 × 1824 product capture to the lead asset, paired it with a 2400 × 1260 on-brand launch card, and moved supporting downloads into a quieter utility row.
- [P2] SHA-256 verification read like a mysterious press asset.
  - Fix: moved the manifest into a dedicated “review build verification” panel and explained it as the cryptographic fingerprint a reviewer compares against a downloaded installer.
- [P1] Release messaging over-indexed on the direct macOS DMG and could make Blanc appear Mac-only.
  - Fix: made `macOS · Windows · Linux` and `DMG · NSIS · AppImage` explicit in the hero, facts, launch card, and review path; the primary CTA now routes to the platform selector.
- Post-fix evidence: `press-assets-v2.png`, `press-verification.png`, and `press-platforms-top.png` show the revised hierarchy, plain-language verification copy, and cross-platform launch positioning without horizontal overflow at 1159 × 802.

### Iteration 4 — the Island as the product hero

- [P1] The annotated Wikipedia screenshot made the webpage and vertical-tabs rail the dominant visual, while Blanc’s primary differentiator—the Island—was a small detail.
  - Evidence: the left side of `press-product-island-comparison-v1.png` shows the Island occupying only a small fraction of the 836px-wide screenshot, with four callouts competing around it.
  - Fix: added an enlarged, source-faithful v1.0 Island recreation on a subdued real web-page capture. The resting pill expands into authentic tab groups, filters tabs and slash commands, switches domains, responds to Escape, and includes reduced-motion behavior.
- [P2] The callouts explained details too small to inspect at the scale where they appeared.
  - Fix: moved and rewrote the four annotations around the 640px expanded Island, where dots, groups, input, page actions, and footer controls are directly visible.
- [P2] The Wikipedia frame was carrying both product proof and explanatory annotation.
  - Fix: removed every surrounding callout and promoted it to a clean, downloadable secondary “Shipping build” capture below the interactive feature.
- Post-fix evidence: `press-product-island-demo-final.png`, `press-product-island-comparison-v1.png`, and `press-wikipedia-clean-v1.png`. No actionable P0, P1, or P2 differences remain.

### Iteration 5 — expanded-tab fidelity

- [P1] Every expanded tab row inherited the browser’s native button background, making all six rows look selected and flattening the active-tab hierarchy.
  - Evidence: the left side of `press-expanded-tabs-comparison.png` shows opaque gray rows throughout; the computed non-active background was `rgb(239, 239, 239)`.
  - Fix: explicitly reset tab buttons to transparent, reserve the accent tint for the active row, and use the surface color only on hover/focus.
- [P2] The demo’s initial expanded geometry was looser than the shipping panel.
  - Fix: matched the source panel’s 620px width, 10px/12px padding, 10px radius, 28px input/actions, 32px tab rows, 14px favicons, and tighter footer rhythm.
- [P2] Domains and tags competed with every tab title at rest.
  - Fix: matched Blanc’s quiet-row convention—secondary metadata remains reserved but fades in only for the active, hovered, or keyboard-focused row.
- Post-fix evidence: `press-expanded-tabs-after-fix.png` and `press-expanded-tabs-comparison.png`. Interaction regression checks still pass for command filtering, tab filtering, selection/collapse, and Escape; final audit reports zero console errors, broken images, horizontal overflow, or text below 12px.

### Iteration 6 — editorially relevant tab group

- [P2] The generic “launch” group mixed GitHub and Blanc, which did not reinforce the press-page context or demonstrate how named groups organize a coherent browsing task.
  - Fix: replaced it with a three-tab “tech news” group featuring The Verge, 9to5Mac, and CNET, using each publication’s real favicon.
- [P2] GitHub remained visible behind the Island after The Verge became the active tab.
  - Fix: replaced the backdrop with a real 1280 × 720 The Verge capture so the active domain, favicon, group contents, and page content tell the same story.
- Post-fix evidence: `press-tech-news-group.png`. The local browser audit confirms all three tabs, The Verge as the resting domain, no broken images, no horizontal overflow, and no console errors.

### Iteration 7 — complete tab-switching state

- [P1] Choosing a row changed the resting domain but left The Verge visible behind the Island, so the interaction looked cosmetic rather than like a browser switching tabs.
  - Fix: wired every visible row to a bundled capture of its actual website, including the supplied CNET page.
- [P1] Restoring the expanded list reset the active highlight to The Verge even after another site had been chosen.
  - Fix: promoted the selected domain to persistent demo state and now rebuilds the active row, badge, group label, favicon, shield count, domain, and page surface from that state.
- [P2] The first click could expose the stage background while an uncached capture loaded.
  - Fix: preload every bundled page capture when the demo initializes and swap the selected surface immediately.
- [P1] The page surface was dimmed with reduced opacity, saturation, and brightness even though Blanc does not tint ordinary tab content.
  - Fix: removed the persistent darkening treatment and the transitional opacity animation; every selected website now renders at its captured native color and luminance.
- Browser verification switched through all seven rows, confirmed matching page sources and group labels, reopened with the selected row still active, and found no broken images, horizontal overflow, or console errors.

### Iteration 8 — real CNET capture

- [P1] The initial CNET state was a locally composed approximation rather than the real publication page shown by the other tabs.
  - Fix: replaced the approximation with the user-supplied CNET screenshot, cropped precisely to remove the outer desktop, window frame, and duplicate Blanc Island while retaining the complete CNET header and editorial grid.
- [P2] The demo's generic centered cover crop clipped the left edge of the CNET wordmark.
  - Fix: added a CNET-specific 24% horizontal page position so the full wordmark and “Best” rail remain visible while the capture continues to fill the tab surface.
- The final asset is a lossless 2597 × 1494 PNG. Collapsed and expanded browser checks confirm the real CNET page renders at native color, the CNET row remains active after reopening, and there are no broken images or horizontal overflow.

### Iteration 9 — shipping tab-row actions

- [P1] The enlarged Island omitted the shipping row's hover actions, so the tab list communicated switching but not Blanc's direct tab management model.
  - Fix: every tab row now reserves and reveals the same pin, group, and close controls on hover or keyboard focus; clicks perform their demonstrated action without accidentally switching tabs.
- [P2] A demo-only “active” badge and persistent secondary metadata made the rows noisier than the shipping overlay.
  - Fix: removed the badge, retained the active-row tint and domain, and matched the production title fade plus quiet metadata reveal.
- [P2] The first web implementation inherited fill-only SVG rendering, leaving the close action visually blank.
  - Fix: applied Blanc's rounded, current-color stroke language and the shipping 14px pin / 12px close geometry.
- Local browser verification confirms all three controls reveal together under focus-within, the group action does not switch the active The Verge tab, and the formerly blank close glyph renders correctly.

## Follow-up polish

- [P3] The proof strip uses restrained numeric indices instead of the mockup’s illustrative icons. This is intentional: the existing site has no matching icon family, and numeric editorial markers preserve the hierarchy without introducing fabricated assets.

final result: passed
