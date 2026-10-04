# uBlock Origin inside Blanc: feasibility investigation

Investigated October 2, 2026 at the owner's request.

**The core of full uBlock Origin can run inside Blanc's existing Electron shell
with a narrow compatibility adapter and request bridge. An unmodified extension
install does not work. The proof is experimental, with substantial integration
and release work still required.**

## What was tested

- Original uBlock Origin **1.75.0**, Chromium Manifest V2 release, downloaded
  from the official upstream GitHub release. ZIP size: 4,644,480 bytes.
- ZIP SHA-256 verified against the release API asset digest:
  `393cf95709d1074d4022970e9014e434395c53a822387f1e25f43be97cf4b582`.
- The locally installed official **Electron 44.4.3**, Chromium
  **152.0.7977.130**, on macOS. The working package and lockfile request
  **44.4.5**; the installed dependency is stale. These runtime results must not
  be attributed to 44.4.5 until repeated on that exact binary.
- Actual Blanc working checkout at HEAD
  `444fb9a8c6b1310bcdbd72d30764095743aadf3c`, including its pre-existing local
  changes. This is a working-checkout investigation, not public-release evidence.
- Fresh temporary profiles, sandboxed webpage/UI views, existing tab model and
  WebContentsViews. No changes to Electron or Chromium, no custom runtime, and
  no production source/dependency changes.

The repository's historical removal commit
`ef1208caae0f1d3a588339a9f5597d19ad4b55b7` was inspected. The former general
extension runtime included MV3 password-manager sanitization, native crashes,
and an unsandboxed browser-action preload. This investigation does not restore
that runtime or either removed dependency.

## Observed results

| Check | Result |
| --- | --- |
| Load original uBO with `session.extensions.loadExtension()` | Succeeds; Manifest V2 loads without special flags |
| Start original uBO's engine | Fails: missing `browserAction` is the first module error |
| Native required API availability | `webRequest`, storage, alarms, runtime messaging exist; several shell APIs are missing |
| Start engine with shell adapter | Succeeds, including uBO's first-install self-reload |
| Native extension requests with Blanc handlers installed | No request events delivered to uBO; filtered script reaches server |
| Native extension requests after clearing all three Blanc handlers | Test script blocked; native request events report `tabId: -1` |
| Narrow request bridge using Blanc WebContents IDs | Test script blocked before it reaches the server; allowed control script runs |
| uBO cosmetic filtering through content-script messaging/CSS adapter | Test element hidden; control element remains visible |
| Original uBO popup | Loads, identifies the fixture hostname, reports the correct tab's blocked script with the bridge |
| Original popup power switch | Clicking it restores the script and cosmetic element on reload |
| Dashboard | Outer navigation loads; inner panel remains `blank.html`, unresolved |
| Load extension in Blanc's in-memory private session | Rejected: `Extensions cannot be loaded in a temporary session` |
| Webpage and popup/dashboard preferences | `sandbox: true`, `contextIsolation: true`, `nodeIntegration: false` |
| Native extension background preferences | Electron returns `null`; background isolation/sandbox must be independently verified |

The core test selects only two deterministic custom filters. It does not
establish production blocking efficacy, full uBO feature parity, stability, or
Windows/Linux compatibility. uBO's original engine and UI scripts are retained;
only a temporary adapter script and its background-page script tag are added.

## Why merely loading the extension is insufficient

### Missing browser-shell APIs

uBO expects browser actions, context menus, navigation events, windows, and more
tab operations than Electron guarantees. The first failure is in `webext.js`
when it reads `chrome.browserAction.setBadgeBackgroundColor`.

The lab provides bounded tab queries/CSS operations, navigation metadata, and
records UI/menu intent. It explicitly rejects unsupported privacy-setting writes.
Those records are not a finished Island button, native menu, or privacy policy.

Chromium exposes distinct `chrome` and `browser` namespaces here. uBO prefers
`browser` and replaces its `chrome` reference, so the adapter must cover both.

### Request interception and tab identity

Blanc currently installs session handlers for the Web Store crash guard/blocker,
response-header filtering, and client-hints rewriting plus main-frame method
tracking. Native extension events remain suppressed even after clearing only
the first two handlers. Clearing the client-hints handler as well enables them.

The resulting native events label WebContentsView requests as `tabId: -1`.
uBO therefore sees them as background requests. A global blocking rule can work,
while per-site controls, accounting, and contextual filtering remain wrong.

The successful prototype instead owns Electron's request callbacks and passes
normalized request metadata, including Blanc's actual WebContents IDs, to uBO's
unmodified listeners. Its decisions become Electron callback responses. This
also makes one composition point possible for Blanc's existing request policies.

The experiment simplifies frames and commit ordering. Production must implement
accurate frame IDs, initiators, navigation generations, redirects, request bodies
where needed, headers, listener filters, and listener lifetime. The experimental
RPC pump and match-pattern implementation are unsuitable as production code.

### Background/preload incompatibility

