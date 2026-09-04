# Blanc brand usage

This is the required visual-identity check for Blanc marketing, social assets,
press materials, product demos, thumbnails, avatars, and generated imagery.

## The mark is monochrome by default

The Blanc mark's static website and marketing treatments are:

- black mark on a white field;
- white mark on a black field.

Except for the website Sunrise treatments documented below, never recolor the mark.
Never place it on, inside, or visually backed by an
accent-colored circle, badge, tile, gradient, texture, photograph, or other
shape. Do not add an outline, glow, colored shadow, or decorative fill to the
mark. Preserve clear visual space around it.

Campaign accent colors may appear elsewhere in a static graphic when the
campaign calls for them, but they must remain clearly separate from the mark.
An accent-colored shape behind a white logo tile still reads as a colored logo
treatment and is not allowed.

Outside the website Sunrise treatments below, this is a fail-closed rule.
If any part of a logo lockup, badge, avatar,
thumbnail, end card, or immediate backing composition introduces a non-neutral
color, reject the asset; do not approve it as an exception and do not publish
it. The permitted lockups are entirely black and white, not merely a
monochrome mark placed inside a colored composition.

Use `assets/blanc-mark.svg` as the canonical authoring source. Its white
distressed strokes are cutout instructions, not a third brand color;
`npm run brand:build` converts them to transparent negative space and
regenerates the app icons, in-product marks, website logo and favicons, and
their exported variants. A white-on-black treatment must keep the same
geometry and change only the mark/field polarity.

## Core palette

Blanc's default visual system is paper/ink with restrained neutral surfaces:

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

### Website Sunrise palette

The website carries the Sunrise icon's warmth through ivory backgrounds,
warm surfaces, and muted gold details. Keep the existing typography,
near-black headings, dark primary buttons, and an ivory desktop masthead.
These website-only tokens are separate from the released product palette:

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

The website may place its monochrome marks directly on these warm page
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
Newsreader needs its own brief. Social templates under the title rule below
adopt Newsreader only after the September 2026 launch week, so launch assets
stay consistent with what was approved before it.

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
- center titles and balance deliberate line breaks rather than setting them as
  a left-aligned poster block;
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
2. Confirm the mark is black on white or white on black, or is one of the
   website Sunrise treatments explicitly documented above. Outside those
   website treatments, no accent-colored backing is permitted.
3. Confirm crop-safe previews do not clip or crowd the mark.
4. Confirm campaign colors do not override the paper/ink identity.
5. Confirm titles are sentence case and subtitles follow the website hierarchy.
6. Apply the separate product-claim gate in `docs/marketing-claims.md`.
