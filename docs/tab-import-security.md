# One-time tab handoff security model

Status: implemented on PR #305; release and deployment remain pending.

## Relationship to Bring Your Tabs

This live handoff supplements PR #205's Bring Your Tabs workflow; it does not
replace it. Bring Your Tabs remains the in-Blanc migration and organization
experience for saved Chromium sessions, including eligible source groups and
pins. The handoff is an additional source path for live metadata from ChatGPT,
Firefox, and Safari, with its deliberately smaller payload and confirmation UI.

The routes are separate: Bring Your Tabs owns `blanc://tab-import/`, while the
relay confirmation owns `blanc://tab-handoff/`. Both converge on the same
transactional quiet-tab batch primitives in `tab-import-apply.js`,
`tab-import-batch.js`, and `createQuietTabsBatch` in main. Batch creation and
rollback are shared; each entry path owns its destination, activation choice,
and confirmation lifecycle. Bring Your Tabs applies to its owner window and
profile; handoff creates a new scratch window.

PR #205 merged into main at `e0206323894a4d986653a4adeeaa377a8229bcf7`.
This incremental follow-up keeps its local wizard, bounded Chromium session
reader, source-group/pin preservation, organizer, entry points, documentation,
and historical evidence intact. Migration scenarios now use F40 because F39
already identifies certificate safety. Historical PR evidence is not handoff
release evidence. On-device embedding inference remains disabled; there is no
new model download or inference dependency.

Replacing either utility sheet cancels only its own pending import. Local
source-file reads are bound to a request identity, window, and surface generation;
a read completing after cancellation, replacement, or window closure cannot
recreate a session. Selecting another source also invalidates an earlier read.

## Data boundary

A handoff contains only version, source browser, ordered HTTP(S) URLs, bounded
titles, and one active-tab marker. URLs with credentials, non-web schemes,
browser-internal pages, private windows, and empty results are rejected.
Duplicates and fragments are preserved. Titles and URLs are always untrusted
data and are rendered with text-only DOM operations.

The ChatGPT path necessarily exposes the selected metadata to ChatGPT/OpenAI
and to the Blanc MCP request handler. The handler validates and encrypts it
immediately and must not enable request-body logging. The Firefox and Safari
WebExtension paths encrypt in the source browser before upload and request only
the `tabs` permission plus access to the relay origin; they have no content
scripts or visited-site host permissions.

## Capability and relay

Each source generates an independent random 128-bit ID, 256-bit AES-GCM key,
and 96-bit IV. The relay stores only the versioned ciphertext envelope and its
expiry. The storage relay never receives the key; the MCP handler necessarily
generates the ChatGPT path's key transiently before staging ciphertext. The ID and key travel in the HTTPS landing
page fragment and then as opaque values in `blanc-import://tabs`; tab metadata
never appears in either URL.

The v2 ciphertext envelope has an integer `expiresAt` (Unix milliseconds).
AES-GCM authenticates the UTF-8 JSON tuple
`["blanc-tab-handoff",2,id,expiresAt]` as additional data. Payload and launch-link
versions remain v1; legacy ciphertext envelopes are rejected. Sources choose
expiry ten minutes ahead; neither upload nor retries extend it. The relay
rejects past expiries and expiries more than ten minutes ahead. Blanc verifies
authentication and expiry before presenting metadata; a clock mismatch asks
the user to check their device clock and create a new handoff.

The landing page clears its fragment before user interaction and loads no
analytics. The relay caps ciphertext at 256 KiB. A claim transaction removes
ciphertext and replaces it with an expiry-only used-ID marker, whether or not
the caller has the correct key. Restaging is refused until the original expiry;
the alarm then removes the marker. No permanent used-ID log is kept. After
cleanup, unchanged ciphertext is expired, and changing its expiry or ID fails
desktop authentication. State and alarm changes are transactional, and stale
alarm delivery cannot delete a newer record. Unknown, expired, and replayed
claims share one generic response.

Both upload paths check the per-IP request quota before reading the body and
charge consumed chunks (including rejected oversized chunks) against the byte
quota. Byte charges do not count as additional requests. Requests fail closed
when rate-limit storage is unavailable; the same condition on claims returns
the generic unavailable error. Rate records have a separate, short-lived
minute-bucket retention and contain no tab data.

## Desktop trust boundary

Only the packaged app registers `blanc-import`. Cold-start arguments, macOS
`open-url`, and running-app second-instance delivery enter the same strict
parser. Import links never go through ordinary tab navigation. Blanc allows
one pending import globally; another valid invocation only focuses the current
review and remains unclaimed so it can be retried before expiry.
If the previous sheet was canceled while its retrieval is still settling, one
replacement link waits visibly without being claimed. Further invocations focus
that waiting sheet. Canceling it discards the replacement; otherwise retrieval
starts after the previous request finishes or reaches its ten-second timeout.
Request identities prevent stale results from publishing into a newer sheet.

The main process claims only from the pinned relay origin with Electron
networking, a ten-second timeout, redirect refusal, no cookies, and a bounded
response. It decrypts and revalidates before exposing only title, domain,
source, profile name, and active state to a least-privilege utility preload.
Accept and cancel are the only mutations. Cancel clears the in-memory payload.

Accept creates a new regular, ungrouped, unpinned scratch window in the
resolved local profile through the shared Bring Your Tabs batch transaction.
All imported tabs are constructed quiet; activating the source-selected tab
creates the window's only live renderer. Intermediate per-tab broadcasts and
persistence are suppressed, and the complete window is published and persisted
once after activation succeeds.

