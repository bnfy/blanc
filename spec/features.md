# Feature Spec (platform-neutral)

Each feature defines the **contract** every platform implements. Write to the
contract, not to another platform's code. `D#` references point to
[`divergence-register.md`](./divergence-register.md); `→ substrate` points to a
shared artifact in [`shared-substrate.md`](./shared-substrate.md).

Each entry ends with **Acceptance** — a platform-neutral scenario that must pass
identically everywhere.

---

## F1 — Island chrome (the pill + command bar)

The single custom command surface that replaces a traditional tab strip +
toolbar (Bowser Design System "Island Chrome").

- **Resting pill** shows, left→right: back/forward (desktop; mobile uses edge-swipe
  gestures per D7), direct dots for standalone pinned tabs followed by the
  active section (named group, loose tabs, or pinned shelf), capped at 8 total,
  with a quiet window-wide `+N` for every omitted tab that opens the panel; on
  a pointer platform, hovering/focusing a dot reveals that tab's favicon so it
  can be identified before switching), favicon,
  domain, shield count (F12), a private chip when private (F4), and a trailing
  action cluster (reload / favorite / close tab / downloads). The resting pill
  carries **no group name** — group identity is named in full in the panel
  (F3). Each dot always represents one tab; making a tab quiet (F31) never
  removes, moves, or restyles its dot. In
  desktop vertical mode (F28/D19), the rail becomes the persistent tab
  presentation and the resting pill omits only its redundant tab dots.
- **Expanded states** (one at a time): `panel` (command bar expanded in place),
  `palette` (same panel summoned by the ⌘L-equivalent, floated over a scrim),
  `find` (F8). Only the active state shows; Escape/back dismisses.
- On desktop, an off-by-default setting may open `panel` after the pointer
  remains over the resting Island's address (favicon and domain) for 300 ms;
  its buttons, dots and chips never hover-open. Leaving early cancels it; closing
  under a resting pointer requires leaving and re-entering before it can open
  again. Touch-only devices have no hover-open behavior (D28).
- On desktop, an off-by-default **Auto-hide the Island** setting (also a View
  menu toggle) lets the page fill the window. Pointing at the window's top edge
  brings the strip back and pages make room for it; it hides again once the
  pointer leaves the strip. Every expanded state, popover and Glance keeps it
  shown while open (D29).
- The panel's list area shows: the **tab switcher** at rest, **slash commands**
  (F7) when input starts with `/`, the **Quick Switcher** (F6) otherwise.
- Below the list, one footer line holds **New tab** (the one solid pill, with
  its shortcut), **Private**, the **Other devices** toggle (F27; hidden when no
  other device shares its tabs) and the icon tools (Spaces, Favorites,
  History, Downloads, tab layout, Settings). Other devices opens a drawer
  between the list and the footer; it starts closed on every open and steps
  aside while the input has text. Under the footer, a private tab adds a
  one-line note that nothing is saved to history. Labels are sentence case.
- **Platform note:** desktop draws this as a 68px strip + an always-on-top overlay
  view. Mobile renders it natively (SwiftUI / Compose) driven by shared design
  tokens (→ substrate). The *layout, contents, and states* are the contract; the
  windowing is D11, the input affordances are D7.
- **Acceptance:** With 3 tabs in a group named `work` and 2 trackers blocked on the
  active page, the pill shows the platform back/forward affordance (buttons on
  desktop, edge-swipe gesture on mobile per D7), 3 dots, the domain, a shield
  count of 2, and the action cluster — and not the name `work`. Summoning the
  palette floats the command bar with the tab switcher listed. On desktop,
  enabling hover-open and dwelling on the Island's address opens the panel once;
  crossing it, resting on its buttons, hovering nearby, or disabling the setting
  mid-dwell does not. With auto-hide on, the page starts at the window's top
  edge; pointing there or summoning the palette shows the strip again.

## F2 — Tabs

- Create, close, switch, **reopen-closed**, **duplicate**, **pin/unpin**,
  **mute/unmute**. A plain new tab (F7 `/new`, panel row, new-tab shortcut) always
  opens **ungrouped** and to the newtab page (F16), regardless of the active tab's
  group.
- `window.open` / context-menu children inherit the opener's privacy (F4) but
  **not its group**: like a plain new tab they open **ungrouped**, after the
  other ungrouped tabs (F3).
- The tab menu also offers **New Tab Below** (directly under the tab, inside
  its group if it has one), **Close Tabs Above** and **Close Tabs Below**
  (unpinned tabs across the window, one undo step), and **Mute Site** /
  **Unmute Site** (every tab on that exact host, until Blanc quits; private tabs
  keep their own). Unmuting one tab on a muted site overrides the site for that
  tab until it leaves the host.
- Switching tabs never loses an inactive tab's identity. On every platform an
  inactive tab may have its renderer discarded to reclaim memory — on desktop
  deliberately, after an idle delay the person controls (F31); on mobile because
  the OS evicts it (D8) — and it returns with its identity, title, address, and
  back-history intact.
- On desktop, reopen-closed history is scoped to the native window workspace
  that closed the tab (D11). Reopening in one window can never consume another
  window's recovery entry.
- In the ⌘L panel, **Recently closed** is a band styled like a named group,
  placed among the groups (by default directly under Pinned). It starts folded
  every time the panel opens, lists every entry newest first with per-entry
  Forget and Clear all, takes no ⌘1–9 number and holds no tabs. The person can
  drag it, or move it with ⌥⇧↑/↓, to any place among the groups (never above
  Pinned or among the ungrouped tabs); that place is kept with the window's
  group order, in its session and in a Space.
- **Acceptance:** Open a tab, close it, reopen-closed → same URL returns. Duplicate
  a tab → a second tab with the same URL. Pin a tab → it is marked pinned and
  ordered ahead of unpinned tabs in its current group. An ungrouped pin uses the
  standalone pinned section; pinning never changes group membership.

## F3 — Tab groups

- Groups have **names**, kept in the case typed and matched in any
  case: `/group research` joins "Research", and two groups can't differ only
  by case. A group exists only while it holds ≥1 tab (auto-pruned when empty).
- Create/join via `/group <name>` (find-or-create; typing new capitals for an
  existing group re-cases it) or an inline picker on the tab row; leave via
  `/ungroup`; close all via `/close-group`. A group's menu (below) renames it;
  a name another group already has is refused, not merged.
- A group may have an optional **color**, one of the eight Spaces presets, off
  by default. A colored group's block takes a light tint of it, a dot sits
  before its name, and the Island's dots take it. Right-clicking a group header
  or its ⋮ opens the group menu: the name, the colors, New Tab in Group, Move
  Group to New Window, Ungroup and Close Group.
- The pill's direct dots show standalone pins followed by the active section:
  the active named group, the active tab's run of ungrouped tabs, or the
  pinned shelf itself.
  They share an eight-dot budget, always retain the active tab, and use `+N` to
  count every other tab in the window. A group's pinned tabs stay inside it and
  lead its rows/dots; only ungrouped pins use the standalone pinned section.
  Other groups live in the palette panel (per-group headers, foldable;
  collapsed group shows an "N tabs tucked away" row).
- The Quick Switcher (F6) matches group names, ranked above tabs; picking a group
  focuses it (unfolding if collapsed). The nth-cluster shortcut (D7) focuses the
  nth *section's* first tab when groups exist.
- **Ungrouped tabs anywhere:** the window's tab order is the order drawn.
  Ungrouped tabs may sit above, between or below groups; each run of ungrouped
  tabs with no group between them is its own section, numbered with the groups
  top to bottom. A new group appears where its tab was (directly below the
  group that tab left, if any); Remove from Group lands a tab directly below
  its group; Ungroup leaves the tabs where they were. New tabs still land at the
  bottom. A window saved before this order is laid out as before: groups, then
  ungrouped tabs.
- New **private** tabs are never grouped.
- A tab opened from a link in a grouped tab (`window.open` / `target=_blank`,
  Open Link in New Tab, Open Link in Glance) opens **ungrouped**, in the same
  place as a plain new tab: after the other ungrouped tabs. It joins a group
  only when the person moves it there.
- **Drag to reorder** (rail and expanded island, same gesture): drag a tab
  within its section, into another group's section or onto any group header
  (appends; a collapsed group stays collapsed), or into any gap above, between
  or below groups, where it becomes ungrouped. Dragging never changes pinned
  state. Drag a group header to reorder groups, including past ungrouped tabs;
  cluster order (⌘1–9, ⌥⌘↑/↓, pill dots) follows. ⌥⇧↑/↓ does the same from the
  keyboard, stopping in each gap between groups, skipping collapsed groups (but
  not the gaps beside them) and stopping at either end. Dragging out
  over page content does nothing and gives the page no data.
- **Acceptance:** With one standalone pin, 2 tabs in `work`, and 3 tabs in
  `play`, activating `work` shows 3 direct dots and `+3`; activating `play`
  shows 4 direct dots and `+2`. Collapse `work` → its tabs show as "N tabs
  tucked away" in the panel. Delete the last tab in `play` → `play` disappears.

## F4 — Private tabs

- Opened via `/private` or the new-private-tab shortcut, to the private newtab
  page. Marked `private` on the tab model.
- **Never** recorded to history (F10), **excluded** from session persistence (F18)
  and reopen-closed (F2). Children (`window.open`, context menu) inherit privacy.
- Private tabs share a dedicated **non-persistent web session** with one another,
  isolated from normal tabs. Cookies, storage, cache, service workers, HTTP auth,
  and permission decisions remain memory-only and disappear when Blanc quits.
- While the active tab is private, chrome uses the **private theme** (F15): deeper
  ink, hollow dots, and a "private" chip that closes the tab (quick exit).
- Shield counts and downloads behave normally. Existing Favorites can be
  opened in private tabs, but Blanc does not add Favorites from private
  browsing because that would create a persistent record.
- On desktop, device-bound passkeys follow the session split: private tabs can't
  see the normal profile's passkeys, and passkeys *created* in a private tab are
  **ephemeral** — unusable after Blanc quits (D16).
- **Acceptance:** Open a private tab, visit a site → it does not appear in history
  or share normal-session site data; closing and reopen-closed does not bring it
  back; the pill shows the private chip and the private theme.

## F5 — Address input & search

- One input normalizes typed text (`normalizeAddressInput` heuristic): has-a-scheme
  → navigate; looks-like-localhost/domain → navigate; else → search query against
  the selected engine.
- **Search engines:** `duckduckgo` (default), `google`, `bing`, `brave`, `kagi`,
  and `custom`: the user's own search address with one `%s` where the query goes
  (`searchEngineTemplate`). A custom address uses `https://`, or `http://` only
  to a local-network host, and `%s` must follow the host and port. Custom
  engines get no live suggestions. → substrate (engine table).
- Search-like input blends the local Quick Switcher with best-effort autocomplete
  from the selected engine. Engine completions never claim bare Enter: the existing
  confident-local-match rule still applies, otherwise the exact typed query remains
  the search target. A completion only wins after explicit pointer/arrow selection.
  URL-like text, slash commands, sensitive-looking or pasted values, and input
  typed in private tabs are never sent for autocomplete. The device-local
  `searchSuggestions` setting (default `true`) lets the user turn provider
  requests off entirely; provider failure falls back to local results + Enter.
