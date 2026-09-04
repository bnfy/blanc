# Dependency advisory triage — September 4, 2026

The 12 advisories reported by OpenSSF Scorecard against
`188b4ed4269a6aa0b65e438f84494b46330485ee` match **development dependencies**
in the root lockfile. No affected version for these advisories occurs in its
production dependency entries or the website lockfile. The v1.15.0 root
lockfile is byte-equivalent as parsed JSON to this baseline.

This patch updates nine development-only lockfile entries within existing
dependency ranges, regenerates the root lock SBOM, and updates its component
count assertion from 400 to 399. The count falls because brace-expansion
1.1.16 now shares the already-present 1.1.18 version. `package.json`, all
production entries, the runtime SBOM, and the website lockfile are unchanged.
There is no application version bump or release in this change.

## Findings and fixes

| Package | Affected locked versions | Updated to | Dependency route / exposure |
| --- | --- | --- | --- |
| @xmldom/xmldom | 0.8.13 | 0.8.15 | electron-builder → app-builder-lib → plist; build-time XML processing |
| brace-expansion | 1.1.16, 2.1.2, 5.0.7 | 1.1.18, 2.1.4, 5.0.9 | ASAR, glob, universal build, directory comparison, and file-list tooling; build-time glob expansion |
| fast-uri | 3.1.4 | 3.1.7 | electron-builder → app-builder-lib → ajv; build configuration/schema processing |
| tar | 7.5.19 | 7.5.22 | app-builder-lib and node-gyp; build-time archive processing |
| undici | 6.27.0 | 6.28.1 | electron-builder → app-builder-lib → @electron/rebuild → node-gyp; build-time HTTP requests |

The root Undici 7.29.0 and website Undici 8.10.0 are outside the three affected
Undici ranges and remain unchanged. npm's production graph retains the root
copy through an Electron peer dependency, which is why its missing `dev` flag
alone did not establish exposure. The affected nested 6.27.0 copy is dev-only.

Build dependencies are still security-relevant: compromised or malicious
inputs can affect build machines and generated artifacts. Development-only
classification is not a dismissal. This is a scoped dependency-range review,
not proof that the browser has no vulnerabilities or an independent audit of
Electron/Chromium and their bundled internals.

## Advisory sources

- XML: [GHSA-6gmq-8vp8-gcm6](https://github.com/xmldom/xmldom/security/advisories/GHSA-6gmq-8vp8-gcm6).
- Glob expansion: [GHSA-mh99-v99m-4gvg](https://github.com/juliangruber/brace-expansion/security/advisories/GHSA-mh99-v99m-4gvg), [GHSA-rgw5-rvv9-x895](https://github.com/juliangruber/brace-expansion/security/advisories/GHSA-rgw5-rvv9-x895).
- URI processing: [GHSA-5jgf-p345-68v8](https://github.com/fastify/fast-uri/security/advisories/GHSA-5jgf-p345-68v8), [GHSA-7p8r-x3mc-p8w7](https://github.com/fastify/fast-uri/security/advisories/GHSA-7p8r-x3mc-p8w7), [GHSA-f65p-4m7j-42xc](https://github.com/fastify/fast-uri/security/advisories/GHSA-f65p-4m7j-42xc), [GHSA-fph4-wmhf-6fwf](https://github.com/fastify/fast-uri/security/advisories/GHSA-fph4-wmhf-6fwf), [GHSA-jqff-g426-hqxp](https://github.com/fastify/fast-uri/security/advisories/GHSA-jqff-g426-hqxp).
- Archive processing: [GHSA-r292-9mhp-454m](https://github.com/isaacs/node-tar/security/advisories/GHSA-r292-9mhp-454m).
- HTTP: [GHSA-8xcm-r25x-g524](https://github.com/nodejs/undici/security/advisories/GHSA-8xcm-r25x-g524), [GHSA-m8rv-5g2x-5cg5](https://github.com/nodejs/undici/security/advisories/GHSA-m8rv-5g2x-5cg5), [GHSA-v3r7-h72x-cjcm](https://github.com/nodejs/undici/security/advisories/GHSA-v3r7-h72x-cjcm).

The machine-readable [triage](security-evidence/dependency-triage-2026-09-04.json)
maps each advisory's OSV semver ranges to exact lockfile paths before and after
the change. All 12 have dev-only matches before, zero matches after, and zero
website matches. npm groups these into five vulnerable package names; its
count of five is not a contradiction of Scorecard's 12 distinct advisories.

## Validation

- Fresh `npm ci --ignore-scripts --no-audit --no-fund`: successful, 405 packages.
- Full root `npm audit --json`: five vulnerable package groups before; zero
  after. Original production-only audit: zero. Website audit: zero.
- `npm run substrate:check`: passed, including generated compliance inventory.
- `npm run test:acceptance:dry`: all 130 scenarios / 802 steps resolve; the dry
  run does not execute desktop behavior.
- `npm run test:unit`: 1,428 passed, zero failed/cancelled/skipped; the normal
  runner exits successfully after the existing sync fixture's 65-second
  optional-store retry timer drains. No forced-exit option is needed.
- All 43 production/non-dev lock entries are identical before and after;
  runtime SBOM contents are identical and contain none of the five affected
  package names. `git diff --check` passed.

Audit snapshots are checked in under `docs/security-evidence/` with this date.
These are point-in-time database checks. A public Scorecard rescan of main
will continue to see the old lockfile until the patch is merged.

The repository's launch freeze still applies. This candidate is prepared for
review on `codex/security-dependency-triage`; merging and native release gates
are separate from this dependency remediation work.
