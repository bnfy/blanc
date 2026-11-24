# White website footer

Date: November 23, 2026. A small change.

## Intent

The owner asked for a lighter, airier website footer. The site moved to a
lighter cream and a white header the same day (#1714), and the dark `#111`
footer is now the one heavy block on every page. The brand guide's palette
already lists the masthead and the footer as white (`--site-surface-raised`).

## Approaches

Three directions were rendered on the real site at 1440px and shown to the
owner:

- **A, white band** (Apple-style): the same layout on a white band that matches
  the header, with ink type and tighter link rows. The smallest change, and it
  agrees with the brand palette.
- **B, on the page** (Linear/Vercel-style): no band; the cream page continues
  below the gold hairline, with quieter headings and more space. The airiest,
  but the footer loses its edge on cream pages.
- **C, centered**: centered lockup and newsletter on the section cream, each
  link group as one centered line. The biggest restructure.

**The owner picked A.**

## Design

- The footer becomes a white band (`--site-surface-raised`). Its links,
  headings, newsletter form, notes slot, Privacy choices button and social row
  stay exactly as they are, in the same order.
- The lockup uses the ink word (`/lockup/blanc-word-display-ink.svg`); the
  Sunrise mark is unchanged.
- Type: the column headings and the tagline in ink; links rest in the muted
  warm text color (`--site-text-dim`) and turn ink on hover; focus rings use
  gold on light (`--site-gold`); the rules between notes, columns and the
  bottom row use `--site-border`.
- Newsletter field: a white field with a `--site-border` outline and an ink
  Subscribe pill with a cream label, like the site's other dark buttons.
- The horizon rule stays: the gold hairline at the seam and the glow rising
  into the page above (the glow sits on the page, so it is unchanged).
- Link rows get tighter with a mouse or trackpad (`pointer: fine`); touch
  screens keep the rows they have today (9px padding, about 36px).

## Non-goals and anti-goals

- No link, wording or order changes, no new sections, no layout restructure.
- The header is untouched.
- Not acceptable: text below WCAG AA contrast on white, a footer that blends
  into cream pages with no edge, or touch targets smaller than today's.

## Amendment: the homepage stays dark

After seeing the white band built, the owner said the dark footer looks better
on the homepage, which ends on a dark section. The homepage keeps the dark
footer (BaseLayout `footer="dark"`); every other page gets the white band. Both
looks come from one set of `--footer-*` color variables.

## Constraints
- `docs/brand-usage.md` (*Editorial website footer*) and `site/CLAUDE.md`
  describe the dark footer and change with it. `test/unit/brand-assets.test.js`
  pins the footer's white word and moves to the ink one.

## Left to the builder

- The hairline's exact gold on a light seam (gold on dark or gold on light, and
  its strength), checked on a cream page and on the homepage's dark seam; the
  footer test follows whichever is chosen.
- The exact tighter row padding and the band's top and bottom padding.
