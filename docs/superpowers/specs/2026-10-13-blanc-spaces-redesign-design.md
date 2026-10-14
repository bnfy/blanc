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
| D9 | Before the first space | **Nothing on the pill.** Entry is the ⌘L footer's Spaces button, ⌘L search, `/space`, and the start-page checklist. |
| D10 | Approach | **A new `spaces` overlay mode anchored to the mark**, sharing one menu component with the ⌘L footer entry (like the shield and capture popovers). |
| D11 | Delivery | **PR 1:** free Spaces. **PR 2:** the redesign. **Site PR after release** (claims must be release-backed). |
| D12 | Row highlights | Adjacent filled rows (selected + hovered) **never touch**; rows carry a 3px gap. |
| D13 | Existing spaces on upgrade | **Assigned an identity once, on first load,** through the loader's existing repair-and-backup path, so an unedited space never changes colour when the list changes. |
| D14 | Undo after deleting this window's space | **Rebinds the window** to the restored space (conditions in §7). Restore from Recently deleted keeps today's record-only behaviour. |
| D15 | File format version | **Stays 2.** Older builds keep working Spaces after a downgrade and strip only colour and symbol. |
| D16 | Checklist task for people whose checklist already retired | **Stays retired.** Only a checklist still showing gains the task. |
| D17 | The ⌘L footer's Spaces button (owner, during PR 2) | **Icon only, no name.** The footer has too little room before a name truncates; the bound space's name is in the button's tooltip and accessible name, and its fill still shows the window is in a space. This applies to the footer only: the Island's space mark keeps its symbol **and** name (truncated), so the active space shows at rest. |
| D18 | Where the menu opens from ⌘L (owner, during PR 2) | **Below the Island, never over it.** The menu hangs from the panel's bottom edge, right-aligned to the button, and scrolls within the room there; only a window too short for a few rows below opens it upward. |
| D19 | The "Kept readable" note (owner, during PR 2) | *(Superseded by D21: no colour is adjusted, so there is no note.)* **Custom colours only.** Presets adapt to every theme without a note: their dark and private inks are the designed values in §1's table, and every preset is lightened in dark mode, so the note would show on all of them. The guard itself still runs for every colour on every theme, and the saved hex is never changed. |
| D20 | The Spaces glyph (owner, after PR 2) | **A ringed planet, in outline,** so people coming from Arc recognise Spaces (the owner's Arc screenshot shows a planet beside a space's name). Our own drawing, not Arc's asset: a large planet and a flat ring tilted down to the right, in the footer's line weight. It replaces the stacked-windows glyph on the ⌘L footer button (17px) and on the Island's quiet mark (16px), a touch larger than their neighbours so it reads at a glance; defined once as `SpaceIdentity.SPACES_GLYPH`. A space's own symbol is unchanged. |
| D21 | How a space's colour is drawn (owner, after PR 2; supersedes D19) | **Exactly, as a fill, with white or black on it.** A space's tile is filled with exactly the colour chosen, in every theme, so the full colour picker is honest; its symbol is white or black, whichever contrasts more, which always reaches 4.5:1. On the Island the mark is quiet: the colour fills a small square behind the symbol and the name is the Island's ordinary text. A colour under 3:1 against the surface behind it gets a hairline edge. This replaces the readability guard, its theme-adjusted colours and the "Kept readable" note. Chosen from side-by-side mock-ups in the real app over a fully filled mark (louder than the Island should be) and over keeping the tint with a fixed palette (no free choice). |
| D22 | Switching when spaces are set aside (owner, after PR 2) | **Switching never stops for a limit.** A window that switches away from a space keeps that space's tabs loaded out of sight so switching back is instant. The first build refused a switch once two spaces were set aside ("Your retained spaces are full"), which people could not understand or get out of. Now every switch goes through, and afterwards, invisibly, Blanc keeps the spaces set aside within budget. At most six stay set aside, whatever Quiet Tabs is doing: the oldest beyond that are saved and released one at a time, each checked again right before it goes, and reopen from their saved tabs (never one with a live camera or microphone, sound, a shared screen, a pending prompt or popup, or unsaved typing). Then, unless Quiet Tabs is off, Blanc quiets tabs (they keep their place, back history and scroll, and reload on return) so that at most two set-aside spaces keep loaded tabs and at most 16 stay loaded across them; the space set aside longest ago gives way first, the one just left last, and within a space its least recently used tabs. Only tabs Quiet Tabs' own policy would quiet are chosen (not audible, pinned, capturing, mid-prompt, an opener family or not safely restorable), so the budget may be exceeded rather than ask. Switching back to a space whose tab is being quieted shows the tab once that settles. Nothing is released or quieted offline. The refusal and its message are gone. |

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

