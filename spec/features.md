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
  gestures per D7), the *active group's* tab dots (capped at 8, with a quiet `+N`
  that opens the panel; on a pointer platform, hovering/focusing a dot reveals
  that tab's favicon so it can be identified before switching), favicon,
  domain, shield count (F12), a private chip when private (F4), and a trailing
  action cluster (reload / favorite / close tab / downloads). The resting pill
  carries **no group name** — group identity is conveyed by the dots (which
  render the active group only) and named in full in the panel (F3). In
  desktop vertical mode (F28/D19), the rail becomes the persistent tab
  presentation and the resting pill omits only its redundant tab dots.
- **Expanded states** (one at a time): `panel` (command bar expanded in place),
  `palette` (same panel summoned by the ⌘L-equivalent, floated over a scrim),
  `find` (F8). Only the active state shows; Escape/back dismisses.
- The panel's list area shows: the **tab switcher** at rest, **slash commands**
  (F7) when input starts with `/`, the **Quick Switcher** (F6) otherwise.
- **Platform note:** desktop draws this as a 64px strip + an always-on-top overlay
  view. Mobile renders it natively (SwiftUI / Compose) driven by shared design
  tokens (→ substrate). The *layout, contents, and states* are the contract; the
  windowing is D11, the input affordances are D7.
- **Acceptance:** With 3 tabs in a group named `work` and 2 trackers blocked on the
  active page, the pill shows the platform back/forward affordance (buttons on
  desktop, edge-swipe gesture on mobile per D7), 3 dots, the domain, a shield
  count of 2, and the action cluster — and not the name `work`. Summoning the
  palette floats the command bar with the tab switcher listed.

## F2 — Tabs

- Create, close, switch, **reopen-closed**, **duplicate**, **pin/unpin**,
  **mute/unmute**. A plain new tab (F7 `/new`, panel row, new-tab shortcut) always
  opens **ungrouped** and to the newtab page (F16), regardless of the active tab's
  group.
- `window.open` / context-menu children **inherit the opener's group** (F3) and
  privacy (F4).
- Switching tabs never loses an inactive tab's identity. On every platform an
  inactive tab may have its renderer discarded to reclaim memory — on desktop
  deliberately, after an idle delay the person controls (F31); on mobile because
  the OS evicts it (D8) — and it returns with its identity, title, address, and
  back-history intact.
- On desktop, reopen-closed history is scoped to the native window workspace
  that closed the tab (D11). Reopening in one window can never consume another
  window's recovery entry.
- **Acceptance:** Open a tab, close it, reopen-closed → same URL returns. Duplicate
  a tab → a second tab with the same URL. Pin a tab → it is marked pinned and
  ordered ahead of unpinned tabs in its current group. An ungrouped pin uses the
  standalone pinned section; pinning never changes group membership.

## F3 — Tab groups

- Groups have **names, not colors** — lowercase mono labels. A group exists only
  while it holds ≥1 tab (auto-pruned when empty).
- Create/join via `/group <name>` (find-or-create) or an inline picker on the
  tab row; leave via `/ungroup`; close all via `/close-group`.
- The **pill renders only the active tab's group** as dots + name. A group's
  pinned tabs stay inside it and lead its rows/dots; only ungrouped pins use the
  standalone pinned section. Other groups live in the palette panel (per-group
  headers, foldable; collapsed group shows an "N tabs tucked away" row).
- The Quick Switcher (F6) matches group names, ranked above tabs; picking a group
  focuses it (unfolding if collapsed). The nth-cluster shortcut (D7) focuses the
  nth *group's* first tab when groups exist.
- New **private** tabs are never grouped.
- **Acceptance:** `/group work` on the active tab creates `work` and moves the tab
  in. Open a second group `play`; the pill shows only the active group. Collapse
  `work` → its tabs show as "N tabs tucked away" in the panel. Delete the last tab
  in `play` → `play` disappears.

## F4 — Private tabs

- Opened via `/private` or the new-private-tab shortcut, to the private newtab
  page. Marked `private` on the tab model.
- **Never** recorded to history (F10), **excluded** from session persistence (F18)
  and reopen-closed (F2). Children (`window.open`, context menu) inherit privacy.
- Private tabs share a dedicated **non-persistent web session** with one another,
  isolated from normal tabs. Cookies, storage, cache, service workers, HTTP auth,
  and permission decisions remain memory-only and disappear when Blanc quits.
- While the active tab is private, chrome uses the **private theme** (F15): dashed
  pill border, hollow dots, and a "private" chip that closes the tab (quick exit).
- Shield counts and downloads behave normally. Existing Favorites can be
  opened in private tabs, but Blanc does not add Favorites from private
  browsing because that would create a persistent record.
