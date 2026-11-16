# Worker context investigation — October 17, 2026

Pinned Chromium 157.0.8103.6, Electron oracle44.8.0 / Blanc1.36.0.

## Findings

1. `content/public/browser/content_browser_client.h:1918` explicitly documents
   null frames for shared-worker subresources and both service-worker factory
   types. Dedicated workers usually carry an ancestor frame, subject to a flag.
   Null is not evidence that the worker belongs to the visible/main tab.
2. `content/browser/worker_host/shared_worker_host.cc:542` constructs its
   subresource factory with frame=nullptr and a storage-key-derived isolation
   context; `:752` computes that context using ToPartialNetIsolationInfo.
3. `third_party/blink/common/storage_key/storage_key.cc:793` derives a first-party
   isolation origin from the worker storage-key origin and a third-party value
   from the schemeful top-level site. That is not generally the client's exact
   origin (scheme/host/port). Matching our simple fixture is not sufficient proof.
4. `content/browser/service_worker/service_worker_context_wrapper.cc:1998`
   constructs the service-worker script factory with null frame and empty
   factory IsolationInfo. Individual trusted request metadata may differ and
   is logged separately, never promoted to a document identity.
5. Real Electron records retained in the previous path evidence have null frame,
   webContentsId and tabUrl for shared-worker fetches and service-worker fetches.
   They do carry actual initiatorOrigin and profile/session identity.
6. Electron44.8.0 `WebContents::GetAllSharedWorkers` loops over all DevTools agent
   hosts and filters only by worker type; despite being a WebContents method,
   it does not establish which page owns a shared worker. ServiceWorkers.getAllRunning
   reports script/scope/process/version, not a request-to-client frame identity.
   Source: https://raw.githubusercontent.com/electron/electron/v44.8.0/shell/browser/api/electron_api_web_contents.cc
   (GetAllSharedWorkers, lines3337–3352). This was read, not inferred from API naming.

## Applied change and what it does not prove

Native frame context is snapshotted at Request construction, before the
asynchronous decision can outlive its originating frame. Navigation still uses
the actual hop URL as the contract defines. Additional raw metadata distinguishes
live-at-entry, not-associated and gone-at-entry; names worker/service factory
kinds and preserves factory/per-request isolation origins. These are diagnostic
fields outside the compared context, not permission to replace missing fields.
The frame snapshot closes a lifecycle weakness; it does not create worker owners.

The comparator retains each side's unresolved field explicitly and regression
checks reject partition/visible-tab substitution and one-sided native enrichment.
Shared/service-worker top-frame/role admission remains GAP under the existing
contract. Closing it requires independently observed request-to-client/worker
lifecycle correlation on both runtimes, including the legitimate no-single-client
case; adding a browser-owned observation surface to the Electron oracle may be
necessary. A contract that models unassociated worker execution separately would
need explicit review; no such relaxation is made here. No new Electron cold build
is authorized or started. Known matching block/allow behavior is preserved but
is not full-context acceptance.

No forced owner-teardown race was injected in this run. The entry snapshot is
a source-backed lifetime fix with regular/dedicated regression coverage, not
a claim that teardown or multi-client worker cases now pass.