**Presets.** Stored and drawn as these values, in every theme (§2, D21):

| Name | Hex | Symbol on it |
|---|---|---|
| Sage | `#426c4c` | white |
| Sky | `#376694` | white |
| Iris | `#6757a3` | white |
| Rose | `#9b4761` | white |
| Clay | `#974f2a` | white |
| Sand | `#815c02` | white |
| Slate | `#576471` | white |
| Graphite | `#3a3a3a` | white |

(The first build derived separate dark and private colours for each preset;
under D21 a preset is its hex everywhere.)

No preset is a pure red, so a preset space never reads as an error; a custom
colour may be anything. The palette is defined once in `tokens/tokens.json`
(a `space` group) and guarded against drift like the other tokens, so a future
mobile port inherits it.

**Symbols** (Lucide, already licensed in `THIRD-PARTY-NOTICES.md`): briefcase,
house, code, flask, book, music, camera, plane, heart, star, leaf, coffee,
graduation cap, gamepad, wallet, sun. Each has a translated accessible name.

### 2. Readable on any colour

A pure module (no `require('electron')`, loadable by both chrome documents and
by Node tests) decides how a stored colour is drawn (D21):

- The **fill** is the stored hex itself, in every theme: what was picked is
  what is shown, and nothing is ever adjusted.
- The symbol on it is **white or black**, whichever contrasts more with the
  fill. One of the two always reaches 4.5:1 (the worst case, a mid-tone, is
  about 4.58:1), so the theme never changes it.
- An **edge**: a 1px hairline (18% `--text`; 45% under Increased Contrast)
  where the fill is under **3:1** against a surface it sits on in that theme,
  so a white square on the light Island or a black one on the dark Island
  still reads. The surfaces, per theme:

  | Surface | Light | Dark | Private |
  |---|---|---|---|
  | Island and menu (`--surface-raised`) | `#ffffff` | `#1f1f1f` | `#191919` |
  | Spaces-menu row, hovered or selected (`--surface`) | `#f7f7f7` | `#171717` | `#131313` |
  | ⌘L row hover (4% `--text` wash, a Quick Switcher result) | `#f5f5f5` | `#282828` | `#222222` |

  Every space-tile surface must use one of these fills; adding a new one means
  adding it to the set, which is defined once.
- Worked examples: `#F5E663` is drawn as itself with a black symbol on every
  theme; white gets a black symbol and, in light mode, an edge; `#ff3b30` gets
  black, because white on it is only about 3.6:1.

There is no readability note: nothing is adjusted, so there is nothing to
explain (D21 supersedes D19).

### 3. The mark on the pill

The strip document renders a mark at the pill's leading edge, before
back/forward. It derives one of three states from the existing Spaces
projection (`chrome:workspaces-list` / `chrome:workspaces-updated`, already
sent to the strip), whose rows gain `color` and `symbol` — presentation data
only. (Amended during planning: an earlier draft added a `spaceMark` field to
`tabs:updated`; the Spaces projection already carries what the mark needs.)

- **space** — this window is in a space: a quiet 28px mark. The space's
  colour fills a small square behind its symbol (white or black on it, §2), and
  the name follows in the Island's ordinary text (it ellipsizes beyond 140px).
  At rest the mark has no fill of its own; hovered or open it takes the
  Island's control highlight (`--accent-dim`), like the pill's other buttons.
- **neutral** — the profile has spaces but this window is in none: the same
  slot with the grey Spaces planet (D20) and no name.
- **none** — the profile has no spaces: nothing renders; the pill is exactly
  today's.

