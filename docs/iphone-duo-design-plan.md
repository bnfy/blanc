# Blanc for iPhone Duo — selected Island design

Status: visual study approved for adaptation, 19 September 2026; first iOS implementation pass built and tested, 20 September 2026, with live visual review pending. The plates remain concepts, not screenshots of shipping iOS functionality. The source artwork and exports are indexed in [`iphone-duo-study/review/README.md`](iphone-duo-study/review/README.md).

## The desktop relationship to preserve

Desktop Blanc puts navigation, a bounded tab-dot map, the active page, New Tab, Blocker, and secondary actions in one Island. A dot is a tab, and the active tab's favicon and domain identify the current page. On Duo, the short side rail has no room for the domain, so page identity opens horizontally in the Island card. The rail remains a three-slot tab map, **not a vertical list of favicons**.

The owner selected the airy **Open Ladder** anatomy, then refined it. Each of the three tab slots is a separate 44-point target. An inactive tab is a dot. The selected tab blooms into its favicon **inside its own slot**, never in a fourth slot. The example places two standalone pinned tabs first, then the selected Margin tab in slot three; `+2` represents the two other tabs. The selected tab is included even when its full tab-order index exceeds three. Tapping an inactive dot switches tabs, tapping the selected favicon opens the Island card at page identity, and tapping `+N` opens the same card at the tab list. The system ellipsis is a separate browser-action overflow.

## System boundary

Blanc supplies toolbar content and its expanded panel. iOS owns the shared bar's placement, end-cap geometry, material behavior, grouping, safe areas, and what moves to overflow. The study uses the system bar's rounded silhouette; it does not position a standalone Blanc capsule over the page or prescribe a custom corner radius. The resting bar has no drawn dividers. Desktop SVG geometry is reused for Back, New Tab, search, and the cut-shield; Inter is used throughout. No domain label projects from the rail.

The inner-landscape artwork is framed to the **2670 × 1878** display proportion, the outer portrait to **1398 × 2034**, and inner portrait to the rotated inner-display proportion. These are artwork proportions, not app layout constants. The outer camera stays visible, the inner inactive camera is absent, and controls avoid the status and fold regions. The device illustration is approximate; the live simulator captures govern UI placement. See [Apple specifications](https://www.apple.com/iphone-duo/specs/), [Raise the bar](https://developer.apple.com/videos/play/tech-talks/111462/), and [Strike a pose](https://developer.apple.com/videos/play/tech-talks/111463/).

## Resting controls and actions

| Element | Intent |
| --- | --- |
| Back | Direct page navigation, with a distinct accessible target. |
| Three tab slots | Two inactive dots and one active favicon in the example. Each is individually tappable. |
| `+2` | Opens the tab-focused Island card; it is not the system ellipsis. |
| New Tab | Direct action in normal space. |
| Blanc cut-shield | Direct **per-site** Blocker toggle. On/off can be read from text and switch position in the contextual view, not color alone. Global blocking remains in Settings. |
| System ellipsis | Secondary browser actions such as Forward and Reload. |

When space contracts, prioritize Back, active-page access, New Tab, and Blocker; let lower-priority tab previews and secondary actions enter system overflow. The compact tabletop schematic shows this priority, but actual iOS grouping and overflow still need implementation validation. The selected page title and domain are absent from the resting rail.

## Expanded Island

The card opens inward from the active-page slot without immediately raising the keyboard. It begins with the Margin favicon, page title, and readable horizontal domain, then a search/address field, pinned tabs, and a user-named group. Tab rows carry favicon, title, domain, and active indication. A group header has the desktop-style caret and count and can collapse its rows; the pinned shelf stays open. The active page remains identifiable in the rail and card header when its group is collapsed. New Tab and New Private Tab are explicit actions. The latter and named groups depict intended iOS model work rather than present functionality.

The shield's detail surface identifies the current site and says “On for this site” or “Off for this site”; one tap on the rail shield toggles that site's state. The first implementation pass stores exact-host exceptions separately from global Settings and reconciles each tab's WebKit rule list before main-frame navigation. The detail plate remains interaction intent until the runtime UI is visually reviewed.

## Pose adaptation

| Pose | Design behavior | Evidence level |
| --- | --- | --- |
| Inner landscape | System-managed right-edge bar; card opens inward. | Compared with the 19 September Device Hub capture. |
| Outer portrait | Right-edge bar below camera/status; same selected tab and article. | Compared with Device Hub capture. |
| Inner portrait | Native horizontal bar; same control vocabulary, no rotated labels. | Compared with fresh Device Hub capture. |
| Book fold | Keep the bar on the outside edge; no critical control on fold division. | Compared with fresh Book pose capture; plate remains schematic. |
| Tabletop | Put priority controls in one usable region; secondary items enter overflow. | Schematic based on Apple's fold guidance; exact bar fit unverified. |
| Split View, Blanc left/right | Bar follows Blanc's outside edge, never the shared divider. | Schematic based on Apple's bar guidance; live Split View capture was unavailable. |

The adaptation sheet intentionally simplifies content and hardware; it is a placement study, not a simulator screenshot. The device-specific iOS implementation should use navigation/toolbar placements and reserved regions, not these artwork coordinates.

## Review and implementation boundary

The visual set includes inner-landscape resting/open/group-collapsed plates, outer portrait, inner portrait, Blocker on/off, tab overflow, an adaptation sheet, and an annotated overview. All plates say **“Blanc for iPhone Duo — concept.”** They retain one fictional Margin article and one five-tab set. The overview distinguishes system-owned chrome, Blanc-owned content, and future iOS work. The visual study itself changed no application code; the subsequent implementation pass is local and unpublished.

The 20 September pass adds the native three-slot tab window, desktop-derived glyphs, a no-keyboard Island card with real tab rows, Inter font resources, an ellipsis menu, and an exact-host Blocker exception with a contextual status view. The first simulator build failed visual review: three actions appeared as text outside the vertical Island, the popover opened at the wrong location, and the start page was blank. The corrected build uses template image assets so those actions render as symbols in the native vertical bar, positions the card beside the measured tab control, and supplies the start-page bridge callbacks needed for the page to paint. Device Hub review confirmed the rail and menu on the outer display, the inward-pointing card on the open landscape display, and the system's horizontal toolbar adaptation in inner portrait. With five tabs, the `+2` overflow and New Tab targets no longer overlap, selecting the fifth tab keeps its favicon in the visible three-slot window, and the card keeps its header and New Tab footer visible while the tab list scrolls. The shield's unavailable-on-this-page detail was also reviewed on the internal start page. Because the iOS tab model does not yet have standalone pins, the visible three-tab window uses neighboring tabs in order while always including the active tab. Named groups, collapsible group state, and private tabs remain future model work and are deliberately absent from the runtime card. Full pose and accessibility review is still required.

For an honest side-by-side comparison, `source/margin-article.html` recreates the fictional Margin page as a locally served webpage rather than app chrome. `references/inner-landscape-live-2026-09-20.png` is the actual 27.1 simulator screen with that page, five tabs, and the selected Margin favicon. The fixture URL is local to the review session; it is not a shipped page or a claim about browsing functionality. The final Xcode simulator test suite passed on 20 September after the UI corrections.

Before implementation is accepted, verify native 44-point hit targets, selected-tab retention after reordering, compressed system overflow, large text, Reduce Transparency, VoiceOver labels and order, keyboard-open panel adaptation, Book/Tabletop folding, and Split View on both sides. The static plates establish intent, not those runtime results.
