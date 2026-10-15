# Blanc brand usage

This is the required visual-identity check for Blanc marketing, social assets,
press materials, product demos, thumbnails, avatars, and generated imagery.

## Messaging: explicit feature names and explanations

**Standing owner preference, October 4, 2026:** Assume the reader is new to
Blanc. Name the feature, explain what it does and state the concrete benefit.
Use this throughout the website and all other communications: social, email,
release notes, support, demos and product copy. Avoid flowery or ambiguous
headings that rely on screenshots, branded names or prior knowledge to make
sense. Keep the approved tagline “A little less browser.” See the examples and
claim requirements in [Marketing claims](marketing-claims.md#explicit-feature-and-benefit-message-gate).

**Homepage detail level, October 4 owner correction:** Lead with the product
and concise facts visitors can use. Put development-process, AI-assistance,
audit-status and full licensing detail on linked About, Trust and Support
pages. Do not turn the homepage into a disclosure report. Preserve material
limits beside the claims they qualify and keep deeper information easy to find.

## Current identity: Sunrise only

**Owner correction, September 12, 2026:** “We are only using Sunrise mark and theme now.” This applies to all new Blanc marketing, social creative, review previews, thumbnails and end cards. The old B letterform is retired; do not use `assets/blanc-mark.svg` or rebuild it into new creative. Its presence in the repository is not permission to use it.

For full-color social artwork, use the original gold Sunrise asset at `site/public/sunrise-hero-mark.png`, preserving its geometry, transparency and gold detail. Use the Sunrise theme: Blanc White `#F8F2E8`, warm surfaces `#F2EADE`, near-black headings, muted brown-gray `#6B6257`, and restrained gold `#805D28`. The approved September 11 general Sunrise creative in `marketing/social/sunrise-milestone-2026-09-11/general-review-v2-1080x1350.png` is a visual reference for the treatment, not content to recycle.

Use Newsreader regular for sentence-case headings and Inter for supporting text. On the website, the homepage, masthead and footer use Blubird instead (see *Blanc lockup*): Blubird Display for headlines, set at 0 letter-spacing, and Blubird Text for copy; other pages keep Newsreader until they are redesigned. Choose title alignment to suit the composition; not every social asset should use the same centered poster layout. Keep generous clear space around the Sunrise symbol. Do not redraw it, replace it with a letterform, tint the original artwork, add a badge or place a glow immediately behind it. A subtle gold horizon may appear away from the symbol. Existing monochrome Sunrise site variants remain valid for the specifically documented placements below.

**Visual variety, September 12 owner direction:** A shared brand does not mean an identical layout. Give each editorial idea an appropriate composition, and let carousel panels progress through distinct visual structures. Use a restrained mix of imagery, useful diagrams, typography, light and dark Sunrise surfaces. Keep the exact mark, palette and type family coherent. Conceptual illustrations must not impersonate product footage or evidence.

**Social wordmark, September 12 owner direction:** Omit the typeset “Blanc” wordmark and the recurring “Browsing & design” header label from this social creative system. Use the Sunrise symbol alone; do not add a replacement brand descriptor. This does not remove normal mentions of Blanc in editorial copy or the website address.

**Social headline trial, September 12:** At the owner’s request, the current social batch tests Newsreader Medium (weight 500) for a modest increase over regular 400. Supporting Inter copy stays unchanged. This is a review trial, not a site/product typography change or blanket acceptance of the weight.

The earlier B-mark/paper-white marketing rule is superseded. Historical files and released product screenshots are evidence, not sources for current marketing identity. Do not repaint product footage to imply a different shipped interface.

## Core palette

The following neutral tokens describe existing product surfaces and supporting ink. New marketing uses the Sunrise palette below:

- paper: `#ffffff`;
- soft paper: `#f7f7f7`;
- hairline: `#dedede`;
- ink: `#0e0e0e` or `#111111`;
- dark surface: `#191919`;
- dark hairline: `#333333`;
- light text: `#f5f5f5`;
- muted light text: `#9c9c9c`;
- muted dark text: `#6b6b6b`.

The authoritative product/site tokens remain in `site/src/styles/site.css` and
`src/renderer/styles.css`. Retired feature-specific colorways are not part of
the general Blanc brand palette.

### Mahjong: classic lacquer

Mahjong is a deliberately scoped in-product exception to the neutral product
palette. Its restored lacquer table uses `#0B3D31` and the locally bundled
`mahjong-lacquer.webp` background, with `#0A392F` panels, ivory `#F8F1DC`
type, and brass `#D8B969` accents. Private Mahjong retains its separate muted
purple treatment and prominent private chip. These game-local values do not
replace shared product or website tokens.
The header uses the unmodified Sunrise artwork with clear space and no glow.
The B motif on the white-dragon tile remains an intentional historical game
detail, not a mark for new Blanc creative.

### Sunrise palette for website and marketing

The website carries the Sunrise icon's warmth through Blanc White backgrounds,
warm surfaces, and muted gold details. Keep the existing typography,
near-black headings, dark primary buttons, and a white desktop masthead.
These website and marketing tokens are separate from the released product palette:

- page background, **Blanc White**: `#F8F2E8` (`--site-bg`);
- section surfaces: `#F2EADE` (`--site-surface`);
- raised surfaces and forms, the masthead and the footer: white `#FFFFFF`
  (`--site-surface-raised`);
- decorative borders and dividers: `#E1D7C9` (`--site-border`);
- muted text: `#6B6257` (`--site-text-dim`);
- gold on light backgrounds: `#805D28` (`--site-gold`);
- gold on dark backgrounds: `#D4AD66` (`--site-gold-on-dark`);
- pale selected-state background: `#F6EBD5` (`--site-selection`);
- warm ink for the Patron offer only: `#12100B` (`--site-ink-warm`).

**Blanc White** is the brand name for `#F8F2E8` (owner decision, October 15,
2026). Call it Blanc White, not ivory or cream, in briefs, creative and press
material. On the same day the owner set the palette above: the page, surface,
raised and border colours are the ones blanc.day was already serving, and the
muted text and gold keep this guide's warmer `#6B6257` and `#805D28`, not the
cooler `#696865` and `#7D653D` the site had been rendering. Blanc White is a shade
lighter than `#F7F0E5`, the original sample from the Sunrise art, which the
product's Sunrise surfaces (`--sunrise-bg`), the share cards, the press card
and the media kit's icon tiles still use.

Use gold for eyebrows, section kickers, text-link arrows and interaction
states, FAQ disclosure markers, navigation states, and the changelog's small
new-feature dot. The pale background belongs only to selected mobile menu
items. Keep underlines, focus outlines, and other state indicators alongside
color. Gold and muted text meet 4.5:1 contrast on the specified Blanc White, section,
raised, and pale selection surfaces. Use the dark-background gold token on
dark sections and navigation; it meets 4.5:1 on both the shared ink and the
warm ink. The warm ink belongs to the Patron offer alone: the shared
`--site-accent` stays neutral, and product surfaces are warmed only through
the Sunrise palette described under *Desktop Sunrise surfaces* below.
Decorative hairlines are not focus indicators; retain high-contrast outlines
and control states.

The website may place its monochrome Sunrise marks directly on these warm page
surfaces. This exception permits the shared page background, not added logo
badges, decorative backings, glows, gradients, or tinted marks. Desktop
navigation is monochrome at rest, with the hover treatment documented below.
Footer, legal-header, and press-header marks remain monochrome. Footer social
glyphs use bronze (`--site-gold`), with ink hover and keyboard-focus states.

Product screenshots, embedded demos, illustrations, downloadable press art,
and their asset-preview backing fields retain their existing colors. Never
substitute website tokens for shared product `--accent`, `--bg`, or other
product variables; warm product surfaces use the product's own `--sunrise-*`
tokens, described below.
Both light and private-mode product replicas must retain their released colors,
including when enlarged.

### Blanc Patron website identity

Blanc Patron uses Newsreader at regular weight for its display name and the
main price numeral, paired with Inter for supporting copy, currency, billing
labels, and controls. Newsreader replaced Instrument Serif on 4 September 2026
because that face had become the default serif of current web design; do not
reintroduce it. Newsreader carries an optical-size axis, so it sharpens on its
own at Patron sizes; leave optical sizing automatic and set the price numeral
with lining figures. Newsreader is also the website's heading face: every
page headline, section heading, feature card title, FAQ question, release
name, and the footer tagline are set in it at regular weight, and the press
announcement quote takes its italic. The generated share cards and press card
set their titles in it. Body copy, labels, controls, the legal pages, the
consent card, and every product replica stay in Inter. The desktop app uses
Newsreader for its invitation voice and utility-sheet headings, documented
below; its operating text stays in Inter. The homepage demo carries one short, centered sentence per scene, never a
second headline-and-subline pair under the hero. The current trust homepage
uses its Newsreader heading treatment for these captions, sized down on narrow
screens; the enlarged viewer uses a compact centered figure title. Use the
`--site-font-patron` token, regular weight, restrained negative tracking, and
generous space around the name. Do not use the display serif for small text or
replace the canonical Sunrise symbol with a letterform.

The homepage offer pairs the monochrome Sunrise symbol with this display name
on a warm ink (`--site-ink-warm`) section. The display name and the main price
numeral are set in gold (`--site-gold-on-dark`); supporting copy, currency,
billing labels, and the symbol stay Blanc White (`--site-bg`), and the filled gold
button keeps its ink text. One radial gold light spill, anchored to the
section's top edge at no more than about a quarter strength, is the section's
only gradient; the symbol sits below its brightest point and is never backed
by it. Keep the pricing separate with a fine rule; retain a light keyboard
focus outline and mobile touch target of at least 48px. Avoid decorative
badges, additional gradients, and animated ornament.

The font is self-hosted through the pinned `@fontsource-variable/newsreader`
package and loaded on the homepage. Its SIL Open Font License is included at
`site/public/fonts/newsreader-OFL.txt`.

Newsreader (Production Type, 2020) was chosen from an open-licensed shortlist
set in the live Patron card: Libre Caslon Display was the runner-up, Imbue the
closest match to Instrument Serif's narrow silhouette, and Bodoni Moda, Gloock,
Sorts Mill Goudy, Fraunces, Hedvig Letters Serif, Ibarra Real Nova, and Ovo
were reviewed and passed over. Do not reopen the search without a new brief;
any future candidate must be OFL-licensed, available through fontsource, hold
"Blanc Patron." on one line at the shipped desktop size, and read editorial
rather than fashionable.

Reach decision, 4 September 2026: three levels of Newsreader use were
mocked on the real pages (homepage only; one line per page; every heading).
The one-line-per-page level was built and reviewed live first, and its serif
headlines over Inter section headings read as two systems, so the every-
heading level was adopted instead and deployed the same day (bnfy/blanc#281).
The homepage demo's headline-and-subline pair was merged at the same time
into one sentence per scene, set as an Inter figure title, because it
repeated the hero's shape directly beneath it. The generated share cards and
press card follow the heading face. All new social templates follow the current
Sunrise identity and Newsreader title rule. Previously approved launch assets
require fresh review if changed.

### Desktop Start Page Sunrise treatment

The four Start Page layouts — Ledger, Billboard, Shelf, and Tally — share the
Sunrise identity without becoming the same composition. Use the canonical gold
Sunrise symbol above a single date line, the warm Blanc White and gold
palette documented above, and the real layered mountain sunrise in
`src/renderer/pages/start-page-sunrise.png`. Keep the landscape quiet in the
upper half so operating UI stays legible. Dark and private tabs may deepen the
same image into warm dusk with overlays; private mode must retain its explicit
textual distinction. The Start Page keeps its landscape and translucent
surfaces; the product's other warm surfaces follow *Desktop Sunrise surfaces*
below.

All four layouts share one frame (owner decision, October 5, 2026): the
Sunrise mark and date on the left of an in-flow header row, the moving-in
checklist on its right, one centered content area, and a fixed footer. The
footer has no divider line; a soft fade appears above it only while content
runs underneath. Ledger leads with one 32px Newsreader "Where to?" line; no
other layout adds a heading. Labels are sentence case without letter-spacing.
Icon tiles use 6px corners, cards 10px, floating surfaces 14px, chips fully
rounded. The Patron upgrade is a quiet chip outlined in Sunrise gold with no
fill, always its layout's last item, never in private tabs. The four-layout
picker (same order) and the dynamic-wallpaper switch live behind the footer's
Customize button. Mahjong remains a standalone footer action and is never a
fifth layout. Visual explorations are not a source for new marketing claims or
replacement copy.

### Desktop Sunrise surfaces

**Owner decision, September 26, 2026:** Sunrise dresses Blanc's own pages and
the questions Blanc asks you; the frame stays ink. Warm (the utility sheets
since the A1 polish PR; the rest follows in PR B): the utility sheets
(Settings, Favorites, History, Downloads, Keyboard Shortcuts, Bring Your
Tabs, tab handoff), the error and certificate pages, the site permission
prompt, the 1Password capsule and the screen-share picker. Neutral: the
Island and everything that opens from it, the strip, the vertical tabs rail,
the Glance header and the window controls.

**Owner-approved blocker dialog, October 2–3, 2026:** the site-protection
popover and blocker chooser use neutral paper/graphite styling, the original
small gold Sunrise mark, and compact Inter headings. The chooser names
**EasyList + EasyPrivacy** beneath Blanc Blocker; selecting a different provider
shows an explicit Restart Blanc action. Preserve the short attachment to the
shield's existing hover circle. This does not change the Island icon direction
below.

**Blocker artwork, final owner direction October 3, 2026:** the Island keeps
its original monochrome Blanc Blocker shield: the shield outline crossed by a
single diagonal, restored from before `03621de6`. Reuse its native SVG and CSS
in `src/renderer/index.html` and `styles.css`: 16×16 glyph, 1.4-unit strokes,
24px hover circle, separate count badge, quiet gray and reduced opacity when
off. The three-layer Horizon outline and textured toolbar icon are retired.
The website's native Island hero must reuse this original icon and styling.

The large website Privacy illustration retains the copper/bronze Horizon
artwork in `assets/horizon-shield.png`, matched to the original Sunrise sun
with muted copper faces, brown seams and restrained champagne highlights.
Its 3D rim uses the same palette. The product mark does not replace Sunrise
or warm the Island. Preserve original Sunrise artwork and historical public
captures. Ship the app change before deploying website PR #491; screenshots
and marketing must continue to follow the release boundary.

Warm surfaces use the shared `--sunrise-*` tokens (`tokens/tokens.json`) by
remapping the semantic tokens inside a scope class, never by hard-coding
colors. Gold marks state and navigation; primary buttons stay ink on ivory
(ivory on ink in dark mode). Keyboard focus on `blanc://` pages is one 1px
ring in `--text-dim`; Mahjong keeps its own.

**System v2, September 27:** Inter is the product UI operating face, including
addresses, counters, keycaps, commands, and license keys. Align changing
numbers with tabular figures; use a slashed zero for the Patron license key.
Only Mahjong tile faces keep JetBrains Mono through `--mj-face-font`.
Newsreader also sets utility-sheet page and section headings. System v2 uses 8px small,
10px control/row, 14px card/group, 20px sheet/dialog, and full pill radii.
The Island and Start Page retain their existing 6px base radius and layouts.
On warm sheets, page headings are Newsreader 30px/500, section headings are
Newsreader 21px/500, card labels are dim Inter 12px/600, and body text is Inter 13px. Avoid
uppercase letter-spaced labels on these surfaces.

### Desktop display voice

Newsreader appears where Blanc welcomes or orients the user: the Start Page
moving-in checklist title and the six first-run onboarding titles. It also
sets utility-sheet page and section headings. Use upright optical sizing;
the sheet headings use medium weight for legibility at their smaller sizes.
Inter remains the app's operating voice for dates, clocks, navigation, lists,
metadata, controls, the Island, command palette, vertical tabs, card labels,
dialogs, warnings, errors, and body copy. Billboard and Mahjong keep their
existing identities. Review any further product use of the serif separately.

### Blanc lockup

The Blanc lockup is the Sunrise mark beside the word “Blanc” set in
**Blubird** by Rajesh Rajput (owner choice, October 15, 2026: Regular Display,
drawn as supplied except the l–a pair, closed by 8 font units). The word never
appears without the mark, and it is never set in lower case. Its construction
(“C”) is fixed: the Sunrise is 1.15× the height of the l, centred on the
vertical middle of the B, with a gap of 0.3× the B height between them.

- **Display cut** for the lockup above about 32px tall (the website footer:
  155×40px).
- **Text cut** (Blubird Regular Text) at about 32px tall and under, where the
  Display cut's fine joins close up (the website header: 90×22px).

The word is committed as outlines, not as a font, in `assets/wordmark/`
(`blanc-word-{display,small}-{ink,white}.svg`); `site/scripts/build-lockup-assets.mjs`
copies them with WebP exports of the Sunrise into `site/public/lockup/`, and
its `--check` runs inside `npm run site:build`. The Sunrise exports are rendered
from the vector `assets/sunrise-mark.svg` (October 15, 2026, replacing the 1024px
raster, which blurred when the homepage drew it large or a visitor zoomed in).
It keeps the 1024px canvas of `build/app-icons/Icon.icon/Assets/sunrise-mark.png`,
so the same placement percentages fit every size; `test/unit/brand-assets.test.js`
pins them. Ink on Blanc White, white (`#F8F2E8`) on warm ink. Do not stretch,
re-space, recolour, outline or set the word in another face.

The September 12 social direction (Sunrise alone, no typeset wordmark) still
governs social creative until the owner changes it; the lockup is for the
website and other surfaces the owner approves.

**Licence.** The owner holds Blubird's Regular Licence (web and print, for an
individual). It forbids redistributing the font files, and this repository is
public, so the `.woff2` files are never committed: they sit in the git-ignored
`site/public/fonts/blubird/` on the deploying machine (`npm run site:fonts --
/path/to/Blubird.zip`), and `npm run site:deploy` refuses to deploy without
them. App, product or corporate use beyond that licence needs Rajesh Rajput's
written permission first.

### Editorial website footer

The shared website footer is warm ink (`#111`) on every page. It opens with
the Display lockup (155×40px) as the home link, the tagline “A little less
browser.” in Blubird Text, and the newsletter field, then three link columns
(Explore, Resources, Blanc) and a fine rule above the compact legal and social
row. Links rest in a light warm grey (`#C0BCB5`) and turn near-white on hover;
focus rings are gold on dark (`--site-gold-on-dark`). A page may put numbered
method notes above the columns (the homepage's footnotes do).

### Horizon rule

The footer seam on every page carries the horizon rule: a 1px gold
(`--site-gold-on-dark`) hairline, full strength across the middle 40% and
fading out toward both edges, with a soft gold glow rising 160px into the page
above it at about 22% strength. It replaces a neutral top border. It is a
decorative seam, not a focus indicator, and no mark, badge, or lockup may sit
on the glow; the footer's lockup sits below the line.

### Homepage sunrise

The homepage opens on the gold Sunrise alone, with no wordmark, at
`min(56vmin, 540px)`. Unless the visitor has asked for reduced motion, the
sunrise plays once as the page opens (2.2 seconds, in one screen): it draws the
horizon and its reflection, raises the disc, opens the rays and brings the sky
from night to Blanc White, then shrinks the mark above the headline and brings
in the copy. It used to be driven by scrolling a stage 4.2 screens tall; the
owner rejected that on October 15, 2026, because the first screen showed
neither what Blanc is nor how to get it. The stage is cut from one export
(`site/public/lockup/sunrise-mark-2048.webp`) with clip paths, never redrawn
or tinted. Everywhere else, and for reduced motion, the mark sits still at
160px above the headline. Focusing anything in the hero shows its copy at once.

### Website masthead

Every page shares one sticky, 52px masthead in warm ink (`#1B1A18` at 82% over
a blur, with a faint light hairline beneath). It carries the small (Text cut)
lockup at 90×22px as the home link, the six direct links from
`site/src/data/navigation.mjs` in light warm grey, current page in near-white,
and the Download pill in near-white. At 920px and narrower the links fold
behind a Menu button that drops a full-width list; without scripting they wrap
onto a second row instead. The bar never hides on scroll, because the
homepage's sticky scenes sit just below it, and on the homepage a 2px gold
progress line runs along its bottom edge. On Mail pages the Download pill
becomes a plain “Browser download” link, since the Mail bar carries those
pages' one call to action. This replaced the white bar with the monochrome
Sunrise on October 15, 2026; the earlier mega menus (September 4) and hover
crossfade are retired.

### Share cards

The website's Open Graph cards (`og-image.png` and `feature-*.png`, 1200×630)
are Sunrise compositions rendered by `site/scripts/render-og-cards.mjs`; never
hand-edit them. Each carries the original gold Sunrise artwork with clear space
and nothing behind it, a gold mono label taken from the page's own eyebrow, the
page's own Newsreader headline (the homepage card adds the hero's description),
and `blanc.day` in gold, with no typeset wordmark. The product is always real:
a public native capture framed as its window, or the feature page's own Island
figure. A soft gold horizon glow sits at the bottom edge, away from the mark.

Three compositions keep the set varied: the homepage centres its copy over the
dawn Start Page, whose sun sits on the card's gold horizon line; window cards
put the copy left and the capture right; Island cards stand a resting pill on
the horizon below the copy, or put an open panel beside it. Most cards use the
Blanc White surface. Quiet Tabs, Security and Sync use the dark Sunrise surface, which
suits a white Island and avoids glaring white windows.

## Titles and subtitles

Marketing titles and subtitles should carry the same hierarchy as the Blanc
website:

- write titles in sentence case, never all caps;
- balance deliberate line breaks and align titles to the composition; left-aligned editorial layouts and centered questions can coexist in the same Sunrise batch;
- center the composition on the actual artboard by default. When native
  controls require an offset, use the smallest optical shift that preserves
  the safe area and document it; do not push the whole composition visibly to
  one side when a narrower layout or platform-specific crop will solve it;
- set titles in Newsreader at regular weight with restrained negative
  tracking (about -0.02em) and a compact line height; the UI sans at 500
  remains correct only for assets produced before 4 September 2026;
- place the explanatory subtitle below in a smaller regular-weight size and a
  muted neutral gray;
- keep the title direct and let the subtitle explain the consequence or proof.

All caps is reserved for small mono utility labels such as eyebrows, counters,
state labels, and interface annotations. It is not a headline treatment.

## Pre-publication check

Before approving or publishing an asset:

1. Inspect every frame, thumbnail, crop, and end card—not only the source file.
2. Confirm the symbol is Sunrise, never the retired B. For new social creative, use the original gold Sunrise artwork on the Blanc White theme; preserve its geometry and clear space.
3. Confirm crop-safe previews do not clip or crowd the mark.
4. Confirm new marketing uses the Blanc White, warm ink, muted brown-gray and restrained gold palette.
5. Confirm titles are sentence case and subtitles follow the website hierarchy.
6. Apply the separate product-claim gate in `docs/marketing-claims.md`.
