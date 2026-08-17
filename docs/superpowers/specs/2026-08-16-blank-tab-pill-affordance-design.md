# Blank-tab pill affordance — design

**Date:** 2026-08-16 · **Status:** shipped (PR #141), revised 2026-08-17

> **Revision, 2026-08-17 — the caret was replaced by a looping wash.**
> Shipped as `fbc8270`, straight to `main`.
>
> The caret is gone entirely: no element, no keyframes, no rebuild guard. The
> placeholder text carries its own motion instead — a brighter band travels
> through the letters left to right, 2.6s per pass, **looping indefinitely**.
> §2 below has been rewritten to describe what shipped; the rest of the
> document still holds.
>
> **This reverses the bounded-motion decision this document originally made,
> and the reversal is deliberate.** The original reasoning — that the pill sits
> above every page, so motion which never resolves is a long-term irritant —
> is still true, and is the price now being paid. What outweighed it: a new
> tab's first seconds are usually spent looking *down* at the favorites, so a
> cue that finishes before the eye comes back up teaches nobody. A bounded
> animation optimizes for the person already looking at the island, which is
> precisely not the person this feature exists for. The accepted cost is that a
> blank tab left parked animates in peripheral vision for as long as it is
> parked.
>
> One consequence worth recording, because it inverts an emphatic warning
> below: **the rebuild guard was removed.** It was load-bearing only because
> the caret was a child *element*, recreated on every `tabs:updated` broadcast.
> The wash animates `#pillDomain` itself, which is never recreated, so writing
> `textContent` cannot restart it. Verified rather than assumed — 40 forced
> broadcasts left the animation's `currentTime` advancing monotonically.

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
renders dim placeholder text — `Search or type a URL` — in place of the literal
`new tab` / `private tab` fallback at `renderer.js:570-572`, and a new sibling
`<button id="pillSlash">/</button>` appears beside it. (As originally written
this also placed a caret element before the text; §2 replaced it with a wash on
the text itself.)

Both are hidden in every other pill state, so loaded pages are untouched.

Private blank tabs get the same treatment. Dropping the "private tab" string
loses nothing: `#pillPrivateChip` already states the mode, and it sits directly
beside the placeholder.

The dim treatment uses a **new `.placeholder` class, not the existing `.dim`**.
`.dim` is toggled by `isLoading` at `renderer.js:573`; the two states must stay
independently controllable.

### 2. The wash

*(Revised 2026-08-17. This section originally specified a 1px caret blinking
four times and then resting; see the revision note at the top for why that was
replaced.)*

The placeholder text carries the motion itself. `#pillDomain.placeholder` gets
a `linear-gradient(90deg, …)` running `--text-dim → --text → --text-dim`, sized
`300% 100%`, clipped to the glyphs with `background-clip: text` and
`-webkit-text-fill-color: transparent`. `background-position` animates from
`130%` to `-30%` over **2.6s, linear, infinite**.

**Direction is left to right**, the way the line is read. Decreasing
`background-position` slides the oversized gradient rightward, which carries
the bright band left→right across the text; an increasing range would run it
backwards. This is easy to get wrong by reasoning alone, so it was verified by
freezing the cycle and measuring: the band's screen x increases through the
sweep, crossing the glyphs between 25% and 75%.

`color: var(--text-dim)` is kept on the rule so the string still has a defined
ink for any path that ignores the fill colour.

**It loops indefinitely rather than a bounded number of times.** The trade is
recorded in the revision note above: a bounded cue can finish while the eye is
still down on the favorites, and the cost accepted in exchange is indefinite
motion on a parked blank tab.

**`prefers-reduced-motion` needs more than dropping the animation.** With no
caret left, falling back to plain `--text-dim` would restore exactly the flat
label this feature exists to get away from. The rule therefore also clears the
gradient, restores an opaque fill, and rests the prompt at
`color-mix(in srgb, var(--text) 65%, var(--text-dim))` — measured in the
running app at ≈`#2e2e2e`, strictly darker than `--text-dim` and lighter than
the full ink a real domain gets. `color-mix` is used rather than a new `:root`
token so `substrate:check` is unaffected.

**No rebuild guard is needed, and the earlier one was removed.** The animation
lives on `#pillDomain`, an element that is never recreated; setting
`textContent` replaces a text node inside it without touching the animation,
and `classList.toggle` with an unchanged force value does not churn the class.
The guard that this document originally demanded existed solely because the
caret was a child element. Keeping it would have preserved a mechanism whose
reason had gone.

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

The prompt asserts that keystrokes land somewhere. Today they do not — a blank
tab has content focus. This makes the assertion true.

*(Originally the caret made this assertion, and making it honest was the
argument for type-to-open. The wash that replaced the caret is a weaker claim
about typing — it says "look here" more than "text goes here" — so type-to-open
now carries more of the burden of that promise, not less.)*

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

**`altKey` is command intent only off macOS.** On macOS, bare Option is a text
entry modifier — it is what produces `ø`, `∑`, `€`. Blanc reserves nothing
under bare Option: every `Alt` accelerator it registers is `CmdOrCtrl+Alt+…`
(`main.js:4294`, `:4333-4336`), all of which `metaKey` already rejects. The
non-text Option combinations reject themselves on the code-point gate —
Option+Arrow is `'ArrowLeft'`, Option+Delete is `'Backspace'`.

The gate is therefore:

```js
const altGraph = event.getModifierState('AltGraph');
const commandIntent = event.metaKey
  || (!altGraph && (event.ctrlKey || (event.altKey && !isMac)));
```

`metaKey` always rejects (⌘T, ⌘R, ⌘L). AltGraph always allows — that is AltGr
text entry, not a shortcut. Otherwise `ctrlKey` rejects everywhere and
`altKey` rejects only off macOS.

`isMac` needs no new plumbing: `renderer.js:7` already derives it from
`window.browserAPI.platform`, and `newtab.js:2` already has
`navigator.platform.startsWith('Mac')`.

**Accepted limitation — dead-key composition.** On macOS, Option+e emits
`key: 'Dead'`, which fails the code-point gate; the accent is applied to the
following keystroke, and the composed character (`é`) is what reaches the
handler. The first keypress opens nothing. This degrades quietly rather than
wrongly, and IME users are already outside the feature by the `isComposing`
gate above.

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
second one.

A second listener would not actually misbehave: Space would reach it but the
whitespace gate rejects it before any prefill, and Enter fails the code-point
gate. The reason to extend rather than add is that the pill's Enter/Space
activation semantics should live in one place, and the five gates should not
be written twice on the same element where the two copies can drift apart.

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
| `src/renderer/index.html` | `#pillSlash` button as a sibling of `#pillDomain` |
| `src/renderer/renderer.js` | placeholder branch at `:570` (plain `textContent`, no transition guard); `#pillSlash` wiring; **extend** the existing `#islandPill` keydown at `:730` |
| `src/renderer/styles.css` | `.placeholder` + its wash gradient and `@keyframes pill-placeholder-wash`, `.pill-slash`, `prefers-reduced-motion` |
| `src/renderer/pages/newtab.js` | document `keydown` → `start.openIsland(char)` |
| `src/main/preload.js` | `openIslandCommands()` and `openIslandTyping(char)` on `browserAPI`, beside `openIsland` at `:85`. **Both new chrome channels need a bridge method here** — the chrome renderer is sandboxed with `contextIsolation`, so it cannot reach `ipcRenderer` any other way |
| `src/main/tab-preload.js` | `start.openIsland` on the existing `start` namespace |
| `src/main/pages.js` | `handle('pages:start:open-island', 'newtab', …)` |
| `src/main/main.js` | `chromeOn` for `chrome:open-island-commands` and `chrome:open-island-typing`; `startPage.openIsland` hook; the shared `openIslandTyping(char)` helper |

**No substrate impact.** The placeholder string is not in `copy/`, `tokens/`,
or `settings-schema/` (verified by grep), and the `/` chip is not a slash
command entry, so `substrate:check` is unaffected. No existing unit or
acceptance test asserts the literal `new tab` / `private tab` pill strings.

**Theming:** the wash gradient interpolates between `--text-dim` and `--text`,
and the reduced-motion resting ink is a `color-mix` of the same two. Both are
already defined in all three scopes (`:root`, the dark override, and
`:root[data-theme="private"]`) in `styles.css`, so the wash re-inks with the
theme for free. No new `:root` token is introduced, so `substrate:check` is
untouched. Nothing to duplicate into `pages.css` — this is chrome, not an
internal page.

## Known seams

- **Utility sheet over a blank tab.** The sheet takes focus; the pill still
  shows the washing prompt, so typing goes to the sheet rather than the panel.
  Gating the wash on sheet visibility costs more than the rare case is worth.
  Accepted.
- **Two registers across two surfaces.** The panel input reads "Search, enter
  address, or / for commands" (`overlay.html:17`); the pill will read "Search
  or type a URL" plus the chip. Left deliberately different — the chip does in
  the pill what the panel does in words.
- **Sentence case.** "Search or type a URL" is Chrome's phrasing and is
  sentence-cased, where the island's other labels (`private`, `source`,
  `new group…`) are lowercase. Chosen as-is; noted so a later voice pass has
  the context.

