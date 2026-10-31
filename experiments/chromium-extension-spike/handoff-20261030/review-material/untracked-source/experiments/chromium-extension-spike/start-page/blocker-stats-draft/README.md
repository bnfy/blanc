# Start Page blocker-statistics investigation (unwired)

GitHub's latest published release was verified as v1.44.1, source `3b0c000b569ee33a1548dd1b9a60817fae9288a6`. This is a reference and integration design, not an active feature. No Chromium source, running app, profile, build output or Google baseline is changed here.

## Released behavior

`src/main/adblock-stats.js` calculates the local Monday 00:00 boundary and seven Monday-indexed day buckets. On first read or increment after the week changes, it lazily clears the total and buckets; each event increases both the total and the current local-day bucket. Bar heights are rounded percentages of the largest daily bucket, or all zero if the week has no blocks. A legacy record's total survives normalization even if missing or invalid buckets are replaced with zero. The lazy singleton in `main.js:6652-6667` is a device-scope `JsonStore('adblock-stats', ...)` rather than a profile store; `store.js` batches writes, bounds deferral to five seconds and flushes on quit. The Start Page reads the three values from `pages.js:613-620`, with no per-event statistics push shown in that path.

Counting is provider-specific. The Blanc engine's shared `request-blocked` listener increments the weekly device store **before** looking up a tab (`main.js:16212-16221`), so a missing tab does not prevent it. The same engine is attached to private sessions (`blocking-providers.js:69-75`), and that weekly callback has no private check. This source-level path therefore permits private Blanc events to contribute to persistent aggregate counts; it does not store the request URL or the private tab identity in that aggregate. The uBO callback (`main.js:14628-14632`) updates the regular tab count only, and does not increment this weekly total. Private Start Pages are passed the aggregate in `pages.js`, but the shipping renderer hides blocked counts in Billboard, Shelf and Tally, and hides the footer count (`newtab.js:749-751, 875-879, 916-918, 1766-1768`). These are source findings, not a freshly observed private-browser experiment.

## Current Chromium and safe integration work

`prototype/newtab-adapter.js` returns `blockedThisWeek: 0`, omits both daily arrays, and thus never reflects real activity. `ShieldCountTicket` counts rule blocks against a live primary WebContents, rejects stale document callbacks and protects an individual ticket against repeated results. It is memory-only, resets on discard or renderer loss, and is used by URL loaders, navigation response/activation, sockets and WebTransport. It intentionally skips unassociated worker requests. It is a useful attribution primitive but does not, by itself, provide a persistent week counter: shipping weekly totals are not restricted to successfully attributed tabs, and separately constructed gate tickets are not a proven end-to-end request deduplication mechanism.

Proposed native integration work, **not yet wired**:

1. Give the blocker an authoritative, browser-owned event sink keyed to a valid regular BrowserContext; drop off-the-record, guest, system and unknown/destroyed contexts before any persistent write. Do not use `GetOriginalProfile()` to convert private events into regular data. This privacy-preserving choice differs from the released source's apparent aggregate behavior and must remain documented, not represented as exact count parity.
2. Deduplicate actual blocked requests across loader, navigation and activation gates using a stable request/navigation identity before incrementing; count only actual rule blocks, not engine loss, timeout, cancellation or policy refusal. Include sockets, transport, redirects and unassociated workers only when their identity and regular context are authoritative. Never infer a profile or tab from a host. Explicitly document any unavailable path instead of reporting a partial count as complete.
3. Store only a week boundary, total and seven daily integers; no URLs, request IDs or private activity. Prefer an appropriately registered profile/device preference with explicit ownership and bounded/coalesced writes, migration/version and corruption handling. The released store is device-wide, so profile scoping changes observable multi-profile behavior and needs a product decision. Avoid overwriting the user's existing unrelated files.
4. Compute calendar boundaries with local calendar arithmetic, including DST and timezone changes, not fixed 168-hour arithmetic. Capture the event time at the rule decision. On each read, atomically roll and project the three values through a trusted Start Page message; private pages must not reveal counts. Preserve shipping rounding and the released renderer's fallback behavior. Do not accept event counts from an untrusted renderer.
5. Qualify in synthetic regular/private profiles: real blocked and allowed loads, no double count across redirects/gates, socket/transport and unattributed workers, failure cases, private no-write, isolation across profile lifecycles, restart persistence, malformed state, Monday and DST boundaries, all three layouts and physical accessibility. Bridge-only tests do not establish product parity.

The included `shipping-adblock-stats.js` is the exact released pure module, retained for deterministic comparison, not an implementation wired into Chromium. `shipping-stats.test.cjs` checks source identity, lazy reset/day/chart values, DST and legacy normalization; its four focused tests pass. It does not verify native attribution, privacy enforcement, persistence, rendering, or deployment.

## Standalone weekly reducer draft

`weekly_stats.{h,cc}` implements a pure, unwired local-calendar reducer with legacy normalization, lazy Monday rollover, daily buckets and rounded bar heights. It uses ICU's timezone calendar rather than fixed-duration weeks, sets a proleptic Gregorian calendar, and changes the day-of-month field to match JavaScript `setDate`. No profile, persistence, browser or event sink is included. The caller must normalize malformed stored fields before recording, supply only validated numerical JSON types, and independently enforce trusted regular-context admission and request deduplication. Invalid time or explicit unknown timezone returns failure without mutation. This is a stricter API boundary than the raw JS helper and is not a storage migration.

