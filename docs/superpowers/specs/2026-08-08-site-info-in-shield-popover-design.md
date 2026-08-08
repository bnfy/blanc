# Site information in the shield popover — design

**Date:** 2026-08-08
**Status:** Approved, ready for planning
**Supersedes:** the standalone site-information surface in `b2f674e` on `codex/post-1.0-development`

## Decision

Connection information folds into the **shipped shield popover** (#76) rather than
shipping a second island-anchored popover. Two popovers each surfacing the host, a
blocked count, and a settings link, from two different anchors, is one surface too
many.

Scope is deliberately **connection summary only**. The certificate-detail panel, the
certificate-verify-proc observer with its bounded LRU, and the certificate-error
interstitial from `b2f674e` are all out of scope. None of that main-process security
machinery is ported.

## What the user sees

The popover gains one row, a peer of the existing blocked-count row and styled the
same. The head (host + toggle) keeps its layout.

```
┌─────────────────────────────────┐
│ example.com                     │
│ Ad & tracker blocking  on [●──] │
│                                 │
│ Connection · Uses HTTPS         │  ← new row
│ 12 ads & trackers blocked       │
│                                 │
│ Changing this reloads the page. │
│ blocking settings →             │
└─────────────────────────────────┘
```

### Copy

| State | Row |
|---|---|
| `https` | `Connection · Uses HTTPS` |
| `http` | `Connection · Not encrypted` |
| `local` | `Connection · Local` |
| `null` | row hidden entirely |

**"Uses HTTPS", never "Encrypted connection".** The scheme proves what the address
says, not that a session was negotiated and verified. Without the verify proc there
is no evidence for the stronger claim, so the copy states only what is known.

**The header changes from `Protection on/off` to `Ad & tracker blocking on/off`.**
This is a deliberate edit to chrome that shipped in #76. Without it an HTTP site
reads "Not secure" immediately above "Protection on", which implies the site is
safe. The toggle's own `aria-label` already says "Ad & tracker protection for this
site", so the visible header was the outlier.

## Architecture

No new module. The pure `shield-model.js` is extended, consistent with its own
header: *"Main computes these and ships them on `tabs:updated`; the chrome renderers
only render."*

### Connection state is derived from the committed URL

```
connection: 'https' | 'http' | 'local' | null
```

The enum deliberately names schemes, not security properties, preserving the same
limited claim the copy makes.

Two rules govern derivation, and both matter:

1. **Derive from the committed `webContents.getURL()`, not the stored `tab.url`.**
   A tab is created carrying the *requested* URL (`main.js:1630`), and `main.js:639`
   already warns that a tab's live url "may already read as the NEW site when
   did-start-navigation" fires. Deriving from stored state can therefore assert
   HTTPS for a load that has not committed, or has failed. If `getURL()` is
   unavailable — destroyed or not-yet-attached view — the result is `null`.
2. **Return `null` while the tab is loading.** The row is then absent. An absent row
   is correct; a stale security claim is not.

### Derived exactly once

The claim "the pill, the panel, and the popover cannot disagree" is only true if there
is **one** derivation. There is:

1. `connectionState(url)` is pure on the URL alone — a scheme enum, nothing else. It
   knows nothing about loading. This is what makes it exhaustively unit-testable.
2. **Main computes `connection` once per broadcast** from `{ committedUrl, isLoading }`
   and serializes it onto the tab.
3. `shieldPopoverModel()` **receives that already-derived value and carries it
   through.** It does not re-derive, and it does not own the loading gate.

So `tab.connection` is the single source, and the popover row, `pillInsecure`, and
`panelInsecure` are three renderings of one value. Anything that computes connection
state a second time is a bug in the implementation, not an alternative reading of this
spec.

`local` covers loopback HTTP — `localhost`, `*.localhost`, `127.0.0.0/8`, `[::1]` —
matching the existing predicate exactly. Without it `http://localhost` would read as
"Not encrypted" to every developer using Blanc.

Non-`http(s)` URLs never reach this path: `blockableHostname()` already returns null
there, so the chip is hidden and the popover model is null.

### Canonical state, completed

The predicate `connectionInsecure()` currently exists **twice** — `renderer.js:175`
and `overlay.js:166` — the second carrying the comment "(Keep in sync with
renderer.js.)", which is an admission that two copies of a security predicate can
drift apart. There are **three** render sites: `pillInsecure` (`renderer.js:396`),
`panelInsecure` (`overlay.js:231`), and now the popover row.

