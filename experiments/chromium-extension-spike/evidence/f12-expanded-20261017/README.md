# Expanded synthetic oracle and Chromium negative control — October 17, 2026

**The Electron oracle meets the numerical floor. Native blocker acceptance is
still a gap.** The Chromium executable has no Blanc Blocker native interception
or Mojo engine yet; these runs deliberately measure its unblocked behavior.
They do not activate the tranche's criterion-3 stop against an unimplemented
blocker, promote 157, or claim a real-web block rate.

## Observed results

- Pinned generation: 5,905 unique candidates. The full page exercises 5,123;
  782 domain-scoped candidates require other source origins and remain excluded.
- Two fresh regular and two fresh private Electron replays agree exactly on
  contexts, decisions and allowed-response hashes: **2,503 blocked / 2,620
  allowed distinct candidate URLs per profile**. Reruns, profile copies,
  four first-party controls, the page and child requests do not inflate this.
  Each full run has 6,381 total observations.
- The no-referrer subset has 24 candidates plus the four first-party controls:
  **9 blocked / 15 allowed candidates**, stable in both fresh runs per profile.
- Chromium comparison: all four `chromium-05` runs loaded all 5,123 candidate
  responses, including the 2,503 Electron blocked, and executed and fetched
  1,211 additional script children. See `summary.json` for the per-run counts.
  These are pre-integration negative controls, **not synthetic fixture parity**.
- TLS security controls in `tls-security-03.json`: pinned leaf loads in actual
  Electron 152 and Chromium 157; an unpinned leaf is refused before HTTP in both.
  No system trust change. Profiles, fixture keys and extracted apps are removed.

`summary.json` breaks observations down by type, party, profile and seed kind.
Party uses the **observed** request URL and top-frame origin with the pinned
PSL module, not the generator's intended-party hint. Raw hook context and the
provider's actual answer remain available in the compressed logs.

## Important context observation

`https://amazon-adsystem.com/widgets/q?` is allowed with the default referrer
and blocked with `no-referrer`, while `initiatorOrigin` is unchanged. The installed
Ghostery Electron adapter's `fromElectronDetails` uses `details.referrer` as
`Request.sourceUrl` (lines 59–75); the inspected module SHA matches the captured
`engineArtifactSha`. Keep the rule-matching source and raw initiator separate
when implementing the native bridge. Never substitute a frame origin or referrer
for the independent native `request_initiator` observation.

## Trust and offline boundary

Each invocation generates fresh one-day fixture certificates, in groups of at
most 400 exact SANs. CONNECT selects its certificate context; SNI and Host must
match. Both browsers pin only the ephemeral leaf keys with
`--ignore-certificate-errors-spki-list`; Electron additionally retains the exact
leaf/CA/hostname session verifier. This is not `--ignore-certificate-errors`,
OS keychain trust, or a forward proxy. The resolver blocks direct outbound DNS;
the proxy has no upstream implementation. Fixture responses are authored and
exist even for URLs Electron blocks. Child fetches consume the full body before
signalling completion.

Chromium attempts built-in service traffic even with background flags. Exact
refusals for `clients2.google.com`, `www.google.com:443`, and
`accounts.google.com:443` outside the target page are retained as `serviceDenials`.
Unknown page traffic, other refused authorities, missing/incorrect responses,
cache hits and unfinished descendants fault the comparison. No denial is forwarded.

CDP verifies URL, type, profile, transport completion and DOM behavior. It does
**not** supply the native request initiator: `nativeContextMatched` is false and
`fullyAdmittedPairedUrls` is zero. No answer from Electron drives Chromium's requests.

## Every attempt remains evidence

- `electron-01`: passed 28-case no-referrer probe (24 candidates + 4 controls).
- `electron-02`: full attempt; first run complete, second missing an allowed
  script execution. Limited failure diagnostics; cause is not assigned.
- `electron-03`, `electron-04`: full attempts failed child-completion waits.
- `electron-05`: corrected small no-referrer fixture passed; children consume bodies.
- `electron-06`, `electron-07`: full attempts exposed certificate failures on
  children. The latter's session-verifier logs accepted every presented leaf,
  so the exact underlying Electron cache/verification failure is **not diagnosed**.
- `electron-08`: CONNECT-selected TLS contexts and connection reuse retained;
  still failed on three allowed scripts with certificate errors.
- `electron-09`: full corpus passed using scoped leaf-key pins.
- `electron-10`: final no-referrer probe passed under the same trust arrangement.
- `chromium-01`: unhandled socket reset before evidence flush (empty directory);
  subsequent process inspection found no remaining owned browser. Socket errors
  are now handled and recorded. No complete observation is claimed.
- `chromium-02`: failed on unread child bodies and browser-service denials.
- `chromium-03`: completed fixtures but failed on the separately denied services.
- `chromium-04`: all four small negative-control runs passed; 9 blocked-by-Electron
  candidates loaded, and 2 additional script descendants executed each time.
- `chromium-05`: full negative-control repeats; see final summary for all outcomes.
- `tls-security-01`: the minimal test app did not navigate its blank window;
  its inspected disposable process was terminated and cleaned up.
- `tls-security-02`: assertion expected Chromium's certificate error spelling;
  Electron's explicit verifier rejection returns `ERR_FAILED`. This is a harness
  expectation failure, not evidence that the unpinned leaf was allowed.
- `tls-security-03`: passes with explicit verifier evidence and no unpinned HTTP arrival.

No run was admitted by pruning to a passing intersection. The original candidate
set was retained through repairs. Test failure during development (wrong-SNI
connection ended without an exception) was corrected to assert no HTTP 200 and
no arrival; the final 48 focused tests pass. Existing paired-validator checks
are reported separately in `validation.md`.

## Remaining gaps

First-party coverage here is four authored **allowed** controls, not list-derived
first-party blocking coverage. Only script/xhr/image/stylesheet in one main frame
are exercised. Other source origins, frames, redirects, opaque origins, workers,
service workers, sender teardown, speculation, WebSocket and WebTransport remain
open. Font/media/object/other types, cosmetic/procedural/main-world scriptlet
outcomes, startup/crash holds and hook latency are unmeasured. The private real-page
sanity sample is not acquired. The original matrix, time box and patch budget stand.

No native build/prepare/GN invocation or native-source change occurred. The
existing 156 build, 157 build and open prototype profile were not used as test
profiles. Runtime brackets in reports include harness overhead, not native hook
latency or active owner/agent attention. Row 0's cold-build column is unchanged.

## Reproduction and storage

Use the commands in `fixtures/replay/synthetic/README.md`. `electron-09` is the
full oracle, `electron-10` the final no-referrer subset and `chromium-05` the full
control. `inventory.json` records hashes of uncompressed and stored bytes; `.gz`
files are lossless JSON/JSONL, not summarized records. `NOTICE` applies to
list-derived URLs, provenance and generated fixture data; first-party code keeps
its existing terms. No keys, raw browser stderr, authenticated traffic or private
real-page content is committed.

The exact executed `fixture-trust.cjs` is retained as `source-snapshots/fixture-trust.cjs.txt`;
the current source adds only a comment in its malformed-certificate catch for
lint. All other final-run source hashes match the current files. The PSL module
is `tldts-experimental` 7.4.10, with its loaded entry-point hash in the summary.
