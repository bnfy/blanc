# Blank-tab pill affordance — design

**Date:** 2026-08-16 · **Status:** approved pending user review

## The problem

A first-time user, observed 2026-08-15 on v1.4.0, did not work out that the
resting island is where you type. Two things put him there:

1. **Cold launch focuses page content, not the island.** `main.js:5620`
   activates the startup tab with `setActiveTab(startupTabId, { focusContent: true })`.
   ⌘T opens the panel focused; the very first thing a new user ever sees does not.
2. **The start page asks a question it cannot answer.** `newtab.html:13` is a
   static `<h1>Where to?</h1>`. The only answer target is `#pillDomain` — the
   words "new tab" rendered in the same ink as a domain, whose sole affordance
   is a `title` tooltip.

So the screen asked where he wanted to go and offered nowhere to say it.

This is treated as a **permanent affordance problem, not a first-run teaching
problem** (decided 2026-08-16). The onboarding tour merged the same day does
carry an "the island" step, but a skippable vignette does not help the person
who skipped it, and it reaches none of the existing v1.4.0 installs.

Scope is deliberately **the empty state only**. A loaded page's pill keeps
showing its bare domain exactly as it does today; making the pill advertise
editability on every page is the change that turns the island back into a
toolbar, and it is not in this design.

## What ships

### 1. The blank-tab placeholder

When `tabDomain(tab)` is empty and the tab is not loading, `#pillDomain`
renders a caret element plus dim placeholder text — `Search or type a URL` —
in place of the literal `new tab` / `private tab` fallback at
`renderer.js:570-572`. A new sibling `<button id="pillSlash">/</button>`
appears beside it.

Both are hidden in every other pill state, so loaded pages are untouched.

Private blank tabs get the same treatment. Dropping the "private tab" string
loses nothing: `#pillPrivateChip` already states the mode, and it sits directly
beside the placeholder.

The dim treatment uses a **new `.placeholder` class, not the existing `.dim`**.
`.dim` is toggled by `isLoading` at `renderer.js:573`; the two states must stay
independently controllable.

### 2. The caret

A 1px bar before the placeholder text, blinking for **4 iterations at 1.1s**
(≈4.4s) and then resting visible. Deliberately not a permanent blink: the pill
sits above every page the user opens, and motion that never resolves in
always-on-screen chrome is a long-term irritant.

No `animation-fill-mode: forwards` — when the animation ends the element
reverts to its default (visible) opacity, which is the wanted resting state.
Adding `forwards` would freeze it on the keyframe's final `opacity: 0` and
leave no caret at all.

`prefers-reduced-motion` drops the animation and renders the static bar.

**Implementation hazard — the caret must not rebuild on every broadcast.**
`tabs:updated` arrives roughly 10/s while any tab is loading. If the
placeholder DOM is recreated on each render pass the animation restarts every
time and the caret blinks forever, silently defeating the decision above.
The placeholder must be constructed only on the *transition into* placeholder
mode, following the `dotsSignature` guard already in the same function
(`renderer.js:563`), which exists for exactly this reason.

### 3. The `/` chip

`#pillSlash` is a real button, styled mono and dim with the pill's border
token, carrying `title`/`aria-label` "Commands (/)". It wires up like every
other pill button (`pillButton`, `renderer.js:96`): `mousedown` preventDefault
so a click never leaves a stray focus ring in the resting pill, `click`
stopPropagation so it does not also bubble to the pill and open the plain panel.

It fires a new **no-argument** `chrome:open-island-commands`. Main hardcodes
the prefill:

```js
chromeOn('chrome:open-island-commands', () => openIslandTyping('/'));
```

The channel is **not** named `…-palette`: `'palette'` is already a distinct
overlay mode — "the summoned palette, centered over a scrim" (`overlay.js:3`,
and `styles.css:1381` scopes the backdrop to `body[data-mode="palette"]`) —
whereas this opens `'panel'`. Naming it for the palette would point at the
wrong mode.

`showOverlay(mode, { prefill })` already exists (`main.js:1697`) and
`applyMode(next, prefill, purpose)` already consumes it (`overlay.js:1245`);
`main.js:4345` is the existing precedent, passing `'/group '` from the menu.
No renderer-supplied string crosses IPC on this channel.

A bare `/` cannot state what it does, so the chip does not try to: clicking it
shows the command list, and the person who could not decode the glyph learns
by seeing the result.

### 4. Type-to-open

The caret asserts that keystrokes land somewhere. Today they do not — a blank
tab has content focus. This makes the assertion true.

**Owner: `newtab.js`, not main.** Only the renderer knows what is focused. A
main-side `before-input-event` on the tab's `webContents` (the pattern at
`main.js:2530`) fires before page dispatch and cannot tell whether the
onboarding dialog is holding focus, so it would steal keys from the dialog's
own controls.

A `keydown` listener on the document, ignored unless **all** of:

- `event.target === document.body` — the onboarding dialog, the footer layout
  switcher, and any future control keep their own keys;
- not `event.isComposing` — IME composition is left alone (those users reach
  the panel by click or ⌘L; accepted);
- `[...event.key].length === 1` — printable characters only, so Tab/Escape/
  arrows behave normally. Code points, not UTF-16 units, matching the
  main-side validator below; plain `.length` would reject a single astral
  character as length 2 and the two checks would disagree;
- the character is not whitespace — a leading space is not a search;
- **no command-intent modifier** (see below).

### The modifier gate

A blanket `ctrlKey || altKey` rejection is wrong. On Windows and Linux,
**AltGr reports `ctrlKey` and `altKey` both true**, so a blanket rejection
silently drops the entire AltGr layer — `@` on a German layout (AltGr+Q),
`ą` on Polish (AltGr+A), `€` on many others. Those are ordinary characters a
user types to start a search, and losing them would make type-to-open feel
broken specifically for international keyboards.

The gate is therefore:

```js
const altGraph = event.getModifierState('AltGraph');
const commandIntent = event.metaKey || ((event.ctrlKey || event.altKey) && !altGraph);
```

`metaKey` always rejects (⌘T, ⌘R, ⌘L). `ctrlKey`/`altKey` reject *unless*
AltGraph is active, which is the AltGr text-entry case rather than a shortcut.

**Accepted limitation:** on macOS, Option-produced characters (`ø`, `∑`) do
not set AltGraph, so they are rejected. On macOS Option is far more often a
shortcut modifier than a text-entry one, and the app's own accelerators use it
(`main.js:2530`). Those users click the pill or press ⌘L.

On a match the handler calls `preventDefault()` and
`window.bowserPages.start.openIsland(char)`.

Main adds `handle('pages:start:open-island', 'newtab', …)` — the same
sender-validated shape as every other `pages:start:*` channel
(`pages.js:247-257`) — routed through `hooks.startPage?.openIsland?.()`.

### The shared validator

All three entry points funnel into one helper in `main.js`:

```js
function openIslandTyping(char) {
  if (typeof char !== 'string' || [...char].length !== 1 || !char.trim()) return;
  showOverlay('panel', { prefill: char });
}
```

The two payload-bearing channels (`pages:start:open-island`,
`chrome:open-island-typing`) pass a renderer-supplied character, so validation
there is load-bearing — the client-side check is never trusted alone.
`chrome:open-island-commands` carries no payload and calls the same helper with
the **literal `'/'`**, which passes validation trivially. It goes through the
helper anyway so there is exactly one place that opens the panel with a
prefill, rather than one validated path and one that bypasses it.

`[...char].length !== 1` counts code points rather than UTF-16 units, so a
single astral character (an emoji from a picker, say) is accepted as one
character instead of being rejected as a length-2 string.

### The pill's own keyboard path

The pill is `tabindex="0"`, so it can hold keyboard focus itself. This case
**extends the existing listener at `renderer.js:730`** — it does not add a
second one. Two listeners on the same element would both fire, and Space is
the collision: `key === ' '` already activates the pill there, and it is also
a single-character key. A separate handler would activate the panel *and*
prefill it with a space.

The existing handler's structure is kept intact and the new branch goes after
it:

```js
islandPill.addEventListener('keydown', (e) => {
  if (e.target !== islandPill) return;        // unchanged — focused children keep their own keys
  if (e.key === 'Enter' || e.key === ' ') {   // unchanged — existing activation wins
    e.preventDefault();
    window.browserAPI.openIsland();
    return;
  }
  // new: same gates as newtab.js, then
  // window.browserAPI.openIslandTyping(e.key)
});
```

Enter and Space therefore keep their current behaviour by construction: they
return before the type-to-open gates are ever consulted. The whitespace
rejection in those gates is a second line of defence, not the primary one.

This routes through its own chrome channel, `chrome:open-island-typing`, which
**does** take the character as an argument — unlike `chrome:open-island-commands`
above, whose prefill is fixed and therefore needs none. Main applies the
identical single-printable-character validation before using it; the chrome
renderer is privileged (it holds `browserAPI`) but its arguments are still
validated at the boundary, the same rule `tabs:navigate` follows.

Typing `/` therefore works on its own: the chip teaches the character, and the
character does what the chip does.

## Architecture