After this change:

- `tab.connection` is derived once in main and shipped on `tabs:updated`.
- `shieldPopover.connection` derives from that same value, so the pill badge and the
  popover row can never disagree.
- `pillInsecure` and `panelInsecure` both render from `tab.connection`.
- **Both** copies of `connectionInsecure()` are deleted.

The existing `tab.isLoading` guard on both badges is preserved by construction:
`connection` is `null` while loading, so the badges hide for the same reason the row
does.

## Components

| File | Change |
|---|---|
| `src/main/shield-model.js` | Pure `connectionState(url)`; `shieldPopoverModel()` returns `connection`. `shieldChipState()` unchanged. |
| `src/main/main.js` | Derive from committed `getURL()`; ship `tab.connection` on `tabs:updated`; accept `trigger` on `chrome:open-shield`. |
| `src/main/chrome-layout.js` | **No change.** `SHIELD_POPOVER_HEIGHT` stays 232 — see below. |
| `src/renderer/index.html` | `#pillInsecure` `<span>` → `<button>`. |
| `src/renderer/renderer.js` | Badge opens the popover; render badge from `tab.connection`; delete local `connectionInsecure`. |
| `src/renderer/overlay.html` | `#shieldPopConnection` above `#shieldPopCount`; header copy. |
| `src/renderer/overlay.js` | Render the row; render `panelInsecure` from `tab.connection`; delete local `connectionInsecure`. |
| `src/renderer/styles.css` | Row styling; badge hit area and focus ring. |

## Popover height

**`SHIELD_POPOVER_HEIGHT` stays at 232.** The constant sizes the transparent overlay
`WebContentsView`'s hit-test region, not the card: `#shieldPop` is
`position: absolute; top: 10px; left: 12px; right: 12px` with **no height**, so the
card is naturally sized by its content and the region already leaves empty space below
it. Raising the constant would only enlarge the click-swallowing transparent area over
the page.

That is a real cost here, not a theoretical one. The find capsule's bounds are
deliberately kept tight "so the rest of the page stays clickable", and an overlay
region swallowing clicks shipped as a user-visible bug in 1.0.4/1.0.5.

**Verification condition:** the rendered card must not clip at 232 with the new row
present, checked visually in a real window at both themes. Increase the constant only
if the rendered card proves it necessary — and if it does, by the measured overflow,
not a round number.

## Interaction

### The badge becomes a trigger

`#pillInsecure` becomes a real button: `type="button"`, an accessible label, and
`aria-expanded` reflecting popover state. Its glyph stays 13×13 (`styles.css:906`),
but it gains an **invisible hit area of at least 24×24** via padding and a negative
margin, so the pill's resting layout does not shift. It takes a visible focus ring
and activates on Enter and Space. Its handler calls `stopPropagation()` so the click
does not also reach the pill's own open-panel handler.

### Trigger identity and re-anchoring

Today `chrome:open-shield` closes the popover whenever `overlayMode === 'shield'`,
regardless of what was clicked (`main.js:2572`). With two triggers that is wrong: the
badge would close a popover anchored under the shield rather than move it.

`chrome:open-shield` therefore gains a `trigger` id:

