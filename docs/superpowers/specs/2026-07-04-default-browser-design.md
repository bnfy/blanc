# Default browser setting

**Date:** 2026-07-04
**Status:** Approved

## What

A "Default browser" row on `bowser://settings/` that registers Bowser as the system
default browser, plus the packaging and runtime plumbing that makes that meaningful.
macOS-first; Windows/Linux get the basics (registration call where the OS honors it,
URLs from argv open in tabs); the row is hidden on Linux, where Electron's
default-protocol-client API doesn't exist.

## Parts

**1. Packaging eligibility.** `build.protocols` in `package.json` claiming `http` +
`https` (role Viewer) → electron-builder emits `CFBundleURLTypes` into Info.plist.
**Amended post-release (v0.7.2):** scheme claims alone are NOT enough — LaunchServices
only flags an app `web-browser` (what System Settings' picker keys on) when it also
claims HTML documents. `build.mac.extendInfo` adds `CFBundleDocumentTypes` with
`public.html` and `public.xhtml`, one UTI per dict, `CFBundleTypeRole: Viewer` — the
shape Brave/Chrome use for browser classification. Each claim also sets
`LSHandlerRank: Alternate`, the lowest rank that remains eligible for the macOS
default-browser picker. `None` was tested on a clean registration and excludes the
app from that picker. Blanc therefore handles the matching macOS `open-file` event,
but only for an existing regular HTML/XHTML document explicitly handed over by the
OS. Typed `file:` URLs, argv paths, page-initiated file navigation, popups, arbitrary
file types, and sync remain rejected. Bundling extra UTIs (e.g.
Apple's derived `com.apple.default-app.web-browser`) into one dict makes LS drop the
claim silently.
Packaged builds only; a dev run must never register the bare Electron binary.
**Regressed and re-landed (2026-09-18):** the `CFBundleDocumentTypes` claim went
missing from `package.json` when local HTML viewing was retired while
`build.protocols` stayed, so shipped builds claimed the schemes but were never
flagged `web-browser` on a clean registration. Apple later denied Blanc's Web Browser
Public Key Credential Request, reporting that the app did not specify the HTTP and
HTTPS schemes and therefore could not be set as the default browser. The public
bundle did contain those scheme claims; restoring the document metadata addresses
the missing LaunchServices browser classification, while Apple's next review remains
the final confirmation. Config alone is no longer the gate:
`scripts/verify-packaged-browser-role.js` reads the **built**
`Contents/Info.plist` from the cross-platform `afterPack` hook and fails the mac
package before signing unless both claims and the Alternate rank survived, and
`test/unit/browser-role-packaging.test.js` checks the same rules on Linux CI.

**2. Setting = live OS state.** Not persisted in settings.json — LaunchServices owns it.
Two guarded IPC handlers in `src/main/pages.js` (exposed via `bowserPages` in
`tab-preload.js`):
- `pages:defaultBrowser:get` → `{ isDefault, canSet }` — `app.isDefaultProtocolClient('http')`;
  `canSet` false when `!app.isPackaged` or on Linux.
- `pages:defaultBrowser:set` → `app.setAsDefaultProtocolClient('http')` + `('https')`,
  returns refreshed `{ isDefault, canSet }`. macOS shows its own confirmation dialog we
  can't observe, so the page re-queries on response and on window focus (user returning
  from the system dialog).

**3. URL handoff.** `app.on('open-url')` registered before `ready`; `event.preventDefault()`.
While running: open the URL as a new active tab and focus the window. During cold launch
(no window yet): queue, then flush as tabs after the window and session restore complete.
Win/Linux basic path: the existing `second-instance` handler also opens any http(s) URLs
found in `commandLine`, and startup scans `process.argv` the same way. A shared
`urlsFromArgv(argv)` helper filters strictly for `^https?://`.

**4. Local HTML handoff.** `app.on('open-file')` is also registered before `ready` so
the document can queue through the same window/readiness lifecycle. The path must be
absolute, resolve to an existing regular file, and end in one of the declared
HTML/XHTML extensions. It is canonicalized to a `file:` URL, then `createTab` requires
an explicit `allowLocalFile` capability and rechecks the URL type. This narrow path is
why the packaging declaration is truthful without making `file:` generally navigable.
Duplicate Tab and Recently Closed keep the grant for that in-memory document.
The device-local session and Named Workspaces store a parallel grant bit; restore
accepts it only if the same canonical HTML file still exists. A missing file or
unmarked `file:` URL is dropped, and the rollback mirror and Sync never carry
the grant.

## Settings UI

Row below "App icon": label "Default browser", hint "Open web links from other apps in
Bowser". States:
- Not default (packaged): button "Make default…" — ellipsis because the OS confirms.
- Default: button replaced by quiet text "Bowser is your default browser".
- Dev run: disabled button, hint "Available in the installed app".
- Linux: row removed (as the app-icon row does off-Mac).

## Error handling

- `setAsDefaultProtocolClient` returning false (or the user declining the macOS dialog)
  simply leaves the row in its "Make default…" state after re-query — no error surface.
- Malformed/exotic argv entries are ignored by the strict `^https?://` filter.
- open-url URLs are opened via the same `createTab` path as every other tab; nothing new
  to sanitize beyond what tabs already handle.

## Testing

- Driver (dev app, isolated profile): `app.emit('open-url', …)` with a URL while running
  → new active tab with that URL, window focused. Settings page shows the row with
  `canSet: false` (disabled button + dev hint).
- Packaging: `npm run dist:dir`, assert built `Info.plist` contains `CFBundleURLTypes`
  claiming http and https.
- Manual, post-release on a real install: Bowser appears in System Settings → Desktop &
  Dock → Default web browser; clicking "Make default…" raises the macOS confirmation;
  links from other apps open as Bowser tabs. Cold-start handoff (link clicked while
  Bowser closed) restores the session plus the link's tab, active.
