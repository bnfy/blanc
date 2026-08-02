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

## Release-acceptance boundary decision

Every stable scenario id selected by the desktop `runnable` profile is also an
explicit `@release` contract. A repository check parses the Gherkin catalog and
the runnable profile together, failing on missing/duplicate ids, a release tag
without a runnable binding, or a runnable contract without the release tag.
The dedicated release profile therefore selects 86 stable product contracts
(91 expanded scenarios). `release:verify:press` runs this contract guard before
the existing full runnable dry/live gates, so the selectable release boundary cannot drift
even though the live superset remains the final desktop gate.

## N-1 staging-update decision

Production packages remain pinned to electron-builder's embedded GitHub Stable
configuration. A packaged app selects the alternate updater only through the
exact `BLANC_UPDATE_CHANNEL=staging` opt-in plus a separate HTTPS feed URL;
invalid or partial staging configuration disables updates for that launch
instead of falling back to Stable. The generic provider reads channel-specific
metadata (`staging-mac.yml` on macOS), so candidate files remain undiscoverable
to ordinary clients even when a host serves both trees.

The feed-preparation command copies only metadata-referenced artifacts into a
fresh directory, verifies their presence and version, rejects traversal, and
renames the metadata onto the staging channel. The first packaged N-1 smoke
uses a loopback-only HTTP exception, drives the real signed Squirrel.Mac
replacement, checks the updated bundle version, and relaunches that bundle.
This isolates updater validation from immutable releases: the workflow creates
no tag, release, remote upload, or production-channel metadata. Windows and
Linux feed layouts are preparable now; their native installer smokes remain a
platform follow-up. See `docs/staging-update-feed.md`.

## Dependency-compliance decision

Blanc separates the distributed runtime from the wider build supply chain.
The runtime CycloneDX inventory follows the root production dependency closure,
then explicitly adds Electron (a devDependency whose framework is shipped),
local fonts, and compiled blocker-data provenance. Complete root and site lock
SBOMs retain development and optional tools without falsely describing them as
code inside the desktop package.

Runtime licenses are an exact allowlist; unknown or changed expressions fail
closed. Missing lock metadata requires committed, version-scoped evidence.
EasyList/EasyPrivacy select the CC-BY-SA branch of their dual license and carry
attribution; the compiled seed records that data obligation alongside the
Ghostery MPL inputs. Every platform's after-pack hook embeds the runtime SBOM,
aggregate notice, Electron/Chromium notices, and one license record per runtime
npm component plus the OFL texts. See `docs/dependency-compliance.md`.

## Persistence resilience decision

Every `JsonStore` record is rewritten through a same-directory temporary file
and atomic rename. A successful primary write is mirrored to a sibling `.bak`
record with the same atomic replacement rule, so a partial rewrite never
truncates either previously valid file. If the primary is absent, malformed,
or has the wrong JSON shape at startup, Blanc recovers from a valid backup and
repairs the primary before continuing. When both copies are unusable, the
store follows its existing safe-default behavior; neither malformed input nor
an I/O failure can prevent the app from starting.

Backup refresh is deliberately secondary to the primary commit. Once the
primary rename succeeds, synchronous state transitions may truthfully report
success; an unsuccessful backup refresh retains the earlier atomically written
backup and is retried by the next store flush. This avoids reporting a failed
operation whose primary state was already committed.

## Diagnostics and crash-ledger decision

Blanc keeps a device-local, 50-event crash ledger in `crash-ledger.json`.
Renderer failures are categorized only by trusted surface (`chrome`, overlay,
utility sheet, or tab); child-process failures retain only Electron's process
type, reason, and exit code. A synchronously persisted active-run marker turns
into an `unclean-exit` event on the next launch if the main process never
reached `will-quit`. No event carries a URL, title, history/download/Favorite
record, profile name, filesystem path, install id, sync identity, or license.

Settings shows the local count and can clear it. Export is an explicit native
save-dialog action producing a readable JSON report with app/runtime versions,
OS family/release, and the bounded event list. The renderer never receives the
chosen path, and Blanc has no diagnostics-upload endpoint: the report stays on
the device unless the user independently chooses to share the saved file.

## Unclean-exit session-recovery decision

An interrupted active-run marker becomes a durable unresolved-recovery marker,
not merely a historical crash event. On the next launch Blanc materializes one
safe Personal new-tab window and holds every saved web navigation and named
profile window behind the same startup protection boundary used by the blocker.
The start page offers Restore tabs or Start fresh; it never receives saved URLs.
Closing Blanc without choosing preserves the unresolved state for the next
launch instead of silently turning it into an automatic restore.