| Situation | Behaviour |
|---|---|
| Popover closed | Open, anchored under the clicked trigger. |
| Same trigger re-clicked | Close. (Preserves today's toggle.) |
| Different trigger clicked | **Re-anchor** under it. Do not close. |

Main stores the active trigger id alongside `shieldAnchorRight`.

### Trigger state must reach the strip

Main currently emits only `{ mode }` on `chrome:island-state` (`main.js:798`, `:813`),
and `hideOverlay()` returns focus to page content (`main.js:815`). Neither the
`aria-expanded` contract nor Escape-restores-focus is implementable against that, so
three additions are required:

1. **`chrome:island-state` carries the active trigger id** — `{ mode, trigger }`.
   Both controls need it: whichever trigger is active sets `aria-expanded="true"` and
   the other stays `false`. Without it the strip cannot know which of two buttons is
   the open one.
2. **An Escape-specific close reason.** `hideOverlay()` gains a reason distinguishing
   Escape from other dismissals. On Escape from `'shield'`, focus returns to the
   trigger that opened the popover instead of to page content — the strip does the
   focusing, on receiving `{ mode: null, trigger, reason: 'escape' }`. Escape is
   already handled in main at `main.js:716`, so this rides the existing path.
3. **Trigger state is cleared on every exit.** `main.js:805` already nulls
   `shieldAnchorRight` and `shieldPopoverHost` inside `hideOverlay()`; the trigger id
   is cleared in the same place, which covers normal close, overlay blur, tab switch
   (`main.js:2029`), and site-changing navigation (`main.js:1781`). Only the Escape
   path reads the trigger before it is cleared.

Re-clicking a trigger naturally leaves focus on that control, so it needs no special
handling.

## Error handling

There is no new failure path. Connection state is computed only when
`blockableHostname()` yields a host, so unparseable URLs and internal pages take the
existing `mode: 'hidden'` / `null` branches unchanged. A malformed URL yields `null`,
which hides the row.

## Testing

### Unit — `test/unit/shield-model.test.js`

On pure `connectionState(url)` — a scheme enum only: `https` · `http` ·
`http://localhost` · `http://sub.localhost` · `http://127.0.0.1` · `http://[::1]` ·
malformed URL → `null` · non-`http(s)` → `null`.

On `shieldPopoverModel()`: that a supplied `connection` is **carried through
unmodified** (including `null`), and that host normalization still strips `www.`.
Host normalization is a `blockableHostname()` concern surfaced by the popover model —
it is *not* a `connectionState()` assertion, which returns only a scheme.

No `chrome-layout` change, so no new constant assertion; the existing 20/20 shield and
layout baseline must stay green.

### Acceptance — `spec/acceptance/ad-blocking.feature`

Two scenarios, because an HTTPS page has no "Not secure" badge and so cannot exercise
that trigger:

- **`@F12-7 @F12 @desktop`** — the HTTP warning badge opens site controls, and the
  connection row reads *Not encrypted*.
- **`@F12-8 @F12 @all`** — phrased as *"When I open site controls"*, asserting the row
  reads *Uses HTTPS*. Desktop satisfies this through the shield; mobile can meet the
  same contract through its native equivalent later.

Both tags are added to `RUNNABLE` in `test/desktop/cucumber.mjs` and to
`spec/acceptance/index.md`.

Beyond the two contract scenarios, the interaction rules above need desktop coverage,
since none of them is observable from unit tests:

- **Re-anchoring** — with the popover open from one trigger, clicking the other
  re-anchors rather than closes.
- **Escape focus return** — Escape returns focus to the trigger that opened it, for
  each trigger.
- **`aria-expanded`** on *both* controls, asserting the inactive one stays `false`.

**Required harness work,** named here so it is not discovered during implementation:
`src/main/test-hook.js` needs readers for the popover's rendered row, the active
trigger, and the focused element; `test/desktop/steps/runnable.steps.js` needs the
matching steps. Both additions stay behind the existing
`!app.isPackaged && BLANC_TEST === '1'` gate.

`@desktop` is an established suite tag (23 uses across 6 feature files) and the
default profile is `not @mobile`, so `@F12-7` fits existing conventions.

### Parity

**No new divergence-register entry.** `parity-matrix.md:17` (F1) and `:28` (F12)
already record the shield popover as desktop. A `D#` entry should be added only once
mobile's alternative interaction is deliberately chosen, not for the extra desktop
trigger alone.

`spec/features.md` F12 gains a sentence describing the connection row.

## Known limitations

**Mixed content is invisible.** An HTTPS page loading HTTP subresources still reads
*Uses HTTPS*, because scheme-derived state cannot see subresources. The reference
implementation in `b2f674e` had the same gap. Recorded here so it is a known boundary
rather than a bug discovered later.

**No certificate identity.** Issuer, validity, and known-root status are not shown, so
the popover cannot distinguish a public CA from a locally-trusted MITM proxy. That is
the direct cost of leaving the verify proc out of scope, and it is why the copy claims
only "Uses HTTPS".
