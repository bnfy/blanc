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
The popup uses bundled Inter, Lucide SVGs, and the reserved Blanc Sunrise mark.
Changes concern browser API hosting, startup, popup presentation/lifetime, unavailable privacy
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
by `distribution.json` until that assessment and the combined-work boundary are
resolved. MIT for Blanc-owned files and the reserved identity assets remain as
documented in the repository's LICENSE and ASSET-LICENSE.md.
