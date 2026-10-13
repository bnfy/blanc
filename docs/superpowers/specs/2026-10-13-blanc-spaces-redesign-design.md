# Blanc Spaces redesign — design

Date: 2026-10-13. Status: approved in brainstorming; revised after written-spec review (contrast, upgrade write, Undo binding).
Prototype: [`2026-10-13-blanc-spaces-redesign-prototype.html`](./2026-10-13-blanc-spaces-redesign-prototype.html)
(open it in a browser: the mark, menu, switch motion, editor and custom colour
picker are interactive).

## Why

Blanc Spaces (formerly Named Workspaces) works, but the owner named two problems:

- **Hard to find.** Its only home is a small icon in the ⌘L panel footer that
  opens a 340px popover. Nothing at rest shows a space exists.
- **Looks unfinished.** Management is a `•••` sub-view of plain Back / Rename /
  Delete / Move up / Move down buttons, two separate creation commands, a
  confirmation for every delete, and a decision prompt of equal-weight buttons.

Telling which space you are in and switching speed were explicitly *not* named
as pain points, so this is not a new switching system (no shortcuts, gestures or
model change).

Every comparable browser shows the current space at rest and gives each space a
visual identity: Arc (icon + colour theme, icon row in the sidebar), Zen (icons
+ name in the sidebar), Safari (Tab Group picker in the toolbar), Vivaldi (icon
+ name beside the tab bar). Blanc adopts the identity and the at-rest mark, in
Blanc's own minimal form, and follows Apple's interface guidance for motion and
feedback.

## Decisions (owner, 2026-10-13)

| # | Question | Decision |
|---|---|---|
| D1 | Identity per space | **Symbol + colour.** Colour is new to Blanc's otherwise colourless chrome, deliberately. |
| D2 | Where the space shows at rest | **A — a mark on the pill** (symbol + name chip; the island stays neutral). Built so **B (tinted island)** and **C (tinted frame)** can be compared live through a dev-only switch before anything else is decided. |
| D3 | Menu layout | **A — a compact menu anchored to the mark.** The card grid (B) may come later; it reads the same data. |
| D4 | Availability | **Blanc Spaces is free for everyone.** |
| D5 | What Patron becomes | **Pure support.** Checkout, activation, revalidation and the thank-you state stay; nothing is locked. |
| D6 | Deleting | **Immediate, with Undo** — no confirmation dialog. |
| D7 | Creating | **One "New space…" command** with a "Start with: This window / Empty" choice, replacing "New empty space" and "Save this window as…". |
| D8 | Colour choice | **Any colour**: 8 presets plus a custom picker with a hex field. |
| D9 | Before the first space | **Nothing on the pill.** Entry is the labelled ⌘L footer button, ⌘L search, `/space`, and the start-page checklist. |
| D10 | Approach | **A new `spaces` overlay mode anchored to the mark**, sharing one menu component with the ⌘L footer entry (like the shield and capture popovers). |
| D11 | Delivery | **PR 1:** free Spaces. **PR 2:** the redesign. **Site PR after release** (claims must be release-backed). |
| D12 | Row highlights | Adjacent filled rows (selected + hovered) **never touch**; rows carry a 3px gap. |
| D13 | Existing spaces on upgrade | **Assigned an identity once, on first load,** through the loader's existing repair-and-backup path, so an unedited space never changes colour when the list changes. |
| D14 | Undo after deleting this window's space | **Rebinds the window** to the restored space (conditions in §7). Restore from Recently deleted keeps today's record-only behaviour. |
| D15 | File format version | **Stays 2.** Older builds keep working Spaces after a downgrade and strip only colour and symbol. |
| D16 | Checklist task for people whose checklist already retired | **Stays retired.** Only a checklist still showing gains the task. |

Decided during design, not asked: once at least one space exists, a window that
is not in a space shows a **neutral grey mark** (glyph, no name), keeping the
one-click route to switching; the mark lives **only on the pill**, in both tab
layouts (the island still floats in the vertical-tabs gutter), not also on the
rail.

## Scope

