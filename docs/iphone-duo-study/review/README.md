# Blanc for iPhone Duo — visual study

Status: selected Open Ladder anatomy and its simplified expanded card were approved for adaptation on 19 September 2026. All exported artwork is labeled **“Blanc for iPhone Duo — concept.”** No application code or public API changed, and the artwork has not been published.

## Final plates

| Plate | Purpose |
| --- | --- |
| [`overview.png`](../plates/overview.png) | Annotated ownership and implementation boundary. |
| [`inner-resting.png`](../plates/inner-resting.png) | Unfolded landscape hero, system bar at rest. |
| [`inner-expanded.png`](../plates/inner-expanded.png) | Island card opening inward from the active-page slot. |
| [`inner-group-collapsed.png`](../plates/inner-group-collapsed.png) | Collapsible named group with persistent page identity. |
| [`outer-portrait.png`](../plates/outer-portrait.png) | Same page and selected tab on the outer display. |
| [`inner-portrait.png`](../plates/inner-portrait.png) | Native horizontal-control orientation. |
| [`blocker-on.png`](../plates/blocker-on.png), [`blocker-off.png`](../plates/blocker-off.png) | Per-site Blocker intent and monochrome state. |
| [`tab-overflow.png`](../plates/tab-overflow.png) | `+2` opens tabs; system ellipsis remains a separate action. |
| [`adaptations.png`](../plates/adaptations.png) | Book, tabletop, and both Split View sides; schematic placement. |

The source SVGs and deterministic rendering scripts are in [`../source`](../source). The fictional Margin editorial page and five-tab set are consistent across the device plates. Two standalone pinned tabs occupy the first two dot slots; Margin is the active favicon in the third slot, even though it appears later in full tab order; `+2` counts the two undisplayed tabs. The example photo is local concept imagery at [`../references/architecture-hero.png`](../references/architecture-hero.png).

## What was checked

The installed desktop Blanc was inspected live in resting and expanded states on 19 September. The desktop Back, New Tab, search, and cut-shield SVG paths were matched against `src/renderer/index.html`, `src/renderer/renderer.js`, and `src/renderer/overlay.html`. The selected rail has no dividers, uses Inter only, and leaves title/domain to the card.

The iPhone Duo simulator in Xcode 27.1 was inspected in Device Hub. Fresh references include [`inner-landscape-native-2026-09-19.png`](../references/inner-landscape-native-2026-09-19.png), [`inner-portrait-native-2026-09-19.png`](../references/inner-portrait-native-2026-09-19.png), and [`book-current-2026-09-19.png`](../references/book-current-2026-09-19.png); an outer capture is [`outer-current.png`](../references/outer-current.png). The artwork follows those system bar locations and keeps the outer camera and status region clear. It does not draw a separate free-positioned capsule or a badge beside the rail. Inner landscape and outer portrait use the published display proportions; the hardware border itself remains illustrative.

The tabletop and both Split View panels are **schematics based on Apple guidance**, not live simulator captures. No live Split View capture was available. The final sheet was checked visually so no control crosses the drawn fold, and the bar follows the outside edge of Blanc's Split View region. Actual system grouping, overflow, Book/Tabletop panel positioning, large-text fit, Reduce Transparency, keyboard-open behavior, and accessibility remain implementation validation, not proven properties of static images.

## Selection history

The initial comparison used [`01-tight-compass.png`](01-tight-compass.png), [`02-open-ladder.png`](02-open-ladder.png), and [`03-compressed-window.png`](03-compressed-window.png). The owner selected **02 Open Ladder**, then limited the map to three independently tappable slots plus `+N`. The selected favicon replaces its dot inside one of those three slots. The first concept's separate fourth favicon and dividers were removed. The owner asked for less explanatory UI text, Inter instead of mono, and desktop-style collapsible named groups; the final expanded plate reflects those changes. The earlier candidate images remain review history, not implementation references.

An earlier detail crop is archived as [`island-detail-previous.png`](island-detail-previous.png); it is not part of the final plate set.

The current iOS prototype's global shield toggle and generic panel are not the intended per-site Blocker, named-group, and private-tab behavior in the concept. See the revised [`design plan`](../../iphone-duo-design-plan.md) for the interaction contract and validation boundary.

## Rebuild exports

From the repository root, run each `render-*.mjs` script in `docs/iphone-duo-study/source/`, then rasterize its SVGs with `rsvg-convert` at the dimensions shown by `sips` on the corresponding PNGs. `render-overview.mjs` should run last because it embeds the inner plates.