- **OS hand-off** (`handOffToOs`) is checked *before* normalization for bare
  `mailto:` / `tel:` / `facetime:` / `sms:` URIs and page-initiated navigations to
  them — handed to the OS instead of treated as a query (D4).
- Desktop also hands reviewed app schemes and standard Microsoft/Google native
  OAuth callback schemes to their installed applications after explicit
  confirmation. Unknown schemes never reach the OS. A captured callback remains
  valid if its OAuth popup closes while the native confirmation is open (D4).
- The heuristic's known edge-case misclassifications (e.g. dotted query strings)
  are an **accepted limitation**, identical on every platform — do not "fix" one
  platform's parser to be smarter than the others.
- **Acceptance:** Typing `example.com` navigates; typing `how tall is everest` or
  `site:example.com` searches via the configured engine; typing `mailto:a@b.com`
  hands off to the OS mail handler; a reviewed desktop app callback requires
  confirmation.

## F6 — Command palette & Quick Switcher

- Summoned by the ⌘L-equivalent (D7). Typing anything that isn't a `/command`
  filters a **Quick Switcher**: loose substring / in-order match across open tabs,
  favorites, history, and **group names**. Group matches rank above tabs.
- Selecting a result navigates/focuses it; selecting a group focuses that group
  (F3).
- **Acceptance:** With a tab on `news.example` and a favorite `docs.example`,
  summoning the palette and typing `exa` lists both; typing a group name lists the
  group first and focusing it switches to that group.

## F7 — Slash commands

Typed into the command bar. Names + hints are the shared-copy contract below;
`/1password` is the one platform-specific entry and appears only on desktop (D26):

| Command | Hint |
|---------|------|
| `/favorites` | Open favorites |
| `/history` | Open browsing history |
| `/downloads` | Open downloads |
| `/settings` | Open settings |
| `/clear` | Clear browsing history |
| `/new` | Open a new tab |
| `/private` | Open a private tab (history stays untouched) |
| `/close` | Close this tab |
| `/pin` | Pin or unpin this tab |
| `/mute` | Mute or unmute this tab |
| `/group <name>` | Move this tab into a group, creating it on first use |
| `/ungroup` | Take this tab out of its group |
| `/close-group` | Close every tab in this group |
| `/find` | Find in page |
| `/block-ads` | Toggle ad & tracker blocking |
| `/allow-ads` | Allow ads on this site |
| `/1password` | Fill a login from 1Password (desktop only) |
| `/theme [system\|light\|dark]` | Cycle appearance, or switch directly to system, light, or dark |

- Prefix filtering: typing `/gr` narrows to `/group`; typing `/` alone lists all.
- **Acceptance:** Typing `/the` then Return cycles the theme; `/theme dark`
  selects dark directly; `/group work` moves the active tab into `work`.

## F8 — Find in page

- A find capsule floats over the page; the rest of the page stays interactive
  (desktop keeps the overlay bounds tight around the capsule). Match navigation
  (next/prev), count display, dismiss on Escape/back.
- **Acceptance:** Find a word present 3× → count shows 3 and next/prev cycles
  highlights without blocking clicks elsewhere.

## F9 — Favorites

- User-facing name **Favorites** (heart icon); every internal identifier stays
  `bookmarks` (do not rename internals). → substrate note: the internal id split is
  a hard rule, not a mismatch to fix.
- Toggle favorite on the active page; "Add all open tabs to Favorites"; favorites
  appear on the newtab ledger (F16) and the favorites page.
- **Acceptance:** Favoriting the active page marks the heart filled and the page
  appears on newtab and the favorites list.

## F10 — History

- Records a visit + updates title per navigation; capped at **5000** entries;
  clearable (`/clear`). **Guarded off for private tabs** (F4).
- **Acceptance:** Visiting a site adds one history entry with the final title;
  `/clear` empties the list; private visits never appear.

## F11 — Downloads

- Download list with progress, capped at **200** entries. The **list UI + progress
  + states** are the contract.
- Storage location and "open file"/"reveal" behaviour **diverge** (D3): desktop
  filesystem + reveal-in-folder; iOS Files/sandbox; Android Downloads dir.
- **Acceptance:** Starting a download shows a progress row that completes to a done
  state; the file is retrievable through the platform's normal mechanism.

## F12 — Ad/tracker blocking (the differentiator)

- **On by default.** Blocks ad/tracker **requests** and applies cosmetic hiding of
  leftover ad elements. Per-tab **shield count** of blocked requests (coalesced,
  ~10 updates/s). **Per-site allow** (`/allow-ads`, exceptions list) and a **global
  toggle** (`/block-ads`, Settings). An exception outranks the global switch, so
  `/block-ads` **on an allowed site lifts that site's exception** (the inverse of
  `/allow-ads`) rather than flipping the global switch it cannot make visible
  there; anywhere else it toggles globally. Either way the page reloads, since
  neither change reaches requests already made or markup already rendered.
- **Filter data is shared** across platforms (EasyList + EasyPrivacy), compiled
  once → per-platform formats (→ substrate).
- **Engine diverges** (D1): desktop = `webRequest` interception (Ghostery); Android
  = `WebView.shouldInterceptRequest` (programmatic, comparable power); iOS =
  `WKContentRuleList` (declarative, ~150k-rule cap, curated subset). **Per-site
  exception mechanism** also diverges (D2): live predicate on desktop/Android vs.
  recompile/attach on iOS.
- **Contract that must hold everywhere:** blocking is on by default; the shield
  shows a per-tab blocked count; a site can be allow-listed **and returned to
  blocked from the same surface that allowed it**; the toggle works; the *set of
  trackers blocked* is as close as each engine's format allows, from the same
  source lists.
- **Shield chip is a clickable control** (desktop SHIPPED; mobile PLANNED): always
  present on pages with a blockable host (quiet glyph at zero, live count while
  blocking, faded-with-outline when off), opening a site-protection popover with a single
  site-scoped toggle (allow ads here / re-block here), the blocked count in plain
  language, a reload notice, and a link to blocking settings. Global blocking is
  deliberately not togglable from the pill. The count line follows D13 on iOS:
  binary protected/paused, no number.
- **The popover also states the connection at scheme level** — `Uses HTTPS`,
  `Not encrypted` (plain HTTP to a non-loopback host), or `Local` — and says
  nothing at all while a load is uncommitted, so it never carries a stale claim
  across a navigation. It does not inspect certificates, so it cannot
  distinguish a public CA from a locally-trusted proxy, and mixed content is
  not reflected; the copy therefore claims the scheme, never "encrypted". On
  desktop the pill's plain-HTTP "Not secure" badge is a second door into the
  same popover; discovery of that affordance elsewhere is a platform choice
  (the contract is only that site controls state the connection).
- **Acceptance:** Loading a page with known trackers increments the shield count;
  `/allow-ads` on that site drops the count to 0 for it and persists; `/block-ads`
  toggles blocking globally on a site with no exception, and on an allowed site
  lifts that exception instead.

## F13 — Permissions

