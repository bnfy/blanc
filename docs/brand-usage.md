# Blanc brand usage

This is the required visual-identity check for Blanc marketing, social assets,
press materials, product demos, thumbnails, avatars, and generated imagery.

## Current identity: Sunrise only

**Owner correction, September 12, 2026:** “We are only using Sunrise mark and theme now.” This applies to all new Blanc marketing, social creative, review previews, thumbnails and end cards. The old B letterform is retired; do not use `assets/blanc-mark.svg` or rebuild it into new creative. Its presence in the repository is not permission to use it.

For full-color social artwork, use the original gold Sunrise asset at `site/public/sunrise-hero-mark.png`, preserving its geometry, transparency and gold detail. Use the Sunrise theme: ivory `#F7F0E5`, warm surfaces `#EFE6D8`, near-black headings, muted brown-gray `#6B6257`, and restrained gold `#805D28`. The approved September 11 general Sunrise creative in `marketing/social/sunrise-milestone-2026-09-11/general-review-v2-1080x1350.png` is a visual reference for the treatment, not content to recycle.

Use Newsreader regular for sentence-case headings and Inter for supporting text. Choose title alignment to suit the composition; not every social asset should use the same centered poster layout. Keep generous clear space around the Sunrise symbol. Do not redraw it, replace it with a letterform, tint the original artwork, add a badge or place a glow immediately behind it. A subtle gold horizon may appear away from the symbol. Existing monochrome Sunrise site variants remain valid for the specifically documented placements below.

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

### Mahjong: Sunrise at dusk

Mahjong is a deliberately scoped in-product exception to the neutral product
palette. Its game-local table uses warm charcoal `#1B1713`, a `#29221B` board,
`#332A21` panels, ivory `#F7F0E5` type and restrained gold `#D4AD66` accents.
The darker private table stays in the same warm family and carries an explicit
private chip. These values do not replace the shared product or website tokens.
The header uses the unmodified Sunrise artwork with clear space and no glow.
The B motif on the white-dragon tile remains an intentional historical game
detail, not a mark for new Blanc creative.

### Sunrise palette for website and marketing

The website carries the Sunrise icon's warmth through ivory backgrounds,
warm surfaces, and muted gold details. Keep the existing typography,
near-black headings, dark primary buttons, and an ivory desktop masthead.
These website and marketing tokens are separate from the released product palette:

- page background, sampled from the Sunrise source art: `#F7F0E5` (`--site-bg`);
- section surfaces and footer: `#EFE6D8` (`--site-surface`);
- raised surfaces and forms: `#FFFCF7` (`--site-surface-raised`);
- decorative borders and dividers: `#DDD2C2` (`--site-border`);
- muted text: `#6B6257` (`--site-text-dim`);
- gold on light backgrounds: `#805D28` (`--site-gold`);
- gold on dark backgrounds: `#D4AD66` (`--site-gold-on-dark`);
- pale selected-state background: `#F6EBD5` (`--site-selection`);
- warm ink for the Patron offer only: `#12100B` (`--site-ink-warm`).

Use gold for eyebrows, section kickers, text-link arrows and interaction
states, FAQ disclosure markers, navigation states, and the changelog's small
new-feature dot. The pale background belongs only to selected mobile menu
items. Keep underlines, focus outlines, and other state indicators alongside
color. Gold and muted text meet 4.5:1 contrast on the specified ivory, section,
raised, and pale selection surfaces. Use the dark-background gold token on
dark sections and navigation; it meets 4.5:1 on both the shared ink and the
warm ink. The warm ink belongs to the Patron offer alone: the shared
`--site-accent` stays neutral, and product tokens are never warmed.
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
substitute website tokens for the shared product `--accent`, `--bg`, or other
product variables. Both light and private-mode product replicas must retain
their released colors, including when enlarged.

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
consent card, and every product replica stay in Inter, and the app keeps its
existing typefaces. The homepage demo carries one short sentence per scene as
an Inter figure title, never a second headline-and-subline pair under the
hero. Use the
`--site-font-patron` token, regular weight, restrained negative tracking, and
generous space around the name. Do not use the display serif for small text or
replace the canonical Sunrise symbol with a letterform.

The homepage offer pairs the monochrome Sunrise symbol with this display name
on a warm ink (`--site-ink-warm`) section. The display name and the main price
numeral are set in gold (`--site-gold-on-dark`); supporting copy, currency,
billing labels, and the symbol stay ivory (`--site-bg`), and the filled gold
button keeps its ink text. One radial gold light spill, anchored to the
section's top edge at no more than about a quarter strength, is the section's
only gradient; the symbol sits below its brightest point and is never backed
by it. Keep the pricing separate with a fine rule; retain a light keyboard
focus outline and mobile touch target of at least 48px. Avoid decorative
badges, additional gradients, and animated ornament. The section may rise
once into view under the homepage reveal rules below.

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
press card follow the heading face. The app keeps Inter; giving it
Newsreader needs its own brief. All new social templates follow the current Sunrise identity and Newsreader title rule. Previously approved launch assets require fresh review if changed.

### Editorial website footer