**In:** free Spaces and Patron's reframing inside the app (PR 1); space colour
and symbol, the pill mark, the redesigned menu, editor, colour picker, delete
with Undo, drag reorder, the switch prompt, Quick Switcher matching, the
checklist task, motion, accessibility, the dev tint switch (PR 2); spec,
contract, copy and test updates for both.

**Out:** keyboard shortcuts or gestures for switching spaces; the card menu
(D3-B); moving tabs between spaces; syncing spaces; mobile; any change to how
spaces swap, autosave or stay resident; the website, Privacy and Terms (their
own PR after the release ships).

Internal identifiers keep the `workspace` names (`workspaces.json`,
`chrome:workspaces-*`, `workspace-ui.js`, `/workspace` alias). Only user-facing
copy says *space*.

## PR 1 — Spaces free for everyone

### Behaviour

- Creating a space (blank or from this window) is no longer gated:
  `canCreate` in the workspace controller adapter is always true, the
  `save-as` handler's `not-patron` refusal goes, and the `not-patron` error,
  its message (`ws.error.notPatron`) and the "Patron settings" row
  (`ws.list.patronSettings`) are removed from the switcher.
- **Arc Spaces import (F45)** always creates one Blanc space per selected Arc
  Space. The "one window per Space without Patron" branch, its copy
  (`arcImport.mode.windows`) and its lapse error (`arcImport.error.notPatron`)
  are removed. Its existing all-or-nothing write and free-slot refusal
  (`MAX_WORKSPACES` = 25) are unchanged.
- The `patronActive` boolean stays in the projections that still use it (the
  Settings thank-you state, the start-page pill), and leaves
  `workspacesProjection()`.
- A Patron lapse has no product effect any more.

### Patron copy (all six interface languages)

- Settings → Patron card: `settings.patron.blancPatronUnlocksBlanc` becomes
  support language ("Blanc Patron supports Blanc's development…"); the Polar
  check-in sentence stays (still true); the lapse sentence about spaces goes.
- Start page: `newtab.patron.upgrade` "Upgrade to Blanc Patron" becomes
  **"Become a Blanc Patron"** (key `newtab.patron.become`, hide copy "…the
  Blanc Patron invitation…"); "upgrade" implies an unlock. Not "Support
  Blanc": that wording was rejected as vague in `design-qa.md` and is barred by
  `test/unit/migration-checklist-page.test.js`; "Become a Blanc Patron" names
  the product and the action, matching the Settings button. (Amended during
  planning.)
- `/patron` hint ("Support Blanc with a Patron subscription") already fits and
  stays.

### Contract and records

- `spec/features.md` F17 ("Patron unlocks Blanc Spaces…") and F45 (Patron vs.
  non-Patron branches) are rewritten; the F40 sentence "A space remains a
  separate optional Patron gesture" loses "Patron"; `parity-matrix.md` F17/F45
  rows follow.
- `CLAUDE.md` and `AGENTS.md` ("Patron unlocks space creation…") are updated.
- Unit and acceptance tests that encode the gate are flipped, not deleted:
  `arc-spaces-import.feature` loses its non-Patron scenario and its "Given I am
  a Blanc Patron" steps; workspace-controller and arc-import unit tests assert
  creation without Patron.
- `browser-api/contract.json` drops `patronActive` from the workspaces
  payload and the `not-patron` error literal; run `npm run browser-api:build`.

### Release note

Spaces becoming free is release-note material. Current Patrons paid partly for
Spaces; the release note thanks them. (Wording is owner-approved at release
time.)

## PR 2 — The redesign

### 1. A space's identity

**Data.** Each record in `workspaces.json` gains two optional fields:

- `color`: a `#rrggbb` string, any value. Normalized to lower case; anything
  else is repaired to a default.
- `symbol`: one id from a fixed set of 16 (below). Unknown ids are repaired to
  a default.

`WORKSPACES_VERSION` stays **2** (D15). Fields are profile-scoped like the rest
of the record and never synced.

**Defaults and upgrade (D13).** A record without a valid `color` or `symbol`
gets the first preset colour and the first symbol not already used, in list
order (cycling when all are used). `normalizeWorkspace` assigns them, so the
repository's existing load path (`workspaces.js`: when the repaired file differs
from disk it writes an exact `.before-repair-<id>.bak` copy, then persists the
repaired file) makes the assignment **durable on the first load of the new
version**, once; later loads match disk and write nothing. Identities are
therefore stable: deleting or reordering one space never recolours another.
New spaces get the same rule at creation, so a space never starts blank.

