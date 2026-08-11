# Quiet glyph: one Zzz in the panel row and the vertical rail

**Date:** 2026-08-10
**Status:** proposed — not approved, not implemented
**Amends:** the panel row's `quiet` text tag and the rail's circle-with-core
icon, both from `2026-08-09-quiet-tabs-design.md`

## Why

The Island panel row marks a quiet tab with the literal word `quiet` in a
bordered mono pill. In a row that already carries a favicon, a title, a pin
button, a `group` chip and a close button, a fifth text element crowds the line
and reads as wordy. A glyph buys the width back.

The vertical rail solved the same problem differently — it dims the favicon
*and* draws a circle-with-core marker (`ICONS.quiet`, `vertical-tabs.js:22`).
Two answers for one state. This spec settles the two of them on one mark.

## Scope: two surfaces change, two do not

| Surface | Today | After |
| --- | --- | --- |
| Island panel row (`overlay.js`) | `quiet` text pill | Zzz glyph + dimmed favicon |
| Vertical rail (`vertical-tabs.js`) | circle-with-core + dimmed favicon | Zzz glyph + dimmed favicon |
| **Quick Switcher results** | `quiet` in the subline | **unchanged — still the word** |
| **Pill dots** | 3.5px hollow core | **unchanged — still shape-only** |

### Quick Switcher stays text, deliberately

`overlay.js:742` builds a switcher result's subline as
`[tabDomain(t), t.asleep && 'quiet'].filter(Boolean).join(' · ')` — a text
subline, visible at rest because switcher rows are not `.tab-row`. It stays
exactly as it is. A switcher result is a *search hit* being described in prose
("example.com · quiet"), not a live row being scanned; a glyph mid-sentence
would read worse than the word. This is a decision, not an oversight.

### Pill dots stay shape-only, deliberately

`.island-dot` is 6px; `.island-dot.asleep::after` insets 1.25px, leaving a
visible core of **3.5px**. Nothing legible can be drawn at that size, and the
dot is a switch target rather than a status field. Do not "fix" this asymmetry.

## The glyph

### Canonical markup

One definition, in `src/renderer/quiet-glyph.js`:

```js
window.QUIET_GLYPH_SVG =
  '<svg class="quiet-glyph" viewBox="0 0 16 16" aria-hidden="true">' +
  '<path d="M1.5 9.75H6.25L1.5 14H6.25M7.75 5.5H11.5L7.75 9H11.5' +
  'M12.75 1.75H15L12.75 4.25H15"/></svg>';
```

Three stroked Z forms of decreasing size stepping up a diagonal: largest at
lower-left, smallest at upper-right. One `<path>`, three subpaths. Round caps
extend ~0.68 beyond each endpoint at the canonical stroke width, so every
extreme stays inside the 16×16 box (max reach 15.68, min 0.82).

### Canonical rendering — one rule, both surfaces

Byte-identical markup still renders differently under each surface's CSS, so
the rendering is locked by putting both surfaces in the **same declaration
block**. Not two rules holding matching numbers — one rule, two selectors.

`styles.css` is shared by `index.html` and `overlay.html` (both `<link>` it),
which is what makes this possible.

The two existing rail rules at `styles.css:536` and `:546` gain a selector
each. Their declarations do not change, so **the rail's rendering is untouched
by construction**:

```css
.vertical-tab-state,
.island-row .row-quiet {
  width: 14px;
  height: 14px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--text-dim);
  flex: 0 0 auto;
}

.vertical-tab-state svg,
.island-row .row-quiet svg {
  width: 13px;
  height: 13px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.35;
  stroke-linecap: round;
  stroke-linejoin: round;
}
```

The panel favicon dims through a `quiet` class on the row, mirroring the rail's
own `(tab.asleep ? ' quiet' : '')` at `vertical-tabs.js:347`. The panel's
favicon element carries no class of its own — it is a bare `<span>` inside
`.row-favicon-wrap` (`overlay.js:254-258`) — so the wrapper is the target:

```css
.island-row.quiet .row-favicon-wrap { opacity: .45; }
```

**Delete, do not extend, the old `.island-row .row-quiet` pill block**
(`styles.css:1644`, the `font-family` / `font-size` / `border` /
`border-radius` / `padding` declarations). Leaving it in place would draw a
bordered pill around the glyph.