`generate-calendar-vectors.cjs` generated 3,185 expectations directly from the released JS module in UTC, New York, London, Lord Howe, Kathmandu, Apia and São Paulo, including spring/fall DST, a half-hour DST shift, Apia's 2011 skipped day and historical Gregorian dates. `compile-standalone.py` built only this reducer and harness in durable evidence, linking existing Chromium 158 cached production objects and ICU data. The final executable exited 0 with all vectors and synthetic malformed/rollover/rounding checks passing. The first calendar attempt exposed a real Apia difference when ICU `add(date)` was used; the implementation now sets the local date field. Earlier standalone harness teardown aborted because `DCHECK_ALWAYS_ON` did not match cached-object ABI; matching that build flag resolved it. Failures and final output, commands and hashes are retained in `Chromium Preview/evidence/blocker-weekly-stats-20261028/`.

Tests use explicit named zones and one Chromium ICU dataset; they do not prove the default timezone updates when the operating system changes zones, or cover all historical timezone/version differences or the entire ECMAScript date range. Event attribution and cross-gate deduplication, private and guest isolation, persistence and write batching, device-versus-profile semantics, shipping's current private-count discrepancy, Start Page rendering and real browser tests remain unresolved. No count is deployed or accepted as parity.

### Browser-owned weekly preference/projection draft (October 28)

`browser_weekly_stats.{h,cc}` and `weekly_pref_store.cc` are isolated draft
code only: not staged, registered, linked to the browser, or exposed to any
renderer. The profile binding uses a weak pointer and requires the requesting
or event-source profile to be the identical live regular, non-OTR profile on
every operation; guest, system, private and other profiles cannot read or write
through it. Coverage is revoked by default and by the sink explicitly. A
privileged C++ sink must attest complete event coverage for the exact current
local week before projection or recording; a different week, invalid clock,
missing profile/prefs, and unknown or corrupt state return unavailable. This
attestation is a proposed interface, not proof of event provenance, an
implemented sink, or evidence that a partial week can be reconstructed. No
UI should report zero merely because the observer was absent, or re-attest
coverage after restart without independently proven continuity.

The draft codec stores a single versioned dictionary with only week start,
count and seven day counts; it rejects unknown schema, malformed data,
future-week state, counter overflow and inconsistent totals without
rewriting. Reads never write. Writes use one `SetDict` and report only that a
preference mutation was staged; this is not proof of a successful disk flush.
No event URLs or request IDs are stored. The adapter is not a substitute for
an actual validated native event source: path completeness, private-event
attribution, duplicate event suppression, observer lifetime/revocation,
restart/crash coverage, timezone changes, full initial-week history, sync and
managed profile behavior remain open. Preference registration/migration and
integration with the actual Start Page must be designed and tested before use.
In particular, this candidate deliberately excludes private activity, while
shipping's device-wide aggregate appears to include it; that difference and
per-profile versus device scope require product reconciliation. The shipping
private Start Page itself hides statistics.

Independent focused standalone receipt: `Chromium Preview/evidence/blocker-weekly-pref-20261028/`.
`python3 compile-pref-check.py` compiles the draft Profile adapter as a
standalone object and links the preference codec test against cached Chromium
158 libraries; the resulting `weekly-pref-check` reports `pref-checks=17
failures=0` with isolated Chromium `InMemoryPrefStore` fixtures (roundtrip,
recreated service on the same memory store, week rollover, managed and
unregistered prefs, schema/corruption, invalid write). This does **not** test
browser-owned profile binding, incognito/guest, the event pipeline, browser
restart, disk persistence, actual UI, or integrated build. The saved initial
`run-initial-missing-store.log` is a test-harness DCHECK caused by creating a
PrefService without a user store; the harness was fixed and the passing run
is `run.log`. Compiler/link logs, commands and hashes are retained. Cached
native output and profiles were not changed.

### Review-only decision-event candidate (October 28)

`decision_operation.h` is a UI-sequence one-operation guard: allowed redirect
hops continue, a matching terminal rule decision emits at most once, and
timeout/error/unsupported terminal results emit nothing. It marks the object
terminal before calling out, allowing reentrant or destructive callbacks
without a second emission. Distinct requests need distinct guards; sharing
guards across loader, response and activation requires a real browser-owned
identity that this draft does not yet establish.

`prepare-event-candidate.mjs` generates a **separate, unbuilt** copy of the
current native blocker with one guard at each of the five actual decision
objects. `weekly_event_candidate.cc` posts a context-only rule event back to
the owning sequence, checks that the weak context is live, not deleting,
regular and non-OTR before creating or using its per-profile sink, and never
logs or stores a URL, request ID or private event. It intentionally never
attests coverage: `BrowserWeeklyStats::Record` therefore refuses all writes
and no Start Page count can be projected. This candidate is intended not to alter
blocking outcomes and cannot be enabled as a product counter.

The generated class-level hooks cover the source call sites only; they do not
prove that all real worker/request paths reach them or that separate gates
cannot duplicate one navigation. The existing research about private counts
and device-wide shipping scope still applies. A recovery plan must establish
startup-to-shutdown full-week continuity, clock and timezone transitions,
profile lifecycle, durable write results, identity/deduplication across
distinct gates and realistic sandboxed browser paths before attesting coverage.
No renderer-supplied or guessed request identity may be used, and partial
data must remain unavailable rather than displayed as zero or a complete count.

The separate decision primitive passed 39 synthetic checks including redirect,
error, duplicate, reentrancy and destructive-callback cases; its fake privacy
check is not proof of browser privacy. One source-generation test verifies all
five hooks, the unchanged original and candidate hashes. The separate event
sink passed a Chromium 158-header syntax check after a missing FilePath include
was fixed; the initial failure is retained. The generated blocker copy has not
been syntax-checked as a whole, linked, staged, or run. Commands, logs and
hashes are in `Chromium Preview/evidence/blocker-decision-20261028/`.