**Downgrade.** Shipped builds (v1.32 and earlier) rebuild records from the
fields they know, so the first time an older Blanc **loads** the file it strips
`color` and `symbol` (keeping its own `.before-repair` backup) and Spaces keeps
working. On re-upgrade the defaults are assigned again; custom choices made
before the downgrade are lost. Accepted over a version bump, which would make
older builds refuse the file (`future-format`) and leave Spaces unavailable.

**Presets.** Stored and shown as these values, which are fixed points of the
light-mode readability guard (§2), so a preset swatch is exactly the colour
drawn in light mode. Dark and private are derived by the guard:

| Name | Hex (stored, light) | Dark | Private |
|---|---|---|---|
| Sage | `#426c4c` | `#8db996` | `#85b18e` |
| Sky | `#376694` | `#82b3e5` | `#78aadc` |
| Iris | `#6757a3` | `#b2a4f7` | `#a99bed` |
| Rose | `#9b4761` | `#ef93ac` | `#e68aa3` |
| Clay | `#974f2a` | `#ea9b75` | `#e0926c` |
| Sand | `#815c02` | `#d1a960` | `#c7a057` |
| Slate | `#576471` | `#a2b0bf` | `#9aa8b6` |
| Graphite | `#3a3a3a` | `#afafae` | `#a6a6a5` |

(The brainstorming mock-ups used lighter design inputs, e.g. Sage `#5f8a68`;
those fail 4.5:1 on their own wash and are not shipped. The dark and private
columns are what the §2 algorithm produces today; tests pin the light column as
fixed points and the other two as meeting the floor, not as exact values.)

No preset is a pure red, so a preset space never reads as an error; a custom
colour may be anything. The palette is defined once in `tokens/tokens.json`
(a `space` group) and guarded against drift like the other tokens, so a future
mobile port inherits it.

**Symbols** (Lucide, already licensed in `THIRD-PARTY-NOTICES.md`): briefcase,
house, code, flask, book, music, camera, plane, heart, star, leaf, coffee,
graduation cap, gamepad, wallet, sun. Each has a translated accessible name.

### 2. The readability guard

A pure module (no `require('electron')`, loadable by both chrome documents and
by Node tests) derives the colour actually drawn:

- Keep the stored hex as the user's choice; display may differ.
- The ink (symbol and name) is drawn over its own wash, so contrast is measured
  against the **final composited background**, not the bare surface. For each
  theme the guard takes the set of surfaces a space mark or tile can sit on:

  | Surface | Light | Dark | Private |
  |---|---|---|---|
  | Island and menu (`--surface-raised`) | `#ffffff` | `#1f1f1f` | `#191919` |
  | Spaces-menu row, hovered or selected (`--surface`) | `#f7f7f7` | `#171717` | `#131313` |
  | ⌘L row hover (4% `--text` wash, a Quick Switcher result) | `#f5f5f5` | `#282828` | `#222222` |

  Every space-tile surface must use one of these fills; adding a new one means
  adding it to the guard's set, which is defined once.
- The requirement: the ink has at least **4.5:1** against each surface in the
  set *and* against its wash composited over each surface — wash alpha 15%
  (light) / 20% (dark, private), composited and compared in 8-bit sRGB, the way
  it is painted.
- If the colour already meets that, it is returned unchanged. Otherwise only its
  OKLCH lightness changes (darker in light, lighter in dark and private),
  reducing chroma only as far as needed to stay in sRGB gamut, to the smallest
  change that meets the requirement.
- The check is repeated **after rounding to hex**; if rounding drops it below
  4.5:1, lightness keeps stepping until the rounded value passes.
- Worked example (from review): `#767676` is 4.54:1 on white but 3.78:1 on its
  own 15% wash, so it is drawn as `#636363`.

The editor states when the guard is acting, e.g. "Kept readable: shown as
#6D6400 in light mode." for `#F5E663`. (The prototype predates the composited
rule and shows a lighter value.)

### 3. The mark on the pill