- On desktop, device-bound passkeys follow the session split: private tabs can't
  see the normal profile's passkeys, and passkeys *created* in a private tab are
  **ephemeral** — unusable after Blanc quits (D16).
- **Acceptance:** Open a private tab, visit a site → it does not appear in history
  or share normal-session site data; closing and reopen-closed does not bring it
  back; the pill shows the private chip and dashed styling.

## F5 — Address input & search

- One input normalizes typed text (`normalizeAddressInput` heuristic): has-a-scheme
  → navigate; looks-like-localhost/domain → navigate; else → search query against
  the selected engine.
- **Search engines:** `duckduckgo` (default), `google`, `bing`, `brave`. → substrate
  (engine table).
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
- The heuristic's known edge-case misclassifications (e.g. dotted query strings)
  are an **accepted limitation**, identical on every platform — do not "fix" one
  platform's parser to be smarter than the others.
- **Acceptance:** Typing `example.com` navigates; typing `how tall is everest`
  searches via the configured engine; typing `mailto:a@b.com` hands off to the OS
  mail handler.

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
`/1password` is the one platform-specific entry and appears only on macOS (D26):

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
| `/1password` | Fill a login from 1Password (macOS only) |
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
| `searchEngine` | `duckduckgo` | one of duckduckgo/google/bing/brave |
| `searchSuggestions` | `true` | boolean; device-local, never synced, private tabs override off |
| `adblockEnabled` | `true` | boolean |
| `homePage` | `""` | empty = `blanc://newtab`; else a URL |
| `theme` | `system` | system/light/dark |
| `tabLayout` | `island` | desktop-only `island`/`vertical`; device-local, never synced (F28/D19) |
| `verticalTabsWidth` | `248` | desktop-only preferred rail width, clamped to 200–360px; device-local, never synced (F28/D19) |
| `appIcon` | `paper` | a free icon id, or a supporter id **iff** supporter active |
| `adblockExceptions` | `[]` | lowercased hostnames, no scheme/path/`www.` |
| `onePasswordEnabled` | `false` | desktop-only boolean; device-local, never synced (F38/D26) |
| `onePasswordAccount` | `""` | desktop-only account name/id, trimmed and capped at 200 characters; device-local, never synced (F38/D26) |
| `usagePing` | `true` | boolean (F21) |
| `supporter` | `null` | written only by the activation flow, never generic writes (F17) |

- `appIcon` is **sanitized on read** the same way it is validated on write: a
  stale/unlicensed supporter id reads back as the default. This predicate
  (`isAppIconAllowed`) is shared logic.
- **Acceptance:** Setting an invalid search engine is rejected; setting a supporter
  icon without an active license reads back as `paper`; adding `WWW.Example.com/x`
  to exceptions stores `example.com`.

## F15 — Theming

- Tokens in a root scope + a dark override + an explicit **private** scope. Driven
  by `theme` (F14) / `/theme`, propagating to chrome, internal pages, and web
  content **together, live, no restart**.
- Token *names and values* are shared (→ substrate: design tokens) — do not let the
  palettes fork between platforms.
- **Acceptance:** Switching to dark recolors chrome, an open `blanc://` page, and
  chrome all at once; entering a private tab applies the private scope.

## F16 — Internal `blanc://` pages

- Pages: **newtab** (the "ledger" start page), **favorites** (`blanc://bookmarks/`),
  **history**, **downloads**, **settings**, **shortcuts**, **error**, **auth**.
- **Presentation split:** the five *utility* pages (favorites, history, downloads,
  settings, shortcuts) present as a **transient chrome surface** — on desktop a
  sheet over a scrim — **never as tabs**; `newtab` and `error` remain tab content
  (`auth` is a dialog). Outbound activations (a history entry, a favorite) open
  real tabs and dismiss the surface. This is platform-neutral and maps to native
  sheet presentation on mobile — no divergence entry needed.
