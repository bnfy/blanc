# Quiet glyph: one Zzz across every surface

**Date:** 2026-08-10
**Status:** approved, not implemented
**Supersedes:** the panel row's `quiet` text tag and the rail's circle-with-core
icon, both introduced in `2026-08-09-quiet-tabs-design.md`

## Why

The Island panel row marks a quiet tab with the literal word `quiet` in a
bordered mono pill. In a row that already carries a favicon, a title, a pin
button, a `group` chip and a close button, a fifth text element crowds the line
and reads as wordy. Replacing it with a glyph buys the width back.

The vertical rail solved the same problem differently: it dims the tab's
favicon **and** draws a circle-with-core marker (`ICONS.quiet`,
`vertical-tabs.js:22`). So the product already had two answers for one state.
This spec settles on one.

## The metaphor decision

A Zzz is the sleep metaphor, and this feature was deliberately renamed away
from sleep — "sleepy tabs" became **Quiet Tabs**, and CLAUDE.md records the
rule that every user-visible and assistive *string* says "quiet", with the
fixed `/sleep` command the sole exception.

That rule is preserved literally: after this change the only strings in the UI
remain "Quiet" (tooltip and marker label) and "quiet" (the row's accessible
name). The sleep metaphor exists purely as pixels.

This is a *reading* of the rule, not a mechanical consequence of it — the rule
speaks about strings and is silent about pictograms. It was chosen explicitly,
weighed against a non-sleep alternative (the rail's existing circle-with-core),
on the grounds that Zzz is the most instantly legible dormancy mark in general
use. Note that no surveyed browser ships a Zzz for this: Edge fades sleeping
tabs, Vivaldi dims their icons, Chrome offers an optional indicator plus memory
in the hover card. What they establish is the *dimming*, which this spec also
adopts — the Zzz itself is Blanc's own choice. Recorded here so a future reader
does not mistake it for drift.

## Scope

### Island panel row (`src/renderer/overlay.js`)

- The `<span class="row-quiet">quiet</span>` tag becomes the Zzz glyph.
- The row's favicon dims to `opacity: .45` when `tab.asleep`, matching
  `.vertical-tab-row.quiet .vertical-tab-favicon`.
- The glyph carries `title="Quiet"` for hover, and `aria-hidden="true"` because
  the row's accessible name already speaks the word (see Accessibility).

### Vertical rail (`src/renderer/vertical-tabs.js`)

- `ICONS.quiet` is redrawn as the same Zzz. Nothing else moves: the
  `makeMarker('vertical-tab-state vertical-tab-quiet', ICONS.quiet, 'Quiet')`
  call, the dimmed favicon, and the marker's label all stay.

### Pill dots — deliberately unchanged

`.island-dot.asleep` shrinks to a hollow core at roughly 5px. No glyph is
legible at that size, and the dot is a switch target rather than a status
field. This asymmetry is intentional; do not "fix" it.

## The glyph

Hand-drawn to Blanc's icon grid, not borrowed from an icon font. Every icon in
`overlay.js` and `vertical-tabs.js` is an inline SVG string on
`viewBox="0 0 16 16"`, stroked, inheriting `currentColor`, with no fills
(`reload`, `close`, `pin`, `mute` all follow this).

The Zzz is three stroked Z forms of decreasing size stepping up a diagonal —
largest at lower-left, smallest at upper-right — sharing that 16×16 grid and
the surrounding icons' stroke weight. It will not look like a webfont Zzz; it
will look like Blanc.

Both surfaces reference one definition. If the two files cannot share a module
without restructuring, duplicate the string and add a unit test asserting the
two are byte-identical — two glyphs drifting apart is the exact failure this
spec exists to end.

## Accessibility

The row's accessible name is composed separately from the visible tag, at
`overlay.js:278`:

```js
const parts = [label, tabDomain(tab), tab.asleep ? 'quiet' : ''].filter(Boolean);
primary.setAttribute('aria-label', `Switch to ${parts.join(', ')}`);
```

This is untouched. Screen-reader users keep hearing "quiet" exactly as today,
so removing the visible word costs them nothing.

Sighted users do lose an at-a-glance label: a Zzz is legible but not
self-labelling, and the `title` only appears on hover. That is the accepted
price of the width. The rail already made this trade; the panel now matches it.

## Tests

Three locks in `test/unit/quiet-tabs-chrome.test.js` move together:

1. `a quiet panel row is tagged "quiet" and named "quiet"` — the
   `quiet.textContent = 'quiet'` assertion goes.
2. **The visibility invariant must survive.** That same test asserts the tag is
   modelled on `.row-private` (visible at rest) and never on `.row-tag`
   (`opacity: 0` until hover/focus inside `.tab-row`). A state you can only see
   by hovering is not a state you can see. Carry this assertion onto the glyph;
   it is the easiest thing to lose in a rewrite and the most costly.
3. Line 159 pins the rail's `makeMarker(... ICONS.quiet, 'Quiet')` call. The
   call survives; only the icon's path data changes.

Add: the favicon-dimming rule for the panel row, and the byte-identity check if
the glyph string ends up duplicated.

## Not in scope

- **No substrate impact.** This is markup and CSS — not tokens, settings, or
  copy — so `substrate:check` does not participate. Contrast the `/sleep` hint
  wording (PR #112), which does.
- No change to when a tab goes quiet, to `tab-sleep.js`, or to any main-process
  behaviour.
- No change to the pill dots.

## Follow-up

`design-system/components/quiet-tabs/index.html` documents the current
treatment and goes stale the moment this lands. Update the specimen in the same
change; syncing it to the design system beforehand would publish a treatment
that is about to be replaced. Running `/design-sync` remains the user's call.
