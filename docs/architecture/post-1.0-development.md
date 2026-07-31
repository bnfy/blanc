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

## F30 browser-Favorites migration decision

The first migration slice imports Favorites directly from discovered
Chromium-family profiles and offers the same action during first run and from
the Favorites sheet. Profile discovery, bounded file reads, JSON parsing, and
opaque-id validation live in the main process. The renderer sees browser/profile
labels and a stable opaque id, never a path.

Imports reuse the existing add-only Favorites transform, so retries and
cross-source overlap cannot replace or duplicate a saved URL. Direct profile
reads cover Chrome, Edge, Brave, Chromium, and Vivaldi on macOS, Windows, and
Linux. The existing bookmarks-HTML path remains the explicit fallback for
Safari, Firefox, and other browsers. History, passwords, cookies, open tabs,
and settings are outside this slice and require separate data-specific consent
and migration contracts.

## F31 site-information and certificate-safety decision

The first HTTPS/security slice makes Chromium's transport decision legible
without replacing it. A session-level certificate verifier observes successful
verification metadata, keeps only bounded public display fields in memory, and
always delegates the decision back to Chromium. Both the ordinary and private
browsing sessions install the observer; neither persists certificate records.

`serializeTabs()` derives a small site-information projection for trusted
chrome: state, exact origin, summary, sanitized certificate metadata, and the
existing blocked-request count. The resting Island warns on public HTTP and
certificate failure. The expanded Island owns the detailed card, so web content
cannot spoof it.

Main-frame certificate failures are rejected and routed to a dedicated
`blanc://error` presentation with retry and back-to-safety actions only. There
is deliberately no bypass path or trust exception. This milestone does not yet
claim phishing/malware reputation protection; a deceptive-site threat feed and
its update/failure policy remain the next independent security slice.

## Versioned workspace decision

The single-window app persists through a versioned workspace record before a
second BrowserWindow is exposed. The legacy flat tab-session fields become the
primary workspace, preserving URL order, group membership, pins, collapsed
state, and the active tab. The current process owns only that primary workspace,
but its read/write path preserves other named workspaces already present in the
record instead of flattening or discarding them.

Migration and normalization live in the pure session-workspace module and are
fixture-tested. A session created by a newer schema version is treated as
read-only by an older process: Blanc opens an ephemeral primary workspace and
does not overwrite the unrecognized file. The next slice can therefore add a
window registry, per-window chrome/overlay/sheet views, and explicit tab
ownership without another storage-format break.