- Explicit per-permission policy with in-chrome prompts (camera, mic, geolocation,
  notifications, etc.); same decision copy and default posture across platforms
  (mapped onto each OS's permission system).
- Media prompts carry a mic/camera glyph, and live capture is indicated: while
  any surface holds the microphone or camera, the chrome shows a capture
  indicator with per-surface stop controls (desktop draws its own chip; mobile
  defers to the OS indicator — D24).
- **Acceptance:** A site requesting geolocation raises the Blanc permission prompt
  with the shared copy; deny persists for that origin. A site capturing the mic
  lights the capture indicator; stopping it from the indicator ends capture.

## F14 — Settings

Keys, defaults, and validation are the contract (→ substrate: settings schema).
From the desktop `DEFAULTS`:

| Key | Default | Values / rule |
|-----|---------|---------------|
| `searchEngine` | `duckduckgo` | one of duckduckgo/google/bing/brave/kagi/custom; `custom` without a valid `searchEngineTemplate`, or an unknown id, reads as `duckduckgo` |
| `searchEngineTemplate` | `""` | the custom address, exactly one `%s` after the host and port, `https://` or local-network `http://`, ≤ 2048 characters; synced with `searchEngine` |
| `searchSuggestions` | `true` | boolean; device-local, never synced, private tabs override off |
| `adblockEnabled` | `true` | boolean |
| `homePage` | `""` | empty = `blanc://newtab`; else a URL |
| `theme` | `system` | system/light/dark |
| `tabLayout` | `island` | desktop-only `island`/`vertical`; device-local, never synced (F28/D19) |
| `verticalTabsWidth` | `248` | desktop-only preferred rail width, clamped to 200–360px; device-local, never synced (F28/D19) |
| `appIcon` | `sunrise` | one of `sunrise`/`sunrise-dark`/`paper`/`ink`; device-local |
| `adblockExceptions` | `[]` | lowercased hostnames, no scheme/path/`www.` |
| `darkWebsites` | `false` | desktop-only boolean; device-local, never synced (F42) |
| `darkWebsitesExceptions` | `[]` | desktop-only hostnames kept as drawn; same normalization as `adblockExceptions`; device-local, never synced (F42) |
| `onePasswordEnabled` | `false` | desktop-only boolean; device-local, never synced (F38/D26) |
| `onePasswordAccount` | `""` | desktop-only account name/id, trimmed and capped at 200 characters; device-local, never synced (F38/D26) |
| `migrationChecklistDismissed` | `false` | desktop-only boolean set when the moving-in checklist is hidden; device-local, never synced |
| `patronCalloutDismissedAt` | `0` | desktop-only time (ms) the start page's Patron pill was last closed; it stays hidden for 90 days; device-local, never synced |
| `lastRunVersion` | `''` | desktop-only: the app version that last launched on this device, used to notice an update; device-local, never synced |
| `whatsNewVersion` | `''` | desktop-only: the update whose start-page What's new pill is showing (`''` for none); cleared when the pill is opened or closed; device-local, never synced |
| `whatsNewSince` | `0` | desktop-only time (ms) that update first launched; the pill shows for 7 days from it; device-local, never synced |
| `syncMigrationCompleted` | `false` | desktop-only boolean set once Sync credentials persist, including for already-enabled profiles; device-local, never synced |
| `tabImportCompleted` | `false` | desktop-only boolean set after a Bring Your Tabs apply succeeds; device-local, never synced |
| `defaultBrowserMigrationCompleted` | `false` | desktop-only boolean set once Blanc is seen as the default browser; device-local, never synced |
| `firstRunCompletedAt` | `0` | desktop-only time (ms) this device first saved its privacy choices; 0 for profiles that finished first run before the field existed; device-local, never synced |
| `defaultBrowserReminderShown` | `false` | desktop-only boolean set when the one later default-browser reminder is shown; device-local, never synced |
| `usagePing` | `true` | boolean (F21) |
| `supporter` | `null` | written only by the activation flow, never generic writes (F17) |

- `appIcon` is **sanitized on read** the same way it is validated on write: any
  stale or retired id reads back as Sunrise. This predicate
  (`isAppIconAllowed`) is shared logic.
- **Acceptance:** Setting an invalid search engine is rejected; setting a retired
  icon id reads back as `sunrise`; adding `WWW.Example.com/x` to exceptions
  stores `example.com`.

## F15 — Theming

- Tokens in a root scope + a dark override + an explicit **private** scope. Driven
  by `theme` (F14) / `/theme`, propagating to chrome, internal pages, and web
  content **together, live, no restart**.
- Token *names and values* are shared (→ substrate: design tokens) — do not let the
  palettes fork between platforms.
- A second themed palette, `sunrise-*`, dresses Blanc's own pages and prompts
  (utility pages first); surfaces remap the semantic tokens to it rather than
  hard-coding colors. The frame around the Island stays on the neutral palette.
- **Acceptance:** Switching to dark recolors chrome, an open `blanc://` page, and
  chrome all at once; entering a private tab applies the private scope.

## F16 — Internal `blanc://` pages

- Pages: **newtab** (the "ledger" start page), **favorites** (`blanc://bookmarks/`),
  **history**, **downloads**, **settings**, **shortcuts**, **error**.
- **Presentation split:** the five *utility* pages (favorites, history, downloads,
  settings, shortcuts) present as a **transient chrome surface** — on desktop a
  sheet over a scrim — **never as tabs**; `newtab` and `error` remain tab content.
  Outbound activations (a history entry, a favorite) open
  real tabs and dismiss the surface. This is platform-neutral and maps to native
  sheet presentation on mobile — no divergence entry needed. Utility pages share
  one nav (Settings, Favorites, History, Downloads, in that order) and wear the
  `sunrise-*` palette (F15).
- The newtab ledger: date line, "Where to?", favorites, tab groups ("pick up where
  you left off" — clicking one focuses that group), footer with the weekly blocked
  count + palette hint. **No mascot** (retired in the rebrand — do not reintroduce).
- **Strong reuse opportunity:** ship these as **one shared web bundle** rendered in
  a web view on every platform, so they stay pixel-identical for free (→ substrate).
- **Acceptance:** newtab shows today's date, favorites, resumable groups, and the
  weekly blocked count; each page's nav links resolve within `blanc://`; utility
  pages open in the transient surface leaving the tab set untouched, and
  activating a favorite from the surface opens exactly one real tab; utility
  pages wear the Sunrise palette.

## F17 — Patron & app icons

- macOS Settings offers three Dock colorways: `sunrise` (default, follows the
  system appearance), `sunrise-dark`, and `sunrise-gold` (soft gold in Light,
  polished gold in Dark). Older ids, including the monogram `gold`, are retired; any
  stale or hand-set retired id falls back to `sunrise`.
- Patron is optional support and unlocks nothing: Blanc Spaces (F41) is free
  for everyone, and icon variants were never a Patron benefit. Renderers only
  ever see a derived `patronActive` boolean; the entitlement record stays in
  main.
- **Diverges:** purchase rails (D5 — Apple IAP / Play Billing, not Polar, on mobile)
  and icon-switching mechanism (D6 — clean on iOS, limited on Android).
- **Acceptance:** A current colorway can be selected; a retired id is rejected
  even when Patron is active.

## F18 — Session persistence & restore

- On relaunch, restore open tabs **and** groups (parallel `groupIds`). **Private
  tabs are excluded** from the file; groups referenced only by private tabs are not
  persisted.
- The desktop shape is `session.json` (`urls` + parallel `groupIds` + `groups`);
  mobile uses its platform store but preserves the same **logical** shape and
  restore behaviour (D8 for eviction/restore of live web views).
- The desktop file carries an optional **`meta`** array parallel to `urls`
  (`{title, favicon}` per tab) so a restored tab is scannable before it is ever
  loaded. Each nested window workspace owns its own `meta` column; metadata is
  never copied into the flat rollback mirror, and it is cleared whenever
  browsing history is cleared.
- **Acceptance:** With 2 groups and a private tab open, relaunch restores both
  groups and their tabs and does **not** restore the private tab.

## F19 — Context menu (link/page actions)

- Link/page actions: open in new tab, open in **background** tab, copy link,
  save/relevant page actions. Children inherit privacy (F4) and open ungrouped
  (F2/F3). OS hand-off
  (D4) honored for `mailto:` etc. Gesture entry point diverges (D7 — long-press on
  mobile vs right-click on desktop).
- **URL-bar menu (desktop only — D20):** the command bar's address input offers
  Undo/Redo, Cut/Copy/Paste, Delete, Select All, plus **Copy Clean Link**
  (copies the field's visible text minus a curated tracking-parameter list —
  `utm_*` and known click-ids, case-insensitive, surviving params byte-intact)
  and **Paste and Go** (clipboard text through the full typed-address pipeline —
  OS hand-off, search-vs-URL heuristic, utility-sheet routing — then the island
  closes).
- **Acceptance:** Long-press/right-click a link → "open in background tab" opens it
  without switching away, ungrouped even when the opener is in a group.
- **Acceptance (desktop):** Copy Clean Link on a URL with `utm_*`/click-id
  params yields the URL without them, other params intact; Paste and Go with a
  URL on the clipboard navigates the active tab and closes the island.

## F20 — HTTP authentication policy

- HTTP basic/digest challenges never present a separate Blanc credential
  prompt. Website sign-in forms remain the website's own UI.
- **Acceptance:** Navigating to a basic-auth-protected URL does not raise a
  Blanc prompt; the authentication challenge is cancelled and the protected
  navigation fails. Subresource and proxy challenges are cancelled silently.

## F21 — Telemetry (bounded usage measurement)

- Usage measurement is **on by default, opt-out** (`usagePing`), **packaged
  builds only**, and fire-and-forget (a failed/blocked event never affects the
  app or surfaces to the user). A launch sends `{installId, sessionId, version,
  platform, arch, osVersion}`. During that app session, the client may also send
  each fixed product event once: `{event:'mahjong_play'}` after Mahjong's first
  real free-tile move and `{event:'newtab_layout', layout}` when each start-page
  layout actually renders. `layout` is strictly one of
  `ledger|billboard|shelf|tally`; no arbitrary label or content crosses
  the boundary. Product events are never sent for a private tab. Desktop
  1.31.0 and later may also send `{event:'day1_default'}` and
  `{event:'day1_browsed'}` once per installation within 24 hours of the
  install time recorded in `install.json`, used only to split next-day return
  (see `docs/superpowers/specs/2026-10-09-first-day-retention-signals-design.md`).
  `installId` is
  a random per-install token stored in its own
  `install.json` (not in settings, never synced) — it maps to a device install,
  never a person. `sessionId` is a random 32-bit integer per launch for GA4
  session tracking. The shared `blanc-ping` worker dedupes launches and each
  fixed metric into DAU/WAU/MAU via TTL'd keyed seen flags, retains aggregate
  event totals, and optionally mirrors the same bounded fields to GA4.
- **Pseudonymity guarantees (2026-07-11 audit):** the worker never stores or
  forwards the raw `installId` — it's HMAC'd under the `INSTALL_HASH_SECRET`
  worker secret on arrival (secret unset ⇒ uniques skipped, fail closed), and
  GA4's `client_id` receives only the hash. Per-install `seen:*` flags expire
  at 90d (daily) / 400d (weekly, monthly); only aggregate counters live
  longer. Settings offers a **"Reset install ID"** button (mints a fresh id in
  `install.json`; the install counts as brand new from the next ping). The
  privacy policy (`site/privacy.html`) describes exactly this pipeline — keep
  the two in lockstep. Pre-migration `seen:*` markers (raw UUIDs, some with
  the old 800d TTL) are purged via the worker's bearer-gated
  `POST /admin/purge-legacy-ids` — run to `done:true` after deploy and BEFORE
  publishing the policy page (see the worker README); pre-migration GA events
  carried the raw token, disclosed in the policy's transition note.
- **Acceptance:** With the setting off, no usage event is sent; with the default
  (on), exactly one launch event is sent in a packaged build. A session reports
  Mahjong at most once after a real move and each rendered start-page layout at
  most once; unknown layouts, development builds, and private tabs report
  nothing. Blocking the network changes nothing user-visible; deleting
  `install.json` — or the Settings "Reset install ID" button — resets the
  install identity.

## F22 — Distribution & updates

- Users receive updates without an in-app updater fighting the OS. Desktop uses
  `electron-updater`; mobile is **store-managed** (App Store / Play) — the in-app
  auto-updater is `N/A` on mobile (D9).
- **Acceptance:** A newer version is installable through the platform's normal
  channel; no mobile build ships a self-updater.

## F23 — Zoom / page scaling

- Pages can be scaled. Desktop uses discrete zoom steps (⌘+/-/0). Mobile uses
  native pinch-zoom / reflow (D10). The *ability to scale* is the contract; the
  control is platform-native.
- **Acceptance:** A page can be enlarged and reset through the platform-native
  control.

## F24 — Password AutoFill & passkeys (mobile-gained)

- On mobile, the system **credential provider** (iCloud Keychain / 1Password / etc.)
  and **platform passkeys/WebAuthn** work inside the web view — the desktop
  limitation (vendor code-signature allowlists) does not apply (D12). `N/A` on
  desktop for credential providers; desktop *does* offer **device-bound Secure
  Enclave passkeys** via Touch ID in signed builds (Blanc's own keychain access
  group, not iCloud-synced), with private-tab passkeys ephemeral per D16. F38's
  explicit 1Password SDK bridge is separate from system credential-provider
  AutoFill.
- **Acceptance:** On a login form in a Blanc tab, the OS AutoFill affordance offers
  saved credentials; a passkey sign-in invokes the platform authenticator.

## F25 — Encrypted DNS (DoH)

- A Settings → Privacy control chooses how DNS is resolved: **Automatic**
  (opportunistic upgrade, may fall back to plaintext — no guarantee), **Off**
  (system resolver — the right choice under a VPN that runs its own DNS), a
  **named provider** (Cloudflare/Quad9/Mullvad — strict, hard-fail, no plaintext
  fallback), or a **Custom** RFC8484 template. DoH encrypts lookups between the
  browser and the chosen resolver; it does not hide destination IPs, and it makes
  the resolver a trusted party. Applies to normal and private sessions alike.
- **Acceptance:** With a named provider selected, `one.one.one.one/help` (or the
  provider's equivalent) reports DoH active; a deliberately-unreachable custom
  template fails closed rather than silently resolving over plaintext.

## F26 — WebRTC privacy and call stability

- A Settings → Privacy control sets the WebRTC IP-handling policy: **Standard**
  exposes no addresses beyond the default route's public interface;
  **Compatibility** restores the engine's ordinary public-and-local candidate
  discovery for calls that stutter or fail under the narrower policy, with an
  explicit local-address privacy warning; **Disable direct UDP** additionally
  stops WebRTC from opening direct UDP paths that bypass an application-level
  proxy (not relay-only enforcement). Applied to every tab.
- A separate device-local **Call audio** control chooses the receiver playout
  policy. **Automatic** leaves Chromium's latency/continuity tradeoff untouched;
  **Stable** targets about 400 ms through the standards-track
  `RTCRtpReceiver.jitterBufferTarget` property for smoother speech when a live
  call arrives in bursts; **Resilient** targets about 1 second for severe burst
  arrival at the cost of slower conversational turn-taking. Both explicit
  targets apply only to audio receivers and do not alter video timing or the
  selected IP-handling policy.
- **Acceptance:** On a WebRTC test page, Standard reveals no local/multi-homed
  private addresses; Compatibility exposes the engine-default candidate set;
  with an application proxy configured, Disable-direct-UDP removes direct UDP
  candidates. In a new call begun with Stable selected, each audio receiver
  reports a 400 ms `jitterBufferTarget` while Resilient reports 1000 ms and
  video receivers remain unchanged;
  returning to Automatic writes `null` to receivers managed by Blanc and a new
  call resumes engine-default buffering. A new call started after changing
  either setting uses the new policy.

## F27 — Tab Sync (open tabs from your other devices)

- With Profile Sync enabled and the per-device **"share this device's open
  tabs"** toggle on (**off by default** — a device's tabs never upload without
  an explicit act on that device), each device publishes an E2EE snapshot of
  its open tabs (url, title, group, pinned; http(s) only, bounded) plus a
  separately-budgeted E2EE sidecar of source-rasterized, bounded PNG favicons
  under the sync account. Favicon source URLs never cross devices and remote
  surfaces never load them. Other devices browse it **read-only** — ⌘L panel (the Other
  devices drawer, folded per-device sections), Quick Switcher (ranked below local tabs and
  favorites), start page — and open individual tabs locally. Never a merged
  live session: nothing force-opens or closes remotely. Private tabs never
  enter the snapshot. Toggle-off publishes a retraction; entries prune after
  30 days; a 24 h heartbeat keeps live devices present. Design:
  `docs/superpowers/specs/2026-07-21-tab-sync-design.md`.
- **Adding a device (desktop, 2026-10-16):** a device that already syncs shows
  an eight-character code, valid ten minutes, under Settings → Sync → **Add
  another device**; the new device enters it under **Add this device to my
  sync** and joins without a name or passphrase. The code derives a one-shot
  locator and a wrapping key; the Worker holds only ciphertext. A device that
  already syncs can also **Connect to a different sync with a code** in one
  step, and any synced device can copy a recovery code to the clipboard. The
  name-and-passphrase path remains as the fallback. Design:
  `docs/superpowers/specs/2026-10-16-sync-device-pairing-design.md`. Mobile:
  the same route and code; a QR presentation may be added there.
- **Device names:** every device has one display name, the name the person
  gave it or else the name it publishes (the computer name). Right-clicking a
  device header in the Other devices drawer offers **Rename Device…** (the
  panel's field takes the shown name, selected; Enter saves, Esc cancels, an
  empty name restores the published one); Settings → Sync renames the device
  you are on, which the Island never lists. Names sync as one settings key
  with a clock per device, so two devices renaming two different devices keep
  both, and travel on the focus refresh. A device never publishes its chosen
  name in place of its own. Design:
  `docs/superpowers/specs/2026-10-16-island-lower-section-design.md` §7.
- **Acceptance:** With sharing on on device A, device B lists A's tabs after a
  focus refresh and opens one as a new ungrouped local tab; toggling sharing
  off on A removes A's section from B after the next sync. Adding a device
  with a code stops at an invalid code and offers the passphrase fallback.
  Renaming A on B shows the new name in B's drawer, Quick Switcher and start
  page; renaming it to empty shows A's published name again.

## F28 — Vertical tabs

- On desktop, `tabLayout` selects `island` or `vertical`. It defaults to
  `island`, persists on that device, and is never included in Profile Sync.
  Changing it is a live presentation change over the existing main-owned tab
  model: it neither reloads guest content nor creates a second tab/workspace
  store. Mobile uses its native tab overview instead (D19).
- The desktop vertical layout is a **resizable 200–360px full-height left
  rail** in the trusted chrome document, defaulting to 248px. Its invisible
  right-edge separator supports pointer drag, Left/Right and Home/End keyboard
  adjustment, and double-click or Enter/Space reset to 248px. The preferred
  width persists on the device and never syncs. When the window narrows, only
  the rendered width is temporarily capped so the website retains at least
  392px; widening restores the saved preference. The Island remains the only
  address, search, and command surface. Guest tabs and the utility sheet
  occupy the remaining page pane below a 68px safe-area gutter whose color is
  sampled from the active website; the Island floats in that gutter without
  covering website pixels.
  The resting Island plus its panel and palette share the remaining website
  pane's centerline; find remains page-scoped, centered in that pane and capped
  at 560px. A subtle, noninteractive inset fade along the rail's right edge
  gives the pane depth without reducing website width. At the
  supported 640×480 minimum, the pane is 392px wide and the visible find
  capsule fits within 368px of it without touching the rail. The expanded
  Island footer has an accessible two-way vertical-tabs toggle, while the
  rail's unlabeled top bar contains a single accessible sidebar icon that turns
  vertical tabs off. The top bar and group labels use spacing instead of
  divider rules. `⌘⌥V` on macOS / `Ctrl+Alt+V` elsewhere toggles the layout
  from anywhere.
- The rail renders local tabs from the canonical tab order: ungrouped pins,
  then named groups (group pins first) and runs of ungrouped tabs in tab order,
  followed by the new-tab action. As in the island, each group is a tinted
  block and runs of ungrouped tabs are plain rows with no heading. Rows expose favicon and title plus active, loading, private, pinned,
  audible, and muted states. Directly hovering a genuinely truncated title
  starts a delayed, reduced-motion-aware reading pass to its hidden end;
  fully visible titles stay still and pointer exit restores the ellipsis.
  Group headers fold/unfold, including an explicit collapsed-active state.
  Remote-device tabs stay in the Quick Switcher and start page; they never
  become rail rows.
- Pointer actions switch, close, middle-click close, create a new tab, and
  fold/unfold groups. Drag reorder follows F3's rule: tabs may move between
  groups and the ungrouped places between them, never across the pinned boundary; a
  pin-crossing drop is rejected without changing order, membership or pinned
  state. Pin/unpin, mute/unmute, duplicate, and group membership editing
  remain available through the Island and native menus in the first rail
  release.
- A rail activation atomically dismisses any panel, palette, find capsule, or
  utility sheet, activates the requested tab at most once, and focuses its
  content — including when the row already represents the active tab. Primary
  row controls and their close actions are accessible siblings. Primary focus
  roves with Arrow keys and Home/End; Enter/Space activates; Escape returns
  focus to the active page.
- **Acceptance:** The desktop scenarios in
  [`acceptance/vertical-tabs.feature`](./acceptance/vertical-tabs.feature)
  verify the default, persistence, no-sync rule, constrained rail resizing and
  reset, non-destructive narrow-window cap, overflow-only title hover reading,
  no-reload layout switching,
  guest/sheet/panel/palette/find geometry (including 640×480), canonical row
  states and actions, group/private/loading/audio behavior, accepted and
  rejected reorder paths, activation cleanup/focus, and keyboard flow.

## F30 — Browser Favorites migration

- A fresh profile offers to bring Favorites across during first run, and the
  Favorites sheet keeps the same import available afterward. **Discovery is
  itself user-initiated:** Blanc never reads another browser's profile
  directory until the person asks it to look, so opening the Favorites sheet or
  reaching the first-run walkthrough's import step (F36) touches nothing on its
  own. The existing universal
  bookmarks-HTML import remains the fallback for browsers or platforms whose
  live profile format cannot be read directly.
- Desktop directly supports Google Chrome, Microsoft Edge, Brave, Chromium, and
  Vivaldi profiles. Discovery and file reads stay in the main process. Internal
  pages receive only an opaque source id plus browser/profile labels — never a
  filesystem path or raw profile data. A profile's Favorites are read from its
  local `Bookmarks` file and from `AccountBookmarks`, where recent Chrome keeps
  bookmarks saved to a signed-in Google Account; a profile with either file is
  offered, and one with both imports them together, skipping account entries
  whose URL the local file already has. The account file only ever adds: beside
  a readable `Bookmarks` file, one that is blocked, gone, too large, or
  malformed is left out, and the profile imports as it would without it.
- Import is explicit, add-only, and idempotent. Only `http:`/`https:` Favorites
  are accepted; immediate folder names and valid creation dates are preserved.
  Existing URLs win, duplicates in the source are skipped, and passwords,
  history, cookies, sessions, and browser settings are untouched.
- Input is bounded before and during parsing: a 20 MiB file cap, a 100,000-node
  traversal cap, and a depth cap, each applied to every file on its own. The selected opaque id is rediscovered and
  matched in main immediately before reading, so a renderer cannot substitute
  an arbitrary path.
- Source discovery diverges by platform (D22), but every implementation must
  keep imports user-initiated, data-scoped, deduplicated, and path-isolated.
- **Acceptance:** Import a detected profile containing nested folders,
  unsupported internal URLs, and existing Favorites. Blanc copies only the
  supported web Favorites, keeps their immediate folders, and a second import
  creates no duplicates.

## F31 — Quiet Tabs

- A tab nobody has looked at for a while may have its **renderer discarded** to
  give its memory back; the tab itself stays in the session, in the pill, in the
  rail, and in the switcher. Coming back to it rebuilds the page.
- The delay is a setting — **Quiet inactive tabs**: off / 30m / 1h / 6h,
  default 1h — plus a manual `/sleep` command that quiets every eligible
  background tab now. The command skips only the waiting; every safety exclusion
  below still applies, and it works while the setting is off. Turning the setting
  off stops *future* quieting: it never wakes an already-quiet tab and never
  discards its recovery data.
- **Never quieted:** the active tab; a tab playing, having played, or muted
  media; a pinned tab; a tab with unsaved input anywhere in its frame tree, or
  whose page objects to unloading; a tab whose last page came from a form
  submission or an error; a tab with a pending permission prompt; a tab in an
  opener/child family, including a popup window that is not a tab; a
  deep-scrolled page.
- **What coming back promises:** identity, title, address, and back-history
  return, and the page is **reloaded** — not resumed. Scroll and typed values
  return on ordinary static documents and are explicitly not promised on
  virtualized feeds (D23). A private tab comes back **where** it was, not **how**
  it was: private tabs retain no page state.
- **The state is dim-only on screen, and it is called "quiet"** everywhere a
  screen reader can meet it — the panel row and the vertical rail row each dim
  as one unit, restoring full strength on hover/focus (the row is about to
  wake), with `, quiet` in each accessible name. There is no per-row text
  marker, glyph, or pictogram: the word markers that used to ride beside
  `private` were removed 2026-08-18 (the repeated labels read as junk once a
  restore quiets most rows at once). The known cost — a fully-restored list
  dims uniformly and reads as ordinary styling until some tabs wake — is
  accepted: waking is transparent, so nothing is lost by not noticing. It is
  deliberately unmarked on the pill dots, in the Quick Switcher, in the native
  window menu, and on the start page.
- Restored sessions come back quiet: after a relaunch only the active tab loads
  (F18).
- The *behaviour* is D8; *who decides when* is D23.
- **Acceptance:** the scenarios in
  [`acceptance/quiet-tabs.feature`](./acceptance/quiet-tabs.feature) verify
  sleep/wake identity, the active tab never quieting, the exclusion outline,
  `/sleep` with the panel open, the quiet affordance and its accessible name, the
  settings outline including off, lazy restore, private sleep→wake isolation, no
  page state in `session.json` / the sync snapshot / `tabs:updated`, and a real
  drop in renderer-process count.

## F32 — Independent desktop windows

- Desktop may own multiple native browser windows. Each window has one stable
  workspace id and independently owns its tabs, groups, active selection,
  Island overlay, utility sheet, permission surface, focus state, and layout
  geometry. A command or IPC message originating in one window cannot mutate
  another window's workspace.
- **New Window** (`Cmd/Ctrl+N`) creates an ungrouped newtab in a fresh native
  window. Closing a secondary window destroys that workspace and its live web
  contents; it does not close or select tabs in another window. The primary
  macOS workspace retains the existing dock-reopen behavior. Windows and Linux
  have no Dock reopen, so closing the primary window while another window is
  open destroys it like a secondary. On Windows and Linux, closing the last
  open window quits Blanc, so that window keeps its saved tabs for the next
  launch exactly as Quit keeps them (F18).
- `session.json` persists all non-private window workspaces in its v2 `windows`
  array plus `activeWindowId`. The exact five-key flat mirror remains the
  rollback view of the focused window, so a 1.0.x writer can still take
  precedence without resurrecting stale secondary windows. Relaunch restores
  each workspace separately and fronts the previously focused one.
- Native multi-window support is a desktop window-model feature (D11); phone
  platforms are N/A, while a future tablet/foldable implementation may define
  its own windowing contract.
- **Acceptance:** the scenarios in
  [`acceptance/multi-window.feature`](./acceptance/multi-window.feature) verify
  independent ownership and removal on close, plus a real process relaunch that
  restores two workspaces without mixing their tabs.

## F33 — Local desktop profiles

- Desktop has one permanent **Personal** identity plus up to 15 named local
  profiles. Existing installs become Personal without moving or copying any
  shipped root file. Names are presentation; opaque ids own storage and session
  partitions.
- Named profiles isolate cookies/site storage, Favorites, history, download
  metadata, remembered permissions, normal tabs, and private tabs. Their normal
  Chromium partitions persist independently; each private partition is
  non-persistent and isolated from both Personal and other profiles.
- Settings, Supporter status, telemetry consent/install identity, app icon, and
  network/presentation preferences remain device-level. The existing Profile
  Sync account and remote-tab surface belong only to Personal; named-profile
  records and tabs never enter that consent boundary.
- Profiles are created/opened from Settings or the native Profiles menu. A
  named profile can be renamed inline. Permanent deletion requires typing its
  current name exactly, closes its windows, preserves downloaded files, removes
  its product records and Chromium storage, and removes its saved workspaces.
- Deletion is crash-resumable: a device-level marker is synchronously persisted
  before any window closes. While marked, the profile cannot open or restore;
  incomplete cleanup retries during the run and at the next launch.
- Local profiles rely on the desktop multi-window/session model and are N/A on
  the phone ports (D25).
- **Acceptance:** the scenarios in
  [`acceptance/local-profiles.feature`](./acceptance/local-profiles.feature)
  exercise Settings creation, per-profile Favorites, normal/private partition
  isolation, inline rename, exact confirmation, and deletion of windows,
  registry identity, and saved workspaces, plus a real relaunch that restores a
  space into the same isolated profile session.

## F34 — Glance reference pane

- Desktop can show one other tab from the same native workspace as a temporary
  **floating card** over the active page: a quick look at another page without
  leaving the one you're on. Side by side always means Split View (F53); Glance
  is the card. The card is large and centered below the Island at first (up to
  1,100 px or 80% of the page area wide), drawn like a Split View pane:
  rounded corners, a 1 px border (darker while it has focus) and a soft shadow.
  The page behind stays visible and usable: clicking or scrolling it never
  closes the card. (Design: `docs/superpowers/specs/2026-10-20-floating-glance-design.md`.)
- A person chooses the exact tab from a dedicated local-tab picker that excludes
  search, history, Favorites, commands, and remote tabs. The native View menu
  exposes **Open Glance… / Close Glance** with `Cmd/Ctrl+Shift+G`, so the
  feature is reachable on macOS, Windows, and Linux; `/glance` opens the same
  picker (the Change picker while Glance is open) and `/glance <text>` opens it
  filtered to the text; a link's context menu offers **Open Link in Glance**
  after **Open Link in New Tab**, with the same hand-off and forbidden-URL
  guards, opening the link in the opener's profile and private flag, ungrouped
  (F3). The picker is a dialog named by its heading; its rows share the ⌘L
  panel's vocabulary (quiet tabs dimmed with the word only in the accessible
  name, private tabs with the chip, a tooltip of title and host, names joined
  with commas), arrow keys move the highlight without re-announcing the count,
  and a chosen quiet tab's row says "Opening…" while it wakes.
- The card can be moved by dragging its header and resized from any edge or
  corner (never below 360 × 280, always inside the page area). The next Glance
  opens at the size and place the last card was left, remembered once per
  device as a share of the page area and never synced; double-clicking the
  header resets it. A focusable **Move or resize Glance** control moves the card
  with the arrow keys (16 px, 64 px with Shift), resizes it with Option/Alt and
  an arrow, resets it with Enter, and announces each change.
- The header carries the GLANCE label, the site (favicon and host, with the
  private chip for a private tab), **Back** and **Reload** / **Stop**,
  **Change**, **Open as tab**, **Keep as split** and **×**. As the card narrows
  the three actions become icons, then the GLANCE label hides, then the host;
  Back, Reload, × and the private chip never hide. Accessible names begin with
  the visible words, and right-clicking the header opens the Glance tab's menu.
- **Open as tab** (or choosing the Glance tab from the Island dots, ⌘1–9 or the
  ⌘L list) ends the Glance and makes its page the current tab; the page it
  floated over stays open as an ordinary tab. **Keep as split** turns the two
  pages into a fresh 50/50 Split View, main page first. Switching to any other
  tab closes the Glance; switching back doesn't bring it back. Closing the main
  page makes the Glance page the current tab.
- **Escape** closes the Glance only from the card's chrome (its header and
  controls); inside the Glance page Escape stays the site's. **×** and
  `Cmd/Ctrl+Shift+G` close it from anywhere. A closing card disappears at once.
