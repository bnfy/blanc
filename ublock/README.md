# Managed full uBlock Origin

Upstream: Raymond Hill's uBlock Origin 1.75.0 Chromium release, GPL-3.0-or-later.
`upstream/` is the exact unpacked official release, including upstream notices.
`pinned.json` binds every file and the official release ZIP digest. No Lite code
is used. `sources/uBlock-1.75.0.tar.gz` contains the matching upstream source tag.
The GPL text is `LICENSE.txt`. Upstream libraries and filter data retain their
individual notices; their inclusion does not make them Blanc-owned MIT code.

The adaptation is generated from `src/main/ublock-package.js`, the separately
authored MIT host/bridge sources under `src/main/ublock-*.js`, and the upstream
package. The resulting modified extension is subject to upstream's GPL.
`adaptation.patch` records the changes and additions; `adaptation.json` records
their input/output hashes and change date. No filtering-engine module is patched.
Binary font/mark additions are copied from the exact hash-bound host inputs by
`readHostSources`; the patch records their names without lossy text hunks.
The popup and Dashboard use bundled Inter, pinned Lucide SVGs, and the reserved
Blanc Sunrise mark. Dashboard panels keep native controls and editors; Filter lists
uses the approved two-column presentation. Native list states and filtering logic
are unchanged.
Changes concern browser API hosting, startup, popup/Dashboard presentation and popup lifetime, unavailable privacy
controls, and the restriction to bundled executable resources.

To reproduce with Node 22 from this source checkout:

```
node scripts/check-ublock-package.cjs
node scripts/build-ublock-adaptation.cjs
node -e "const fs=require('fs'),p=require('path'),u=require('./src/main/ublock-package');u.installVerifiedPackage({root:p.resolve('ublock'),destination:p.resolve('ubo-reproduced'),hostSources:u.readHostSources(process.cwd())})"
```

Use a real directory with no symlink ancestors for the reproduction destination.
The output is loaded unpacked using official Electron; no runtime modification,
network download, minification, or compilation occurs during adaptation.
To review an intentional adaptation change, regenerate both records with
`node scripts/build-ublock-adaptation.cjs --write`, then review the patch and tests.

Upstream's original build instructions are in its source archive's `tools/`
directory. That build fetches assets separately. The current archive alone is
not yet certified as complete corresponding source for every bundled third-party
asset. `source-audit.json`, reproduced with `python3 scripts/audit-ublock-sources.py`,
records exact archive matches for 644 of 658 package files. This is coverage
evidence, not preferred-source or license clearance; see
`docs/ublock-origin-distribution.md`. Public distribution is blocked
by `distribution.json` for the uBO payload until that assessment and the combined-work boundary are
resolved. MIT for Blanc-owned files and the reserved identity assets remain as
documented in the repository's LICENSE and ASSET-LICENSE.md.

Ordinary Blanc packages omit this entire directory until clearance. Internal
validation packages explicitly include it and carry a non-release marker.
`identity.json` supplies a fixed public manifest key shared across profiles and
platforms; it contains no private key. The managed storage directory does not
participate in the extension ID. This replaces the unpublished prototype's
path-derived ID; existing prototype-only native extension stores are not a
released migration baseline.


`preferred-sources.json` now binds immutable CSS Tree 2.2.1, js-beautify 1.14.7
and HSLuv 0.1.0 archives. Their full MIT license texts are at the archive root
`LICENSE` paths; CSS Tree credits Roman Dvornov, js-beautify credits Einar
Lielmanis/Liam Newman/contributors, and HSLuv credits Alexei Boronine/Florian
Dormont. These inputs and the record itself are hash-checked by `pinned.json`.
Running `check-ublock-package.cjs --write` preserves and verifies this inventory.
Availability of these preferred sources does not establish exact build
reproduction or close the remaining distribution assessment.


The same inventory now pins uAssets main and production snapshots used by the
1.75.0 release. All thirteen separately copied assets match those immutable
revisions exactly; five minified uBO lists also rebuild from the main archive's
preferred text/templates with upstream's recorded timestamp substitution.
See `docs/evidence/2026-10-03-ubo-component-rebuilds/asset-inputs.json`.
These source archives are distribution inputs only; no archived build script is
extracted or executed by Blanc at runtime or during packaging.


The LGPLv3 diff notice is supplemented by the full unmodified GNU LGPLv3 text
in `licenses/LGPL-3.0.txt` (SHA-256
`e3a994d82e644b03a792a930f574002658412f62407f5fee083f2555c5f23118`).
The original Swatinem source revision cited in uBO's header is pinned in
`preferred-sources.json`; uBO's readable modified implementation remains in the
unaltered package and source-tag archive. Bundled candidates copy the full
LGPL and GPL texts into `ThirdPartyLicenses/` as well. Ordinary builds omit
both uBO-specific texts with the payload. This fixes a concrete notice gap;
it does not assert completion of the combined-work/source assessment.