The shared website footer uses the monochrome Sunrise symbol alone as its
home link, without a typeset wordmark. Use the canonical BrandMark component
at 44px on desktop and 40px below 900px, inside a 44px touch target. Keep it
in ink (`--site-text`) on the warm section surface (`--site-surface`), including
on hover. Do not crop, tint, animate, outline, or place it inside a badge;
retain a visible keyboard focus ring.

Use a quiet editorial layout: the symbol and “A little less browser.” tagline
set in Newsreader at 20px,
grouped navigation, and a secondary newsletter, followed by a fine rule and compact
legal/social row. Navigation and utility links may use gold for hover, focus,
and current-page states. Social/contact icons retain their original geometry
and use bronze (`--site-gold`) at rest, changing to ink on hover or focus.

### Horizon rule and lit surfaces

The footer seam on every page carries the horizon rule: a 1px gold
(`--site-gold-on-dark`) hairline that fades out toward both edges, with a
soft gold glow rising about 160px into the page above it at no more than
about 30% strength. It replaces the footer's neutral top border. It is a
decorative seam, not a focus indicator, and no mark, badge, or lockup may sit
on the glow; the footer symbol remains ink on the warm surface below the line.

The homepage demo showcase frame is lit from its top edge with a raised-to-
surface (`--site-surface-raised` to `--site-surface`) gradient. The product
replica inside it keeps its released colors.

### Homepage reveal motion

The homepage feature grid and the Patron section may rise once into view: a
14px rise with a fade over 360ms, the grid's cards staggered by 70ms. The
reveal state is added only by script, only when motion is welcome, and only
for sections that start below the viewport, so server HTML, visitors without
JavaScript, and reduced-motion visitors always see every section at rest. A
revealed section never hides again. The hero mark, navigation, and footer
have no entrance animation.

### Homepage Sunrise mark

The owner-approved desktop hero mark permanently displays the original gold
Sunrise artwork used by the app icon, directly on the ivory page. Use the
generated `site/public/sunrise-hero-mark.png`, which shares the monochrome
mark's crop and geometry; do not approximate the artwork with a tint. Keep
its 32px size and existing placement above the eyebrow. There is no entrance
animation or fade back to ink.

On desktop with a fine pointer, hovering gently scales the gold hero mark to
118%, returning to rest over 280ms when the pointer leaves. Reduced-motion
visitors see the same static gold artwork without the hover effect. The hero
mark remains hidden on mobile.

### Desktop masthead Sunrise hover

The desktop masthead is a sticky ivory bar (`--site-surface-raised` over a
blur, hairline beneath) that carries the monochrome Sunrise mark at 24px in
ink at rest. On hover or keyboard focus, crossfade to the original gold
artwork from `site/public/sunrise-hero-mark.png` over 220ms; crossfade back
when the interaction ends. Keep the size, position, and focus outline
unchanged. Reduced-motion visitors get the same state change instantly. Use
the original artwork rather than tinting the monochrome silhouette. The mega
menus that drop from the bar carry the horizon hairline along their top edge
and may use the warm-ink release card; no mark sits on either. The masthead
replaced the bottom navigation island on 4 September 2026 (design note:
`docs/superpowers/specs/2026-09-04-masthead-navigation-design.md`).

Navigation decision, 4 September 2026: the bar reads features, company,
security, what's new, download. `features` opens a mega menu grouped as
Interface, Privacy and security, and Workflow, one link per feature page with
that page's own headline as its description, and a spotlight cropped to the
island. `company` opens Learn (FAQ, Press, About) and Community
(Ambassadors, Newsletter, Source on GitHub) with a warm-ink card for the
current release and a Blanc Patron line. The second menu is deliberately not
named for the studio or the About page, and About is listed last in its
group. Security stays a direct link on every page because trust is the
product's pitch, and it also appears inside features. There is no search
affordance because the site has no search, and no Patron entry in the bar
because there is no Patron page. Below 640px the same content becomes two
native accordions plus the direct links and a pinned download button. Legal
pages keep their own minimal header. Menu content lives in
`site/src/data/navigation.mjs` and is guarded by
`test/unit/site-navigation.test.js`.

### Mobile header Sunrise mark

The mobile hamburger header uses the original gold Sunrise artwork at its
28px size on ivory. Reuse `site/public/sunrise-hero-mark.png`; keep
the mark permanently in color without animation, including for reduced-motion
visitors. Its home link retains the existing 44px touch target and focus style.

Apart from the desktop navigation hover above, footer, press-kit, legal-header,
and other logo treatments stay monochrome. These exceptions do not authorize
recoloring other marks.

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
2. Confirm the symbol is Sunrise, never the retired B. For new social creative, use the original gold Sunrise artwork on the warm ivory theme; preserve its geometry and clear space.
3. Confirm crop-safe previews do not clip or crowd the mark.
4. Confirm new marketing uses the Sunrise ivory, warm ink, muted brown-gray and restrained gold palette.
5. Confirm titles are sentence case and subtitles follow the website hierarchy.
6. Apply the separate product-claim gate in `docs/marketing-claims.md`.