- Browser commands follow the focused pane. With keyboard focus in the Glance
  page, Reload and Hard Reload, Close Tab, Find, zoom, Print, Back and Forward
  (`Cmd+[` / `]` on macOS, `Alt+Left` / `Right` on Windows and Linux), the
  1Password fill and its hint, and mouse gestures act on it; Close Tab there
  closes the Glance tab and the Glance ends. ⌘L and the Island, New Tab, ⌘1–9,
  the shield popover, the blocked count and the tab-scoped slash commands stay
  on the main page. Find and a 1Password message about the Glance page sit
  over the card; a 1Password message belongs to the pane it is about.
- A tab the Glance page opens in the foreground (`target=_blank`,
  `window.open`, Cmd/Ctrl+Shift-click) becomes the Glance; the previous one
  stays open as an ordinary tab and the main page is untouched. Background
  opens stay in the background.
- The card's chrome fades in (a 140 ms fade; none under Reduce Motion) and
  closes at once. The Island hides and reveals as usual under Auto-hide while a
  Glance is open, in either style. Glance never crosses window/profile
  ownership, never survives native-window teardown or session restore, and a
  visible Glance tab is never made quiet (F31).
- Glance is a desktop window-model capability (D11). Phone ports are N/A unless
  a future tablet/foldable contract defines a comparable multi-pane surface.
