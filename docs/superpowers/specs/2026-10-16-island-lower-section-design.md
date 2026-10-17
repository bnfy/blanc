# Island lower section — Recently closed band, one-line footer, device and group names

**Date:** 2026-10-16
**Status:** approved by the owner on 2026-10-16 (the drawer-to-band move of Recently closed, its draggable position, Other devices beside Private, the Glance icon, and both group-name fixes were the owner's decisions); implementation plan in `docs/superpowers/plans/2026-10-16-island-lower-section.md`
**Builds on:** [2026-08-08 Island UI refresh](2026-08-08-island-ui-refresh-design.md) (the footer this replaces), [2026-07-06 Island at scale](2026-07-06-island-at-scale-design.md) (the "minimal ≠ hidden" line), [2026-10-07 drag reorder](2026-10-07-drag-reorder-tabs-groups-design.md) (group dragging, which Recently closed joins), [2026-10-14 custom tab names](2026-10-14-custom-tab-names-design.md) (the rename prompt Rename Device reuses), [2026-09-26 non-island polish](2026-09-26-non-island-surfaces-polish-design.md) §13 (the System v2 vocabulary this brings to the Island).
**Mockups:** drawn in the design conversation of 2026-10-16 over a screenshot of the real panel; this document records what they decided.

## 1. Why

The owner looked at the bottom of the open Island (the ⌘L panel) and said it "looks unfinished and very beta". It was one of the first surfaces designed for Blanc, ported from the Design System's Island handoff in August 2026 and barely touched since (localization #687, the icon-only Spaces button #786, Instrument Sans #840). Every later polish pass — non-island polish and System v2, the start page polish, brand-usage System v3 — explicitly left the Island out, so the rest of Blanc grew up around it. It still speaks the early vocabulary: lowercase labels, a dashed "private" button (dashes now *mean* "you are in a private tab" everywhere else), 28px buttons with 12px medium text, an ink button that fades on hover, 6px icon buttons and a hint line faded to 70% of an already dim color.

The bigger finding was about use. Asked what they reach for down there, the owner said Recently closed — both for the tab they just closed by mistake and for something from earlier — and rarely anything else. Today Recently closed is the last thing in the scrolling list, folded shut under Other devices, and it shows at most four entries. The thing the owner uses is the hardest thing to reach. The icon row they rarely touch should get quieter but stay, because it is how people new to Blanc find Favorites, History and Settings.

While reviewing the mockups the owner also asked to rename the other devices whose tabs are synced: computer names ("MacBook-Neo.local" in v1.35.0; "MacBook Neo" once #859 ships) are not descriptive.

## 2. Goals, non-goals, anti-goals

**Goals**

1. The lower section looks finished: sentence case, the System v2 button vocabulary (ink primary, soft-filled secondary, the radius scale), readable secondary text.
2. Recently closed sits near the top of the tab list, in the same band as a named group, and the user can drag it to wherever suits them.
3. New tab and Private stay visible, labeled and recognizable in the footer, with New tab as the obvious main action.
4. Other devices is one click from the footer.
5. The icon row stays, quieter.
6. A synced device can be renamed from any of the owner's devices, and the name follows to all of them.
7. Group names keep the capitals the user types; existing groups get a capital once, and groups can be renamed.
8. Tab rows' hover actions are all icons: the "glance" text pill becomes a Glance icon.

**Non-goals**

- The address row. It keeps exactly its current controls and width (see anti-goals).
- The resting pill, including its lowercase "private" chip; the find capsule, shield popover, Spaces menu, capture popover and Glance picker (§12).
- The vertical tabs rail, apart from the new group header menu (§9.3). Recently closed does not appear there.
- What Recently closed stores or for how long (tiers, the 25-entry cap, one-hour expiry), and how tab sync publishes a device's tabs.
- Adding or removing tools in the icon row.
- The Quick Switcher and slash commands, apart from the case of `/group` names.
- A device list, remote sign-out or revoking a device in Settings (still the v2 protocol's job, as in the pairing design).

**Anti-goals (a failure even if it works)**

- **A narrower address field.** The owner ruled this out when labeled New tab and Private pills were proposed for the address row.
- New tab or Private that people don't recognize as new-tab buttons. Icon-only round buttons were mocked and rejected for this.
- A footer pushed out of the window, or a drawer that hides the tab list entirely, when the Other devices drawer opens.
- Ungrouped tabs appearing between groups, or anything else that breaks the list's order (pinned → groups → ungrouped).
- New, unfamiliar visual vocabulary. Recently closed reuses the group band; the drawer is an ordinary toggle opening an ordinary list.
- A rename that shows on one Mac and not another, or two Macs that permanently disagree about a device's name.

## 3. The shape

```
┌──────────────────────────────────────────────────────────────────┐
│ 🔒 [ https://example.com/                    ]  ‹  ›  ↻  ♥  ⌃     │  address row (unchanged)
│ Pinned 2                                                         │
│   ▪ Pinned tab                                                   │
│ ╭──────────────────────────────────────────────────────────────╮ │
│ │ › Recently closed 12                                          │ │  band, folded; draggable
│ ╰──────────────────────────────────────────────────────────────╯ │
│ ╭──────────────────────────────────────────────────────────────╮ │
│ │ ⌄ Projects 3                                              ⌘1 │ │  named groups
│ │     ▪ Tab                                                    │ │
│ ╰──────────────────────────────────────────────────────────────╯ │
│   ▪ Ungrouped tab                                                │  ungrouped tabs, last
│ ┄┄┄┄ Other devices drawer, only when open ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ │
├──────────────────────────────────────────────────────────────────┤
│ [+ New tab ⌘T] [⊘ Private] [Other devices 2]       ◌ ♡ ◷ ↓ ▯ ⚙   │  footer, one line
└──────────────────────────────────────────────────────────────────┘
   Private tab · Nothing here is saved to history     (private tabs only)
```

## 4. The tab list and the Recently closed band

### 4.1 Order

The resting list is, top to bottom: Pinned (ungrouped pins, plain header as today) → named groups and the Recently closed band, in the user's order → ungrouped tabs. Recently closed starts directly under Pinned (or first, when nothing is pinned). Ungrouped tabs never sit between bands.

Remote devices and the old "recently closed" furniture rows leave the bottom of the list (`renderList`'s `.island-furniture` block).

### 4.2 Looks

- The same band as a named group (`.island-group-band`: `--surface` fill, 10px radius) and the same header (caret · name · count), so it reads as one of them.
- Header: caret, "Recently closed", the real number of entries (today's header shows at most 4 because of `slice(-4)`; that cap goes). No ⌘ number: Recently closed is never a ⌘1–9 target, and group numbering skips it.
- When unfolded, **Clear all** sits at the right of the header, where it sits today.
- Rows, indented like group members: today's reopen glyph, the title (a group or batch entry keeps "{title} · N tabs"), and the per-row Forget (×) on hover. No favicon, no domain, no time, as today.

### 4.3 Behavior

- It starts folded every time the Island opens. The header toggles it.
- Unfolded, it lists every entry, newest first (at most the 25 Blanc keeps); the list scrolls as it does for long groups.
- Clicking a row (or Enter on it) reopens that entry and closes the Island, as today. ⌘⇧T still reopens the most recent entry without opening anything.
- It is hidden when there is nothing to reopen, and in every non-resting list state (typed query, slash commands, the site-info card), as the furniture is today.
- In a private tab it behaves the same; private tabs are never recorded.

### 4.4 Dragging

- Its header drags like a group header: pointer drag and ⌥⇧↑/↓ from the keyboard, with the same live-region announcements (`tab-drag.js`).
- It moves only among the named groups: it can't go above Pinned or below the ungrouped tabs, same as a group.
- It is not a drop target (tabs can't be dropped into it) and its rows can't be dragged out.
- Its position lives wherever group order lives: in the window's session entry, and in a Space's saved window entry when the window belongs to a Space (`workspaceCapture` → `captureWindowEntry`), so switching Spaces brings each Space's own order. A new window, or a Space saved before this ships, starts with it under Pinned.
- If the group it sat next to goes away, it keeps its place relative to the groups that remain.

### 4.5 Keyboard

The header is focusable like a group header (today the closed header and rows are not); Enter or Space folds and unfolds it. Its rows are focusable and Enter reopens. Arrow navigation of the resting list is not added here (the resting list has none today).

### 4.6 The Glance row action

The owner asked to remove or restyle the lowercase "glance" pill that appears on a hovered tab row (`.row-glance`, `overlay.js` ~701). It becomes an **icon button** in the row's action cluster, between pin and close, so every row action is an icon:

- Same size, hover-reveal and reserved-space convention as `.row-pin` and `.row-close`.
- On the tab currently showing in Glance it stays visible at rest with a soft fill, and clicking it closes Glance (today's `.on` state). Tooltips and accessible names stay "Open in Glance" / "Close Glance" (`row.glanceOpen`, `glance.close`); the visible word `row.glance` is no longer shown.
- **A new Glance glyph**, drawn in Blanc's icon style. It must not be mistaken for the footer's tab-layout tool (a sidebar rectangle): Glance is a page beside a page, not a sidebar. It joins the Design System icon set when synced.
- Other ways into Glance are unchanged (the tab context menu, `/glance`, the Glance picker).

## 5. Footer

One line, left to right:

1. **New tab** — the one ink pill: `--accent` fill, `--surface-raised` text (black-on-white in dark), plus glyph, "New tab", and `⌘T` / `ctrl+t` in Inter at reduced contrast inside it.
2. **Private** — a soft pill (System v2 secondary): soft fill, `--text`, the private glyph, "Private". Its shortcut moves to the tooltip, "New private tab (⌘⇧N)". No dashes.
3. **Other devices** — a toggle with the device count (§6): dim text and no fill when closed, soft fill and `--text` when open.
4. The six tools, pushed right, same order and behavior (Spaces, Favorites, History, Downloads, tab layout, Settings), quieter: 28px, `--radius-sm` corners, `--text-dim` with no fill until hover. The tab-layout pressed state and the bound Spaces state keep their soft fill.

All pills: 30px high, `--radius-full`, `550 12.5px` Instrument Sans (as `.ws-pill`). Hover deepens a fill one step; nothing fades the whole button. The divider above the footer stays.

In English with ⌘ the line uses about 500 of the 592px available. It must also hold at 640×480 and 125% zoom with `ctrl+t` and in all six languages; if a language can't fit, the footer may wrap as `.footer-launchers` does today, and no button may overlap another (the F41 footer-fit scenario).

New tab and Private keep today's behavior (`overlay.js` `footerNewTab`/`footerNewPrivate` handlers).

**The private glyph** is new to Blanc, where private is marked today by the word "private" and dashed borders. It is an eye with a slash, drawn in Blanc's own icon style (16-unit grid, 1.5 stroke, round caps) and added to the Design System's icon set when synced.

## 6. Other devices drawer

- **Other devices** in the footer opens the drawer: a region between the tab list and the footer. Clicking it again closes it.
- The panel is as tall as its contents, up to its maximum (`calc(100vh - 24px)`). While there is room, opening the drawer grows the panel, exactly as unfolding a group does. Once the panel is at its maximum, the drawer keeps a capped height (about six 32px rows) and scrolls inside past that, and the tab list above gives up the space and scrolls. The footer is always visible.
- It starts closed every time the Island opens, like the Recently closed band.
- It steps aside while the address field has text (Quick Switcher or slash commands) and comes back when the field is cleared.
- The button is hidden when there is no other device to show (tab sharing off, or no other device publishing).
- Contents are today's device sections: per device a header (caret, display name, tab count, how long ago it published) folding open to its tabs (favicon, title, pin marker, group tag). Clicking a tab opens it here, as today.
- Right-click a device header → **Rename Device…** (§7).

## 7. Device names

### 7.1 What the user sees

- Every device has one display name: the name a user gave it, or else the name the device publishes (the macOS computer name from #859; elsewhere the hostname without a local-network suffix).
- **Rename Device…** works like **Rename Tab…** (F46): the panel's address field takes the device's current display name, selected, with a visible "Rename device" cue; Enter saves; Esc cancels; saving an empty name restores the published name. It does not add a user-facing slash command.
- **Settings → Sync** gains a "This device's name" field in its status list (beside Sync name), because the Island never lists the device you are on. It edits the same name.
- Display names appear wherever a device name does: the Other devices drawer, the Quick Switcher's remote-tab sub-line, and the start page's other-devices list. Applying the names inside `sync.listRemoteDevices` covers all three.

### 7.2 How it syncs

- Names live in a new synced settings key, a map of `deviceId` → chosen name. It joins `SYNCED_KEYS`, so it needs no Worker change.
- Each entry carries its own clock, so renaming two different devices on two Macs at once keeps both. (Settings sync is last-writer-wins per key; a plain map would let one rename clobber the other.) For the same device, the later rename wins.
- A device never replaces a chosen name with its published name. The published name stays exactly as today (`deviceName()`, `sync-publish-ceiling.test.js`), so a Blanc that predates this feature still shows the computer name.
- Names are trimmed and capped at 80 characters (the cap `device-name.js` and `tabsync-model.js` use); the map has a bounded number of entries.
- A rename pushes the remote-device list to the overlay and to open start pages (`main.js` `pushRemoteDevices`).
- **How fast it travels.** Settings sync today only at launch, on a local settings or Favorites change, at quit and on Sync Now, so a rename could wait days to reach a Mac that stays open. The settings store therefore joins the existing pull on window focus and panel open (`sync.refreshSession`, at most once a minute), so a rename shows on another Mac the next time its Island opens. That is one more read per refresh against the Worker's shared 30-reads-per-account-per-minute limit; three devices stay well under it.
- **Mixed versions.** A Blanc that predates this uploads settings without the new key, which drops it from the server until a newer Mac uploads again; newer Macs keep their local copy and restore it. This is accepted for the update window, as it was for earlier settings keys. A separate store would need a Worker change.
- Device names are now user content that leaves the device, encrypted like everything else. The "what syncs" copy in Settings is updated with this release; any website wording about what syncs follows in its own website PR once the release ships (`docs/marketing-claims.md`).

## 8. Hint line

`#islandHint` goes. Its default and groups variants repeat what the address field placeholder ("/ for commands") and the Shortcuts sheet already teach. What survives:

- **Private tabs:** "Private tab · Nothing here is saved to history", under the footer as today.
- **Site-info card:** the three certificate and connection notes, where the card shows them.

## 9. Sentence case and group names

- Every label in the open panel moves to sentence case, in all six languages, together: the footer labels, "Recently closed", "Clear all", "Pinned", the Quick Switcher result tags, the empty states, the surviving hint and the site-info notes. User data (device names, group names, page titles) is shown as given. Fixed product names keep their glossary case ("Glance", "Space").

### 9.1 Group names keep their case

- "Research" stays "Research". Matching becomes case-insensitive everywhere a name is compared, so `/group research` finds "Research" and two groups can't differ only by case: `groupTabByName`, `reopenGroupEntry`, the importers (`tab-import-apply.js`, `tab-import-batch.js`, `tab-import-session.js`, `tab-import-organizer.js`, `arc-sidebar.js`).
- `/group <Name>` that matches an existing group case-insensitively adopts the capitals just typed ("/group Tools" turns "tools" into "Tools").
- Imported names keep their source's case (Arc folders, other browsers' groups). Names the import organizer generates from titles and domains start with a capital ("Project atlas").

### 9.2 Existing groups get capitals once (the owner's decision)

Every group was saved lowercase until now. On the first launch of this release, a one-time pass gives each existing group name a capital first letter ("projects" → "Projects"), and leaves the rest of the name alone. It covers the groups in every open window, the saved session and every saved Space (`workspaces.json`). A device-local version stamp makes it run once (the `presentationDefaultsResetVersion` pattern in `settings.js`); a group created or renamed afterwards is never touched again.

### 9.3 Rename Group… (the owner's decision)

So the automatic pass can be corrected ("Ios" → "iOS") and any name changed later:

- Right-click a group header → **Rename Group…**, in the ⌘L panel and on the vertical tabs rail. No group header has a context menu today; this adds one, which also carries the existing **Ungroup** and **Close Group** actions (today `/ungroup` and `/close-group`).
- It works like Rename Tab: the address field takes the group's name, selected, with a visible "Rename group" cue; Enter saves; Esc cancels. An empty name changes nothing.
- Names are trimmed and capped at 40 characters (today's cap). A name that matches another group in the same window (case-insensitively) is refused with a short notice rather than merging the groups.
- The new name reaches other devices through tab sync like any group change, and is saved into the Space if the window belongs to one.

## 10. Visual summary

| Element | Size | Shape | Fill / text |
|---|---|---|---|
| New tab | 30px, `550 12.5px` | `--radius-full` | `--accent` / `--surface-raised`; key cap Inter 11px |
| Private | 30px, `550 12.5px` | `--radius-full` | soft fill / `--text` |
| Other devices | 30px, `550 12.5px` | `--radius-full` | none / `--text-dim`; open: soft / `--text` |
| Tools | 28×28, icons 15px | `--radius-sm` | none / `--text-dim`; hover soft / `--text` |
| Recently closed band | as `.island-group-band` | 10px | `--surface` |
| Private note | 11.5px | — | `--text-dim`, no opacity |
| Glance row action | as `.row-pin` / `.row-close` | as they are | hover-reveal; in Glance: soft fill at rest |

The Island stays neutral, never Sunrise (brand-usage.md). Light, dark and private themes come from the existing tokens; the private panel keeps its dashed border.

## 11. Constraints

- Instrument Sans for text; Inter for counts and key caps (`chrome-fonts.test.js`).
- `copy/` rules: English and all five translations land in one PR, each changed key acknowledged with `npm run copy:ack`; `maxLength` limits are raised where needed; en.json notes that say "Lowercase" are rewritten.
- `browser-api/contract.json` changes with every new bridge member or payload field (Rename Device, Rename Group, the group header menu, the Recently closed position, the device-name settings key, the Settings → Sync channel in `bridges.json`).
- `spec/` parity, in a paired commit: F3 and `parity-matrix.md` ("lowercase mono labels"), F45 ("lowercase group"), F27 (folded per-device sections), and the acceptance scenarios that unfold "recently closed" (F2-7) or a device (F27-2) or merge into "work" (`tab-migration.feature`).
- Tests that pin today's footer and lowercase behavior change with it (footer launcher rules, the F41 footer-fit step, the recently-closed step, group-name expectations in Glance, Arc and import tests).
- Website wording is release-backed and ships in a separate website PR.

## 12. Out of scope, recorded as follow-ups

- The resting pill's "private" chip, the capture popover and the Glance picker hints stay lowercase after this ships; a later pass brings them along.
- After release, `/design-sync` updates the Design System's Island handoff (PORT-CHECKLIST, `Island.jsx`, the private and Glance glyphs) to match the app.

## 13. Left to the builder (the designer's calls)

- The exact drawer height cap and the scroll handoff between drawer and list.
- How the Recently closed position is stored (for example an index among the window's groups) and how `tab-drag.js` models it (a new section kind beside `pinned`/`group`/`loose`).
- The mechanism behind the Rename Device prompt (purpose-bound input like F46's `purpose: { renameTabId }`), within §7.1.
- The same for Rename Group (§9.3), and how the group header menu is shared between the panel and the rail.
- The device-name map's exact shape, entry bound and clock (per-entry timestamps plus tie-breakers like `_syncMeta`).
- The exact drawings of the private and Glance glyphs (both shown to the owner before merge, as render proof).

## 14. Verification

- Unit: display-name resolution (chosen vs. published, empty restores), the per-entry name merge, case-insensitive group lookup that keeps case, `/group` re-casing a match, the one-time capitalization (runs once, covers session and Spaces, never touches later names), Rename Group refusing a duplicate, the Recently closed position surviving group removal, session restore and a Space switch, `tab-drag.js` slots with the new section.
- Desktop scenarios: Recently closed band folded on open, unfold, reopen, Forget, Clear all, drag and ⌥⇧↑/↓, hidden while typing; Other devices drawer open/close, hidden when empty, steps aside while typing; rename a device and see it in the drawer, the Quick Switcher and the start page; rename a group from the panel and from the rail; footer fit at 640×480 and 125% with ⌘ and ctrl labels; `npm run test:i18n:desktop`.
- Render proof: full-resolution crops of the panel, before above after, in light, dark and private.
