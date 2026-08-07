# Drag-region regression fixtures

Pages that declare native Electron window-drag regions (`-webkit-app-region: drag`).
Those regions are resolved by an AppKit hit test on the window's content view that
runs **before** child `WebContentsView`s are consulted, so a page holding one can take
a click aimed at the island panel before any renderer sees an event. That was the
cause of the pinned-row click bug (`src/main/chrome-compat-preload.js`).

**This cannot be covered by `npm run test:unit`** — it needs a real packaged build,
real OS-level mouse events, and a real window. Keep it as a manual gate whenever the
preload's drag-region guard changes.

## Running it

1. `npm run dist:dir`
2. `open -a "$PWD/dist/mac-arm64/Blanc.app" --args --remote-debugging-port=9999`
3. Serve this directory: `python3 -m http.server 8787 --bind 127.0.0.1`
4. Open `http://127.0.0.1:8787/bands.html` in Blanc, press ⌘L, and click island
   rows sitting over each coloured band. The light-DOM band is the release gate.
5. Repeat with `shadow-cases.html` only when documenting the known shadow-DOM
   limitation or evaluating a future native fix.

**The tab under test must be the active tab for every click.** Clicking a row switches
tabs, which swaps in a page with no drag regions — that confound made an earlier run
read 33/33 pass when the real number was 0/14.

Page coordinates are offset by the 64px chrome strip: window y = page y + 64.

## Expected

`bands.html` — light-DOM, open- and closed-shadow bands.
`shadow-cases.html` — A `attachShadow` closed · B `attachShadow` open ·
C declarative open · D declarative closed · E closed + `!important`.

**Only the light-DOM band is expected to pass.** As of 1.0.6 the guard is a
user-origin CSS reset, which stops at the light DOM — every shadow-root case here
(A, B, C, D, E) still swallows clicks. That is the open Electron/native issue these
fixtures exist to document, not a regression.

A renderer-side workaround (intercepting `attachShadow` to adopt the reset into each
root) was prototyped and measured to fix A, B, C and E, but was rejected for 1.0.6: it
monkeypatches `Element.prototype` in every page and frame, its one-time sweep misses
declarative roots created later, and its cascade win was only ever demonstrated against
one class selector. Kept here as a record of what was measured, not as a plan.

If the **light-DOM** band ever swallows clicks, the shipped guard has regressed.
