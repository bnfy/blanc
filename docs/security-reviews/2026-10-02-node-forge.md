# node-forge companion-tooling reachability review

Reviewer: Codex (automated code review under the owner's instruction to resolve
the PR's findings and complete its protected merge). Review date: October 2,
2026. Reviewed source: PR #469 at `3a0f3b451e4c5f11c926dfc35f81c72d9291ee99`.

[GHSA-86w9-cpqp-85rv](https://github.com/advisories/GHSA-86w9-cpqp-85rv)
affects node-forge's RSA PKCS#1 v1.5 signature verification through version
1.4.0. The advisory lists no patched version as of this review. The latest
web-ext 10.7.0 still depends on adbkit 3.3.9, so upgrading web-ext does not
remove this finding.

The finding is non-affecting for Blanc's reviewed commands and payloads. This
is recorded in `security/openvex.json` under the existing security maintenance
policy. The dependency audit, severity threshold, and required GitHub check
remain in force.

## Dependency and execution evidence

The only occurrence across the four committed lockfiles is the development
dependency chain in `extensions/blanc-tab-import/package-lock.json`:

```
web-ext 10.6.0 -> @devicefarmer/adbkit 3.3.9 -> node-forge 1.4.0
```

All three lockfile entries have `dev: true`. There is no occurrence in the
desktop, website, or tab-import Worker lockfile, or the desktop runtime SBOM.

The installed, integrity-pinned dependency source establishes the boundary:

- adbkit's `dist/src/adb/tcpusb/socket.js` calls `key.verify` in
  `_handleAuthPacket` for both `AUTH_SIGNATURE` and `AUTH_RSAPUBLICKEY`.
  Its `dist/src/adb/auth.js` constructs the RSA public keys with node-forge.
  The vulnerable verification code exists; development-only classification
  alone is not the reason for this finding's disposition.
- web-ext's `lib/extension-runners/index.js` dynamically imports
  `firefox-android.js` only for the `firefox-android` run target. That runner
  imports `lib/util/adb.js`, which imports adbkit and creates an ADB client.
- Blanc's companion package scripts invoke only `web-ext lint`, `web-ext
  build`, and `web-ext sign`, all with `--source-dir web-extension`.
  `prepare:safari` copies the shared extension into the Safari project.
  No first-party application, script, or workflow invokes an Android runner
  or adbkit TCP/USB authentication server.
- web-ext's lint entrypoint invokes addons-linter; build archives the source
  directory; sign invokes build and `lib/util/submit-addon.js`. The signing
  client uses jose with HS256 for AMO API authentication and Node's fetch for
  HTTPS. These paths do not invoke node-forge RSA verification or ADB.

## Payload and command verification

On October 2, 2026, the locked companion install completed, and
`lint:firefox` passed with zero errors, notices, or warnings. `build:firefox`
produced `blanc_tab_importer-0.1.0.zip`. An independent archive listing found
only `manifest.json`, `handoff.mjs`, `popup.html`, `popup.css`, `popup.js`,
and four PNG icons (plus their directory entry). No dependency or Android
tooling is in the extension payload. Signing was inspected statically; no
AMO submission was made for this review.

The desktop package's source allowlist includes only `src`, bundled blocker
sources, package metadata, and licensing files. It does not include companion
tooling; the desktop dependency graph also excludes the affected packages.

`test/unit/dependency-vex.test.js` guards the reviewed lockfile chain,
development-only scope, absence from other lockfiles, companion commands,
and desktop source allowlist while this VEX statement exists. The normal
dependency audit continues to reject unaccounted high/critical advisories.

## Re-review conditions

This disposition does not claim that node-forge or adbkit is safe for general
use. Direct adbkit use, starting its TCP/USB server, adding a web-ext Android
run command, including these tools in a runtime payload, or changing the
reviewed dependency chain requires a new reachability review before relying
on this statement. Reassess and remove the exception when a supported patched
dependency becomes available.
