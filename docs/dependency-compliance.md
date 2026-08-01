# Dependency compliance and SBOMs

Blanc keeps three deterministic CycloneDX 1.6 inventories under
`compliance/`:

- `runtime-sbom.cdx.json` — what the desktop app distributes or derives from:
  the 32-package production npm closure, Electron itself, the two local fonts,
  the compiled blocker seed, and the seed's EasyList/EasyPrivacy/Ghostery data
  provenance;
- `root-lock-sbom.cdx.json` — every unique name/version in the root npm lock,
  including development and optional tooling; and
- `site-lock-sbom.cdx.json` — the same complete supply-chain inventory for the
  Astro site build.

The lock SBOMs are intentionally broader than shipped code. For example,
Electron's npm installer dependencies and Astro's build graph belong in the
supply-chain inventory, but not in the desktop runtime claim. Electron is the
reverse special case: it is declared as a dev dependency because it builds the
package, yet its framework binary is distributed, so the runtime generator
adds it explicitly. Chromium/Node/V8's large embedded third-party set is
represented by the Electron framework component plus Electron's upstream
`LICENSES.chromium.html`, rather than pretending each native subcomponent is an
npm package.

## License policy

`compliance/policy.json` is the review boundary. Runtime npm packages and
bundled assets must use an exact audited expression from its allowlist; a new,
missing, or changed expression fails generation until it is reviewed. Build
lockfiles record every expression—including copyleft tooling that is not
distributed—but still fail on missing metadata unless a version-pinned override
has committed evidence and rationale.

EasyList and EasyPrivacy are dual-licensed. Blanc explicitly uses the
CC-BY-SA-3.0-or-later path for their filter data, attributes “The EasyList
authors,” and preserves the upstream license URL. Ghostery's engine and resource
data remain MPL-2.0. The compiled seed therefore records both licenses and a
dependency edge to all three inputs. This is a compliance inventory and review
gate, not legal advice; changes to those upstream terms still warrant counsel.

Three runtime npm packages currently publish no license file despite declaring
an allowed license: `@1password/sdk@0.4.0`,
`@1password/sdk-core@0.4.0`, and `lazy-val@1.0.5`. Their version-pinned fallback
notices are explicit in policy. `zod-to-ts@1.2.0` omits its license field but
ships an MIT file; the site-lock override points to a committed copy under
`compliance/evidence/`.

## Generated files and gates

```bash
npm run compliance:build  # refresh SBOMs + aggregate notice after an audited change
npm run compliance:check  # read-only freshness and policy check
```

`compliance:check` runs in the parity workflow and in
`release:verify:press`. It uses committed lockfiles and source assets, so it is
offline and independent of whatever happens to be installed in `node_modules`.
Never hand-edit generated SBOMs or `THIRD_PARTY_NOTICES.txt`.

The cross-platform electron-builder `afterPack` hook performs the distribution
half of the contract. Every packaged app receives:

- `runtime-sbom.cdx.json` and `THIRD_PARTY_NOTICES.txt` in its resources
  directory;
- Electron's MIT license and complete Chromium notices; and
- `ThirdPartyLicenses/` with every runtime npm package's shipped license/notice
  files (or its audited fallback) plus both OFL font licenses.

Packaging aborts if generated artifacts are stale, a runtime package is absent,
or any package lacks both a license file and a matching fallback. That makes the
actual bundle—not merely the repository—carry the required records.

## Dependency-change checklist

1. Change the appropriate package manifest and lockfile.
2. Run `npm run compliance:build` and inspect the SBOM/notice diff.
3. For a new runtime expression, review distribution obligations before adding
   it to `runtimeAllowedLicenseExpressions`.
4. For missing metadata, commit primary evidence and a version-specific
   override; never add a name-only waiver.
5. Run `npm run compliance:check`, `npm run test:unit`, and a packaged build so
   the after-pack payload is exercised.