Both minimal Electron and Blanc emit a native extension-background startup error:
`Cannot destructure property 'preloadScripts' of 'binding.startupData' as it is null`.
Blanc additionally applies `badge-api-preload.js` to that page, where
`contextBridge` reports that context isolation is not enabled. The engine can
run despite these errors, but they remain unresolved release blockers.

The native background exposes neither `require` nor `process` in the probe.
That observation is not a substitute for independently verifying its sandbox.
No relaxation of Blanc's webpage or chrome sandbox was used.

### Private sessions and storage lifecycle

Electron rejects extensions in nonpersistent sessions. Creating a persistent
partition for private browsing would change Blanc's privacy contract and is not
an acceptable invisible workaround. An initial product scope could limit uBO to
ordinary tabs while retaining Blanc Blocker in private tabs, clearly disclosed.
Equivalent uBO behavior in private tabs remains a separate unresolved problem.

Each ordinary local profile needs isolated extension settings and lifetime. The
current startup purge of legacy extension state must be reconciled deliberately.
The lab creates a new extension path/ID and profile each run; it does not verify
settings persistence or restart recovery.

## Full uBO versus Lite

The documentation baseline is the official `gorhill/uBlock` project and wiki,
and the official `uBlockOrigin/uBOL-home` project and wiki. The independent
`ublockorigin.com` guide is not an authority for this investigation.

The official uBO project still publishes Chromium Manifest V2 packages outside
the Chrome Web Store. Lite targets Manifest V3 and browser-managed declarative
network filtering. Its official FAQ treats it as a separate product with
different capabilities, rather than an automatic replacement for full uBO.
Chrome's MV2 removal does not by itself establish which option Blanc can host.
The runtime evidence above covers full uBO only; Lite's required Electron APIs
and actual behavior still need a separate compatibility test before choosing a
production integration.

## Recommended implementation direction

Build an optional **uBO-specific provider**, preserving the existing shell and
official runtime. Keep the existing blocker as the default until the candidate
has passed the complete gates below. Do not run two blocking engines against the
same page or restore a general Chrome Web Store extension host for this feature.

1. Define one blocking-provider interface and one request-policy composition
   point. Retain the complete Web Store guard, client hints, method tracking,
   startup navigation gate, exceptions, header policy, and blocker diagnostics.
2. Load a pinned upstream uBO package per ordinary profile before browsing is
   released. Give its background/popup a narrowly scoped host adapter; validate
   ownership, session, sender/frame, method, and data limits at every boundary.
   Production must not expose the lab's generic queue or arbitrary evaluation.
3. Integrate the original popup into a dedicated sandboxed view anchored to the
   Island, and finish the original dashboard, filter lists, custom filters,
   rules, logger, picker/zapper, and export/import behavior.
4. Resolve background/preload errors and privacy-setting ownership. Preserve
   Blanc's explicit permission policy; extension-page requests must not bypass
   it. Handle private tabs, profiles, quiet/woken tabs, held/closed tabs, new
   windows, and profile deletion explicitly.
5. Test exact Electron 44.4.5, performance under real request load, clean/unclean
   restart and crash recovery, persisted settings, real sites and default lists,
   frames, redirects, POST navigation, and packaged Windows/Linux behavior.

Upstream uBO retains its GPL-3.0-or-later terms. Packaging/adaptation needs its
own notices, source, and distribution review; do not describe the resulting
repository as blanket MIT or change Blanc's deliberate first-party MIT baseline.
No upstream code or extension package was committed by this investigation.

## Evidence and sources

- [Reproducible probe](../experiments/ublock-origin/README.md) and
  [recorded results](../experiments/ublock-origin/results-2026-10-02.json).
- [Electron 44.4.3 extension documentation](https://github.com/electron/electron/blob/v44.4.3/docs/api/extensions.md)
  documents partial extension compatibility, per-session unpacked loading,
  nonpersistent-session restrictions, and request-handler precedence.
- [Official uBO 1.75.0 release](https://github.com/gorhill/uBlock/releases/tag/1.75.0),
  [manifest](https://github.com/gorhill/uBlock/blob/1.75.0/platform/chromium/manifest.json),
  and [upstream license](https://github.com/gorhill/uBlock/blob/1.75.0/LICENSE.txt).
- [Official uBO project](https://github.com/gorhill/uBlock) and
  [documentation wiki](https://github.com/gorhill/uBlock/wiki).
- [Official Lite documentation](https://github.com/uBlockOrigin/uBOL-home/wiki)
  and [Lite FAQ](https://github.com/uBlockOrigin/uBOL-home/wiki/Frequently-asked-questions-%28FAQ%29)
  describe its MV3 filtering model and differences from full uBO.

Repository lint and the probe's syntax checks passed. The core-proof run asserts
server non-arrival, allowed content, cosmetic filtering, correct tab accounting,
and the original popup's power-switch behavior. This record authorizes no merge,
release, or public support claim.
