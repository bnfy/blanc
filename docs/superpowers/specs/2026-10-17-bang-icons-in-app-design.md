# Site icons in the app's bang rows

October 17, 2026. **Status: approved by the owner (October 17, 2026).** Nothing here is
built yet.

This is the follow-up named in
`docs/superpowers/specs/2026-10-17-bangs-page-redesign-design.md`
(*Follow-up: icons in the app*). That project put a real icon beside every
bang on `blanc.day/bangs`, served by Blanc's icon server
(`cloudflare/bang-icons-worker/`, live since October 17, 2026). This one
brings the same icons into the app's bang rows in the ⌘L panel.

## Why

Polish. The owner wants the app's `!` picker to feel like the redesigned
/bangs page, which shows a real site icon on every card and row. Today a bang
row in the app is a `!code` chip and text with no icon, so the two surfaces
look like different products.

## Decisions (owner, October 17, 2026)

1. **Every row gets a real icon**, not only the popular ones. That means
   asking Blanc's icon server for sites the person hasn't visited, and
   changing the privacy policy to say so. (Chosen over real icons only for the
   popular bangs and visited sites, with lettered tiles for the rest.)
2. **The icon server provides them on demand.** The app asks
   `blanc.day/bang-icons/<host>` when a row needs an icon; the server already
   fetches and keeps each icon on first request. (No bulk download: the list
   covers 8,910 sites.)
3. **Always on, no switch.** Icons follow the existing Bangs switch
   (Settings → General): when bangs are on, icons are on. No new setting.
   (Chosen over on by default with an off switch.)