The strip document renders a mark at the pill's leading edge, before
back/forward. Three states, carried in the `tabs:updated` projection as
`spaceMark` (`{ state: 'none' }`, `{ state: 'neutral' }`, or
`{ state: 'space', name, color, symbol }` — presentation data only):

- **space** — this window is in a space: a 28px chip, symbol plus name
  (the name ellipsizes beyond 140px), ink and wash from the guard.
- **neutral** — the profile has spaces but this window is in none: the same
  slot with the grey stacked-windows glyph and no name.
- **none** — the profile has no spaces: nothing renders; the pill is exactly
  today's.

The mark is a real button in the pill's focus order, labelled "Space: {name}"
(neutral: "Spaces"), `aria-haspopup`, `aria-expanded` mirroring the menu. A
private active tab re-derives the ink for the private surface; the mark still
shows the window's space. In the vertical-tabs layout the mark stays on the
pill; nothing is added to the rail.

### 4. One menu, two anchors

The Spaces menu is one component in the overlay document (the evolved
`workspace-ui.js`), shown two ways:

- **From the mark:** a new overlay mode `'spaces'`, added beside `'shield'`
  and `'capture'`. Main measures the mark's rect from the strip (as it does the
  shield chip's), sizes the overlay tightly around the menu with padding for the
  shadow and the opening scale (shadows are otherwise clipped by view bounds),
  and attaches it. It dismisses like the panel: Escape, a click outside, overlay
  blur, tab switch, a space switch, or summoning ⌘L.
