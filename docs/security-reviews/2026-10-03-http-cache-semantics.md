# http-cache-semantics build-tooling reachability review

Reviewer: Claude (Claude Code, under the owner's instruction to fix PR #492's
failing required checks and merge it). Review date: October 3, 2026. Reviewed
source: `main` at `ea73189cedea7c632629dbcc855c0fde5e28effa`.

[GHSA-ch52-4w7c-c8xp](https://github.com/advisories/GHSA-ch52-4w7c-c8xp)
affects http-cache-semantics through 4.2.0. A shared cache that zeroes an
entry for security reasons can still serve it to a client that sends a large
`max-stale`, disclosing another user's cached response. The advisory lists no
patched version as of this review, so no dependency upgrade removes the
finding. It first failed the required `substrate` check on PR #492; `main`'s
last run at 00:25 UTC the same day passed, so the finding entered the audit
feed in between and is not specific to that PR.

The finding is non-affecting for Blanc's reviewed commands and payloads. This
is recorded in `security/openvex.json` under the existing security maintenance
policy. The dependency audit, severity threshold, and required GitHub check
remain in force.

## Dependency evidence

Across the four committed lockfiles, the package occurs twice.

Desktop (`package-lock.json`), every entry `dev: true`:

```
electron-builder 26.15.3 -> app-builder-lib 26.15.3
  -> @electron/get 3.1.0 -> got 11.8.6 -> cacheable-request 7.0.4
  -> http-cache-semantics 4.2.0
```

`npm ls http-cache-semantics --omit=dev` is empty. The top-level
@electron/get 5.0.0 that `electron` uses has no got dependency. The desktop
package's `build.files` allowlist ships only `src/`, bundled blocker sources,
and license files, so no build tooling reaches `app.asar`.

Website (`site/package-lock.json`): astro 7.3.2 is the only consumer. The
tab-import Worker and companion lockfiles contain no occurrence.

## Execution evidence

The installed, integrity-pinned sources establish the boundary:

- got 11.8.6 `dist/source/core/index.js` loads cacheable-request at module
  load but constructs a `CacheableRequest`, and therefore any
  http-cache-semantics `CachePolicy`, only inside `if (cache)`, where `cache`
  is the request's `cache` option.
- @electron/get 3.1.0 `dist/cjs/GotDownloader.js` sets no `cache` option of
  its own; it forwards the caller's download options to `got.stream`.
  app-builder-lib 26.15.3 `out/util/electronGet.js` builds those options from a
  request timeout, a proxy agent, a progress callback, and any
  `downloadOptions` from `build.electronDownload`. The `cacheMode` in
  `binDownload.js` is @electron/get's file cache of downloaded archives, not
  got's HTTP cache.
- Blanc sets no `build.electronDownload` in `package.json`, and no script or
  workflow passes downloader options, so nothing supplies `cache`.
- astro 7.3.2 imports http-cache-semantics only in
  `dist/assets/build/remote.js`, which revalidates cached remote images during
  a build. `site/astro.config.mjs` sets no `image` domains or remote patterns,
  no `adapter`, and no server `output`. `site/src` imports no `astro:assets`
  and uses no `Image`, `Picture`, or `getImage`. The deployed site is static
  files, so astro never runs as a server.

Independently of reachability, the advisory's scenario needs a shared cache
answering requests from multiple users. Blanc's uses are a single build
machine fetching its own artifacts, with no other user's response to disclose.

## Re-review conditions

`test/unit/dependency-vex.test.js` fails and requires re-review if:

- the desktop chain changes version, gains another consumer, or stops being
  development-only;
- the package appears in the Worker or companion lockfiles, or gains a
  website consumer other than astro;
- `package.json` adds `build.electronDownload`, or the desktop `build.files`
  allowlist broadens;
- the site adds an adapter, server output, image configuration, or any
  `astro:assets` image use.

Remove the VEX statement once a patched http-cache-semantics is available and
both lockfiles adopt it.

## Website revamp cross-check (PR #491)

Codex independently reviewed source `4b9c7bcac6a31146609af5178662faf8f85f0966`
on October 3, 2026 and reached the same bounded disposition. The website
revamp makes `output: 'static'` explicit and guards the deploy payload against
server and `_worker.js` output. Astro's remote-image code constructs its own
requests without visitor headers and calls `storable()` / `timeToLive()`,
not `satisfiesWithoutRevalidation` on incoming user cache directives.

The combined dependency tests retain both reviews' boundaries, including
absence of new first-party package consumers and the static deployment path.
This does not authorize server-side Astro, a shared/proxy cache, newly enabled
got caching, or new first-party/runtime consumers.
