# Post-1.0 development architecture

This branch begins after the frozen 1.0.0 RC2 release candidate. Changes here
must not be merged into, rebased onto, or used to rebuild that release.

## Delivery order

1. F29 display sharing
2. Browser-data migration and onboarding
3. HTTPS/threat/site-information baseline
4. Independent windows and local-profile architecture
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

The single-window app persists through a versioned workspace record. The legacy
flat tab-session fields become the primary workspace, preserving URL order,
group membership, pins, collapsed state, and the active tab. Every visible
BrowserWindow now receives its own workspace record; restore reopens those
records as separate windows and returns the previously focused one to the
front.

Migration and normalization live in the pure session-workspace module and are
fixture-tested. A session created by a newer schema version is treated as
read-only by an older process: Blanc opens an ephemeral primary workspace and
does not overwrite the unrecognized file. Closing a secondary window follows
normal browser semantics: its tabs are released and its saved workspace is
removed. The primary retains its dock-reopen behavior on macOS.

## Window-runtime registry decision

The post-migration seam is a pure, in-memory window-runtime registry. A
runtime is keyed by the persisted workspace id and owns one native
BrowserWindow reference, its overlay and utility-sheet views/state, its active
tab id, and the set of tab ids it owns. A tab may have exactly one runtime
owner; a runtime cannot attach to two live BrowserWindows.

Every live window is registered. Its overlay/sheet state, tab order, groups,
and active-tab selection live on that runtime; only the process-wide map that
locates native tab resources remains shared. A secondary window is discarded
after its owned tabs are released; primary-window closure detaches native chrome
for the macOS dock-reopen path while clearing destroyed overlay/sheet references.

## Focused runtime routing decision

Every trusted chrome IPC is resolved from its native sender through the
registry before its handler runs; no renderer can select another window by
passing an id. `AsyncLocalStorage` carries that runtime across tab, overlay,
sheet, and menu callbacks so background activity is broadcast only to its own
chrome surface. Permission prompts also record their requesting runtime, so an
answer in one window cannot settle another window's request.

The remaining `win` reference is now a startup/test compatibility alias only;
runtime-aware operations resolve the focused or callback-bound BrowserWindow.
Shared presentation changes (theme, Island/vertical layout, and rail width)
are applied to every live runtime without moving tabs or chrome state between
windows.

Tab Sync remains deliberately scoped to the primary workspace for now. The
existing opt-in consent covered one workspace; exporting tabs from additional
windows would expand the synced browsing-data scope and needs a separate
product/privacy decision before it is enabled.

## Local-profile identity decision

Workspace schema v2 gives every window an explicit `profileId`. Existing v1
workspaces migrate to the permanent `default` local profile, so future profile
creation never has to infer ownership from a window title or cookie jar. The
pure local-profile registry has the same forward-compatibility rule as the
workspace: a newer registry remains untouched by an older build.

The device-local `profiles.json` registry provides bounded, opaque identities
plus human-readable names. It is distinct from `profiles/<opaque-id>/`, which
holds product records. The default `Personal` identity is implicit on older
installs; it continues to use every shipped root file, so upgrading does not
copy or move data. A named profile uses its own bounded Favorites, history,
downloads, and remembered-permission JSON records under that directory.

Each named profile receives its own persistent Chromium partition
`persist:blanc-profile-<id>`. Its private tabs use a separate, non-persistent
`private-browsing-<id>` partition, so neither normal cookies nor ephemeral
private state can cross between named profiles. Before a profile's first tab
loads, main installs the same internal-page handler, certificate observer,
permission policy, download routing, compatibility preload, WebAuthn chooser,
client-hint fallback, startup gate, and ad-block policy used by the default
sessions. A profile-local “clear browsing data” action clears only that
profile's normal/private sessions.

Settings, supporter status, telemetry, and Profile Sync remain device-level.
Profile Sync and its remote-tab presentation stay confined to Personal; a
named profile cannot export its Favorites, tabs, or favicon sidecar through
that pre-existing consent. Tab Sync remains the Personal primary workspace
only. The profile picker remains intentionally unexposed until the Island can
show the active profile and let people choose or name one without ambiguity.
