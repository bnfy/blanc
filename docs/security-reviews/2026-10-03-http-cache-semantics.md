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

## PR #490 payload re-review

Codex reviewed the added uBO paths on October 3 after merging `main` at
`78593547`. The root/site lockfiles and affected development-only dependency
chain are unchanged. The additional positive package patterns are exactly
`ublock/**/*`, `scripts/check-ublock-package.cjs`, and
`scripts/build-ublock-adaptation.cjs`. Both scripts import only Node fs/path
and the local `src/main/ublock-package.js`; that module imports only fs/path/crypto
and performs byte verification and local adaptation. No downloader cache option
or affected library call is added. The extension implements its own filter-list
cache, not the vulnerable npm HTTP cache. The corresponding-source archive is
verified as data and is not extracted into the executable extension.

The inspected internal ASAR contains none of http-cache-semantics,
cacheable-request, got, @electron/get, web-ext, adbkit or node-forge under its
node_modules tree. Ordinary builds omit the entire upstream payload and both
reproduction scripts; existing after-pack inventory checks enforce that mode.
The unchanged runtime license/SBOM checks still describe actual included npm
modules. This review establishes the added paths do not invalidate the existing
cache and Android-tooling reachability determinations; it is not uBO security
or GPL clearance.

Both VEX guards now accept only those three exact additional patterns and bind
the reviewed uBO pin manifest to SHA-256
`b7ddaae82e7854b050758f1bce95e621c92dfcb55ac8b110a8a16fd108a74118`
over its canonical JSON serialization. Changing the payload or broadening
other package patterns requires re-review. No VEX statement, advisory severity
threshold or audit policy was disabled or expanded.


## October 3 shipping-source follow-up

The new immutable CSS Tree, js-beautify and HSLuv source archives and
`preferred-sources.json` are read as bytes and SHA-256 checked by
`check-ublock-package.cjs` / `readVerifiedPackage`. Neither the archives nor
scripts inside them are executed or imported during packaging or at runtime.
Only the verified `upstream/` inventory is adapted into the loaded extension.
The revised host tool capabilities, ordered native ports and navigation events
use browser messaging; they add no Node dependency, RSA verifier, HTTP cache,
Android target or builder download-cache option. Package/lock dependency graphs
and the explicit builder source allowlist are unchanged.

This preserves this advisory's existing reachability determination for the
reviewed payload. The JSON-serialized `ublock/pinned.json` SHA-256 is now
`71f33634e9cb016e1386b625b1c55b7d2d1a7713613d9437c40694b6ac9010ad`.
The dependency VEX test retains its exact-digest guard; this is not an extension
of the exception to arbitrary future archives or executed source-build scripts.
