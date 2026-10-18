# Electron update-loader identity instrumentation assessment

October 17, 2026. Assessment only: no Electron source checkout, patch application,
compilation or instrumented Electron runtime is claimed. Cross-runtime update
identity stays **gap**. See `evidence/f12-opaque-electron-audit-20261017/` for
pinned source snapshots, source URLs/hashes and the accompanying frame experiment.

## Verified source boundary

Electron `v44.8.0` pins Chromium **152.0.7977.167** in `DEPS:4–5`; the disposable
Electron runtime reports the same versions. The prototype is Chromium 157.
A 157 patch cannot be assumed to compile on Electron's Chromium. These are
upstream tagged sources; Electron's complete applied patch queue and resulting
build tree still need verification before implementation.

| Location in pinned source | Observation / consequence |
| --- | --- |
| Chromium `content/browser/service_worker/service_worker_update_checker.cc:270–290` | Parent holds `version_to_update_`, scope and StorageKey and passes the loader factory to each single-script checker. This is the narrow place to capture the checked registration/version, including an unchanged-byte update that never creates a new realm. |
| Chromium `service_worker_single_script_update_checker.cc:156–163,198–229` | Builds the request, supplies no relevant frame/tab, then clones the factory into `ThrottlingURLLoader`. A page-frame or new-target identity is not an independent substitute. |
| Electron `shell/browser/electron_browser_client.cc:1537–1640` | Factory integration supplies profile, process/frame and navigation context, but no service-worker registration/version identity. |
| Electron `shell/browser/net/proxying_url_loader_factory.cc:67–91,142–187,839–918` | Copies `ResourceRequest`; the blocking route allocates a per-BrowserContext webRequest ID and passes both request and WebRequestInfo to `OnBeforeRequest`. That ID is not the network-service request ID. The observe/bypass routes are distinct and must not be silently assumed equivalent. |
| Electron `shell/browser/api/electron_api_web_request.cc:111–151` | WebRequestInfo exports id and initiatorOrigin. ResourceRequest exports referrer/uploadData; it does **not** export devtools_request_id or registration/version. |
| Chromium `services/network/public/cpp/resource_request.h:265` | An existing optional `devtools_request_id` can transport an opt-in diagnostic token without a new Mojo field or HTTP header. Preservation through the actual Electron route remains a runtime obligation. |

## Smallest candidate, not a validated patch

1. In the parent update checker, wrap only the factory passed to the single-script
   checker. Capture registration ID, **checked old version ID**, scope, StorageKey,
   profile kind and a per-profile run identity from browser-owned objects. Reuse
   the 157 wrapper's design, not its unverified 157 API spellings. A Blanc-owned
   helper plus one anchored upstream call-site edit is the starting hypothesis.
2. At each actual `CreateLoaderAndStart`, mint a fresh unguessable token and copy
   it into the request's otherwise-absent `devtools_request_id`. Preserve an
   existing ID; report an explicit untaggable gap rather than overwrite it.
   Record token → metadata before forwarding. No URL, temporal proximity, request
   ordering, target numeric ID or app-side `registration.update()` log is a join.
3. In Electron's ResourceRequest-to-details conversion, expose that token only
   behind an explicit disposable-run diagnostic switch and the expected prefix.
   Record the hook's actual `details.id`, profile/run identity and token in the
   harness observer. Do not change provider decisions, interception listeners,
   fetch behavior, cache flags, startup gate or list reload protection.
4. Join the browser-owned metadata to the real blocker hook with the exact token
   and profile/run namespace. The checked version remains the old version even
   when a later update installs a new one. Keep URL, initiator, StorageKey and
   scope as independently checked fields, never as fallback identity keys.
5. Use a pre-opened owner-only evidence descriptor, serialized writes, explicit
   completion/flush and weak lifetime handling. Reject renderer-supplied tokens;
   scope the export to these browser-generated update loads. Missing metadata,
   duplicate tokens, cross-profile reuse and conflicting joins fail closed.
   No diagnostic headers go onto the wire. No shipping Electron change is made
   by this assessment.

Expected edited existing files: the Chromium parent checker and Electron API
conversion (two), plus Blanc-owned helper/harness files; exact GN dependencies,
thread affinity, applied-patch conflicts and resulting hunks remain **unmeasured**.
If preserving this field across Electron's observed/bypass paths needs a proxy
change, inventory it explicitly before building. Do not claim two files as an
implemented budget. A new Electron diagnostic output is outside the approved
157-only incremental-build scope and requires a separate bounded build proposal
and owner approval. It must not consume either preserved Chromium output.

## Required acceptance before closing the gap

- Independent exact-token joins on changed-byte and unchanged-byte updates,
  regular/private, two concurrent registrations using the same script URL.
- Initial loads distinguished from updates; imported scripts distinguished from
  main scripts; old checked version distinguished from newly installed version.
- Redirect, validator/304/cache, network failure, abort, retry and profile teardown
  cases; no-realm results explicitly represented rather than fabricated targets.
- Existing DevTools ID, missing/duplicate token, wrong profile, wrong version,
  observer loss and unavailable metadata rejection probes.
- Blocking and nonblocking listener routes audited; absence of a hook is a gap.
- Compare stock vs instrumented Electron behavior on the existing fixtures and
  confirm no extra network request/header or provider-result difference.

Until an independently instrumented Electron build passes those joins, the
existing eight Electron update observations remain identity gaps; the eight
native joins and behavior observations keep their prior bounded meaning.
Latency (including gate/instrumentation overhead) remains deferred.
