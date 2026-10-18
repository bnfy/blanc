# Tab group colors: the Spaces palette for groups

**Date:** 2026-10-17
**Status:** the owner decided D1–D7 on 2026-10-17 (§12); the spec is ready for the owner's review before a plan. Nothing is built.
**Mockup:** [the three looks compared](assets/2026-10-17-tab-group-colors-options.png). Option A (left) was chosen.
**Builds on:** [2026-10-13 Blanc Spaces redesign](2026-10-13-blanc-spaces-redesign-design.md) (the palette, the readability guard in `src/renderer/space-identity.js`, the overlay color picker `space-picker.js`), [2026-10-16 Island lower section](2026-10-16-island-lower-section-design.md) §9 (group names keep their case, the group header menu), and the 2026-10-17 ungrouped tab placement spec in PR #933, not yet merged (groups drawn as tinted blocks in both the ⌘L panel and the side tab list).
**References:** Helium's vertical tabs, shared by the owner on 2026-10-17:
- a group header filled with its color, and a thin colored line down the left of its tabs;
- a group menu with a name field, a row of nine color swatches, New tab in group, Move group to new window, Close group, Ungroup and Delete group;
- a tab menu with New Tab Below, New Split View with Current Tab, Add Tab to New Group, Remove From Group, Move Tab to New Window, Copy URL, Reload, Duplicate, Pin, Mute Tab, Mute Site, Hibernate, Close, Close Other Tabs, Close Tabs Above and Close Tabs Below.

## 1. Why

After seeing groups drawn as tinted blocks in the side tab list (PR #933), the owner asked whether Blanc Spaces' color customization could extend to tab groups, the way Helium colors its vertical tab groups. A color makes a group easy to spot in a long list, and makes the active group recognizable from the Island's dots alone.

## 2. What this reverses

"Groups have **names, not colors**" is a deliberate rule in four places:
- CLAUDE.md and AGENTS.md (the Tab groups section);
- `spec/features.md` F3;
- `spec/parity-matrix.md`;
- `spec/acceptance/tabs-and-groups.feature`.

It is also a **public claim**: it is the heading on `site/src/pages/features/tab-groups.astro` and appears in `site/src/components/guides/tab-groups.astro`, recorded in `docs/website-revamp-claims-v1.27.json`. Under `docs/marketing-claims.md`, that copy may only change once a public release ships colors, in a separate website-only PR.

The rule's intent was a calm, uncluttered Island. This spec keeps that intent by making colors **optional and off by default** (§4.1). A group without a color looks exactly as it does today.

## 3. Goals and non-goals

**Goals**
1. Any group can have a color from the Spaces palette, or none.
2. A colored group is recognizable in the ⌘L panel, the side tab list and the Island's dots, in light, dark and private themes, with readable text.
3. Choosing a color is as quick as renaming a group.
4. Colors survive relaunch, Spaces, Recently closed and rollback to an older build. An older build drops the color; it never loses the group.

**Non-goals**
- Symbols for groups. Symbols stay a Spaces identity.
- Colors for ungrouped tabs or for runs of ungrouped tabs.
- The tab right-click menu, apart from what §8 lists for the owner to decide.

## 4. The model

### 4.1 Off by default
A group record gains `color: '#rrggbb' | null`. New groups start with `null`, which keeps today's neutral look. Imports start with none too (§9).

### 4.2 The palette
The eight Spaces presets: sage, sky, iris, rose, clay, sand, slate and graphite. Values come from `SpaceIdentity.PRESETS`, so the two features never drift apart. Whether groups also take custom colors through the Spaces hex picker is decision D3.

### 4.3 Readability
Drawing goes through `SpaceIdentity.paint()` and `wash()`. The stored hex is never changed; the guard picks readable ink and, where the fill is under 3:1 against the surface, draws an edge. Text on a tint stays `--text`.

## 5. How a colored group looks

Three options. All of them keep an uncolored group exactly as it is today.

**A. Tinted block (recommended).** The group's block takes the color as a wash (`wash()`: 15% in light, 20% in dark and private) instead of the neutral `--surface`. The header gets a small solid dot of the color before the name. In the Island, the active group's dots take the color.
- Quietest option, and it builds on the block shape from PR #933.
- The name and rows keep normal text colors, so readability doesn't depend on the color.

**B. Filled header, as in Helium.** The header row is filled with the solid color, with the name in `paint().on` ink, and the block below stays neutral.
- Easiest to spot.
- Loudest, and it reads like a Space's solid tile, so the two features look alike.

**C. Edge line.** A 3px line in the color runs down the block's left edge, and the header dot appears as in A.
- Subtlest option.
- On a light theme, a thin line in a dark preset reads as a border, not a color.

Under every option, the ⌘L panel and the side tab list draw a group the same way, as they already do for blocks.

**Spaces and groups side by side.** A window's Space shows as a solid tile with a symbol on the Island's leading chip. Under A and C, a group never uses a solid filled tile, so a group can't be mistaken for a Space. That is part of why A is recommended.

## 6. Choosing a color: the group menu

As in Helium, a group has one menu, opened two ways:
- right-clicking the group header, in either list;
- clicking a **⋮** button at the right end of the header, next to the fold caret. The button shows while the header is hovered or keyboard-focused, and while its menu is open, so the resting list stays calm.

The menu is a small popover drawn by Blanc, not the system's native menu, because it holds a text field and swatches. Like the Spaces menu, it's a new overlay mode (`'group-menu'`), anchored to the header that opened it. From top to bottom:
1. **Name field**, holding the group's name in the case typed. Enter or clicking away saves it; Esc cancels. A name another group already has is refused, as Rename Group… does today.
2. **Color row:** None plus the eight presets, using the Spaces editor's swatches (`space-picker.js`). Clicking one applies it at once.
3. The group actions (§8).

This replaces today's native group menu (Rename Group…, Ungroup, Close Group); renaming now happens in the name field. The menu is keyboard-reachable: the ⋮ button is focusable, arrow keys move through the swatches, and Esc returns focus to the header.

`/group <name>` keeps creating and joining groups and sets no color. There's no color slash command (D5).

## 7. Where colors show

| Surface | Uncolored group | Colored group (option A) |
|---|---|---|
| ⌘L panel block | neutral `--surface` tint | `wash(color)` tint, dot before the name |
| Side tab list block | same as the panel | same as the panel |
| Island dots (active group) | today's dot colors | dots in the group's color |
| Quick Switcher group row | today | dot before the name |
| Start page "Pick up where you left off" | today | dot before the name |
| Other devices drawer (synced tabs) | today | dot, if the sending device sent a color (§10) |

Private theme: the private wash level from `space-identity.js` applies. A private tab in a colored group shows the group's color as usual; the private chip and dashed borders are unchanged.

## 8. Menus (from the Helium reference)

**Group menu actions (under the name field and colors, §6):**
1. New Tab in Group (new)
2. Move Group to New Window (new; moves every member, like Move Tab to New Window)
3. Ungroup
4. Close Group

Helium's **Delete group** means close and forget, which is Blanc's Close Group; Close Group already records one Recently closed entry for the whole group. So there's no separate delete.

**Tab menu.** Compared with Helium's, Blanc's tab menu lacks:
- New Tab Below
- Close Tabs Above / Close Tabs Below
- Mute Site
- Add Tab to New Group as a top-level item (Blanc has it under Move to Group ▸ New Group…)

Blanc already covers the rest:
- Glance is the split view.
- Quiet is Hibernate.
- Close Other Tabs exists.

None of this needs colors. The owner chose a separate spec for these items (D6).

## 9. Imports

Bring Your Tabs groups imported tabs by the names in its own proposal (`tab-import-apply.js`). The handoff from the other browser (`tab-import-handoff.js`) carries no tab groups and no colors, so imported groups start with no color. Carrying Chrome's groups and colors across (Chrome's nine named colors mapped to the nearest preset, for example blue to sky and green to sage) would mean extending the handoff, so the owner left it to its own spec (D4). Arc folders have no color.

