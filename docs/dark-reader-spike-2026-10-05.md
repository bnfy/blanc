# Dark Reader in Blanc: spike results

Run October 5, 2026, against the plan in
[`dark-reader-built-in-plan-2026-10-05.md`](dark-reader-built-in-plan-2026-10-05.md).
This was a throwaway harness. No Blanc source changed.

**Result: go, with three design changes.** Dark Reader's engine runs as a Blanc
session preload and darkens pages from the first paint. Strict-CSP pages and
stylesheets from other domains work once two small changes are made. Iframes
stay light unless a security decision changes how Blanc runs page scripts in
subframes.

## Setup

- `darkreader` **4.9.133** from npm, tarball SHA-256
  `7ce63a583d0961ff719aa97e28554767bd509d7f17508ffcda34570b98b67805`, MIT.
- Blanc's official **Electron 44.5.1** on Linux under Xvfb.
- **Pages:** `WebContentsView`s with Blanc's tab settings (`sandbox`,
  `contextIsolation`, no Node).
- **Sessions:** one persistent session and one in-memory session standing in for
  private tabs.
- **Preloads:** each session has Blanc's real `chrome-compat-preload.js` plus
  the Dark Reader preload, both registered with
  `session.registerPreloadScript({ type: 'frame' })`, as `main.js` does today.
- **Theme:** Blanc's theme forced to dark.
- **Preload bundle:** the engine bundled into one sandbox-safe file, about
  357 KB.
- **Test pages:** local only, served from two origins on different ports:
  - a plain white page;
  - stylesheets from another domain, with and without CORS headers;
  - shadow DOM and constructed stylesheets;
  - a strict CSP page;
  - iframes from the same and another origin;
  - a site with its own dark mode;
  - a heavy page with 3,000 CSS rules and 6,000 elements.

Darkness was measured from computed colours (relative luminance), not by eye.

## Results

| Check | Result |
|---|---|
| Plain page | **Pass.** Background luminance 1.0 → 0.01, text 0.006 → 0.70. |
| White flash | **Pass.** The page's first inline script already sees the dark background. |
| Live off and on | **Pass.** Switches both ways without a reload. |
| Private (in-memory) session | **Pass.** Same result as normal tabs. |
| Shadow DOM and constructed stylesheets | **Pass** on ordinary pages. |
| Site with its own dark mode | **Pass.** It stays dark; luminance 0.006 → 0.005, text still readable. |
| Engine hidden from the page | **Pass.** `window.DarkReader` is undefined in the page. |
| Blanc's Chrome compatibility shim | **Pass.** `window.chrome.app` is unchanged in the page. |
| Strict CSP page | **Fail → fixed.** See change 2. |
| Stylesheet from another domain, no CORS headers | **Fail → fixed.** See change 3. |
| Stylesheet from another domain with CORS | **Pass** without any bridge. |
| Iframes, same and cross origin | **Fail.** See "Iframes". |
| Heavy page, 3 runs each | Load **≈ 476 ms → ≈ 843 ms**, page JS heap **≈ 2 MB → ≈ 8 MB**. Darkened within 20 ms of load. |

## Required design changes

1. **Wait for `<head>`.** The library assumes `<head>` exists, but a session
   preload runs before the parser creates it, so the first attempt threw.
   Starting the engine from a `MutationObserver` the moment `<head>` appears
   fixed it, with no flash.
2. **Give the engine's isolated world its own CSP.** On a page with
   `style-src 'self'`, Chromium blocked every injected style, the way it does
   for any page script. Chrome exempts extensions from this; Blanc's preload
   world isn't exempt by default. Calling `webFrame.setIsolatedWorldInfo` with a
   world-level CSP made the strict-CSP page fully dark, constructed stylesheets
   included.
   - The spike set this on world 999, which every Blanc session preload shares.
     Production should not do that.
   - Production should run the engine in its own isolated world, using
     `webFrame.executeJavaScriptInIsolatedWorld` and that world's own CSP.
   - It should give that world only a narrow fetch function through
     `contextBridge.exposeInIsolatedWorld`.
   - This shape wasn't tested; it is next for the build phase.
3. **Fetch bridge for stylesheets from other domains.**
   - Without CORS headers, the page cannot read another domain's stylesheet.
     The library's own fetch fallback also never ran, because Electron's
     isolated world already has a `chrome.runtime`, so Dark Reader's stub isn't
     installed.
   - The library's `DarkReader.Plugins.fetch` hook, backed by a main-process
     fetch, fixed it.
   - The spike's bridge allowed only http(s), sent no cookies, accepted only
     `text/css` and capped responses at 2 MB.
   - Production still needs the rest of the plan's limits (no local or
     private-network addresses, only URLs the frame links to) and a security
     review.
   - Real sites commonly load CSS from CDNs, so this matters more than the
     fixtures suggest.

## Iframes

Blanc's session preloads run only in main frames. This matches the capture
indicator's spike: subframe preloads need `nodeIntegrationInSubFrames`.
- **Without the flag:** both iframes stayed white.
- **With the flag:** both darkened with no flash.

The flag would also run **every** Blanc session preload in subframes: Chrome
compatibility, capture instrumentation, WebRTC and badge policy. That is a
security and behaviour change across the app, and `CLAUDE.md` records it as
deliberately off. Options:
- ship main-frame-only and accept light iframes (comment widgets, embeds,
  some ads);
- review the flag with every preload's subframe behaviour;
- inject into subframes from main after they load (would flash, untested).

**Recommendation:** ship main-frame-only first.

## Limits of this spike

- Local test pages only, on Linux; no real websites, macOS or Windows. Visual
  quality on real sites and speed on real heavy sites are unmeasured.
- The heavy page is synthetic. The roughly 80% load-time increase is an upper
  bound on that page, not a measurement of typical sites.
- Site fixes were not exercised; every test ran with no fixes.
