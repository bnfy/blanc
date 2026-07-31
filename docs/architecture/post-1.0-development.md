# Post-1.0 development architecture

This branch begins after the frozen 1.0.0 RC2 release candidate. Changes here
must not be merged into, rebased onto, or used to rebuild that release.

## Delivery order

1. F29 display sharing
2. Browser-data migration and onboarding
3. HTTPS/threat/site-information baseline
4. Versioned profiles and multi-window ownership
5. Tab lifecycle recovery
6. Split view and Glance

Credentials and system-passkey access are a parallel approval/security track,
not a dependency of the first three product milestones.

## Boundary rules

- Electron-only capabilities stay in the main process. Renderers receive the
  minimum inert data needed to draw trusted chrome.
- Every asynchronous browser prompt has one exactly-once settlement owner and
  explicit cancellation routes for navigation, tab changes, renderer failure,
  window closure, and timeout.
- New persisted structures are versioned from their first release. Migration
  functions are pure and tested against fixtures before UI wiring.
- IPC actions are authorized from `event.sender`, never from a global assumption
  about which surface sent them.
- Private activity may use process-memory state but cannot create persistent
  decisions or records.

## F29 display-sharing decision

Desktop uses `session.setDisplayMediaRequestHandler` and enumerates sources with
`desktopCapturer.getSources` in main. The overlay receives only a request token,
origin, source name/type, and bounded data-URL thumbnails. It never receives a
`DesktopCapturerSource` object or direct access to `desktopCapturer`.

The main process binds each request to the requesting `WebContents`, frame
origin, active tab, and navigation lifetime. The renderer returns a request
token plus a row index; main validates both and maps the index back to the
original source object. Source permission is never persisted. System audio is
unchecked by default and initially available only through Electron's supported
Windows loopback stream.

The first implementation deliberately uses Blanc chrome on every desktop
platform instead of Electron's experimental macOS system-picker option, keeping
the origin and lifecycle contract consistent and testable.