- **Acceptance:**
  [`acceptance/glance.feature`](./acceptance/glance.feature) opens a specific
  tab through the dedicated picker as a centered card over the whole main page
  (F34-2), keeps it on screen as the window changes (F34-3), moves, resizes and
  resets it and remembers where it was (F34-4, F34-5), closes it on a tab
  switch and opens it as the tab (F34-6 to F34-8, F34-15), saves a move and hides the card at once whichever way the Glance ends (F34-16), shows nothing of a window's first Glance until its card has drawn (F34-17), announces Open as tab and Keep as split once (F34-18), keeps the card still while a pushed Island slides in (F34-19), keeps Escape in the
  page and closes from the header (F34-9), leaves the page behind usable
  (F34-10), compacts the header and moves it from the keyboard (F34-11,
  F34-12), anchors find to the card (F34-13) and fades in and closes at once
  (F34-14). The F34-1 scenarios keep proving that reload, close, find, zoom,
  Back, the 1Password fill and gestures follow the focused pane, that
  foreground links from the Glance page open into Glance, that the header's
  Back, Reload and menu address it, that picker rows read like the panel's,
  and that `/glance` and **Open Link in Glance** reach the picker and the card.

## F35 — Start page layouts

- The start page offers four layouts: **ledger** (the original column),
  **billboard** (a live clock over locally ranked frequent-site tiles), **shelf** (a favorites grid
  whose column count follows the favorites so every row is full, with the
  group and blocked-count cards filling one row of the same grid), **tally**
  (favorites and groups beside a week-of-blocking bar chart, as two balanced
  columns that stack data-first on narrow windows). Ledger, shelf, and tally draw the Favorites feed. Billboard instead
  derives up to six hostname-level sites from the active local profile's
  on-device history, ranked by visit count with recency as the tie-breaker. A
  short site name labels each tile: the bounded local title's first segment
  when it is 20 characters or fewer, otherwise the domain's first label. The
  full title stays the tile's tooltip and accessible name. The row never
  wraps; the narrowest windows show the first four sites. A bounded
  profile-local cache reuses sanitized 32 px favicon pixels captured during
  normal visits;
  rendering the row never starts a favicon request. A
  hover/focus dismiss button stores only a bounded hostname list in that
  profile's `blanc://newtab` localStorage; it does not delete history, sync,
  emit telemetry, or contact a favicon service. Clearing history also clears
  its cached Billboard artwork. Private Billboard tabs receive
  no history-derived sites. All four re-ink under the light, dark, and private themes.
- All four start-page layouts use **Inter** for text that previously used the
  shared JetBrains Mono role, including the shared footer and onboarding. This
  override is local to the new-tab and standalone Mahjong documents; other
  internal pages and browser chrome retain their existing typography. The one
  deliberate exception is Mahjong's tile faces: character numerals and wind
  badge letters are game artwork and keep the bundled JetBrains Mono (at its
  ExtraBold weight), while the game's meters, sheets, and dock labels use
  Inter. Desktop
  acceptance exercises every layout at the default and minimum supported
  sizes and on both sides of its responsive breakpoints, with realistic long
  Billboard titles, and rejects horizontal overflow, unreachable text, or
  unintended clipping.
