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

It fires a new **no-argument** `chrome:open-command-palette`. Main hardcodes
the prefill:

```js
chromeOn('chrome:open-command-palette', () => showOverlay('panel', { prefill: '/' }));
```

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
- no `ctrlKey` / `metaKey` / `altKey` — ⌘T, ⌘R, ⌘1…9 are unaffected;
- not `event.isComposing` — IME composition is left alone (those users reach
  the panel by click or ⌘L; accepted);
- `event.key.length === 1` — printable characters only, so Tab/Escape/arrows
  behave normally;
- the character is not whitespace — a leading space is not a search.

On a match it calls `preventDefault()` and `window.bowserPages.start.openIsland(char)`.

Main adds `handle('pages:start:open-island', 'newtab', …)` — the same
sender-validated shape as every other `pages:start:*` channel
(`pages.js:247-257`) — routed through `hooks.startPage?.openIsland?.()`. Main
re-validates that the argument is a single non-whitespace printable character
before calling `showOverlay('panel', { prefill: char })`, on the standing rule
that the client-side check is never trusted alone.

A matching `keydown` on `#islandPill` in the chrome renderer covers the case
where the pill itself holds keyboard focus (it is `tabindex="0"`). It applies
the same five gates and routes through its own chrome channel,
`chrome:open-island-typing`, which **does** take the character as an argument —
unlike `chrome:open-command-palette` above, whose prefill is fixed and
therefore needs none. Main applies the identical single-printable-character
validation before using it, exactly as it does for the pages channel; the
chrome renderer is privileged (it holds `browserAPI`) but its arguments are
still validated at the boundary, the same rule `tabs:navigate` follows.

Typing `/` therefore works on its own: the chip teaches the character, and the
character does what the chip does.

## Architecture

| File | Change |
|---|---|
| `src/renderer/index.html` | caret span inside `#pillDomain`; `#pillSlash` button as its sibling |
| `src/renderer/renderer.js` | placeholder branch at `:570`, built behind a transition guard; `#pillSlash` wiring; `#islandPill` keydown |
| `src/renderer/styles.css` | `.placeholder`, `.pill-caret` + `@keyframes`, `.pill-slash`, `prefers-reduced-motion` |
| `src/renderer/pages/newtab.js` | document `keydown` → `start.openIsland(char)` |
| `src/main/tab-preload.js` | `start.openIsland` on the existing `start` namespace |
| `src/main/pages.js` | `handle('pages:start:open-island', 'newtab', …)` |
| `src/main/main.js` | `chromeOn` for `chrome:open-command-palette` and `chrome:open-island-typing`; `startPage.openIsland` hook; one shared character validator behind all three entry points |

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
  guard before trusting it); type-to-open gating for each rejection condition
  (modifier held, composing, whitespace, multi-character key, non-body target);
  main-side character validation rejecting multi-character and whitespace
  payloads; placeholder shown for both blank and blank-private tabs and never
  for a loaded or loading tab.
- **Acceptance:** new `spec/acceptance/` scenarios under stable ids,
  **registered in `test/desktop/cucumber.mjs`'s `RUNNABLE` list** — profiles
  select by explicit id, so an unregistered scenario is silently never run.
  Covers: a fresh blank tab shows the placeholder; typing a character opens the
  panel with that character; clicking the chip opens the panel showing commands.
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