| File | Change |
|---|---|
| `src/renderer/index.html` | caret span inside `#pillDomain`; `#pillSlash` button as its sibling |
| `src/renderer/renderer.js` | placeholder branch at `:570`, built behind a transition guard; `#pillSlash` wiring; **extend** the existing `#islandPill` keydown at `:730` |
| `src/renderer/styles.css` | `.placeholder`, `.pill-caret` + `@keyframes`, `.pill-slash`, `prefers-reduced-motion` |
| `src/renderer/pages/newtab.js` | document `keydown` → `start.openIsland(char)` |
| `src/main/preload.js` | `openIslandCommands()` and `openIslandTyping(char)` on `browserAPI`, beside `openIsland` at `:85`. **Both new chrome channels need a bridge method here** — the chrome renderer is sandboxed with `contextIsolation`, so it cannot reach `ipcRenderer` any other way |
| `src/main/tab-preload.js` | `start.openIsland` on the existing `start` namespace |
| `src/main/pages.js` | `handle('pages:start:open-island', 'newtab', …)` |
| `src/main/main.js` | `chromeOn` for `chrome:open-island-commands` and `chrome:open-island-typing`; `startPage.openIsland` hook; the shared `openIslandTyping(char)` helper |

**No substrate impact.** The placeholder string is not in `copy/`, `tokens/`,
or `settings-schema/` (verified by grep), and the `/` chip is not a slash
command entry, so `substrate:check` is unaffected. No existing unit or
acceptance test asserts the literal `new tab` / `private tab` pill strings.

**Theming:** `.placeholder` uses `--text-dim` and `.pill-caret` uses `--text`,
both already defined in all three scopes (`:root`, the dark override, and
`:root[data-theme="private"]`) in `styles.css`. Nothing new to duplicate into
`pages.css` — this is chrome, not an internal page.

## Known seams

- **Utility sheet over a blank tab.** The sheet takes focus; the pill still
  shows a caret, so typing goes to the sheet rather than the panel. Gating the
  caret on sheet visibility costs more than the rare case is worth. Accepted.
- **Two registers across two surfaces.** The panel input reads "Search, enter
  address, or / for commands" (`overlay.html:17`); the pill will read "Search
  or type a URL" plus the chip. Left deliberately different — the chip does in
  the pill what the panel does in words.
- **Sentence case.** "Search or type a URL" is Chrome's phrasing and is
  sentence-cased, where the island's other labels (`private`, `source`,
  `new group…`) are lowercase. Chosen as-is; noted so a later voice pass has
  the context.

## Testing

- **Unit:** the transition guard (repeated `tabs:updated` broadcasts in
  placeholder mode must not rebuild the caret — prove it fails without the
  guard before trusting it); main-side character validation rejecting
  multi-character, empty, and whitespace payloads and accepting one astral
  code point; placeholder shown for both blank and blank-private tabs and
  never for a loaded or loading tab.
- **Unit — the modifier gate**, as a table over the rejection conditions:
  composing, whitespace, multi-character key, non-body target, `metaKey`,
  bare `ctrlKey`, bare `altKey`. Plus the two that exist because of review:
  **`ctrlKey && altKey` with `getModifierState('AltGraph')` true must be
  ACCEPTED** (the AltGr layer), and **Enter and Space on a focused
  `#islandPill` must still activate the pill exactly once and must not
  prefill anything** (the two-listener collision). Both need a test that
  fails against the naive implementation, or they are guarding nothing.
- **Acceptance:** new `spec/acceptance/` scenarios under stable ids,
  **registered in `test/desktop/cucumber.mjs`'s `RUNNABLE` list** — profiles
  select by explicit id, so an unregistered scenario is silently never run.
  Covers: a fresh blank tab shows the placeholder; clicking the chip opens the
  panel showing commands; and the cold-launch scenario below.
- **Acceptance — reproduce the original failure, not a convenient substitute.**
  The scenario must assert the state the user was actually in: the *startup*
  blank tab active, **page content focused**, and **`overlayMode()` null**,
  before the first character is typed. A test that reaches a blank tab via
  ⌘T proves nothing here — that path already calls
  `setActiveTab(…, { focusAddress: true })` (`main.js:4253`), so the panel is
  open and focused before the test types anything, and the assertion passes
  whether or not type-to-open exists at all.
  The harness can express this: `activateTab(id, false)` and
  `focusTabContents(id)` (`test-hook.js:268-269`) establish the state, and
  `overlayMode()` (`:703`) reads the result. Assert `overlayMode()` is null
  first — that precondition is what makes the rest of the scenario meaningful.
- **Governance:** feature entry in `spec/features.md` and a `parity-matrix.md`
  row (the affordance is a product contract the mobile ports inherit, even
  though the caret and chip are desktop presentations of it);
  `npm run substrate:check` and `npm run test:unit` green.
- **Hand verification:** relaunch the dev app (`npm start`) — chrome documents
  load once at window creation, so ⌘R will not show these changes. Check the
  caret stops blinking after ~4s and does not restart while a background tab
  loads; check light, dark, and private themes; check reduced-motion.

## Non-goals

- The loaded-page pill. It keeps showing its bare domain.
- An input on the start page. "Where to?" stays a heading.
- Changes to the onboarding tour, the panel's own placeholder, or cold-launch
  focus behaviour (`focusContent: true` at `main.js:5620` stays as it is —
  type-to-open makes it survivable without opening a panel over every launch).
- Mobile implementations.
