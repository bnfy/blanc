# Newsreader reach, level A — design

**Date:** 2026-09-04
**Decision:** Level A of three mocked options, chosen by the owner from
https://claude.ai/code/artifact/0df319b7-4c00-4264-b073-2b906f04e8eb.
**Context:** Newsreader replaced Instrument Serif as the Patron display face
on 4 September 2026 (commit d8bc1a7). Until now it appears only in the Patron
name and price.

## What changes

Newsreader takes over exactly one line per page, plus the share cards:

- The homepage hero headline "A little less browser."
- The page-level `h1` on features (hub and each feature page), download,
  changelog, about, FAQ, press, and ambassadors.
- The press page's announcement pull quote, set in Newsreader's italic. This is
  the only place the italic appears.
- The titles on the generated Open Graph cards and the press card.

Everything else stays in Inter: the homepage demo showcase headline (it
animates between scenes), every section `h2`, feature cards, FAQ questions,
release names, the footer tagline, legal pages, the consent card, controls,
body copy, and every product replica.

## Type rules

- Regular weight (400) everywhere the serif appears. No 500 or 520.
- Optical sizing stays automatic; the site loads the `opsz` build so the axis
  is present.
- Tracking is restrained: `-0.02em` on headlines, `-0.005em` on the quote.
  The current Inter headlines use tighter values (down to `-0.057em`) that a
  serif does not want.
- Sizes rise a little so the lighter serif holds the same presence as
  Inter 500: roughly 6 to 10 percent, tuned per rule so line counts do not
  change at 390px, 768px, and 1440px.
- Lining figures wherever a number can appear in a headline.

## Loading

The `opsz` upright build moves from the homepage-only import to
`BaseLayout.astro` so every page has it. The italic build is imported only on
the press page. Legal pages get the upright file through the layout too; their
`h1` stays Inter, so the file is fetched but unused there, which is acceptable
against the cost of a fourth page profile.

## Cards

`render-og-cards.mjs` and `render-press-primary-capture.mjs` embed the
Newsreader latin `opsz` woff2 as a data URL next to Inter and set their `h1`
in it at regular weight. The output filenames are stable URLs and must not
change; the PNG bytes do.

## Brand doc

The "Titles and subtitles" rule changes from the UI sans at 500 to Newsreader
regular for titles; subtitles are unchanged. The Patron section's sentence
that other headings keep their typefaces is replaced with the list above of
what is serif and what stays Inter.

## Launch timing

Launch runs Monday 7 to Thursday 10 September. This lands on the site before
Monday listings. Social templates governed by the title rule wait until after
Product Hunt on Thursday so launch assets match what was already approved.

## Out of scope

The Electron app and its internal pages. Adding a font there needs its own
CSP, packaging, OFL bundling, and compliance work, and a separate brief.
