# http-cache-semantics reachability review

Reviewer: Codex, automated source review while resolving PR #491's blocking
checks. Review date: October 3, 2026. Reviewed source baseline:
`4b9c7bcac6a31146609af5178662faf8f85f0966`, with the static-output guard in this
follow-up. This disposition is proposed for maintainer review through the PR.

[GHSA-ch52-4w7c-c8xp](https://github.com/advisories/GHSA-ch52-4w7c-c8xp)
affects http-cache-semantics through 4.2.0. The advisory lists no patched
version, and npm's latest version is 4.2.0 as of this review. The
[upstream report](https://github.com/kornelski/http-cache-semantics/issues/56)
describes a shared cache retaining responses that should not be reused across
users, then accepting attacker-controlled `Cache-Control: max-stale` through
`satisfiesWithoutRevalidation`.

The vulnerable component remains in the build dependencies. Blanc's reviewed
commands and deployed payloads do not expose that execution path. A bounded
`not_affected` statement is recorded in `security/openvex.json` under the
existing security maintenance policy. The audit severity threshold and
required CI check remain unchanged.

## Desktop dependency and execution evidence

The locked chain is:

```
electron-builder / app-builder-lib 26.15.3
  -> @electron/get 3.1.0
  -> got 11.8.6
  -> cacheable-request 7.0.4
  -> http-cache-semantics 4.2.0
```

Every entry in this chain is development-only. `npm ls http-cache-semantics
--omit=dev` finds no desktop runtime copy. The runtime SBOM and first-party
desktop/Worker code have no consumer of http-cache-semantics, cacheable-request
or got.

The installed, lockfile-integrity-pinned source establishes the boundary:

- `@electron/get/dist/cjs/GotDownloader.js` streams a build artifact to a local
  file with `got.stream(url, gotOptions)`. It is a download client, not a proxy
  serving browser requests or sharing authenticated responses between users.
- `got/dist/source/index.js` defaults its HTTP cache to `undefined`. The
  cacheable-request path is activated only when a cache is configured.
- `@electron/get/dist/cjs/index.js` separately caches artifact files on disk;
  this file cache is not a shared HTTP cache serving client `max-stale` requests.
- Blanc does not configure custom got caching, import these packages into
  first-party runtime code, or pass website visitor request headers into this
  build-download path.

Development-only classification alone is not the basis for this disposition;
the shared-cache request path described by the advisory is absent here.

## Website dependency and execution evidence

Astro 7.3.2 depends directly on http-cache-semantics 4.2.0. Astro is a declared
site dependency, but the published output is static HTML, CSS, JavaScript and
assets. `site/astro.config.mjs` explicitly specifies `output: 'static'`, with
no server adapter. The deploy command sends `site/dist` to Cloudflare Pages;
the reviewed build has no server or `_worker.js` output. Astro and this Node
package do not execute in the deployed website.

The only installed Astro import is
`astro/dist/assets/build/remote.js`, used for remote-image build processing.
`loadRemoteImage` constructs its own `new Request(src)` without visitor
headers. Revalidation constructs only conditional ETag/Last-Modified headers.
These paths use `storable()` and `timeToLive()` to derive expiry, not
`satisfiesWithoutRevalidation` with an incoming user's `max-stale` directive.
They do not serve cached session cookies to different users.

There are no occurrences of the package in the tab-import Worker or companion
extension lockfiles. No first-party source imports it or its HTTP-cache client.

## Verification and re-review conditions

`test/unit/dependency-vex.test.js` guards the exact reviewed consumer versions,
the desktop development-only classification, the two direct dependency
consumers, absence from the Worker/companion graphs, static site output and
deployment, and absence of new first-party imports. Changes to these boundaries
require a new review or removal of the exception before the audit can pass.

This finding is not a claim that the dependency is safe for general shared
cache use. Deploying Astro server-side, adding a shared/proxy cache, passing
user-controlled cache directives to a consumer, enabling a new got cache,
adding a first-party consumer, moving the component into a desktop runtime
payload, or changing the reviewed dependency source requires reassessment.
Remove the exception when a supported patched dependency is available.
