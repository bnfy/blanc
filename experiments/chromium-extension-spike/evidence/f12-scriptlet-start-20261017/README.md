# Document-start and update-identity diagnosis — October 17, 2026

Both gates remain **open**. This checkpoint narrows the required fixes; it does
not claim a production timing fix or invent an update registration identity.

## Early scriptlets

Two sets of four fresh sandboxed regular sessions (Electron/Chromium twice),
normal/CSP pages, first visit/reload/fresh navigation: **48 document loads**.
`timing01` observes actual vAPI injection requests without changing arguments or
the returned promise; `timing02` repeats without that observer. Both preserve
actual pinned uBO filtering. Every load has the same result:

- At the first inline page script (`readyState=loading`), the constant is false
  and its property getter is absent. This rules out merely reading a special
  value from an already installed getter in this fixture.
- The immediate fetch returns the authored `NETWORK LEAK` response and is
  independently observed at the offline proxy. Early fetch prevention fails.
- Later the constant is true and its getter exists. Previous bounded late-fetch
  and cosmetic checks are not promoted to document-start acceptance.

Both observer and observer-free runs have 0/24 early constant and 0/24 early
fetch passes. Reload does not fix the race. There is no deliberate response delay,
CDP pre-injection of expected answers, or page reload admitted as a workaround.
The observer records Date.now only for diagnostic ordering, **not qualified
latency**; no timing threshold is evaluated. Arrays of injection results may be
empty and are not treated as successful document-bound delivery.

Pinned uBO source requests `executeScript(... runAt: document_start)` from
response/navigation handling. Its contentScripts registration path returns early
when that API is unavailable. Chromium's main-world injector appends a script
node from the injected isolated code. The Electron host additionally authorizes,
probes a document token and commits an injection lease asynchronously. These are
source-backed asynchronous paths; the runtime failure is measured, while the
relative contribution of each scheduling hop is not isolated by this test.

**Implementation direction:** register the applicable main-world payload before
the destination renderer may execute page script, with document/profile binding
and list-generation invalidation. Do not remove Electron's authorization/token
checks or weaken CSP as a timing shortcut. Registration updates must participate
in the existing acknowledged reload hold. A static fixture-only preload or an
unscoped all-host injector is not a general uBO fix. Capability, containment,
exception/hostname selection and stale-generation rejection need proof before
that path can replace the current one. No such replacement is claimed here.

## Update identity: exact loss boundary

`update-loader-source.json` records hashes and numbered excerpts from the actual
157 checkout, not a guessed API shape:

1. RegisterJob knows the full scope and old `ServiceWorkerVersion`.
2. `GetLoaderFactoryForUpdateCheck` explicitly passes `version_id=nullopt`; its
   TODO says this path is not recorded by DevTools.
3. `GetLoaderFactoryForBrowserInitiatedRequest` reduces scope to `scope_origin`
   for `WillCreateURLLoaderFactory`, with a null frame and empty IsolationInfo.
   Two scopes under one origin become indistinguishable at this hook.
4. SingleScriptUpdateChecker constructs a frameless request; its browser request
   ID is assigned at CreateLoaderAndStart, after throttle construction. Pointer
   flow IDs and that transport ID do not encode registration ownership.

This explains why adding observer retries, waiting for a later target or using
factory origin cannot close the two-registration collision. The preceding eight
sessions/16 update gaps remain the runtime counterexample. No new update runtime
acceptance is claimed in this source-only follow-up.

**Implementation direction:** carry browser-owned registration/version plus a
per-check identifier from the job/checker into the hook, keyed to its profile and
request lifetime. Independently expose an equivalent join in the Electron oracle
before comparing. Native-only enrichment cannot satisfy the paired contract.
The installed Electron observer currently exposes no such join; rebuilding
Electron or adding a new cold output was neither attempted nor authorized.

## Reproduction and limits

Run synthetic/scriptlet-timing-run.mjs CONFIG PAYLOAD NEW_EVIDENCE [--observe],
then scriptlet-timing-verify.mjs EVIDENCE. Exact capture sources are inside each
archive, including the original observer-enabled runner. Independent verification
checks first-script state, getter/value, proxy arrival versus fetch response,
late readiness, all six page phases and permitted refused-background traffic.
Four regression tests reject false early acceptance and DOM/transport disagreement.
All 142 focused tests and 77-file lint pass. Both extracted archives re-verify.
No private keys/profiles archived; disposable profiles/CAs removed.

Guard: zero actions, no native compilation, unchanged last-measured 27 files /
65 hunks. No cold cost. Latency still deferred. Owner attention/agent time are
not measured. Original 156/permanent profiles untouched. Spike A/B, broader
coverage, component containment and Task 0 outcome remain open/unchanged.
Source excerpts retain Chromium's upstream BSD terms; uBO source references
retain GPL-3.0-or-later. Authored harness/fixtures retain their existing terms.
