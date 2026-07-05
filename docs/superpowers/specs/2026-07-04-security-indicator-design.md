# Connection security indicator — island chrome

**Date:** 2026-07-04
**Status:** Approved

## What

A warning-only security indicator in the island chrome: plain-HTTP sites get a small
open-padlock glyph, danger-tinted, in the resting pill (between favicon and domain) and in
the expanded command bar's input row. Secure and internal pages show nothing — per modern
browser practice (locks are being retired; HTTPS is the norm) and Bowser's minimal-chrome
philosophy.

## Rule

A tab is insecure iff its committed URL is `http:` **and** the host is not loopback
(`localhost`, `*.localhost`, `127.0.0.1`, `[::1]`) — mirroring Chromium's "potentially
trustworthy" carve-out so local dev servers never warn. `https:`, `bowser:`, `file:`,
and blank tabs show no indicator. Invalid-certificate pages need no handling: Bowser
deliberately has no `certificate-error` handler, so Electron's default rejects them and
they never commit.

## Architecture

- **No main-process changes.** State derives from `tab.url`, already present in every
  `tabs:updated` broadcast.
- `connectionInsecure(url)` helper duplicated in `src/renderer/renderer.js` and
  `src/renderer/overlay.js` — the established pattern for the two hand-synced chrome
  documents.
- **Pill** (`index.html` / `renderer.js` / `styles.css`): an inline-SVG open-padlock
  `<span>` between `#pillFavicon` and `#pillDomain`, `hidden` unless the active tab is
  insecure and not `isLoading` (avoids a stale flash under "Loading…"). Tooltip:
  "Not secure — this site uses an unencrypted connection (HTTP)". Colored `var(--danger)`;
  works in the private theme scope, composing with the private chip.
- **Overlay panel** (`overlay.html` / `overlay.js`): the same glyph in the command bar's
  input row, shown under the same conditions. Quick Switcher rows, history, favorites
  untouched.

## Testing

Manual plus the Playwright driver (isolated-profile wrapper): `http://example.com` →
glyph in pill and panel; `https://example.com`, `bowser://settings/` → nothing;
`http://localhost:<port>` → nothing. Chrome documents load once at window creation —
verify with a fresh launch, not ⌘R.
