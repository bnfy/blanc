# iOS M4: `blanc://` Internal Pages

Milestone 4 of the iOS port roadmap. Renders the shared `blanc://` web
bundle inside `WKWebView` via a custom scheme handler plus a thin
JS↔native data bridge. New tabs open to the **newtab ledger** instead of a
hardcoded website. Builds on the M0–M3 walking skeleton (TabsManager,
TabModel, ContentView with display-only pill + palette).

Maps to **F16** (internal `blanc://` pages) and realizes the **S4 shared
web bundle** substrate on iOS. Desktop reference: `src/main/pages.js` (the
`protocol.handle('blanc', …)` scheme handler serving flat files from
`src/renderer/pages/`) and `src/main/tab-preload.js` (the `bowserPages`
bridge, guarded to `blanc://` only).

## The load-bearing idea

The internal pages are **not reimplemented natively.** The exact same
`src/renderer/pages/*` HTML/CSS/JS that ships on desktop is rendered in a
web view on iOS. Per S4, that source stays **unchanged** — the only
per-platform work is (1) a scheme handler that serves those files and (2) a
native data bridge that answers the `window.bowserPages` calls the pages
already make. This is what keeps the pages pixel-identical across platforms
for free.

## The shared bundle

The pages live at `src/renderer/pages/`, outside the `ios/` tree. They are
added to the Xcode project as a **folder reference** (a blue folder, not a
group), so the directory's contents are copied into the app bundle at build
time and edits to `pages.css`/`newtab.html`/etc. are reflected in both
platforms with no duplication. The folder is flat — HTML, `pages.css`,
`newtab.js` and the other per-page scripts, `icon.svg`, and the app-icon
PNGs all sit in one directory, matching the desktop's flat-serving
constraint.

Fonts (Inter, JetBrains Mono) are loaded live from Google Fonts via
`<link>` in each page's `<head>`, exactly as on desktop. This is a live
network dependency; offline, the pages fall back to the system font via the
CSS `font-family` chain. Bundling fonts locally would fork the shared
bundle and is deliberately **out of scope** — see Known limitations.

## Scheme handler (`BlancSchemeHandler`)

A `WKURLSchemeHandler` registered for the `blanc` scheme on the web view
configuration. It resolves a `blanc://<host>/<path>` request to a file in
the bundled pages folder, mirroring the desktop's `pages.js` security model:

1. **Known-page allowlist.** The `host` must be one of `newtab`,
   `bookmarks`, `history`, `downloads`, `settings`, `error`, `shortcuts`.
   An unknown host **fails the request cleanly** (the `WKURLSchemeTask`
   fails) — it never falls through to a file lookup. `auth` is deliberately
   excluded — the basic-auth dialog is native on iOS (M12), not a web page.
2. **Root serves the page.** A root path (`/` or empty) serves
   `<host>.html`.
3. **Basename-only for assets.** Any deeper path is reduced to its last
   component and validated against a strict `^[\w.-]+$` allowlist —
   rejecting `..`, path separators, and anything else — before being
   resolved against the one flat pages directory. No subdirectories, no
   traversal.
4. **MIME by extension.** `.html`→`text/html`, `.css`→`text/css`,
   `.js`→`text/javascript`, `.svg`→`image/svg+xml`, `.png`→`image/png`.
   A missing file yields a 404-style failure.

The handler is stateless (it only reads bundled files), so a single
instance is safe to install on every tab's configuration.

## Pages bridge (`PagesBridge`)

The pages already call `window.bowserPages.<group>.<method>()` and await
promises. The bridge recreates that global on iOS, backed by
`WKScriptMessageHandler` instead of Electron IPC. **The injected global
keeps the name `bowserPages`** — it is an internal identifier the shared
bundle depends on and was deliberately not renamed in the rebrand.

Two cooperating pieces:

- **JS shim** — a `WKUserScript` injected at document-start that defines
  `window.bowserPages` with the same method shape the pages expect. Each
  method posts `{id, group, method, args}` to
  `webkit.messageHandlers.blancPages` and returns a `Promise` keyed by a
  unique request id.
- **Native handler** — a `WKScriptMessageHandler` named `blancPages` that
  receives each message, dispatches by `group`/`method`, and resolves the
  page's promise by calling back into that message's web view
  (`message.webView`) with the result keyed by request id.

The bridge is doubly guarded, matching desktop's model exactly:

- **The shim self-gates.** Running at document-start in the page's own
  context, it defines `window.bowserPages` only when
  `location.protocol === 'blanc:'` — the same check `tab-preload.js` makes
  — so ordinary web pages never even see the global.
- **The native handler re-verifies.** It independently checks the sending
  frame's URL begins with `blanc://` before acting on any message, so the
  guarantee does not rest on the client-side check alone.

An **unknown group/method rejects** the page's promise with an error rather
than hanging it, so a page that calls a method a later milestone hasn't
implemented yet fails fast.

## M4 bridge surface

Per the "full bridge, empty data" decision, every method the **newtab**
page calls is wired now; the ones whose backing features don't exist yet
return empty values. Later milestones replace the stub bodies with real
data — they never have to add new bridge plumbing.

| Method | M4 return | Real data lands |
|--------|-----------|-----------------|
| `appVersion()` | the app's real version string | — |
| `bookmarks.list()` | `[]` | M7 (Favorites) |
| `bookmarks.clearFavicon(url)` | no-op | M7 |
| `start.data()` | `{ groups: [], blockedThisWeek: 0 }` | groups M8, blocked count M5 |
| `start.focusGroup(id)` | no-op | M8 (Tab groups) |
| unknown group/method | rejects with an error | — |

