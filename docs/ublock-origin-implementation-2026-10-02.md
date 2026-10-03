# Full uBlock Origin internal candidate — 2026-10-02

This branch implements a managed full **uBlock Origin 1.75.0** provider in Blanc's
existing official Electron shell. It is an internal functional candidate, not a
released or certified platform capability. Blanc Blocker remains the default and
protects private tabs. No Lite substitution, general extension store, runtime
fork, new telemetry, or first-party license change is introduced.

The isolated branch is `codex/ublock-origin`, based on `origin/main`
`8e48359fae44865857a5bd3a8a955af96af71650` (Blanc 1.26.0). The package, lockfile and
installed runtime on that baseline use official **Electron 44.5.1**. The runtime,
UI, packaging gates and unit coverage are saved in local commits `bdcdbc9c`
and `6565bd33` (startup status and explicit native profile-storage erasure). The same
functional uBO suite also passes on a separately downloaded, official **44.4.5**
binary to reproduce the older plan's requested runtime. The old 44.4.3
[feasibility report](ublock-origin-feasibility-2026-10-02.md) is historical
investigation evidence. Its polling/arbitrary-evaluation transport is not
included in this candidate or its package. The original working checkout and
its unrelated changes were left untouched.

The behavior references are Raymond Hill's [official wiki](https://github.com/gorhill/uBlock/wiki),
[filter-list documentation](https://github.com/gorhill/uBlock/wiki/Dashboard:-Filter-lists),
and [advanced settings](https://github.com/gorhill/uBlock/wiki/Advanced-settings).
The user-linked ublockorigin.com identifies itself as unaffiliated. Electron's
[extension documentation](https://www.electronjs.org/docs/latest/api/extensions)
and [supported API list](https://www.electronjs.org/docs/latest/api/extensions-api)
describe partial support; loading an extension is not the acceptance gate.

## Implementation

- `blocking-coordinator.js` is the sole native request-listener owner. Both
  providers participate in the lifecycle/request/site/count contract. The Web
  Store crash guard, startup gate, client hints and navigation-method tracking
  remain browser policies through provider changes and teardown.
- `blocking-providers.js` snapshots the active provider at startup. Device-local
  selection, active status, failure, unavailable status and restart pending are
  exposed to Settings. `adblockProvider` and native uBO configuration are outside
  Profile Sync. Each provider retains its own site exceptions.
- The verified original extension loads only in normal profile sessions, with
  stable managed paths and explicit per-launch loading. Atomic extraction
  repairs interrupted/corrupted installs. A separate tiny native CSS helper
  supports document-targeted injection without altering Electron.
- `ublock-registry.js` owns stable logical tab IDs across quiet/wake and
  held/reopened views, live WebContents mappings, frame ancestry and lifecycle
  records. Private and foreign-profile contents are excluded. OAuth children
  belong to their owning ordinary profile; profile deletion closes remaining
  owned child windows before unloading extensions and clearing storage.
- The sandboxed bridge uses reserved extension ports and a fixed, typed IPC
  allowlist. Main validates the exact session, sender, frame, URL and current
  bridge. Injection and content messaging revalidate current documents; stale
  or cross-profile operations are rejected. There is no arbitrary evaluation
  operation. Verified uBO script injection still uses native extension APIs,
  with fixed document probes and guarded execution.
- Every request lifecycle hook, headers, redirects, initiator and frame metadata
  routes to the upstream engine. Blocking decisions have a two-second deadline;
  timeout/background loss cancels affected requests and marks failure. Pending
  work, CSS, ports and local error records have explicit bounds. Diagnostics
  contain provider/version/error codes only.
- The Island opens the original popup in an anchored sandboxed view. Dashboard
  and logger are managed profile tabs. Native context menus invoke original uBO
  handlers. Site commands use the active provider; private tabs use Blanc
  exceptions and counts. Island counts represent blocked requests.
- The global switch stops new filtering, shuts down cosmetic observers and
  removes owned CSS. Existing scriptlet/DOM effects require a user reload.
  Provider/site operations never automatically replay POST navigations.
- Automatic filter-data updates and subscriptions remain enabled, including
  offline cached data. Executable resource updates and custom resource URLs
  are disabled and clamped on settings/import. Bundled resources remain
  verified release inputs. Cloud storage and unavailable browser privacy
  controls display their actual availability. Blanc's DNS, WebRTC and
  permission policies remain authoritative.
- Managed uBO state and ordinary website service workers survive migration;
  named profiles retain separate native storage. Confirmed deletion stops list
  updates and explicitly clears native extension storage before unload; ordinary
  session storage/cache clearing then removes extension-origin data. Cleanup also
  covers a prior uBO profile after switching to Blanc and preserves the deletion
  marker when native erasure fails. Failed initialization offers
  retry, Blanc selection for restart, or explicit continuation without blocking.
  Settings recovery releases the same startup controller/gate as the start page;
  a later background failure only restarts the provider. No provider is silently
  substituted.

## Reproducible input and distribution gate

The official 1.75.0 Chromium ZIP digest is
`393cf95709d1074d4022970e9014e434395c53a822387f1e25f43be97cf4b582`.
All **658** unpacked files are hash-pinned; the source-tag archive, GPL text,
modified-file notices, host sources, reproducible patch and output hashes are
included and checked in the actual ASAR. Filtering-engine modules and bundled
scriptlet resources remain upstream bytes. See [the reproduction instructions](../ublock/README.md).

**Public distribution fails closed.** The concrete
[GPL/source/notice assessment](ublock-origin-distribution.md) does not yet
establish complete preferred source for every bundled component, all notices,
or the combined-work boundary for the purpose-built host and browser. Matching
644/658 release files to the source archive is useful evidence, not clearance.
The four fields in `ublock/distribution.json` remain false. MIT for Blanc-owned
files and reserved identity rights are preserved; no license waiver is assumed.

Ordinary packaging and release workflows reject uncleared distribution. An
explicit internal build embeds `blancUblockInternalValidation` in the integrity-
protected package so the owner can inspect the candidate. Public builds reject
that marker, including a stale marker from existing package metadata. A process
environment flag cannot activate uBO in a public installed build. No public
release, updater metadata, deployment or native signing was performed.

## Verification completed locally

- Lint, substrate checks and the complete unit suite: **2,062 tests passed**.
  Coverage includes storage readiness failures, public build-marker enforcement,
  provider notifications, startup retry/continuation and a private-session
  disable made during initialization, plus crash-resumable deletion after
  switching back to Blanc.
- The dedicated `npm run test:ublock:desktop` passes on macOS arm64 with official
  44.5.1, and again with official 44.4.5. It runs with real blocking enabled,
  unlike the ordinary `BLANC_TEST=1` path. Blocked fixture requests never arrive
  at the fixture server; allowed controls do.
- The suite exercises original popup/site controls; all seven dashboard panes;
  custom filters; cosmetic and procedural filtering; bundled scriptlets and
  redirects; CSP/header handling; strict-block pages; dynamic rules; logger;
  context-menu construction and original picker/zapper handlers; subscription
  import and update; backup/restore and executable-resource rejection.
- It also exercises nested frames, redirects, POST preservation, quiet/wake
  stable identity, held/reopened views, multiple windows/profiles, named-profile
  deletion, OAuth children, private request/map/logger isolation, global off,
  two-second decision failure, native background crash/retry, repeated helper
  teardown, offline cold launch, identity/storage persistence and preservation
  of ordinary website service workers.
- Native extension background sandboxing is independently checked via Electron
  process metrics; the ready handshake confirms no Node `require`/`process`.
  All Blanc-controlled views retain sandboxing, context isolation and disabled
  Node integration. The background/session-preload errors from the prototype
  are absent in the passing suite.
- Existing Web Store guard, DNS, OAuth, cold-launch and macOS close-last-window
  smoke suites pass. The complete runnable desktop acceptance suite passes:
  **168 scenarios / 1,005 steps**. It exposed an extra import-state broadcast
  caused by provider notifications on unrelated settings writes; the fix and a
  targeted regression test preserve the one-broadcast 500-tab import boundary.
- A final **unsigned internal macOS arm64 directory build** passes actual ASAR
  uBO source/license/host/adaptation verification, existing Blanc filter and
  capture-payload checks, third-party notice/SBOM checks and fuse configuration.
  This is package-content evidence, not signed installation acceptance.

Logs are local in `/private/tmp/ubo-*`; they are not added to runtime telemetry.
The passing functional runs recorded startup readiness at 1,596 ms (44.5.1)
and 1,783 ms (44.4.5), and an allowed fixture resource duration of approximately
18 ms and 16 ms respectively. Aggregate renderer working sets were roughly
2 GB for the many-tab tool/lifecycle fixture. These single runs are diagnostic
samples, not an idle-browser benchmark or acceptable release performance budget.

## Support matrix and remaining gates

| Target | Runtime / uBO | Current evidence | Selection in public builds |
| --- | --- | --- | --- |
| macOS arm64 | Electron 44.5.1 / uBO 1.75.0 | Functional suite and unsigned payload pass locally | Disabled |
| macOS x64 | Electron 44.5.1 / uBO 1.75.0 | Native desktop and installed candidate pending | Disabled |
| Windows x64 | Electron 44.5.1 / uBO 1.75.0 | CI/private signed candidate and installed testing pending | Disabled |
| Linux x64 | Electron 44.5.1 / uBO 1.75.0 | CI/AppImage and actual renderer sandbox testing pending | Disabled |

`ublock-platforms.json` leaves every gate disabled. The dedicated pinned-action
CI workflow covers the functional suite on macOS arm64/Intel, Windows and Linux; those jobs
have not been dispatched from this local branch. The two Mac runner labels follow
[GitHub’s current runner reference](https://docs.github.com/en/actions/reference/runners/github-hosted-runners). Existing private validation
workflows verify native payloads and signatures and retain direct/integrated-
menu AppImage sandbox checks. No hosted CI result is claimed.

Before enabling any platform:

1. Clear the concrete GPL distribution/source/notice gate and bind complete
   source to distributed bytes. Preserve first-party MIT and identity terms.
2. Run actual native mouse/keyboard checks of popup focus, dashboard, picker,
   zapper, logger, context menus and backup/restore in installed candidates.
   The functional suite drives upstream DOM handlers in real native extension
   documents. Native input acknowledgements stalled while destroying the
   picker iframe during earlier 44.4.5 runs, so they are not certified by the
   functional pass. The Mac was locked during attempts to inspect this; owner
   unlock/native inspection remains pending.
3. Complete signed/notarized macOS and signed Windows installed confirmation,
   Linux direct and integrated-menu AppImage renderer sandbox evidence, native
   close-last-window/relaunch, persistence, permissions, DNS/OAuth and updater
   handoffs as required by the release protocol. Simulated platform tests cannot
   replace affected-machine confirmation.
4. Obtain Intel Mac execution evidence from the dedicated job and installed
   candidate. Confirm same-profile multiwindow and subframe popup
   attribution: Electron's window-open API does not supply the opener frame ID;
   the host reports an honest unknown (`-1`) rather than inventing ancestry.
5. Complete automatic update cadence/expiry and interrupted version-upgrade
   acceptance, exhaustive failure/forgery/queue saturation, extended teardown
   soak and startup/latency/memory comparison against the default provider.
   Fixture subscriptions prove fetch/update/compilation and offline use;
   they do not certify an hours-long unattended update cycle.
6. Obtain explicit installed-candidate confirmation on every affected platform
   before merge/tag/release, and run the existing immutable release, signing,
   notarization, authenticated manifest, provenance and updater gates.

This report is engineering evidence for review. It does not justify publishing
full-platform support or claiming the entire implementation/release plan done.

## Local evidence records

The final runtime checks are bound to the above local runtime commits; these logs remain
on the operator's machine rather than being uploaded as browsing diagnostics:

| Check | Local record | Result |
| --- | --- | --- |
| Unit suite | `/private/tmp/ubo-unit-delivery.txt` | 2,062 passed |
| Substrate | `/private/tmp/ubo-substrate-delivery.txt` | Passed |
| Runnable desktop | `/private/tmp/ubo-acceptance-delivery.txt` | 168 scenarios, 1,005 steps passed |
| Full uBO, Electron 44.5.1 | `/private/tmp/ubo-desktop-delivery.txt` | Passed |
| Full uBO, Electron 44.4.5 | `/private/tmp/ubo-44.4.5-delivery.txt` | Passed |
| Unsigned internal payload | `/private/tmp/ubo-package-delivery.txt` | Passed |

The actual ASAR's `main.js`, provider manager, recovery helper and Blanc blocker
bytes were additionally compared to the reviewed checkout. The internal marker
is present and native fuses are configured. Signed installation, native input,
remote CI and updater handoff evidence remain pending as listed above.