The mark is a real button in the pill's focus order, labelled "Space: {name}"
(neutral: "Spaces"), `aria-haspopup`, `aria-expanded` mirroring the menu. A
private active tab re-derives the edge for the private surface (the colour
itself never changes); the mark still
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
- **From the ⌘L panel:** the footer's Spaces button stays icon-only (D17) and
  opens the same menu below the Island, hanging from the panel's bottom edge
  (D18). (Amended during PR 2: the first build put a name on the button and
  opened the menu above it, over the Island.)

`/space` (and `/workspace`) open the menu; `/space <name>` keeps its
switch-or-create behaviour. The Quick Switcher matches space names, ranked with
groups above tabs; a result row shows the symbol tile, the name and a "Space"
label, and picking it switches (raising the switch prompt in the menu when
needed).

### 5. The list

- Rows: 28px symbol tile, name, tab count, ✓ on the current space
  (`aria-current`). 40px rows, 11px radius, **3px gap between rows** so a
  selected and a hovered row never merge (D12). Hovered, focused and selected
  rows all fill with `--surface`, one of §2's surfaces. Rows of a
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
  time."), **New space…**, and **Import Spaces from Arc** (the existing string; opens Bring Your
  Tabs, as today's Patron-only row did).
- Keyboard: ↑/↓ and Home/End rove, Return switches, Escape closes and returns
  focus to the invoker.

### 6. The editor

The menu reshapes into the editor in place (no dialog, no scrim):

