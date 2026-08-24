# Parity Matrix

The dashboard. One row per feature (`F#`), one column per platform, plus the
**parity contract** (what must be identical regardless of implementation) and any
**divergence** (`D#`) that applies.

Status values: `SHIPPED` · `PARTIAL` · `PLANNED` · `DIVERGENT (D#)` · `N/A`.
See [`README.md`](./README.md#status-legend) for meanings.

> Desktop is the reference implementation; newly specified work may remain
> `PARTIAL` or `PLANNED` until its acceptance gate passes. iOS/Android are still
> mostly greenfield, so the live content of this table today is chiefly the
> **Parity contract** and **Divergence** columns.

| ID | Feature | Desktop | iOS | Android | Parity contract (must be identical) | Divergence |
|----|---------|---------|-----|---------|-------------------------------------|------------|
| F1 | Island chrome (pill + command bar) | SHIPPED | PARTIAL | PLANNED | Resting pill shows back/forward (desktop; mobile uses edge-swipe per D7), active group's dots (cap 8 + `+N`; pointer platforms reveal a dot's favicon on hover/focus), favicon, domain, shield count (clickable → site-protection popover on desktop), private chip, action cluster. Expanded states: panel / palette / find. | D7, D11, D15 |
| F2 | Tabs (create/close/switch/reopen/duplicate/pin/mute) | SHIPPED | PARTIAL | PLANNED | Same lifecycle + same reopen-closed and pin/mute semantics. Desktop recovery is scoped to the native workspace that closed the tab (D11). Pins remain in their current group and lead it; ungrouped pins use a standalone shelf. Plain new tab is always ungrouped. An inactive tab may have its renderer discarded and rebuilt (D8, F31) without losing identity, title, address, or back-history. | D8, D11 |
| F3 | Tab groups | SHIPPED | PLANNED | PLANNED | Names not colors (lowercase mono). Group exists only while non-empty. Pill renders only the active group, including its pins. Same create/move/ungroup/close-group actions. | — |
| F4 | Private tabs | SHIPPED | PLANNED | PLANNED | Never in history/session/reopen; inherited by child tabs; isolated non-persistent web session; private theme + quick-exit chip. | — |
| F5 | Address input & search | SHIPPED | PARTIAL | PLANNED | Same normalization heuristic + engine choice (DuckDuckGo/Google/Bing/Brave). Best-effort autocomplete follows the current default; opt-out, private tabs, pasted/dropped text, local paths, URL-like input, and credential-like prefixes stay local. OS hand-off for `mailto:`/`tel:`/etc. | D4, D20 |
| F6 | Command palette & Quick Switcher | SHIPPED | PARTIAL | PLANNED | ⌘L-equivalent summons it; loose/in-order match across tabs, favorites, history, group names; groups ranked above tabs. | D7 |
| F7 | Slash commands | SHIPPED | PARTIAL | PLANNED | The full command set (see F7 in features.md) with identical names + hints. | D7 |
| F8 | Find in page | SHIPPED | PLANNED | PLANNED | Capsule over content, match nav, page stays interactive. | — |
| F9 | Favorites | SHIPPED | PLANNED | PLANNED | Heart toggle, "Add all open tabs", favorites page + newtab favorites. Internal id stays `bookmarks`. | — |
| F10 | History | SHIPPED | PLANNED | PLANNED | Per-visit record + title update, capped 5000, clearable, excluded for private tabs. | — |
| F11 | Downloads | SHIPPED | PLANNED | PLANNED | Downloads list UI + progress, capped 200. | D3 |
| F12 | Ad/tracker blocking | SHIPPED | PARTIAL | PLANNED | Ads/trackers blocked by default; per-tab shield count; per-site allow and re-block from the same command; shield chip opens a site-protection popover (desktop); global toggle. Filter data shared. | D1, D2, D13, D14 |
| F13 | Permissions | SHIPPED | PLANNED | PLANNED | Explicit per-permission prompts with the same policy/copy. | — |
| F14 | Settings | SHIPPED | PARTIAL | PLANNED | Same keys, defaults, and validation (search engine, device-local `searchSuggestions`, adblock, home page, theme, app icon, exceptions, usage ping, supporter). | D5, D6 |
| F15 | Theming | SHIPPED | SHIPPED | PLANNED | system/light/dark + private scope; propagates to chrome, internal pages, web content live, no restart. | — |
| F16 | Internal `blanc://` pages | SHIPPED | PARTIAL | PLANNED | newtab ledger, favorites, history, downloads, settings, shortcuts, error, auth — same content/copy; utility pages present as a transient chrome surface (desktop: sheet), never tabs. | — |
| F17 | Supporter & app icons | SHIPPED | PLANNED | PLANNED | 8 free + 3 supporter colorways; supporter unlock is trusted-forever, offline-OK, cosmetic-only. | D5, D6 |
| F18 | Session persistence & restore | SHIPPED | PARTIAL | PLANNED | Restore tabs + groups; private tabs excluded; same `session.json` shape (adapted per platform store). Plus an optional per-tab title/favicon `meta` column so restored tabs are scannable before they load. | D8 |
| F19 | Context menu (link/page actions) | SHIPPED | PLANNED | PLANNED | Same actions (open in new/background tab, copy link, etc.); OS hand-off honored. | D4, D7, D20 |
| F20 | Basic-auth dialog | SHIPPED | PLANNED | PLANNED | Same modal auth prompt behaviour. | — |
| F21 | Telemetry (usage ping) | SHIPPED | PLANNED | PLANNED | A fresh profile must commit its on/off choice before any ping; the choice is presented on by default and remains device-local. When enabled, packaged builds send one fire-and-forget launch ping with `{installId,sessionId,version,platform,arch,osVersion}` and no browsing data. | — |
| F22 | Distribution & updates | SHIPPED | N/A | N/A | User gets updates; no in-app updater fighting the OS store. | D9 |
| F23 | Zoom / page scaling | SHIPPED | DIVERGENT (D10) | DIVERGENT (D10) | Page can be scaled; desktop discrete zoom vs mobile pinch/native reflow. | D10 |
| F24 | Password AutoFill / passkeys | N/A | PLANNED | PLANNED | On mobile, native credential provider + platform passkeys work in-webview. | D12 |
| F27 | Tab Sync (other-device tab list) | SHIPPED | PLANNED | PLANNED | Per-device opt-in, off by default, publish-only gating; read-only browsing in panel/switcher/start page; http(s)-only bounded snapshots plus a separately-budgeted E2EE icon sidecar; retraction + 30-day prune + 24 h heartbeat. Optional favicons are inert bounded PNG bytes—never remote URLs loaded by a receiving device. | — |
| F28 | Vertical tabs | SHIPPED | DIVERGENT (D19) | DIVERGENT (D19) | The logical tabs/groups and their identity, lifecycle, private/media state, and organization remain available. Desktop may present them in an optional persistent rail without replacing the Island or reloading content; mobile uses its native tab overview. | D19 |
| F30 | Browser Favorites migration | SHIPPED | PLANNED | PLANNED | Explicit, bounded, add-only import of supported web Favorites; folders preserved where available, retries deduplicated, and no implicit import of passwords/history/cookies/sessions. | D22 |
| F31 | Quiet Tabs (idle renderer discard) | SHIPPED | PLANNED | PLANNED | An idle background tab may have its renderer discarded and rebuilt on return with identity, title, address, and back-history intact; the page is reloaded, never resumed. Never applied to the active tab, media-bearing or muted tabs, pins, unsaved input, non-refetchable commits, pending permission prompts, opener families, or deep-scrolled pages. Restored sessions come back quiet. The state is called "quiet" in every user-visible and assistive string. | D8, D23 |
| F32 | Independent desktop windows | SHIPPED | N/A | N/A | Each desktop native window owns an isolated tab/group/surface workspace; close removes only that secondary workspace, and relaunch restores all persisted windows without mixing tabs. | D11 |
| F33 | Local desktop profiles | SHIPPED | N/A | N/A | Personal retains every existing root record; each named desktop profile isolates site storage, Favorites/history/download metadata/permissions, normal browsing, and private browsing. Device settings stay shared and Profile Sync remains Personal-only. | D25 |
| F34 | Glance reference pane | SHIPPED | N/A | N/A | A desktop window can show one explicitly chosen local tab as a temporary, resizable reference pane; promotion swaps main/reference roles, dismissal leaves the tab open, and ownership never crosses a window or profile. | D11 |
| F35 | Start page layouts | SHIPPED | PLANNED | PLANNED | Four arrangements of the same start-page material (ledger/billboard/shelf/tally), chosen by a synced setting with an in-page switcher; per-day blocked counts feed the tally chart; no horizontal overflow at any width. | — |
| F36 | First-run onboarding | SHIPPED | PLANNED | PLANNED | A six-step walkthrough shown once to fresh profiles (default browser, import, island, blocking, privacy, theme); privacy consent gates its network features, import keeps F30's explicit discovery, and both successful-import and skip paths can hand off to F39 without making full import a prerequisite. Replayable from Settings. Default-browser registration and live profile import are desktop surfaces (D22). | D22 |
| F37 | Blank tab shows where to type | SHIPPED | PLANNED | PLANNED | A blank tab's island reads as a text field (prompt in placeholder ink, plus a commands affordance that opens the command list) and typing on the blank tab begins entry in the island. The *contract* is product-level and portable; its desktop expression — a caret, a `/` chip, and a hardware-keyboard type-to-open path — is not. Mobile satisfies it with a tap target and the platform keyboard; there is no physical-keyboard gate to port. | — |
| F39 | Bring Your Tabs (direct open-tab migration) | PLANNED | PLANNED | PLANNED | A selected Chromium-family profile's newest verified restorable open-tab session becomes reviewed, ordered quiet tabs and editable Named Groups. Duplicate tabs, pins, source windows, and eligible named source groups are preserved; Favorites remain separate. Any quit request is normal, user-initiated, and gated by recoverability preflight plus exact newest-session verification. | D22 |

## Notes on the "mobile-only wins"

Two rows invert the usual desktop-leads pattern:

- **F24 (AutoFill/passkeys)** is `N/A` on desktop (blocked by vendor code-signature
  allowlists — see `CLAUDE.md`) but achievable on mobile via the system credential
  provider inside `WKWebView`/Android `WebView`. This is a feature mobile *gains*.
- **F12 blocking** is the differentiator that is *strongest on Android* (programmatic
  interception, like desktop) and *weakest on iOS* (declarative, capped). Keep the
  Android backend powerful; do not flatten it to the iOS ceiling for symmetry — see
  D1.