Because both surfaces resolve through one block, there is no specificity
contest to lose and no second set of numbers to drift. Any implementation that
produces a separate `.quiet-glyph { … }` sizing rule has missed the point of
this section.

## Sharing mechanism — decided, not optional

`src/renderer/quiet-glyph.js` is a **classic script** exposing
`window.QUIET_GLYPH_SVG`, loaded before the renderer scripts in both documents:

`index.html`:

```html
<script src="quiet-glyph.js"></script>
<script src="vertical-tabs.js"></script>
<script src="renderer.js"></script>
```

`overlay.html`:

```html
<script src="quiet-glyph.js"></script>
<script src="overlay.js"></script>
```

Both documents already use classic `<script src>` tags with no modules, so this
matches the existing loading style. Both carry `script-src 'self'` in their CSP
(`index.html:5`, `overlay.html:5`), which already permits a same-directory
script — **no CSP edit is required**, and any change that appears to need one
means something else has gone wrong.

Duplication is **not** approved. The previous draft offered "one definition,
unless duplication, then a byte-identity test", which is a contract that
contradicts itself. There is exactly one definition.

## Accessibility

The row's accessible name is composed separately from the visible tag, at
`overlay.js:278`:

```js
const parts = [label, tabDomain(tab), tab.asleep ? 'quiet' : ''].filter(Boolean);
primary.setAttribute('aria-label', `Switch to ${parts.join(', ')}`);
```

Untouched. Screen-reader users keep hearing "quiet" exactly as today, so
removing the visible word costs them nothing. The glyph is decorative:
`aria-hidden="true"` in the canonical markup above, matching how the rail's
existing icon is already authored.

The rail keeps its `makeMarker(..., 'Quiet')` label. The panel glyph carries
`title="Quiet"` for hover.

Sighted users do lose an at-a-glance label — a Zzz is legible but not
self-labelling, and `title` only appears on hover. That is the accepted price
of the width. The rail already made this trade; the panel now matches it.

### The visibility invariant

`.row-quiet` is modelled on `.row-private` (visible at rest) and **never** on
`.row-tag`, which is `opacity: 0` until hover or focus inside `.tab-row`. A
quiet state you can only see by hovering is not a state you can see. This
invariant is asserted today and must carry onto the glyph; it is the easiest
thing to lose in a rewrite and the costliest.

## The metaphor decision

A Zzz is the sleep metaphor, and this feature was deliberately renamed away
from sleep — "sleepy tabs" became **Quiet Tabs** — with CLAUDE.md recording
that every user-visible and assistive *string* says "quiet", the fixed
`/sleep` command excepted.

That rule survives literally. After this change the only strings remain "Quiet"
(tooltip, marker label) and "quiet" (accessible name, Quick Switcher subline).
The sleep metaphor exists purely as pixels.