Because favorites and groups come back empty, the newtab page renders its
full layout with the empty-state affordances the page already has: the
favorites row shows its "♥ a page to pin it here" hint, the groups section
stays hidden (`!groups.length`), and the footer reads "0 ads blocked this
week." It looks structurally complete but sparse, and fills in as M5/M7/M8
land — with no further bridge work.

Other internal pages (`history`, `downloads`, `settings`, …) are present
in the bundle and **served** by the scheme handler, but their bridge
methods are **not** implemented at M4 and there is no in-app path to reach
them yet (the M3 slash-command subset is only `/new` and `/close`). They
render their static shell if navigated to directly, but their data calls
reject until each page's milestone (settings M6, favorites/history M7,
downloads M11). This is intended: M4 delivers the newtab ledger and the
reusable serving+bridge infrastructure, not every page's data.

## New-tab behavior

A plain new tab now opens to **`blanc://newtab/`** instead of the M0–M3
placeholder URL. The `TabsManager.createTab()` default URL changes
accordingly, and the initial tab created at launch is a newtab.

When the active tab is on the newtab page, the pill's domain display reads
a friendly **"New Tab"** rather than the raw `blanc://newtab` string —
`ContentView`'s existing domain-display logic gains a
`blanc://`-recognizing branch. (This mirrors desktop, where the newtab
page presents with no address showing.)

## Architecture

### New files

- **`ios/Blanc/Blanc/BlancSchemeHandler.swift`** — the
  `WKURLSchemeHandler`. Pure request→file resolution: allowlist, basename
  validation, MIME typing, bundle read. The path-resolution logic is
  extracted so it is unit-testable without a web view.
- **`ios/Blanc/Blanc/PagesBridge.swift`** — the JS shim string
  (`WKUserScript` source) and the `WKScriptMessageHandler`. Owns the
  method dispatch table and the empty-data stubs. Holds a weak reference to
  the `TabsManager` for the (currently no-op) `start.focusGroup` and future
  milestones.
- **`ios/Blanc/Blanc/WebViewConfiguration.swift`** — a small factory that
  builds a `WKWebViewConfiguration` with the scheme handler set for
  `blanc` and the bridge's user script + message handler installed. This
  is where the two new pieces are wired onto every tab's web view.

### Modified files

- **`TabModel.swift`** — its `WKWebView` is created from the shared
  configuration factory instead of a bare `WKWebView()`.
- **`TabsManager.swift`** — `createTab()`'s default URL becomes
  `blanc://newtab/`; the launch tab is a newtab.
- **`ContentView.swift`** — the pill's domain display recognizes
  `blanc://newtab` and shows "New Tab".
- **Xcode project** — the `src/renderer/pages/` folder reference is added
  to the app target's Copy Bundle Resources.

### Data flow

```
New tab → TabsManager.createTab() → blanc://newtab/
  → WKWebView (configured with scheme handler + bridge)
  → BlancSchemeHandler serves newtab.html + pages.css + newtab.js + icon.svg
  → newtab.js runs, calls window.bowserPages.appVersion() / bookmarks.list()
    / start.data()
      → JS shim posts {id, group, method} to blancPages
      → native handler verifies blanc:// sender, dispatches, computes result
      → handler calls back into message.webView, resolving the page's promise
  → page renders: date, "Where to?", empty favorites hint, hidden groups,
    "0 ads blocked this week", version in footer
```

## Known limitations (accepted at M4)

- **Fonts over the network.** The shared bundle links Google Fonts;
  offline the pages fall back to the system font. Local bundling is
  deferred to avoid forking the bundle.
- **Desktop keyboard copy in the shared bundle.** `newtab.js` derives its
  "go anywhere" hint from `navigator.platform` and shows "⌘L" on Mac /
  "Ctrl+L" elsewhere — so on iOS it reads "Ctrl+L to go anywhere," which is
  meaningless on touch (the pill is tapped, per **D7**). This is a D7
  input-model leak in the shared bundle, fixed when the bundle gains
  platform-awareness (a future substrate refinement), not by forking it at
  M4.
- **Only newtab is data-wired.** The other pages are served but their
  bridge methods land in their own milestones (above).

## What is NOT in M4

- Favorites/history/downloads/settings **data** (their pages render shells
  only) — M6/M7/M11.
- The weekly blocked count as a real number — M5 (ad blocking).
- Tab groups on the ledger — M8.
- Private-tab newtab variant (`?private=1`) — M9.
- Local font bundling and shared-bundle mobile-awareness — future substrate
  work.
- Any change to the `src/renderer/pages/*` source — it stays unchanged (S4).

## Tests

Unit tests in `BlancTests/` for the **scheme handler's path resolution**
(the security-critical, web-view-free logic):

- Known host + root path → serves `<host>.html`.
- Unknown host → refused.
- Asset basename (`pages.css`) → resolves within the flat dir.
- Traversal attempt (`../../etc/passwd`, `foo/bar.css`) → rejected.
- Each mapped extension → correct MIME type.
- Unmapped/missing file → failure response.

No unit tests for the bridge round-trip (it needs a live `WKWebView`);
it is verified on the simulator: a new tab renders the newtab ledger with
today's date, the empty-favorites hint, the "0 ads blocked this week"
footer, and the real version string — proving the scheme handler serves
the bundle and the bridge answers `appVersion()`/`bookmarks.list()`/
`start.data()`. Consistent with M0–M3 and the desktop project (no UI
tests).
