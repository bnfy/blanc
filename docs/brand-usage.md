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

### Website Sunrise accents

The website adds muted gold to small editorial and navigation details while
keeping white backgrounds, neutral surfaces, and black-and-white primary
buttons. These are website-only tokens, separate from the product palette:

- gold on light backgrounds: `#8A6427` (`--sunrise-gold`);
- gold on dark backgrounds: `#D4AD66` (`--sunrise-gold-on-dark`);
- pale selected-state background: `#F6EBD5` (`--sunrise-selection`).

Use gold for eyebrows, section kickers, text-link arrows and interaction
states, FAQ disclosure markers, navigation states, and the changelog's small
new-feature dot. The pale background belongs only to selected mobile menu
items. Keep underlines, focus outlines, and other state indicators alongside
color. Gold text meets 4.5:1 contrast on the specified white, soft-paper, pale
selection, and dark surfaces when paired with the appropriate token.

Headings, body copy, primary buttons, playback and form controls remain
neutral. Logos, their backing fields, social icons, product screenshots,
demos, and illustrations retain their existing colors. Never substitute
these website tokens for the shared product `--accent` or use them to tint a
mark or its backing composition; the monochrome logo rules above still apply.

### Homepage Sunrise transition

The owner-approved homepage introduction is a narrow exception to the
monochrome rule: the desktop hero mark starts with the original gold Sunrise
artwork used by the app icon, then fades into its existing ink silhouette.
Hold the gold briefly and settle to ink within 1.8 seconds, once per page load,
with no looping, entrance movement, glow, or change to its white backing field.
Use the generated `site/public/sunrise-hero-mark.png`, which shares the
monochrome mark's crop and geometry; do not approximate the artwork with a tint.

On desktop with a fine pointer, hovering gently scales the hero mark to 118%
and reveals the same gold artwork. Both return to rest over 280ms when the
pointer leaves. This interaction never restarts the entrance animation.

Reduced-motion visitors see the static ink hero mark without the hover effect.
The hero mark remains hidden on mobile.

### Mobile header Sunrise mark

The mobile hamburger header uses the original gold Sunrise artwork at its
28px size on white. Reuse `site/public/sunrise-hero-mark.png`; keep
the mark permanently in color without animation, including for reduced-motion
visitors. Its home link retains the existing 44px touch target and focus style.

Desktop navigation, footer, press-kit, legal-header, and other logo treatments
stay monochrome. These exceptions do not authorize recoloring other marks.

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
- use the UI sans at approximately 500 weight with restrained negative
  tracking and a compact line height;
- place the explanatory subtitle below in a smaller regular-weight size and a
  muted neutral gray;
- keep the title direct and let the subtitle explain the consequence or proof.

All caps is reserved for small mono utility labels such as eyebrows, counters,
state labels, and interface annotations. It is not a headline treatment.

## Pre-publication check

Before approving or publishing an asset:

1. Inspect every frame, thumbnail, crop, and end card—not only the source file.
2. Confirm the mark is black on white or white on black with no accent-colored
   backing treatment.
3. Confirm crop-safe previews do not clip or crowd the mark.
4. Confirm campaign colors do not override the paper/ink identity.
5. Confirm titles are sentence case and subtitles follow the website hierarchy.
6. Apply the separate product-claim gate in `docs/marketing-claims.md`.