- The choice is a synced setting (`newtabLayout`, default `billboard`), changeable
  instantly from the start page's footer Customize popover and from Settings; a
  change made anywhere reaches every open start page. It travels with the
  profile the way the theme does.
- Every layout footer has a separate Mahjong link, beside the Customize
  button. It opens `blanc://mahjong/` in a new managed tab and leaves the
  start page and selected layout intact. Private tabs open
  `blanc://mahjong/?private=1` in the private session. Direct game URLs remain
  valid. A stored `newtabLayout: mahjong` migrates once to Billboard with a
  fresh Sync clock; later Mahjong values from old clients are rejected. Saved
  boards remain in local game storage and are offered by Mahjong's Continue
  prompt rather than opening automatically. Historical layout-use data remains.
- Mahjong uses quiet, locally synthesized cues for tile selection, matching,
  blocked moves, hints, undo, new deals, and wins. Its in-game sound control is
  on by default and persists only in the Mahjong page's `localStorage`; private
  tabs keep that preference ephemeral with the rest of their page storage.
- When F21 is enabled, the first real free-tile move in an app session reports
  the fixed `mahjong_play` metric, and every layout that actually renders reports
  its fixed `newtab_layout` value once that session. No game state is reported,
  and private tabs report neither metric.
- The tally chart tells the truth: every bar — today's included — is
  normalized to the busiest day, colour alone marks today, and a week that
  blocked nothing draws no bars. Its data is the blocker's per-day counts,
  tracked locally alongside the existing weekly total.
- No layout may ever scroll horizontally, at any window width; narrow windows
  compact insets, wrap rows, and stack the tally columns rather than overflow.
  At supported browser zoom levels, Mahjong's standalone controls and board
  remain reachable through vertical scrolling.
  Empty feeds remove their section — row, label, and card — except
  Favorites: ledger, shelf, and tally show "Favorite a page with ♥ to pin it
  here" when there are none. Billboard, which shows recent sites, shows no
  hint. Private start pages show no Patron pill and no blocked counts.
- Billboard centres whatever it shows (clock, blocked line, groups, recent
  sites) vertically between the window top and the footer; on a short window
  it stops just below the brand row rather than sliding under it.
- Non-Patron, non-private start pages show one "Become a Blanc Patron" pill
  at the end of the footer's left group, on every layout. The × at its end
  hides it on that device for 90 days, after which it returns.
- After first run, Personal non-private start pages show one moving-in
  checklist on ledger, billboard, shelf, and tally: a "Finish setup" pill in
  the footer's left group, after the version, whose popover opens upward with
  the full list and its 0/2 progress. Customize stays alone in the centre. Living in the footer, it never covers content, at
  any window size. It tracks the device-local, once-completed states of Sync
  and Bring Your Tabs. The × at the pill's end hides it permanently on that
  device. It retires after the pill briefly reads "All moved in", without
  opening the popover on its own. The standalone game omits it.
- **Acceptance:**
  [`acceptance/newtab-layouts.feature`](./acceptance/newtab-layouts.feature)
  renders the saved layout on a new tab, persists a footer switch, verifies
  Billboard's local frequency ranking and dismissal, and confirms that each
  footer opens a standalone, playable 144-tile Mahjong deal.

## F36 — First-run onboarding

- A genuinely fresh profile is offered a six-step walkthrough over the start
  page: default browser, import, the island, ad blocking, privacy, and theme.
  It appears exactly once — the completion marker is the same first-run record
  the privacy choices commit to, so skipping and finishing both seal it — and
  profiles that completed first run (including every pre-existing install) are
  never asked.
- The privacy step carries the mandatory consent choices (search suggestions,
  usage measurement); **no network feature they govern starts before the choices are
  saved**, skipping records exactly the values on screen, and the walkthrough
  closes only on a confirmed write. The import step embeds F30's migration
  with its explicit-discovery rule intact: no other browser's profile is read
  until the person asks to look, and the universal bookmarks-file import is
  offered from the start. The import step also offers **Bring your open tabs…**
  as a separate F40 handoff before or after F30 Favorites import. F40 does not
  depend on completing a Favorites import first.
- Ad-blocking and theme choices apply live during the flow through the same
  validated settings paths as Settings itself; the default-browser step uses
  the OS registration only where the platform genuinely supports it and
  renders inert where it cannot (unpackaged runs, Linux).
- The walkthrough is modal but honest: the page behind it is inert while it is
  open, motion respects `prefers-reduced-motion`, and the blocking-preparation
  surface keeps precedence when startup is unsettled. It can be replayed from
  Settings at any time; a replay shows the saved values, and edits re-save.
- **Acceptance:**
  [`acceptance/onboarding.feature`](./acceptance/onboarding.feature) shows the
  walkthrough to a fresh profile once, proves skip records the privacy
  choices, never re-asks a completed profile, and verifies the import step
  reads nothing before the explicit ask. F40's onboarding handoff is covered by
  [`acceptance/tab-migration.feature`](./acceptance/tab-migration.feature).

## F37 — The blank tab shows where to type

- A tab with nothing loaded presents its island as a place to enter text, not
  as a label naming the tab. The resting island carries a prompt in
  placeholder ink — visually distinct from the ink a loaded page's address is
  drawn in — so "this is where you type" and "this is where you are" are told
  apart without hovering, clicking, or prior instruction.
- Typing a printable character while a blank tab has focus begins entry: the
  island opens with that character already in it, so nothing typed is lost and
  the person never has to find the island first. Ordinary shortcuts,
  navigation keys, and text-entry modifier layers keep their meaning — an
  AltGr or Option character is text, not a command — and an open modal keeps
  its own keys.
- The island also advertises that it accepts commands, and the affordance that
  says so is itself the demonstration: invoking it opens the island on the
  command list rather than merely naming the character that would.
- Only the empty state changes. A tab showing a page keeps an island that
  states where it is, unchanged.
- **Acceptance:**
  [`acceptance/blank-tab-affordance.feature`](./acceptance/blank-tab-affordance.feature)
  shows the prompt and the commands affordance on a blank tab, proves that
  typing on a blank tab whose *page content* holds focus opens the island
  carrying that character, and that the commands affordance opens the command
  list.

## F38 — Fill a login from 1Password (desktop)

- On macOS, Windows, and Linux, Blanc can ask the user's installed 1Password app for Login items that
  match the active HTTP(S) page, then fill the selected item's built-in username
  and current-password fields. This is an explicit bridge to the user's existing
  1Password account, not a Blanc password store: Blanc cannot provide the
  feature without that account and app (D26).
- The integration is off by default, device-local, and never Profile Synced.
  It starts only from **View → Fill Login from 1Password**, the platform shortcut
  where one is safe, or `/1password`; there is no background lookup, automatic
  fill, save/update, password generation, TOTP, passkey, payment-card, bulk
  export, or service-account flow.
- Before asking 1Password for anything, Blanc must find a safe login target in
  the focused top-level document. It honors each saved website's
  `AnywhereOnWebsite`, `ExactDomain`, or `Never` behavior, keeps matching
  one-way from a saved parent site to its subdomains, and never guesses across
  sibling or parent domains. Signup/new-password, ambiguous, hidden, search,
  and newsletter fields fail closed; a heuristic current-password target needs
  an extra confirmation.
- If several Login items match, a native picker shows at most ten choices. The
  page never receives vault/item identifiers or candidate data. Only the chosen
  username/password may reach a dedicated isolated world, and only after the
  window, tab, navigation, URL, document, and exact DOM elements are
  revalidated. No credential is written to disk, sync, logs, telemetry, crash
  reports, or chrome-renderer IPC. The same explicit flow may be used in a
  private tab without changing private-history/session rules.
- **Acceptance:**
  [`acceptance/platform-services.feature`](./acceptance/platform-services.feature)
  verifies off-by-default behavior, saved-website policy, bounded selection,
  target-change cancellation, signup refusal, and absence of persistence or
  background access. A release additionally needs a signed packaged test with
  a real installed 1Password desktop app on each platform it ships on, and each
  platform's native smoke test must prove the broker loads the pinned SDK.

## F39 — Certificate safety

- Invalid certificates are rejected with a safety interstitial and certificate
  problem details.
- **Public sites:** no way past the warning is offered.
- **Local and private-network `https:` addresses** (loopback, RFC 1918,
  link-local, 100.64.0.0/10, IPv6 unique-local and link-local, single-label
  names, `.local`, `.lan`, `.internal`, `.home.arpa`): an **Advanced**
  disclosure offers **Continue to <host:port> (unsafe)** for an allowlisted set
  of certificate errors (untrusted issuer, name mismatch, local self-signed,
  date, weak signature, validity too long, non-unique name). Revoked and
  generic-invalid certificates, and hosts already verified as trusted during
  the current run, keep the hard stop.
- The choice lasts until the app quits, is never stored or synced, and applies
  only to that origin and that exact certificate while its validity status is
  unchanged. Private browsing keeps its own, separate choices.
- A page loaded after continuing reports **Not secure** until that document is
  replaced, even if the choice is later withdrawn; **Stop allowing** withdraws
  it.
- This does not reproduce Chromium's HSTS refusal: platforms that cannot read
  the engine's HSTS state must not claim it.
- **Acceptance:** [`acceptance/site-certificate-safety.feature`](./acceptance/site-certificate-safety.feature).

## F40 — Bring Your Tabs (direct open-tab migration)

PR #205 originally used F39 for migration. F40 resolves its collision with the
existing certificate-safety scenario; historical PR evidence retains its old IDs.

- A person explicitly chooses a supported Chromium-family browser profile.
  Blanc reads that profile's newest restorable open-tab session only after the
  selection; it does not use bookmarks or require source-browser preparation.
- The Tabs step preserves source-window/tab order, exact duplicates, pins, and
  named source groups. The renderer receives bounded titles, hostnames, opaque
  candidate IDs, source-window/group labels, and selection state—never full
  URLs or source filesystem paths. Inputs are bounded to 500 candidates.
- A normal source-browser quit is requested only when a read-only preflight
  proves a saved/restorable session exists. Blanc never force-quits or modifies
  the source profile, never promises automatic reopening, and never imports an
  older snapshot after post-quit verification fails.
- Eligible source groups seed editable Blanc Named Groups. Everything else
  remains ungrouped until the person creates, renames, or moves it; no bookmark
  folders, placeholder groups, cloud organizer, or hidden semantic-model promise
  participates in v1.
- Apply creates tabs/groups transactionally in preview order and never writes
  Favorites. Imported tabs are quiet and viewless; only the first selected tab
  wakes. Only after that successful apply does Blanc mark the device-local
  moving-in checklist task complete. Saving the result as a space (F41)
  remains a separate gesture. (F45 Arc Spaces import is the one exception: it
  creates spaces directly.)
- **Acceptance:**
  [`acceptance/tab-migration.feature`](./acceptance/tab-migration.feature)
  covers explicit session reads, quit safety, duplicate/order/group fidelity,
  opaque renderer projection, transactional apply, ownership/cancellation,
  onboarding, and the separate workspace handoff.