- Header: back chevron + "New space" / "Edit space".
- Identity: a 40px preview tile beside the name field (max 60 characters).
  Validated as you type once the field is touched (or a create is attempted):
  empty ("Enter a space name.") and duplicate ("That name is already in use.
  Choose another name."), the existing translated messages, announced via
  `role="alert"`; Create and Done stay disabled while the name is invalid.
- **Colour:** 8 preset swatches (named, e.g. "Sage") and a custom swatch that
  expands a picker inside the menu — a saturation/brightness square, a hue
  slider and a hex field. A custom in-menu picker is required: the native macOS
  colour panel takes focus, and overlay blur dismisses the menu.
  - Pointer: captured 1:1 dragging in the square and on the slider.
  - Keyboard: the square is focusable (←/→ saturation, ↑/↓ brightness); the hue
    control is a slider; the hex field accepts `#rrggbb` or `rrggbb` and applies
    when valid.
- **Symbol:** the 16 symbols in an 8×2 grid of labelled buttons.
- **New space only — "Start with":** *This window · N tabs* / *Empty*.
  Defaults to *This window* when the window is in no space, *Empty* when it is.
  *This window* in a window bound to another space is today's save-as: the
  window binds to the new space and the old one keeps its last autosaved state.
- Actions: New → **Cancel** / **Create space**. Edit → **Delete space** (left,
  red text) / **Done**.
- **Edits apply live.** Name (when valid), colour and symbol persist as they
  change and the pill mark follows. During a colour drag, updates are throttled
  and the final value is written on release. Done, back and Escape send any
  waiting edit and return to the list once it has saved; if a save fails, the
  editor stays open with the error and **Try again**, keeping the failed edit
  (and any newer one), and the menu does not close over it. Closing the menu
  from the editor (a click outside, toggling the mark) waits the same way: it
  closes once the edit has saved and otherwise stays open on the error. A
  forced dismissal (a tab switch, the window losing focus) still closes at
  once; a failed edit is kept until it saves or its space is deleted, and the
  next time the menu opens it opens on that space's editor, showing what the
  person chose, the error and **Try again**. (Amended after plan review.)

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
  (Amended after PR 2, owner: each row shows the space as it was, its tile in
  its own colour and symbol and its name, with "Deleted today / yesterday / N
  days ago" under the name, then **Restore** and a trash button labelled
  "Delete permanently…" for Forget. Rows are roomy, so a name has space; a
  name cut short is in full in its tooltip, as in the main list.)

### 8. The switch prompt

When switching from a window whose tabs are not in a space (today's
`unsaved-scratch` decision), the menu shows:

- Tile + "Switch to {name}?" over today's explanation of what would close
  (the existing translated messages: "N unsaved tabs will close…" or "N
  private tabs will close…").
- Stacked, in order: **Save them as a space, then switch** (primary; hidden when
  every at-risk tab is private, as today) · **Open in another window** ·
  **Close tabs and switch** (red) · **Cancel** (quiet). The second and third
  reuse today's translated buttons. (Amended during planning to keep those
  reviewed translations.)
- "Save them as a space" opens the editor in New mode with *This window* fixed,
  then continues the switch, preserving today's resume-after-save flow.
- The protected-pages variant keeps only **Open in a new window** and
  **Cancel**, with its existing explanation. There is no longer a variant for
  the spaces set aside being full: switching never stops for that (D22).

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
- **Increased Contrast:** every colour square and tile draws a stronger
  hairline edge (45% `--text`).

### 11. Dev-only tint switch (for D2)

`BLANC_SPACE_TINT=mark|island|frame` is read only when `!app.isPackaged` (the
test-hook gate) and passed to the strip and overlay documents as a root
attribute. Variants are CSS only, over the same two colour tokens:

- `mark` (default, ships): the chip alone carries colour.
- `island`: the resting island glass takes a faint wash; the chip becomes a
  solid tile in the space's colour with its white or black symbol, and the name
  moves into the menu.
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

- Colour (D21): for a sweep of hues × saturation × brightness and every grey,
  the fill is the stored hex on every theme and the symbol colour is white or
  black, whichever contrasts more, at 4.5:1 or better; the edge follows the
  3:1 rule on each theme; the presets match §1's table; invalid input is
  rejected.
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
- Room for set-aside spaces (D22): `roomPlan` quiets nothing within budget,
  the space set aside longest ago first and its least recently used tabs
  first, the older of the kept spaces before the one just left, skips tabs
  already quiet, and never plans a tab Quiet Tabs would not quiet;
  `releasePlan` releases the oldest beyond the cap and never a protected one,
  and `releaseOverCap` probes and rechecks each space right before it goes
  (protection that starts mid-probe is caught); older spaces' tabs that stay
  loaded count toward the 16; a second quiet request for a tab joins the one
  in flight (`singleFlight`).
  Desktop: `@F41-35` switches one window through four spaces (the third
  switch used to be refused) and the first set aside has its web page
  quieted; `@F41-36` checks the pass declines with Quiet Tabs off; `@F41-37`
  keeps a pinned page loaded; `@F41-38` switches back mid-quiet and sees the
  page; `@F41-39` keeps at most six set aside with Quiet Tabs off. Each fails
  with its fix undone.
- Menu state (`workspace-ui.js`): list → editor → list, live apply, delete →
  Undo restore, Recently deleted Forget confirmation, switch-prompt ordering
  and the private-only rule, the zero-spaces list, every colour drawn and
  saved exactly with no readability note (D21).
- Checklist: third task appears only on a still-visible checklist.

**Desktop acceptance (`spec/acceptance/F41-named-workspaces.feature`, plus
`arc-spaces-import.feature`):** the three mark states; opening from the mark
and from ⌘L; switching (mark and pill update); live edit of name, colour,
symbol; a custom hex drawn exactly on the quiet mark, and no readability note
for any colour (D21); delete then Undo; drag and keyboard reorder; keyboard-only flow with focus return;
Reduce Motion; Quick Switcher match; the switch prompt's order. Existing
scenarios drop their Patron steps.
Keys for main-process Escape handling are sent with `sendInputEvent`.

**Repo checks:** `npm run test:unit`, `npm run lint`, `npm run substrate:check`
(tokens), `npm run browser-api:check` after `browser-api:build` (the
projection's `color`/`symbol`/`windowTabCount`/`tint` fields, update and move-to-index
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
  quiet mark (colour only in a small square, D21), and the dev switch for
  judging B/C in practice.
- **Downgrade drops identity.** An older build strips `color`/`symbol` when it
  first loads `workspaces.json` (keeping a backup); defaults reappear on
  upgrade, custom choices do not (D15).
- **Upgrade writes once.** The first load of the new version persists the
  assigned identities and leaves a `.before-repair` backup beside
  `workspaces.json` (D13). That is the existing repair path working as designed.
- **Patron's value.** With nothing locked, Patron relies on goodwill; this is
  the owner's choice (D5), recorded rather than mitigated.