- **From the ⌘L panel:** the footer button now shows a visible **Spaces** label
  (plus the bound space's identity when there is one) and opens the same menu
  above the button inside the panel, as today.

`/space` (and `/workspace`) open the menu; `/space <name>` keeps its
switch-or-create behaviour. The Quick Switcher matches space names, ranked with
groups above tabs; a result row shows the symbol tile, the name and a "Space"
label, and picking it switches (raising the switch prompt in the menu when
needed).

### 5. The list

- Rows: 28px symbol tile, name, tab count, ✓ on the current space
  (`aria-current`). 40px rows, 11px radius, **3px gap between rows** so a
  selected and a hovered row never merge (D12). Hovered, focused and selected
  rows all fill with `--surface`, one of the guard's surfaces (§2). Rows of a
  window shown elsewhere keep their "Show window" context.
- Hovering or focusing a row reveals `•••` in place of the count, opening the
  editor. Right-click opens the native menu with **Edit…** and **Delete**
  (`workspace-context-menu-model.js`).
- Reorder by dragging a row (pointer-captured, 1:1 with the grab offset; rows
  part to show the drop slot) or Option/Alt+↑/↓ on a focused row. This replaces
  Move up / Move down and needs a move-to-index call.
- Below a divider: **New space…**, and **Recently deleted (n)** only when
  non-empty.
- **No spaces yet:** one line ("Save a set of tabs and switch back to it any
  time."), **New space…**, and **Bring your Spaces from Arc** (opens Bring Your
  Tabs, as today's Patron-only row did).
- Keyboard: ↑/↓ and Home/End rove, Return switches, Escape closes and returns
  focus to the invoker.

### 6. The editor

The menu reshapes into the editor in place (no dialog, no scrim):

- Header: back chevron + "New space" / "Edit space".
- Identity: a 40px preview tile beside the name field (max 60 characters).
  Validated as you type: empty ("Give the space a name.") and duplicate ("You
  already have a space called {name}."), announced via `role="alert"`; the
  primary button disables while invalid.
- **Colour:** 8 preset swatches (named, e.g. "Sage") and a custom swatch that
  expands a picker inside the menu — a saturation/brightness square, a hue
  slider and a hex field. A custom in-menu picker is required: the native macOS
  colour panel takes focus, and overlay blur dismisses the menu.
  - Pointer: captured 1:1 dragging in the square and on the slider.
  - Keyboard: the square is focusable (←/→ saturation, ↑/↓ brightness); the hue
    control is a slider; the hex field accepts `#rrggbb` or `rrggbb` and applies
    when valid.
  - The guard note sits under the hex field.
- **Symbol:** the 16 symbols in an 8×2 grid of labelled buttons.
- **New space only — "Start with":** *This window · N tabs* / *Empty*.
  Defaults to *This window* when the window is in no space, *Empty* when it is.
  *This window* in a window bound to another space is today's save-as: the
  window binds to the new space and the old one keeps its last autosaved state.
- Actions: New → **Cancel** / **Create space**. Edit → **Delete space** (left,
  red text) / **Done**.
- **Edits apply live.** Name (when valid), colour and symbol persist as they
  change and the pill mark follows. During a colour drag, updates are throttled
  and the final value is written on release. Escape or back returns to the list.

### 7. Deleting, undo and recovery

- **Delete** is immediate (D6). The list shows an **Undo** row ("{name}
  deleted · Undo") until the menu closes; the space stays in Recently deleted
  for 7 days (unchanged `RECOVERY_TTL_MS`). Deleting the current space leaves
  its tabs open; the window is simply no longer in a space (the mark turns
  neutral).
- **Undo restores the binding too (D14).** The delete records which window
  runtimes it unbound (today `removeNamedWorkspace` clears `workspaceId` on
  every runtime of the profile holding it, after revealing a resident set in its
  own window). Undo restores the record and rebinds each recorded runtime that
  still exists, is still in no space, and is not blocked by the space now being
  held by another window. Rebinding is the same commit as a bind after a
  switch: the window's live tabs autosave into the restored space from then on,
  so changes made in the seconds since the delete are kept, not reverted. A
  runtime that fails a condition stays unbound and the record is restored alone.
- **Restore from Recently deleted** keeps today's behaviour: it brings back the
  saved record and binds no window.
- **Recently deleted** lists entries with **Restore** and **Forget**. Forget is
  permanent, so it keeps an inline confirmation — the one confirmation left.

### 8. The switch prompt

When switching from a window whose tabs are not in a space (today's
`unsaved-scratch` decision), the menu shows:

- Tile + "Switch to {name}?" and "This window's N tabs aren't in a space yet.
  Switching here would close them."
- Stacked, in order: **Save them as a space, then switch** (primary; hidden when
  every at-risk tab is private, as today) · **Open {name} in a new window** ·
  **Close the N tabs and switch** (red) · **Cancel** (quiet).
- "Save them as a space" opens the editor in New mode with *This window* fixed,
  then continues the switch, preserving today's resume-after-save flow.
- Protected-pages and resident-capacity variants keep only **Open in a new
  window** and **Cancel**, with their existing explanations.

### 9. The checklist task

The start page's moving-in checklist gains **Make your first space**, completed
by the first successful space creation in the default profile. A profile whose
checklist already retired (both current tasks done, or dismissed) does not see
it return; only a checklist still showing gains the third task. Opening it
opens the Spaces menu.

### 10. Motion

Following Apple's fluid-interface guidance (respond on press, spatial
consistency, interruptibility, critically damped curves):

- **Press:** the mark scales to 0.96 on pointer-down (100ms), not on release.
- **Open/close:** the menu grows from the mark (`transform-origin` at the mark):
  scale 0.92 → 1, 6px rise, fade, 340ms on a critically damped curve
  (`cubic-bezier(.2,.9,.25,1)`); closing runs the same path back into the mark.
  CSS transitions, not keyframes, so a mid-flight toggle reverses from the
  current value.
- **List ↔ editor:** the menu's height morphs (320ms, same curve) while the
  contents cross-fade (160ms). The custom picker's expansion uses the same
  morph.
- **Switching:** the mark's symbol and name slide out 7px and fade (120ms,
  ease-in) and the new ones slide in from the opposite side (300ms); direction
  follows list order (moving down the list, content moves up). The page cluster
  (tab dots, favicon, domain) slides 10px the same way; the mark animates its
  width to the new name; its colours transition via registered (`@property`)
  custom properties (350ms).
- **Reduce Motion:** opacity cross-fades only; no scale, slide, width or height
  animation.
- **Increased Contrast:** the mark gains a 1px border in its ink.

### 11. Dev-only tint switch (for D2)

`BLANC_SPACE_TINT=mark|island|frame` is read only when `!app.isPackaged` (the
test-hook gate) and passed to the strip and overlay documents as a root
attribute. Variants are CSS only, over the same two colour tokens:

- `mark` (default, ships): the chip alone carries colour.
- `island`: the resting island glass takes a faint wash; the chip becomes a
  solid tile with a white symbol and the name moves into the menu.
- `frame`: the strip band behind the island (and the rail in vertical tabs)
  takes a vertical wash; the island stays neutral.

A packaged build always renders `mark`. Promoting `island` or `frame` later is
its own decision and change.

### 12. Copy

New and changed strings live in `copy/messages/en.json` with every other
interface language (de, es, fr, pt-BR, it) updated in the same PR, acknowledged
with `npm run copy:ack`. Space names are the user's own text and are never
translated (`data-i18n-ignore`).

## Testing

**Unit (`node --test`):**

- Readability guard: for a sweep of hues × lightness × chroma, the rounded hex
  result meets 4.5:1 against every surface in its theme's set and against its
  wash composited over each; colours that already pass come back unchanged
  (including every light preset, pinned as fixed points); `#767676` comes back
  changed; output is a valid hex; invalid input is rejected.
- Upgrade: a version-2 file without `color`/`symbol` is written once on first
  load with a `.before-repair` backup and assigned defaults in list order; a
  second load writes nothing; deleting or reordering a space leaves the others'
  identities unchanged.
- Undo: deleting this window's space then Undo rebinds the window and resumes
  autosave; when the window has since joined another space, or the space is held
  elsewhere, Undo restores the record only; Restore from Recently deleted binds
  nothing.
- Model: `color`/`symbol` normalization and repair, defaults in list order,
  version unchanged, files written without the fields still load, move to
  index.
- De-gating: creation and Arc import succeed without Patron; no `not-patron`
  path remains.
- Menu state (`workspace-ui.js`): list → editor → list, live apply, delete →
  Undo restore, Recently deleted Forget confirmation, switch-prompt ordering
  and the private-only rule, the zero-spaces list.
- Checklist: third task appears only on a still-visible checklist.

**Desktop acceptance (`spec/acceptance/F41-named-workspaces.feature`, plus
`arc-spaces-import.feature`):** the three mark states; opening from the mark
and from ⌘L; switching (mark and pill update); live edit of name, colour,
symbol; a custom hex with the guard note; delete then Undo; drag and keyboard
reorder; keyboard-only flow with focus return; Reduce Motion; Quick Switcher
match; the switch prompt's order. Existing scenarios drop their Patron steps.
Keys for main-process Escape handling are sent with `sendInputEvent`.

**Repo checks:** `npm run test:unit`, `npm run lint`, `npm run substrate:check`
(tokens), `npm run browser-api:check` after `browser-api:build` (the
`spaceMark` projection, `color`/`symbol` fields, update and move-to-index
calls, the strip → main open-Spaces request), `npm run copy:check`,
`npm run test:i18n:desktop`.

**Proof:** captures from the running dev app — the mark in each state, the
menu, the editor with the picker, in light and dark — presented as full-resolution
crops, before over after.

## Records to update

- `spec/features.md`: a new **F41 — Blanc Spaces** entry (the acceptance file
  exists; the feature entry never did) describing identity, the mark, the menu
  and free availability; F17, F40, F45 as above.
- `spec/parity-matrix.md`: F41 row; F17/F45 rows.
- `CLAUDE.md` / `AGENTS.md`: the Patron and Blanc Spaces paragraphs.
- After release, in its own site PR: the Spaces feature page, FAQ, pricing and
  Patron copy, Privacy and Terms, and their claims ledgers, re-checked against
  the released build per `docs/marketing-claims.md`.

## Risks

- **Colour in a colourless chrome.** Mitigated by the mark-only default, the
  readability guard, and the dev switch for judging B/C in practice.
- **Downgrade drops identity.** An older build strips `color`/`symbol` when it
  first loads `workspaces.json` (keeping a backup); defaults reappear on
  upgrade, custom choices do not (D15).
- **Upgrade writes once.** The first load of the new version persists the
  assigned identities and leaves a `.before-repair` backup beside
  `workspaces.json` (D13). That is the existing repair path working as designed.
- **Patron's value.** With nothing locked, Patron relies on goodwill; this is
  the owner's choice (D5), recorded rather than mitigated.