## F41 — Blanc Spaces (desktop)

- A **space** is a named, saved set of one window's tabs and groups in the
  current profile; a profile holds at most 25. Creating, saving, importing,
  switching, renaming, reordering and deleting spaces is free for everyone.
- Each space has a **colour** (any `#rrggbb`; eight presets) and one of
  sixteen **symbols**. Missing or invalid values get the first unused preset
  and symbol in list order, written once on load. The drawn ink is derived so
  the symbol and name reach 4.5:1 against every surface they sit on and their
  own wash, in light, dark and private; the stored hex is never changed.
- The Island shows the current space as a **mark** at its leading edge
  (symbol and name on its colour); a window in no space shows a quiet grey
  mark once any space exists; before the first space nothing is shown. The
  mark opens the **Spaces menu**, lined up under it and hanging just below the
  Island; the ⌘L footer's icon-only Spaces button opens the same menu below
  the Island (neither ever covers it), and the Quick Switcher matches space
  names.
- The menu edits in place (name validated as you type, preset and custom
  colours, symbols; changes apply live), deletes immediately with **Undo**
  (which also puts the window back in the space), reorders by drag or
  Option/Alt+↑/↓, and asks before a switch would close unsaved tabs, leading
  with saving them. Motion follows Reduce Motion (cross-fade only).
- Opening a space swaps it into the current window in place. While a window
  is in a space, its tab set autosaves into it; private tabs are never saved.
  A space is in at most one window at a time: opening one held by another
  window focuses that window.
- Switching away from a window whose ordinary tabs are in no space asks first:
  save them as a space, open the target in a new window, or close them and
  switch. Up to two recently left sets (16 live tabs) stay resident so
  switching back keeps their pages as they were.
- Deleted spaces stay in Recently deleted for 7 days, where they can be
  restored or forgotten.
- Entry points: the ⌘L panel footer's Spaces button, `/space` (alias
  `/workspace`), Bring Your Tabs (F40) and the Arc Spaces import (F45).
- Spaces are device-local and profile-scoped; they never sync.
- **Acceptance:**
  [`acceptance/F41-named-workspaces.feature`](./acceptance/F41-named-workspaces.feature)
  (`@workspace`, bound in `test/desktop/steps/named-workspaces.steps.js`,
  `test/desktop/steps/workspace-lifecycle.steps.js` and
  `test/desktop/steps/spaces-redesign.steps.js`);
  `test/unit/workspace*.test.js`, `test/unit/space*.test.js`.

## F42 — Dark websites

- When the person turns on **Dark websites** and Blanc is dark (the Dark
  theme, or System on a dark OS), Blanc darkens http(s) pages from their first
  paint using the pinned, unmodified Dark Reader engine. Sites that already
  honour `prefers-color-scheme: dark` stay dark rather than being inverted.
  Off by default; the setting and its site list are device-local and never
  Profile Synced.
- `/dark-site`, or the **Dark website** switch in the site's shield popover,
  flips the current site between darkened and as drawn, and turns the feature
  on if it was off. The switch shows the site's state while Blanc is dark, and
  says so while Blanc is light. In a private tab the choice lasts only until
  Blanc quits and is never written to settings; the site list is edited in
  Settings → General.
- The engine runs in its own isolated world: the page cannot see or call it,
  and the page's CSP cannot block its styles. That world's only capability is
  asking main for the text of a stylesheet; main fetches it only if the
  tab's blocker would allow it, and only public http(s) `text/css`, without
  cookies, redirects or private-network addresses, within size, time and rate
  limits.
- Internal `blanc://` pages, Blanc's chrome, extension pages and iframes are
  never darkened. Iframes are a known gap: Blanc runs session preloads only in
  main frames, as the capture indicator does.
- **Acceptance:**
  [`acceptance/settings-and-theming.feature`](./acceptance/settings-and-theming.feature)
  (`@F42`); `test/desktop/dark-websites-smoke.mjs` drives the shipping app.

## F44 — Interface language

**Contract.** Every Blanc-authored interface string comes from the shared
catalog (`copy/messages/`). Brand names, slash command names and macOS modifier
symbols are never translated. A missing translation falls back to English text,
never to a key. The user can use a supported language different from the OS
language. The interface language never changes the language signals websites
receive (`Accept-Language`, Chromium's in-page widgets).

**Desktop.** Settings → General → Language (System, then supported languages by
endonym); a change applies after a relaunch. Device-local, never Profile Synced.
A pinned language that is no longer available renders English and stays stored.

**Mobile.** The OS per-app language screen chooses the language (D27). Same
catalog, same fixed terms, same fallback, same selectable set.

**Acceptance.** `spec/acceptance/interface-language.feature` (F44-1 … F44-5).

## F45 — Arc Spaces import (desktop)

People leaving Arc can bring their Spaces into Blanc in one explicit step from
Bring Your Tabs.

- **Source.** Arc keeps every Space, its pinned and Today sections, folders,
  split views and top-row Favorites in `StorableSidebar.json`. Blanc reads it
  only after the person asks: Arc's own file on macOS and Windows, or a file
  they choose (the only path on Linux, where Arc never shipped). The read is
  bounded (32 MiB, 100,000 items, depth 32, 100 Spaces), read-only, refused
  if the file changes mid-read, and never asks Arc to quit.
- **Mapping.** Loose pinned tabs become pinned tabs; each top-level folder
  becomes a group named as the folder is (nested folders and split views fold into it);
  Today tabs follow ungrouped. Only http(s) tabs come across; notes, Easels
  and other kinds are counted and skipped. At most 500 tabs and 50 groups per
  Space; extra tabs are counted, never silently dropped.
- **Spaces.** Each selected Space becomes one Blanc space, for everyone, all
  in one durable write: every space or none. Names avoid this profile's
  existing spaces (`Name (Arc)`, `Name (Arc 2)`…); untitled Spaces become
  `Space N`. A selection that does not fit the free space slots (25 per
  profile) is refused before anything is written. Unlike F40, no window is
  switched: the new spaces wait in the list.
- **Favorites.** Arc's top-row Favorites can be added, add-only and
  deduplicated, to a Favorites folder named Arc.
- **Projection.** The page receives only Space names, counts, a
  separate-profile flag and opaque ids, never URLs, paths, Arc ids or Arc
  profile names, and closing the sheet drops what was read. Sign-ins,
  passwords, history and archived tabs stay in Arc.
- Every Space lands in the current Blanc profile; a Space that used its own
  Arc profile is marked because its sign-ins will differ.
- **Acceptance:**
  [`acceptance/arc-spaces-import.feature`](./acceptance/arc-spaces-import.feature)
  (`@F45`, bound in `test/desktop/steps/arc-import.steps.js`);
  `test/unit/arc-*.test.js` and `test/unit/tab-import-arc.test.js`.

## F46 — Custom tab names (desktop)

A person can give any tab a name of their own, or keep the page's title.

- **Rename.** The tab context menu's **Rename Tab…** opens the command bar
  with `/rename` and the tab's current label, the label selected, aimed at
  that tab. `/rename <name>` renames the active tab; `/rename` alone, or
  **Reset Tab Title** (shown only on a renamed tab), restores the page title.
- **The name.** Whitespace folds to single spaces, control characters are
  dropped, at most 100 characters; empty means the page title. Submitting an
  un-renamed tab's own page title, or an untouched rename prompt, does not
  rename it. `/ren Budget` works like `/rename Budget`; a bare `/ren` (or the
  command row clicked) asks for the name instead of running.
- **Lifetime.** The name stays through any navigation, quiet/wake, moves,
  relaunch, Blanc Spaces and Reopen Closed Tab; Duplicate Tab does not copy
  it. Private tabs can be renamed, in memory only.
- **Where it shows.** Every Blanc label for the tab (rows, rail, dots, Glance,
  Tabs and Dock menus, Recently Closed, other devices via Tab Sync). History
  and Favorites keep page titles; a renamed row's tooltip shows the page
  title, and the Quick Switcher matches both.
- **Acceptance:**
  [`acceptance/tabs-and-groups.feature`](./acceptance/tabs-and-groups.feature)
  (`@F46`, bound in `test/desktop/steps/custom-tab-names.steps.js`);
  `test/unit/tab-name.test.js` and `test/unit/tab-rename-main.test.js`.

## F47 — Bangs (desktop)

`!yt lofi` in the address bar searches YouTube directly, for every search
engine, without passing through it. Design:
`docs/superpowers/specs/2026-10-16-bangs-design.md`.

- **Typing.** A token `!code` (a letter or digit, then up to 31 letters,
  digits, hyphens or underscores) at the start or the end of the text is a
  bang; the first token wins. A known code puts a hint row at the top of the
  ⌘L list, *Search YouTube for "lofi"* (or *Open YouTube* for a bare code,
  which opens the site's home), over the Quick Switcher matches for the
  words; Enter opens the site's results. A known bang wins over every
  address rule in both the overlay and main. An unknown code searches the
  text as typed with the usual engine.
- **The picker.** `!` alone lists recently used bangs, then a fixed popular
  set, under foldable headers; more letters filter the whole catalog by code
  (shorter first) and site name, at most eight rows, the person's own bangs
  first. Choosing a row fills `!code ` into the input.
- **The list.** Kagi's open bang list (`bangs/sources/bangs.json`, MIT),
  pinned by commit and hash and compiled into
  `src/renderer/pages/bangs-catalog.js` by `bangs/build.mjs`; updating it is
  a reviewed release input like the blocklists. Codes with a `.` and
  templates that are not `https://` are dropped at build.
- **Your bangs.** Settings → General: a switch (on by default, synced) and a
  list of the person's own bangs (code, name, address with `%s`; synced as
  one value, last writer wins). A custom code shadows a built-in code or
  alias.
- **Privacy.** A bang request goes only to the bang's site; nothing is sent
  to Kagi. No search-suggestion request is made for bang-shaped text, known
  or not, on or off, in the overlay or at main's boundary. Recently used
  codes are device-local, never recorded from private tabs, and cleared
  with history.
- **Icons** (design `docs/superpowers/specs/2026-10-17-bang-icons-in-app-design.md`).
  Each hint and picker row leads with the site's icon: first one the device
  already holds from the person's own visits (history, Favorites, an open
  tab), then a copy kept from Blanc's icon server
  (`blanc.day/bang-icons/<host>`), else that server is asked, only for rows
  on screen for 300 ms and only for hosts in the bundled catalog. Never from
  a private tab, for a custom bang's host, with bangs off, or before the
  first-run privacy choices are saved. A 404 means no icon (the site's
  letter shows) until the next launch; a failure may retry twice, 30 s
  apart; a kept copy is asked for again after 30 days and dropped on a 404.
  Copies are 32px PNGs kept per device (at most 300, least recently used
  dropped), never synced, and cleared with recent bangs, which also
  withdraws the icons the open command bars hold.
- **Portability.** `src/renderer/pages/bangs.js` (the parser, resolver and
  matcher) and the generated catalog have no Electron, Node or DOM
  dependency, so another browser core takes them unchanged.