This is a *reading* of the rule, not a mechanical consequence — the rule speaks
about strings and is silent about pictograms. It was chosen explicitly, over a
non-sleep alternative (the rail's existing circle-with-core), because Zzz is
the most instantly legible dormancy mark in general use.

No surveyed browser ships a Zzz for this: Edge fades sleeping tabs, Vivaldi
dims their icons, Chrome offers an optional indicator plus memory in the hover
card. What they establish is the *dimming*, which this spec also adopts. The
Zzz is Blanc's own choice. Recorded so a future reader does not mistake it for
drift.

## What this touches

Renderer JavaScript, HTML, and CSS — not markup and CSS alone:

- `src/renderer/quiet-glyph.js` — **new**
- `src/renderer/index.html`, `src/renderer/overlay.html` — one `<script>` each
- `src/renderer/overlay.js` — row glyph replaces the text tag; favicon dims
- `src/renderer/vertical-tabs.js` — `ICONS.quiet` becomes the shared glyph
- `src/renderer/styles.css` — `.quiet-glyph`, panel-row rule, panel favicon dim
- `design-system/components/quiet-tabs/index.html` — **implementation
  deliverable, lands in this change** (see below)

No substrate impact: no tokens, settings, or copy change, so `substrate:check`
does not participate. Contrast the `/sleep` hint wording (PR #112), which does.

The icon convention is **stroked outlines with `fill: none` applied by CSS**,
not "no fills anywhere" — the rail's current quiet icon deliberately fills its
inner circle (`<circle … fill="currentColor" stroke="none"/>`). The new glyph
happens to need no fill; that is a property of this drawing, not a house rule.

## Tests

In `test/unit/quiet-tabs-chrome.test.js`:

1. `a quiet panel row is tagged "quiet" and named "quiet"` — drop the
   `quiet.textContent = 'quiet'` assertion; keep the accessible-name assertion.
2. **Keep the visibility invariant** (modelled on `.row-private`, never
   `.row-tag`), retargeted at the glyph.
3. Line 159 pins `makeMarker(... ICONS.quiet, 'Quiet')` — the call survives,
   the icon's source changes to the shared global.

Add, each one locking a clause of the contract above:

4. **The canonical path.** `quiet-glyph.js` contains exactly the path data in
   this spec — asserted as a literal string, not a loose `/M1\.5/` match. The
   drawing is the contract.
5. **One definition.** Both documents load `quiet-glyph.js` before their
   renderer scripts; `overlay.js` and `vertical-tabs.js` each reference
   `QUIET_GLYPH_SVG`, and neither contains an inline `<svg` for the quiet
   state.
6. **One rule, both surfaces — specificity-proof.** Assert that
   `.island-row .row-quiet` and `.vertical-tab-state` appear in the *same*
   declaration block, for both the container rule and the `svg` rule, and that
   `styles.css` contains no other rule setting `width`, `stroke-width`, or
   `stroke-linecap` on `.row-quiet`, `.vertical-tab-state`, or `.quiet-glyph`.
   A test that merely checks each surface has the right numbers would pass on
   two parallel rules, which is the failure being guarded.
7. **The rendered values.** From that shared block: `svg` 13 × 13,
   `stroke-width: 1.35`, `stroke-linecap` and `stroke-linejoin` round,
   `fill: none`, and a 14 × 14 container on both surfaces.
8. **The old pill is gone.** No `.island-row .row-quiet` rule sets
   `border`, `border-radius`, `padding`, or `font-family`.
9. **Panel glyph semantics.** It carries `title="Quiet"` and
   `aria-hidden="true"`, and the row's accessible name still ends in `quiet`.
10. **Favicon dimming.** The panel row takes a `quiet` class when `tab.asleep`,
    and `.island-row.quiet .row-favicon-wrap` sets `opacity: .45`.
11. **Quick Switcher untouched.** Its subline still emits the word `quiet` — a
    regression guard for the surface this spec deliberately leaves alone.

### Perceivability check

The unit tests above are static source assertions; this session's own history
is that such tests pass while the feature is invisible. Add one desktop
acceptance assertion that reads **computed** style from both live glyphs — the
vertical layout with the Island panel open shows the rail and the panel row
together — and asserts their `width`, `stroke-width`, `stroke-linecap` and
`fill` are equal, and that the panel glyph's box is non-zero. Equality of the
computed values is the only check that survives a future stylesheet edit no
static assertion anticipated.

## Deliverables beyond code

`design-system/components/quiet-tabs/index.html` documents the current
treatment and is wrong the moment this lands. It is updated **in this same
change**, not afterwards — a specimen that disagrees with the product is worse
than no specimen. Running `/design-sync` to publish it remains the user's call.

Two corrections to make while updating it:

- **Line 255 is wrong today**, independently of this change. It reads: "The tab
  record's field is `asleep` and the command is `/sleep`, both internal-facing
  — the same split as Favorites and `bookmarks`." `/sleep` is **not**
  internal-facing: a person types it into the command palette. It is the one
  deliberate, documented place where the internal word is shown to users, which
  is the opposite of the `bookmarks` split (an identifier no user ever sees).
  Say that instead.
- **Line 137 says "Three surfaces carry that state."** After this change the
  count and the treatments both move: panel row and rail share the Zzz, pill
  dots stay shape-only, and the Quick Switcher subline stays as the word. State
  all four and which two changed.

## Not in scope

- When a tab goes quiet; `tab-sleep.js`; any main-process behaviour.
- The pill dots and the Quick Switcher subline (see Scope).
- The `/sleep` hint wording, which is PR #112's separate decision.