## Remaining release gates

Post-merge verification (September 7, 2026) ran on the incremental follow-up to
`e0206323894a4d986653a4adeeaa377a8229bcf7`, using main's unchanged version 1.15.1,
lockfile, and Electron 44.2.0. All 1,559 unit tests, 141 runnable macOS Electron
scenarios (865 steps), and the combined migration/handoff smoke passed. The
acceptance dry run resolved every selected step. Firefox lint reported zero
errors, warnings, or notices, and its unsigned archive built. The Worker
dry-run, plugin-package validator, site build/SEO checks (25 pages, 24 sitemap
URLs), and unsigned Xcode Release companion build passed. Unit checks confirm
that the generated Safari resources match the shared extension byte-for-byte.

The incremental patch preserves main's dependency/security updates, Mahjong
fixes, release records, migration design documents, and existing screenshots.
Both import paths retain separate data-inventory entries. It reuses the existing
`dismissUtilitySheet: false` activation option for late chrome readiness instead
of adding a competing preservation flag. That reconciliation verification did
not deploy, sign, submit, push, or release the integration.

The local SQLite-backed check is now reproducible with `npm run test:runtime`
in `cloudflare/tab-import-worker`. Its five passing tests exercise the actual
Wrangler bundle and migrations, including concurrent staging/claims, object
eviction, real expiry-alarm cleanup, companion/MCP encryption, and desktop
authentication. The `tab-handoff` parity job runs it alongside Firefox checks
and the Electron handoff smoke without deployment or signing credentials.
Local success does not by itself establish hosted CI or packaged acceptance.

Pre-merge verification (`c3a3eb44`, September 7, 2026): all 1,559 unit tests and all
141 runnable macOS Electron scenarios (865 steps) passed on the reconciled tree.
The local Electron scenarios cover
saved-session import, source order, duplicate tabs, groups and pins, a 500-tab
quiet batch, owner/stale-generation refusal, cancel, onboarding, and Favorites
regressions. The combined handoff smoke exercises both screens in one app,
mutual cancellation on replacement, shared single-broadcast quiet creation,
and an isolated ungrouped handoff window without altering the local import.
These are development-build checks, not packaged or signed acceptance.

The reconciliation retains the current profile-deletion order in the acceptance
harness rather than PR #205's older pre-close workaround; the latter raced
native cleanup. The added Billboard entry also uses a document-flow compact
layout with its footer at short window heights, preserving reachability through
the existing size-boundary assertions (including 640×480). Upload quota tests
now use a fixed clock so crossing a real minute boundary cannot reset their
single-bucket fixture unexpectedly; production limiter behavior is unchanged.

Local review-fix verification (September 7, 2026): the full unit suite, expanded
macOS Electron handoff smoke, Firefox lint/build, worker dry-run, site/SEO build,
and unsigned Xcode Release companion build passed. Safari resources are checked
byte-for-byte against the shared extension. A local SQLite-backed Workers
runtime also verified upload, concurrent claims, desktop v2 decryption, and
restage rejection. These checks do not establish signed or packaged release
acceptance; no deployment, signing, submission, or public release was performed.

PR #305 packaged follow-up verification (September 7, 2026): private validation
run 34161683726 passed the Linux AppImage and signed Windows NSIS builds,
packaged blocker/compliance payloads, hardened fuses, live-media checks, and the
exact Windows publisher/timestamp gate. Validation mode uploaded short-lived
workflow artifacts only; it did not create or modify a GitHub Release. A local
macOS arm64 directory build passed the signing preflight, deep strict signature
verification, embedded-profile/entitlement checks, and packaged-resource check.
Its Info.plist retained the existing HTTP/HTTPS handler and added `blanc-import`
as a separate URL type.

`npm run test:packaged:tab-handoff-protocol` then launched that signed local app
through LaunchServices with a synthetic handoff URL. The production relay host
was resolver-pinned to loopback, so the run contacted no production handoff
record. Blanc accepted the cold-start `open-url`, rendered only
`blanc://tab-handoff/`, reported the expected offline retrieval error, and never
navigated an ordinary tab to `blanc-import:`. This is macOS packaged protocol
acceptance for the local candidate, not notarization or release evidence.

Installed-protocol validation run 34163183471 then passed on both native CI
platforms. The Windows test silently installed the Authenticode-signed NSIS
candidate, launched the installed executable, verified its per-user
`blanc-import` registry command, invoked the synthetic URI through Windows, and
observed the offline handoff sheet in the original instance. This gate exposed
and fixed a real omission: `build.protocols` did not create the Windows handler,
so packaged Windows now calls Electron's protocol-client registration on
startup. Development, macOS, and Linux do not take that registry-only path.
The Linux test verified the AppImage's embedded
`x-scheme-handler/blanc-import` declaration, installed a derived desktop entry
inside an isolated XDG directory, invoked it through `xdg-open`, and observed
the same sheet. Both asserted that no ordinary tab received the custom scheme.
The run again uploaded only three-day validation artifacts and touched no
GitHub Release.

Before public availability, verify the deployed Worker and domain challenge,
AMO-signed Firefox output, and the separately signed and notarized Safari
containing app plus its independently hosted update metadata. Repeat all three
packaged protocol checks against the final release artifacts, including the
notarized macOS app. The compatible desktop version must be public before the
plugin or companions. Those steps remain subject to Blanc's immutable release,
signing, updater-handoff, packaged-payload, and dated-evidence process.