- **Acceptance:**
  [`acceptance/island-and-commands.feature`](./acceptance/island-and-commands.feature)
  (`@F47`, bound in `test/desktop/steps/bangs.steps.js`);
  `test/unit/bangs.test.js`, `bangs-build.test.js`, `bangs-settings.test.js`,
  `bang-resolution.test.js`, `bangs-overlay.test.js`, `bang-icons-policy.test.js`,
  `bang-icons.test.js` and `bang-icons-main.test.js`.

## F48 — Pinned homes (desktop)

A pinned tab remembers the page where it was pinned as its home, matching the
bounded Zen/Arc behavior described in the design spec without turning pins into
shared bookmarks or resetting them on every selection.

- **During a session.** Browsing away keeps the tab's ordinary history and its
  current page. Switching tabs, windows, or Spaces does not reset it.
- **On a clean launch.** The tab opens its pinned home. Crash recovery restores
  the last page instead, so recovering work remains the priority.
- **Deliberate changes.** Unpinning clears the home; pinning again records the
  current page. A pinned tab's context menu offers **Back to Pinned Page**
  and **Replace Pinned Page with Current** when each action is applicable.
- **Lifetime and privacy.** The home stays with Duplicate, Reopen Closed Tab,
  window moves, Spaces and history clearing. Private tabs may use it only in
  memory. Tab Sync never receives it.
- **Acceptance:**
  [`acceptance/tabs-and-groups.feature`](./acceptance/tabs-and-groups.feature)
  (`@F48`, bound in `test/desktop/steps/pinned-home.steps.js`), plus
  `test/desktop/pinned-home-recovery-smoke.mjs` and
  `test/unit/pinned-home*.test.js`.

## F49 — Start Page wallpaper image (desktop)

The Start Page can show the person's own picture instead of the bundled
Sunrise artwork. F35's Customize popover offers a Wallpaper choice,
**Sunrise** or **Your image**, and shows only the chosen wallpaper's options:
"Change with time of day" under Sunrise; Change, Remove, Wash and Fade under
your image, so the clock switch never seems to apply to a photo. Settings →
General → Start Page image offers the same.

- **Sources.** Three choices: Sunrise, time of day (the synced
  `newtabDynamicWallpaper`), and **Your image** (device-local
  `newtabCustomWallpaper`). Choosing your image leaves the synced time-of-day
  choice alone, so other devices keep what they show; a device without an
  image draws the bundled artwork that choice selects.
- **The image.** JPEG or PNG up to 25 MB. It is decoded, fitted inside 3840 px
  and re-encoded, so the stored copy keeps no location, camera or time
  metadata. Only the EXIF orientation is written back, so phone photos stay
  upright. It lives in this device's data folder (owner-only), never in
  settings and never in Profile Sync. Remove deletes it.
- **Private tabs.** A private Start Page never shows or offers it.
- **Legibility.** The image is cropped to fill and centred under an even
  theme wash. A **Fade** slider (device-local `newtabWallpaperWash`, 0–100,
  default 100) lets the person trade that wash for more of the picture. A
  **Wash** choice (device-local `newtabWallpaperStyle`) sets its kind: Auto
  follows the app theme; Light and Dark force that wash and switch the page's
  text and surfaces to match, whatever the theme; Spotlight follows the theme
  but washes only behind the content and header, leaving the image's edges
  bare. The footer always keeps its fog and ink.
- **Serving.** The page receives an address with a random per-launch name
  (`blanc://newtab/user-wallpaper-<token>.jpg`), answered from that file
  alone, so no website can embed it by guessing. In a Chromium port, this
  becomes a WebUI data-source path, and the policy module moves unchanged.
- **Portability.** `src/main/wallpaper-model.js` (source choice, size and
  record rules, the orientation reader and writer) has no Electron
  dependency; `src/main/wallpaper.js` is the Electron adapter.
- **Acceptance:** `test/desktop/custom-wallpaper-smoke.mjs`,
  `test/unit/wallpaper-model.test.js` and `test/unit/newtab-wallpaper.test.js`.

## F50 — Start Page color wallpaper (desktop)

F49's Wallpaper choice gains a third option, **Color**, between Sunrise and
Your image. It paints the Start Page with one of the eight Spaces presets
(Sage, Sky, Iris, Rose, Clay, Sand, Slate, Graphite) instead of artwork.

- **Fill.** Soft tints the theme's own background and keeps its text; Solid
  is the color exactly; Gradient runs from a lighter glow to a deeper corner
  of it. Solid and Gradient switch the page to the text set that suits the
  color and use its ink (white for every preset). Every stop keeps that ink
  and its quieter dim tone at 4.5:1 or better, and Soft keeps the theme's dim
  text at 4.5:1.
- **Match each space's color.** While Color shows, a window in a Blanc Space
  draws that Space's color with the chosen fill, live as the Space is saved or
  recolored. The swatches then apply only outside Spaces. The page receives
  the color alone, never the Space's name or id.
- **Sync.** The choice, the preset, the fill and the switch are synced
  (`newtabColorWallpaper`, `newtabWallpaperColor`, `newtabWallpaperFill`,
  `newtabFollowSpaceColor`). This device's own image (F49) still wins on this
  device. Older builds ignore these keys and show Sunrise or time of day.
- **Private tabs** never show a color.
- **Portability.** `src/main/start-page-paint.js` (the stops, inks and soft
  tints, with no Electron dependency) decides every color; the page applies
  the finished values.
- **Acceptance:** `test/desktop/custom-wallpaper-smoke.mjs`,
  `test/unit/start-page-paint.test.js` and `test/unit/wallpaper-model.test.js`.

## F51 — What's New page (desktop)

After an update that adds features, Blanc opens that release's highlights page
on blanc.day once, in the style of Chrome's What's New tab. The Start Page's
What's new pill links to the same page. The changelog keeps the full detail
(`docs/superpowers/specs/2026-10-19-whats-new-page-design.md`).

- **When it opens.** The first launch after an update that changes
  `major.minor` (1.38.x → 1.39.0), once, as an ordinary active tab beside the
  restored tabs. Never after a bug-fix update, a fresh install, a pre-release
  or a downgrade, never as a private tab, and never in a renamed build.
- **Only when the page exists.** Main first sends one `HEAD` for
  `https://blanc.day/whats-new/<major>.<minor>` (no cookies, no redirects,
  5 s timeout; only a 200 counts), at most once per launch while the pill's
  7-day window is open. No page yet (the site deploy trails the release, or the
  release has none) means no tab and a changelog link on the pill; a later
  launch in the window tries again. With no window to take it, the tab stays
  owed.
- **The page.** One highlight at a time (headline, short text, steps,
  Learn more and Next, with a capture, clip or site demo), colored tiles in the
  Spaces palette, and a link to the changelog. It runs no analytics. Every page
  needs the owner's sign-off before it deploys.
- **State.** `whatsNewPageVersion` and `whatsNewTabRelease` are device-local
  settings, never synced.
- **Portability.** `src/main/whats-new.js` holds every decision without an
  Electron dependency; `src/main/whats-new-check.js` is the request.
- **Acceptance:** `test/unit/whats-new.test.js`,
  `test/unit/whats-new-check.test.js`, `test/unit/whats-new-settings.test.js`,
  `test/unit/whats-new-site-data.test.js` and `test/site/whats-new-page.test.mjs`.

## F52 — Tab Archive (desktop)

Blanc can close loose tabs nobody has looked at in a while and keep them in a
searchable Archive, in the style of Arc's archived Today tabs
(`docs/superpowers/specs/2026-10-19-tab-archive-design.md`).

- **Setting.** `tabArchive` (`off|12h|1d|7d|30d`), default `off`,
  device-local and never synced. An update never turns it on.
- **What can be archived.** Only ungrouped, unpinned, non-private tabs that
  are not active, not in Glance, not playing or capturing media, not waiting
  on a permission prompt, not a popup's opener, not loading, and holding no
  unsaved form work, after the chosen time without being viewed. An idle blank
  new tab is closed without an entry.
- **Idle clock.** `lastViewedAt` is stamped when a tab is viewed and saved in
  session meta, so idle time counts across relaunches. Nothing is archived for
  10 minutes after launch, resume or a change to the setting, and at most 20
  tabs per window per 30-second sweep.
- **The Archive.** One per local profile (`archive.json`), holding only URL,
  title, icon, custom name, timestamps and the Space name; never page state,
  back history or openers. Entries expire after 30 days, at most 500 per
  profile. Clearing history clears it. Archiving never adds a Recently closed
  entry.
- **Restore.** From the ⌘L Quick Switcher (rows marked Archived) or the
  History sheet's Archived view (`/archive`): a new ungrouped tab at the end of
  the window, loaded fresh, with its custom name.
- **Portability.** `src/main/tab-archive.js` holds every decision without an
  Electron dependency.
- **Acceptance:** `spec/acceptance/tab-archive.feature`,
  `test/unit/tab-archive.test.js`.

## F53 — Split View (desktop)

Two to four ordinary tabs in one window shown side by side, kept as one item
that survives relaunch and Spaces (spec
`docs/superpowers/specs/2026-10-19-split-view-design.md`). Glance is the first
step: **Keep as split** in its header turns the current Glance into a split.

- **Making one.** Keep as split (from Glance), or a tab's **Split with ▸**
  menu. Pinned tabs never join a split. The initiating tab's group wins: every
  other tab moves into it, or out of its group (D1).
- **Layout.** Two or three columns; four panes are a 2×2 grid with one shared
  cross. Narrow windows fall back in a fixed order (rows, then focus only;
  for four panes, four columns first). Fallbacks are never saved (D3).
- **Chrome.** One Island, centred in the strip, always addresses the focused
  pane, which is the window's active tab. Every pane has a header band at its
  top, painted by the chrome document in space reserved between page views
  (D5). Pane focus cycles with `Cmd+Option+]` / `[` on macOS and
  `Ctrl+Alt+]` / `[` on Windows and Linux (D6).
- **In the tab list.** One row per split in the ⌘L panel and the rail; its
  tabs stay real tabs. ⌘1–9 count a split once (D4).
- **Leaving.** Remove from Split lands the tab directly below the split's row
  (D8); a split left with one tab dissolves. Pinning a split tab removes it
  first (D7). Close Split is one Recently closed entry that reopens it whole.
- **Persistence.** Saved in `session.json` v2 windows and in Spaces
  (`splits`, `splitIds`), never in the flat rollback mirror, never synced.
  Private tabs are never saved; a split with fewer than two saved tabs is
  written as plain tabs (D2).
- **Other features.** Visible panes never go quiet; split tabs are never
  archived (F52); Glance is unavailable while a split shows.
- **Portability.** `src/main/split-model.js` and `src/main/split-layout.js`
  hold every decision without an Electron dependency. A desktop window-model
  capability (D11); phones are N/A.
- **Acceptance:** `spec/acceptance/split-view.feature`,
  `test/unit/split-model.test.js`, `test/unit/split-layout.test.js`.
