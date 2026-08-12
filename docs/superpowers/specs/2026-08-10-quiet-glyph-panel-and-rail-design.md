# Quiet glyph: one Zzz in the panel row and the vertical rail

**Date:** 2026-08-10
**Status:** implemented & validated — Tasks 1–3 shipped (`9e20d00`, `1882009`,
`b31ef3d`; docs reconciled in `044a399`). Scope reduced 2026-08-12 to the
two-surface contract below. Validated on real Electron: the full runnable
acceptance suite ran **92/92 green with `--retry 0`** and produced **0 new
Electron crash reports**; unit suite green for the quiet-glyph tests.
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

## Scope: quiet lives on two surfaces only

Quiet is shown in exactly one way — a Zzz glyph plus a dimmed favicon — on the
panel row and the vertical rail, and **nowhere else**. The two other surfaces
that used to carry a quiet mark have it **removed**.

| Surface | Today | After |
| --- | --- | --- |
| Island panel row (`overlay.js`) | `quiet` text pill | Zzz glyph + dimmed favicon |
| Vertical rail (`vertical-tabs.js`) | circle-with-core + dimmed favicon | Zzz glyph + dimmed favicon |
| **Quick Switcher results** | `quiet` in the subline | **removed — subline is just the domain** |
| **Pill dots** | 3.5px hollow core + accessible "quiet" | **removed — no quiet, visual or accessible** |

> **Revision 2026-08-12.** An earlier draft kept the pill-dot core and the
> Quick Switcher word as deliberate, documented decisions. That was reversed on
> the user's call: the pill dots "add no value" for this, and the treatment
> should be *simple* — the Zzz icon and the dimmed favicon, that's it. Both
> other surfaces now carry no quiet state.

### Quick Switcher: quiet removed

`overlay.js` built a switcher result's subline as
`[tabDomain(t), t.asleep && 'quiet'].filter(Boolean).join(' · ')`. It is now
just `tabDomain(t)` — the domain, no quiet. A search result is not a place the
quiet state needs to live; the Zzz glyph on the panel row and rail carries it.

### Pill dots: quiet removed

The pill dot's quiet treatment is gone entirely — both the visual
(`.island-dot.asleep:not(.private)` transparent background + shrunk `::after`
core) and the accessible name (`, quiet` in the dot's `aria-label`), plus the
`asleep` field in `dotsSignature`. The dot is a switch target, not a status
field; nothing legible fits at 6px, and screen-reader users still hear "quiet"
on the panel rows and rail.

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
own `(tab.asleep ? ' quiet' : '')` at `vertical-tabs.js:347`:

```css
.island-row.quiet .row-favicon-wrap { opacity: .45; }
```

**The wrapper is a deliberate whole-unit target, not a fallback.** The favicon
element is not classless — `setFavicon()` assigns it `.favicon` plus one of
`loading` / `internal` / `has-icon`. The wrapper is chosen because it is the
whole visual unit: `.row-favicon-wrap` also holds the mute badge
(`overlay.js:259-263`), and a quiet tab should dim as one object rather than
have its favicon fade out from under a badge that stays bright. Targeting the
wrapper also keeps the rule clear of those three state variants.

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
- `src/renderer/overlay.js` — row glyph replaces the text tag; favicon dims;
  the Quick Switcher subline drops `quiet` (now just `tabDomain(t)`)
- `src/renderer/vertical-tabs.js` — `ICONS.quiet` becomes the shared glyph
- `src/renderer/renderer.js` — the pill dot's quiet treatment is **removed**:
  the `' asleep'` class, the `, quiet` accessible name, and the `asleep` field
  in `dotsSignature`
- `src/renderer/styles.css` — one selector added to each of the two existing
  rail rules, the old `.row-quiet` pill block deleted, the panel favicon dim
  added, and the `.island-dot.asleep` quiet rules **deleted**. **No
  `.quiet-glyph` sizing rule** — the contract above forbids it
- `design-system/components/quiet-tabs/index.html` — **implementation
  deliverable, lands in this change** (see below). Pill-dot and Quick Switcher
  specimen sections removed
- `spec/acceptance/quiet-tabs.feature` + `test/desktop/steps/quiet-tabs.steps.js`
  — the `@F31-5` scenario becomes "the panel and rail expose a distinct quiet
  state"; the step now guards that the pill dot carries **no** quiet

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
11. **Quick Switcher carries no quiet.** Its subline is `const sub = tabDomain(t)`
    with no `t.asleep && 'quiet'` — a regression guard that quiet was removed
    from search results.
12. **Pill dots carry no quiet.** No `.island-dot.asleep` CSS, no `' asleep'`
    class in `renderer.js`, the dot's accessible name is `Switch to ${title}`
    with no `, quiet`, and `dotsSignature` no longer lists `asleep`.
13. **No `asleep` string reaches a user.** With the pill dot's `' asleep'` class
    fragment gone, the guard permits **no** `asleep` string literal at all.

### Perceivability check

The unit tests above are static source assertions; this session's own history
is that such tests pass while the feature is invisible. Add one desktop
acceptance assertion reading **computed** style from both live glyphs — the
vertical layout with the Island panel open shows the rail and the panel row
together.

Comparing sizes alone is not enough. **An element with `opacity: 0` still has a
non-zero box and a full computed width**, so a geometry-only check would pass
on a glyph nobody can see — which is precisely the `.row-tag` failure the
visibility invariant exists to prevent. The assertion must therefore, in order:

1. **Establish the at-rest state.** The panel row is neither hovered nor
   focused — move the pointer clear and assert nothing in the row matches
   `:hover` or `:focus-within`. A glyph that only appears on hover must fail
   here, so the check cannot be run while pointing at the row.
2. **Prove it is rendered.** For the glyph and every ancestor up to the row:
   `display` is not `none` and `visibility` is `visible`.
3. **Prove it is not transparent.** The *cumulative* opacity — the product of
   every ancestor's computed opacity, not just the glyph's own — is greater
   than zero. Only the product catches a transparent wrapper.
4. **Prove both have a box.** The panel glyph *and* the rail glyph each report
   non-zero width and height.
5. **Prove they agree.** `width`, `stroke-width`, `stroke-linecap` and `fill`
   are equal between the two.

Steps 1–3 are what make this a perceivability check rather than another
existence check. Step 5 is the only assertion that survives a future stylesheet
edit no static test anticipated.

## Deliverables beyond code

`design-system/components/quiet-tabs/index.html` documents the current
treatment and is wrong the moment this lands. It is updated **in this same
change**, not afterwards — a specimen that disagrees with the product is worse
than no specimen. Running `/design-sync` to publish it remains the user's call.

While updating it: the **Pill dots** and **Quick Switcher result** specimen
sections are removed (those surfaces no longer carry quiet); the lede states
that quiet lives on exactly two surfaces (panel row + rail), both as Zzz +
dimmed favicon; the values table drops the pill-dot rows; and the `/sleep`
clarification stands — `/sleep` is the one deliberate place the internal word
is shown to users, the opposite of the `bookmarks` split.

## Not in scope

- When a tab goes quiet; `tab-sleep.js`; any main-process behaviour.
- The `/sleep` hint wording, which is PR #112's separate decision.