Restore clears the recovery marker synchronously, waits for startup protection,
then recreates the versioned workspace and previously focused window. Start
fresh atomically replaces `session.json` with one empty Personal primary
workspace before releasing startup. A failed workspace write leaves the choice
open. A lone blank new tab resolves without prompting, and private tabs,
utility sheets, and pending profile deletions retain their existing restore
filters. Forced-process acceptance scenarios cover both choices against the
real persisted profile. Creating a named profile is also synchronously durable
before its window opens, so a crash cannot preserve that workspace while losing
the registry identity and falling back to Personal's session partition.

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

## Expanded first-run onboarding decision

Fresh installs use a three-step start-page flow: explicit privacy choices,
optional Favorites migration, then tab-layout and default-browser setup. The
default-browser action remains optional and goes directly through the operating
system; finishing setup never silently registers Blanc as the default.

Privacy choices are flushed before the flow advances, but search suggestions
and the launch ping remain disabled by the existing first-run gate until the
final step completes. The selected device-local tab layout and the existing
`onboardingVersion` completion marker are then committed together, so a
reported completion survives restart with the chosen presentation.

The version remains `1`: profiles that completed the compact 1.0 privacy card
are already onboarded and must not be interrupted after upgrading merely
because post-1.0 added import and layout steps. An interrupted fresh install
retains its saved privacy choices and returns to setup on the next launch.

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
only. The native Profiles menu can create a new named window or reopen an
existing profile; the Island and native window title show the active profile
name.

## Named-profile lifecycle decision

Settings now exposes the device-local profile list and the native Profiles
menu links to that management surface. Personal is permanent: it cannot be
renamed or deleted. A named profile may be renamed in place; every live window
with that identity immediately receives the updated title and Island label.

Deletion is intentionally explicit: Settings requires the exact visible
profile name before main accepts the request. It closes every window in that
profile, removes all of its saved workspace records, clears normal and private
partition storage/cache/auth data, and removes its profile-local Favorites,
history, downloads record, and permission files. Downloaded files remain in
the location the user chose — a profile record is not authority to delete
arbitrary files. Device settings, telemetry, Personal, Profile Sync, and every
other profile are untouched. If that profile is the last live window, Blanc
opens Personal first so deletion cannot accidentally quit the app on
Windows/Linux.

The delete is journaled in a device-local `profile-deletions.json` marker and
the marker is flushed before any window closes. Workspace and profile-registry
removal are also synchronously flushed. A crash or cleanup error leaves the
marker in place; startup suppresses that profile's saved workspaces (rather
than falling them back into Personal) and resumes erasure before restoring any
window. The profile remains unavailable while cleanup retries.

## Tab lifecycle recovery decision

Reopen Closed Tab is a bounded, in-memory recovery stack owned by each window
runtime. It stores a non-private tab's URL, pin/mute state, group snapshot, and
tab position; reopening restores that local presentation and focuses the tab.
The stack is never persisted, so session restore remains the only recovery
surface for tabs that were still open at quit, and private activity never gains
a durable trail.

Runtime ownership is also the profile privacy boundary: a tab closed in one
window/profile cannot be reopened from another. Closing a secondary window
releases its tabs without adding them to any recovery stack; closing a window
means closing that workspace, not silently moving its tab history into Personal.

## Split view / Glance decision

Glance is a temporary second tab pane inside one window runtime. It chooses a
second tab already owned by that runtime, retains the primary tab as the
browser-controlled active tab, and lays the two views side-by-side. When the
usable page pane is narrow (notably with vertical tabs), it stacks them instead
of making unusably thin columns. Clicking or selecting the Glance tab promotes
it and swaps the two local roles.

Glance state is intentionally in-memory and is not included in session restore
or Tab Sync. The native View menu opens or closes it; closing a Glance tab
returns its sibling to full-page bounds. Because both tab ids are verified
against the same runtime, it cannot show another window or profile's content.

## Accessibility decision

The trusted desktop UI now has a rendered Electron accessibility gate rather
than relying on markup inspection. A version-locked axe-core development
dependency is injected only by the test harness; it is not packaged. The gate
covers chrome, dynamic overlay modes, onboarding, internal pages,
light/dark/private contrast, dialog focus, grouped/vertical tab semantics, and
utility reflow at the 320 CSS-px target. It runs in CI and in
`release:verify:press`.

The resting Island is a toolbar with a dedicated command-surface button, so it
no longer nests interactive controls inside a synthetic parent button. Its tab
dots retain the 6px visual marker but own a real 24px target. Overlay rows use
native buttons (or a primary button plus sibling actions) instead of
pointer-only clickable divs; permission prompts and secure pickers expose
dialog/group/radio semantics and explicit focus. Form labels, landmarks,
current-page state, live status regions, and light/dark/private contrast are
part of the same gate.

Cross-`WebContentsView` reading order, native menus/dialogs, VoiceOver/NVDA,
forced colors, and compositor-level contrast remain manual because axe cannot
observe them. The required release checklist and the narrow partial-document
rule exceptions are documented in `docs/accessibility.md`.
