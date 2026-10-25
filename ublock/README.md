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
Binary font additions are copied from the exact hash-bound host inputs by
`readHostSources`; the patch records their names without lossy text hunks.
The popup and Dashboard use bundled Inter and pinned Lucide SVGs. Their Sunrise
image references the exact read-only `blanc://ubo-brand/sunrise.png` endpoint
served from Blanc's signed first-party resources; no reserved artwork bytes are
copied into the adapted extension. The image keeps its existing size and styling. Dashboard panels keep native
controls and editors; Filter lists uses the approved two-column presentation. Native list states and filtering logic
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
directory. That build fetches assets separately. The source-tag archive is
supplemented by the preferred project and uAssets archives described below; it
alone does not inventory every component. `source-audit.json`, reproduced with
`python3 scripts/audit-ublock-sources.py`,
records exact archive matches for 644 of 658 package files. The thirteen
separately fetched inputs and transformed manifest have separate evidence.
`distribution.json` records the owner-directed distribution decision and its
source/notice scope in `docs/ublock-origin-owner-distribution-2026-10-03.md`; it
is not outside legal sign-off. Installed platform acceptance remains required.
MIT for Blanc-owned files and the reserved identity assets remain as documented in the repository's LICENSE and ASSET-LICENSE.md.

Blanc packages omit this directory when distribution clearance is closed.
Explicit internal validation packages carry a non-release marker. The current
owner-directed clearance permits bundled candidates while public platform flags
stay disabled pending installed acceptance.
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

HSLuv's `sources/hsluv-0.1.0-preferred.tar.gz` retains all library sources,
tests, licenses, snapshots and build definitions from the pinned revision. Only
`scripts/secrets.sh`, an unrelated publisher encryption utility, is omitted.
It is referenced only by the upstream deployment README, not by the HSLuv build,
tests or uBO runtime. Its individual scan reproduces Avast/AVG's PUP warning;
the archive with only that helper omitted returns 0/59, including Avast, AVG
and Kaspersky Undetected. This is a source selection, not a runtime patch or
removal of any filtering rule. This result does not clear a final installer.

`preferred-sources.json` records the original upstream digest, omitted helper's
path and digest, and the prepared archive's digest. The bundled, hash-pinned
`prepare-hsluv-source.py` authenticates that original archive and compares every
retained file's bytes and permissions. It never executes archived scripts.
Reproduce the prepared archive with Python 3.13 from the immutable upstream
download recorded in the component entry:

```
python3 ublock/prepare-hsluv-source.py /path/to/hsluv-0.1.0.tar.gz /tmp/hsluv-preferred.tar.gz
```

The full original project remains available at that immutable upstream revision;
the source required to build the bundled HSLuv library stays inside the app.


The same inventory now pins uAssets main and production snapshots used by the
1.75.0 release. All thirteen separately copied assets match those immutable
revisions exactly; five minified uBO lists also rebuild from the main archive's
preferred text/templates with upstream's recorded timestamp substitution.
See `docs/evidence/2026-10-03-ubo-component-rebuilds/asset-inputs.json`.
These source archives are distribution inputs only; no archived build script is
extracted or executed by Blanc at runtime or during packaging.

`sources/uAssets-1.75.0-main-preferred.tar.gz` retains all 85 other files and
101 entries from the pinned main snapshot, with unchanged bytes and permissions.
Only `tools/update-3rdparties.sh` is omitted: its sole upstream caller is the
daily publisher workflow, and it fetches newer remote lists rather than building
this pinned release. The Makefile, validation tools, filter-build scripts,
templates, preferred lists, exact third-party snapshots and licenses all remain.
The production snapshot is unchanged. No filter or runtime behavior changes.

A one-member ZIP of that helper reproduces Kaspersky's exact Mimikatz warning
(1/63); the prepared complete-source selection returns 0/60, including Avast,
AVG and Kaspersky Undetected. These are sample results, not final-installer
clearance or a vendor's final classification of the immutable published build.
The same pinned provenance and retained-member checks described above apply to
`prepare-uassets-source.py`. Reproduce with Python 3.13:

```
python3 ublock/prepare-uassets-source.py /path/to/uAssets-main-original.tar.gz /tmp/uAssets-main-preferred.tar.gz
```

The original immutable upstream digest, path, helper digest and preparation
reason remain recorded in `preferred-sources.json`. The publisher helper is
outside the source needed to rebuild the pinned asset snapshots; the source
selection does not replace the original snapshot inputs with live downloads.


The LGPLv3 diff notice is supplemented by the full unmodified GNU LGPLv3 text
in `licenses/LGPL-3.0.txt` (SHA-256
`e3a994d82e644b03a792a930f574002658412f62407f5fee083f2555c5f23118`).
The original Swatinem source revision cited in uBO's header is pinned in
`preferred-sources.json`; uBO's readable modified implementation remains in the
unaltered package and source-tag archive. Bundled candidates copy the full
LGPL and GPL texts into `ThirdPartyLicenses/` as well. Ordinary builds omit
both uBO-specific texts with the payload. This fixes a concrete notice gap;
it does not assert completion of the combined-work/source assessment.
