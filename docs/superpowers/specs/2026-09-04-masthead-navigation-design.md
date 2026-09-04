# Masthead navigation with mega menus — design

**Date:** 2026-09-04
**Decision:** Direction A of two working prototypes, chosen by the owner from
https://claude.ai/code/artifact/4eb10b51-2155-450f-9cad-9685bd3d94b8.
**Replaces:** the bottom-anchored desktop navigation island (a dark pill that
tucks on downward scroll) and the six-link mobile sheet.

## Why

The site's headings became Newsreader on 4 September 2026. A masthead is the
container that editorial voice belongs in. It also ends the homepage's problem
of two floating pills of the same shape, the site's navigation and the demo's
product island, competing for one metaphor, and it gives every feature page a
single-hop path from any page. The pill geometry survives in the download
button and the menu triggers, so the echo of the product's Island remains.

## The bar

- Sticky at the top of every non-legal page, in normal flow, 64px tall on
  desktop. Legal pages keep their own `legal-top` header (a deliberate page
  profile, unchanged).
- Raised ivory (`--site-surface-raised` at 0.86 over a 14px blur) with a
  1px `--site-border` hairline beneath.
- Left: the Sunrise mark at 24px in ink, crossfading to the gold artwork on
  hover and focus over 220ms, the mechanism the current nav already uses.
- Centre-left: mono links, `features` and `resources` as menu triggers with a
  caret, `what's new` as a direct link.
- Right: the `download` pill (ink, 38px tall). No search affordance: the site
  has no search, and a dead control is worse than none.
- Homepage (`header="island"` profile): the bar starts transparent over the
  hero and becomes raised once the page has scrolled 12px. Every other page
  (`header="solid"`): always raised. The profile prop keeps its name.
- The bar never tucks. The tuck-on-scroll script and its styles are removed.

## The mega menus

A full-width panel drops from the bar. Its top edge carries the gold horizon
hairline (transparent to `--site-gold-on-dark` and back). Content is centred
in an 1120px column.

**Features**, three groups with a one-line description per link, plus a
spotlight card:

- Interface: The island, Vertical tabs, Tab groups, Quiet tabs
- Privacy: Ad blocking, Private tabs, Security
- Workflow: Command palette, Sync
- Spotlight: `/feature-island.png` (a stable URL), "One small island. The
  whole browser.", link to `/features/island`.
- Footer line: "Nine features. No account, no AI, no extension store." and
  "All features" to `/features`.

**Resources**, two groups plus a release card:

- Learn: FAQ, About, Press
- Community: Ambassadors, Newsletter (the footer form on the current page),
  Source on GitHub
- Release card on warm ink with the Patron light spill: "What's new",
  "Blanc <version>" in Newsreader gold, the release's editorial feature names,
  link to `/changelog`. Version and names come from `site/src/data/` at build
  time, never typed by hand.
- Footer line: "Blanc is free to browse. Patron is optional." and "Blanc
  Patron" to `/#home-patron-title`.

Descriptions reuse each feature page's own headline, so no new claim enters
the site.

## Behaviour

- Hover opens a menu after a 120ms intent delay; leaving the bar and panel
  closes it after 260ms.
- Click and Enter or Space toggle. Only one menu is open at a time.
- Escape closes and returns focus to the trigger. Tab walks the panel in
  document order. Focus leaving the header closes it. Pointer down outside
  closes it.
- Triggers are `<button aria-expanded aria-controls>`; panels are regions
  named by their trigger. Nothing depends on hover alone.
- Reduced motion: panels appear without the 6px rise.

## Below 640px

The mark-and-hamburger bar stays, now sticky in flow at the top. The sheet
holds the same two groups as native `<details>` accordions (no script needed
to open them), then `What's new`, then the download button pinned at the
bottom. The current-page item keeps the pale selection background.

## Consent toast

The measurement toast is fixed top-right at 12px. On desktop it moves down to
clear the bar (76px) so the two never overlap.

## Brand doc

The "Desktop navigation Sunrise hover" section changes: an ivory masthead
rather than a dark island, the mark at 24px rather than 20px, the same gold
crossfade. The mobile header section is unchanged.

## Out of scope

Site search. A Patron page. Any change to the Electron app.