- The newtab ledger: date line, "Where to?", favorites, tab groups ("pick up where
  you left off" — clicking one focuses that group), footer with the weekly blocked
  count + palette hint. **No mascot** (retired in the rebrand — do not reintroduce).
- **Strong reuse opportunity:** ship these as **one shared web bundle** rendered in
  a web view on every platform, so they stay pixel-identical for free (→ substrate).
- **Acceptance:** newtab shows today's date, favorites, resumable groups, and the
  weekly blocked count; each page's nav links resolve within `blanc://`; utility
  pages open in the transient surface leaving the tab set untouched, and
  activating a favorite from the surface opens exactly one real tab.

## F17 — Supporter & app icons

- 8 free colorways (`paper` default, `ink`, `graphite`, `default`/"Evergreen",
  `midnight`, `cream`, `forest`, `sage`) + 3 supporter-gated (`ember`, `plum`,
  `gold`), same fixed geometry.
- Supporter unlock is **trusted forever, offline-OK, cosmetic-only** — no
  revalidation, no DRM. Renderers only ever see a derived `supporterActive` boolean.
- **Diverges:** purchase rails (D5 — Apple IAP / Play Billing, not Polar, on mobile)
  and icon-switching mechanism (D6 — clean on iOS, limited on Android).
- **Acceptance:** A supporter can select `ember`; a non-supporter sees it locked and
  any hand-set supporter id falls back to `paper`.

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
  save/relevant page actions. Children inherit group + privacy (F2/F4). OS hand-off
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
  without switching away, inheriting the opener's group.
- **Acceptance (desktop):** Copy Clean Link on a URL with `utm_*`/click-id
  params yields the URL without them, other params intact; Paste and Go with a
  URL on the clipboard navigates the active tab and closes the island.

## F20 — Basic-auth dialog

- HTTP basic-auth challenges present a modal prompt (`bowserAuth` bridge on
  desktop; native equivalent on mobile) with the same fields/behaviour.
- **Acceptance:** Navigating to a basic-auth-protected URL raises the credential
  prompt; correct credentials proceed, cancel aborts the navigation.

## F21 — Telemetry (usage ping)

- Single launch ping, **on by default, opt-out** (`usagePing`), **packaged
  builds only**, fire-and-forget (a failed/blocked ping never affects startup or
  surfaces to the user). Payload: `{installId, sessionId, version, platform,
  arch}`. `installId` is a random per-install token stored in its own
  `install.json` (not in settings, never synced) — it maps to a device install,
  never a person. `sessionId` is a random 32-bit integer per launch for GA4
  session tracking. Endpoint is the shared `blanc-ping` worker, which dedupes
  repeat launches into DAU/WAU/MAU via TTL'd `seen:*` flags and optionally
  mirrors to GA4.
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
- **Acceptance:** With the setting off, no ping is sent; with the default (on),
  exactly one ping is sent at launch in a packaged build; blocking the network
  changes nothing user-visible; deleting `install.json` — or the Settings
  "Reset install ID" button — resets the install identity.

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

## F26 — WebRTC leak protection

- A Settings → Privacy control sets the WebRTC IP-handling policy: **Standard**
  exposes no addresses beyond the default route's public interface; **Disable
  direct UDP** additionally stops WebRTC from opening direct UDP paths that bypass
  an application-level proxy (not relay-only enforcement). Applied to every tab.
- **Acceptance:** On a WebRTC test page, Standard reveals no local/multi-homed
  private addresses; with an application proxy configured, Disable-direct-UDP
  removes direct UDP candidates.

## F27 — Tab Sync (open tabs from your other devices)

- With Profile Sync enabled and the per-device **"share this device's open
  tabs"** toggle on (**off by default** — a device's tabs never upload without
  an explicit act on that device), each device publishes an E2EE snapshot of
  its open tabs (url, title, group, pinned; http(s) only, bounded) plus a
  separately-budgeted E2EE sidecar of source-rasterized, bounded PNG favicons
  under the sync account. Favicon source URLs never cross devices and remote
  surfaces never load them. Other devices browse it **read-only** — ⌘L panel (folded
  per-device sections), Quick Switcher (ranked below local tabs and
  favorites), start page — and open individual tabs locally. Never a merged
  live session: nothing force-opens or closes remotely. Private tabs never
  enter the snapshot. Toggle-off publishes a retraction; entries prune after
  30 days; a 24 h heartbeat keeps live devices present. Design:
  `docs/superpowers/specs/2026-07-21-tab-sync-design.md`.
- **Acceptance:** With sharing on on device A, device B lists A's tabs after a
  focus refresh and opens one as a new ungrouped local tab; toggling sharing
  off on A removes A's section from B after the next sync.

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
  occupy the remaining page pane below a 64px safe-area gutter whose color is
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
  named groups (group pins first), then loose tabs, followed by the new-tab
  action. Rows expose favicon and title plus active, loading, private, pinned,
  audible, and muted states. Directly hovering a genuinely truncated title
  starts a delayed, reduced-motion-aware reading pass to its hidden end;
  fully visible titles stay still and pointer exit restores the ellipsis.
  Group headers fold/unfold, including an explicit collapsed-active state.
  Remote-device tabs stay in the Quick Switcher and start page; they never
  become rail rows.
