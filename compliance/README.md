# Dependency compliance

Blanc's compliance artifacts are generated from the committed npm lockfiles,
`compliance/policy.json`, bundled fonts, and blocker provenance. Run
`npm run compliance:build` after changing any dependency or declared asset and
commit all generated output. `npm run compliance:check` is the read-only drift
and license-policy gate used by CI, packaging, and release verification.

The three CycloneDX 1.6 inventories have distinct scopes:

- `root-lock-sbom.cdx.json` inventories every root lockfile package, including
  build and test tooling.
- `site-lock-sbom.cdx.json` inventories every website lockfile package.
- `runtime-sbom.cdx.json` inventories the production dependency closure,
  Electron, fonts, filter-list data, Ghostery resources, and the compiled seed.

Only the deterministic runtime SBOM is copied to the public release asset
`Blanc-<version>.cdx.json`. Root and site inventories remain repository gates.

Every shipped license expression must appear in the allowlist. Missing license
metadata fails generation unless an exact package version has a documented
override with committed evidence. When an npm archive declares a license but
omits its license file, packaging likewise requires an exact-version fallback
and committed full text under `compliance/evidence/`.

The all-platform packaging hook installs Blanc's MIT license, the runtime SBOM,
generated notice, one license record per runtime npm component, font licenses,
Electron's license, and Chromium's complete notices into the application
resources directory, then verifies that payload before any macOS-only icon work
runs. If electron-builder does not retain its root legal files in an unpacked
application, the hook reads them from the exact Electron distribution archive
after verifying that archive against the checksum table shipped by the pinned
`electron` npm package.
