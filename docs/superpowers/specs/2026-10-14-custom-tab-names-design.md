# Custom tab names

October 14, 2026. **Status: design approved in chat, awaiting owner review of
this file.** Nothing here is built yet.

## Why

A tab's label is whatever the page puts in its `<title>`. Many working tabs
carry long, unhelpful titles: "DNS | Records | discoverhardwood.com |
Account | Cloudflare", an untitled dashboard, five tabs that all read
"Analytics | Home". In the ⌘L panel they truncate to the same few words. Arc,
Vivaldi and Edge let people name a tab themselves; Blanc does not.

The goal is a choice per tab: keep the page's own title (the default, as
today) or give the tab a name of your own, and go back whenever you like.

## Decisions (owner, October 14, 2026)

1. **A name sticks through navigation.** Once a tab is renamed it keeps the
   name on every page it visits, on any site, until the person chooses
   **Reset Tab Title**. (This item was first drafted as *Use Page Title*; the
   owner renamed it during implementation as the clearer undo.)
2. **You type the name in the ⌘L bar.** **Rename Tab…** opens the command
   panel prefilled with `/rename` and the tab's current name, aimed at the tab
   that was right-clicked. This is the path **Move to Group ▸ New Group…**
   already uses.
3. **History and Favorites keep real page titles.** History is a record of
   pages, and a Favorite is saved under the page's own title.
4. **Duplicate Tab starts from the page title.** A duplicate does not copy a
   custom name, so two tabs never share one by accident.
5. **Clearing history keeps names.** Clearing history removes saved page
   titles from `session.json` as it does today, but a name the person typed is
   theirs, like a group name, and survives.

## What the user sees

### Renaming

The tab context menu (resting pill, ⌘L rows and vertical rail share it)
gains **Rename Tab…** directly after **Duplicate Tab**:

```
Copy Link
─────────
Reload            ⌘R
Duplicate Tab
Rename Tab…
Reset Tab Title         ← only while the tab has a custom name
─────────
Pin Tab
…
```

**Rename Tab…** opens the ⌘L panel with `/rename ` followed by the tab's
current label: its custom name if it has one, else the page title. Only the
name part is selected, so typing replaces it and the arrow keys edit it. The
panel lists the `/rename` command row with its hint, *"Name this tab — leave
it empty to reset its title"*.

- **Enter** applies the name to the right-clicked tab, even if a different
  tab is active, and closes the panel.
- **Esc**, clicking away, or editing the input so it no longer starts with
  `/rename` cancels; the right-clicked target is forgotten, exactly as
  `/group` forgets its New Group… target today.
- Typing `/rename Budget` from scratch renames the **active** tab. `/rename`
  with nothing after it restores the page title.

**Reset Tab Title** removes the custom name at once; nothing else changes.

### The name

- Whitespace runs (including pasted newlines and tabs) collapse to one space;
  the ends are trimmed; control characters are dropped. At most 100
  characters are kept (counted by code point, so an emoji is never split).
- An empty result means "use the page title".
- Pressing Enter on an untouched prefill, when the tab has no custom name and
  the text still equals the page title, does **not** rename it. Otherwise one
  stray Enter would freeze today's page title on the tab forever.
- Names are not lowercased (unlike group names). They are the person's text.

### Where the name shows

Everywhere Blanc labels a tab with its title:

| Surface | Shows |
| --- | --- |
| ⌘L panel tab rows, vertical rail rows, pill tab dots and dot tooltips | custom name |
| Glance header and its "opened" status | custom name |
| Tab drag ghost | custom name |
| Tabs menu (menu bar window list) and the macOS Dock menu's active-tab line | custom name |
| Reopen Closed Tab panel | custom name |
| Other devices' tab list (Profile Sync open-tab snapshot) | custom name |
| History, history title updates | page title |
| Favorites saved from the tab | page title |

On a renamed ⌘L or rail row, the hover tooltip shows the page's own title, so
the real page is always one hover away. The Quick Switcher matches both the
custom name and the page title.

The pill shows the tab's domain, not its title, so it is unchanged. The site
identity and certificate surfaces are unchanged too: titles are already
page-controlled text, so a custom name adds no new spoofing route.

### Lifetime

| Event | Custom name |
| --- | --- |
| Navigation, reload, back/forward (any site) | kept |
| Tab goes quiet and wakes | kept |
| Pin/unpin, group moves, drag reorder | kept |
| Move Tab to New Window | kept (same tab record) |
| Quit and relaunch (session restore) | kept |
| Saved into a Blanc Space and reopened | kept |
| Close then Reopen Closed Tab (any restore tier, single tab, group or batch) | kept |
| Duplicate Tab | **not** copied |
| Clear history | kept |
| Private tab | allowed; memory only, gone when the tab closes (private tabs are never persisted, reopened or synced) |

## Data and persistence

### Tab record (main process)

`tab.title` stays exactly what it is today: the page's own title, written by
`page-title-updated`. History, error copy and every existing writer keep using
it. A new field holds the person's choice:

```js
customTitle: null,   // string (normalized, ≤100 chars) or null
```

A pure helper, `displayTitle(tab)`, returns `tab.customTitle || tab.title`.
Every main-process label in the table above uses it.

### Chrome projection (`serializeTabs` → `tabs:updated`)

- `title` becomes the **display** title, so every renderer site that draws
  `tab.title` shows the custom name without change.