- Pointer actions switch, close, middle-click close, create a new tab, and
  fold/unfold groups. Drag reorder is accepted only within the same
  `{groupId,pinned}` bucket; `beforeId: null` means the validated source
  bucket's end. Cross-group and pinned↔unpinned drops are rejected without
  changing order or membership. Pin/unpin, mute/unmute, duplicate, and group
  membership editing remain available through the Island and native menus in
  the first rail release.
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
  filesystem path or raw profile data.
- Import is explicit, add-only, and idempotent. Only `http:`/`https:` Favorites
  are accepted; immediate folder names and valid creation dates are preserved.
  Existing URLs win, duplicates in the source are skipped, and passwords,
  history, cookies, sessions, and browser settings are untouched.
- Input is bounded before and during parsing: a 20 MiB file cap, a 100,000-node
  traversal cap, and a depth cap. The selected opaque id is rediscovered and
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
  macOS workspace retains the existing dock-reopen behavior.
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
  named workspace into the same isolated profile session.

## F34 — Glance reference pane

- Desktop can keep one additional tab from the same native workspace visible as
  a temporary reference pane. The active page remains the dominant main pane;
  Glance opens to its right at a 62/38 default split and stacks below it when
  the available page region is too narrow, with an explicit header introducing
  the lower reference.
- A person chooses the exact reference tab from a dedicated local-tab picker
  that excludes search, history, Favorites, commands, and remote tabs. The native
  View menu exposes **Open Glance… / Close Glance** with
  `Cmd/Ctrl+Shift+G`, so the feature is reachable on macOS, Windows, and Linux.
- The strip keeps the Island centered over the main pane and gives the
  reference a flat header with favicon/title plus **Make main**, **Change**, and
  close controls. Reference pages remain fully interactive without changing
  roles; promotion is explicit and swaps the two visible tabs.
- The divider is pointer-resizable and keyboard accessible, with a reset to the
  62/38 default. Glance never crosses window/profile ownership, never survives
  native-window teardown or session restore, and a visible Glance tab is never
  made quiet (F31).
- Glance is a desktop window-model capability (D11). Phone ports are N/A unless
  a future tablet/foldable contract defines a comparable multi-pane surface.
- **Acceptance:**
  [`acceptance/glance.feature`](./acceptance/glance.feature) selects a specific
  tab through the dedicated picker, verifies dominant/reference geometry,
  proves reference focus does not promote, changes and explicitly swaps the
  visible roles, resizes the divider, and dismisses back to one full page.

## F35 — Start page layouts

- The start page offers four arrangements of the same material: **ledger** (the
  original column), **billboard** (a live clock over favorite tiles), **shelf**
  (a favorites grid with group and blocked-count cards), and **tally** (the
  ledger column beside a week-of-blocking bar chart). Every layout draws the
  same feeds — favorites, tab groups, and the blocker's counters — and re-inks
  under the light, dark, and private themes with no layout-specific colors.
- The choice is a synced setting (`newtabLayout`, default `ledger`), changeable
  instantly from the start page's own footer switcher and from Settings; a
  change made anywhere reaches every open start page. It travels with the
  profile the way the theme does.
- The tally chart tells the truth: every bar — today's included — is
  normalized to the busiest day, colour alone marks today, and a week that
  blocked nothing draws no bars. Its data is the blocker's per-day counts,
  tracked locally alongside the existing weekly total.
- No layout may ever scroll horizontally, at any window width; narrow windows
  compact insets, wrap rows, and stack the tally columns rather than overflow.
  Empty feeds remove their section — row, label, and card — with no
  placeholder copy on the three newer layouts.
- **Acceptance:**
  [`acceptance/newtab-layouts.feature`](./acceptance/newtab-layouts.feature)
  renders the saved layout on a new tab and persists a footer switch.

## F36 — First-run onboarding

- A genuinely fresh profile is offered a six-step walkthrough over the start
  page: default browser, import, the island, ad blocking, privacy, and theme.
  It appears exactly once — the completion marker is the same first-run record
  the privacy choices commit to, so skipping and finishing both seal it — and
  profiles that completed first run (including every pre-existing install) are
  never asked.
- The privacy step carries the mandatory consent choices (search suggestions,
  usage ping); **no network feature they govern starts before the choices are
  saved**, skipping records exactly the values on screen, and the walkthrough
  closes only on a confirmed write. The import step embeds F30's migration
  with its explicit-discovery rule intact: no other browser's profile is read
  until the person asks to look, and the universal bookmarks-file import is
  offered from the start.
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
  reads nothing before the explicit ask.

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

## F38 — Fill a login from 1Password (macOS)

- On macOS, Blanc can ask the user's installed 1Password app for Login items that
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
  a real installed 1Password desktop app on macOS. Windows and Linux must prove
  the feature is unavailable and cannot start its broker.