4. **No icons ship inside the app**, not even the 19 popular ones. The first
   bare `!` asks the server for those 19 once. That reveals nothing personal
   (everyone's picker shows the same 19), and it keeps third-party logos out
   of the app package, its notices and the release steps. (Chosen over
   shipping the popular 19.)

## Goals

- Every bang row in the ⌘L panel shows the site's real icon, the way /bangs
  does: the hint row (`!yt lofi` → *Search YouTube for lofi*) and the picker
  rows under Recent, Popular and All.
- Blanc's server learns as little as possible: a site's icon is asked for
  only when its row is on screen, and once kept it is asked for again only to
  refresh it after 30 days (below).
- The app's favicon rules still hold: fetched by the main process without
  cookies or a referrer, converted to the fixed 32px PNG, and only that PNG is
  kept.

## Non-goals

- Icons anywhere else (Settings → Your bangs, the Start Page, history rows).
- Any change to the icon server's behavior. The app uses its existing
  contract: `GET /bang-icons/<host>` returns PNG, JPEG, GIF, WebP or ICO bytes
  (never SVG), 100 KiB at most, or a 404 for an unknown or held-back host.
- Shipping icon files in the app.
- A setting to turn icons off separately from bangs.

## Anti-goals (failure even if it works)

- The app contacts a third-party favicon service (Google's, DuckDuckGo's)
  directly. Only `blanc.day` is ever asked; the server's own DuckDuckGo
  fallback stays on the server.
- A request on every keystroke, or for rows the person never sees.
- Anything asked or kept from a private tab.
- A custom bang's host sent anywhere. Those can be private or internal
  addresses.
- Icons from the server synced to other devices or reported as telemetry.

## How it looks

- Each bang row gains a leading icon in the same slot and size as the favicon
  on Quick Switcher rows (`setFavicon` and its `.has-icon` / `fallback`
  classes in `src/renderer/overlay.js`), before the `!code` chip. The rest of
  the row is unchanged: chip, name, then the domain (or *yours* for a custom
  bang). *My call.*
- Until a real icon is available (not fetched yet, offline, a 404 or a
  held-back host), the row shows the existing lettered fallback from
  `faviconFallbackLabel`. When the icon arrives, it replaces the letter in
  place without the row reflowing.
- The icon is decorative (`aria-hidden`); the row's text already names the
  site. No new user-visible strings.

## Where an icon comes from, in order

For a bang whose catalog domain is `host`:

1. **An icon the app already holds from the person's own visits**, looked up
   by `siteKey(host)` (`src/main/top-sites.js`): the history site-icon cache
   (`siteIcons` in `history.json`, which `listHistory` already returns to the
   overlay) and then stored Favorites icons. No request.
2. **A copy fetched from the icon server before** (the bang icon store
   below). No request.
3. **Otherwise, ask the icon server**, under the rules below.

A custom bang uses step 1 only, keyed by its template's host. It never asks
the server.

## When the app asks the server

The main process makes every request. The overlay never fetches. Main asks
for `https://blanc.day/bang-icons/<host>` only when all of these hold:

- Bangs are on.
- The fresh-install privacy choices have been saved. Until then nothing is
  asked, like the other default-on sends (`docs/marketing-claims.md`, *Fresh
  optional connections*). *My call.*
- The window's active tab is not private. Main decides this from its own tab
  model, not from anything the renderer says.
- `host` is the lowercased domain of an entry in the app's own bundled
  catalog. Main checks it against the catalog it already loads, so a
  renderer can't make it fetch an arbitrary host, and custom bang hosts never
  qualify. Main also refuses any host equal to a custom bang's template
  host, so a custom bang can't trigger a request through a matching catalog
  entry.
- The row is actually on screen in the panel's list and has stayed there
  briefly (about 300 ms, *my call*), so typing through `!y`, `!yo`, `!you`
  doesn't ask for every intermediate list. The bare `!` shows at most the
  recent and popular rows (29 at most). A typed prefix shows at most 8 rows
  (`MAX_ROWS` in `src/renderer/pages/bangs.js`). So a burst is small.
- The icon isn't already held (steps 1–2), or the held server copy is due
  for its refresh (below).
- The host hasn't been ruled out this run. A **404** is a definite answer:
  remembered in memory until Blanc quits, then tried again next run. A
  **timeout, 5xx or network failure** is not: the host may be tried again the
  next time its row is on screen, at least 30 seconds later, and at most
  twice more per run. The server usually has the icon by then, because it
  finishes its own lookup and keeps the result even after the app has given
  up. *My call.*
- At most a few requests run at once (about 4, *my call*).
- This endpoint gets a longer time limit than other icon fetches, about 8
  seconds instead of 3, because the server's first lookup for a site can
  take several seconds. *My call.*
- Redirects are refused for this endpoint (the server never redirects).
  `readIconBytes` otherwise follows up to five checked redirects.

**Refresh.** A server copy older than 30 days (the server's own lifetime) is
asked for again the next time its row is on screen, under the same rules.
If the answer is a 404 (for example, an icon the owner has since held back),
the copy is dropped and the row shows its letter. If the request fails, the
old copy stays. This lets a withdrawn icon leave installed apps and a
redesigned icon arrive. *My call.*

The fetch goes through the existing pipeline: `readIconBytes`
(`src/main/favicon-network.js`: pinned public DNS, no redirects, no cookies,
no referrer, the generic User-Agent, size and time limits) and the
sanitizer's conversion to a 32px PNG data URL that `validIconData` accepts.
ICO and the other formats the server sends are already handled there. Only
the PNG is kept; the server's original bytes and the request URL are not.

## The bang icon store

- A new store of `{host, icon, fetchedAt}` records, with the icon as the
  32px PNG data URL. It is **per device**, like recent bangs (`recentBangs`
  in `settings.json`), because recents are what the picker shows and they are
  already shared by every local profile. Never synced, never sent anywhere.
  *My call.*
- Bounded to a few hundred hosts, least recently used dropped first (about
  300, *my call*; each icon is at most 8 KiB, so about 2.4 MB at most).
- **Cleared whenever recent bangs are cleared**, which is every history
  clear in any profile (each `settings.clearRecentBangs()` call in
  `src/main/main.js`). Taken together, the icons hint at which bangs someone
  has looked at.
- Nothing is written to it while the active tab is private (no request is
  made then anyway).
- Its own device-level file is the builder's call to shape. It must not be
  subject to `siteIcons`' rule that prunes hosts with no history entry.

## Private tabs

While the active tab is private, bang rows may still draw icons already on
the device (steps 1 and 2). Reading sends nothing, and the Quick Switcher
already lists history rows there. The app asks nothing and writes nothing.
Rows without a held icon show the letter.

## Privacy policy and claims

- **Privacy page** (`site/src/pages/privacy.astro`, *Browsing the web with
  Blanc* → **Favicons**): add that the ⌘L panel's bang rows can ask Blanc's
  icon server at blanc.day for the icon of a bang's site when the app
  doesn't already hold one, and refreshes a kept icon after about 30 days.
  The server sees the request's IP address and that
  site's name, and keeps nothing about the person (Workers Logs off; the
  server's own fetches go to the site or DuckDuckGo, never with anything
  about the person). The app keeps only the converted PNG on the device,
  clears it with history in any profile, and never asks from private tabs or for custom
  bangs. Exact wording is the builder's, within `docs/marketing-claims.md`.
- **Release timing:** the privacy-page change goes live with the release
  that ships this feature, not before. Shipped builds don't ask the server
  until then, and claims follow the public release (`docs/marketing-claims.md`).
  It goes in its own website-only PR, deployed after that release.
- **Claims ledger:** the Bangs entry in `docs/marketing-claims.md` says
  *no online lookup and nothing sent to Kagi*. That stays true of the list,
  but the entry gains a qualification for that release: bang rows' icons can
  come from Blanc's icon server. No marketing copy may call bangs fully
  offline from that release on.
- **Privacy summary:** the page's short version describes what a fresh
  install asks about. It stays accurate because icons wait for the saved
  choices; the builder checks that no sentence there implies Blanc contacts
  no Blanc server while browsing.
- **Platform spec:** add the icon behavior to F47 in `spec/features.md` (and
  the parity matrix if it tracks sub-behaviors), as the platform-neutral
  contract. Order of sources; the server is asked only for catalog hosts;
  never from private browsing; never for custom bangs; nothing before setup
  is saved; the PNG is kept on the device and cleared with recent bangs.

## Constraints the builder must respect

- `src/main/favicon-network.js` and the sanitizer are the only way bytes come
  in. No new HTTP client, no renderer `<img src="https://…">` (the overlay's
  CSP doesn't allow remote images, and must not be loosened).
- The new IPC between the overlay and main is a `window.browserAPI` change:
  update `browser-api/contract.json`, run `npm run browser-api:build`, and
  commit the regenerated vectors. Payloads carry only hosts and PNG data URLs.
- Boundary-file edits may need `npm run audit-inventory:write` (see the
  repo's audit inventory guard).
- The test-mode hook (`BLANC_TEST=1`) runs offline: the server must be
  stubbable so acceptance tests can prove the order of sources, the private
  and custom-bang rules and the one-request-per-host rule without the
  network.
- Owner console item, not code: confirm the rate rule on
  `blanc.day/bang-icons/*` lets one IP make about 30 requests in a few
  seconds (a first bare `!` on a new profile) without being blocked.

## Left to the builder

- Exact on-screen wait, concurrency and store cap within the bounds above.
- How the overlay learns that an icon arrived (a push event or a re-ask) and
  how rows update in place.
- Store file shape, and which module holds the pure policy. The order of
  sources, the request conditions and the store's LRU belong in a module with
  no `require('electron')` so they can be unit-tested.
- Privacy-page and claims wording.
- Tests: unit tests for the pure policy and the store, a contract check, and
  desktop acceptance scenarios for the rules above.
