# Tab handoff in the Chromium fork: design

Status: **approved by the owner, 2026-11-16, with D1–D3 as proposed** (Blanc Beta does not claim the link type; build now; reuse the service's AES-GCM helper). Row N20 in `chromium/tracker.json`; plan item K7 in `docs/superpowers/plans/2026-11-16-macos-fork-remaining-work.md`.

## 1. What this is

Tab handoff is how the Bring Your Tabs browser extension sends a person's open tabs from another browser into Blanc. The extension uploads an encrypted list to Blanc's relay, then opens a `blanc-import://tabs?v=1&id=…&key=…` link. Blanc receives the link, claims the list from the relay once, decrypts it with the key from the link, shows what it found, and opens the tabs only after the person chooses to.

Shipping Electron Blanc has this. The fork has none of it: no `blanc-import:` link type, nothing that takes such a link, no claim or decryption code, and no handoff page. The other half of row N20, the tab import page (Bring Your Tabs from a browser's files, Arc import), is already built in the fork and passes shipping's scenarios (F40 15 of 15, F45 7 of 7).

## 2. What shipping does (the contract to match)

All from shipping at `8a4e57e78`.

| Step | Shipping | Source |
| --- | --- | --- |
| Link shape | `blanc-import://tabs?v=1&id=<16 bytes, base64url>&key=<32 bytes, base64url>`; exactly those three parameters, each once; no path, port, user, password or fragment | `src/main/tab-import-handoff.js` `parseTabImportUrl` |
| Intake | From the OS (`open-url`, startup arguments, a second instance). One handoff at a time: a link arriving while one is loading waits as its replacement; one arriving while a list is on screen only brings that sheet forward | `main.js` `queueTabHandoff`, `processTabHandoff` |
| Window | The focused ordinary window, else another ordinary window, never a Mini Window; a link arriving with no window is kept until one opens | `main.js` `tabHandoffRuntime` |
| Claim | `POST https://tabs.blancbrowser.com/v1/handoffs/<id>/claim`; no credentials, no cache, no referrer, redirects are an error, 10-second limit, `Accept: application/json`; the response is read with a size limit and the relay deletes the record on the first claim | `main.js` `claimTabHandoff`; `tabImportClaimUrl`; `readBoundedResponseBytes` |
| Envelope | `{v: 2, algorithm: 'AES-GCM', iv: 12 bytes, ciphertext: 16 bytes to 256 KiB, expiresAt}` | `validateEncryptedEnvelope` |
| Decryption | AES-256-GCM with the link's key; additional data is the JSON text of `["blanc-tab-handoff", 2, id, expiresAt]`; the key bytes are zeroed after | `decryptTabHandoffEnvelope` |
| Lifetime | `expiresAt` must be in the future and at most 10 minutes ahead, checked after decryption | same |
| Contents | `sourceBrowser` one of chrome, edge, brave, opera, vivaldi, firefox, safari; 1 to 100 tabs, more is an error, never a silent cut; each address http or https, at most 2,048 characters, no user or password; titles at most 200 characters; rows that fail are skipped and counted; exactly one active tab (none means the first, more than one is an error) | `sanitizeTabHandoff`, `sanitizeImportUrl`, `normalizeTitle` |
| What the page sees | The source browser, the profile's name, the skipped count, and per tab only a title, a host name and whether it is the active one. Never a full address | `main.js` `pendingTabHandoffProjection` |
| Choices | **Open here**, **New window**, Cancel. Cancel, Esc or closing the sheet discards the list; the relay record is already gone | `tab-handoff.html`, `cancelPendingTabHandoff` |
| Applying | The tabs open quiet (not loaded) in one batch that either all lands or none does; the active one is selected | `createQuietTabsBatch` |
| Errors | Nine fixed messages (expired or wrong clock, too many tabs, no eligible tabs, more than one active, could not verify, unavailable or already used, offline, official builds only, generic) | `tabHandoffErrorMessage`, `handoff.error.*` |
| Other builds | A renamed build does not use Bananify's relay | `bananify-services.js` |

## 3. Design for the fork

### 3.1 Where each part runs

| Part | Runs in | Why |
| --- | --- | --- |
| Recognizing the link | Browser process, native: a string check for the `blanc-import:` scheme only | Nothing is parsed in the privileged process |
| Parsing the link, validating the envelope, decrypting, checking the lifetime, cleaning the list | The sandboxed V8 service the fork already uses for Sync and tab import, running shipping's `tab-import-handoff.js` unchanged inside a generated bundle | The same boundary Sync and import use: untrusted bytes are handled in a process with no file or network access of its own |
| The claim request | Browser process, through the service's host `Fetch` | The host refuses every address except the one claim URL built from the validated id |
| The list while it waits for a choice | Browser process memory only | Never on disk, never in Sync, never sent to a renderer in full |
| The handoff page | The Island's utility sheet, shipping's `tab-handoff.html`, `.js` and `.css` generated like the other sheet pages | Same page, same strings |
| Opening the tabs | The fork's existing quiet batch (what tab import applies with) | Already all-or-nothing |

Concretely:

- **`HandoffRunner`**, modeled on `TabImportRunner` (`tab_import_runner.inc`): one short-lived service per handoff, the handoff bundle checked against a pinned SHA-256 before it starts, a 30-second overall limit, no stores, no account. Unlike the import runner, its host allows exactly one `Fetch`: method `POST`, the URL equal to `https://tabs.blancbrowser.com/v1/handoffs/<id>/claim` for the id the service already validated, no body, credentials omitted, cache off, redirects an error (as the Sync proxy's `Fetch` does today), a 10-second timeout, and a response capped at shipping's limit (`ceil(256 KiB × 4 / 3) + 2048` bytes). Any other call is refused.
- **Decryption needs one addition to the service.** Its AES-GCM helper takes no additional data today (`sync_runner_service.cc` `Gcm` passes none), and handoff authenticates the id and expiry that way. The helper gains an optional additional-data argument; Sync's calls are unchanged. The bundle's shim maps `crypto.webcrypto.subtle` decrypt onto it, as the Sync bundle's shims do for its own crypto.
- **Intake** goes where external links already enter: `blanc_prototype::OpenExternalLink` (startup URLs, patch 0066) and the macOS open-URL path. A `blanc-import:` URL never becomes a navigation, a tab or a history entry. Everything after "is this the scheme" happens in the service.
- **Queueing** follows shipping exactly (§2 Intake), with the state held per browser process: none, loading, waiting, ready, error.
- **The sheet** opens over the chosen window through the existing utility sheet, with the same projection shipping gives the page: titles and host names only.
- **Relay origin** is a constant, `https://tabs.blancbrowser.com` (it keeps the old name on purpose; shipped browsers refuse redirects on it). No setting or switch changes it outside a test launch.

### 3.2 Which builds claim the link type

`blanc-import:` belongs to the shipping Electron Blanc today. macOS gives a link type to one app. If Blanc Beta also claimed it, the Bring Your Tabs extension's link could open the beta instead of the Blanc a person actually uses, with no way for them to tell why.

**Proposed (decision D1):** build and test the whole flow now, but Blanc Beta and the preview build do **not** register `blanc-import:` in their Info.plist. The replacement build (bundle `me.bnfy.bowser`) registers it, because it takes over from the Electron app. Until then the flow is reachable in the fork only through its test hook. `chromium/blanc/branding/beta/metadata.py` already strips link types the beta must not own; `blanc-import` joins that list, and `chromium/release/policy.mjs` checks it.

Consequence: beta testers cannot use the extension to send tabs to the beta. They still have Bring Your Tabs from a browser's files.

### 3.3 Other builds

Shipping refuses the relay in a renamed build. The fork does the same check where it already decides whether a build is Blanc's own (the telemetry and Sync code make the same distinction); a build that is not gets shipping's "official builds only" message and makes no request.

## 4. Security boundary

What an attacker controls: the link (any app or web page can ask macOS to open one) and, if they run the relay or sit on the network past TLS, the response.

| Threat | What stops it |
| --- | --- |
| A crafted link makes Blanc load or run something | The link never navigates. Only an id and a key leave it, both length-checked in the sandbox. The only request is to the fixed relay origin |
| A link makes Blanc contact a host of the attacker's choosing | The claim URL is built from a constant origin and the validated id; the host refuses anything else and refuses redirects |
| A page opens tabs without the person agreeing | Nothing opens until they choose Open here or New window on Blanc's own sheet. The sheet shows the count, source browser, titles and host names first |
| The list carries `javascript:`, `file:`, `chrome:` or credentialed addresses | Only http and https without user or password survive cleaning; the rest are skipped and counted |
| A huge or malformed response | Size limits on the response and the ciphertext, a 100-tab ceiling that fails instead of trimming, and all parsing in the sandbox |
| A replayed or stale link | The relay deletes on first claim; the expiry is authenticated by the cipher and must be within 10 minutes |
| The key or the list leaks | The key is passed to the service and never logged, stored or shown; the list lives in memory until the choice and is dropped on Cancel, Esc, sheet close and quit. The page never receives full addresses |
| Repeated links used to nag or flood | One handoff at a time; a second link only refocuses the open sheet; one queued replacement at most |
| A private window | The tabs open as ordinary tabs in an ordinary window's profile, as shipping; the sheet never opens over a Mini Window |

New outbound traffic: one host, `tabs.blancbrowser.com`, only after a person follows a handoff link. The beta's outbound check (`chromium/tests/outbound/analyze-beta.mjs`) does not need to allow it under D1, because the beta never receives a link; a replacement-channel run adds it for the one scenario that uses it.

## 5. Tests

Unit (`node --test`, no browser):
- The generated bundle equals shipping's module at the pin, and its SHA-256 is pinned (as `sync-bundle.test.mjs` does).
- Shipping's own vectors for `parseTabImportUrl`, `sanitizeTabHandoff`, `validateEncryptedEnvelope` and the expiry rule, run against the bundle.

Native (`chromium/tests/native-tab-handoff.mjs`, on the Prototype with a local stand-in relay; the relay origin is replaceable only under a test launch):
1. A valid handoff shows the sheet with the right count, source browser and host names, and no full address in the page.
2. Open here opens the tabs quiet, in order, with the active one selected; New window does the same in a new window.
3. Cancel opens nothing, and the same link a second time gets the "already used" message (the stand-in deletes on claim).
4. Each error: wrong key, changed ciphertext, expiry in the past and more than 10 minutes ahead, 101 tabs, no eligible tabs, two active tabs, relay offline, a redirect from the relay, an oversized response.
5. A list containing `javascript:`, `file:` and a credentialed address opens only the web ones and reports the skipped count.
6. The host refuses a second request and any request to another address (asserted from the stand-in's log and the host's refusals).
7. A second link while a sheet is open refocuses it; a link while one is loading waits and then runs.
8. A link is never a tab, a history entry or a navigation.

Release checks: `policy.mjs` asserts the beta's Info.plist does not list `blanc-import`.

Not testable here, for the owner: the real extension to a replacement-channel build, end to end.

## 6. Decisions for the owner

| # | Decision | Proposed |
| --- | --- | --- |
| D1 | Does Blanc Beta claim `blanc-import:`? | **No.** Only the replacement build does (§3.2) |
| D2 | Build it now or with the replacement work? | **Now**, since it is a replacement gate and independent of the importer; it stays dormant in the beta under D1 |
| D3 | Reuse the Sync service's AES-GCM helper with an added additional-data argument, or give handoff its own? | **Reuse**, one optional argument; Sync's behavior does not change, and its tests cover that |

## 7. Out of scope

- Windows and Linux: registering the scheme in the installer and the desktop entry, and their intake paths, belong to those forks.
- The relay Worker and the extension: unchanged.
- The tab import page: already built.
- Any change to shipping Electron Blanc.

## 8. Size

About the size of the Ctrl+Tab work: one new native file (the runner and the queue), a small change to the sandbox service, the bundle and page generation, one patch (link intake), the strings, and the tests. Three or four incremental builds.