- A new field `pageTitle` carries the page's own title **only while the tab is
  renamed**, otherwise `null`. Renderers use it for the hover tooltip and
  Quick Switcher matching; `pageTitle != null` means "renamed".

`browser-api/contract.json` gains the `pageTitle` field on the tab payload
(`string | null`).

### Bridge

A new `browserAPI.renameTab(id, name)` invokes `tabs:rename` through
`chromeHandle`, like `groupTabByName`. Main resolves the tab, normalizes the
name, applies the "untouched prefill" rule, stores the result (`null` for
empty), then broadcasts tabs, rebuilds the menu and persists the session.
`name` of `null` or `''` resets. Unknown ids are a no-op. The contract,
`browser-api/generated/vectors.json`, and the preload change together.

### `session.json` and Blanc Spaces

`sessionTabMeta(tab)` adds `customTitle` to a tab's `meta` entry **only when
set**: `{ title, favicon, customTitle }`. `title` keeps holding the page title,
so an older Blanc that ignores the key restores the page title instead.
Unchanged files for un-renamed tabs keep the same bytes. The v0 flat rollback
mirror has no `meta` and is untouched.

Blanc Spaces capture windows through the same `captureWindowEntry` →
`sessionTabMeta` path, so spaces carry names with no separate change. Both
restore paths (launch restore and opening a space) pass
`meta[i].customTitle` into `createTab`, which normalizes it again because a
file on disk is untrusted.

`clearSessionMeta()` (clear history) today deletes every window's `meta`. It
instead rewrites each surviving entry to `{ title: '', favicon: null }`, plus
`customTitle` where one exists. If no entry anywhere has a custom name it
deletes `meta` exactly as today. On restore an empty title already falls back
to the host name (`filterRestoredSession`), so behavior is otherwise
identical.

### Closed tabs

`buildTabEntry`, `buildGroupEntry` and `buildBatchEntry` record
`customTitle` (normalized or `null`). Every reopen path passes it to
`createTab`. `projectEntries` labels a single-tab entry with its custom name
when it has one. Entries remain main-process-only, as today.

### Sync

`syncSnapshot` sends `displayTitle(t)` as the tab's `title`. The encrypted
snapshot format does not change; receiving devices simply see the chosen
name. Private tabs stay excluded.

## Implementation outline

| Area | Change |
| --- | --- |
| `src/main/tab-name.js` (new, pure) | `normalizeTabName(raw)`, `displayTitle(tab)`, `MAX_TAB_NAME`, the untouched-prefill check |
| `src/main/main.js` | `customTitle` on the record and `createTab` option; `renameTab()`, `beginRenameTab()`; `serializeTabs` projection; Tabs menu, Dock line and Glance status use `displayTitle`; restore and reopen paths pass `customTitle`; `clearSessionMeta` keeps names |
| `src/main/session-snapshot.js` | `sessionTabMeta` writes `customTitle`; `syncSnapshot` sends the display title |
| `src/main/closed-tabs.js` | entries record and project `customTitle` |
| `src/main/tab-context-menu-model.js` / `tab-context-menu.js` | `rename` and `reset-title` items and their actions |
| `src/main/preload.js`, `browser-api/` | `renameTab` member, `pageTitle` payload field, regenerated vectors |
| `src/renderer/overlay.js` | `/rename` command with the right-clicked target (`pendingRenameTabId`, cleared like `pendingGroupTabId`), selection of the name part of the prefill, tooltip and Quick Switcher use `pageTitle` |
| `src/renderer/vertical-tabs.js` | renamed rows' tooltip shows `pageTitle` |
| `copy/slash-commands.json`, `src/renderer/pages/shortcuts.js`, `copy/messages/*.json` | `/rename` registry entry and reference-page row; new strings `slash.rename.hint`, `slash.rename.doc`, `tabMenu.rename`, `tabMenu.resetTitle` in en, de, es, fr, pt-BR and it |
| `spec/features.md`, `spec/parity-matrix.md`, `spec/acceptance/tabs-and-groups.feature` | **F46 — Custom tab names** with acceptance scenarios |

## Testing

- **Unit (`node --test`):** `normalizeTabName`, including whitespace, control
  characters, the 100-character cap with surrogate pairs, and empty input;
  `displayTitle`; the untouched-prefill rule; context-menu model items and
  order (Reset Tab Title only when renamed; separator invariants hold);
  `runTabContextMenuItem` routing; `sessionTabMeta` with and without a name;
  `syncSnapshot` display title; closed-tab entries round-trip `customTitle`
  and project it; `clearSessionMeta` keeps names and still deletes meta when
  there are none; the `serializeTabs` allowlist includes `pageTitle`.
- **Bridge:** `npm run browser-api:check` after `browser-api:build`.
- **Copy:** `npm run copy:check` (all six languages acknowledged) and
  `npm run substrate:check`.
- **Acceptance (`@F46`):** rename from the row menu, name survives a
  cross-site navigation, Reset Tab Title restores, `/rename` with no name
  restores, name survives relaunch, and a private tab's name is not written to
  `session.json`.
- **Running app:** rename from the pill, a ⌘L row and the vertical rail, and
  check the name in each surface in the table above.

## Out of scope

- Inline editing inside a row.
- A keyboard shortcut or menu-bar item for Rename Tab.
- Importing custom tab names from Arc (F45) or other browsers (F40).
- Renaming tabs on mobile; F46 is desktop-only until the mobile apps exist.