## 10. Data, persistence and sync

- **Group record:** `{ id, name, collapsed, color }`. The color is sanitized with `SpaceIdentity.normalizeHex`; anything invalid becomes `null`.
- **session.json and Spaces:** the group object carries `color` when set, and the sanitizers in `session-workspace.js` and `workspaces-model.js` keep it. Older builds rebuild group objects from `id`, `name` and `collapsed` only, so they drop the color on their next save, and the group survives. No migration is needed.
- **Recently closed:** a group entry keeps its color in memory, and Reopen restores it.
- **Profile Sync:** open-tab snapshots send groups as `{ id, name }`. Adding `color` is optional; older receivers ignore it. Groups themselves aren't synced as settings.
- **Merging:** when a reopened group joins an existing group with the same name, the existing group's color wins.
- **Bridge contract:** the `TabGroup` type in `browser-api/contract.json` gains `color: string | null`, with the usual contract edit and vector rebuild.
- **Tokens:** no new tokens. The palette already lives in `tokens/tokens.json` as `space-*`.

## 11. Copy and parity

New strings, in all six languages in the same PR:
- the group menu's accessible name and the ⋮ button's label (for example "Group options")
- the name field's label
- New Tab in Group
- Move Group to New Window
- None (the swatch's accessible name)
- the eight color names already exist as `spaces.color.*`, so reuse them

`spec/features.md` F3 and `spec/parity-matrix.md` record the reversal, and a new F3 acceptance scenario covers set, clear, relaunch and Space switch. The website copy changes later (§2).

## 12. The owner's decisions (2026-10-17)

- **D1. Reverse "names, not colors":** yes. Colors are optional and off by default.
- **D2. The look:** A, the tinted block with a dot before the name and colored Island dots (see the mockup).
- **D3. Colors:** the eight Spaces presets only. No custom colors.
- **D4. Chrome's groups and colors through Bring Your Tabs:** not in this work; a separate small spec later.
- **D5. A `/group-color` slash command:** not now.
- **D6. Helium's tab-menu items (New Tab Below, Close Tabs Above/Below, Mute Site):** a separate spec.
- **D7. Where to choose a color:** Helium's way. Right-clicking the header or clicking its ⋮ opens one group menu with the name field, the colors and the group actions (§6).

## 13. Verification (once decided)

- **Unit:** color sanitizing; persistence and rollback (an older build's group objects have no color); Recently closed keeps the color; the group menu's actions and its refusal of a duplicate name.
- **Desktop acceptance:** open the group menu by right-click and by the ⋮ button, in both lists; set a color, then clear it; rename from the name field; the color survives a relaunch and a Space switch; a closed colored group reopens colored; the Island's dots use the color.
- **Visual:** light, dark and private screenshots of the panel, the side tab list and the Island for every preset, with the readability guard's edge case (graphite in dark) checked by eye.