## Testing

- **Unit:** the wash loops (`infinite`), clips to the text, and runs
  left→right — assert the keyframe range *decreases*, since an increasing one
  would sweep backwards; reduced motion stops it and rests at a stronger ink
  than `--text-dim`; nothing named `pill-caret` survives in the CSS, the
  renderer, or the markup; `renderPillLabel` carries no leftover transition
  guard. Plus main-side character validation rejecting multi-character, empty,
  and whitespace payloads and accepting one astral code point; placeholder
  shown for both blank and blank-private tabs and never for a loaded or
  loading tab.
  *(As originally written this section required a test for the caret's
  transition guard. That guard was removed with the caret — see the revision
  note; the guard test was replaced by one asserting it is gone.)*
- **Unit — the modifier gate**, as a table over the rejection conditions:
  composing, whitespace, multi-character key, non-body target, `metaKey`,
  bare `ctrlKey`. Plus the three that exist because of review, each of which
  needs a test that **fails against the naive implementation** or it is
  guarding nothing:
  - `ctrlKey && altKey` with `getModifierState('AltGraph')` true must be
    **accepted** — the AltGr layer.
  - bare `altKey` must be **accepted on macOS** (`ø`, `∑`) and **rejected off
    it**. The gate is platform-dependent, so the test must run both branches
    rather than whichever one the host happens to be.
  - Enter and Space on a focused `#islandPill` must activate the pill exactly
    once and prefill nothing.
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
  though the wash and chip are desktop presentations of it);
  `npm run substrate:check` and `npm run test:unit` green.
- **Hand verification:** relaunch the dev app (`npm start`) — chrome documents
  load once at window creation, so ⌘R will not show these changes. Check the
  band travels left→right and keeps looping while a background tab loads;
  check light, dark, and private themes; check reduced-motion rests at the
  stronger ink rather than going flat.
  **Launch with a scratch `--user-data-dir`**: `requestSingleInstanceLock` is
  keyed on the `Blanc-Dev` profile every unpackaged checkout shares, so with a
  dev instance already running a second `npm start` hands off to it and
  "verifies" code you did not change.

## Non-goals

- The loaded-page pill. It keeps showing its bare domain.
- An input on the start page. "Where to?" stays a heading.
- Changes to the onboarding tour, the panel's own placeholder, or cold-launch
  focus behaviour (`focusContent: true` at `main.js:5620` stays as it is —
  type-to-open makes it survivable without opening a panel over every launch).
- Mobile implementations.
