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

### Canonical rendering — the part markup alone cannot guarantee

Byte-identical markup still renders differently under each surface's CSS, so
the rendered result is pinned, not just the path:

| Property | Value | Source |
| --- | --- | --- |
| Box | 14 × 14 px | matches `.vertical-tab-state` |
| SVG | 13 × 13 px | matches `.vertical-tab-state svg` |
| `stroke-width` | 1.35 | matches `.vertical-tab-state svg` |
| `stroke-linecap` / `linejoin` | round | matches `.vertical-tab-state svg` |
| `fill` | none | ditto |
| `stroke` | `currentColor` | ditto |
| `color` | `var(--text-dim)` | matches both surfaces' state colour |

These are the rail's existing numbers, adopted as canonical **so the rail needs
no CSS change at all**. The panel row's rule must reproduce them exactly.

Beware specificity: `.vertical-tab-state svg` (0,1,1) already sets size and
stroke inside the rail and will win over a bare `.quiet-glyph` (0,1,0). Either
match its values (as above) or qualify the selector. Do not introduce a second
set of numbers.

`styles.css` is shared by `index.html` and `overlay.html` (both `<link>` it),
so a single rule genuinely governs both surfaces. This is what makes "one
glyph" true rather than aspirational.

## Sharing mechanism — decided, not optional

`src/renderer/quiet-glyph.js` is a **classic script** exposing
`window.QUIET_GLYPH_SVG`, loaded before the renderer scripts in both documents:

```html
<!-- index.html -->            <!-- overlay.html -->
<script src="quiet-glyph.js">  <script src="quiet-glyph.js">
<script src="vertical-tabs.js"><script src="overlay.js">
<script src="renderer.js">
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

Add:

4. Both documents load `quiet-glyph.js` before their renderer scripts.
5. `overlay.js` and `vertical-tabs.js` both reference `QUIET_GLYPH_SVG` and
   neither contains an inline `<svg` for the quiet state.
6. The panel row dims the favicon when `tab.asleep`.
7. The Quick Switcher subline still emits the word `quiet` — a regression guard
   for the surface this spec deliberately leaves alone.

## Deliverables beyond code

`design-system/components/quiet-tabs/index.html` documents the current
treatment and is wrong the moment this lands. It is updated **in this same
change**, not afterwards — a specimen that disagrees with the product is worse
than no specimen. Running `/design-sync` to publish it remains the user's call.

## Not in scope

- When a tab goes quiet; `tab-sleep.js`; any main-process behaviour.
- The pill dots and the Quick Switcher subline (see Scope).
- The `/sleep` hint wording, which is PR #112's separate decision.
